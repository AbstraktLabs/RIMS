import { idParam, tenantRoute } from "@/lib/api/handler";
import { listItemBatches } from "@/controller/catalog/items";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ params, auth }) =>
  listItemBatches(auth, idParam(params)),
);
