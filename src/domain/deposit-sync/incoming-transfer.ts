import { fromNano, type Address, type Transaction } from "@ton/core";
import type { Logger } from "pino";

import { parseMessageMemo } from "./memo";
import type {
  IncomingTransferStats,
  ParsedIncomingTransfer,
} from "./types";

type ExtractIncomingTransfersArgs = {
  logger: Logger;
  transactions: Transaction[];
  wallet: Address;
};

export function extractIncomingTransfers(
  args: ExtractIncomingTransfersArgs,
): {
  incomingTransfers: ParsedIncomingTransfer[];
  stats: IncomingTransferStats;
} {
  const log = args.logger.child({ scope: "incoming_transfer_extractor" });
  const stats: IncomingTransferStats = {
    accepted: 0,
    bounced: 0,
    noInMessage: 0,
    nonInternal: 0,
    nonPositiveAmount: 0,
    totalTransactions: args.transactions.length,
    wrongDestination: 0,
  };
  const incomingTransfers: ParsedIncomingTransfer[] = [];

  for (const transaction of args.transactions) {
    const inMessage = transaction.inMessage;

    if (!inMessage) {
      stats.noInMessage += 1;
      continue;
    }

    if (inMessage.info.type !== "internal") {
      stats.nonInternal += 1;
      continue;
    }

    if (inMessage.info.bounced) {
      stats.bounced += 1;
      continue;
    }

    if (!inMessage.info.dest.equals(args.wallet)) {
      stats.wrongDestination += 1;
      continue;
    }

    if (inMessage.info.value.coins <= 0n) {
      stats.nonPositiveAmount += 1;
      continue;
    }

    const memo = parseMessageMemo(inMessage.body);
    const parsedTransfer: ParsedIncomingTransfer = {
      amountNano: inMessage.info.value.coins.toString(),
      amountTon: fromNano(inMessage.info.value.coins),
      bodyBocBase64: inMessage.body.toBoc({ idx: false }).toString("base64"),
      fromRawAddress: inMessage.info.src.toRawString(),
      memo: memo.memo,
      memoOpcode: memo.memoOpcode,
      memoType: memo.memoType,
      now: transaction.now,
      nowIso: new Date(transaction.now * 1000).toISOString(),
      toRawAddress: inMessage.info.dest.toRawString(),
      txHashHex: transaction.hash().toString("hex"),
      txLt: transaction.lt.toString(),
    };

    incomingTransfers.push(parsedTransfer);
    stats.accepted += 1;

    log.info(
      {
        amountNano: parsedTransfer.amountNano,
        amountTon: parsedTransfer.amountTon,
        fromRawAddress: parsedTransfer.fromRawAddress,
        memo: parsedTransfer.memo,
        memoType: parsedTransfer.memoType,
        txHashHex: parsedTransfer.txHashHex,
        txLt: parsedTransfer.txLt,
      },
      "Incoming transfer detected",
    );
  }

  log.info(stats, "Finished filtering wallet transactions for incoming deposits");

  return {
    incomingTransfers,
    stats,
  };
}
