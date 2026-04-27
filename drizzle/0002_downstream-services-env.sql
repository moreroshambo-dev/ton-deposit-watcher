ALTER TABLE "downstream_delivery_attempts" ADD COLUMN "service_slug" text;
--> statement-breakpoint
UPDATE "downstream_delivery_attempts" AS attempt
SET "service_slug" = COALESCE(service."slug", 'legacy-' || attempt."service_id"::text)
FROM "downstream_delivery_attempts" AS source_attempt
LEFT JOIN "downstream_services" AS service
  ON service."id" = source_attempt."service_id"
WHERE attempt."id" = source_attempt."id";
--> statement-breakpoint
ALTER TABLE "downstream_delivery_attempts" ALTER COLUMN "service_slug" SET NOT NULL;
--> statement-breakpoint
DROP INDEX "downstream_delivery_attempts_service_status_retry_idx";
--> statement-breakpoint
ALTER TABLE "downstream_delivery_attempts" DROP CONSTRAINT "downstream_delivery_attempts_service_transfer_unique";
--> statement-breakpoint
ALTER TABLE "downstream_delivery_attempts" ADD CONSTRAINT "downstream_delivery_attempts_service_transfer_unique" UNIQUE("service_slug","incoming_transfer_id");
--> statement-breakpoint
CREATE INDEX "downstream_delivery_attempts_service_status_retry_idx" ON "downstream_delivery_attempts" USING btree ("service_slug","status","next_retry_at");
--> statement-breakpoint
ALTER TABLE "downstream_delivery_attempts" DROP COLUMN "service_id";
--> statement-breakpoint
DROP TABLE "downstream_services";
