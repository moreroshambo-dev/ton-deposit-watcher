import { downstreamQueueTable, DownstreamQueueTableInsert } from "~/infrastructure/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { sleep } from "~/shared/utils/sleep"
import { GenericOptionsWithDb } from "~/domain/fn/types"

export type UpdateEntity = {
  depositTxId: DownstreamQueueTableInsert['depositTxId']
  userId: DownstreamQueueTableInsert['userId']
  from: DownstreamQueueTableInsert['from']
  hash: DownstreamQueueTableInsert['hash']
  nanoTON: DownstreamQueueTableInsert['nanoTON']
  txStatus: DownstreamQueueTableInsert['txStatus']
  network: DownstreamQueueTableInsert['network']
  downstreamSlug: DownstreamQueueTableInsert['downstreamSlug']
  creditedTokens: DownstreamQueueTableInsert['creditedTokens']
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
      .orderBy(asc(downstreamQueueTable.id))
      .limit(1)
  
    if (queryResult.length < 1) {
      await sleep(5000)
    } else {
      yield queryResult[0]
    }
  }
}
