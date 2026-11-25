import { idParam, parseBody, tenantRoute } from "@/lib/api/handler";
import { updateStaffSchema } from "@/lib/validation/staff";
import { deactivateStaff, getStaff, updateStaff } from "@/controller/staff/controller";

export const GET = tenantRoute({ permission: "users.view" }, async ({ params, auth }) => getStaff(auth, idParam(params)));

export const PATCH = tenantRoute({ permission: "users.manage" }, async ({ req, params, auth }) =>
  updateStaff(auth, idParam(params), await parseBody(req, updateStaffSchema)),
);

export const DELETE = tenantRoute({ permission: "users.manage" }, async ({ params, auth }) =>
  deactivateStaff(auth, idParam(params)),
);
