import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { createTransferSchema, transfersQuery } from "@/lib/validation/inventory";
import { createTransfer, listTransfers } from "@/controller/inventory/transfers";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ req, auth }) =>
  listTransfers(auth, parseQuery(req, transfersQuery)),
);

export const POST = tenantRoute({ permission: "inventory.manage" }, async ({ req, auth }) =>
  created(await createTransfer(auth, await parseBody(req, createTransferSchema))),
);
