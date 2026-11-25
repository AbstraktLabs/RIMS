import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { adjustmentsQuery, createAdjustmentSchema } from "@/lib/validation/inventory";
import { createAdjustment, listAdjustments } from "@/controller/inventory/adjustments";

export const GET = tenantRoute({ permission: "inventory.view" }, async ({ req, auth }) =>
  listAdjustments(auth, parseQuery(req, adjustmentsQuery)),
);

export const POST = tenantRoute({ permission: "inventory.manage" }, async ({ req, auth }) =>
  created(await createAdjustment(auth, await parseBody(req, createAdjustmentSchema))),
);
