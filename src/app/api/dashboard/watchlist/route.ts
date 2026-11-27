import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { dashboardWatchlist, rangeQuery } from "@/controller/reports/overview";

export const GET = tenantRoute({ permission: "dashboard.view" }, async ({ req, auth }) => dashboardWatchlist(auth, parseQuery(req, rangeQuery)));
