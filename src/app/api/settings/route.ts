import { parseBody, tenantRoute } from "@/lib/api/handler";
import { updateBusinessSchema } from "@/lib/validation/settings";
import { getBusiness, updateBusiness } from "@/controller/settings/controller";

// Every signed-in user needs currency/tax/feature settings to render the app,
// so reading is open to all roles; changing requires settings.manage.
export const GET = tenantRoute({}, async ({ auth }) => getBusiness(auth));

export const PATCH = tenantRoute({ permission: "settings.manage" }, async ({ req, auth }) =>
  updateBusiness(auth, await parseBody(req, updateBusinessSchema)),
);
