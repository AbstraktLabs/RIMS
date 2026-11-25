import { parseBody, tenantRoute } from "@/lib/api/handler";
import { updateProfileSchema } from "@/lib/validation/auth";
import { updateProfile } from "@/controller/auth/controller";

export const PATCH = tenantRoute({}, async ({ req, auth }) => {
  const input = await parseBody(req, updateProfileSchema);
  return updateProfile(auth.userId, input);
});
