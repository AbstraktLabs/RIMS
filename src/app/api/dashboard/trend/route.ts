import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { dashboardTrend, rangeQuery } from "@/controller/reports/overview";

export const GET = tenantRoute({ permission: "dashboard.view" }, async ({ req, auth }) => dashboardTrend(auth, parseQuery(req, rangeQuery)));
