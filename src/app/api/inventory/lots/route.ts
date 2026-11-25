import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { lotsQuery } from "@/lib/validation/inventory";
import { listLots } from "@/controller/inventory/reads";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ req, auth }) => listLots(auth, parseQuery(req, lotsQuery)));
