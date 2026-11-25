import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { valuationQuery } from "@/lib/validation/reports";
import { inventoryValuation } from "@/controller/reports/inventory";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => inventoryValuation(auth, parseQuery(req, valuationQuery)));
