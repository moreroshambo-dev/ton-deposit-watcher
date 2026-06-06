import { blockIdTable, depositTable } from "~/infrastructure/db/schema"
import { and, eq, desc, inArray, lte } from "drizzle-orm";
import { addDownstreamUpdate } from "~/downstream/addDownstreamUpdate";
import { GenericOptionsWithDb } from "~/domain/fn/types";
import { verifyTransaction } from "./verifyTransaction";
import { Address } from "@ton/core";
import { LiteClient } from "ton-lite-client";

const MASTERCHAIN_WORKCHAIN = -1

export const updateDepositStatus = async (client: LiteClient, options: GenericOptionsWithDb) => {
  const log = options.logger.child({
    fn: 'updateDepositStatus',
  })

  const [lastBlock] = await options.db
    .select()
    .from(blockIdTable)
    .where(
      and(
        eq(blockIdTable.network, options.config.network),
        eq(blockIdTable.workchain, MASTERCHAIN_WORKCHAIN)
      )
    )
    .orderBy(desc(blockIdTable.seqno))
    .limit(1);

  if (!lastBlock) {
    return
  }

  if (options.signal?.aborted) {
    return
  }

  const needUpdate = await options.db
    .select()
    .from(depositTable)
    .where(
      and(
        lte(depositTable.masterchainSeqno, lastBlock.seqno - 60),
        eq(depositTable.status, 'pending'),
        eq(depositTable.to, options.config.address.toRawString())
      )
    )

  if (needUpdate.length === 0) {
    log.info('нет транзакций для обновления')
    return
  }

  if (options.signal?.aborted) {
    return
  }

  const verified = await Promise.all(
    needUpdate.map(async (deposit) => {
      const isValid = await verifyTransaction(
        client,
        {
          address: Address.parse(deposit.to),
          lt: deposit.lt,
          hash: deposit.hash,
          shardWorkchain: deposit.shardWorkchain,
          shardSeqno: deposit.shardSeqno,
          shardRootHash: deposit.shardRootHash,
          shardFileHash: deposit.shardFileHash,
          shard: deposit.shard,
        },
        { logger: log, signal: options.signal, config: options.config }
      );
      return { deposit, isValid };
    })
  );

  const toConfirm = verified.filter(v => v.isValid).map(v => v.deposit);
  const toError = verified.filter(v => !v.isValid).map(v => v.deposit);

  await options.db.transaction(async (tx) => {
    if (toConfirm.length > 0) {
      const confirmedDeposits = await tx
        .update(depositTable)
        .set({ status: 'confirmed' })
        .where(inArray(depositTable.id, toConfirm.map(d => d.id)))
        .returning();

      await addDownstreamUpdate({ updates: confirmedDeposits }, { ...options, db: tx, logger: log });
    }

    if (toError.length > 0) {
      log.warn('транзакции не прошли верификацию: %o', toError.map(d => d.hash));

      const errorDeposits = await tx
        .update(depositTable)
        .set({ status: 'canceled' })
        .where(inArray(depositTable.id, toError.map(d => d.id)))
        .returning();

      await addDownstreamUpdate({ updates: errorDeposits }, { ...options, db: tx, logger: log });
    }
  });
}