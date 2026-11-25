import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { expiryReportQuery } from "@/lib/validation/reports";
import { expiryReport } from "@/controller/reports/inventory";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => expiryReport(auth, parseQuery(req, expiryReportQuery)));
