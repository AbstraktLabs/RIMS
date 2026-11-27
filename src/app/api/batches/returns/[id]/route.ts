import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { settleReturn, settleReturnSchema } from "@/controller/inventory/batches";

export const PATCH = tenantRoute({ permission: "purchases.manage" }, async ({ req, params, auth }) =>
  settleReturn(auth, idParam(params), await parseBody(req, settleReturnSchema)),
);
