import { created, parseBody, tenantRoute } from "@/lib/api/handler";
import { createExpenseCategory, expenseCategorySchema, listExpenseCategories } from "@/controller/finance/expenses";

export const GET = tenantRoute({ permission: "finance.view" }, async ({ auth }) => listExpenseCategories(auth));

export const POST = tenantRoute({ permission: "finance.manage" }, async ({ req, auth }) =>
  created(await createExpenseCategory(auth, (await parseBody(req, expenseCategorySchema)).name)),
);
