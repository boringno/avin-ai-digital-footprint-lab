/**
 * Customer-experience contract for Conversation V2.
 *
 * The V2 canary failed in production not because the state machine was wrong but
 * because the customer-visible layer was incomplete: internal labelled facts were
 * sent verbatim, a named treatment lost its price subject, and an explicit booking
 * request was answered with "I did not understand". Those are the behaviours this
 * script pins, so a future refactor cannot quietly return to them.
 *
 * Everything here is deterministic: no model calls, no network, no Supabase.
 */

import assert from "node:assert/strict";

import { resolveTreatmentKnowledge } from "@/lib/clinic-facts";
import { createStaticClinicFactsProvider } from "@/lib/clinic-facts/static-provider";
import { classifyBookingSpeechAct } from "@/lib/booking-speech-act";
import {
  containsInternalFieldLabel,
  ensureCustomerSafeText,
} from "@/lib/conversation-v2/customer-text-guard";
import { routeConversationTurnV2 } from "@/lib/conversation-v2/engine";
import { hydrateConversationV2ReplyPlan } from "@/lib/conversation-v2/hydrate-reply-plan";
import { createConversationV2State } from "@/lib/conversation-v2/state";
import type { TurnUnderstanding } from "@/lib/conversation-v2/types";
import type { DialogueState } from "@/lib/dialogue-state";
import { legacyDecisionToReplyPlan } from "@/lib/reply-plan";
import { renderReplyPlan } from "@/lib/reply-renderer";

const FOOTER_FREE_FALLBACK = "這項療程的細節我想再幫您確認清楚一點。";

function checked(label: string, run: () => void) {
  try {
    run();
    console.log(`PASS: ${label}`);
  } catch (error) {
    console.error(`FAIL: ${label}`);
    throw error;
  }
}

/** A: internal field labels must never be treated as customer-safe text. */
function validateInternalFieldLabelsAreRejected() {
  const leaks = [
    "療程名稱：ONDA PRO",
    "ONDA PRO可評估方向：這類通常會先往輪廓緊實方向評估。",
    "ONDA PRO搭配評估理由：脂肪與肌肉型困擾不同。",
    "療程名稱：ONDA PRO\nONDA PRO可評估方向：輪廓緊實。",
  ];
  for (const leak of leaks) {
    assert.equal(
      containsInternalFieldLabel(leak),
      true,
      `internal field label must be detected: ${leak}`,
    );
    assert.equal(
      ensureCustomerSafeText(leak, FOOTER_FREE_FALLBACK),
      FOOTER_FREE_FALLBACK,
      "a leaked field label must be replaced by approved copy",
    );
  }
}

/** A: legitimate clinic copy must survive the guard untouched. */
function validateApprovedCopyIsNotBlocked() {
  const approved = [
    "ONDA Pro 超微波採用 Coolwaves® 高頻能量技術，可協助局部脂肪管理與緊緻拉提。",
    "如果您在意肉肉的雙下巴、嘴邊肉或下顎線不明顯，ONDA Pro 可作為評估方向。",
    "我先接著 ONDA PRO 繼續說明 😊 您最想改善哪個部位或困擾呢？",
    // A colon inside ordinary copy must not trip the guard.
    "提醒您：實際成效仍需由醫師現場評估。",
  ];
  for (const text of approved) {
    assert.equal(
      containsInternalFieldLabel(text),
      false,
      `approved customer copy must not be flagged: ${text}`,
    );
    assert.equal(
      ensureCustomerSafeText(text, FOOTER_FREE_FALLBACK),
      text,
      "approved customer copy must pass through unchanged",
    );
  }
}

/**
 * A: the resolver must expose customer-visible copy separately from labelled facts,
 * so a deterministic fallback can be built without leaking internal formatting.
 */
async function validateResolverSeparatesCustomerCopyFromFacts() {
  const snapshot = await createStaticClinicFactsProvider()
    .loadSnapshot({ now: new Date("2026-08-24T12:00:00+08:00"), tenantId: "tenant_001" });
  const resolution = resolveTreatmentKnowledge(snapshot, {
    mode: "introduction",
    query: {
      approvedFactIds: [],
      areaKeys: [],
      concernKeys: [],
      treatmentKeys: ["onda_pro"],
    },
  });

  assert.ok(resolution.facts.length > 0, "ONDA must resolve internal facts");
  assert.ok(
    resolution.facts.some((fact) => containsInternalFieldLabel(fact)),
    "internal facts are expected to carry field labels; that is why they are model-only",
  );
  assert.ok(
    resolution.customerIntroReplies.length > 0,
    "ONDA must expose approved customer-visible copy",
  );
  for (const reply of resolution.customerIntroReplies) {
    assert.equal(
      containsInternalFieldLabel(reply),
      false,
      `customer copy must never carry a field label: ${reply}`,
    );
  }
}

/**
 * A (integration): the deterministic text that actually leaves the hydrate step must
 * be customer-safe.
 *
 * This is the assertion that would have caught the production canary failure: the
 * unit-level guard and resolver tests both passed while `hydrate-reply-plan` still
 * joined labelled facts into `fallbackText`.
 */
async function validateHydratedFallbackIsCustomerSafe() {
  const now = new Date("2026-08-24T12:00:00+08:00");
  const at = now.toISOString();
  const snapshot = await createStaticClinicFactsProvider()
    .loadSnapshot({ now, tenantId: "tenant_001" });
  const state = createConversationV2State({ episodeId: "episode-cx", now: at });
  const turn: TurnUnderstanding = {
    areas: [],
    concerns: [],
    confidence: 1,
    conversationMove: "start",
    dialogueReference: "explicit",
    questionAspect: "overview",
    receivedAt: at,
    speechAct: "learn_treatment",
    text: "我想了解 ONDA",
    treatments: [{
      confidence: 1,
      key: "onda_pro",
      polarity: "affirmed",
      resolution: "resolved",
    }],
    turnId: "cx-1",
  };

  const routed = routeConversationTurnV2(state, turn);
  assert.ok(routed.result, "an explicit treatment turn must produce a policy result");
  const hydrated = await hydrateConversationV2ReplyPlan({
    nextState: routed.nextState,
    result: routed.result,
    snapshot,
    turn,
  });
  const plan = hydrated.rendererPlan;
  assert.ok(plan, "a resolved treatment turn must produce a renderer plan");
  assert.ok(plan.fallbackText.trim(), "deterministic fallback text must not be blank");
  assert.equal(
    containsInternalFieldLabel(plan.fallbackText),
    false,
    `hydrated fallback text must not leak internal field labels: ${plan.fallbackText}`,
  );
  // The labelled facts must still reach the model as grounding.
  assert.ok(
    plan.approvedFacts.some((fact) => containsInternalFieldLabel(fact)),
    "labelled facts must still be supplied to the model as approvedFacts",
  );
}

/**
 * C: booking intent is parsed deterministically, so it must not depend on the model.
 * "我要預約諮詢" has to be an explicit create; "怎麼預約" is only a question and must
 * not start collecting personal data.
 */
function validateBookingSpeechActIsDeterministic() {
  const cases: Array<[string, string]> = [
    ["我要預約諮詢", "create"],
    ["我想預約", "create"],
    ["怎麼預約", "inquiry"],
    ["怎麼取消", "inquiry"],
    ["我要改預約", "modify"],
    ["我只是想了解，不是要預約", "none"],
  ];
  for (const [message, expected] of cases) {
    assert.equal(
      classifyBookingSpeechAct(message),
      expected,
      `booking speech act for "${message}" must be ${expected}`,
    );
  }
}

/**
 * D: when generation fails after the customer has already supplied context, the
 * renderer must use the planned next question before a generic fallback menu.
 */
async function validateContextualRendererFallbackOrder() {
  const repeated = "我先接著了解您的需求。您目前最在意的部位或困擾是什麼呢？";
  const nextQuestion = "您比較在意雙下巴的脂肪厚度，還是下顎線鬆弛呢？";
  const plan = legacyDecisionToReplyPlan({
    decisionType: "treatment_intro_reply",
    matchedKey: "conversation_v2:test_contextual_fallback",
    matchedType: "config",
    replyText: repeated,
  }, {
    concernKeys: ["jawline_looseness"],
    fallbackText: repeated,
    knownNeeds: ["雙下巴"],
    nextQuestion,
    renderMode: "generated",
    treatmentKeys: ["onda_pro"],
  });
  const dialogueState: DialogueState = {
    answeredTopics: [],
    areaKeys: ["jawline"],
    bookingAction: null,
    bookingIntent: "none",
    concernKeys: ["jawline_looseness"],
    dialogueAct: "answer_followup",
    episodeId: "episode-renderer-order",
    handoffStatus: "ai_active",
    knownNeeds: [{ key: "jawline_looseness", kind: "concern", source: "explicit" }],
    lastTransitionAt: "2026-08-24T12:00:00+08:00",
    primaryConcernKey: "jawline_looseness",
    schemaVersion: 1,
    topic: "treatment",
    treatmentKeys: ["onda_pro"],
  };
  const rendered = await renderReplyPlan({
    customerMessage: "雙下巴",
    dialogueState,
    generator: async () => null,
    includeFooter: false,
    plan,
    recentTurns: [{ role: "assistant", text: repeated }],
  });

  assert.equal(rendered.renderMode, "fallback", "an unavailable generator must use guarded fallback");
  assert.ok(
    rendered.replyText.includes(nextQuestion),
    `contextual next question must win before a generic fallback: ${rendered.replyText}`,
  );
  assert.ok(
    !rendered.replyText.includes("療程內容、價格，還是安排諮詢"),
    "renderer must not restart with the generic menu after context is known",
  );
}

async function main() {
  checked("A1 internal field labels are rejected", validateInternalFieldLabelsAreRejected);
  checked("A2 approved customer copy is not blocked", validateApprovedCopyIsNotBlocked);
  await (async () => {
    try {
      await validateResolverSeparatesCustomerCopyFromFacts();
      console.log("PASS: A3 resolver separates customer copy from internal facts");
    } catch (error) {
      console.error("FAIL: A3 resolver separates customer copy from internal facts");
      throw error;
    }
  })();
  await (async () => {
    try {
      await validateHydratedFallbackIsCustomerSafe();
      console.log("PASS: A4 hydrated deterministic fallback is customer-safe");
    } catch (error) {
      console.error("FAIL: A4 hydrated deterministic fallback is customer-safe");
      throw error;
    }
  })();
  checked("C1 booking speech act is deterministic", validateBookingSpeechActIsDeterministic);
  await (async () => {
    try {
      await validateContextualRendererFallbackOrder();
      console.log("PASS: D1 contextual renderer fallback is tried before generic copy");
    } catch (error) {
      console.error("FAIL: D1 contextual renderer fallback is tried before generic copy");
      throw error;
    }
  })();
  console.log("Conversation V2 customer-experience validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
