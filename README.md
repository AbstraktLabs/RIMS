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

## Testing

`pnpm test:e2e` runs the end-to-end API suites in `tests/e2e/` against a running
server. They sign up throwaway businesses and post real documents, so use a
**separate, empty database** — never one with real data. The runner refuses any
host other than localhost unless `E2E_ALLOW_REMOTE=1`.

```bash
# terminal 1 — a dev server on a throwaway database
DATABASE_URL=postgresql://USER@localhost:5432/rims_test RATE_LIMIT_SKIP=register,login-ip pnpm dev
# terminal 2
E2E_BASE_URL=http://localhost:3000 pnpm test:e2e          # all suites
E2E_BASE_URL=http://localhost:3000 pnpm test:e2e hardening  # one suite
```

| Suite | Covers |
|---|---|
| `core` | Sign-up, settings, catalogue, purchases, POS (decimal, serial, split tender), credit limits, returns, ledger, adjustments, transfers, reports, read-only staff, tenant isolation |
| `documents` | PO → partial receipt, payment voids, purchase returns, voids, store credit, outstanding |
| `integration` | Dashboard counts vs stock filters, reorder suggestions, product links on document lines |
| `hardening` | Token tampering, refresh-token replay and the two-tab race, login throttling, spoofed `X-Forwarded-For`, Manager/Viewer permissions, deactivated staff, concurrent sales of the last unit, gap-free numbering under load, bad input, suspended and expired-trial shops |
| `isolation` | Every route that takes an id, called by another business: all must answer 404 and change nothing |

The suspended / expired-trial checks need a local test super admin: set
`E2E_PLATFORM_EMAIL` and `E2E_PLATFORM_PASSWORD` (they are skipped otherwise).

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
goods received, increases stock) → `purchase_returns`. Reorder suggestions
(`GET /api/products/reorder`) list active items at or below their low-stock level at
a location and suggest enough to reach twice that level, less what is already on
sent orders; the purchase-order form and the stock page use them.

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
