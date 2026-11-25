import { idParam, tenantRoute } from "@/lib/api/handler";
import { receiveTransfer } from "@/controller/inventory/transfers";

export const POST = tenantRoute({ permission: "inventory.manage" }, async ({ params, auth }) =>
  receiveTransfer(auth, idParam(params)),
);
