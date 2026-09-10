import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { processWebhookRequestBody } from "../src/lib/line-webhook";
import { routeConversationV2Canary } from "../src/lib/conversation-v2/live-runtime";
import { createStaticClinicFactsProvider } from "../src/lib/clinic-facts/static-provider";
import { loadSeedData } from "../src/lib/seed-loader";
import { loadConversationState, saveConversationState } from "../src/lib/conversation-state";

export async function validateResponseObligationWebhook() {
  const overrides: Record<string, string> = {
    SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "",
    GOOGLE_SHEETS_ENABLED: "false", LIVE_DEMO_SEND_REPLY: "false", OPENAI_NLU_MODE: "off",
    OPENAI_NLU_DECISION_MODE: "off", CONVERSATION_V2_MODE: "off", LINE_CHANNEL_STAGE: "demo",
    LIVE_DEMO_LOG_DIR: await mkdtemp(path.join(os.tmpdir(), "response-obligation-")),
  };
  const prior = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("External network prohibited in obligation regression"); };
  try {
    const seed = await loadSeedData();
    const provider = createStaticClinicFactsProvider({ pricingCampaigns: seed.pricingCampaigns });
    let sequence = 0;
    async function turn(userId: string, text: string) {
      const id = `obligation-${++sequence}`;
      const result = await processWebhookRequestBody(JSON.stringify({ events: [{
        type: "message", webhookEventId: id, replyToken: id,
        source: { type: "user", userId }, message: { type: "text", id, text },
      }] }), {
        includePending: false,
        routeConversationV2: (input) => routeConversationV2Canary(input, {
          factsProvider: provider,
          getCanarySettings: () => ({ mode: "canary", allowlistedUserIds: [userId] }),
          requestFrame: async () => ({ frame: null, errorCode: "nlu_unavailable", latencyMs: 0,
            model: "fixture", promptVersion: "fixture", tokensIn: 0, tokensOut: 0 }),
        }),
        routeLegacy: async () => { throw new Error("V1 must not execute"); },
      });
      assert.ok(result.results[0]);
      return result.results[0];
    }
    function visible(result: Awaited<ReturnType<typeof turn>>) {
      return result.replyPayload?.messages.flatMap((m) => m.type === "text" ? [m.text] : []).join("\n") ?? "";
    }
    const failures: string[] = [];
    async function check(name: string, run: () => Promise<void>) {
      try { await run(); console.log(`PASS ${name}`); }
      catch (error) { failures.push(`${name}: ${error instanceof Error ? error.message : "failed"}`); }
    }
    await check("pregnancy -> pending -> pregnancy + guarantee through webhook", async () => {
      await turn("obligation-pregnancy", "我剛懷孕，可以做皮秒嗎？");
      const before = await loadConversationState("obligation-pregnancy");
      assert.equal(before.status, "handoff_pending");
      const second = await turn("obligation-pregnancy", "我懷孕，皮秒可以保證有效嗎？我要真人");
      assert.match(visible(second), /懷孕、哺乳或備孕期間/u);
      assert.match(visible(second), /不能保證個人效果/u);
      assert.match(visible(second), /真人客服/u);
      assert.equal(second.responseObligationTrace?.originalRouteVersion, "v2");
      assert.equal(second.responseObligationTrace?.handoffSuppression, "preserved_required_content");
      assert.equal(second.responseObligationTrace?.finalIntegrity, "pass");
      assert.equal((await loadConversationState("obligation-pregnancy")).lastHandoffPromptAt, before.lastHandoffPromptAt);
      const emergency = await turn("obligation-pregnancy", "我懷孕而且呼吸困難，我要真人");
      assert.match(visible(emergency), /119.*急診.*不要等待線上回覆/su);
      assert.match(visible(emergency), /懷孕、哺乳或備孕期間/u);
    });
    await check("three offline offers retain refusal and both entries", async () => {
      for (const message of ["肉毒100U周年慶多少錢", "緹奧希1號周年慶多少錢", "ONDA延伸方案多少錢"]) {
        const result = await turn("obligation-offline", message);
        assert.match(visible(result), /不提供該方案的線上報價/u, message);
        assert.doesNotMatch(visible(result), /9,999|11,999|59,999|74,999|149,999/u, message);
        const entries = result.replyPayload?.messages.flatMap((m) => m.type === "text" ? m.quickReply?.items ?? [] : []);
        assert.ok(entries?.some((item) => item.action.label === "查看線上周年慶方案"));
        assert.ok(entries?.some((item) => item.action.label === "真人客服協助"));
        assert.equal(result.conversationStatus, "ai_active");
      }
      const online = await turn("obligation-offline", "查看線上周年慶方案");
      assert.doesNotMatch(visible(online), /線下延伸|艾莉薇|149,999|74,999|59,999/u);
      assert.notEqual(online.conversationStatus, "handoff_pending");
      const human = await turn("obligation-offline", "真人客服協助");
      assert.equal(human.conversationStatus, "handoff_pending");
    });
    await check("pure repeated human request remains short", async () => {
      await turn("obligation-human", "我要真人");
      const before = await loadConversationState("obligation-human");
      const second = await turn("obligation-human", "我要真人");
      assert.match(second.decision.matchedKey, /handoff_suppressed/u);
      assert.equal((await loadConversationState("obligation-human")).lastHandoffPromptAt, before.lastHandoffPromptAt);
      assert.doesNotMatch(visible(second), /懷孕|不能保證個人效果/u);
    });
    await check("control authority remains silent", async () => {
      for (const status of ["human_active", "ai_paused", "closed"] as const) {
        const userId = `obligation-${status}`;
        const state = await loadConversationState(userId);
        await saveConversationState({ ...state, status, manualAiPause: true });
        const result = await turn(userId, "我懷孕而且呼吸困難，我要真人");
        assert.equal(result.replyPayload, null, status);
      }
    });
    assert.deepEqual(failures, [], failures.join("\n"));
  } finally {
    globalThis.fetch = priorFetch;
    for (const key of Object.keys(overrides)) {
      if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
    }
  }
}

if (process.argv[1]?.endsWith("validate-response-obligation-webhook.ts")) {
  validateResponseObligationWebhook().catch((error) => { console.error(error); process.exitCode = 1; });
}
