import { parseBody, publicRoute } from "@/lib/api/handler";
import { registerSchema } from "@/lib/validation/auth";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { register } from "@/controller/auth/controller";
import { sessionResponse } from "@/controller/auth/respond";

export const POST = publicRoute(async ({ req }) => {
  await enforceRateLimit({ scope: "register", identifier: clientIp(req), limit: 5, windowSeconds: 3600 });
  const input = await parseBody(req, registerSchema);
  return sessionResponse(await register(input, req.headers.get("user-agent")), 201);
});
