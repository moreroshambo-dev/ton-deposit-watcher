CREATE TABLE IF NOT EXISTS "incoming_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"network" text NOT NULL,
	"wallet_raw_address" text NOT NULL,
	"tx_hash_hex" text NOT NULL,
	"tx_lt" text NOT NULL,
	"to_raw_address" text NOT NULL,
	"from_raw_address" text NOT NULL,
	"memo" text,
	"memo_opcode" bigint,
	"memo_type" text NOT NULL,
	"amount_nano" text NOT NULL,
	"amount_ton" text NOT NULL,
	"body_boc_base64" text NOT NULL,
	"tx_now" bigint NOT NULL,
	"tx_now_iso" text NOT NULL,
	"inserted_at" text NOT NULL,
	CONSTRAINT "incoming_transfers_wallet_tx_unique" UNIQUE("network","wallet_raw_address","tx_hash_hex")
);
--> statement-breakpoint
ALTER TABLE "incoming_transfers"
	ALTER COLUMN "memo_opcode" TYPE bigint USING "memo_opcode"::bigint,
	ALTER COLUMN "tx_now" TYPE bigint USING "tx_now"::bigint;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"network" text NOT NULL,
	"wallet_raw_address" text NOT NULL,
	"last_processed_tx_lt" text,
	"last_processed_tx_hash_hex" text,
	"last_processed_block_seqno" integer NOT NULL,
	"last_processed_block_shard" text NOT NULL,
	"last_processed_block_workchain" integer NOT NULL,
	"last_processed_block_root_hash_hex" text NOT NULL,
	"last_processed_block_file_hash_hex" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "sync_cursors_wallet_unique" UNIQUE("network","wallet_raw_address")
);
