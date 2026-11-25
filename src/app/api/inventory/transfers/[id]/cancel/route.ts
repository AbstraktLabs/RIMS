import { idParam, tenantRoute } from "@/lib/api/handler";
import { cancelTransfer } from "@/controller/inventory/transfers";

export const POST = tenantRoute({ permission: "inventory.manage" }, async ({ params, auth }) =>
  cancelTransfer(auth, idParam(params)),
);
