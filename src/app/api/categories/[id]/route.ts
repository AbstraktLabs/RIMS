import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updateCategorySchema } from "@/lib/validation/catalog";
import { deleteCategory, updateCategory } from "@/controller/catalog/categories";

export const PATCH = tenantRoute({ permission: "products.manage" }, async ({ req, params, auth }) =>
  updateCategory(auth, idParam(params), await parseBody(req, updateCategorySchema)),
);

export const DELETE = tenantRoute({ permission: "products.manage" }, async ({ params, auth }) =>
  deleteCategory(auth, idParam(params)),
);
