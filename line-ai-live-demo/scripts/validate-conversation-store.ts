import {
  buildConversationRuntimeStateUpsertRow,
  loadConversationRuntimeState,
  saveConversationRuntimeContextIfCurrent,
  saveConversationRuntimeStateIfCurrent,
} from "../src/lib/conversation-store";
import { applyAuthoritativeConversationTransition, markHumanTakeover } from "../src/lib/conversation-state";
import { getSupabaseServerClient, resetSupabaseDbCircuitBreakerForTests } from "../src/lib/supabase-server";

let passed = 0;

function expect(condition: unknown, label: string) {
  if (!condition) throw new Error(`Failed: ${label}`);
  passed += 1;
}

const retention = "2026-07-24T10:30:00.000Z";

const minimal = buildConversationRuntimeStateUpsertRow(
  "user-1",
  { state_json: { status: "ai_active" } },
  "tenant_001",
);

expect(minimal.line_user_id === "user-1", "upsert row keeps the line user id");
expect(minimal.tenant_id === "tenant_001", "upsert row keeps the tenant id");
expect(typeof minimal.retention_expiry === "string" && minimal.retention_expiry.length > 0, "upsert row always sets retention expiry");
expect("state_json" in minimal && minimal.state_json?.status === "ai_active", "patched state is included in the upsert row");
expect(("context_json" in minimal) === false, "unpatched context_json is omitted so existing data is preserved");

const scoped = buildConversationRuntimeStateUpsertRow(
  "user-2",
  {
    booking_draft_json: { branch: "高雄館" },
    context_json: { introSent: true },
    is_soft_deleted: true,
    retention_expiry: retention,
    soft_deleted_at: retention,
  },
  "tenant_demo",
);

expect(scoped.retention_expiry === retention, "explicit retention expiry is preserved");
expect(scoped.booking_draft_json?.branch === "高雄館", "patched booking draft is included");
expect(scoped.context_json?.introSent === true, "patched context is included");
expect(scoped.is_soft_deleted === true, "soft delete flag is included when patched");
expect(scoped.soft_deleted_at === retention, "soft delete timestamp is included when patched");

const originalFetch = globalThis.fetch;
const previousSupabaseUrl = process.env.SUPABASE_URL;
const previousSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  const requests: Request[] = [];
  process.env.SUPABASE_URL = "https://supabase-cas.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    return new Response(JSON.stringify([{ line_user_id: "user-cas" }]), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  try {
    const saved = await saveConversationRuntimeStateIfCurrent(
      "user-cas",
      { controlRevision: 0, status: "handoff_pending", updatedAt: "2026-08-13T12:00:01.000Z" },
      "2026-08-13T12:00:00.000Z",
      0,
      "tenant_001",
    );
    expect(saved, "compare-and-swap reports a single matching update");
    const requestUrl = requests[0]?.url ?? "";
    expect(requests[0]?.method === "PATCH", "compare-and-swap uses an atomic PATCH");
    expect(requestUrl.includes("state_json-%3E%3EupdatedAt=eq.2026-08-13T12%3A00%3A00.000Z"), "compare-and-swap filters on the state_json lifecycle version");
    expect(requestUrl.includes("state_json-%3E%3EcontrolRevision=eq.0"), "compare-and-swap filters on the staff control epoch");
    expect(requestUrl.includes("tenant_id=eq.tenant_001") && requestUrl.includes("line_user_id=eq.user-cas"), "compare-and-swap remains tenant and user scoped");

    requests.length = 0;
    const contextSaved = await saveConversationRuntimeContextIfCurrent(
      "user-context-cas",
      { contextRevision: 8, recentTurns: [] },
      { timeSlots: [] },
      7,
      "tenant_001",
    );
    expect(contextSaved, "context compare-and-swap reports a single matching update");
    const contextRequestUrl = requests[0]?.url ?? "";
    expect(requests[0]?.method === "PATCH", "context compare-and-swap uses an atomic PATCH");
    expect(contextRequestUrl.includes("context_json-%3E%3EcontextRevision=eq.7"), "context compare-and-swap filters on the dialogue revision");
    expect(contextRequestUrl.includes("tenant_id=eq.tenant_001") && contextRequestUrl.includes("line_user_id=eq.user-context-cas"), "context compare-and-swap remains tenant and user scoped");

    resetSupabaseDbCircuitBreakerForTests();
    let outageFetchCount = 0;
    globalThis.fetch = async (input, init) => {
      outageFetchCount += 1;
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      return new Promise<Response>((_resolve, reject) => {
        const rejectAborted = () => reject(new Error("simulated Supabase outage"));
        if (signal?.aborted) rejectAborted();
        else signal?.addEventListener("abort", rejectAborted, { once: true });
      });
    };
    const outageStartedAt = Date.now();
    await loadConversationRuntimeState("user-outage-1").then(
      () => { throw new Error("Failed: an unavailable Supabase store must reject"); },
      () => undefined,
    );
    const firstOutageElapsedMs = Date.now() - outageStartedAt;
    await loadConversationRuntimeState("user-outage-2").then(
      () => { throw new Error("Failed: an open Supabase circuit must reject"); },
      () => undefined,
    );
    expect(firstOutageElapsedMs < 1_600, "the first failed database request is bounded by the short timeout");
    expect(outageFetchCount === 1, "an open database circuit prevents repeated network calls during the same outage");

    globalThis.fetch = async (input, init) => {
      outageFetchCount += 1;
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.url.includes("conversation_runtime_state") && request.method === "GET") {
        return new Response(JSON.stringify({
          line_user_id: "user-staff-control",
          state_json: {
            controlRevision: 0,
            status: "handoff_pending",
            updatedAt: "2026-08-13T12:00:00.000Z",
            userId: "user-staff-control",
          },
          tenant_id: "tenant_001",
        }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }
      return new Response(JSON.stringify(request.method === "PATCH" ? [{ line_user_id: "user-staff-control" }] : []), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };
    const staffTransition = await applyAuthoritativeConversationTransition(
      "user-staff-control",
      (state) => markHumanTakeover(state, { assignedTo: "Amy" }),
    );
    expect(staffTransition.after.status === "human_active", "staff takeover bypasses an open reply-path circuit and commits durably");
    expect(outageFetchCount === 3, "staff takeover makes its own bounded GET and PATCH after the reply circuit opens");

    const { error: backgroundError } = await getSupabaseServerClient()
      .from("handoff_tasks")
      .select("id")
      .retry(false);
    expect(!backgroundError && outageFetchCount === 4, "the reply-path circuit does not block independent admin persistence requests");
    resetSupabaseDbCircuitBreakerForTests();
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabaseKey;
  }

  console.log(`conversation store validation passed (${passed} checks)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
