import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { pagination } from "@/lib/validation/common";
import { z } from "zod";
import { createPurchaseVoucher, listPurchaseVouchers, purchaseVoucherSchema } from "@/controller/vouchers/purchases";

// The Purchase screen (pharmacy-style bills) at the active location.
export const GET = tenantRoute({ permission: "purchases.view" }, async ({ req, auth }) =>
  listPurchaseVouchers(auth, parseQuery(req, z.object(pagination))),
);

export const POST = tenantRoute({ permission: "purchases.manage" }, async ({ req, auth }) =>
  created(await createPurchaseVoucher(auth, await parseBody(req, purchaseVoucherSchema))),
);
