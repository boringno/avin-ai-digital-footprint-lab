import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE, canViewReports, getAdminStaffFromAccessToken } from "@/lib/admin-auth";
import { buildAdminLoginRateLimitKeys, clearAdminLoginFailures, isAdminLoginRateLimited, recordAdminLoginFailure } from "@/lib/admin-login-protection";
import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";

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

  const rateLimitKeys = buildAdminLoginRateLimitKeys(email, request);
  try {
    if (await isAdminLoginRateLimited(rateLimitKeys)) {
      return NextResponse.redirect(buildLoginRedirect(request, "too_many_attempts"), { status: 303 });
    }
  } catch (error) {
    await reportOperationalError({ alert: true, error, source: "admin_login_rate_limit_check" });
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
    try {
      const isNowBlocked = await recordAdminLoginFailure(rateLimitKeys);
      return NextResponse.redirect(buildLoginRedirect(request, isNowBlocked ? "too_many_attempts" : "invalid_credentials"), { status: 303 });
    } catch (recordError) {
      await reportOperationalError({ alert: true, error: recordError, source: "admin_login_rate_limit_record" });
      return NextResponse.redirect(buildLoginRedirect(request, "invalid_credentials"), { status: 303 });
    }
  }

  const staff = await getAdminStaffFromAccessToken(data.session.access_token);
  if (!staff) {
    return NextResponse.redirect(new URL("/admin/forbidden", request.url), { status: 303 });
  }

  // A successful admin login should clear any prior failure window for the same key hashes.
  try {
    await clearAdminLoginFailures(rateLimitKeys);
  } catch (error) {
    await reportOperationalError({ alert: true, error, source: "admin_login_rate_limit_reset" });
  }

  // Login telemetry is operational only; a failed timestamp update must not block access.
  await supabase
    .from("staff_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", staff.id)
    .eq("tenant_id", staff.tenantId);

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
