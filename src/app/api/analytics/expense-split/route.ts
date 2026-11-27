import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { expenseSplit, rangeQuery } from "@/controller/reports/overview";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => expenseSplit(auth, parseQuery(req, rangeQuery)));
