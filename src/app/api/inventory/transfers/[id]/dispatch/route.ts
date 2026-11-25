import { idParam, tenantRoute } from "@/lib/api/handler";
import { dispatchTransfer } from "@/controller/inventory/transfers";

export const POST = tenantRoute({ permission: "inventory.manage" }, async ({ params, auth }) =>
  dispatchTransfer(auth, idParam(params)),
);
