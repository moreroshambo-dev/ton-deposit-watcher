ALTER TABLE "blockId" DROP CONSTRAINT "blockId_seqno_unique";--> statement-breakpoint
ALTER TABLE "blockId" ADD CONSTRAINT "blockId_seqno_workchain" UNIQUE("seqno","workchain");