import type { Logger } from "pino";

import { loadConfig } from "./config";
import { writeSyncResultToStdout } from "./stdout-events";
import { loadCursor, saveCursor } from "../domain/cursor/store";
import type { SyncCursor } from "../domain/cursor/types";
import { syncIncomingTransfers } from "../domain/deposit-sync/sync-incoming-transfers";
import { createLiteClientFromConfigUrl } from "../infrastructure/ton/lite-client";

type WatchState = {
  currentCursor: SyncCursor | null;
  iteration: number;
};

export async function watchDepositSync(args: {
  env?: NodeJS.ProcessEnv;
  logger: Logger;
}): Promise<void> {
  const env = args.env ?? process.env;
  const config = loadConfig(env);
  const log = args.logger.child({
    network: config.network,
    walletRawAddress: config.walletRawAddress,
  });
  const shutdown = createShutdownController(log);

  log.info(
    {
      batchSize: config.batchSize,
      cursorPath: config.cursorPath,
      globalConfigUrl: config.globalConfigUrl,
      pollIntervalMs: config.pollIntervalMs,
      walletFriendlyAddress: config.walletFriendlyAddress,
    },
    "Starting TON deposit watcher",
  );

  const initialCursor = await loadCursor({
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

  const state: WatchState = {
    currentCursor: initialCursor,
    iteration: 0,
  };

  try {
    await runSyncIteration({
      client,
      config,
      emitToStdout: true,
      iterationReason: "startup",
      logger: log,
      state,
    });

    while (!shutdown.isStopping) {
      const sleptFully = await waitForNextPoll(config.pollIntervalMs, shutdown);

      if (!sleptFully || shutdown.isStopping) {
        break;
      }

      const latestMasterchainInfo = await client.getMasterchainInfo();
      const knownSeqno = state.currentCursor?.lastProcessedBlock.seqno ?? 0;
      const latestSeqno = latestMasterchainInfo.last.seqno;

      if (latestSeqno <= knownSeqno) {
        log.debug(
          {
            knownSeqno,
            latestSeqno,
          },
          "No new masterchain block since last processed snapshot",
        );
        continue;
      }

      await runSyncIteration({
        client,
        config,
        emitToStdout: false,
        iterationReason: "new_block",
        logger: log.child({
          latestMasterchainSeqno: latestSeqno,
          previousMasterchainSeqno: knownSeqno,
        }),
        state,
      });
    }
  } finally {
    shutdown.cleanup();
    engine.close();
    log.info("Stopped TON deposit watcher");
  }
}

async function runSyncIteration(args: {
  client: Awaited<ReturnType<typeof createLiteClientFromConfigUrl>>["client"];
  config: ReturnType<typeof loadConfig>;
  emitToStdout: boolean;
  iterationReason: "startup" | "new_block";
  logger: Logger;
  state: WatchState;
}): Promise<void> {
  args.state.iteration += 1;
  const log = args.logger.child({
    iteration: args.state.iteration,
    iterationReason: args.iterationReason,
  });

  const result = await syncIncomingTransfers({
    batchSize: args.config.batchSize,
    client: args.client,
    cursor: args.state.currentCursor,
    logger: log,
    network: args.config.network,
    wallet: args.config.wallet,
  });

  await saveCursor({
    cursor: result.cursorAfter,
    cursorPath: args.config.cursorPath,
    logger: log,
  });

  const walletActivityDetected =
    result.scannedTransactions > 0 || result.incomingTransfers.length > 0;

  if (args.emitToStdout || walletActivityDetected) {
    writeSyncResultToStdout(result);
  }

  const logFields = {
    incomingTransfers: result.incomingTransfers.length,
    scannedTransactions: result.scannedTransactions,
    snapshotBlockSeqno: result.snapshotBlock.seqno,
    stdoutEmitted: args.emitToStdout || walletActivityDetected,
  };

  if (walletActivityDetected || args.iterationReason === "startup") {
    log.info(logFields, "Watcher iteration completed");
  } else {
    log.debug(logFields, "Watcher iteration completed");
  }

  args.state.currentCursor = result.cursorAfter;
}

function createShutdownController(logger: Logger): {
  cleanup: () => void;
  isStopping: boolean;
  onStopRequested: (callback: () => void) => () => void;
} {
  let isStopping = false;
  const listeners = new Set<() => void>();

  const handleSignal = (signal: NodeJS.Signals): void => {
    if (isStopping) {
      return;
    }

    isStopping = true;
    logger.info({ signal }, "Shutdown signal received");

    for (const listener of listeners) {
      listener();
    }
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  return {
    cleanup: () => {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    },
    get isStopping() {
      return isStopping;
    },
    onStopRequested: (callback: () => void) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}

async function waitForNextPoll(
  pollIntervalMs: number,
  shutdown: {
    isStopping: boolean;
    onStopRequested: (callback: () => void) => () => void;
  },
): Promise<boolean> {
  if (shutdown.isStopping) {
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(true);
    }, pollIntervalMs);

    const unsubscribe = shutdown.onStopRequested(() => {
      clearTimeout(timer);
      unsubscribe();
      resolve(false);
    });
  });
}
