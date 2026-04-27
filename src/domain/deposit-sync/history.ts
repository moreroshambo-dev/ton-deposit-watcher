import { Address, Cell, loadTransaction, type Transaction } from "@ton/core";
import type { Logger } from "pino";
import { type LiteClient } from "ton-lite-client";

import type { TransactionCursor } from "../cursor/types";
import { isSameCursor, toTransactionCursor } from "./cursor-utils";
import type { HistoryScanResult, ScannedTransaction } from "./types";

type LoadTransactionsSinceCursorArgs = {
  address: Address;
  batchSize: number;
  client: LiteClient;
  logger: Logger;
  startFrom: TransactionCursor;
  stopAtExclusive: TransactionCursor | null;
};

export async function loadTransactionsSinceCursor(
  args: LoadTransactionsSinceCursorArgs,
): Promise<HistoryScanResult> {
  const log = args.logger.child({
    scope: "wallet_history_scanner",
    batchSize: args.batchSize,
    startFrom: args.startFrom,
    stopAtExclusive: args.stopAtExclusive,
  });

  let pageCursor = args.startFrom;
  let shouldSkipFirstRepeatedTransaction = false;
  let reachedStopCursor = false;
  let pagesLoaded = 0;
  const transactions: ScannedTransaction[] = [];

  log.info("Starting wallet history scan");

  while (true) {
    pagesLoaded += 1;

    const page = await args.client.getAccountTransactions(
      args.address,
      pageCursor.lt,
      Buffer.from(pageCursor.hashHex, "hex"),
      args.batchSize,
    );

    let pageTransactions = Cell.fromBoc(page.transactions).map((cell) =>
      loadTransaction(cell.beginParse()),
    );
    let pageBlockIds = page.ids;

    const repeatedFirstTransactionSkipped =
      shouldSkipFirstRepeatedTransaction &&
      pageTransactions[0] &&
      isSameCursor(toTransactionCursor(pageTransactions[0]), pageCursor);

    if (repeatedFirstTransactionSkipped) {
      pageTransactions = pageTransactions.slice(1);
      pageBlockIds = pageBlockIds.slice(1);
    }

    shouldSkipFirstRepeatedTransaction = true;

    log.debug(
      {
        pageCursor,
        pageNumber: pagesLoaded,
        repeatedFirstTransactionSkipped,
        transactionsInPage: pageTransactions.length,
      },
      "Loaded wallet history page",
    );

    if (pageTransactions.length === 0) {
      break;
    }

    const stopCursorIndex = args.stopAtExclusive
      ? pageTransactions.findIndex((transaction) =>
          isSameCursor(toTransactionCursor(transaction), args.stopAtExclusive as TransactionCursor),
        )
      : -1;

    if (stopCursorIndex >= 0) {
      transactions.push(...toScannedTransactions(
        pageTransactions.slice(0, stopCursorIndex),
        pageBlockIds.slice(0, stopCursorIndex),
      ));
      reachedStopCursor = true;
      break;
    }

    transactions.push(...toScannedTransactions(pageTransactions, pageBlockIds));
    pageCursor = toTransactionCursor(pageTransactions[pageTransactions.length - 1]);
  }

  if (args.stopAtExclusive && !reachedStopCursor) {
    throw new Error(
      "The saved cursor transaction was not found in the wallet history. Refusing to continue because this would reprocess the full account history.",
    );
  }

  log.info(
    {
      pagesLoaded,
      reachedStopCursor,
      scannedTransactions: transactions.length,
    },
    "Completed wallet history scan",
  );

  return {
    pagesLoaded,
    reachedStopCursor,
    transactions,
  };
}

function toScannedTransactions(
  transactions: Transaction[],
  blockIds: { seqno: number }[],
): ScannedTransaction[] {
  if (transactions.length !== blockIds.length) {
    throw new Error(
      `Lite server returned ${transactions.length} transactions but ${blockIds.length} block ids`,
    );
  }

  return transactions.map((transaction, index) => ({
    blockSeqno: blockIds[index].seqno,
    transaction,
  }));
}
