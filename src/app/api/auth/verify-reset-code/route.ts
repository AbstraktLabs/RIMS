import { parseBody, publicRoute } from "@/lib/api/handler";
import { verifyResetCodeSchema } from "@/lib/validation/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyResetCode } from "@/controller/auth/controller";

export const POST = publicRoute(async ({ req }) => {
  const input = await parseBody(req, verifyResetCodeSchema);
  await enforceRateLimit({ scope: "reset-code", identifier: input.email, limit: 10, windowSeconds: 900 });
  await verifyResetCode(input);
  return { success: true };
});
