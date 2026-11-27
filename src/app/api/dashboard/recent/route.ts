import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { dashboardRecent, rangeQuery } from "@/controller/reports/overview";

export const GET = tenantRoute({ permission: "dashboard.view" }, async ({ req, auth }) => dashboardRecent(auth, parseQuery(req, rangeQuery)));
