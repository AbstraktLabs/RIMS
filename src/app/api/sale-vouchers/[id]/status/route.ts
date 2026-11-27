import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { statusSchema } from "@/controller/vouchers/common";
import { setSalePaymentStatus } from "@/controller/vouchers/sales";

export const PATCH = tenantRoute({ permission: "sales.manage" }, async ({ req, params, auth }) =>
  setSalePaymentStatus(auth, idParam(params), await parseBody(req, statusSchema)),
);
