import { idParam, tenantRoute } from "@/lib/api/handler";
import { getPurchase } from "@/controller/purchasing/purchases";

// Posted purchases are never edited or deleted — void and re-enter instead.
export const GET = tenantRoute({ permission: "purchases.view" }, async ({ params, auth }) =>
  getPurchase(auth, idParam(params)),
);
