import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updateBrandSchema } from "@/lib/validation/catalog";
import { deleteBrand, updateBrand } from "@/controller/catalog/categories";

export const PATCH = tenantRoute({ permission: "products.manage" }, async ({ req, params, auth }) =>
  updateBrand(auth, idParam(params), await parseBody(req, updateBrandSchema)),
);

export const DELETE = tenantRoute({ permission: "products.manage" }, async ({ params, auth }) =>
  deleteBrand(auth, idParam(params)),
);
