CREATE TYPE "public"."adjustment_reason" AS ENUM('OPENING_STOCK', 'COUNT_CORRECTION', 'DAMAGED', 'EXPIRED', 'LOST', 'THEFT', 'INTERNAL_USE', 'FOUND', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."balance_type" AS ENUM('DR', 'CR');--> statement-breakpoint
CREATE TYPE "public"."business_type" AS ENUM('GROCERY', 'FASHION', 'ELECTRONICS', 'COSMETICS', 'CONVENIENCE', 'FOOD', 'GENERAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."calendar_system" AS ENUM('AD', 'BS');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('POSTED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('SALE', 'SALE_RETURN', 'PURCHASE', 'PURCHASE_ORDER', 'PURCHASE_RETURN', 'STOCK_ADJUSTMENT', 'STOCK_TRANSFER', 'PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."finance_entry_kind" AS ENUM('INCOME', 'EXPENSE');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('STORE', 'WAREHOUSE');--> statement-breakpoint
CREATE TYPE "public"."lot_status" AS ENUM('ACTIVE', 'EXPIRED', 'DEPLETED');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('TRIAL', 'ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('SUPPLIER', 'CUSTOMER', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."payment_direction" AS ENUM('RECEIVED_FROM_CUSTOMER', 'PAID_TO_SUPPLIER', 'REFUND_TO_CUSTOMER', 'REFUND_FROM_SUPPLIER');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_WALLET', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'PARTIAL', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('BASIC', 'STANDARD', 'PRO');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."purchase_return_resolution" AS ENUM('REFUND', 'CREDIT_NOTE', 'REPLACEMENT');--> statement-breakpoint
CREATE TYPE "public"."purchase_return_status" AS ENUM('PENDING', 'COMPLETED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."return_condition" AS ENUM('RESELLABLE', 'DAMAGED');--> statement-breakpoint
CREATE TYPE "public"."sale_channel" AS ENUM('POS', 'INVOICE');--> statement-breakpoint
CREATE TYPE "public"."sale_return_resolution" AS ENUM('REFUND', 'STORE_CREDIT');--> statement-breakpoint
CREATE TYPE "public"."serial_status" AS ENUM('IN_STOCK', 'SOLD', 'RETURNED_TO_SUPPLIER', 'DAMAGED', 'IN_TRANSIT');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('OPENING', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'TRANSFER_OUT', 'TRANSFER_IN');--> statement-breakpoint
CREATE TYPE "public"."stock_reference_type" AS ENUM('PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'ADJUSTMENT', 'TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."tax_mode" AS ENUM('EXCLUSIVE', 'INCLUSIVE', 'EXEMPT');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(150) NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_not_own_parent_chk" CHECK ("categories"."parent_id" is null or "categories"."parent_id" <> "categories"."id")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"sku" varchar(80) NOT NULL,
	"barcode" varchar(80),
	"option_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"selling_price" numeric(14, 2) NOT NULL,
	"wholesale_price" numeric(14, 2),
	"mrp" numeric(14, 2),
	"low_stock_threshold" numeric(14, 3),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_prices_chk" CHECK ("product_variants"."cost_price" >= 0 and "product_variants"."selling_price" >= 0 and coalesce("product_variants"."wholesale_price", 0) >= 0 and coalesce("product_variants"."mrp", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category_id" uuid,
	"brand_id" uuid,
	"model" varchar(120),
	"hs_code" varchar(20),
	"unit_id" uuid NOT NULL,
	"purchase_unit_id" uuid,
	"purchase_unit_factor" numeric(14, 3),
	"tax_rate_id" uuid,
	"image_url" text,
	"image_public_id" text,
	"track_batches" boolean DEFAULT false NOT NULL,
	"track_expiry" boolean DEFAULT false NOT NULL,
	"track_serials" boolean DEFAULT false NOT NULL,
	"has_variants" boolean DEFAULT false NOT NULL,
	"variant_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"low_stock_threshold" numeric(14, 3),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_expiry_needs_batches_chk" CHECK (not "products"."track_expiry" or "products"."track_batches"),
	CONSTRAINT "products_purchase_unit_chk" CHECK (("products"."purchase_unit_id" is null) = ("products"."purchase_unit_factor" is null) and ("products"."purchase_unit_factor" is null or "products"."purchase_unit_factor" > 0))
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"rate" numeric(5, 2) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_rates_rate_chk" CHECK ("tax_rates"."rate" >= 0 and "tax_rates"."rate" <= 100)
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(50) NOT NULL,
	"code" varchar(15) NOT NULL,
	"allow_decimal" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sequences" (
	"organization_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"padding" integer DEFAULT 5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_sequences_organization_id_document_type_pk" PRIMARY KEY("organization_id","document_type"),
	CONSTRAINT "document_sequences_next_chk" CHECK ("document_sequences"."next_number" >= 1),
	CONSTRAINT "document_sequences_padding_chk" CHECK ("document_sequences"."padding" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "finance_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "finance_entry_kind" NOT NULL,
	"name" varchar(150) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"kind" "finance_entry_kind" NOT NULL,
	"category_id" uuid,
	"party_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"entry_date" date NOT NULL,
	"method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"reference_number" varchar(100),
	"description" varchar(255) NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_entries_amount_chk" CHECK ("finance_entries"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"number" varchar(40) NOT NULL,
	"direction" "payment_direction" NOT NULL,
	"party_id" uuid,
	"sale_id" uuid,
	"purchase_id" uuid,
	"sale_return_id" uuid,
	"purchase_return_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"method" "payment_method" DEFAULT 'CASH' NOT NULL,
	"reference_number" varchar(100),
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_chk" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_single_document_chk" CHECK ((case when "payments"."sale_id" is null then 0 else 1 end
         + case when "payments"."purchase_id" is null then 0 else 1 end
         + case when "payments"."sale_return_id" is null then 0 else 1 end
         + case when "payments"."purchase_return_id" is null then 0 else 1 end) <= 1),
	CONSTRAINT "payments_direction_document_chk" CHECK (("payments"."sale_id" is null or "payments"."direction" = 'RECEIVED_FROM_CUSTOMER')
      and ("payments"."purchase_id" is null or "payments"."direction" = 'PAID_TO_SUPPLIER')
      and ("payments"."sale_return_id" is null or "payments"."direction" = 'REFUND_TO_CUSTOMER')
      and ("payments"."purchase_return_id" is null or "payments"."direction" = 'REFUND_FROM_SUPPLIER'))
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(30),
	"type" "location_type" DEFAULT 'STORE' NOT NULL,
	"address" text,
	"phone" varchar(30),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"currency_code" varchar(3) DEFAULT 'NPR' NOT NULL,
	"currency_symbol" varchar(8) DEFAULT 'Rs.' NOT NULL,
	"currency_decimals" integer DEFAULT 2 NOT NULL,
	"locale" varchar(20) DEFAULT 'en-US' NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"calendar_system" "calendar_system" DEFAULT 'AD' NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
	"fiscal_year_start_day" integer DEFAULT 1 NOT NULL,
	"tax_label" varchar(30) DEFAULT 'VAT' NOT NULL,
	"tax_id_label" varchar(30) DEFAULT 'Tax ID' NOT NULL,
	"tax_registered" boolean DEFAULT false NOT NULL,
	"prices_include_tax" boolean DEFAULT false NOT NULL,
	"enable_variants" boolean DEFAULT true NOT NULL,
	"enable_batch_tracking" boolean DEFAULT false NOT NULL,
	"enable_expiry_tracking" boolean DEFAULT false NOT NULL,
	"enable_serial_tracking" boolean DEFAULT false NOT NULL,
	"enable_multi_location" boolean DEFAULT false NOT NULL,
	"enable_wholesale_pricing" boolean DEFAULT false NOT NULL,
	"allow_negative_stock" boolean DEFAULT false NOT NULL,
	"expiry_alert_days" integer DEFAULT 30 NOT NULL,
	"invoice_footer" text,
	"receipt_footer" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_settings_fy_month_chk" CHECK ("organization_settings"."fiscal_year_start_month" between 1 and 12),
	CONSTRAINT "org_settings_fy_day_chk" CHECK ("organization_settings"."fiscal_year_start_day" between 1 and 32),
	CONSTRAINT "org_settings_decimals_chk" CHECK ("organization_settings"."currency_decimals" between 0 and 4),
	CONSTRAINT "org_settings_expiry_days_chk" CHECK ("organization_settings"."expiry_alert_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"business_type" "business_type" DEFAULT 'GENERAL' NOT NULL,
	"plan" "plan" DEFAULT 'BASIC' NOT NULL,
	"status" "org_status" DEFAULT 'TRIAL' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"legal_name" varchar(255),
	"tax_id" varchar(50),
	"email" varchar(255),
	"phone" varchar(30),
	"address" text,
	"logo_url" text,
	"logo_public_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"active_location_id" uuid,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(30),
	"password_hash" text NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module" varchar(50) NOT NULL,
	"resource" varchar(50) NOT NULL,
	"action" varchar(30) NOT NULL,
	"code" varchar(120) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(40),
	"name" varchar(255) NOT NULL,
	"party_type" "party_type" DEFAULT 'CUSTOMER' NOT NULL,
	"contact_person" varchar(255),
	"tax_id" varchar(50),
	"phone" varchar(30),
	"email" varchar(255),
	"address" text,
	"payment_terms" varchar(255),
	"credit_limit" numeric(14, 2),
	"opening_balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"opening_balance_type" "balance_type" DEFAULT 'DR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parties_amounts_chk" CHECK ("parties"."opening_balance" >= 0 and coalesce("parties"."credit_limit", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "serial_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid,
	"serial_number" varchar(120) NOT NULL,
	"status" serial_status DEFAULT 'IN_STOCK' NOT NULL,
	"purchase_item_id" uuid,
	"sale_item_id" uuid,
	"warranty_ends_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_adjustment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"lot_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 4) NOT NULL,
	"line_value" numeric(14, 2) NOT NULL,
	"lot_number" varchar(100),
	"manufacturing_date" date,
	"expiry_date" date,
	"note" text,
	CONSTRAINT "stock_adjustment_items_qty_chk" CHECK ("stock_adjustment_items"."quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"number" varchar(40) NOT NULL,
	"adjustment_date" date NOT NULL,
	"reason" "adjustment_reason" NOT NULL,
	"total_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"avg_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_levels_avg_cost_chk" CHECK ("stock_levels"."avg_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"supplier_id" uuid,
	"purchase_item_id" uuid,
	"lot_number" varchar(100),
	"manufacturing_date" date,
	"expiry_date" date,
	"unit_cost" numeric(14, 4) NOT NULL,
	"quantity_received" numeric(14, 3) NOT NULL,
	"quantity_available" numeric(14, 3) NOT NULL,
	"status" "lot_status" DEFAULT 'ACTIVE' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_lots_qty_chk" CHECK ("stock_lots"."quantity_available" >= 0 and "stock_lots"."quantity_received" >= 0),
	CONSTRAINT "stock_lots_dates_chk" CHECK ("stock_lots"."manufacturing_date" is null or "stock_lots"."expiry_date" is null or "stock_lots"."manufacturing_date" <= "stock_lots"."expiry_date")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"lot_id" uuid,
	"type" "stock_movement_type" NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 4) NOT NULL,
	"balance_after" numeric(14, 3) NOT NULL,
	"reference_type" "stock_reference_type" NOT NULL,
	"reference_id" uuid NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_qty_nonzero_chk" CHECK ("stock_movements"."quantity" <> 0)
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"source_lot_id" uuid,
	"destination_lot_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "stock_transfer_items_qty_chk" CHECK ("stock_transfer_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" varchar(40) NOT NULL,
	"from_location_id" uuid NOT NULL,
	"to_location_id" uuid NOT NULL,
	"status" "transfer_status" DEFAULT 'DRAFT' NOT NULL,
	"transfer_date" date NOT NULL,
	"dispatched_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"note" text,
	"created_by_user_id" uuid,
	"received_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_transfers_locations_chk" CHECK ("stock_transfers"."from_location_id" <> "stock_transfers"."to_location_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"purchase_order_item_id" uuid,
	"variant_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 4) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_rate_id" uuid,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"landed_unit_cost" numeric(14, 4) NOT NULL,
	"lot_id" uuid,
	"lot_number" varchar(100),
	"manufacturing_date" date,
	"expiry_date" date,
	"quantity_returned" numeric(14, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "purchase_items_qty_chk" CHECK ("purchase_items"."quantity" > 0 and "purchase_items"."quantity_returned" >= 0 and "purchase_items"."quantity_returned" <= "purchase_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"quantity_received" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(14, 4) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	CONSTRAINT "purchase_order_items_qty_chk" CHECK ("purchase_order_items"."quantity" > 0 and "purchase_order_items"."quantity_received" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"number" varchar(40) NOT NULL,
	"order_date" date NOT NULL,
	"expected_date" date,
	"status" "purchase_order_status" DEFAULT 'DRAFT' NOT NULL,
	"tax_mode" "tax_mode" DEFAULT 'EXCLUSIVE' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_charges" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_return_id" uuid NOT NULL,
	"purchase_item_id" uuid,
	"variant_id" uuid NOT NULL,
	"lot_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 4) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	CONSTRAINT "purchase_return_items_qty_chk" CHECK ("purchase_return_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"purchase_id" uuid,
	"number" varchar(40) NOT NULL,
	"return_date" date NOT NULL,
	"status" "purchase_return_status" DEFAULT 'PENDING' NOT NULL,
	"resolution" "purchase_return_resolution",
	"subtotal" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(14, 2) NOT NULL,
	"reason" varchar(255),
	"note" text,
	"completed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_returns_resolution_chk" CHECK ("purchase_returns"."status" <> 'COMPLETED' or "purchase_returns"."resolution" is not null)
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"number" varchar(40) NOT NULL,
	"supplier_invoice_number" varchar(100),
	"purchase_date" date NOT NULL,
	"due_date" date,
	"status" "document_status" DEFAULT 'POSTED' NOT NULL,
	"tax_mode" "tax_mode" DEFAULT 'EXCLUSIVE' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_charges" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(14, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(14, 2) NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_amounts_chk" CHECK ("purchases"."grand_total" >= 0 and "purchases"."paid_amount" >= 0 and "purchases"."discount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"lot_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_rate_id" uuid,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"unit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"quantity_returned" numeric(14, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "sale_items_qty_chk" CHECK ("sale_items"."quantity" > 0 and "sale_items"."quantity_returned" >= 0 and "sale_items"."quantity_returned" <= "sale_items"."quantity"),
	CONSTRAINT "sale_items_amounts_chk" CHECK ("sale_items"."unit_price" >= 0 and "sale_items"."discount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_return_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"lot_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"unit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"condition" "return_condition" DEFAULT 'RESELLABLE' NOT NULL,
	"restocked" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sale_return_items_qty_chk" CHECK ("sale_return_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"party_id" uuid,
	"number" varchar(40) NOT NULL,
	"return_date" date NOT NULL,
	"status" "document_status" DEFAULT 'POSTED' NOT NULL,
	"resolution" "sale_return_resolution" DEFAULT 'REFUND' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(14, 2) NOT NULL,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reason" varchar(255),
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"invoice_number" varchar(40) NOT NULL,
	"channel" "sale_channel" DEFAULT 'POS' NOT NULL,
	"party_id" uuid,
	"customer_name" varchar(255),
	"customer_phone" varchar(30),
	"sale_date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" date,
	"status" "document_status" DEFAULT 'POSTED' NOT NULL,
	"tax_mode" "tax_mode" DEFAULT 'EXCLUSIVE' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_charges" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(14, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(14, 2) NOT NULL,
	"total_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"amount_tendered" numeric(14, 2),
	"change_given" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_amounts_chk" CHECK ("sales"."grand_total" >= 0 and "sales"."paid_amount" >= 0 and "sales"."discount" >= 0 and "sales"."change_given" >= 0)
);
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_purchase_unit_id_units_id_fk" FOREIGN KEY ("purchase_unit_id") REFERENCES "public"."units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_return_id_sale_returns_id_fk" FOREIGN KEY ("sale_return_id") REFERENCES "public"."sale_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchase_return_id_purchase_returns_id_fk" FOREIGN KEY ("purchase_return_id") REFERENCES "public"."purchase_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_active_location_id_locations_id_fk" FOREIGN KEY ("active_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_purchase_item_id_purchase_items_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "public"."purchase_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_adjustment_id_stock_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_supplier_id_parties_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_purchase_item_id_purchase_items_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "public"."purchase_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_source_lot_id_stock_lots_id_fk" FOREIGN KEY ("source_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_destination_lot_id_stock_lots_id_fk" FOREIGN KEY ("destination_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_order_item_id_purchase_order_items_id_fk" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_return_id_purchase_returns_id_fk" FOREIGN KEY ("purchase_return_id") REFERENCES "public"."purchase_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_item_id_purchase_items_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "public"."purchase_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_return_id_sale_returns_id_fk" FOREIGN KEY ("sale_return_id") REFERENCES "public"."sale_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_org_name_idx" ON "brands" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "categories_org_parent_idx" ON "categories" USING btree ("organization_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_root_name_idx" ON "categories" USING btree ("organization_id",lower("name")) WHERE "categories"."parent_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_child_name_idx" ON "categories" USING btree ("organization_id","parent_id",lower("name")) WHERE "categories"."parent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_sku_idx" ON "product_variants" USING btree ("organization_id",lower("sku"));--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_barcode_idx" ON "product_variants" USING btree ("organization_id","barcode") WHERE "product_variants"."barcode" is not null;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_default_idx" ON "product_variants" USING btree ("product_id") WHERE "product_variants"."is_default";--> statement-breakpoint
CREATE INDEX "products_org_name_idx" ON "products" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "products_org_category_idx" ON "products" USING btree ("organization_id","category_id");--> statement-breakpoint
CREATE INDEX "products_org_brand_idx" ON "products" USING btree ("organization_id","brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_org_name_idx" ON "tax_rates" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_org_default_idx" ON "tax_rates" USING btree ("organization_id") WHERE "tax_rates"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "units_org_code_idx" ON "units" USING btree ("organization_id",lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "finance_categories_org_kind_name_idx" ON "finance_categories" USING btree ("organization_id","kind",lower("name"));--> statement-breakpoint
CREATE INDEX "finance_entries_org_kind_date_idx" ON "finance_entries" USING btree ("organization_id","kind","entry_date");--> statement-breakpoint
CREATE INDEX "finance_entries_org_category_idx" ON "finance_entries" USING btree ("organization_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_org_number_idx" ON "payments" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "payments_org_date_idx" ON "payments" USING btree ("organization_id","payment_date");--> statement-breakpoint
CREATE INDEX "payments_org_party_idx" ON "payments" USING btree ("organization_id","party_id");--> statement-breakpoint
CREATE INDEX "payments_sale_idx" ON "payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "payments_purchase_idx" ON "payments" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "locations_org_idx" ON "locations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_org_name_idx" ON "locations" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_org_default_idx" ON "locations" USING btree ("organization_id") WHERE "locations"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "super_admins_email_idx" ON "super_admins" USING btree ("email");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_hash_idx" ON "email_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_hash_idx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_owner_idx" ON "users" USING btree ("organization_id") WHERE "users"."is_owner";--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_idx" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_resource_action_idx" ON "permissions" USING btree ("resource","action");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_system_name_idx" ON "roles" USING btree ("name") WHERE "roles"."organization_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_name_idx" ON "roles" USING btree ("organization_id","name") WHERE "roles"."organization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_locations_user_location_idx" ON "user_locations" USING btree ("user_id","location_id");--> statement-breakpoint
CREATE INDEX "user_locations_org_idx" ON "user_locations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_locations_location_idx" ON "user_locations" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "parties_org_type_idx" ON "parties" USING btree ("organization_id","party_type");--> statement-breakpoint
CREATE INDEX "parties_org_name_idx" ON "parties" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "parties_org_phone_idx" ON "parties" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "parties_org_code_idx" ON "parties" USING btree ("organization_id","code") WHERE "parties"."code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "serial_numbers_org_variant_serial_idx" ON "serial_numbers" USING btree ("organization_id","variant_id","serial_number");--> statement-breakpoint
CREATE INDEX "serial_numbers_org_serial_idx" ON "serial_numbers" USING btree ("organization_id","serial_number");--> statement-breakpoint
CREATE INDEX "serial_numbers_sale_item_idx" ON "serial_numbers" USING btree ("sale_item_id");--> statement-breakpoint
CREATE INDEX "stock_adjustment_items_adjustment_idx" ON "stock_adjustment_items" USING btree ("adjustment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_adjustments_org_number_idx" ON "stock_adjustments" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "stock_adjustments_org_date_idx" ON "stock_adjustments" USING btree ("organization_id","adjustment_date");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_levels_variant_location_idx" ON "stock_levels" USING btree ("variant_id","location_id");--> statement-breakpoint
CREATE INDEX "stock_levels_org_location_idx" ON "stock_levels" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE INDEX "stock_lots_variant_location_expiry_idx" ON "stock_lots" USING btree ("variant_id","location_id","expiry_date");--> statement-breakpoint
CREATE INDEX "stock_lots_org_expiry_idx" ON "stock_lots" USING btree ("organization_id","expiry_date");--> statement-breakpoint
CREATE INDEX "stock_lots_org_lot_number_idx" ON "stock_lots" USING btree ("organization_id","lot_number");--> statement-breakpoint
CREATE INDEX "stock_movements_org_variant_idx" ON "stock_movements" USING btree ("organization_id","variant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_org_location_idx" ON "stock_movements" USING btree ("organization_id","location_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_reference_idx" ON "stock_movements" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "stock_transfer_items_transfer_idx" ON "stock_transfer_items" USING btree ("transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfers_org_number_idx" ON "stock_transfers" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "stock_transfers_org_status_idx" ON "stock_transfers" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_idx" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_items_variant_idx" ON "purchase_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "purchase_order_items_order_idx" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_org_number_idx" ON "purchase_orders" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "purchase_orders_org_status_idx" ON "purchase_orders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_org_party_idx" ON "purchase_orders" USING btree ("organization_id","party_id");--> statement-breakpoint
CREATE INDEX "purchase_return_items_return_idx" ON "purchase_return_items" USING btree ("purchase_return_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_returns_org_number_idx" ON "purchase_returns" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "purchase_returns_org_status_idx" ON "purchase_returns" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "purchase_returns_org_party_idx" ON "purchase_returns" USING btree ("organization_id","party_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_org_number_idx" ON "purchases" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "purchases_org_date_idx" ON "purchases" USING btree ("organization_id","purchase_date");--> statement-breakpoint
CREATE INDEX "purchases_org_party_idx" ON "purchases" USING btree ("organization_id","party_id");--> statement-breakpoint
CREATE INDEX "purchases_org_payment_status_idx" ON "purchases" USING btree ("organization_id","payment_status");--> statement-breakpoint
CREATE INDEX "sale_items_sale_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_variant_idx" ON "sale_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "sale_return_items_return_idx" ON "sale_return_items" USING btree ("sale_return_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_returns_org_number_idx" ON "sale_returns" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "sale_returns_org_date_idx" ON "sale_returns" USING btree ("organization_id","return_date");--> statement-breakpoint
CREATE INDEX "sale_returns_sale_idx" ON "sale_returns" USING btree ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_org_invoice_number_idx" ON "sales" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX "sales_org_date_idx" ON "sales" USING btree ("organization_id","sale_date");--> statement-breakpoint
CREATE INDEX "sales_org_location_date_idx" ON "sales" USING btree ("organization_id","location_id","sale_date");--> statement-breakpoint
CREATE INDEX "sales_org_party_idx" ON "sales" USING btree ("organization_id","party_id");--> statement-breakpoint
CREATE INDEX "sales_org_payment_status_idx" ON "sales" USING btree ("organization_id","payment_status");