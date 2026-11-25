import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { searchVariantsQuery } from "@/lib/validation/catalog";
import { searchVariants } from "@/controller/catalog/products";

export const GET = tenantRoute(
  { permission: ["products.view", "sales.manage", "purchases.manage", "inventory.manage"] },
  async ({ req, auth }) => searchVariants(auth, parseQuery(req, searchVariantsQuery)),
);
