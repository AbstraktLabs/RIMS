import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { voidSchema } from "@/lib/validation/purchasing";
import { voidPurchase } from "@/controller/purchasing/purchases";

export const POST = tenantRoute({ permission: "purchases.manage" }, async ({ req, params, auth }) =>
  voidPurchase(auth, idParam(params), (await parseBody(req, voidSchema)).reason),
);
