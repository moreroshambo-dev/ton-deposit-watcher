import type { Logger } from "pino";

import { loadConfig } from "./config";
import { loadCursor, saveCursor } from "../domain/cursor/store";
import { syncIncomingTransfers } from "../domain/deposit-sync/sync-incoming-transfers";
import type { SyncIncomingTransfersResult } from "../domain/deposit-sync/types";
import { createLiteClientFromConfigUrl } from "../infrastructure/ton/lite-client";

export async function runDepositSync(args: {
  env?: NodeJS.ProcessEnv;
  logger: Logger;
}): Promise<SyncIncomingTransfersResult> {
  const env = args.env ?? process.env;
  const config = loadConfig(env);
  const log = args.logger.child({
    network: config.network,
    walletRawAddress: config.walletRawAddress,
  });

  log.info(
    {
      batchSize: config.batchSize,
      cursorPath: config.cursorPath,
      globalConfigUrl: config.globalConfigUrl,
      walletFriendlyAddress: config.walletFriendlyAddress,
    },
    "Starting TON deposit sync",
  );

  const cursor = await loadCursor({
    cursorPath: config.cursorPath,
    logger: log,
    network: config.network,
    walletRawAddress: config.walletRawAddress,
  });

  const { client, engine, serverCount } = await createLiteClientFromConfigUrl({
    globalConfigUrl: config.globalConfigUrl,
    logger: log,
  });

  log.info({ serverCount }, "TON lite client is ready");

  try {
    const result = await syncIncomingTransfers({
      batchSize: config.batchSize,
      client,
      cursor,
      logger: log,
      network: config.network,
      wallet: config.wallet,
    });

    await saveCursor({
      cursor: result.cursorAfter,
      cursorPath: config.cursorPath,
      logger: log,
    });

    log.info(
      {
        incomingTransfers: result.incomingTransfers.length,
        scannedTransactions: result.scannedTransactions,
        snapshotBlockSeqno: result.snapshotBlock.seqno,
      },
      "TON deposit sync finished successfully",
    );

    return result;
  } finally {
    engine.close();
    log.debug("Closed TON lite client engine");
  }
}
