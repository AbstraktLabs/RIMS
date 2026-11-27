ALTER TABLE "purchase_items" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;