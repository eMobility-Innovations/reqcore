ALTER TABLE "career_page" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "career_page_slug_idx" ON "career_page" USING btree ("slug");