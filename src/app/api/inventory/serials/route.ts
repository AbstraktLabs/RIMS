import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { serialsQuery } from "@/lib/validation/inventory";
import { listSerials } from "@/controller/inventory/reads";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ req, auth }) => listSerials(auth, parseQuery(req, serialsQuery)));
