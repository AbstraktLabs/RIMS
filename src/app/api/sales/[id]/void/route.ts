import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { voidSchema } from "@/lib/validation/purchasing";
import { voidSale } from "@/controller/sales/sales";

export const POST = tenantRoute({ permission: "sales.manage" }, async ({ req, params, auth }) =>
  voidSale(auth, idParam(params), (await parseBody(req, voidSchema)).reason),
);
