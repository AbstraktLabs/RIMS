import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { saleSchema, salesQuery } from "@/lib/validation/sales";
import { createSale, listSales } from "@/controller/sales/sales";

export const GET = tenantRoute({ permission: "sales.view" }, async ({ req, auth }) =>
  listSales(auth, parseQuery(req, salesQuery)),
);

export const POST = tenantRoute({ permission: "sales.manage" }, async ({ req, auth }) =>
  created(await createSale(auth, await parseBody(req, saleSchema))),
);
