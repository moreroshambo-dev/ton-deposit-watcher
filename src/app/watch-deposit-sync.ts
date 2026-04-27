import type { Logger } from "pino";

import { loadConfig } from "./config";
import { runDownstreamDispatchPass } from "./run-downstream-dispatch-pass";
import { writeSyncResultToStdout } from "./stdout-events";
import type { SyncCursor } from "../domain/cursor/types";
import { syncIncomingTransfers } from "../domain/deposit-sync/sync-incoming-transfers";
import { assertMigratedSchema } from "../infrastructure/db/assert-migrated-schema";
import { createDatabase } from "../infrastructure/db/client";
import { loadCursorFromDb } from "../infrastructure/db/cursor-repository";
import { persistSyncResult } from "../infrastructure/db/persist-sync-result";
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
      ...config.databaseConnectionInfo,
      globalConfigUrl: config.globalConfigUrl,
      pollIntervalMs: config.pollIntervalMs,
      walletFriendlyAddress: config.walletFriendlyAddress,
    },
    "Starting TON deposit watcher",
  );

  const { client: dbClient, db } = createDatabase({
    databaseConnectionInfo: config.databaseConnectionInfo,
    databaseUrl: config.databaseUrl,
    logger: log,
  });

  try {
    await assertMigratedSchema({
      client: dbClient,
      logger: log,
    });
    const initialCursor = await loadCursorFromDb({
      db,
      logger: log,
      network: config.network,
      walletRawAddress: config.walletRawAddress,
    });
    const { client, engine, serverCount } = await createLiteClientFromConfigUrl({
      globalConfigUrl: config.globalConfigUrl,
      logger: log,
    });

    try {
      log.info({ serverCount }, "TON lite client is ready");

      const state: WatchState = {
        currentCursor: initialCursor,
        iteration: 0,
      };

      await runSyncIteration({
        client,
        config,
        db,
        emitToStdout: true,
        iterationReason: "startup",
        logger: log,
        state,
      });
      await runDownstreamDispatchPass({
        currentBlockSeqno: state.currentCursor?.lastProcessedBlock.seqno,
        db,
        downstreamServices: config.downstreamServices,
        logger: log,
        network: config.network,
        walletRawAddress: config.walletRawAddress,
      });

      while (!shutdown.isStopping) {
        const sleptFully = await waitForNextPoll(config.pollIntervalMs, shutdown);

        if (!sleptFully || shutdown.isStopping) {
          break;
        }

        await runSyncIteration({
          client,
          config,
          db,
          emitToStdout: false,
          iterationReason: "poll",
          logger: log,
          state,
        });

        await runDownstreamDispatchPass({
          currentBlockSeqno: state.currentCursor?.lastProcessedBlock.seqno,
          db,
          downstreamServices: config.downstreamServices,
          logger: log,
          network: config.network,
          walletRawAddress: config.walletRawAddress,
        });
      }
    } finally {
      engine.close();
    }
  } finally {
    shutdown.cleanup();
    await dbClient.end({ timeout: 5 });
    log.info("Stopped TON deposit watcher");
  }
}

async function runSyncIteration(args: {
  client: Awaited<ReturnType<typeof createLiteClientFromConfigUrl>>["client"];
  config: ReturnType<typeof loadConfig>;
  db: ReturnType<typeof createDatabase>["db"];
  emitToStdout: boolean;
  iterationReason: "startup" | "poll";
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

  await persistSyncResult({
    db: args.db,
    downstreamServiceSlugs: args.config.downstreamServices.map((service) => service.slug),
    logger: log,
    result,
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
