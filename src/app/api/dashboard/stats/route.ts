import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { dashboardStats, rangeQuery } from "@/controller/reports/overview";

export const GET = tenantRoute({ permission: "dashboard.view" }, async ({ req, auth }) => dashboardStats(auth, parseQuery(req, rangeQuery)));
