import { parseBody, publicRoute } from "@/lib/api/handler";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/controller/auth/controller";

export const POST = publicRoute(async ({ req }) => {
  const { email } = await parseBody(req, forgotPasswordSchema);
  await enforceRateLimit({ scope: "forgot-ip", identifier: clientIp(req), limit: 10, windowSeconds: 3600 });
  await enforceRateLimit({ scope: "forgot", identifier: email, limit: 3, windowSeconds: 900 });
  await requestPasswordReset(email);
  return { success: true, message: "If an account exists for that email, a reset code has been sent." };
});
