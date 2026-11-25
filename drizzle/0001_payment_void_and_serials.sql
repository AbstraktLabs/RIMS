ALTER TABLE "payments" ADD COLUMN "status" "document_status" DEFAULT 'POSTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "voided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD COLUMN "serial_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD COLUMN "serial_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD COLUMN "serial_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD COLUMN "serial_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;