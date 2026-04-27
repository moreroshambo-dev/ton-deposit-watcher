ALTER TABLE "incoming_transfers" ADD COLUMN "is_canceled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "incoming_transfers" ADD COLUMN "tx_block_seqno" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "incoming_transfers" ALTER COLUMN "is_canceled" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "incoming_transfers" ALTER COLUMN "tx_block_seqno" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "downstream_delivery_attempts" ADD COLUMN "last_tx_status" text;
