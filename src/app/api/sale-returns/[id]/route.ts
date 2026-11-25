import { idParam, tenantRoute } from "@/lib/api/handler";
import { getSaleReturn } from "@/controller/sales/returns";

export const GET = tenantRoute({ permission: "sales.view" }, async ({ params, auth }) =>
  getSaleReturn(auth, idParam(params)),
);
