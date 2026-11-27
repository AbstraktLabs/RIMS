import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { deleteExpense, expenseSchema, updateExpense } from "@/controller/finance/expenses";

export const PATCH = tenantRoute({ permission: "finance.manage" }, async ({ req, params, auth }) =>
  updateExpense(auth, idParam(params), await parseBody(req, expenseSchema)),
);

export const DELETE = tenantRoute({ permission: "finance.manage" }, async ({ params, auth }) => deleteExpense(auth, idParam(params)));
