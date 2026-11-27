import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { analyticsStats, rangeQuery } from "@/controller/reports/overview";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => analyticsStats(auth, parseQuery(req, rangeQuery)));
