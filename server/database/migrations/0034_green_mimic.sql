CREATE TABLE "onboarding_survey_response" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"signup_plan" text,
	"signup_billing" text,
	"company_size" text,
	"user_role" text,
	"discovery_source" text,
	"answered_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_survey_response" ADD CONSTRAINT "onboarding_survey_response_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_survey_response" ADD CONSTRAINT "onboarding_survey_response_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_survey_response_user_id_idx" ON "onboarding_survey_response" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "onboarding_survey_response_organization_id_idx" ON "onboarding_survey_response" USING btree ("organization_id");
