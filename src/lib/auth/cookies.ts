import { NextResponse } from "next/server";
import { REFRESH_TOKEN_TTL_SECONDS, SUPER_ADMIN_TOKEN_TTL_SECONDS } from "./tokens";

export const REFRESH_COOKIE = "rims_refresh";
export const SESSION_MARKER_COOKIE = "rims_session"; // non-sensitive, read by proxy.ts
export const TENANT_COOKIE = "rims_tenant"; // tenant slug, non-sensitive, read by proxy.ts
export const PLATFORM_COOKIE = "rims_platform";

const secure = process.env.NODE_ENV === "production";

export function setSessionCookies(res: NextResponse, refreshToken: string, slug: string) {
  // refresh token is only ever sent to the auth endpoints
  res.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
  res.cookies.set(SESSION_MARKER_COOKIE, "1", {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
  res.cookies.set(TENANT_COOKIE, slug, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.set(REFRESH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
  res.cookies.set(SESSION_MARKER_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(TENANT_COOKIE, "", { path: "/", maxAge: 0 });
}

export function setPlatformCookie(res: NextResponse, token: string) {
  res.cookies.set(PLATFORM_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: SUPER_ADMIN_TOKEN_TTL_SECONDS,
  });
}

export function clearPlatformCookie(res: NextResponse) {
  res.cookies.set(PLATFORM_COOKIE, "", { path: "/", maxAge: 0 });
}
