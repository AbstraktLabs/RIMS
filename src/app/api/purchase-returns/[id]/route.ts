import { idParam, tenantRoute } from "@/lib/api/handler";
import { getPurchaseReturn } from "@/controller/purchasing/returns";

export const GET = tenantRoute({ permission: "purchases.view" }, async ({ params, auth }) =>
  getPurchaseReturn(auth, idParam(params)),
);
