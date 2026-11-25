import { tenantRoute } from "@/lib/api/handler";
import { listRoles } from "@/controller/staff/controller";

export const GET = tenantRoute({ permission: ["users.view", "users.manage"] }, async ({ auth }) => listRoles(auth));
