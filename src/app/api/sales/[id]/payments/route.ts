import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { paymentInput } from "@/lib/validation/sales";
import { addSalePayment } from "@/controller/sales/sales";

export const POST = tenantRoute({ permission: ["sales.manage", "finance.manage"] }, async ({ req, params, auth }) =>
  addSalePayment(auth, idParam(params), await parseBody(req, paymentInput)),
);
