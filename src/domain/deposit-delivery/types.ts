export const DOWNSTREAM_BLOCKCHAIN = "ton";
export const DOWNSTREAM_ASSET = "ton";
export const DOWNSTREAM_TX_STATUS = "SUCCESS";

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
  createdAt: string;
  cursorPath: string;
  enabled: boolean;
  id: number;
  privateKeyPem: string;
  processTxPath: string;
  signatureHeader: string;
  slug: string;
  updatedAt: string;
};

export type DeliverableIncomingTransfer = {
  amountTon: string;
  fromRawAddress: string;
  id: number;
  memo: string;
  memoType: "text_comment";
  now: number;
  toRawAddress: string;
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
  nextRetryAt: string | null;
  serviceId: number;
  status: DeliveryAttemptStatus;
  updatedAt: string;
};

export type DownstreamCursorRequest = {
  blockchain: typeof DOWNSTREAM_BLOCKCHAIN;
};

export type DownstreamCursorResponse = {
  blockchain: typeof DOWNSTREAM_BLOCKCHAIN;
  hash: string | null;
};

export type DownstreamTxUpdate = {
  amount: string;
  asset: typeof DOWNSTREAM_ASSET;
  blockchain: typeof DOWNSTREAM_BLOCKCHAIN;
  creditedTokens: string;
  from: string;
  hash: string;
  initiatedAt: number;
  status: typeof DOWNSTREAM_TX_STATUS;
  to: string;
  userId: string;
};

export type DownstreamProcessTxRequest = {
  blockchain: typeof DOWNSTREAM_BLOCKCHAIN;
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
