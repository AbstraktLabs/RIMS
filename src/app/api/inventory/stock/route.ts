import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { stockQuery } from "@/lib/validation/inventory";
import { listStock } from "@/controller/inventory/reads";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ req, auth }) => listStock(auth, parseQuery(req, stockQuery)));
