import { parseBody, publicRoute } from "@/lib/api/handler";
import { loginSchema } from "@/lib/validation/auth";
import { clientIp, enforceRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { login } from "@/controller/auth/controller";
import { sessionResponse } from "@/controller/auth/respond";

export const POST = publicRoute(async ({ req }) => {
  const input = await parseBody(req, loginSchema);
  await enforceRateLimit({ scope: "login-ip", identifier: clientIp(req), limit: 30, windowSeconds: 900 });
  await enforceRateLimit({ scope: "login", identifier: input.email, limit: 5, windowSeconds: 900 });
  const result = await login(input, req.headers.get("user-agent"));
  await resetRateLimit("login", input.email);
  return sessionResponse(result);
});
