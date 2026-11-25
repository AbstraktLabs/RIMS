import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { purchaseSchema, purchasesQuery } from "@/lib/validation/purchasing";
import { createPurchase, listPurchases } from "@/controller/purchasing/purchases";

export const GET = tenantRoute({ permission: "purchases.view" }, async ({ req, auth }) =>
  listPurchases(auth, parseQuery(req, purchasesQuery)),
);

export const POST = tenantRoute({ permission: "purchases.manage" }, async ({ req, auth }) =>
  created(await createPurchase(auth, await parseBody(req, purchaseSchema))),
);
