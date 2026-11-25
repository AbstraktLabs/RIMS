import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updateUnitSchema } from "@/lib/validation/settings";
import { deleteUnit, updateUnit } from "@/controller/settings/controller";

export const PATCH = tenantRoute({ permission: "products.manage" }, async ({ req, params, auth }) =>
  updateUnit(auth, idParam(params), await parseBody(req, updateUnitSchema)),
);

export const DELETE = tenantRoute({ permission: "products.manage" }, async ({ params, auth }) =>
  deleteUnit(auth, idParam(params)),
);
