import { parseBody, tenantRoute } from "@/lib/api/handler";
import { REFRESH_COOKIE } from "@/lib/auth/cookies";
import { switchLocationSchema } from "@/lib/validation/auth";
import { forbidden } from "@/lib/errors";
import { refresh } from "@/controller/auth/controller";
import { sessionResponse } from "@/controller/auth/respond";

// Switching location re-issues tokens so the new location's role and
// permissions apply immediately.
export const POST = tenantRoute({}, async ({ req, auth }) => {
  const { locationId } = await parseBody(req, switchLocationSchema);
  const result = await refresh(req.cookies.get(REFRESH_COOKIE)?.value, locationId);
  if (result.session.claims.userId !== auth.userId) throw forbidden();
  return sessionResponse(result);
});
