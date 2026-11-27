import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { analyticsTrend, rangeQuery } from "@/controller/reports/overview";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => analyticsTrend(auth, parseQuery(req, rangeQuery)));
