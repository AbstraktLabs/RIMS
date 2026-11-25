import { NextResponse } from "next/server";
import { setSessionCookies } from "@/lib/auth/cookies";
import { ACCESS_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { publicSession, type SessionInfo } from "./session";

/** JSON body with the access token + session, and the refresh cookie set. */
export function sessionResponse(
  result: { accessToken: string; refreshToken: string; session: SessionInfo },
  status = 200,
) {
  const res = NextResponse.json(
    { accessToken: result.accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS, ...publicSession(result.session) },
    { status },
  );
  setSessionCookies(res, result.refreshToken, result.session.organization.slug);
  return res;
}
