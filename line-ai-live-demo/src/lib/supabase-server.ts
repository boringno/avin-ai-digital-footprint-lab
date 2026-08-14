import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRuntimeConfig } from "@/lib/live-demo-config";

let cachedClient: SupabaseClient | null = null;
let cachedLatencyCriticalClient: SupabaseClient | null = null;

const SUPABASE_DB_TIMEOUT_MS = 800;
const SUPABASE_DURABLE_DB_TIMEOUT_MS = 3_000;
const SUPABASE_DB_CIRCUIT_COOLDOWN_MS = 10_000;
let supabaseDbCircuitOpenUntil = 0;
let supabaseDbHalfOpenProbeInFlight = false;

export class SupabaseDbCircuitOpenError extends Error {
  constructor() {
    super("Supabase database circuit is temporarily open");
    this.name = "SupabaseDbCircuitOpenError";
  }
}

function isPostgrestRequest(input: RequestInfo | URL) {
  const url = input instanceof Request ? input.url : String(input);
  return url.includes("/rest/v1/");
}

function openSupabaseDbCircuit(now = Date.now()) {
  supabaseDbCircuitOpenUntil = now + SUPABASE_DB_CIRCUIT_COOLDOWN_MS;
}

async function guardedSupabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (!isPostgrestRequest(input)) {
    return globalThis.fetch(input, init);
  }

  const now = Date.now();
  const isHalfOpenProbe = supabaseDbCircuitOpenUntil > 0 && now >= supabaseDbCircuitOpenUntil;
  if (supabaseDbCircuitOpenUntil > now || (isHalfOpenProbe && supabaseDbHalfOpenProbeInFlight)) {
    throw new SupabaseDbCircuitOpenError();
  }
  if (isHalfOpenProbe) {
    supabaseDbHalfOpenProbeInFlight = true;
  }

  const abortController = new AbortController();
  const sourceSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const forwardAbort = () => abortController.abort(sourceSignal?.reason);
  if (sourceSignal?.aborted) {
    forwardAbort();
  } else {
    sourceSignal?.addEventListener("abort", forwardAbort, { once: true });
  }
  const timeout = setTimeout(() => abortController.abort(new Error("Supabase database request timed out")), SUPABASE_DB_TIMEOUT_MS);

  try {
    const response = await globalThis.fetch(input, { ...init, signal: abortController.signal });
    if (response.status === 429 || response.status >= 500) {
      openSupabaseDbCircuit();
    } else {
      supabaseDbCircuitOpenUntil = 0;
    }
    return response;
  } catch (error) {
    openSupabaseDbCircuit();
    throw error;
  } finally {
    clearTimeout(timeout);
    sourceSignal?.removeEventListener("abort", forwardAbort);
    if (isHalfOpenProbe) {
      supabaseDbHalfOpenProbeInFlight = false;
    }
  }
}

export function resetSupabaseDbCircuitBreakerForTests() {
  supabaseDbCircuitOpenUntil = 0;
  supabaseDbHalfOpenProbeInFlight = false;
}

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
      db: {
        timeout: SUPABASE_DURABLE_DB_TIMEOUT_MS,
      },
    });
  }

  return cachedClient;
}

/**
 * Use only on the customer reply critical path. Its short timeout and circuit
 * must not suppress independent after-response admin persistence attempts.
 */
export function getLatencyCriticalSupabaseServerClient() {
  const config = getRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("Supabase server config is incomplete");
  }

  if (!cachedLatencyCriticalClient) {
    cachedLatencyCriticalClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        timeout: SUPABASE_DB_TIMEOUT_MS,
      },
      global: {
        fetch: guardedSupabaseFetch,
      },
    });
  }

  return cachedLatencyCriticalClient;
}
