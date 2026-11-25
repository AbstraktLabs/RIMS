import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { saleReturnSchema, saleReturnsQuery } from "@/lib/validation/sales";
import { createSaleReturn, listSaleReturns } from "@/controller/sales/returns";

export const GET = tenantRoute({ permission: "sales.view" }, async ({ req, auth }) =>
  listSaleReturns(auth, parseQuery(req, saleReturnsQuery)),
);

export const POST = tenantRoute({ permission: "sales.manage" }, async ({ req, auth }) =>
  created(await createSaleReturn(auth, await parseBody(req, saleReturnSchema))),
);
