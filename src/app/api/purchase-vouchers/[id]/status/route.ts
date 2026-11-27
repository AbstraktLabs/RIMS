import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { statusSchema } from "@/controller/vouchers/common";
import { setPurchasePaymentStatus } from "@/controller/vouchers/purchases";

export const PATCH = tenantRoute({ permission: "purchases.manage" }, async ({ req, params, auth }) =>
  setPurchasePaymentStatus(auth, idParam(params), await parseBody(req, statusSchema)),
);
