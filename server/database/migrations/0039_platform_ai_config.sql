CREATE TABLE "platform_ai_config" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "name" text DEFAULT 'Platform (OpenRouter)' NOT NULL,
  "provider" text DEFAULT 'openrouter' NOT NULL,
  "model" text DEFAULT 'openai/gpt-5.4-mini' NOT NULL,
  "max_tokens" integer DEFAULT 4096 NOT NULL,
  "input_price_per_1m" numeric(10, 4),
  "output_price_per_1m" numeric(10, 4),
  "is_default_analysis" boolean DEFAULT true NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_ai_config" ADD CONSTRAINT "platform_ai_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_ai_config_organization_id_idx" ON "platform_ai_config" USING btree ("organization_id");
