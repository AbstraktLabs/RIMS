import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import {
  deletePurchaseVoucher,
  getPurchaseVoucher,
  purchaseVoucherSchema,
  updatePurchaseVoucher,
} from "@/controller/vouchers/purchases";

export const GET = tenantRoute({ permission: "purchases.view" }, async ({ params, auth }) => getPurchaseVoucher(auth, idParam(params)));

// Edit: stock and payments are reversed and re-applied; fails if the goods were already sold.
export const PATCH = tenantRoute({ permission: "purchases.manage" }, async ({ req, params, auth }) =>
  updatePurchaseVoucher(auth, idParam(params), await parseBody(req, purchaseVoucherSchema)),
);

// Delete voids the bill (kept for the audit trail) and takes its stock back off the shelf.
export const DELETE = tenantRoute({ permission: "purchases.manage" }, async ({ params, auth }) =>
  deletePurchaseVoucher(auth, idParam(params)),
);
