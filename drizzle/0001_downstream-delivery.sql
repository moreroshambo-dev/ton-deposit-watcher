CREATE TABLE "downstream_delivery_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_id" integer NOT NULL,
	"incoming_transfer_id" integer NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer NOT NULL,
	"last_attempt_at" text,
	"next_retry_at" text,
	"last_error" text,
	"last_http_status" integer,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "downstream_delivery_attempts_service_transfer_unique" UNIQUE("service_id","incoming_transfer_id")
);
--> statement-breakpoint
CREATE TABLE "downstream_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"base_url" text NOT NULL,
	"cursor_path" text NOT NULL,
	"process_tx_path" text NOT NULL,
	"signature_header" text NOT NULL,
	"private_key_pem" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "downstream_services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "downstream_delivery_attempts_service_status_retry_idx" ON "downstream_delivery_attempts" USING btree ("service_id","status","next_retry_at");