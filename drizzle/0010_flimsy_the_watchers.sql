ALTER TABLE "deposits_tx" RENAME COLUMN "rootHash" TO "shardRootHash";--> statement-breakpoint
ALTER TABLE "deposits_tx" RENAME COLUMN "fileHash" TO "shardFileHash";