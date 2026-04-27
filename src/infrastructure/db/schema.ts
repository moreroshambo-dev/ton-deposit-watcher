import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  unique,
} from "drizzle-orm/pg-core";

export const incomingTransfersTable = pgTable(
  "incoming_transfers",
  {
    id: serial("id").primaryKey(),
    network: text("network").notNull(),
    walletRawAddress: text("wallet_raw_address").notNull(),
    txHashHex: text("tx_hash_hex").notNull(),
    txLt: text("tx_lt").notNull(),
    toRawAddress: text("to_raw_address").notNull(),
    fromRawAddress: text("from_raw_address").notNull(),
    isCanceled: boolean("is_canceled").notNull(),
    memo: text("memo"),
    memoOpcode: bigint("memo_opcode", { mode: "number" }),
    memoType: text("memo_type").notNull(),
    amountNano: text("amount_nano").notNull(),
    amountTon: text("amount_ton").notNull(),
    bodyBocBase64: text("body_boc_base64").notNull(),
    txNow: bigint("tx_now", { mode: "number" }).notNull(),
    txNowIso: text("tx_now_iso").notNull(),
    txBlockSeqno: integer("tx_block_seqno").notNull(),
    insertedAt: text("inserted_at").notNull(),
  },
  (table) => [
    unique("incoming_transfers_wallet_tx_unique").on(
      table.network,
      table.walletRawAddress,
      table.txHashHex,
    ),
  ],
);

export const syncCursorsTable = pgTable(
  "sync_cursors",
  {
    id: serial("id").primaryKey(),
    network: text("network").notNull(),
    walletRawAddress: text("wallet_raw_address").notNull(),
    lastProcessedTxLt: text("last_processed_tx_lt"),
    lastProcessedTxHashHex: text("last_processed_tx_hash_hex"),
    lastProcessedBlockSeqno: integer("last_processed_block_seqno").notNull(),
    lastProcessedBlockShard: text("last_processed_block_shard").notNull(),
    lastProcessedBlockWorkchain: integer("last_processed_block_workchain").notNull(),
    lastProcessedBlockRootHashHex: text("last_processed_block_root_hash_hex").notNull(),
    lastProcessedBlockFileHashHex: text("last_processed_block_file_hash_hex").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    unique("sync_cursors_wallet_unique").on(table.network, table.walletRawAddress),
  ],
);

export const downstreamDeliveryAttemptsTable = pgTable(
  "downstream_delivery_attempts",
  {
    id: serial("id").primaryKey(),
    serviceSlug: text("service_slug").notNull(),
    incomingTransferId: integer("incoming_transfer_id").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull(),
    lastAttemptAt: text("last_attempt_at"),
    lastTxStatus: text("last_tx_status"),
    nextRetryAt: text("next_retry_at"),
    lastError: text("last_error"),
    lastHttpStatus: integer("last_http_status"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    unique("downstream_delivery_attempts_service_transfer_unique").on(
      table.serviceSlug,
      table.incomingTransferId,
    ),
    index("downstream_delivery_attempts_service_status_retry_idx").on(
      table.serviceSlug,
      table.status,
      table.nextRetryAt,
    ),
  ],
);

export const schema = {
  downstreamDeliveryAttemptsTable,
  incomingTransfersTable,
  syncCursorsTable,
};
