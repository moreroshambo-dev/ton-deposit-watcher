import { GenericOptionsWithDb } from "~/domain/fn/types"
import { DepositTableSelect, downstreamQueueTable, DownstreamQueueTableInsert } from "~/infrastructure/db/schema"
import { UpdateEntity } from "./iterateDownstreamUpdates"

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
    network: depositEntity.network,
  }
}

type AddDownstreamUpdatePayload = {
  updates: DepositTableSelect[]
}

export const addDownstreamUpdate = async (
  payload: AddDownstreamUpdatePayload,
  options: GenericOptionsWithDb,
) => {
  const log = options.logger.child({
    fn: 'addDownstreamUpdate'
  })

  const updates = payload.updates
    .map((deposit) => depositEntityToUpdateEntity(deposit))
    .filter((updateOrEmpty): updateOrEmpty is UpdateEntity => Boolean(updateOrEmpty))
    .map((update) => ({
      ...update,
      status: 'queue' as const,
      downstreamSlug: options.config.downstreamServices.slug,
    }))

  if (updates.length < 1) {
    return
  }

  await options.db
    .insert(downstreamQueueTable)
    .values(updates)

  log.info(`add ${payload.updates.length} to queue`)
}
