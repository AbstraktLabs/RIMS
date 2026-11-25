import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updateFinanceEntrySchema } from "@/lib/validation/finance";
import { deleteFinanceEntry, getFinanceEntry, updateFinanceEntry } from "@/controller/finance/entries";

export const GET = tenantRoute({ permission: "finance.view" }, async ({ params, auth }) =>
  getFinanceEntry(auth, idParam(params)),
);

export const PATCH = tenantRoute({ permission: "finance.manage" }, async ({ req, params, auth }) =>
  updateFinanceEntry(auth, idParam(params), await parseBody(req, updateFinanceEntrySchema)),
);

export const DELETE = tenantRoute({ permission: "finance.manage" }, async ({ params, auth }) =>
  deleteFinanceEntry(auth, idParam(params)),
);
