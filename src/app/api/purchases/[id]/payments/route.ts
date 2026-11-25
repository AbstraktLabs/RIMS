import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { paymentInput } from "@/lib/validation/purchasing";
import { addPurchasePayment } from "@/controller/purchasing/purchases";

export const POST = tenantRoute({ permission: ["purchases.manage", "finance.manage"] }, async ({ req, params, auth }) =>
  addPurchasePayment(auth, idParam(params), await parseBody(req, paymentInput)),
);
