import { depositTable } from "~/infrastructure/db/schema"
import { TonDeposit } from "./txEntityToDepositEntity"
import { and, eq, or } from "drizzle-orm"
import { GenericOptionsWithDb } from "~/domain/fn/types"

type SaveDepositTxPayload = {
  depositTx: TonDeposit
}

export const saveDepositTx = async (payload: SaveDepositTxPayload, options: GenericOptionsWithDb) => {
  const log = options.logger.child({
    fn: 'saveDepositTx',
    hash: payload.depositTx.hash,
    lt: payload.depositTx.lt,
    now: payload.depositTx.now,
    memo: payload.depositTx.memo,
    masterchainSeqno: payload.depositTx.masterchainSeqno
  })

  const [existed] = await options.db.select().from(depositTable).where(
    or(
      and(
        eq(depositTable.lt, payload.depositTx.lt),
        eq(depositTable.to, payload.depositTx.to.toRawString()),
        eq(depositTable.network, options.config.network),
      ),
      and(
        eq(depositTable.hash, payload.depositTx.hash.toString('hex')),
        eq(depositTable.network, options.config.network),
      )
    )
  )

  if (existed) {
    log.error('DUPLICATE TRANSACTION')
  } else {
    const rows = await options.db
      .insert(depositTable)
      .values({
        status: 'pending',
        network: options.config.network,
        amount: payload.depositTx.amount,
        from: payload.depositTx.from.toRawString(),
        hash: payload.depositTx.hash.toString('hex'),
        lt: payload.depositTx.lt,
        memo: payload.depositTx.memo,
        to: payload.depositTx.to.toRawString(),
        now: new Date(payload.depositTx.tx.now * 1000),
        masterchainSeqno: payload.depositTx.masterchainSeqno,
        shardWorkchain: payload.depositTx.shardWorkchain,
        shardFileHash: payload.depositTx.shardFileHash,
        shardRootHash: payload.depositTx.shardRootHash,
        shardSeqno: payload.depositTx.shardSeqno,
        shard: payload.depositTx.shard,
      })
      .returning();

    log.info('save new tx')

    return rows
  }
}