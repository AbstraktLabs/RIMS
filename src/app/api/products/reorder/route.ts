import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { reorderQuery } from "@/lib/validation/catalog";
import { reorderSuggestions } from "@/controller/catalog/products";

export const GET = tenantRoute(
  { permission: "purchases.manage" },
  async ({ req, auth }) => reorderSuggestions(auth, parseQuery(req, reorderQuery)),
);
