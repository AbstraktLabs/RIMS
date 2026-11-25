import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { lookupQuery } from "@/lib/validation/catalog";
import { lookupByCode } from "@/controller/catalog/products";

export const GET = tenantRoute(
  { permission: ["products.view", "sales.manage", "purchases.manage", "inventory.manage"] },
  async ({ req, auth }) => lookupByCode(auth, parseQuery(req, lookupQuery)),
);
