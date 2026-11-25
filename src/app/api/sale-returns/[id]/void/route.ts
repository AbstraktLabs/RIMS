import { idParam, tenantRoute } from "@/lib/api/handler";
import { voidSaleReturn } from "@/controller/sales/returns";

export const POST = tenantRoute({ permission: "sales.manage" }, async ({ params, auth }) =>
  voidSaleReturn(auth, idParam(params)),
);
