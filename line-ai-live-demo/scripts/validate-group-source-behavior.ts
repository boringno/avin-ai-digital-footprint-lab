type RecordedCall = {
  op: "delete" | "insert" | "select" | "update" | "upsert";
  table: string;
};

type WebhookResult = {
  aiModel?: string;
  aiTokensIn?: number;
  aiTokensOut?: number;
  bookingDraft: {
    branch?: string;
    isFirstVisit?: "no" | "unknown" | "yes";
    name?: string;
    phone?: string;
    requestedTimeSlots?: string[];
    timeSlots: string[];
    treatment?: string;
  };
  conversationStatus: string;
  handoffReason: null | string;
  decision: { decisionType: string; matchedKey: string; matchedType: string; replyText: string };
  eventType: string;
  messageId: string;
  messageText: string;
  replyPayload: null;
  replyToken: string;
  sourceGroupId: string;
  sourceRoomId: string;
  sourceType: string;
  sourceUserId: string;
  usedAiHumanizer: boolean;
  usedAiReplyGenerator: boolean;
  webhookEventId: string;
};

const calls: RecordedCall[] = [];
const originalFetch = globalThis.fetch;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function result(overrides: Partial<WebhookResult> = {}): WebhookResult {
  return {
    bookingDraft: { timeSlots: [] },
    conversationStatus: "ai_active",
    handoffReason: null,
    decision: {
      decisionType: "fallback_reply",
      matchedKey: "generic_fallback",
      matchedType: "generic_fallback",
      replyText: "測試回覆",
    },
    eventType: "message",
    messageId: "message-test",
    messageText: "測試訊息",
    replyPayload: null,
    replyToken: "reply-test",
    sourceGroupId: "",
    sourceRoomId: "",
    sourceType: "user",
    sourceUserId: "U-direct-test",
    usedAiHumanizer: false,
    usedAiReplyGenerator: false,
    webhookEventId: "event-test",
    ...overrides,
  };
}

function operationFor(method: string, headers: Headers) {
  if (method === "GET" || method === "HEAD") return "select" as const;
  if (method === "PATCH") return "update" as const;
  if (method === "DELETE") return "delete" as const;
  return headers.get("prefer")?.includes("resolution=merge-duplicates") ? "upsert" as const : "insert" as const;
}

function tableFor(url: URL) {
  const marker = "/rest/v1/";
  const index = url.pathname.indexOf(marker);
  return index === -1 ? "" : decodeURIComponent(url.pathname.slice(index + marker.length));
}

function supabaseResponse(table: string, method: string) {
  if (method !== "POST") return [];
  if (table === "conversations") return [{ display_name: null, id: "conversation-test", lead_stage: "booking_intent" }];
  if (table === "conversation_messages") return [{ id: "message-row-test" }];
  return [];
}

function resetCalls() {
  calls.splice(0, calls.length);
}

function tableHas(table: string, operations: RecordedCall["op"][]) {
  return calls.some((call) => call.table === table && operations.includes(call.op));
}

function tableLacks(table: string, operations: RecordedCall["op"][]) {
  return !tableHas(table, operations);
}

async function main() {
  // Values are inert test sentinels used only by the in-memory fetch boundary;
  // no .env file is loaded or read, and every request is intercepted below.
  process.env.SUPABASE_URL = "https://supabase.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.LINE_CHANNEL_ACCESS_TOKEN = "test-line-access-token";

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);

    if (url.hostname === "supabase.invalid") {
      const table = tableFor(url);
      calls.push({ op: operationFor(request.method, request.headers), table });
      return new Response(JSON.stringify(supabaseResponse(table, request.method)), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }

    if (url.hostname === "api.line.me") {
      return new Response(JSON.stringify({ displayName: "測試使用者", groupName: "測試群組" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }

    throw new Error(`Unexpected external request: ${request.url}`);
  };

  const [{ syncWebhookResultsToAdminDb }, { filterDirectMessageResults }] = await Promise.all([
    import("../src/lib/admin-webhook-sync"),
    import("../src/lib/line-webhook"),
  ]);

  async function sync(results: WebhookResult[]) {
    await syncWebhookResultsToAdminDb({ loggedAt: "2026-07-31T00:00:00.000Z", replyResults: [], results });
  }

  async function groupCase(name: string, groupResult: WebhookResult, expectGroupCapture: boolean) {
    resetCalls();
    await sync([groupResult]);
    assert(tableLacks("conversations", ["insert", "update", "upsert"]), `${name}: group/room wrote conversations`);
    assert(tableLacks("conversation_messages", ["insert"]), `${name}: group/room wrote messages`);
    assert(tableLacks("handoff_tasks", ["insert", "update"]), `${name}: group/room created or refreshed handoff`);
    assert(tableLacks("booking_leads_db", ["insert", "update", "upsert"]), `${name}: group/room wrote booking lead`);
    assert(
      expectGroupCapture ? tableHas("line_group_sources", ["upsert"]) : tableLacks("line_group_sources", ["upsert"]),
      `${name}: group source capture expectation failed`,
    );
    console.log(`PASS: ${name}`);
  }

  await groupCase("B1 group with userId and existing-customer-like ID", result({
    sourceGroupId: "group-b1",
    sourceType: "group",
    sourceUserId: "U-existing-conversation",
  }), true);
  await groupCase("B2 group without userId", result({ sourceGroupId: "group-b2", sourceType: "group", sourceUserId: "" }), true);
  await groupCase("B3 room with userId", result({ sourceRoomId: "room-b3", sourceType: "room" }), false);
  await groupCase("B4 postoperative-risk text from group", result({
    decision: { decisionType: "handoff_pending", matchedKey: "post_procedure_issue", matchedType: "handoff_rule", replyText: "" },
    messageText: "打完肉毒臉腫起來了",
    sourceGroupId: "group-b4",
    sourceType: "group",
  }), true);

  resetCalls();
  await sync([result({
    bookingDraft: { timeSlots: [], treatment: "肉毒" },
    decision: { decisionType: "booking_intake_reply", matchedKey: "booking_intake", matchedType: "guided_reply", replyText: "" },
    messageText: "想預約肉毒",
  })]);
  assert(tableHas("conversations", ["upsert"]), "B5: direct user did not write conversation");
  assert(tableHas("conversation_messages", ["insert"]), "B5: direct user did not insert customer message");
  console.log("PASS: B5 direct user remains eligible for conversation and message persistence");

  const mixed = filterDirectMessageResults([
    result({ sourceGroupId: "group-b6a", sourceType: "group" }),
    result({ sourceRoomId: "room-b6b", sourceType: "room" }),
    result({ sourceType: "user", sourceUserId: "U-b6-direct" }),
  ]);
  assert(mixed.length === 1 && mixed[0]?.sourceType === "user", "B6: Sheets input must retain only one direct user result");
  console.log("PASS: B6 mixed batch passes one direct user result to Sheets filtering");

  const groupsOnly = filterDirectMessageResults([
    result({ sourceGroupId: "group-b7a", sourceType: "group" }),
    result({ sourceRoomId: "room-b7b", sourceType: "room" }),
  ]);
  assert(groupsOnly.length === 0, "B7: all-group batch must produce an empty Sheets input");
  console.log("PASS: B7 all-group batch produces empty Sheets input without error");

  console.log("Group source behavior validation passed: 7 cases");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
  });
