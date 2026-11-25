import { parseBody, tenantRoute } from "@/lib/api/handler";
import { REFRESH_COOKIE } from "@/lib/auth/cookies";
import { changePasswordSchema } from "@/lib/validation/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { changePassword } from "@/controller/auth/controller";

// Lives under /api/auth so the refresh cookie (path=/api/auth) is available
// and the current device stays signed in while others are signed out.
export const POST = tenantRoute({}, async ({ req, auth }) => {
  const input = await parseBody(req, changePasswordSchema);
  await enforceRateLimit({ scope: "change-password", identifier: auth.userId, limit: 5, windowSeconds: 900 });
  await changePassword(auth.userId, input, req.cookies.get(REFRESH_COOKIE)?.value);
  return { success: true };
});
