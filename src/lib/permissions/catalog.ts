// Single source of truth for permissions and the built-in roles.
// Used by the seed script and (later) by API route guards.

export const PERMISSION_CATALOG = [
  { module: "dashboard", resource: "dashboard", actions: ["view"] },
  { module: "catalog", resource: "products", actions: ["view", "manage"] }, // products, variants, categories, brands, units
  { module: "inventory", resource: "inventory", actions: ["view", "manage"] }, // levels, lots, adjustments, transfers
  { module: "purchasing", resource: "purchases", actions: ["view", "manage"] }, // orders, bills, returns
  { module: "sales", resource: "sales", actions: ["view", "manage"] }, // POS, invoices, returns
  { module: "parties", resource: "parties", actions: ["view", "manage"] },
  { module: "finance", resource: "finance", actions: ["view", "manage"] }, // payments, income & expense, ledger
  { module: "reports", resource: "reports", actions: ["view", "export"] },
  { module: "settings", resource: "settings", actions: ["view", "manage"] }, // business, tax, locations
  { module: "users", resource: "users", actions: ["view", "manage"] }, // staff accounts & roles
] as const;

type CatalogEntry = (typeof PERMISSION_CATALOG)[number];
export type PermissionCode = {
  [E in CatalogEntry as E["resource"]]: `${E["resource"]}.${E["actions"][number]}`;
}[CatalogEntry["resource"]];

export const ALL_PERMISSION_CODES: PermissionCode[] = PERMISSION_CATALOG.flatMap((p) =>
  p.actions.map((a) => `${p.resource}.${a}` as PermissionCode),
);

export const SYSTEM_ROLES = {
  OWNER: "Owner",
  MANAGER: "Manager",
  VIEWER: "Viewer",
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

const MANAGER_EXCLUDED: PermissionCode[] = ["settings.manage", "users.manage"];

export const SYSTEM_ROLE_DEFINITIONS: Record<
  SystemRoleName,
  { description: string; permissions: PermissionCode[] }
> = {
  Owner: {
    description: "Full access to everything, including business settings, billing and staff.",
    permissions: ALL_PERMISSION_CODES,
  },
  Manager: {
    description: "Runs day-to-day operations: catalogue, stock, purchases, sales, parties, finance and reports.",
    permissions: ALL_PERMISSION_CODES.filter((c) => !MANAGER_EXCLUDED.includes(c)),
  },
  Viewer: {
    description: "Read-only access to every module. Cannot create, edit, delete or export.",
    permissions: ALL_PERMISSION_CODES.filter((c) => c.endsWith(".view")),
  },
};
