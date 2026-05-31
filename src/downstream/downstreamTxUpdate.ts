import type { GenericOptions } from "~/domain/fn/types"
import { downstreamHttpRequest } from "~/downstream/downstreamHttpRequest"
import {DownstreamQueueTableSelect } from "~/infrastructure/db/schema"

type SendMessagePayload = {
  update: DownstreamQueueTableSelect
}

export const downstreamTxUpdate = async (payload: SendMessagePayload, options: GenericOptions) => {
  const log = options.logger.child({fn: 'downstreamTxUpdate'})

  await downstreamHttpRequest({
    slug: payload.update.downstreamSlug,
    depositTxId: payload.update.depositTxId,
    userId: payload.update.userId,
    hash: payload.update.hash,
    txStatus: payload.update.txStatus,
    creditedTokens: payload.update.creditedTokens,
    nanoTON: payload.update.nanoTON,
    asset: 'TON',
    from: payload.update.from,
    initiatedAt: payload.update.initiatedAt.getTime(),
    network: payload.update.network,
  }, {
    ...options,
    logger: log,
  })
}