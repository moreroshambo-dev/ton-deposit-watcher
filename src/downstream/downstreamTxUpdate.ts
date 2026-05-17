import type { GenericOptions } from "~/domain/fn/types"
import { downstreamHttpRequest } from "~/downstream/downstreamHttpRequest"
import type { UpdateEntity } from "./iterateDownstreamUpdates"

type SendMessagePayload = {
  update: UpdateEntity
}

export const downstreamTxUpdate = async (payload: SendMessagePayload, options: GenericOptions) => {
  const log = options.logger.child({fn: 'downstreamTxUpdate'})
  
  await downstreamHttpRequest(payload.update, {
    ...options,
    logger: log,
  })
}