import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import {
  deleteSaleVoucher,
  getSaleVoucher,
  saleVoucherSchema,
  updateSaleVoucher,
} from "@/controller/vouchers/sales";

export const GET = tenantRoute({ permission: "sales.view" }, async ({ params, auth }) => getSaleVoucher(auth, idParam(params)));

// Edit: stock and payments are reversed and re-applied; fails if goods were returned.
export const PATCH = tenantRoute({ permission: "sales.manage" }, async ({ req, params, auth }) =>
  updateSaleVoucher(auth, idParam(params), await parseBody(req, saleVoucherSchema)),
);

// Delete voids the invoice (kept for the audit trail) and puts its stock back on the shelf.
export const DELETE = tenantRoute({ permission: "sales.manage" }, async ({ params, auth }) =>
  deleteSaleVoucher(auth, idParam(params)),
);
