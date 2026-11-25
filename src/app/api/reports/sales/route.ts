import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { salesReportQuery } from "@/lib/validation/reports";
import { salesReport } from "@/controller/reports/sales";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => salesReport(auth, parseQuery(req, salesReportQuery)));
