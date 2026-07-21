import { NextResponse, type NextRequest } from "next/server";

const ADMIN_ACCESS_COOKIE = "line_ai_admin_access";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAdminSession = Boolean(request.cookies.get(ADMIN_ACCESS_COOKIE)?.value);

  const publicAdminPage =
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/admin/forbidden");
  const publicAuthFlowPage =
    pathname.startsWith("/admin/activate") ||
    pathname.startsWith("/admin/password-reset");

  if (publicAdminPage) {
    if (hasAdminSession) {
      return NextResponse.redirect(new URL("/admin/workbench", request.url));
    }
    return NextResponse.next();
  }

  // Invite and password-reset links must work before, or alongside, an admin session.
  if (publicAuthFlowPage) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (!hasAdminSession) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/api/admin") &&
    !pathname.startsWith("/api/admin/auth/login") &&
    !pathname.startsWith("/api/admin/auth/logout") &&
    !pathname.startsWith("/api/admin/auth/activate") &&
    !pathname.startsWith("/api/admin/auth/request-password-reset")
  ) {
    if (!hasAdminSession) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
