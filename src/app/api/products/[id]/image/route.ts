import { idParam, tenantRoute } from "@/lib/api/handler";
import { readImageField } from "@/lib/upload/cloudinary";
import { removeProductImage, uploadProductImage } from "@/controller/catalog/products";

export const POST = tenantRoute({ permission: "products.manage" }, async ({ req, params, auth }) =>
  uploadProductImage(auth, idParam(params), await readImageField(req)),
);

export const DELETE = tenantRoute({ permission: "products.manage" }, async ({ params, auth }) =>
  removeProductImage(auth, idParam(params)),
);
