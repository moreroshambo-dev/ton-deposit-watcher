ALTER TABLE "blockId" ALTER COLUMN "rootHash" SET DATA TYPE varchar(64);--> statement-breakpoint
ALTER TABLE "blockId" ALTER COLUMN "fileHash" SET DATA TYPE varchar(64);--> statement-breakpoint
ALTER TABLE "deposits_tx" ADD COLUMN "rootHash" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "deposits_tx" ADD COLUMN "fileHash" varchar(64) NOT NULL;