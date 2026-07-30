import crypto from "node:crypto";

import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

const LOGIN_TENANT_ID = "tenant_001";
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const BLOCK_SECONDS = 15 * 60;

type AdminLoginAttemptResetPatch = {
  blocked_until: null;
  failure_count: number;
  window_started_at: string;
};

export function buildAdminLoginRateLimitKeys(email: string, request: Request) {
  const config = getRuntimeConfig();
  if (!config.supabaseServiceRoleKey) {
    return [];
  }

  const normalizedEmail = email.trim().toLowerCase();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const source = forwardedFor || request.headers.get("x-real-ip")?.trim() || "";
  return [
    normalizedEmail ? hashLoginKey("email", normalizedEmail, config.supabaseServiceRoleKey) : "",
    source ? hashLoginKey("source", source, config.supabaseServiceRoleKey) : "",
  ].filter(Boolean);
}

export async function isAdminLoginRateLimited(keyHashes: string[]) {
  if (!hasSupabaseServerConfig() || keyHashes.length === 0) {
    return false;
  }
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_admin_login_rate_limited", {
    p_key_hashes: keyHashes,
    p_tenant_id: LOGIN_TENANT_ID,
  });
  if (error) {
    throw new Error("Unable to check admin login rate limit.");
  }
  return data === true;
}

export async function recordAdminLoginFailure(keyHashes: string[]) {
  if (!hasSupabaseServerConfig() || keyHashes.length === 0) {
    return false;
  }
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_admin_login_failure", {
    p_block_seconds: BLOCK_SECONDS,
    p_key_hashes: keyHashes,
    p_max_failures: MAX_FAILURES,
    p_tenant_id: LOGIN_TENANT_ID,
    p_window_seconds: LOGIN_WINDOW_SECONDS,
  });
  if (error) {
    throw new Error("Unable to record admin login failure.");
  }
  return data === true;
}

export function buildAdminLoginResetPatch(now = new Date()): AdminLoginAttemptResetPatch {
  return {
    blocked_until: null,
    failure_count: 0,
    window_started_at: now.toISOString(),
  };
}

export async function clearAdminLoginFailures(keyHashes: string[]) {
  if (!hasSupabaseServerConfig() || keyHashes.length === 0) {
    return;
  }
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("admin_login_attempts")
    .update(buildAdminLoginResetPatch())
    .eq("tenant_id", LOGIN_TENANT_ID)
    .in("key_hash", keyHashes);
  if (error) {
    throw new Error("Unable to clear admin login failures.");
  }
}

function hashLoginKey(kind: "email" | "source", value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`admin-login:${kind}:${value}`).digest("hex");
}
