import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { pagination } from "@/lib/validation/common";
import { z } from "zod";
import { createSaleVoucher, listSaleVouchers, saleVoucherSchema } from "@/controller/vouchers/sales";

// The Sales screen (pharmacy-style invoices) at the active location.
export const GET = tenantRoute({ permission: "sales.view" }, async ({ req, auth }) =>
  listSaleVouchers(auth, parseQuery(req, z.object(pagination))),
);

export const POST = tenantRoute({ permission: "sales.manage" }, async ({ req, auth }) =>
  created(await createSaleVoucher(auth, await parseBody(req, saleVoucherSchema))),
);
