import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

type ActivateBody = {
  accessToken?: string;
  password?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ActivateBody;
  const accessToken = body.accessToken?.trim() ?? "";
  const password = body.password ?? "";

  if (!accessToken || password.length < 8) {
    return NextResponse.json({ error: "請使用有效邀請連結，並設定至少 8 碼的密碼。", ok: false }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) {
    return NextResponse.json({ error: "此邀請連結已失效，請聯絡診所管理者重新寄送。", ok: false }, { status: 401 });
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff_users")
    .select("id")
    .eq("auth_user_id", authData.user.id)
    .eq("is_active", true)
    .maybeSingle<{ id: string }>();
  if (staffError || !staff) {
    return NextResponse.json({ error: "此帳號目前沒有可用的後台權限，請聯絡診所管理者。", ok: false }, { status: 403 });
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(authData.user.id, { password });
  if (updateError) {
    return NextResponse.json({ error: "設定密碼失敗，請稍後再試或聯絡系統管理者。", ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
