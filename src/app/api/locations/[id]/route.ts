import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updateLocationSchema } from "@/lib/validation/settings";
import { deleteLocation, updateLocation } from "@/controller/settings/controller";

export const PATCH = tenantRoute({ permission: "settings.manage" }, async ({ req, params, auth }) =>
  updateLocation(auth, idParam(params), await parseBody(req, updateLocationSchema)),
);

// soft delete (deactivate) — locations are referenced by stock and documents
export const DELETE = tenantRoute({ permission: "settings.manage" }, async ({ params, auth }) =>
  deleteLocation(auth, idParam(params)),
);
