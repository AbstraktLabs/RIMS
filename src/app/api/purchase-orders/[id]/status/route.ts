import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { purchaseOrderStatusSchema } from "@/lib/validation/purchasing";
import { setPurchaseOrderStatus } from "@/controller/purchasing/orders";

export const POST = tenantRoute({ permission: "purchases.manage" }, async ({ req, params, auth }) =>
  setPurchaseOrderStatus(auth, idParam(params), (await parseBody(req, purchaseOrderStatusSchema)).status),
);
