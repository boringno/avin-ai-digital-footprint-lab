import { NextResponse } from "next/server";

import { getRuntimeConfig } from "@/lib/live-demo-config";
import { reportOperationalError } from "@/lib/monitoring";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const genericResponse = { message: "若此 Email 為啟用中的後台帳號，系統已寄出設定密碼連結。請同時查看垃圾郵件匣。", ok: true };

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json(genericResponse);
  }

  const supabase = getSupabaseServerClient();
  const { data: staff, error: staffError } = await supabase
    .from("staff_users")
    .select("id")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle<{ id: string }>();
  if (staffError) {
    await reportOperationalError({ alert: true, error: staffError, source: "admin_password_reset_staff_lookup" });
    return NextResponse.json(genericResponse);
  }
  if (!staff) {
    return NextResponse.json(genericResponse);
  }

  const config = getRuntimeConfig();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${config.appBaseUrl.replace(/\/$/, "")}/admin/activate`,
  });
  if (error) {
    await reportOperationalError({ alert: true, error, source: "admin_password_reset_email" });
  }

  return NextResponse.json(genericResponse);
}
