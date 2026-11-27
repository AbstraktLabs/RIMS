import { created, parseBody, tenantRoute } from "@/lib/api/handler";
import { listWriteOffs, writeOffBatch, writeOffSchema } from "@/controller/inventory/batches";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ auth }) => listWriteOffs(auth));

export const POST = tenantRoute({ permission: "inventory.manage" }, async ({ req, auth }) =>
  created(await writeOffBatch(auth, await parseBody(req, writeOffSchema))),
);
