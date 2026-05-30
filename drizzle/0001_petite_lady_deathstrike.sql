ALTER TABLE "downstream" ADD COLUMN "network" text;
UPDATE "downstream" SET network = "ton-testnet";