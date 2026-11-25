import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/api/handler";
import { REFRESH_COOKIE, clearSessionCookies } from "@/lib/auth/cookies";
import { logout } from "@/controller/auth/controller";

export const POST = publicRoute(async ({ req }) => {
  await logout(req.cookies.get(REFRESH_COOKIE)?.value);
  const res = NextResponse.json({ success: true });
  clearSessionCookies(res);
  return res;
});
