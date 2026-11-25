import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/api/handler";
import { clearPlatformCookie } from "@/lib/auth/cookies";

export const POST = publicRoute(async () => {
  const res = NextResponse.json({ success: true });
  clearPlatformCookie(res);
  return res;
});
