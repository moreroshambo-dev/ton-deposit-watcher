import { DepositTableSelect, downstreamQueueTable, DownstreamQueueTableInsert } from "~/infrastructure/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { sleep } from "~/shared/utils/sleep"
import { GenericOptionsWithDb } from "~/domain/fn/types"

export type UpdateEntity = {
    depositTxId: DownstreamQueueTableInsert['depositTxId']
    userId: DownstreamQueueTableInsert['userId']
    from: DownstreamQueueTableInsert['from']
    hash: DownstreamQueueTableInsert['hash']
    amount: DownstreamQueueTableInsert['amount']
    txStatus: DownstreamQueueTableInsert['txStatus']
}

export const depositEntityToUpdateEntity = (depositEntity: DepositTableSelect): UpdateEntity | undefined => {
  if (!depositEntity.memo) {
    return
  }

  return {
    depositTxId: depositEntity.id,
    userId: depositEntity.memo.slice(0, 64),
    from: depositEntity.from,
    hash: depositEntity.hash,
    amount: depositEntity.amount,
    txStatus: depositEntity.status,
  }
}

export async function* iterateDownstreamUpdates(options: GenericOptionsWithDb) {
  const log = options.logger.child({
    fn: 'iterateDownstreamUpdates'
  })

  while(options.signal?.aborted !== true) {
    const queryResult = await options.db
      .select()
      .from(downstreamQueueTable)
      .where(
        and(
          eq(downstreamQueueTable.status, 'queue'),
          eq(downstreamQueueTable.downstreamSlug, options.config.downstreamServices.slug),
        )
      )
      .orderBy(desc(downstreamQueueTable.id))
      .limit(1)
  
    if (queryResult.length < 1) {
      await sleep(5000)
    } else {
      yield queryResult[0]
    }
  }
}
