import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { transactionsQuery } from "@/lib/validation/reports";
import { listTransactions } from "@/controller/reports/transactions";

export const GET = tenantRoute({ permission: ["reports.view", "finance.view"] }, async ({ req, auth }) => listTransactions(auth, parseQuery(req, transactionsQuery)));
