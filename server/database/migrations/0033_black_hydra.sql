CREATE TYPE "public"."analysis_billing_mode" AS ENUM('platform', 'byok');--> statement-breakpoint
ALTER TABLE "analysis_run" ADD COLUMN "cost_usd_micros" integer;--> statement-breakpoint
ALTER TABLE "analysis_run" ADD COLUMN "billing_mode" "analysis_billing_mode" DEFAULT 'byok' NOT NULL;