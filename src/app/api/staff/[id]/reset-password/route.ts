import { idParam, tenantRoute } from "@/lib/api/handler";
import { resetStaffPassword } from "@/controller/staff/controller";

export const POST = tenantRoute({ permission: "users.manage" }, async ({ params, auth }) =>
  resetStaffPassword(auth, idParam(params)),
);
