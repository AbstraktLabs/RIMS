import { NextResponse } from "next/server";
import { parseBody, publicRoute } from "@/lib/api/handler";
import { platformLoginSchema } from "@/lib/validation/auth";
import { setPlatformCookie } from "@/lib/auth/cookies";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import { platformLogin } from "@/controller/platform/controller";

export const POST = publicRoute(async ({ req }) => {
  const { email, password } = await parseBody(req, platformLoginSchema);
  await enforceRateLimit({ scope: "platform-login", identifier: clientIp(req), limit: 10, windowSeconds: 900 });
  const { token, admin } = await platformLogin(email, password);
  const res = NextResponse.json({ admin });
  setPlatformCookie(res, token);
  return res;
});
