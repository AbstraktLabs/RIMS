import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { movementsQuery } from "@/lib/validation/inventory";
import { listMovements } from "@/controller/inventory/reads";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ req, auth }) => listMovements(auth, parseQuery(req, movementsQuery)));
