import { type Address, type Transaction } from "@ton/core";
import { type LiteClient } from "ton-lite-client";
import type { Logger } from "pino";

import type { BlockCursor, Network, SyncCursor } from "../cursor/types";

export type MessageMemo =
  | {
      memo: null;
      memoOpcode: null;
      memoType: "empty";
    }
  | {
      memo: string;
      memoOpcode: 0;
      memoType: "text_comment";
    }
  | {
      memo: null;
      memoOpcode: number | null;
      memoType: "binary";
    };

export type ParsedIncomingTransfer = {
  amountNano: string;
  amountTon: string;
  bodyBocBase64: string;
  fromRawAddress: string;
  isCanceled: boolean;
  memo: string | null;
  memoOpcode: number | null;
  memoType: MessageMemo["memoType"];
  now: number;
  nowIso: string;
  toRawAddress: string;
  txBlockSeqno: number;
  txHashHex: string;
  txLt: string;
};

export type IncomingTransferStats = {
  accepted: number;
  bounced: number;
  noInMessage: number;
  nonInternal: number;
  nonPositiveAmount: number;
  totalTransactions: number;
  wrongDestination: number;
};

export type HistoryScanResult = {
  pagesLoaded: number;
  reachedStopCursor: boolean;
  transactions: ScannedTransaction[];
};

export type ScannedTransaction = {
  blockSeqno: number;
  transaction: Transaction;
};

export type SyncIncomingTransfersArgs = {
  batchSize: number;
  client: LiteClient;
  cursor: SyncCursor | null;
  logger: Logger;
  network: Network;
  wallet: Address;
};

export type SyncIncomingTransfersResult = {
  cursorAfter: SyncCursor;
  cursorBefore: SyncCursor | null;
  incomingTransfers: ParsedIncomingTransfer[];
  scannedTransactions: number;
  snapshotBlock: BlockCursor;
  walletFriendlyAddress: string;
  walletRawAddress: string;
};
