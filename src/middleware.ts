import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that don't require authentication
const publicPaths = ["/login", "/api/"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Check for Supabase auth token in cookies
  const sbAccessToken = request.cookies.get("sb-access-token")?.value;
  const sbRefreshToken = request.cookies.get("sb-refresh-token")?.value;

  // Also check the new cookie format: sb-<project-ref>-auth-token
  const hasAuthCookie = Array.from(request.cookies.getAll()).some(
    (c) => c.name.includes("-auth-token") || c.name === "sb-access-token"
  );

  if (!sbAccessToken && !hasAuthCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
