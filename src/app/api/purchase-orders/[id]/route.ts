import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { purchaseOrderSchema } from "@/lib/validation/purchasing";
import { deletePurchaseOrder, getPurchaseOrder, updatePurchaseOrder } from "@/controller/purchasing/orders";

export const GET = tenantRoute({ permission: "purchases.view" }, async ({ params, auth }) =>
  getPurchaseOrder(auth, idParam(params)),
);

export const PUT = tenantRoute({ permission: "purchases.manage" }, async ({ req, params, auth }) =>
  updatePurchaseOrder(auth, idParam(params), await parseBody(req, purchaseOrderSchema)),
);

export const DELETE = tenantRoute({ permission: "purchases.manage" }, async ({ params, auth }) =>
  deletePurchaseOrder(auth, idParam(params)),
);
