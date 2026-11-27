import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { purchaseSchema } from "@/lib/validation/purchasing";
import { getPurchase, updatePurchase, voidPurchase } from "@/controller/purchasing/purchases";

export const GET = tenantRoute({ permission: "purchases.view" }, async ({ params, auth }) =>
  getPurchase(auth, idParam(params)),
);

// Edit: fails if goods from this purchase were already sold or moved.
export const PUT = tenantRoute({ permission: "purchases.manage" }, async ({ req, params, auth }) =>
  updatePurchase(auth, idParam(params), await parseBody(req, purchaseSchema)),
);

// Delete keeps an audit trail: the purchase is voided (stock and payments reversed)
// and drops out of the lists, which only show posted purchases.
export const DELETE = tenantRoute({ permission: "purchases.manage" }, async ({ params, auth }) =>
  voidPurchase(auth, idParam(params), "Deleted"),
);
