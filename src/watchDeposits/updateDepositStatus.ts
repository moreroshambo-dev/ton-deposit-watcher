import { blockIdTable, depositTable } from "~/infrastructure/db/schema"
import { and, eq, desc, inArray, lte } from "drizzle-orm";
import { addDownstreamUpdate } from "../downstream/addDownstreamUpdate";
import { GenericOptionsWithDb } from "~/domain/fn/types";

type UpdateDepositStatusPayload = {
  workchain: number
}

export const updateDepositStatus = async (payload: UpdateDepositStatusPayload, options: GenericOptionsWithDb) => {
  const log = options.logger.child({
    fn: 'updateDepositStatus',
  })

  const [lastBlock] = await options.db
    .select()
    .from(blockIdTable)
    .where(
      and(
        eq(blockIdTable.network, options.config.network),
        eq(blockIdTable.workchain, payload.workchain)
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

  console.log({
    seqno: lastBlock.seqno,
    address: options.config.address.toRawString()
  })
  const needUpdate = await options.db
    .select()
    .from(depositTable)
    .where(
      and(
        lte(depositTable.seqno, lastBlock.seqno - 60),
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

  await options.db.transaction(async (tx) => {
    const confirmedDeposits = await tx
      .update(depositTable)
      .set({status: 'confirmed'})
      .where(
        inArray(depositTable.id, needUpdate.map(({id}) => id))
      )
      .returning()

    await addDownstreamUpdate({updates: confirmedDeposits}, {
      ...options,
      db: tx,
      logger: log,
    })
  })
}