import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { completePurchaseReturnSchema } from "@/lib/validation/purchasing";
import { completePurchaseReturn } from "@/controller/purchasing/returns";

export const POST = tenantRoute({ permission: "purchases.manage" }, async ({ req, params, auth }) =>
  completePurchaseReturn(auth, idParam(params), await parseBody(req, completePurchaseReturnSchema)),
);
