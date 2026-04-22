import type { Logger } from "pino";

import { buildCursor, isSameCursor, toBlockCursor, toLastProcessedTx } from "./cursor-utils";
import { loadTransactionsSinceCursor } from "./history";
import { extractIncomingTransfers } from "./incoming-transfer";
import type { SyncIncomingTransfersArgs, SyncIncomingTransfersResult } from "./types";

export async function syncIncomingTransfers(
  args: SyncIncomingTransfersArgs,
): Promise<SyncIncomingTransfersResult> {
  const log: Logger = args.logger.child({
    scope: "deposit_sync",
  });
  const walletRawAddress = args.wallet.toRawString();
  const walletFriendlyAddress = args.wallet.toString({
    bounceable: true,
    testOnly: args.network === "testnet",
    urlSafe: true,
  });

  const masterchainInfo = await args.client.getMasterchainInfo();
  const snapshotBlock = toBlockCursor(masterchainInfo.last);
  const accountState = await args.client.getAccountState(args.wallet, masterchainInfo.last);
  const latestTransaction = toLastProcessedTx(accountState.lastTx);

  log.info(
    {
      cursorBefore: args.cursor?.lastProcessedTx ?? null,
      latestTransaction,
      snapshotBlock,
    },
    "Loaded current wallet snapshot",
  );

  if (latestTransaction === null) {
    if (args.cursor?.lastProcessedTx) {
      throw new Error(
        "The wallet has a cursor transaction, but the lite server did not return the current account lastTx. Refusing to continue because this can skip history.",
      );
    }

    log.info("Wallet has no transactions yet");

    return {
      cursorAfter: buildCursor({
        lastProcessedBlock: snapshotBlock,
        lastProcessedTx: null,
        network: args.network,
        walletRawAddress,
      }),
      cursorBefore: args.cursor,
      incomingTransfers: [],
      scannedTransactions: 0,
      snapshotBlock,
      walletFriendlyAddress,
      walletRawAddress,
    };
  }

  if (args.cursor?.lastProcessedTx && isSameCursor(args.cursor.lastProcessedTx, latestTransaction)) {
    log.info("No new wallet transactions since the saved cursor");

    return {
      cursorAfter: buildCursor({
        lastProcessedBlock: snapshotBlock,
        lastProcessedTx: latestTransaction,
        network: args.network,
        walletRawAddress,
      }),
      cursorBefore: args.cursor,
      incomingTransfers: [],
      scannedTransactions: 0,
      snapshotBlock,
      walletFriendlyAddress,
      walletRawAddress,
    };
  }

  const history = await loadTransactionsSinceCursor({
    address: args.wallet,
    batchSize: args.batchSize,
    client: args.client,
    logger: args.logger,
    startFrom: latestTransaction,
    stopAtExclusive: args.cursor?.lastProcessedTx ?? null,
  });

  const chronologicalTransactions = [...history.transactions].reverse();
  const extractedTransfers = extractIncomingTransfers({
    logger: args.logger,
    transactions: chronologicalTransactions,
    wallet: args.wallet,
  });

  const result: SyncIncomingTransfersResult = {
    cursorAfter: buildCursor({
      lastProcessedBlock: snapshotBlock,
      lastProcessedTx: latestTransaction,
      network: args.network,
      walletRawAddress,
    }),
    cursorBefore: args.cursor,
    incomingTransfers: extractedTransfers.incomingTransfers,
    scannedTransactions: chronologicalTransactions.length,
    snapshotBlock,
    walletFriendlyAddress,
    walletRawAddress,
  };

  log.info(
    {
      incomingTransfers: result.incomingTransfers.length,
      pagesLoaded: history.pagesLoaded,
      scannedTransactions: result.scannedTransactions,
      skippedTransactions: result.scannedTransactions - extractedTransfers.stats.accepted,
    },
    "Completed deposit sync",
  );

  return result;
}
