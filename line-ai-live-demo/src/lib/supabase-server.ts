import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRuntimeConfig } from "@/lib/live-demo-config";

let cachedClient: SupabaseClient | null = null;

export function hasSupabaseServerConfig() {
  const config = getRuntimeConfig();
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

export function getSupabaseServerClient() {
  const config = getRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("Supabase server config is incomplete");
  }

  if (!cachedClient) {
    cachedClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}
