import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/odysseus", "/api/odysseus"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (!isProtected) {
    return NextResponse.next();
  }

  const authCookie = req.cookies.get("odysseus_auth");

  if (!authCookie || authCookie.value !== "1") {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/odysseus/:path*", "/api/odysseus/:path*"],
};
