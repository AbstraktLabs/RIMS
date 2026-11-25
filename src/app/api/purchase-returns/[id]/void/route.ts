import { idParam, tenantRoute } from "@/lib/api/handler";
import { voidPurchaseReturn } from "@/controller/purchasing/returns";

export const POST = tenantRoute({ permission: "purchases.manage" }, async ({ params, auth }) =>
  voidPurchaseReturn(auth, idParam(params)),
);
