import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { createProductSchema, listProductsQuery } from "@/lib/validation/catalog";
import { createProduct, listProducts } from "@/controller/catalog/products";

export const GET = tenantRoute({ permission: "products.view" }, async ({ req, auth }) =>
  listProducts(auth, parseQuery(req, listProductsQuery)),
);

export const POST = tenantRoute({ permission: "products.manage" }, async ({ req, auth }) =>
  created(await createProduct(auth, await parseBody(req, createProductSchema))),
);
