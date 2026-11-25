import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { purchasesReportQuery } from "@/lib/validation/reports";
import { purchasesReport } from "@/controller/reports/sales";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => purchasesReport(auth, parseQuery(req, purchasesReportQuery)));
