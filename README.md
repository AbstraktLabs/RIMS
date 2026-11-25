# Retail IMS (RIMS)

Multi-tenant inventory management for general retail — grocery, fashion,
electronics, cosmetics, convenience and general merchandise stores.

Stack: Next.js (App Router + API routes) · PostgreSQL · Drizzle ORM (`pg` driver) ·
Zod · Tailwind CSS. Same architecture as the Pharmacy IMS, with its own database,
migrations and configuration.

## Local development

Requirements: Node 20+, pnpm, PostgreSQL 16+, Redis.

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL and secrets
pnpm db:migrate               # create tables in your RIMS database
pnpm db:seed                  # permissions, system roles, optional super admin
pnpm dev
```

| Script | Purpose |
|---|---|
| `pnpm db:generate` | Create a new migration after editing `src/db/schema/*` |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Idempotent platform seed (safe to re-run) |
| `pnpm db:studio` | Browse the database |
| `pnpm typecheck` | Type-check the project |

Use a **dedicated** database for RIMS — never point `DATABASE_URL` at the
Pharmacy IMS database.

## Database design

All schema lives in `src/db/schema/`, one file per domain.

**Tenancy (SaaS).** `organizations` is the tenant (addressed by `slug`, with plan,
status and trial). Every tenant-owned table has `organization_id`; every query must
be scoped by it. `organization_settings` holds per-tenant configuration — currency,
locale, timezone, calendar (AD/BS), fiscal year start, tax labels, and feature
toggles (variants, batch/expiry, serials, multi-location, wholesale pricing,
negative stock). `locations` are stores/warehouses; each tenant gets a default one.
`super_admins` are platform operators with a separate login.

**Access.** `users` belong to one tenant (email globally unique). The owner
(`is_owner`) has full access everywhere. Other users get a role per location via
`user_locations`. System roles — **Owner**, **Manager**, **Viewer** (read-only) —
and the permission catalogue are defined in `src/lib/permissions/catalog.ts` and
seeded by `pnpm db:seed`.

**Catalogue.** `products` hold the shared definition (category with subcategories,
brand, model, unit, tax rate, flexible `attributes`, opt-in tracking flags).
`product_variants` are what is stocked and sold (SKU, barcode, size/colour/weight
options, cost / selling / wholesale / MRP prices). A simple product has one default
variant. `units` allow decimal quantities where it makes sense (kg, litre, metre).

**Inventory.** `stock_levels` is the on-hand quantity and moving-average cost per
variant per location. `stock_lots` (batch / expiry) and `serial_numbers` are used
only for products that opt in. `stock_movements` is the append-only history of every
change. `stock_adjustments` cover opening stock, counts, damage and loss;
`stock_transfers` move stock between locations.

**Purchasing.** `purchase_orders` (no stock effect) → `purchases` (supplier bill +
goods received, increases stock) → `purchase_returns`.

**Sales.** `sales` (POS receipts and invoices; walk-in customers allowed) with
per-line cost snapshots for cost-of-goods-sold, and `sale_returns` (resellable or
damaged).

**Finance.** `payments` (both directions, split tender, on-account), `finance_entries`
and `finance_categories` for operating income/expenses, and `document_sequences` for
gap-free per-tenant document numbers. Profit = sales − returns − cost of goods sold −
stock losses − expenses + other income. Stock purchases are not expenses.

**Integrity rules.** Money `numeric(14,2)`, unit cost `numeric(14,4)`, quantities
`numeric(14,3)`. Check constraints and partial unique indexes enforce things like
non-negative lot stock, one default location / tax rate / owner per tenant,
case-insensitive unique SKUs and emails, and payment direction matching its document.
Posted documents are voided, not deleted. Stock-changing writes must run in one
transaction with the affected `stock_levels` rows locked.

New tenants get starter data from `src/db/tenant-defaults.ts` (default location,
units, income/expense categories, document prefixes, optional default tax rate).
