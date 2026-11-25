import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { taxReportQuery } from "@/lib/validation/reports";
import { taxReport } from "@/controller/reports/financial";

export const GET = tenantRoute({ permission: "reports.view" }, async ({ req, auth }) => taxReport(auth, parseQuery(req, taxReportQuery)));
