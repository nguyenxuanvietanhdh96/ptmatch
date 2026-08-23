import { NextRequest, NextResponse } from "next/server";

/**
 * Route guard for logged-in areas.
 *
 * This is a UX redirect, not a security boundary: the `pt_session` cookie is
 * written by the browser (see lib/auth.ts) and can be forged. Every protected
 * page still gets its data from the API, which authorises the Bearer token.
 * What this buys us is not rendering a dashboard shell that is about to 401.
 */
const COOKIE_NAME = "pt_session";

interface Session {
  role: string;
  expiry: number;
}

function parseSession(value: string | undefined): Session | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 0) return null;
  const expiry = Number(value.slice(separator + 1));
  if (!Number.isFinite(expiry)) return null;
  return { role: value.slice(0, separator), expiry };
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest) {
  const session = parseSession(request.cookies.get(COOKIE_NAME)?.value);
  if (!session || session.expiry * 1000 <= Date.now()) {
    return redirectToLogin(request);
  }
  // The dashboard is PT-only; send a trainee to their own area instead.
  if (request.nextUrl.pathname.startsWith("/dashboard") && session.role !== "pt") {
    return NextResponse.redirect(new URL("/account/favorites", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard", "/account/:path*"],
};
