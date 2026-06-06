import { watchMasterchainBlockIds } from "./masterchainBlockId/watchMasterchainBlockIds";
import { createTonLiteClient } from "~/infrastructure/ton/lite-client";
import { createParserCursorByTx } from "./accountTxs/createParserCursorByTx";
import { iterateAccountTransactions } from "./accountTxs/iterateAccountTxs";
import { getBlockchainAccountState } from "./getBlockchainAccountState";
import { loadLastDepositFromDb } from "./loadLastDepositFromDb";
import { updateDepositStatus } from "./updateDepositStatus/updateDepositStatus";
import { saveMasterchainBlockId } from "./masterchainBlockId/saveMasterchainBlockId";
import { txEntityToDepositEntity } from "./accountTxs/txEntityToDepositEntity";
import { saveDepositTx } from "./accountTxs/saveDeposit";
import { addDownstreamUpdate } from "../downstream/addDownstreamUpdate";
import { GenericOptionsWithDb } from "~/domain/fn/types";
import type { Transaction } from "@ton/core";
import type { BlockID } from "ton-lite-client";

export async function watchDeposits(options: GenericOptionsWithDb) {
  const log = options.logger.child({fn: 'watchDeposits'})
  const {client} = await createTonLiteClient({...options, logger: log})

  for await (const masterchainBlockId of watchMasterchainBlockIds(client, {
    ...options,
    logger: log,
    pollIntervalMs: options.config.pollIntervalMs,
  })) {
    const accountState = await getBlockchainAccountState(
      client,
      {blockId: masterchainBlockId},
      {...options, logger: log},
    )

    if (!accountState.lastTx) {
      continue
    }

    const lastTxCursor = createParserCursorByTx(accountState.lastTx, options.config.address)
    const lastDepositFromDb = await loadLastDepositFromDb(options)
    const lastProcessedTxCursor = lastDepositFromDb ? createParserCursorByTx(
      lastDepositFromDb,
      options.config.address
    ) : undefined

    const accountTxs: Array<{tx: Transaction, blockId: BlockID}> = []

    for await (const accountTx of iterateAccountTransactions(
      client,
      {
        from: lastTxCursor,
        to: lastProcessedTxCursor,
      },
      {
        ...options,
        logger: log,
        batchSize: options.config.batchSize,
      }
    )) {
      accountTxs.push(accountTx)
    }

    for (const {tx: blockChainTx, blockId: txShardBlockId} of accountTxs.reverse()) {
      const deposit = txEntityToDepositEntity({tx: blockChainTx, txShardBlockId, masterchainBlockId, depositAddress: options.config.address})
    
      if (deposit) {
        await options.db.transaction(async (dbTx) => {
          const deposits = await saveDepositTx({
            depositTx: deposit,
          }, {...options, logger: log, db: dbTx})
  
          if (deposits && deposits.length) {
            await addDownstreamUpdate({updates: deposits}, {...options, logger: log, db: dbTx})
          }
        })
      }
    }

    await saveMasterchainBlockId({blockId: masterchainBlockId}, {...options, logger: log})
    await updateDepositStatus(client, {...options, logger: log})
  }
}
