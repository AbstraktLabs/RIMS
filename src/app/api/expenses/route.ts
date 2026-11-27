import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { createExpense, expenseQuery, expenseSchema, listExpenses } from "@/controller/finance/expenses";

export const GET = tenantRoute({ permission: "finance.view" }, async ({ req, auth }) => listExpenses(auth, parseQuery(req, expenseQuery)));

export const POST = tenantRoute({ permission: "finance.manage" }, async ({ req, auth }) =>
  created(await createExpense(auth, await parseBody(req, expenseSchema))),
);
