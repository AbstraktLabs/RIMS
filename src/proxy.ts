import { NextResponse, type NextRequest } from "next/server";

// Optimistic routing only — every API call is still authenticated and
// authorised on the server. These cookies carry no secrets.
const SESSION = "rims_session";
const TENANT = "rims_tenant";
const PLATFORM = "rims_platform";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const signedIn = req.cookies.get(SESSION)?.value === "1";
  const slug = req.cookies.get(TENANT)?.value;

  if (pathname.startsWith("/t/")) {
    if (!signedIn) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    // someone else's workspace URL → your own
    const urlSlug = pathname.split("/")[2];
    if (slug && urlSlug && urlSlug !== slug) {
      return NextResponse.redirect(new URL(`/t/${slug}${pathname.slice(3 + urlSlug.length)}`, req.url));
    }
    return NextResponse.next();
  }

  if ((pathname === "/login" || pathname === "/register" || pathname === "/") && signedIn && slug) {
    return NextResponse.redirect(new URL(`/t/${slug}`, req.url));
  }

  if (pathname.startsWith("/platform") && pathname !== "/platform/login" && !req.cookies.get(PLATFORM)) {
    return NextResponse.redirect(new URL("/platform/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/register", "/t/:path*", "/platform/:path*"],
};
