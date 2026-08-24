import assert from "node:assert/strict";

import {
  createStaticClinicFactsProvider,
  type ClinicFactsProvider,
  type PriceCatalogEntry,
} from "../src/lib/clinic-facts";
import {
  createEmptyConversationContext,
  type ConversationContext,
} from "../src/lib/conversation-context";
import {
  buildConversationV2BookingUnderstanding,
  createConversationV2State,
  parseConversationV2CanaryUserIds,
  routeConversationV2Canary,
} from "../src/lib/conversation-v2";
import type { NluFrame } from "../src/lib/nlu-frame";
import {
  isPendingMedicalContinuation,
  processWebhookRequestBody,
} from "../src/lib/line-webhook";
import { getRuntimeConfig } from "../src/lib/live-demo-config";
import { legacyDecisionToReplyPlan } from "../src/lib/reply-plan";

const NOW = new Date("2026-08-17T12:00:00+08:00");

function frame(overrides: Partial<NluFrame> = {}): NluFrame {
  return {
    areas: [],
    confidence: 0.95,
    concerns: [],
    dialogue: {
      focus: "overview",
      move: "start",
      reference: "explicit",
      speechAct: "learn_treatment",
    },
    intents: ["treatment"],
    negated: [],
    safety: {
      complaint: false,
      humanRequest: false,
      postTreatmentRisk: false,
      pregnancyNursing: false,
    },
    schemaVersion: 2,
    treatments: ["onda_pro"],
    ...overrides,
  };
}

function nluResult(value: NluFrame) {
  return {
    errorCode: null,
    frame: value,
    latencyMs: 5,
    model: "fixture-nlu",
    promptVersion: "fixture-v2",
    tokensIn: 10,
    tokensOut: 5,
  };
}

function campaign(
  customerPriceText = "體驗價 16,888 元",
  id = "onda-live-canary-price",
): PriceCatalogEntry {
  return {
    approval_status: "approved",
    asset_urls: "",
    branch_scope: "all",
    campaign_aliases: "ONDA|ONDA PRO",
    campaign_name: "ONDA 體驗方案",
    customer_price_approval_status: "approved",
    customer_price_text: customerPriceText,
    end_date: "2026-08-31",
    fallback_message: "",
    id,
    is_active: "true",
    notes: "validator",
    price_text: "internal",
    start_date: "2026-08-01",
    treatment_name: "ONDA PRO",
  };
}

function countedProvider(base: ClinicFactsProvider, counts: { provider: number }): ClinicFactsProvider {
  return {
    async loadSnapshot(input) {
      counts.provider += 1;
      return base.loadSnapshot(input);
    },
  };
}

async function main() {
  let passed = 0;
  const check = (condition: unknown, message: string) => {
    assert.ok(condition, message);
    passed += 1;
  };

  const offCounts = { nlu: 0, provider: 0 };
  const off = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-test"),
    eventIdentity: "event-off",
    message: "想了解 ONDA",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-test",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), offCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-test"], mode: "off" }),
    requestFrame: async () => {
      offCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  check(off.kind === "not_eligible" && offCounts.provider === 0 && offCounts.nlu === 0, "C1: off must not load facts or NLU");

  const parsedAllowlist = parseConversationV2CanaryUserIds(" U-one, U-two\nU-one ");
  check(parsedAllowlist.size === 2 && parsedAllowlist.has("U-one") && parsedAllowlist.has("U-two"), "C2: allowlist parser must trim and dedupe exact ids");

  const savedV2Mode = process.env.CONVERSATION_V2_MODE;
  const savedV2Allowlist = process.env.CONVERSATION_V2_CANARY_USER_IDS;
  const savedNluMode = process.env.OPENAI_NLU_MODE;
  const savedNluDecisionMode = process.env.OPENAI_NLU_DECISION_MODE;
  try {
    delete process.env.CONVERSATION_V2_MODE;
    delete process.env.CONVERSATION_V2_CANARY_USER_IDS;
    process.env.OPENAI_NLU_MODE = "off";
    process.env.OPENAI_NLU_DECISION_MODE = "off";
    const defaultRuntime = getRuntimeConfig();
    check(defaultRuntime.conversationV2Mode === "off" && defaultRuntime.conversationV2CanaryUserIds.length === 0, "C3: runtime canary must default to off with an empty allowlist");

    process.env.CONVERSATION_V2_MODE = "canary";
    process.env.CONVERSATION_V2_CANARY_USER_IDS = "U-one,U-two";
    const canaryRuntime = getRuntimeConfig();
    check(canaryRuntime.conversationV2Mode === "canary" && canaryRuntime.conversationV2CanaryUserIds.join(",") === "U-one,U-two", "C4: runtime config must preserve the exact account allowlist");
  } finally {
    if (savedV2Mode === undefined) delete process.env.CONVERSATION_V2_MODE;
    else process.env.CONVERSATION_V2_MODE = savedV2Mode;
    if (savedV2Allowlist === undefined) delete process.env.CONVERSATION_V2_CANARY_USER_IDS;
    else process.env.CONVERSATION_V2_CANARY_USER_IDS = savedV2Allowlist;
    if (savedNluMode === undefined) delete process.env.OPENAI_NLU_MODE;
    else process.env.OPENAI_NLU_MODE = savedNluMode;
    if (savedNluDecisionMode === undefined) delete process.env.OPENAI_NLU_DECISION_MODE;
    else process.env.OPENAI_NLU_DECISION_MODE = savedNluDecisionMode;
  }

  const emptyAllowlistCounts = { nlu: 0, provider: 0 };
  const emptyAllowlist = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-empty"),
    eventIdentity: "event-empty-allowlist",
    message: "想了解 ONDA",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-empty",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), emptyAllowlistCounts),
    getCanarySettings: () => ({ allowlistedUserIds: [], mode: "canary" }),
    requestFrame: async () => {
      emptyAllowlistCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  check(emptyAllowlist.kind === "not_eligible" && emptyAllowlistCounts.provider === 0 && emptyAllowlistCounts.nlu === 0, "C5: an empty canary allowlist must fail closed without facts or NLU");

  const nearMatchCounts = { nlu: 0, provider: 0 };
  const nearMatch = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-one-extra"),
    eventIdentity: "event-near",
    message: "想了解 ONDA",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-one-extra",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), nearMatchCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-one"], mode: "canary" }),
    requestFrame: async () => {
      nearMatchCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  check(nearMatch.kind === "not_eligible" && nearMatchCounts.provider === 0 && nearMatchCounts.nlu === 0, "C3: substring user id must not enter canary");

  const group = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-one"),
    eventIdentity: "event-group",
    message: "想了解 ONDA",
    now: NOW,
    sourceType: "group",
    sourceUserId: "U-one",
  }, {
    getCanarySettings: () => ({ allowlistedUserIds: ["U-one"], mode: "canary" }),
  });
  check(group.kind === "not_eligible", "C4: group source must never enter canary");

  const counts = { nlu: 0, provider: 0 };
  const facts = countedProvider(createStaticClinicFactsProvider({
    pricingCampaigns: [campaign()],
    snapshotId: "snapshot-A",
  }), counts);
  let ontologyTreatmentCount = 0;
  const first = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-canary"),
    eventIdentity: "event-1",
    message: "想了解 ONDA",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-canary",
  }, {
    factsProvider: facts,
    getCanarySettings: () => ({ allowlistedUserIds: ["U-canary"], mode: "canary" }),
    requestFrame: async (_message, context) => {
      counts.nlu += 1;
      ontologyTreatmentCount = context?.ontology?.treatments.length ?? 0;
      return nluResult(frame());
    },
  });
  assert.equal(first.kind, "routed");
  check(counts.provider === 1 && counts.nlu === 1, "C5: one routed turn must load one snapshot and call NLU once");
  check(first.snapshotId === "snapshot-A" && ontologyTreatmentCount > 0, "C6: NLU and hydration must use the same snapshot ontology/id");
  check(first.decision.replyPlan?.dialogueAct === "introduce_treatment", "C7: first treatment turn must introduce instead of fallback");
  check(Boolean(first.decision.nextContext.conversationV2State), "C8: routed turn must project canonical V2 state into context_json payload");

  const delayedReplayContext = structuredClone(first.decision.nextContext);
  delayedReplayContext.lastSeenAt = new Date(NOW.getTime() + 30_000).toISOString();
  const delayedReplayCounts = { nlu: 0, provider: 0 };
  const delayedReplay = await routeConversationV2Canary({
    context: delayedReplayContext,
    eventIdentity: "event-1",
    message: "想了解 ONDA",
    now: new Date(NOW.getTime() + 60_000),
    sourceType: "user",
    sourceUserId: "U-canary",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), delayedReplayCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-canary"], mode: "canary" }),
    requestFrame: async () => {
      delayedReplayCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  assert.equal(delayedReplay.kind, "routed");
  check(
    delayedReplay.decision.matchedKey === "conversation_v2:duplicate_turn" &&
      delayedReplayCounts.provider === 0 &&
      delayedReplayCounts.nlu === 0,
    "C9: rebuilding after a newer V1 turn must preserve old V2 event receipts",
  );

  const followCounts = { nlu: 0, provider: 0 };
  const follow = await routeConversationV2Canary({
    context: first.decision.nextContext,
    eventIdentity: "event-2",
    message: "那價格呢",
    now: new Date(NOW.getTime() + 1000),
    sourceType: "user",
    sourceUserId: "U-canary",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider({
      pricingCampaigns: [campaign()],
      snapshotId: "snapshot-A",
    }), followCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-canary"], mode: "canary" }),
    requestFrame: async () => {
      followCounts.nlu += 1;
      return nluResult(frame({
        dialogue: {
          focus: "price_unspecified",
          move: "continue",
          reference: "active_subject",
          speechAct: "ask_price",
        },
        intents: ["pricing"],
        treatments: [],
      }));
    },
  });
  assert.equal(follow.kind, "routed");
  check(followCounts.provider === 1 && followCounts.nlu === 1, "C9: contextual follow-up must stay on V2 with one call per dependency");
  check(follow.decision.decisionType === "pricing_auto_reply" && follow.decision.replyText.includes("16,888"), "C10: contextual price must resolve from the approved turn snapshot");

  let pinnedProviderCalls = 0;
  const pinned = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-pinned"),
    eventIdentity: "event-pinned-price",
    message: "ONDA 價格多少",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-pinned",
  }, {
    factsProvider: {
      async loadSnapshot(input) {
        pinnedProviderCalls += 1;
        return createStaticClinicFactsProvider({
          pricingCampaigns: [campaign(
            pinnedProviderCalls === 1 ? "快照 A 核准價 88,777 元" : "快照 B 核准價 77,777 元",
            "onda-pinned-snapshot-price",
          )],
          snapshotId: pinnedProviderCalls === 1 ? "snapshot-pinned-A" : "snapshot-pinned-B",
        }).loadSnapshot(input);
      },
    },
    getCanarySettings: () => ({ allowlistedUserIds: ["U-pinned"], mode: "canary" }),
    requestFrame: async () => nluResult(frame({
      dialogue: {
        focus: "price_campaign",
        move: "start",
        reference: "explicit",
        speechAct: "ask_price",
      },
      intents: ["pricing", "treatment"],
    })),
  });
  assert.equal(pinned.kind, "routed");
  check(
    pinnedProviderCalls === 1 &&
      pinned.snapshotId === "snapshot-pinned-A" &&
      pinned.decision.replyText.includes("88,777") &&
      !pinned.decision.replyText.includes("77,777") &&
      !pinned.decision.replyText.includes("16,888"),
    "C11: NLU, policy, and hydration must stay pinned to one distinctive turn snapshot",
  );

  const safetyCounts = { nlu: 0, provider: 0 };
  const safety = await routeConversationV2Canary({
    context: first.decision.nextContext,
    eventIdentity: "event-safety",
    message: "做完後呼吸困難",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-canary",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), safetyCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-canary"], mode: "canary" }),
    requestFrame: async () => {
      safetyCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  assert.equal(safety.kind, "routed");
  check(safety.dataStatus === "preflight" && safetyCounts.provider === 0 && safetyCounts.nlu === 0, "C11: emergency preflight must finish before facts or model calls");
  check(safety.decision.decisionType === "handoff_pending" && safety.decision.replyText.includes("119"), "C12: emergency must preserve deterministic 119 guidance and handoff");

  const medicalPreflightCounts = { nlu: 0, provider: 0 };
  const medicalPreflight = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-medical-preflight"),
    eventIdentity: "event-medical-preflight",
    message: "糖尿病有哪些症狀",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-medical-preflight",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), medicalPreflightCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-medical-preflight"], mode: "canary" }),
    requestFrame: async () => {
      medicalPreflightCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  assert.equal(medicalPreflight.kind, "routed");
  const medicalPreflightReplay = await routeConversationV2Canary({
    context: medicalPreflight.decision.nextContext,
    eventIdentity: "event-medical-preflight",
    message: "糖尿病有哪些症狀",
    now: new Date(NOW.getTime() + 1000),
    sourceType: "user",
    sourceUserId: "U-medical-preflight",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), medicalPreflightCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-medical-preflight"], mode: "canary" }),
    requestFrame: async () => {
      medicalPreflightCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  assert.equal(medicalPreflightReplay.kind, "routed");
  check(
    medicalPreflight.decision.matchedKey === "general_medical_out_of_scope" &&
      medicalPreflight.decision.nextContext.conversationV2State?.processedTurnIds.length === 1 &&
      medicalPreflightReplay.decision.matchedKey === "conversation_v2:duplicate_turn" &&
      medicalPreflightCounts.provider === 0 &&
      medicalPreflightCounts.nlu === 0,
    "C13: every deterministic preflight reply must receipt its event before replay",
  );

  check(
    isPendingMedicalContinuation({
      handoffReason: "post_procedure_issue",
      message: "還是一直痛",
    }),
    "C13: a vague symptom continuation must stay with its pending medical handoff",
  );
  check(
    !isPendingMedicalContinuation({
      handoffReason: "post_procedure_issue",
      message: "還是一直痛，另外 ONDA 價格多少？",
    }),
    "C14: a pending medical handoff must not swallow an explicit new price topic",
  );
  check(
    !isPendingMedicalContinuation({
      handoffReason: "post_procedure_issue",
      message: "肉毒打完還是痛，對了皮秒有什麼副作用？",
    }),
    "C15: a pending medical handoff must not swallow an explicit new treatment question",
  );
  for (const message of [
    "副作用是什麼？",
    "皮秒會不會有副作用？",
    "皮秒可能有什麼副作用？",
  ]) {
    check(
      !isPendingMedicalContinuation({
        handoffReason: "post_procedure_issue",
        message,
      }),
      `C15: a prospective side-effect question must remain an education topic: ${message}`,
    );
  }
  check(
    !isPendingMedicalContinuation({
      handoffReason: "post_procedure_issue",
      message: "還是一直痛，另外我想知道海芙音波的禁忌",
    }),
    "C16: a pending medical handoff must not swallow an unsupported-device question",
  );
  check(
    !isPendingMedicalContinuation({
      handoffReason: "post_procedure_issue",
      message: "還是一直痛，另外可以刷卡嗎？",
    }),
    "C17: an explicit conversational pivot must not freeze a supported FAQ topic",
  );
  for (const message of [
    "還是一直痛，另外有什麼辦法嗎？",
    "還是一直腫，對了怎麼辦？",
    "還是一直不舒服，另外多久會好？",
    "肉毒打完還是痛，另外可以怎麼處理？",
    "肉毒還是一直痛，該怎麼辦？",
    "打肉毒後還是一直痛，怎麼處理？",
    "肉毒注射後還是很腫，有什麼辦法？",
    "肉毒後一直不舒服，多久會好？",
    "手臂活動還是一直痛",
    "活動的時候還是很痛",
    "這個方案打完還是一直痛",
    "還在化膿",
    "還是一直化膿",
    "還是有水泡",
    "仍然有硬塊",
    "還是麻麻的",
    "瘀青還沒退",
    "傷口還在流膿",
    "現在變得不對稱",
  ]) {
    check(
      isPendingMedicalContinuation({
        handoffReason: "post_procedure_issue",
        message,
      }),
      `C18: a discourse connector must not release the same unresolved symptom: ${message}`,
    );
  }

  const pendingCounts = { nlu: 0, provider: 0 };
  const pendingContinuation = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-pending"),
    eventIdentity: "event-pending-continuation",
    message: "還是一直痛",
    now: NOW,
    pendingHandoffReason: "post_procedure_issue",
    sourceType: "user",
    sourceUserId: "U-pending",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), pendingCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-pending"], mode: "canary" }),
    requestFrame: async () => {
      pendingCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  assert.equal(pendingContinuation.kind, "routed");
  check(
    pendingContinuation.decision.matchedKey === "handoff_continuation:post_procedure_issue" &&
      pendingCounts.provider === 0 &&
      pendingCounts.nlu === 0 &&
      pendingContinuation.decision.nextContext.conversationV2State?.processedTurnIds.length === 1,
    "C15: an eligible pending continuation must be receipted before facts or NLU",
  );

  const pendingTopicShiftCounts = { nlu: 0, provider: 0 };
  const pendingTopicShift = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-pending-shift"),
    eventIdentity: "event-pending-topic-shift",
    message: "還是一直痛，另外 ONDA 價格多少？",
    now: NOW,
    pendingHandoffReason: "post_procedure_issue",
    sourceType: "user",
    sourceUserId: "U-pending-shift",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider({
      pricingCampaigns: [campaign()],
      snapshotId: "pending-shift-snapshot",
    }), pendingTopicShiftCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-pending-shift"], mode: "canary" }),
    requestFrame: async () => {
      pendingTopicShiftCounts.nlu += 1;
      return nluResult(frame({
        dialogue: {
          focus: "price_campaign",
          move: "start",
          reference: "explicit",
          speechAct: "ask_price",
        },
        intents: ["pricing", "treatment"],
      }));
    },
  });
  assert.equal(pendingTopicShift.kind, "routed");
  check(
    pendingTopicShift.decision.decisionType === "pricing_auto_reply" &&
      pendingTopicShift.decision.replyText.includes("16,888") &&
      pendingTopicShiftCounts.provider === 1 &&
      pendingTopicShiftCounts.nlu === 1,
    "C16: an explicit new topic must remain routable while a medical handoff is pending",
  );

  const pendingTreatmentShiftCounts = { nlu: 0, provider: 0 };
  let pendingTreatmentRoutingMessage = "";
  const pendingTreatmentShift = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-pending-treatment-shift"),
    eventIdentity: "event-pending-treatment-shift",
    message: "肉毒打完還是痛，對了皮秒有什麼副作用？",
    now: NOW,
    pendingHandoffReason: "post_procedure_issue",
    sourceType: "user",
    sourceUserId: "U-pending-treatment-shift",
  }, {
    factsProvider: countedProvider(
      createStaticClinicFactsProvider({ snapshotId: "pending-treatment-shift-snapshot" }),
      pendingTreatmentShiftCounts,
    ),
    getCanarySettings: () => ({
      allowlistedUserIds: ["U-pending-treatment-shift"],
      mode: "canary",
    }),
    requestFrame: async (message) => {
      pendingTreatmentShiftCounts.nlu += 1;
      pendingTreatmentRoutingMessage = message;
      return nluResult(frame({
        dialogue: {
          focus: "side_effects",
          move: "start",
          reference: "explicit",
          speechAct: "ask_treatment_detail",
        },
        treatments: ["pico"],
      }));
    },
  });
  assert.equal(pendingTreatmentShift.kind, "routed");
  check(
    pendingTreatmentRoutingMessage === "皮秒有什麼副作用" &&
      pendingTreatmentShiftCounts.provider === 1 &&
      pendingTreatmentShiftCounts.nlu === 1 &&
      pendingTreatmentShift.decision.decisionType !== "handoff_pending" &&
      pendingTreatmentShift.decision.nextContext.lastReferencedTreatment === "探索皮秒",
    "C17: a mixed symptom and explicit treatment pivot must route only the new treatment clause",
  );

  for (const [index, message] of [
    "肉毒打完還是痛，另外肉毒部位怎麼腫成這樣？",
    "肉毒打完還是痛，對了肉毒這邊有什麼腫塊？",
    "肉毒打完還是痛，另外肉毒注射處怎麼發熱了？",
    "肉毒打完還是痛，另外肉毒這邊怎麼化膿了？",
    "肉毒打完還是痛，另外肉毒這邊有水泡？",
    "肉毒打完還是痛，另外肉毒這邊麻了？",
    "肉毒打完還是痛，另外肉毒這邊不對稱？",
    "肉毒打完還是痛，另外肉毒這邊凹凸不平？",
    "肉毒打完還是痛，另外肉毒這邊瘀青了？",
    "肉毒打完還是痛，另外肉毒這邊歪了？",
    "肉毒打完還是痛，另外肉毒這邊有硬塊？",
    "肉毒後眼皮下垂多久會好",
    "肉毒打的地方很癢怎麼辦",
    "肉毒打完怎麼會頭暈噁心",
  ].entries()) {
    const symptomCounts = { nlu: 0, provider: 0 };
    const unresolvedSymptom = await routeConversationV2Canary({
      context: createEmptyConversationContext(`U-pending-symptom-${index}`),
      eventIdentity: `event-pending-symptom-${index}`,
      message,
      now: NOW,
      pendingHandoffReason: "post_procedure_issue",
      sourceType: "user",
      sourceUserId: `U-pending-symptom-${index}`,
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), symptomCounts),
      getCanarySettings: () => ({
        allowlistedUserIds: [`U-pending-symptom-${index}`],
        mode: "canary",
      }),
      requestFrame: async () => {
        symptomCounts.nlu += 1;
        return nluResult(frame());
      },
    });
    assert.equal(unresolvedSymptom.kind, "routed");
    check(
      [
        "post_procedure_issue",
        "handoff_continuation:post_procedure_issue",
      ].includes(unresolvedSymptom.decision.matchedKey) &&
        symptomCounts.provider === 0 &&
        symptomCounts.nlu === 0,
      `C18: an unresolved same-treatment symptom must not escape pending handoff: ${message}`,
    );
  }

  function pendingBotoxContext(userId: string) {
    const context = createEmptyConversationContext(userId);
    const state = createConversationV2State({
      episodeId: `fixture-pending-botox:${userId}`,
      now: NOW.toISOString(),
    });
    state.knowledge.treatmentKeys = ["botox"];
    context.conversationV2State = state;
    return context;
  }

  for (const [index, message] of [
    "對了肉毒後眼皮下垂多久會好？",
    "對了肉毒會腫嗎？",
  ].entries()) {
    const counts = { nlu: 0, provider: 0 };
    const result = await routeConversationV2Canary({
      context: pendingBotoxContext(`U-pending-same-treatment-${index}`),
      eventIdentity: `event-pending-same-treatment-${index}`,
      message,
      now: NOW,
      pendingHandoffReason: "post_procedure_issue",
      sourceType: "user",
      sourceUserId: `U-pending-same-treatment-${index}`,
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), counts),
      getCanarySettings: () => ({
        allowlistedUserIds: [`U-pending-same-treatment-${index}`],
        mode: "canary",
      }),
      requestFrame: async () => {
        counts.nlu += 1;
        return nluResult(frame());
      },
    });
    assert.equal(result.kind, "routed");
    check(
      result.decision.matchedKey === "handoff_continuation:post_procedure_issue" &&
        counts.provider === 0 &&
        counts.nlu === 0,
      `C18: the active treatment must keep a same-treatment risk question in its pending handoff: ${message}`,
    );
  }

  for (const [index, message] of [
    "對了皮秒會腫嗎？",
    "皮秒會腫嗎？",
    "皮秒呢？",
    "打皮秒會痛嗎？",
    "哪個館有皮秒？",
    "有週六時段嗎？",
    "週六有空位嗎？",
    "可以幫我排週六嗎？",
  ].entries()) {
    const counts = { nlu: 0, provider: 0 };
    let routedMessage = "";
    const isBookingRequest = message.includes("幫我排");
    const result = await routeConversationV2Canary({
      context: pendingBotoxContext(`U-pending-new-topic-${index}`),
      eventIdentity: `event-pending-new-topic-${index}`,
      message,
      now: NOW,
      pendingHandoffReason: "post_procedure_issue",
      sourceType: "user",
      sourceUserId: `U-pending-new-topic-${index}`,
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), counts),
      getCanarySettings: () => ({
        allowlistedUserIds: [`U-pending-new-topic-${index}`],
        mode: "canary",
      }),
      requestFrame: async (value) => {
        counts.nlu += 1;
        routedMessage = value;
        return nluResult(frame({
          dialogue: {
            focus: message.includes("哪個館") ? "branch_list" : "none",
            move: "start",
            reference: "explicit",
            speechAct: isBookingRequest
              ? "book_consultation"
              : message.includes("館") || message.includes("時段") || message.includes("空位")
                ? "ask_clinic_info"
                : "ask_treatment_detail",
          },
          intents: isBookingRequest
            ? ["booking"]
            : message.includes("館") || message.includes("時段") || message.includes("空位")
              ? ["branch_info"]
              : ["treatment"],
          treatments: message.includes("皮秒") ? ["pico"] : [],
        }));
      },
    });
    assert.equal(result.kind, "routed");
    check(
      routedMessage === message.replace(/^對了/u, "").replace(/[？?]$/u, "") &&
        counts.provider === 1 &&
        counts.nlu === 1 &&
        result.decision.matchedKey !== "handoff_continuation:post_procedure_issue",
      `C18: a provable new treatment or availability topic must escape the pending handoff: ${message}`,
    );
  }

  const pendingFullBookingCounts = { nlu: 0, provider: 0 };
  let pendingFullBookingMessage = "";
  const pendingFullBooking = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-pending-full-booking"),
    eventIdentity: "event-pending-full-booking",
    message: "還是一直痛，另外我要預約皮秒，高雄館，8/20 下午，王小美，0912345678",
    now: NOW,
    pendingHandoffReason: "post_procedure_issue",
    sourceType: "user",
    sourceUserId: "U-pending-full-booking",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), pendingFullBookingCounts),
    getCanarySettings: () => ({
      allowlistedUserIds: ["U-pending-full-booking"],
      mode: "canary",
    }),
    requestFrame: async (message) => {
      pendingFullBookingCounts.nlu += 1;
      pendingFullBookingMessage = message;
      return nluResult(frame({
        dialogue: {
          focus: "none",
          move: "start",
          reference: "explicit",
          speechAct: "book_consultation",
        },
        intents: ["booking", "treatment"],
        treatments: ["pico"],
      }));
    },
  });
  assert.equal(pendingFullBooking.kind, "routed");
  const pendingFullBookingDraft = pendingFullBooking.decision.nextContext.conversationV2State?.bookingTask.draft;
  check(
    pendingFullBookingMessage === "我要預約皮秒，高雄館，8/20 下午，王小美，0912345678" &&
      pendingFullBookingCounts.provider === 1 &&
      pendingFullBookingCounts.nlu === 1 &&
      pendingFullBooking.decision.decisionType === "booking_intake_reply" &&
      pendingFullBookingDraft?.treatmentKeys.includes("pico") &&
      pendingFullBookingDraft.branch === "高雄館" &&
      pendingFullBookingDraft.timeSlots.includes("8/20 下午") &&
      pendingFullBookingDraft.name === "王小美" &&
      pendingFullBookingDraft.phone === "0912345678",
    "C19: a pending-handoff booking pivot must preserve every field in the complete suffix",
  );

  const labeledBookingCounts = { nlu: 0, provider: 0 };
  const labeledBooking = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-pending-labeled-booking"),
    eventIdentity: "event-pending-labeled-booking",
    message: "還是一直痛，另外我要預約皮秒，高雄館，8/20 下午，姓名：王小美",
    now: NOW,
    pendingHandoffReason: "post_procedure_issue",
    sourceType: "user",
    sourceUserId: "U-pending-labeled-booking",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), labeledBookingCounts),
    getCanarySettings: () => ({
      allowlistedUserIds: ["U-pending-labeled-booking"],
      mode: "canary",
    }),
    requestFrame: async () => {
      labeledBookingCounts.nlu += 1;
      return nluResult(frame({
        dialogue: {
          focus: "none",
          move: "start",
          reference: "explicit",
          speechAct: "book_consultation",
        },
        intents: ["booking", "treatment"],
        treatments: ["pico"],
      }));
    },
  });
  assert.equal(labeledBooking.kind, "routed");
  check(
    labeledBookingCounts.provider === 1 &&
      labeledBookingCounts.nlu === 1 &&
      labeledBooking.decision.decisionType === "booking_intake_reply" &&
      labeledBooking.decision.nextContext.conversationV2State?.bookingTask.draft.name === "王小美",
    "C20: a delimiter-separated explicit name label must bypass account lookup and persist exactly its value",
  );

  const explicitBookingNameState = createConversationV2State({
    episodeId: "fixture-explicit-booking-name",
    now: NOW.toISOString(),
  });
  for (const phrase of ["我想先諮詢", "預算有限", "怕痛", "可以嗎"]) {
    const parsed = buildConversationV2BookingUnderstanding({
      message: `我要預約皮秒，高雄館，8/20 下午，${phrase}`,
      state: explicitBookingNameState,
    });
    check(
      !parsed?.fields?.name,
      `C21: arbitrary Chinese prose must not be persisted as a delimited customer name: ${phrase}`,
    );
  }

  const collectingExtractionState = createConversationV2State({
    episodeId: "fixture-booking-extraction",
    now: NOW.toISOString(),
  });
  collectingExtractionState.bookingTask = {
    draft: { timeSlots: [], treatmentKeys: ["pico"] },
    expectedField: "phone",
    id: "fixture-booking-extraction:id",
    intent: "create",
    status: "collecting",
  };
  for (const invalidPhone of [
    "09123456789",
    "+8869123456789",
    "8860912345678",
    "不是0912345678",
    "電話不是0912345678",
  ]) {
    const parsed = buildConversationV2BookingUnderstanding({
      message: invalidPhone,
      state: collectingExtractionState,
    });
    check(!parsed?.fields?.phone, `C21: an invalid or negated phone must not be persisted: ${invalidPhone}`);
  }
  for (const [message, expectedPhone] of [
    ["我的電話不是0912345678，是0987654321", "0987654321"],
    ["不要用0912345678，改0987654321", "0987654321"],
    ["電話：+886 912 345 678", "0912345678"],
  ] as const) {
    const parsed = buildConversationV2BookingUnderstanding({
      message,
      state: collectingExtractionState,
    });
    check(parsed?.fields?.phone === expectedPhone, `C21: phone correction must keep only the final affirmed value: ${message}`);
  }

  for (const [message, expectedName] of [
    ["我要預約皮秒，姓名：王小美", "王小美"],
    ["我要預約皮秒，姓名：王小美。電話：0912345678", "王小美"],
    ["我叫王小美想預約高雄館", "王小美"],
  ] as const) {
    const parsed = buildConversationV2BookingUnderstanding({
      message,
      state: collectingExtractionState,
    });
    check(parsed?.fields?.name === expectedName, `C21: explicit name syntax must persist only the submitted name: ${message}`);
  }
  const refusedStructuredName = buildConversationV2BookingUnderstanding({
    message: "我要預約皮秒，姓名：不方便提供，電話：0912345678",
    state: collectingExtractionState,
  });
  check(
    !refusedStructuredName?.fields?.name &&
      refusedStructuredName?.fields?.phone === "0912345678",
    "C21: a labeled refusal is not a customer name and must remain unfilled",
  );
  for (const phrase of ["王醫師", "謝謝", "謝謝你", "方便的話", "何時方便", "高興就好"]) {
    const parsed = buildConversationV2BookingUnderstanding({
      message: `我要預約皮秒，高雄館，8/20 下午，${phrase}，0912345678`,
      state: collectingExtractionState,
    });
    check(!parsed?.fields?.name, `C21: a title or conversational phrase must not become a name: ${phrase}`);
  }

  for (const [message, assertion] of [
    ["不要高雄館，我要台中館", (value: ReturnType<typeof buildConversationV2BookingUnderstanding>) => value?.fields?.branch === "台中館"],
    ["我要預約皮秒，台中館可以，高雄館太遠", (value: ReturnType<typeof buildConversationV2BookingUnderstanding>) => value?.fields?.branch === "台中館"],
    ["週末不行，平日下午可以", (value: ReturnType<typeof buildConversationV2BookingUnderstanding>) => value?.fields?.timeSlots?.length === 1 && value.fields.timeSlots[0]?.includes("平日下午")],
    ["週末沒空，平日下午可以", (value: ReturnType<typeof buildConversationV2BookingUnderstanding>) => value?.fields?.timeSlots?.length === 1 && value.fields.timeSlots[0]?.includes("平日下午")],
    ["平日無法，週末可以", (value: ReturnType<typeof buildConversationV2BookingUnderstanding>) => value?.fields?.timeSlots?.length === 1 && value.fields.timeSlots[0]?.includes("週末")],
    ["下午有事，晚上可以", (value: ReturnType<typeof buildConversationV2BookingUnderstanding>) => value?.fields?.timeSlots?.length === 1 && value.fields.timeSlots[0]?.includes("晚上")],
    ["不要下午，晚上可以", (value: ReturnType<typeof buildConversationV2BookingUnderstanding>) => value?.fields?.timeSlots?.length === 1 && value.fields.timeSlots[0]?.includes("晚上")],
    ["不要肉毒，我要皮秒", (value: ReturnType<typeof buildConversationV2BookingUnderstanding>) => value?.fields?.treatmentKeys?.join(",") === "pico"],
    ["我不是複診，是初診", (value: ReturnType<typeof buildConversationV2BookingUnderstanding>) => value?.fields?.firstVisit === true],
  ] as const) {
    const parsed = buildConversationV2BookingUnderstanding({
      message,
      state: collectingExtractionState,
    });
    check(assertion(parsed), `C21: only affirmed booking data may survive deterministic extraction: ${message}`);
  }

  function pendingBookingFieldContext(
    expectedField: "name" | "phone",
    userId = `U-pending-${expectedField}`,
    status: "collecting" | "suspended" = "suspended",
  ) {
    const context = createEmptyConversationContext(userId);
    const v2State = createConversationV2State({
      episodeId: `fixture-pending-${expectedField}`,
      now: NOW.toISOString(),
    });
    v2State.bookingTask = {
      draft: {
        branch: "高雄館",
        firstVisit: true,
        ...(expectedField === "phone" ? { name: "王小美" } : {}),
        timeSlots: ["8/20 下午"],
        treatmentKeys: ["pico"],
      },
      expectedField,
      id: `fixture-pending-${expectedField}:booking`,
      intent: "create",
      status,
    };
    context.conversationV2State = v2State;
    return context;
  }

  for (const [expectedField, message, expectedValue] of [
    ["phone", "還是一直痛，另外電話：0912345678", "0912345678"],
    ["name", "還是一直痛，另外姓名：王小美", "王小美"],
    ["name", "還是一直痛，另外王小美", "王小美"],
  ] as const) {
    const fieldCounts = { nlu: 0, provider: 0 };
    const pendingBookingField = await routeConversationV2Canary({
      context: pendingBookingFieldContext(expectedField),
      eventIdentity: `event-pending-${expectedField}`,
      message,
      now: NOW,
      pendingHandoffReason: "post_procedure_issue",
      sourceType: "user",
      sourceUserId: `U-pending-${expectedField}`,
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), fieldCounts),
      getCanarySettings: () => ({
        allowlistedUserIds: [`U-pending-${expectedField}`],
        mode: "canary",
      }),
      requestFrame: async () => {
        fieldCounts.nlu += 1;
        return nluResult(frame({
          dialogue: {
            focus: "none",
            move: "continue",
            reference: "active_subject",
            speechAct: "provide_booking_field",
          },
          intents: ["booking"],
          treatments: [],
        }));
      },
    });
    assert.equal(pendingBookingField.kind, "routed");
    const fieldDraft = pendingBookingField.decision.nextContext.conversationV2State?.bookingTask.draft;
    check(
      pendingBookingField.decision.decisionType === "booking_intake_reply" &&
        fieldCounts.provider === 1 &&
        fieldCounts.nlu === 1 &&
        (expectedField === "phone" ? fieldDraft?.phone : fieldDraft?.name) === expectedValue,
      `C20: a labeled ${expectedField} field must continue a suspended booking without escaping to account lookup or handoff`,
    );
  }

  const phoneQuestionCounts = { nlu: 0, provider: 0 };
  const phoneQuestionDuringBooking = await routeConversationV2Canary({
    context: pendingBookingFieldContext("phone"),
    eventIdentity: "event-pending-phone-question",
    message: "還是一直痛，另外 0912345678 是你們電話嗎",
    now: NOW,
    pendingHandoffReason: "post_procedure_issue",
    sourceType: "user",
    sourceUserId: "U-pending-phone-question",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), phoneQuestionCounts),
    getCanarySettings: () => ({
      allowlistedUserIds: ["U-pending-phone-question"],
      mode: "canary",
    }),
    requestFrame: async () => {
      phoneQuestionCounts.nlu += 1;
      return nluResult(frame({
        dialogue: {
          focus: "clinic_contact",
          move: "continue",
          reference: "explicit",
          speechAct: "ask_clinic_info",
        },
        intents: ["branch_info"],
        treatments: [],
      }));
    },
  });
  assert.equal(phoneQuestionDuringBooking.kind, "routed");
  check(
    phoneQuestionCounts.provider === 1 &&
      phoneQuestionCounts.nlu === 1 &&
      phoneQuestionDuringBooking.decision.decisionType !== "booking_intake_reply" &&
      !phoneQuestionDuringBooking.decision.nextContext.conversationV2State?.bookingTask.draft.phone,
    "C21: a clinic phone question must not be persisted as the customer's awaited phone field",
  );

  for (const [index, invalidPhone] of [
    "07-1234567",
    "02-2345-6789",
    "0542389617",
    "0912-345-67",
    "0912-345-6789",
    "電話：09123",
  ].entries()) {
    const userId = `U-invalid-mobile-${index}`;
    const invalidCounts = { nlu: 0, provider: 0 };
    const invalidMobile = await routeConversationV2Canary({
      context: pendingBookingFieldContext("phone", userId, "collecting"),
      eventIdentity: `event-invalid-mobile-${index}`,
      message: invalidPhone,
      now: NOW,
      sourceType: "user",
      sourceUserId: userId,
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), invalidCounts),
      getCanarySettings: () => ({
        allowlistedUserIds: [userId],
        mode: "canary",
      }),
      requestFrame: async () => {
        invalidCounts.nlu += 1;
        throw new Error("invalid mobile submission must be handled before NLU");
      },
    });
    assert.equal(invalidMobile.kind, "routed");
    const invalidState = invalidMobile.decision.nextContext.conversationV2State;
    check(
      invalidMobile.decision.matchedKey === "conversation_v2:booking_invalid_mobile" &&
        invalidMobile.decision.decisionType === "booking_intake_reply" &&
        invalidMobile.decision.replyText.includes("0912-345-678") &&
        invalidState?.bookingTask.status === "collecting" &&
        invalidState.bookingTask.expectedField === "phone" &&
        !invalidState.bookingTask.draft.phone &&
        invalidCounts.provider === 1 &&
        invalidCounts.nlu === 0,
      `C21: an invalid landline or malformed mobile must request the correct mobile format: ${invalidPhone}`,
    );
  }

  function pendingModifyContext() {
    const context = createEmptyConversationContext("U-pending-modify");
    const v2State = createConversationV2State({
      episodeId: "fixture-pending-modify",
      now: NOW.toISOString(),
    });
    v2State.bookingTask = {
      draft: {
        appointmentReference: "王小美 0912345678",
        timeSlots: [],
        treatmentKeys: [],
      },
      expectedField: "change_request",
      id: "fixture-pending-modify:booking",
      intent: "modify",
      status: "suspended",
    };
    context.conversationV2State = v2State;
    return context;
  }

  for (const [index, message] of [
    "還是一直痛，另外有什麼辦法嗎",
    "還是一直痛，另外今天天氣很好",
  ].entries()) {
    const counts = { nlu: 0, provider: 0 };
    const nonModify = await routeConversationV2Canary({
      context: pendingModifyContext(),
      eventIdentity: `event-pending-not-modify-${index}`,
      message,
      now: NOW,
      pendingHandoffReason: "post_procedure_issue",
      sourceType: "user",
      sourceUserId: "U-pending-modify",
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), counts),
      getCanarySettings: () => ({ allowlistedUserIds: ["U-pending-modify"], mode: "canary" }),
      requestFrame: async () => {
        counts.nlu += 1;
        return nluResult(frame());
      },
    });
    assert.equal(nonModify.kind, "routed");
    check(
      nonModify.decision.matchedKey === "handoff_continuation:post_procedure_issue" &&
        counts.provider === 0 &&
        counts.nlu === 0 &&
        !nonModify.decision.nextContext.conversationV2State?.bookingTask.draft.changeRequest,
      `C22: arbitrary prose must not become a booking change request: ${message}`,
    );
  }

  const explicitModifyCounts = { nlu: 0, provider: 0 };
  const explicitModify = await routeConversationV2Canary({
    context: pendingModifyContext(),
    eventIdentity: "event-pending-explicit-modify",
    message: "還是一直痛，另外我要改預約，改到週六",
    now: NOW,
    pendingHandoffReason: "post_procedure_issue",
    sourceType: "user",
    sourceUserId: "U-pending-modify",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), explicitModifyCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-pending-modify"], mode: "canary" }),
    requestFrame: async () => {
      explicitModifyCounts.nlu += 1;
      return nluResult(frame({
        dialogue: {
          focus: "none",
          move: "continue",
          reference: "explicit",
          speechAct: "manage_booking",
        },
        intents: ["booking"],
        treatments: [],
      }));
    },
  });
  assert.equal(explicitModify.kind, "routed");
  check(
    explicitModify.decision.decisionType === "booking_intake_reply" &&
      explicitModifyCounts.provider === 1 &&
      explicitModifyCounts.nlu === 1 &&
      explicitModify.decision.nextContext.conversationV2State?.bookingTask.draft.changeRequest?.includes("改到週六"),
    "C23: an explicit booking modification must remain routable during a pending handoff",
  );

  const pendingPreflightCases = [
    ["還是一直痛，另外幫我查我的會員紀錄", "customer_account_lookup"],
    ["還是一直痛，我想做隆鼻手術", "plastic_surgery_scope"],
    ["還是一直痛，而且我要嚴重客訴", "serious_complaint"],
  ] as const;
  for (const [message, expectedMatchedKey] of pendingPreflightCases) {
    const caseCounts = { nlu: 0, provider: 0 };
    const result = await routeConversationV2Canary({
      context: createEmptyConversationContext(`U-pending-${expectedMatchedKey}`),
      eventIdentity: `event-pending-${expectedMatchedKey}`,
      message,
      now: NOW,
      pendingHandoffReason: "post_procedure_issue",
      sourceType: "user",
      sourceUserId: `U-pending-${expectedMatchedKey}`,
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), caseCounts),
      getCanarySettings: () => ({
        allowlistedUserIds: [`U-pending-${expectedMatchedKey}`],
        mode: "canary",
      }),
      requestFrame: async () => {
        caseCounts.nlu += 1;
        return nluResult(frame());
      },
    });
    assert.equal(result.kind, "routed");
    check(
      result.decision.matchedKey === expectedMatchedKey &&
        caseCounts.provider === 0 &&
        caseCounts.nlu === 0,
      `C17: ${expectedMatchedKey} preflight must outrank a pending continuation`,
    );
  }

  const maskedSuffixPreflightCases = [
    ["請找真人介紹皮秒效果", "human_request"],
    ["我有心臟病適合做皮秒嗎", "general_medical_out_of_scope"],
    ["皮秒效果可以保證最低價嗎", "price_commitment_request"],
    ["皮秒效果很差我要嚴重客訴", "serious_complaint"],
    ["想知道皮秒療程紀錄", "customer_account_lookup"],
    ["糖尿病適合做皮秒嗎", "general_medical_out_of_scope"],
  ] as const;
  for (const [suffix, expectedMatchedKey] of maskedSuffixPreflightCases) {
    const caseCounts = { nlu: 0, provider: 0 };
    const result = await routeConversationV2Canary({
      context: createEmptyConversationContext(`U-pending-suffix-${expectedMatchedKey}`),
      eventIdentity: `event-pending-suffix-${expectedMatchedKey}-${suffix}`,
      message: `肉毒打完還是疼痛，對了${suffix}`,
      now: NOW,
      pendingHandoffReason: "post_procedure_issue",
      sourceType: "user",
      sourceUserId: `U-pending-suffix-${expectedMatchedKey}`,
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), caseCounts),
      getCanarySettings: () => ({
        allowlistedUserIds: [`U-pending-suffix-${expectedMatchedKey}`],
        mode: "canary",
      }),
      requestFrame: async () => {
        caseCounts.nlu += 1;
        return nluResult(frame());
      },
    });
    assert.equal(result.kind, "routed");
    check(
      result.decision.matchedKey === expectedMatchedKey &&
        caseCounts.provider === 0 &&
        caseCounts.nlu === 0,
      `C21: isolated suffix preflight must outrank the redundant pending issue: ${suffix}`,
    );
  }

  for (const [index, suffix, expectedMatchedKey] of [
    [0, "我要嚴重客訴", "serious_complaint"],
    [1, "請找真人", "human_request"],
    [2, "電話0912345678是誰的", "customer_account_lookup"],
  ] as const) {
    const context = pendingBotoxContext(`U-handoff-priority-${index}`);
    const state = context.conversationV2State;
    if (!state) throw new Error("fixture V2 state missing");
    state.control = {
      handoff: {
        id: `fixture-handoff-priority-${index}`,
        reason: "post_procedure_issue",
        requestedAt: NOW.toISOString(),
        status: "pending",
      },
      mode: "handoff_pending",
    };
    const counts = { nlu: 0, provider: 0 };
    const result = await routeConversationV2Canary({
      context,
      eventIdentity: `event-handoff-priority-${index}`,
      message: `肉毒打完疼痛，對了${suffix}`,
      now: NOW,
      pendingHandoffReason: "post_procedure_issue",
      sourceType: "user",
      sourceUserId: `U-handoff-priority-${index}`,
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), counts),
      getCanarySettings: () => ({
        allowlistedUserIds: [`U-handoff-priority-${index}`],
        mode: "canary",
      }),
      requestFrame: async () => {
        counts.nlu += 1;
        return nluResult(frame());
      },
    });
    assert.equal(result.kind, "routed");
    check(
      result.decision.matchedKey === expectedMatchedKey &&
        result.decision.replyPlan?.handoffReason === "post_procedure_issue" &&
        result.decision.nextContext.conversationV2State?.control.handoff?.reason === "post_procedure_issue" &&
        counts.provider === 0 &&
        counts.nlu === 0,
      `C21: a lower-priority suffix handoff must not overwrite the pending medical owner: ${suffix}`,
    );
  }

  const accountLookupCounts = { nlu: 0, provider: 0 };
  const activeBookingContext = structuredClone(first.decision.nextContext);
  activeBookingContext.conversationV2State = createConversationV2State({
    episodeId: "fixture-active-booking",
    now: NOW.toISOString(),
  });
  activeBookingContext.conversationV2State.bookingTask = {
    draft: { treatmentKeys: ["onda_pro"], timeSlots: [] },
    expectedField: "branch",
    id: "fixture-active-booking:id",
    intent: "create",
    status: "collecting",
  };
  const accountLookup = await routeConversationV2Canary({
    context: activeBookingContext,
    eventIdentity: "event-account-lookup",
    message: "幫我查我的會員紀錄",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-canary",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), accountLookupCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-canary"], mode: "canary" }),
    requestFrame: async () => {
      accountLookupCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  assert.equal(accountLookup.kind, "routed");
  check(
    accountLookup.dataStatus === "preflight" &&
      accountLookupCounts.provider === 0 &&
      accountLookupCounts.nlu === 0 &&
      accountLookup.decision.matchedKey === "customer_account_lookup",
    "C13: an active booking must not hide a personal-account lookup from deterministic handoff",
  );

  const mixedAccountLookupCounts = { nlu: 0, provider: 0 };
  const mixedAccountLookup = await routeConversationV2Canary({
    context: activeBookingContext,
    eventIdentity: "event-mixed-account-lookup",
    message: "我要預約，也幫我查會員紀錄，電話 0912345678",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-canary",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider(), mixedAccountLookupCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-canary"], mode: "canary" }),
    requestFrame: async () => {
      mixedAccountLookupCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  assert.equal(mixedAccountLookup.kind, "routed");
  check(
    mixedAccountLookup.decision.matchedKey === "customer_account_lookup" &&
      mixedAccountLookupCounts.provider === 0 &&
      mixedAccountLookupCounts.nlu === 0,
    "C17: booking contact data must not bypass an explicit customer-record lookup handoff",
  );

  for (const [index, message] of [
    "怎麼取消預約？",
    "我想問怎麼取消預約？",
    "請問取消預約怎麼辦？",
    "取消預約需要提供電話 0912345678 嗎？",
    "取消預約會收費嗎？電話 0912345678",
    "改預約要怎麼做？",
    "我想問修改預約",
    "修改預約需要提供電話 0912345678 嗎？",
  ].entries()) {
    const counts = { nlu: 0, provider: 0 };
    const result = await routeConversationV2Canary({
      context: createEmptyConversationContext(`U-booking-inquiry-${index}`),
      eventIdentity: `event-booking-inquiry-${index}`,
      message,
      now: NOW,
      sourceType: "user",
      sourceUserId: `U-booking-inquiry-${index}`,
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), counts),
      getCanarySettings: () => ({
        allowlistedUserIds: [`U-booking-inquiry-${index}`],
        mode: "canary",
      }),
      requestFrame: async () => {
        counts.nlu += 1;
        return nluResult(frame({
          dialogue: {
            focus: "booking_policy",
            move: "start",
            reference: "none",
            speechAct: "unknown",
          },
          intents: ["unknown"],
          treatments: [],
        }));
      },
    });
    assert.equal(result.kind, "routed");
    check(
      counts.provider === 1 &&
        counts.nlu === 1 &&
        result.decision.nextContext.conversationV2State?.bookingTask.status === "inactive" &&
        !result.toolRequest,
      `C17: asking how booking mutation works must not execute or persist it: ${message}`,
    );
  }

  for (const [index, message] of [
    "電話0912345678是誰？",
    "這支電話0912345678是哪個人的？",
    "電話0912345678對應哪個人？",
    "請確認電話0912345678的資料",
  ].entries()) {
    const counts = { nlu: 0, provider: 0 };
    const result = await routeConversationV2Canary({
      context: pendingBookingFieldContext("phone"),
      eventIdentity: `event-account-phone-${index}`,
      message,
      now: NOW,
      sourceType: "user",
      sourceUserId: "U-pending-phone",
    }, {
      factsProvider: countedProvider(createStaticClinicFactsProvider(), counts),
      getCanarySettings: () => ({ allowlistedUserIds: ["U-pending-phone"], mode: "canary" }),
      requestFrame: async () => {
        counts.nlu += 1;
        return nluResult(frame());
      },
    });
    assert.equal(result.kind, "routed");
    check(
      result.decision.matchedKey === "customer_account_lookup" &&
        counts.provider === 0 &&
        counts.nlu === 0 &&
        !result.decision.nextContext.conversationV2State?.bookingTask.draft.phone,
      `C17: a phone identity lookup must hand off without persisting the number: ${message}`,
    );
  }

  const bookingStart = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-book"),
    eventIdentity: "event-book-1",
    message: "我想預約 ONDA",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-book",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "booking-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-book"], mode: "canary" }),
    requestFrame: async () => nluResult(frame({
      dialogue: {
        focus: "none",
        move: "continue",
        reference: "explicit",
        speechAct: "book_consultation",
      },
      intents: ["booking", "treatment"],
    })),
  });
  assert.equal(bookingStart.kind, "routed");
  check(bookingStart.decision.decisionType === "booking_intake_reply" && bookingStart.toolRequest?.type === "persist_booking_progress", "C13: explicit booking must produce exactly one typed booking projection");
  check(!bookingStart.decision.replyText.includes("姓名") && !bookingStart.decision.replyText.includes("電話"), "C14: booking must ask the next missing field instead of collecting all PII at once");

  async function continueBooking(
    context: ConversationContext,
    eventIdentity: string,
    message: string,
    speechAct: NluFrame["dialogue"]["speechAct"] = "provide_booking_field",
  ) {
    return routeConversationV2Canary({
      context,
      eventIdentity,
      message,
      now: new Date(NOW.getTime() + 1000),
      sourceType: "user",
      sourceUserId: "U-book",
    }, {
      factsProvider: createStaticClinicFactsProvider({ snapshotId: "booking-snapshot" }),
      getCanarySettings: () => ({ allowlistedUserIds: ["U-book"], mode: "canary" }),
      requestFrame: async () => nluResult(frame({
        dialogue: {
          focus: "none",
          move: "continue",
          reference: "active_subject",
          speechAct,
        },
        intents: speechAct === "ask_price"
          ? ["pricing"]
          : speechAct === "ask_clinic_info"
            ? ["branch_info"]
            : ["booking"],
        treatments: [],
      })),
    });
  }

  const bookingBranch = await continueBooking(
    bookingStart.decision.nextContext,
    "event-book-branch",
    "高雄館",
  );
  assert.equal(bookingBranch.kind, "routed");
  const bookingTimes = await continueBooking(
    bookingBranch.decision.nextContext,
    "event-book-times",
    "8/20 下午、8/21 晚上、8/22 下午",
  );
  assert.equal(bookingTimes.kind, "routed");
  const bookingVisit = await continueBooking(
    bookingTimes.decision.nextContext,
    "event-book-visit",
    "初診",
  );
  assert.equal(bookingVisit.kind, "routed");

  const priceWhileExpectingName = await continueBooking(
    bookingVisit.decision.nextContext,
    "event-book-price-not-name",
    "價格多少",
    "ask_price",
  );
  assert.equal(priceWhileExpectingName.kind, "routed");
  check(
    priceWhileExpectingName.decision.decisionType === "pricing_auto_reply" &&
      !priceWhileExpectingName.decision.nextContext.conversationV2State?.bookingTask.draft.name &&
      priceWhileExpectingName.decision.nextContext.conversationV2State?.bookingTask.expectedField === "name",
    "C18: a price question while awaiting a name must not be persisted as the customer name",
  );

  const clinicInfoWhileExpectingName = await continueBooking(
    bookingVisit.decision.nextContext,
    "event-book-clinic-not-name",
    "高雄館有停車嗎",
    "ask_clinic_info",
  );
  assert.equal(clinicInfoWhileExpectingName.kind, "routed");
  check(
    clinicInfoWhileExpectingName.decision.decisionType === "clinic_info_reply" &&
      !clinicInfoWhileExpectingName.decision.nextContext.conversationV2State?.bookingTask.draft.name &&
      clinicInfoWhileExpectingName.decision.nextContext.conversationV2State?.bookingTask.expectedField === "name",
    "C19: a clinic question while awaiting a name must keep the booking draft without consuming the branch as PII",
  );

  const phoneQuestionWhileExpectingName = await continueBooking(
    bookingVisit.decision.nextContext,
    "event-book-phone-question-not-name",
    "0912345678 是你們電話嗎",
    "ask_clinic_info",
  );
  assert.equal(phoneQuestionWhileExpectingName.kind, "routed");
  check(
    phoneQuestionWhileExpectingName.decision.decisionType === "clinic_info_reply" &&
      !phoneQuestionWhileExpectingName.decision.nextContext.conversationV2State?.bookingTask.draft.phone &&
      phoneQuestionWhileExpectingName.decision.nextContext.conversationV2State?.bookingTask.expectedField === "name",
    "C20: a phone-number question must not be persisted as booking contact data",
  );

  const bookingName = await continueBooking(
    bookingVisit.decision.nextContext,
    "event-book-name",
    "王小美",
  );
  assert.equal(bookingName.kind, "routed");
  check(
    bookingName.decision.nextContext.conversationV2State?.bookingTask.draft.name === "王小美" &&
      bookingName.decision.nextContext.conversationV2State?.bookingTask.expectedField === "phone",
    "C21: a strict bare-name reply is accepted only when NLU confirms the expected booking field",
  );

  let declineNluCalls = 0;
  const bookingDeclined = await routeConversationV2Canary({
    context: bookingName.decision.nextContext,
    eventIdentity: "event-book-decline",
    message: "先測到這就好",
    now: new Date(NOW.getTime() + 2000),
    sourceType: "user",
    sourceUserId: "U-book",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "booking-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-book"], mode: "canary" }),
    requestFrame: async () => {
      declineNluCalls += 1;
      return nluResult(frame());
    },
  });
  assert.equal(bookingDeclined.kind, "routed");
  check(
    declineNluCalls === 0 &&
      bookingDeclined.decision.matchedKey === "conversation_v2:booking_declined" &&
      bookingDeclined.decision.nextContext.conversationV2State?.bookingTask.status === "suspended" &&
      bookingDeclined.decision.replyText.includes("先不繼續預約") &&
      !bookingDeclined.decision.replyText.includes("免費諮詢"),
    "C22: declining an in-progress booking must suspend it briefly without another sales prompt or NLU call",
  );

  let restartNluCalls = 0;
  const bookingRestarted = await routeConversationV2Canary({
    context: bookingDeclined.decision.nextContext,
    eventIdentity: "event-book-restart",
    message: "我們重新跑一次預約流程",
    now: new Date(NOW.getTime() + 3000),
    sourceType: "user",
    sourceUserId: "U-book",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "booking-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-book"], mode: "canary" }),
    requestFrame: async () => {
      restartNluCalls += 1;
      return nluResult(frame());
    },
  });
  assert.equal(bookingRestarted.kind, "routed");
  check(
    restartNluCalls === 0 &&
      bookingRestarted.decision.matchedKey === "conversation_v2:booking_restarted" &&
      bookingRestarted.decision.nextContext.conversationV2State?.bookingTask.status === "collecting" &&
      bookingRestarted.decision.nextContext.conversationV2State?.bookingTask.expectedField === "branch" &&
      bookingRestarted.decision.nextContext.conversationV2State?.bookingTask.draft.treatmentKeys.includes("onda_pro") &&
      !bookingRestarted.decision.nextContext.conversationV2State?.bookingTask.draft.name &&
      bookingRestarted.decision.replyText.includes("重新整理預約資料"),
    "C23: an explicit restart must create a fresh booking flow while retaining the selected treatment",
  );

  const botoxBookingContext = structuredClone(bookingName.decision.nextContext);
  const botoxBookingState = botoxBookingContext.conversationV2State;
  assert.ok(botoxBookingState, "C24 fixture requires canonical booking state");
  botoxBookingState.knowledge.treatmentKeys = ["botox"];
  botoxBookingState.knowledge.concernKeys = ["masseter_contour"];
  botoxBookingState.bookingTask.draft.treatmentKeys = ["botox"];
  const botoxDeclined = await routeConversationV2Canary({
    context: botoxBookingContext,
    eventIdentity: "event-botox-book-decline",
    message: "先不用預約",
    now: new Date(NOW.getTime() + 4000),
    sourceType: "user",
    sourceUserId: "U-book",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "booking-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-book"], mode: "canary" }),
    requestFrame: async () => { throw new Error("booking decline must bypass NLU"); },
  });
  assert.equal(botoxDeclined.kind, "routed");
  const concernAfterDecline = await routeConversationV2Canary({
    context: botoxDeclined.decision.nextContext,
    eventIdentity: "event-botox-concern-after-decline",
    message: "咀嚼肌偏大",
    now: new Date(NOW.getTime() + 5000),
    sourceType: "user",
    sourceUserId: "U-book",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "booking-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-book"], mode: "canary" }),
    requestFrame: async () => nluResult(frame({
      concerns: [{ area: "jawline", key: "masseter_contour" }],
      dialogue: {
        focus: "benefits",
        move: "continue",
        reference: "active_subject",
        speechAct: "ask_concern",
      },
      intents: ["treatment"],
      treatments: ["botox"],
    })),
  });
  assert.equal(concernAfterDecline.kind, "routed");
  check(
    concernAfterDecline.policyAction === "learn_treatment" &&
      concernAfterDecline.decision.replyText.includes("咀嚼肌") &&
      !concernAfterDecline.decision.replyText.includes("想先了解哪項療程"),
    `C24: declining booking must preserve the Botox topic so the next concern receives a substantive answer (${concernAfterDecline.policyAction}/${concernAfterDecline.decision.matchedKey}/${concernAfterDecline.decision.replyText})`,
  );

  const bookingPhone = await continueBooking(
    bookingName.decision.nextContext,
    "event-book-phone",
    "0912345678",
  );
  assert.equal(bookingPhone.kind, "routed");
  check(
    bookingPhone.decision.nextContext.conversationV2State?.bookingTask.status === "completed" &&
      bookingPhone.decision.nextContext.bookingDraft.treatment === "ONDA PRO" &&
      bookingPhone.decision.nextContext.bookingDraft.branch === "高雄館" &&
      bookingPhone.decision.nextContext.bookingDraft.isFirstVisit === "yes" &&
      bookingPhone.decision.nextContext.bookingDraft.name === "王小美" &&
      bookingPhone.decision.nextContext.bookingDraft.phone === "0912345678" &&
      bookingPhone.decision.nextContext.bookingDraft.timeSlots.length === 3 &&
      bookingPhone.decision.nextContext.bookingSession?.action === "use_current",
    "C25: the canonical and legacy booking projections must stay consistent through completion",
  );

  const staleLegacyContext = createEmptyConversationContext("U-stale-booking");
  staleLegacyContext.bookingDraft = {
    branch: "舊館別",
    isFirstVisit: "yes",
    name: "舊姓名",
    phone: "0911111111",
    requestedTimeSlots: ["舊時段"],
    timeSlots: ["舊時段"],
    treatment: "肉毒",
  };
  staleLegacyContext.bookingSession = {
    action: "use_current",
    lastActiveAt: NOW.toISOString(),
    status: "collecting",
  };
  staleLegacyContext.lastIntent = "booking_intake";
  const cleanReplacement = await routeConversationV2Canary({
    context: staleLegacyContext,
    eventIdentity: "event-clean-replacement",
    message: "我要重新預約 ONDA",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-stale-booking",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "booking-clean-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-stale-booking"], mode: "canary" }),
    requestFrame: async () => nluResult(frame({
      dialogue: {
        focus: "none",
        move: "start",
        reference: "explicit",
        speechAct: "book_consultation",
      },
      intents: ["booking", "treatment"],
    })),
  });
  assert.equal(cleanReplacement.kind, "routed");
  check(
    cleanReplacement.decision.nextContext.bookingDraft.treatment === "ONDA PRO" &&
      !cleanReplacement.decision.nextContext.bookingDraft.branch &&
      !cleanReplacement.decision.nextContext.bookingDraft.name &&
      !cleanReplacement.decision.nextContext.bookingDraft.phone &&
      cleanReplacement.decision.nextContext.bookingDraft.timeSlots.length === 0 &&
      cleanReplacement.decision.nextContext.bookingSession?.action === "replace",
    "C15: a new canonical booking must replace rather than revive legacy branch/contact/time data",
  );

  const legacyContinuationContext = createEmptyConversationContext("U-legacy-continuation");
  legacyContinuationContext.bookingDraft = {
    requestedTimeSlots: [],
    timeSlots: [],
    treatment: "ONDA PRO",
  };
  legacyContinuationContext.bookingSession = {
    action: "use_current",
    lastActiveAt: NOW.toISOString(),
    status: "collecting",
  };
  legacyContinuationContext.lastIntent = "booking_intake";
  legacyContinuationContext.activeFocus = {
    answeredTopics: [],
    areaKeys: [],
    bookingExplicit: true,
    concernKeys: [],
    goal: "book_consultation",
    treatmentKey: "onda_pro",
  };
  const migratedContinuation = await routeConversationV2Canary({
    context: legacyContinuationContext,
    eventIdentity: "event-legacy-continuation",
    message: "高雄館",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-legacy-continuation",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "legacy-continuation-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-legacy-continuation"], mode: "canary" }),
    requestFrame: async () => nluResult(frame({
      dialogue: {
        focus: "none",
        move: "continue",
        reference: "active_subject",
        speechAct: "unknown",
      },
      intents: [],
      treatments: [],
    })),
  });
  assert.equal(migratedContinuation.kind, "routed");
  check(
    migratedContinuation.decision.nextContext.conversationV2State?.bookingTask.intent === "create" &&
      migratedContinuation.decision.nextContext.bookingDraft.treatment === "ONDA PRO" &&
      migratedContinuation.decision.nextContext.bookingDraft.branch === "高雄館",
    "C16: the first canary turn must migrate and continue an active legacy booking draft",
  );

  const staleV2At = new Date(NOW.getTime() - 60_000).toISOString();
  const newerV1At = new Date(NOW.getTime() - 30_000).toISOString();
  const staleV2Context = createEmptyConversationContext("U-stale-v2");
  const staleV2State = createConversationV2State({
    episodeId: "stale-v2-episode",
    now: staleV2At,
  });
  staleV2State.activeTask = {
    id: "stale-v2-booking",
    kind: "booking",
    startedAt: staleV2At,
  };
  staleV2State.bookingTask = {
    draft: { treatmentKeys: ["onda_pro"], timeSlots: [] },
    expectedField: "branch",
    id: "stale-v2-booking",
    intent: "create",
    status: "collecting",
  };
  staleV2State.knowledge.treatmentKeys = ["onda_pro"];
  staleV2Context.conversationV2State = staleV2State;
  staleV2Context.lastSeenAt = newerV1At;
  staleV2Context.bookingDraft = {
    isFirstVisit: "yes",
    name: "王小美",
    phone: "0912345678",
    requestedTimeSlots: ["8/20 下午"],
    timeSlots: ["8/20 下午"],
    treatment: "探索皮秒",
  };
  staleV2Context.bookingSession = {
    action: "use_current",
    lastActiveAt: newerV1At,
    status: "collecting",
  };
  staleV2Context.lastIntent = "booking_intake";
  const reenabledAfterV1 = await routeConversationV2Canary({
    context: staleV2Context,
    eventIdentity: "event-reenabled-after-v1",
    message: "高雄館",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-stale-v2",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "reenabled-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-stale-v2"], mode: "canary" }),
    requestFrame: async () => nluResult(frame({
      dialogue: {
        focus: "none",
        move: "continue",
        reference: "active_subject",
        speechAct: "provide_booking_field",
      },
      intents: ["booking"],
      treatments: [],
    })),
  });
  assert.equal(reenabledAfterV1.kind, "routed");
  check(
    reenabledAfterV1.decision.nextContext.conversationV2State?.bookingTask.draft.treatmentKeys.includes("pico") &&
      !reenabledAfterV1.decision.nextContext.conversationV2State?.bookingTask.draft.treatmentKeys.includes("onda_pro") &&
      reenabledAfterV1.decision.nextContext.bookingDraft.treatment === "探索皮秒" &&
      reenabledAfterV1.decision.nextContext.bookingDraft.branch === "高雄館" &&
      reenabledAfterV1.decision.nextContext.bookingDraft.name === "王小美" &&
      reenabledAfterV1.decision.nextContext.bookingDraft.phone === "0912345678" &&
      reenabledAfterV1.decision.nextContext.bookingDraft.timeSlots.includes("8/20 下午") &&
      reenabledAfterV1.decision.nextContext.bookingDraft.isFirstVisit === "yes",
    "C23: re-enabling canary must rebuild from newer V1 state instead of reviving a stale V2 booking",
  );

  const cancelWithReference = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-cancel"),
    eventIdentity: "event-cancel-reference",
    message: "我要取消預約，我是王小美，0912345678",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-cancel",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "cancel-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-cancel"], mode: "canary" }),
    requestFrame: async () => nluResult(frame({
      dialogue: {
        focus: "none",
        move: "start",
        reference: "explicit",
        speechAct: "manage_booking",
      },
      intents: ["booking"],
      treatments: [],
    })),
  });
  assert.equal(cancelWithReference.kind, "routed");
  check(
    cancelWithReference.decision.matchedKey === "booking_cancel_request" &&
      cancelWithReference.decision.nextContext.conversationV2State?.bookingTask.status === "completed" &&
      !cancelWithReference.decision.replyText.includes("請提供原預約"),
    "C17: cancel intent must use the same-turn name/phone as its appointment reference",
  );

  const modifyComplete = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-modify"),
    eventIdentity: "event-modify-complete",
    message: "我要改預約，我是王小美 0912345678，改到週六",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-modify",
  }, {
    factsProvider: createStaticClinicFactsProvider({ snapshotId: "modify-snapshot" }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-modify"], mode: "canary" }),
    requestFrame: async () => nluResult(frame({
      dialogue: {
        focus: "none",
        move: "start",
        reference: "explicit",
        speechAct: "manage_booking",
      },
      intents: ["booking"],
      treatments: [],
    })),
  });
  assert.equal(modifyComplete.kind, "routed");
  check(
    modifyComplete.decision.matchedKey === "booking_modify_request" &&
      modifyComplete.decision.nextContext.conversationV2State?.bookingTask.status === "completed" &&
      Boolean(modifyComplete.decision.nextContext.conversationV2State?.bookingTask.draft.changeRequest),
    "C18: modify intent must preserve both same-turn reference and requested change",
  );

  let heldProviderCalls = 0;
  let heldNluCalls = 0;
  const held = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-held"),
    eventIdentity: "event-held-booking",
    message: "我要預約 ONDA",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-held",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider({
      treatments: [],
      treatmentCatalogCompleteness: "partial",
      snapshotId: "held-partial-snapshot",
    }), { get provider() { return heldProviderCalls; }, set provider(value) { heldProviderCalls = value; } }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-held"], mode: "canary" }),
    requestFrame: async () => {
      heldNluCalls += 1;
      return nluResult(frame({
        dialogue: {
          focus: "none",
          move: "start",
          reference: "explicit",
          speechAct: "book_consultation",
        },
        intents: ["booking", "treatment"],
      }));
    },
  });
  assert.equal(held.kind, "routed");
  check(
    held.dataStatus === "unresolved" &&
      held.toolRequest?.type === "request_fact_confirmation" &&
      held.decision.nextContext.conversationV2State?.bookingTask.status === "inactive" &&
      held.decision.nextContext.conversationV2State.processedTurnIds.length === 1 &&
      !held.decision.nextContext.bookingDraft.name &&
      !held.decision.nextContext.bookingDraft.phone,
    "C19: unresolved treatment facts must hold booking state while receipting the event",
  );
  const heldReplay = await routeConversationV2Canary({
    context: held.decision.nextContext,
    eventIdentity: "event-held-booking",
    message: "我要預約 ONDA",
    now: new Date(NOW.getTime() + 1000),
    sourceType: "user",
    sourceUserId: "U-held",
  }, {
    factsProvider: {
      async loadSnapshot(input) {
        heldProviderCalls += 1;
        return createStaticClinicFactsProvider().loadSnapshot(input);
      },
    },
    getCanarySettings: () => ({ allowlistedUserIds: ["U-held"], mode: "canary" }),
    requestFrame: async () => {
      heldNluCalls += 1;
      return nluResult(frame());
    },
  });
  assert.equal(heldReplay.kind, "routed");
  check(
    heldReplay.decision.matchedKey === "conversation_v2:duplicate_turn" &&
      heldProviderCalls === 1 &&
      heldNluCalls === 1,
    "C20: replaying a held event must not load facts, call NLU, or mutate later",
  );

  let failureNluCalls = 0;
  const failure = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-fail"),
    eventIdentity: "event-fail",
    message: "ONDA 多少錢",
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-fail",
  }, {
    factsProvider: {
      async loadSnapshot() {
        throw new Error("fixture source unavailable");
      },
    },
    getCanarySettings: () => ({ allowlistedUserIds: ["U-fail"], mode: "canary" }),
    requestFrame: async () => {
      failureNluCalls += 1;
      return nluResult(frame());
    },
  });
  assert.equal(failure.kind, "routed");
  check(
    failureNluCalls === 0 &&
      failure.dataStatus === "unavailable" &&
      !/\d{3,}/u.test(failure.decision.replyText) &&
      failure.decision.nextContext.conversationV2State?.processedTurnIds.length === 1,
    "C21: provider failure must fail closed and receipt the event without calling NLU",
  );

  const failureReplayCounts = { nlu: 0, provider: 0 };
  const failureReplay = await routeConversationV2Canary({
    context: failure.decision.nextContext,
    eventIdentity: "event-fail",
    message: "ONDA 多少錢",
    now: new Date(NOW.getTime() + 1000),
    sourceType: "user",
    sourceUserId: "U-fail",
  }, {
    factsProvider: countedProvider(createStaticClinicFactsProvider({
      pricingCampaigns: [campaign()],
      snapshotId: "recovered-snapshot",
    }), failureReplayCounts),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-fail"], mode: "canary" }),
    requestFrame: async () => {
      failureReplayCounts.nlu += 1;
      return nluResult(frame());
    },
  });
  assert.equal(failureReplay.kind, "routed");
  check(
    failureReplay.decision.matchedKey === "conversation_v2:duplicate_turn" &&
      failureReplayCounts.provider === 0 &&
      failureReplayCounts.nlu === 0,
    "C22: a failed event replay must remain idempotent after its provider recovers",
  );

  const webhookReply = "V2 test-account route selected.";
  const webhookPlan = legacyDecisionToReplyPlan({
    decisionType: "clinic_info_reply",
    matchedKey: "conversation_v2:test_route",
    matchedType: "config",
    replyText: webhookReply,
  }, {
    dialogueAct: "answer_clinic_info",
    fallbackText: webhookReply,
    renderMode: "deterministic",
  });
  let webhookV2Calls = 0;
  let webhookLegacyCalls = 0;
  const webhookResult = await processWebhookRequestBody(JSON.stringify({
    events: [{
      message: { id: "canary-webhook-message", text: "測試 V2", type: "text" },
      replyToken: "canary-webhook-reply-token",
      source: { type: "user" },
      timestamp: NOW.getTime(),
      type: "message",
      webhookEventId: "canary-webhook-event",
    }],
  }), {
    includePending: false,
    routeConversationV2: async ({ context }) => {
      webhookV2Calls += 1;
      return {
        dataStatus: "ready",
        decision: {
          decisionType: "clinic_info_reply",
          matchedKey: webhookPlan.matchedKey,
          matchedType: "config",
          nextContext: context,
          replyPlan: webhookPlan,
          replyText: webhookReply,
        },
        gate: { eligible: true, reason: "eligible" },
        kind: "routed",
        snapshotId: "webhook-snapshot",
        toolRequest: {
          domain: "price",
          keys: ["onda_pro"],
          reason: "ambiguous",
          type: "request_fact_confirmation",
        },
      };
    },
    routeLegacy: async () => {
      webhookLegacyCalls += 1;
      throw new Error("V1 must not run after V2 wins the route");
    },
  });
  check(webhookV2Calls === 1 && webhookLegacyCalls === 0, "C16: an eligible webhook must choose V2 without also executing V1");
  check(webhookResult.results.length === 1 && webhookResult.results[0]?.replyPayload !== null, "C17: one LINE event must produce only the single shared reply payload");
  check(
    webhookResult.results[0]?.conversationV2FactConfirmation?.domain === "price" &&
      webhookResult.results[0]?.conversationV2FactConfirmation?.keys.join(",") === "onda_pro" &&
      webhookResult.results[0]?.conversationV2FactConfirmation?.reason === "ambiguous",
    "C23: fact-confirmation metadata must survive the shared webhook projection for admin sync",
  );

  const legacyReply = "Legacy route selected exactly once.";
  let nonEligibleV2Calls = 0;
  let nonEligibleLegacyCalls = 0;
  const nonEligibleWebhook = await processWebhookRequestBody(JSON.stringify({
    events: [{
      message: { id: "noneligible-message", text: "未進 V2", type: "text" },
      replyToken: "noneligible-reply-token",
      source: { type: "user" },
      timestamp: NOW.getTime(),
      type: "message",
      webhookEventId: "noneligible-event",
    }],
  }), {
    includePending: false,
    routeConversationV2: async () => {
      nonEligibleV2Calls += 1;
      return {
        gate: { eligible: false, reason: "not_allowlisted" },
        kind: "not_eligible",
      };
    },
    routeLegacy: async ({ conversationContext }) => {
      nonEligibleLegacyCalls += 1;
      return {
        decisionType: "clinic_info_reply",
        matchedKey: "legacy:test_route",
        matchedType: "config",
        nextContext: conversationContext ?? createEmptyConversationContext("legacy-fallback"),
        replyText: legacyReply,
      };
    },
  });
  check(
    nonEligibleV2Calls === 1 &&
      nonEligibleLegacyCalls === 1 &&
      JSON.stringify(nonEligibleWebhook.results[0]?.replyPayload).includes(legacyReply),
    "C23: a non-eligible event must execute the legacy route exactly once",
  );

  let duplicateLegacyCalls = 0;
  const duplicateWebhook = await processWebhookRequestBody(JSON.stringify({
    events: [{
      message: { id: "duplicate-message", text: "重送事件", type: "text" },
      replyToken: "duplicate-reply-token",
      source: { type: "user" },
      timestamp: NOW.getTime(),
      type: "message",
      webhookEventId: "duplicate-event",
    }],
  }), {
    includePending: false,
    routeConversationV2: async ({ context }) => ({
      dataStatus: "ready",
      decision: {
        decisionType: "fallback_reply",
        matchedKey: "conversation_v2:duplicate_turn",
        matchedType: "guided_reply",
        nextContext: context,
        replyText: "",
        suppressAiFooter: true,
      },
      gate: { eligible: true, reason: "eligible" },
      kind: "routed",
    }),
    routeLegacy: async () => {
      duplicateLegacyCalls += 1;
      throw new Error("A receipted V2 event must never fall through to V1");
    },
  });
  check(
    duplicateLegacyCalls === 0 &&
      duplicateWebhook.results[0]?.decision.decisionType === "duplicate_event" &&
      duplicateWebhook.results[0]?.replyPayload === null,
    "C24: a duplicate V2 event must not render, reply, or execute V1",
  );

  console.log(`Conversation V2 canary validation passed (${passed} checks).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
