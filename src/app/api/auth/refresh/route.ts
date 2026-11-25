import { NextResponse } from "next/server";
import { errorResponse, publicRoute } from "@/lib/api/handler";
import { REFRESH_COOKIE, clearSessionCookies } from "@/lib/auth/cookies";
import { refresh } from "@/controller/auth/controller";
import { sessionResponse } from "@/controller/auth/respond";

export const POST = publicRoute(async ({ req }) => {
  try {
    return sessionResponse(await refresh(req.cookies.get(REFRESH_COOKIE)?.value));
  } catch (err) {
    const res = errorResponse(err);
    if (res.status === 401 || res.status === 403) {
      const out = new NextResponse(res.body, res);
      clearSessionCookies(out);
      return out;
    }
    return res;
  }
});
