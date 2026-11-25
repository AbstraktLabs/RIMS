import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { purchaseReturnSchema, purchaseReturnsQuery } from "@/lib/validation/purchasing";
import { createPurchaseReturn, listPurchaseReturns } from "@/controller/purchasing/returns";

export const GET = tenantRoute({ permission: "purchases.view" }, async ({ req, auth }) =>
  listPurchaseReturns(auth, parseQuery(req, purchaseReturnsQuery)),
);

export const POST = tenantRoute({ permission: "purchases.manage" }, async ({ req, auth }) =>
  created(await createPurchaseReturn(auth, await parseBody(req, purchaseReturnSchema))),
);
