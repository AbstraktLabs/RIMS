import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { analyticsBreakdown, rangeQuery } from "@/controller/reports/overview";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => analyticsBreakdown(auth, parseQuery(req, rangeQuery)));
