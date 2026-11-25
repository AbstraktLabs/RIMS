import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { movementSummaryQuery } from "@/lib/validation/reports";
import { stockMovementSummary } from "@/controller/reports/inventory";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => stockMovementSummary(auth, parseQuery(req, movementSummaryQuery)));
