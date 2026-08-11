import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Keeps signed-out visitors out of the application shell.
 *
 * Every page under /app is `"use client"` and checks auth only after mounting,
 * so a signed-out visitor typing /app/inbox rendered the whole console —
 * sidebar, headings, empty tables — for as long as the auth check took, then
 * redirected. It leaked no data (the API refuses without a token) but it looks
 * exactly like a broken product, and on a slow connection the flash lasts long
 * enough to read.
 *
 * The token lives in localStorage, which middleware cannot see, so this mirrors
 * it into a cookie at sign-in purely as a presence signal. The cookie is NOT an
 * authentication credential: it is never trusted by the API, and its presence
 * only decides whether to render the shell. Every actual authorization decision
 * is still made server-side against the bearer token.
 */
const PRESENCE_COOKIE = "qano-signed-in";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = request.cookies.get(PRESENCE_COOKIE)?.value === "1";

  if (pathname.startsWith("/app") && !signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // So the user lands back where they were trying to go.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Someone already signed in has no use for the login screen.
  if ((pathname === "/login" || pathname === "/register") && signedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/app/inbox";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/register"],
};
