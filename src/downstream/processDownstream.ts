import { iterateDownstreamUpdates } from "~/downstream/iterateDownstreamUpdates";
import { downstreamTxUpdate } from "~/downstream/downstreamTxUpdate";
import { withRetry } from "~/shared/utils/withRetry";
import { setQueueStatus } from "~/downstream/setQueueStatus";
import { GenericOptionsWithDb } from "~/domain/fn/types";

export const processDownstream = async (options: GenericOptionsWithDb) => {
  const log = options.logger.child({fn: 'processDownstream'})

  for await (const update of iterateDownstreamUpdates({...options, logger: log})) {
    if (update.status !== 'queue') {
        throw new Error()
    }

    await options.db.transaction(async (dbTx) => {
      await setQueueStatus(
        {status: 'sending', id: update.id},
        {...options, logger: log, db: dbTx},
      )
      await withRetry(
        () => downstreamTxUpdate(
          {update},
          {...options, logger: log},
        ),
        {
          logger: log,
          op: 'downstreamTxUpdate'
        }
      ) 
      await setQueueStatus(
        {status: 'done', id: update.id},
        {...options, logger: log, db: dbTx},
      )  
    })
  }
}
