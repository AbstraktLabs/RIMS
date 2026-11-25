import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { purchaseOrderSchema, purchaseOrdersQuery } from "@/lib/validation/purchasing";
import { createPurchaseOrder, listPurchaseOrders } from "@/controller/purchasing/orders";

export const GET = tenantRoute({ permission: "purchases.view" }, async ({ req, auth }) =>
  listPurchaseOrders(auth, parseQuery(req, purchaseOrdersQuery)),
);

export const POST = tenantRoute({ permission: "purchases.manage" }, async ({ req, auth }) =>
  created(await createPurchaseOrder(auth, await parseBody(req, purchaseOrderSchema))),
);
