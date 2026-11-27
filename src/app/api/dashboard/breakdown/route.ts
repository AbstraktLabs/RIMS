import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { dashboardBreakdown, rangeQuery } from "@/controller/reports/overview";

export const GET = tenantRoute({ permission: "dashboard.view" }, async ({ req, auth }) => dashboardBreakdown(auth, parseQuery(req, rangeQuery)));
