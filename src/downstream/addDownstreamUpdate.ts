import { GenericOptions, GenericOptionsWithDb } from "~/domain/fn/types"
import { DepositTableSelect, downstreamQueueTable } from "~/infrastructure/db/schema"
import { UpdateEntity } from "./iterateDownstreamUpdates"


const NANO_PER_TON = 1_000_000_000n;

function nanoTonToCurrency(
  amountNanoTon: bigint,
  ratePerTon: bigint,
): number {
  return Number((amountNanoTon * ratePerTon) / NANO_PER_TON);
}

export const depositEntityToUpdateEntity = (depositEntity: DepositTableSelect, options: GenericOptions): UpdateEntity | undefined => {
  if (!depositEntity.memo) {
    return
  }

  const nanoTON = depositEntity.amount
  const creditedTokens = nanoTonToCurrency(nanoTON, 1000n)

  return {
    depositTxId: depositEntity.id,
    userId: depositEntity.memo.slice(0, 64),
    from: depositEntity.from,
    hash: depositEntity.hash,
    nanoTON,
    txStatus: depositEntity.status,
    network: depositEntity.network,
    creditedTokens,
    downstreamSlug: options.config.downstreamServices.slug,
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
    .map((deposit) => depositEntityToUpdateEntity(deposit, options))
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
