import type { BlockID, LiteClient } from "ton-lite-client";
import { GenericOptions } from "~/domain/fn/types";
import { withRetry } from "~/shared/utils/withRetry";

type GetBlockchainAccountStatePayload = {
  blockId: BlockID,
}

export const getBlockchainAccountState = async (client: LiteClient, payload: GetBlockchainAccountStatePayload, options: GenericOptions) => {
  const log = options.logger.child({fn: 'getBlockchainAccountState'})

  const accountState = await withRetry(
    () => client.getAccountState(options.config.address, payload.blockId),
    {
      logger: log,
      op: 'client.getAccountState',
      signal: options.signal,
    }
  )

  return accountState
}
