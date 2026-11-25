import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updateProductSchema } from "@/lib/validation/catalog";
import { deleteProduct, getProduct, updateProduct } from "@/controller/catalog/products";

export const GET = tenantRoute({ permission: "products.view" }, async ({ params, auth }) =>
  getProduct(auth, idParam(params)),
);

export const PUT = tenantRoute({ permission: "products.manage" }, async ({ req, params, auth }) =>
  updateProduct(auth, idParam(params), await parseBody(req, updateProductSchema)),
);

export const DELETE = tenantRoute({ permission: "products.manage" }, async ({ params, auth }) =>
  deleteProduct(auth, idParam(params)),
);
