import { Network } from "./domain/cursor/types";
import { watchDeposits } from "./watchDeposits/watchDeposits";
import { processDownstream } from "./downstream/processDownstream";
import { GenericOptionsWithDb } from "./domain/fn/types";

type WatchDepositsPayload = {
  depositAddress: string
  liteClientGlobalConfigUrl: string,
  network: Network
  downstreamSlug: string
}

export async function watchDepositSync(
  options: GenericOptionsWithDb
) {
  const log = options.logger.child({
    fn: 'run',
    address: options.config.address.toRawString(),
    network: options.config.network,
    downstreamServices: options.config.downstreamServices.slug,
  })

  await Promise.all([
    watchDeposits({...options, logger: log}),
    processDownstream({...options, logger: log}),
  ])
}
