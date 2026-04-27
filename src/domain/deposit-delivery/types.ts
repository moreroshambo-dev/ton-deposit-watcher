import { Network } from "../cursor/types";

export const downstreamTxStatus = {
  error: "error",
  pending: "pending",
  success: "success",
} as const;

export type DownstreamTxStatus =
  (typeof downstreamTxStatus)[keyof typeof downstreamTxStatus];

export const deliveryAttemptStatus = {
  delivered: "delivered",
  pending: "pending",
  retryScheduled: "retry_scheduled",
  terminalFailed: "terminal_failed",
} as const;

export type DeliveryAttemptStatus =
  (typeof deliveryAttemptStatus)[keyof typeof deliveryAttemptStatus];

export type DownstreamService = {
  baseUrl: string;
  cursorPath: string;
  privateKeyPem: string;
  processTxPath: string;
  signatureHeader: string;
  slug: string;
};

export type DeliverableIncomingTransfer = {
  asset: "rsp-coin";
  amountTon: string;
  fromRawAddress: string;
  id: number;
  isCanceled: boolean;
  memo: string;
  memoType: "text_comment";
  now: number;
  toRawAddress: string;
  txBlockSeqno: number;
  txHashHex: string;
  txLt: string;
  userId: string;
};

export type DeliveryAttempt = {
  attemptCount: number;
  createdAt: string;
  id: number;
  incomingTransferId: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastHttpStatus: number | null;
  lastTxStatus: DownstreamTxStatus | null;
  nextRetryAt: string | null;
  serviceSlug: string;
  status: DeliveryAttemptStatus;
  updatedAt: string;
};

export type DownstreamCursorRequest = {
  network: Network;
};

export type DownstreamCursorResponse = {
  network: Network;
  hash: string | null;
};

export type DownstreamTxUpdate = {
  amount: string;
  asset: "rsp-coin";
  network: Network;
  creditedTokens: string;
  from: string;
  hash: string;
  initiatedAt: number;
  status: DownstreamTxStatus;
  to: string;
  userId: string;
};

export type DownstreamProcessTxRequest = {
  network: Network;
  txUpdate: DownstreamTxUpdate;
};

export type ResolvedRemoteCursor =
  | {
      mode: "from_hash";
      remoteHash: string;
    }
  | {
      mode: "from_start";
      remoteHash: null;
    };
