import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updateFinanceCategorySchema } from "@/lib/validation/finance";
import { deleteFinanceCategory, updateFinanceCategory } from "@/controller/finance/entries";

export const PATCH = tenantRoute({ permission: "finance.manage" }, async ({ req, params, auth }) =>
  updateFinanceCategory(auth, idParam(params), await parseBody(req, updateFinanceCategorySchema)),
);

export const DELETE = tenantRoute({ permission: "finance.manage" }, async ({ params, auth }) =>
  deleteFinanceCategory(auth, idParam(params)),
);
