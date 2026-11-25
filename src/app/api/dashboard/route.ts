import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { dashboardQuery } from "@/lib/validation/reports";
import { dashboard } from "@/controller/reports/dashboard";

export const GET = tenantRoute({ permission: "dashboard.view" }, async ({ req, auth }) => dashboard(auth, parseQuery(req, dashboardQuery)));
