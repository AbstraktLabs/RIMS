import { parseBody, publicRoute } from "@/lib/api/handler";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resetPassword } from "@/controller/auth/controller";

export const POST = publicRoute(async ({ req }) => {
  const input = await parseBody(req, resetPasswordSchema);
  await enforceRateLimit({ scope: "reset-code", identifier: input.email, limit: 10, windowSeconds: 900 });
  await resetPassword(input);
  return { success: true, message: "Password updated. Please sign in." };
});
