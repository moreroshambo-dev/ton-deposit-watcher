ALTER TABLE "downstream" ADD COLUMN "creditedTokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "downstream" ADD COLUMN "initiatedAt" date DEFAULT now() NOT NULL;