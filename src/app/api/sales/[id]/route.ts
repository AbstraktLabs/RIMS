import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { saleSchema } from "@/lib/validation/sales";
import { getSale, updateSale, voidSale } from "@/controller/sales/sales";

export const GET = tenantRoute({ permission: "sales.view" }, async ({ params, auth }) => getSale(auth, idParam(params)));

// Edit: the old lines' stock and payments are reversed, then the new ones applied.
export const PUT = tenantRoute({ permission: "sales.manage" }, async ({ req, params, auth }) =>
  updateSale(auth, idParam(params), await parseBody(req, saleSchema)),
);

// Delete keeps an audit trail: the sale is voided (stock and payments reversed) and
// drops out of the lists, which only show posted sales.
export const DELETE = tenantRoute({ permission: "sales.manage" }, async ({ params, auth }) =>
  voidSale(auth, idParam(params), "Deleted"),
);
