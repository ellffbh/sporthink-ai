import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const token    = req.cookies.get("token")?.value;
  const { pathname } = req.nextUrl;

  // Already-authenticated users visiting /login → send to dashboard
  if (pathname.startsWith("/login") && token) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api).*)"],
};
