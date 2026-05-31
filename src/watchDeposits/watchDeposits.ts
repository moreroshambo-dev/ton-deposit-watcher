import { watchMasterchainBlockIds } from "./masterchainBlockId/watchMasterchainBlockIds";
import { createTonLiteClient } from "~/infrastructure/ton/lite-client";
import { createParserCursorByTx } from "./accountTxs/createParserCursorByTx";
import { iterateAccountTransactions } from "./accountTxs/iterateAccountTxs";
import { getBlockchainAccountState } from "./getBlockchainAccountState";
import { loadLastDepositFromDb } from "./loadLastDepositFromDb";
import { updateDepositStatus } from "./updateDepositStatus";
import { saveMasterchainBlockId } from "./masterchainBlockId/saveMasterchainBlockId";
import { txEntityToDepositEntity } from "./accountTxs/txEntityToDepositEntity";
import { saveDepositTx } from "./accountTxs/saveDeposit";
import { addDownstreamUpdate } from "../downstream/addDownstreamUpdate";
import { GenericOptionsWithDb } from "~/domain/fn/types";

export async function watchDeposits(options: GenericOptionsWithDb) {
  const log = options.logger.child({fn: 'watchDeposits'})
  const {client} = await createTonLiteClient({...options, logger: log})

  for await (const lastBlockId of watchMasterchainBlockIds(client, {...options, logger: log})) {
    const accountState = await getBlockchainAccountState(
      client,
      {blockId: lastBlockId},
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

    for await (let {tx: blockChainTx, blockId} of iterateAccountTransactions(
      client,
      {
        from: lastTxCursor,
        to: lastProcessedTxCursor,
      },
      {
        ...options,
        logger: log,
        batchSize: 1,
      }
    )) {
      const deposit = txEntityToDepositEntity({tx: blockChainTx, blockId, depositAddress: options.config.address})
    
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

    await saveMasterchainBlockId({blockId: lastBlockId}, {...options, logger: log})

    await updateDepositStatus({
      workchain: lastBlockId.workchain,
    }, {...options, logger: log})
  }
}
