import { created, parseBody, tenantRoute } from "@/lib/api/handler";
import { batchReturnSchema, listBatchReturns, returnBatch } from "@/controller/inventory/batches";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ auth }) => listBatchReturns(auth));

export const POST = tenantRoute({ permission: "purchases.manage" }, async ({ req, auth }) =>
  created(await returnBatch(auth, await parseBody(req, batchReturnSchema))),
);
