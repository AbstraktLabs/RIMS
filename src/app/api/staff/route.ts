import { created, parseBody, parseQuery, tenantRoute } from "@/lib/api/handler";
import { createStaffSchema, listStaffQuery } from "@/lib/validation/staff";
import { createStaff, listStaff } from "@/controller/staff/controller";

export const GET = tenantRoute({ permission: "users.view" }, async ({ req, auth }) =>
  listStaff(auth, parseQuery(req, listStaffQuery)),
);

export const POST = tenantRoute({ permission: "users.manage" }, async ({ req, auth }) =>
  created(await createStaff(auth, await parseBody(req, createStaffSchema))),
);
