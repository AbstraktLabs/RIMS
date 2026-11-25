import { idParam, tenantRoute } from "@/lib/api/handler";
import { getAdjustment } from "@/controller/inventory/adjustments";

// Adjustments are posted immediately and are part of the audit trail: no edit or delete.
// To undo one, post an opposite adjustment.
export const GET = tenantRoute({ permission: "inventory.view" }, async ({ params, auth }) =>
  getAdjustment(auth, idParam(params)),
);
