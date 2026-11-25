import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { profitLossQuery } from "@/lib/validation/reports";
import { profitLoss } from "@/controller/reports/financial";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => profitLoss(auth, parseQuery(req, profitLossQuery)));
