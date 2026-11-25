import { idParam, tenantRoute } from "@/lib/api/handler";
import { getTransfer } from "@/controller/inventory/transfers";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ params, auth }) =>
  getTransfer(auth, idParam(params)),
);
