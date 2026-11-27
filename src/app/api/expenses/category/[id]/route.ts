import { idParam, tenantRoute } from "@/lib/api/handler";
import { deleteExpenseCategory } from "@/controller/finance/expenses";

export const DELETE = tenantRoute({ permission: "finance.manage" }, async ({ params, auth }) =>
  deleteExpenseCategory(auth, idParam(params)),
);
