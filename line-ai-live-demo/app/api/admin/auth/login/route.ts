import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, canViewReports, getAdminStaffFromAccessToken } from "@/lib/admin-auth";
import { getRuntimeConfig } from "@/lib/live-demo-config";

export const runtime = "nodejs";

function buildLoginRedirect(request: Request, error?: string) {
  const url = new URL("/admin/login", request.url);
  if (error) {
    url.searchParams.set("error", error);
  }
  return url;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let email = "";
  let password = "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { email?: string; password?: string };
    email = body.email ?? "";
    password = body.password ?? "";
  } else {
    const formData = await request.formData();
    email = String(formData.get("email") ?? "");
    password = String(formData.get("password") ?? "");
  }

  if (!email || !password) {
    return NextResponse.redirect(buildLoginRedirect(request, "missing_credentials"), { status: 303 });
  }

  const config = getRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    return NextResponse.redirect(buildLoginRedirect(request, "supabase_not_configured"), { status: 303 });
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    return NextResponse.redirect(buildLoginRedirect(request, "invalid_credentials"), { status: 303 });
  }

  const staff = await getAdminStaffFromAccessToken(data.session.access_token);
  if (!staff) {
    return NextResponse.redirect(new URL("/admin/forbidden", request.url), { status: 303 });
  }

  const landingPath = staff.role === "analyst" && canViewReports(staff.role) ? "/admin/reports" : "/admin/workbench";
  const response = NextResponse.redirect(new URL(landingPath, request.url), { status: 303 });
  response.cookies.set(ADMIN_ACCESS_COOKIE, data.session.access_token, {
    httpOnly: true,
    maxAge: data.session.expires_in,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  if (data.session.refresh_token) {
    response.cookies.set(ADMIN_REFRESH_COOKIE, data.session.refresh_token, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
