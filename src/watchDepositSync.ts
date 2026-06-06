import { watchDeposits } from "./watchDeposits/watchDeposits";
import { processDownstream } from "./downstream/processDownstream";
import { GenericOptionsWithDb } from "./domain/fn/types";

export async function watchDepositSync(
  options: GenericOptionsWithDb
) {
  const log = options.logger.child({
    fn: 'run',
    address: options.config.address.toRawString(),
    network: options.config.network,
    downstreamService: options.config.downstreamService.slug,
  })

  await Promise.all([
    watchDeposits({...options, logger: log}),
    processDownstream({...options, logger: log}),
  ])
}
