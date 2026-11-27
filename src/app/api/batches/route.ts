import { parseQuery, tenantRoute } from "@/lib/api/handler";
import { batchesQuery, listBatches } from "@/controller/inventory/batches";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ req, auth }) =>
  listBatches(auth, parseQuery(req, batchesQuery)),
);
