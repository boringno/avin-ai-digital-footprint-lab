import assert from "node:assert/strict";

import {
  buildReplyPayload,
  processWebhookRequestBody,
  reconcileRenderedQuickReplyContract,
  reconcileUndeliveredQuickReplyContract,
} from "@/lib/line-webhook";
import type { PriceCatalogEntry } from "@/lib/clinic-facts";
import { createStaticClinicFactsProvider } from "@/lib/clinic-facts/static-provider";
import { buildTreatmentReplyAssets } from "@/lib/clinic-facts/treatment-reply-assets";
import { classifyBookingSpeechAct } from "@/lib/booking-speech-act";
import { clinicConfig } from "@/lib/clinic-config";
import {
  projectConversationV2QuickReplies,
  withConversationV2QuickReplies,
} from "@/lib/conversation-v2/quick-replies";
import {
  buildConversationV2QuickReplySelection,
  resolveConversationV2QuickReplySelection,
} from "@/lib/conversation-v2/quick-reply-selection";
import { routeConversationV2Canary } from "@/lib/conversation-v2/live-runtime";
import {
  createConversationV2State,
  parsePersistedConversationV2State,
  recordConversationV2TurnReceipt,
} from "@/lib/conversation-v2/state";
import { createEmptyConversationContext } from "@/lib/conversation-context";
import { isPriceInquiry } from "@/lib/pricing-subject";
import { legacyDecisionToReplyPlan } from "@/lib/reply-plan";
import { loadSeedData } from "@/lib/seed-loader";
import type { LineReplyMessage, LineTextMessage } from "@/lib/treatment-carousel";
import type { NluFrame } from "@/lib/nlu-frame";

const NOW = "2026-08-23T12:00:00.000+08:00";

const ONDA_PRICE: PriceCatalogEntry = {
  approval_status: "approved",
  asset_urls: "",
  branch_scope: "all",
  campaign_aliases: "ONDA|ONDA PRO|ONDA體驗價",
  campaign_name: "ONDA 體驗方案",
  customer_price_approval_status: "approved",
  customer_price_text: "體驗價 16,888 元",
  end_date: "2026-08-31",
  fallback_message: "",
  id: "quick-replies-onda-price",
  is_active: "true",
  notes: "validator",
  price_text: "internal",
  start_date: "2026-08-01",
  treatment_name: "ONDA PRO",
};

const ONDA_BOTOX_COMBO_PRICE: PriceCatalogEntry = {
  approval_status: "approved",
  asset_urls: "",
  branch_scope: "all",
  campaign_aliases: "ONDA＋肉毒小臉組合|臉部輪廓組合",
  campaign_name: "ONDA＋肉毒小臉組合",
  customer_price_approval_status: "approved",
  customer_price_text: "組合價 12,999 元",
  end_date: "2026-08-31",
  fallback_message: "",
  id: "promo-2026-08-face-contour-combo",
  is_active: "true",
  notes: "validator",
  price_text: "internal",
  start_date: "2026-08-01",
  treatment_name: "ONDA PRO",
};

const BOTOX_PRICE: PriceCatalogEntry = {
  approval_status: "approved",
  asset_urls: "",
  branch_scope: "all",
  campaign_aliases: "肉毒|肉毒體驗價|999",
  campaign_name: "肉毒體驗方案",
  customer_price_approval_status: "approved",
  customer_price_text: "肉毒體驗價 999 元",
  end_date: "2026-08-31",
  fallback_message: "",
  id: "promo-2026-07-09-botox-wrinkle",
  is_active: "true",
  notes: "validator",
  price_text: "internal: 12U",
  start_date: "2026-08-01",
  treatment_name: "肉毒",
};

function plan(input: { concernKeys?: string[]; dialogueAct?: "introduce_treatment" | "answer_followup" | "clarify" | "quote_approved_price"; treatmentKeys?: string[] } = {}) {
  return legacyDecisionToReplyPlan({
    decisionType: "treatment_intro_reply",
    matchedKey: "fixture:quick-replies",
    matchedType: "config",
    replyText: "核准的客服回覆。",
  }, {
    concernKeys: input.concernKeys ?? [],
    dialogueAct: input.dialogueAct ?? "introduce_treatment",
    renderMode: "deterministic",
    treatmentKeys: input.treatmentKeys ?? [],
  });
}

function validateCurrentConcernChoosesQuickReplyOwnerFromHistory() {
  const state = createConversationV2State({ episodeId: "multi-treatment-owner", now: NOW });
  state.activeTask = {
    id: "multi-treatment-owner:task",
    kind: "learn_treatment",
    startedAt: NOW,
    subjectKey: "treatment:botox+onda_pro",
  };
  state.knowledge.treatmentKeys = ["botox", "onda_pro"];
  state.knowledge.concernKeys = ["dynamic_wrinkles", "jawline_looseness"];
  const projected = projectConversationV2QuickReplies(
    plan({
      concernKeys: ["jawline_looseness"],
      dialogueAct: "answer_followup",
      treatmentKeys: ["botox", "onda_pro"],
    }),
    state,
    { issuedAt: NOW, snapshotId: "snapshot-multi-treatment-owner" },
  );
  assert.deepEqual(
    labels(projected.plan.quickReplyItems),
    ["脂肪堆積", "下顎線鬆弛", "ONDA＋肉毒組合", "預約免費諮詢"],
    "the current ONDA concern must still project its choices when Botox remains in customer history",
  );
  assert.equal(
    projected.pendingQuickReply?.owner.treatmentKey,
    "onda_pro",
    "the displayed choices must persist the current ONDA owner, not the whole treatment history",
  );
}

function labels(items: ReturnType<typeof withConversationV2QuickReplies>["quickReplyItems"]) {
  return items.map((item) => item.action.label);
}

function validateUndeliveredContractCleanup() {
  const state = createConversationV2State({ episodeId: "undelivered-buttons", now: NOW });
  state.lastProcessedTurnId = "message-offer";
  state.knowledge.treatmentKeys = ["onda_pro"];
  const projection = projectConversationV2QuickReplies(
    plan({ treatmentKeys: ["onda_pro"] }),
    state,
    {
      clinic: clinicConfig,
      issuedAt: NOW,
      snapshotId: "snapshot-current",
    },
  );
  assert.ok(projection.pendingQuickReply, "fixture must create a semantic quick-reply contract");
  const context = createEmptyConversationContext("line-user-undelivered");
  context.conversationV2State = {
    ...state,
    pendingQuickReply: projection.pendingQuickReply,
  };

  const unrelatedFailure = reconcileUndeliveredQuickReplyContract(context, {
    messageId: "older-message",
  });
  assert.equal(
    unrelatedFailure.conversationV2State?.pendingQuickReply?.sourceTurnId,
    "message-offer",
    "an older failed delivery must not clear a newer displayed contract",
  );

  const matchingFailure = reconcileUndeliveredQuickReplyContract(context, {
    messageId: "message-offer",
  });
  assert.equal(
    matchingFailure.conversationV2State?.pendingQuickReply,
    undefined,
    "known suppression or non-2xx must clear the contract for buttons LINE did not deliver",
  );
}

function validateOndaChoices() {
  const state = createConversationV2State({ episodeId: "onda-buttons", now: NOW });
  state.knowledge.treatmentKeys = ["onda_pro"];
  const opening = withConversationV2QuickReplies(plan({ treatmentKeys: ["onda_pro"] }), state);
  assert.deepEqual(labels(opening.quickReplyItems), ["雙下巴／嘴邊肉", "身體局部脂肪", "療程特色", "價格／活動"]);

  state.knowledge.concernKeys = ["jawline_looseness"];
  const followup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["onda_pro"],
  }), state);
  assert.deepEqual(labels(followup.quickReplyItems), ["脂肪堆積", "下顎線鬆弛", "ONDA＋肉毒組合", "預約免費諮詢"]);

  state.knowledge.concernKeys = ["local_contour"];
  const bodyFollowup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["onda_pro"],
  }), state);
  assert.deepEqual(labels(bodyFollowup.quickReplyItems), ["手臂", "腹部／腰側", "大腿／臀部", "預約免費諮詢"]);
}

function validateBotoxChoices() {
  const state = createConversationV2State({ episodeId: "botox-buttons", now: NOW });
  state.knowledge.treatmentKeys = ["botox"];
  const opening = withConversationV2QuickReplies(plan({ treatmentKeys: ["botox"] }), state);
  assert.deepEqual(labels(opening.quickReplyItems), ["動態紋", "咀嚼肌／小臉", "肩頸／小腿", "腋下／手汗"]);

  state.knowledge.concernKeys = ["masseter_contour"];
  const followup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["botox"],
  }), state);
  assert.deepEqual(labels(followup.quickReplyItems), ["臉型偏寬", "咬肌緊繃", "價格／活動", "預約免費諮詢"]);

  state.knowledge.concernKeys = ["dynamic_wrinkles"];
  const wrinklesFollowup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["botox"],
  }), state);
  assert.deepEqual(labels(wrinklesFollowup.quickReplyItems), ["做表情時明顯", "平時也看得到", "價格／活動", "預約免費諮詢"]);

  state.knowledge.concernKeys = ["muscle_contour"];
  const muscleFollowup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["botox"],
  }), state);
  assert.deepEqual(labels(muscleFollowup.quickReplyItems), ["肌肉線條", "緊繃感", "價格／活動", "預約免費諮詢"]);

  state.knowledge.concernKeys = ["localized_sweating"];
  const sweatingFollowup = withConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["botox"],
  }), state);
  assert.deepEqual(labels(sweatingFollowup.quickReplyItems), ["腋下多汗", "手汗", "價格／活動", "預約免費諮詢"]);
}

function validateEveryConfiguredSemanticChoiceResolves() {
  for (const treatment of clinicConfig.treatmentList) {
    for (const choice of treatment.consultationGuide?.customerQuickReplies ?? []) {
      if (!choice.semantic) continue;
      const resolved = buildConversationV2QuickReplySelection({
        choice,
        clinic: clinicConfig,
        treatmentKey: treatment.key,
      });
      assert.ok(
        resolved,
        `${treatment.key}/${choice.stage}/${choice.label} must resolve to one trusted semantic choice`,
      );
      assert.equal(resolved.nextStage, choice.nextStage);
    }
  }
}

function validateEveryConfiguredChoiceHasCustomerDestination() {
  const assets = buildTreatmentReplyAssets(clinicConfig);

  for (const treatment of clinicConfig.treatmentList) {
    const guide = treatment.consultationGuide;
    for (const choice of guide?.customerQuickReplies ?? []) {
      assert.ok(choice.label.trim(), `${treatment.key}/${choice.stage} must have a visible label`);
      assert.ok(choice.text.trim(), `${treatment.key}/${choice.stage}/${choice.label} must send customer text`);

      const state = createConversationV2State({
        episodeId: `configured-choice-${treatment.key}-${choice.stage}-${choice.label}`,
        now: NOW,
      });
      state.knowledge.treatmentKeys = [treatment.key];
      state.knowledge.concernKeys = [...(choice.concernKeys ?? [])];
      const projected = withConversationV2QuickReplies(
        plan({ dialogueAct: "answer_followup", treatmentKeys: [treatment.key] }),
        state,
        { nextStage: choice.stage },
      );
      assert.ok(
        projected.quickReplyItems.some((item) =>
          item.action.label === choice.label && item.action.text === choice.text),
        `${treatment.key}/${choice.stage}/${choice.label} must be reachable in a LINE reply`,
      );

      if (choice.semantic) {
        const resolved = buildConversationV2QuickReplySelection({
          choice,
          clinic: clinicConfig,
          treatmentKey: treatment.key,
        });
        assert.ok(resolved, `${treatment.key}/${choice.label} must resolve to a trusted semantic destination`);
        const replyAssetId = resolved.semanticAnchor.replyAssetId ??
          `treatment:${treatment.key}:concern:${resolved.semanticAnchor.concernKeys[0] ?? ""}`;
        const asset = assets.find((item) => item.id === replyAssetId);
        assert.ok(asset?.customerCopy.trim(), `${treatment.key}/${choice.label} must have approved customer copy`);
        assert.ok(
          asset?.followup?.trim() || choice.nextStage === "consultation",
          `${treatment.key}/${choice.label} must either guide the next question or expose consultation actions`,
        );
        continue;
      }

      const bookingAct = classifyBookingSpeechAct(choice.text);
      const hasPlainDestination =
        bookingAct === "create" ||
        choice.text === "我要找真人客服" ||
        isPriceInquiry(choice.text) ||
        (guide?.quickReplies ?? []).some((item) => item.terms.includes(choice.text));
      assert.ok(
        hasPlainDestination,
        `${treatment.key}/${choice.label} must route to booking, handoff, price, or an approved continuation reply`,
      );
    }
  }
}

function validatePendingQuickReplyContractOwnsHistoricalState() {
  const state = createConversationV2State({ episodeId: "multi-history-buttons", now: NOW });
  state.knowledge.treatmentKeys = ["onda_pro", "botox"];
  state.knowledge.concernKeys = ["jawline_looseness"];
  const projected = projectConversationV2QuickReplies(plan({
    dialogueAct: "answer_followup",
    treatmentKeys: ["onda_pro"],
  }), state, {
    clinic: clinicConfig,
    issuedAt: NOW,
    snapshotId: "snapshot-approved-buttons",
  });
  assert.deepEqual(
    labels(projected.plan.quickReplyItems),
    ["脂肪堆積", "下顎線鬆弛", "ONDA＋肉毒組合", "預約免費諮詢"],
  );
  assert.equal(projected.pendingQuickReply?.owner.treatmentKey, "onda_pro");
  assert.equal(projected.pendingQuickReply?.choices.length, 3);

  state.pendingQuickReply = projected.pendingQuickReply;
  state.control = {
    handoff: {
      id: "pending-human-review",
      reason: "pregnancy_nursing_risk",
      requestedAt: NOW,
      status: "pending",
    },
    mode: "handoff_pending",
  };
  const persisted = parsePersistedConversationV2State(JSON.parse(JSON.stringify(state)));
  assert.ok(persisted?.pendingQuickReply, "the approved visible choice contract must survive V2 JSON persistence");
  const selected = resolveConversationV2QuickReplySelection({
    clinic: clinicConfig,
    message: "脂肪堆積",
    now: new Date("2026-08-23T12:05:00.000+08:00"),
    snapshotId: "snapshot-approved-buttons",
    state: persisted,
  });
  assert.deepEqual(
    selected?.semanticAnchor.treatmentKeys,
    ["onda_pro"],
    "the displayed ONDA choice must keep its ONDA owner even when historical state also contains Botox",
  );
  assert.equal(selected?.semanticAnchor.replyAssetId, "treatment:onda_pro:detail:jawline_expectation");
  const humanOwned = structuredClone(persisted);
  humanOwned.control = {
    handoff: {
      id: "active-human-review",
      reason: "pregnancy_nursing_risk",
      requestedAt: NOW,
      status: "active",
    },
    mode: "human_active",
  };
  assert.equal(
    resolveConversationV2QuickReplySelection({
      clinic: clinicConfig,
      message: "脂肪堆積",
      now: new Date("2026-08-23T12:05:00.000+08:00"),
      snapshotId: "snapshot-approved-buttons",
      state: humanOwned,
    }),
    undefined,
    "a human-owned conversation must still reject AI quick-reply handling",
  );
  assert.equal(
    resolveConversationV2QuickReplySelection({
      clinic: clinicConfig,
      message: "脂肪堆積",
      now: new Date("2026-08-23T12:31:00.000+08:00"),
      snapshotId: "snapshot-approved-buttons",
      state: persisted,
    }),
    undefined,
    "a stale visible choice must not take ownership of a later conversation episode",
  );
  const selectedAfterSnapshotRefresh = resolveConversationV2QuickReplySelection({
      clinic: clinicConfig,
      message: "脂肪堆積",
      now: new Date("2026-08-23T12:05:00.000+08:00"),
      snapshotId: "snapshot-content-changed",
      state: persisted,
    });
  assert.equal(
    selectedAfterSnapshotRefresh?.semanticAnchor.replyAssetId,
    "treatment:onda_pro:detail:jawline_expectation",
    "a delivered semantic choice must survive volatile price-source snapshot readiness",
  );
  const consumed = recordConversationV2TurnReceipt(
    persisted,
    "first-accepted-turn-after-offer",
    "2026-08-23T12:06:00.000+08:00",
  );
  assert.equal(
    consumed.pendingQuickReply,
    undefined,
    "the first accepted non-duplicate turn must consume the displayed contract even when it does not match",
  );
  assert.equal(
    resolveConversationV2QuickReplySelection({
      clinic: clinicConfig,
      message: "脂肪堆積",
      state: consumed,
    }),
    undefined,
    "the same text after an intervening turn must not be replayed as an old button tap",
  );
  const duplicateSeed = structuredClone(persisted);
  duplicateSeed.processedTurnIds = ["already-processed"];
  duplicateSeed.lastProcessedTurnId = "already-processed";
  const duplicate = recordConversationV2TurnReceipt(
    duplicateSeed,
    "already-processed",
    "2026-08-23T12:06:00.000+08:00",
  );
  assert.ok(
    duplicate.pendingQuickReply,
    "a duplicate webhook must not consume the contract created by the original reply",
  );

  const legacyMultiState = createConversationV2State({ episodeId: "legacy-multi", now: NOW });
  legacyMultiState.knowledge.treatmentKeys = ["onda_pro", "botox"];
  legacyMultiState.knowledge.concernKeys = ["jawline_looseness"];
  assert.equal(
    resolveConversationV2QuickReplySelection({
      clinic: clinicConfig,
      message: "脂肪堆積",
      state: legacyMultiState,
    }),
    undefined,
    "without a delivered contract, multi-treatment history must never guess the button owner",
  );

  const malformed = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
  malformed.pendingQuickReply = { contractId: "broken" };
  const recovered = parsePersistedConversationV2State(malformed);
  assert.ok(recovered, "a malformed ephemeral choice contract must not discard the core V2 episode");
  assert.equal(recovered.pendingQuickReply, undefined);
  assert.deepEqual(recovered.knowledge.treatmentKeys, ["onda_pro", "botox"]);

  const contextWithContract = createEmptyConversationContext("render-contract-gate");
  contextWithContract.conversationV2State = persisted;
  assert.equal(
    reconcileRenderedQuickReplyContract(contextWithContract, []).conversationV2State?.pendingQuickReply,
    undefined,
    "a terminal renderer fallback that drops the buttons must also drop their pending contract",
  );
  const deliveredItems = projected.plan.quickReplyItems.filter((item) =>
    ["脂肪堆積", "下顎線鬆弛", "ONDA＋肉毒小臉組合"].includes(item.action.text),
  );
  assert.ok(
    reconcileRenderedQuickReplyContract(contextWithContract, deliveredItems)
      .conversationV2State?.pendingQuickReply,
    "the contract remains valid only when the final payload still carries all semantic choices",
  );
}

function validateBookingChoicesAndPayload() {
  const state = createConversationV2State({ episodeId: "booking-buttons", now: NOW });
  state.bookingTask = {
    draft: { timeSlots: [], treatmentKeys: ["onda_pro"] },
    expectedField: "branch",
    id: "booking-buttons",
    intent: "create",
    status: "collecting",
  };
  const withBranches = withConversationV2QuickReplies(plan({ treatmentKeys: ["onda_pro"] }), state);
  assert.deepEqual(labels(withBranches.quickReplyItems), ["高雄館", "台中館", "桃園館", "林口館"]);

  const payload = buildReplyPayload(
    "reply-token",
    "請問較方便前往哪個館別？",
    false,
    [{ type: "text", text: "請問較方便前往哪個館別？", quickReply: { items: withBranches.quickReplyItems } }],
  );
  const textMessage = payload.messages
    .filter((message): message is LineTextMessage => message.type === "text")
    .find((message) => (message.quickReply?.items.length ?? 0) > 0);
  assert.deepEqual(
    textMessage?.type === "text" ? textMessage.quickReply?.items.map((item) => item.action.label) : [],
    ["高雄館", "台中館", "桃園館", "林口館"],
    "explicit V2 quick replies must survive the final LINE payload builder",
  );

  state.bookingTask.expectedField = "first_visit";
  const withFirstVisit = withConversationV2QuickReplies(plan(), state);
  assert.deepEqual(labels(withFirstVisit.quickReplyItems), ["初診", "複診"]);
}

function validatePriceCallToAction() {
  const state = createConversationV2State({ episodeId: "price-buttons", now: NOW });
  state.lastProcessedTurnId = "price-turn";
  state.knowledge.treatmentKeys = ["onda_pro"];
  const projection = projectConversationV2QuickReplies(
    plan({ dialogueAct: "quote_approved_price", treatmentKeys: ["onda_pro"] }),
    state,
    { clinic: clinicConfig, issuedAt: NOW, snapshotId: "price-snapshot" },
  );
  assert.deepEqual(
    labels(projection.plan.quickReplyItems),
    ["ONDA＋肉毒組合", "預約免費諮詢", "真人客服協助"],
  );
  assert.equal(
    projection.pendingQuickReply?.choices.length,
    1,
    "a yes/no comparison invitation must persist exactly one approved semantic answer",
  );
  const projectedState = structuredClone(state);
  projectedState.pendingQuickReply = projection.pendingQuickReply;
  for (const message of ["ONDA＋肉毒小臉組合", "好"] as const) {
    const selected = resolveConversationV2QuickReplySelection({
      clinic: clinicConfig,
      message,
      now: new Date(NOW),
      snapshotId: "price-snapshot",
      state: projectedState,
    });
    assert.equal(selected?.semanticAnchor.questionAspect, "single_vs_combination");
    assert.equal(selected?.semanticAnchor.replyAssetId, "treatment:onda_pro:detail:jawline_combination_difference");
  }
}

async function validateLiveRuntimeAttachesV2Choices() {
  const frame: NluFrame = {
    areas: [],
    confidence: 0.99,
    concerns: [],
    dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
    intents: ["treatment"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments: ["onda_pro"],
  };
  const routed = await routeConversationV2Canary({
    context: createEmptyConversationContext("U-v2-buttons"),
    eventIdentity: "quick-replies-live-route",
    message: "我想了解 ONDA",
    now: new Date(NOW),
    sourceType: "user",
    sourceUserId: "U-v2-buttons",
  }, {
    factsProvider: createStaticClinicFactsProvider(),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-v2-buttons"], mode: "canary" }),
    requestFrame: async () => ({
      errorCode: null,
      frame,
      latencyMs: 1,
      model: "fixture",
      promptVersion: "fixture",
      tokensIn: 1,
      tokensOut: 1,
    }),
  });
  assert.equal(routed.kind, "routed");
  assert.deepEqual(
    labels(routed.decision.replyPlan?.quickReplyItems ?? []),
    ["雙下巴／嘴邊肉", "身體局部脂肪", "療程特色", "價格／活動"],
    "the live V2 route must attach ONDA choices before rendering",
  );
}

function validateFallbackChoicesRespectConversationOwnership() {
  const state = createConversationV2State({ episodeId: "fallback-buttons", now: NOW });
  const fallback = withConversationV2QuickReplies(plan({ dialogueAct: "clarify" }), state);
  assert.deepEqual(
    labels(fallback.quickReplyItems),
    ["了解 ONDA", "了解肉毒", "預約免費諮詢", "真人客服協助"],
    "a genuine generic fallback must provide four deterministic exits",
  );

  state.control = {
    handoff: {
      id: "fallback-pending-human",
      reason: "human_request",
      requestedAt: NOW,
      status: "pending",
    },
    mode: "handoff_pending",
  };
  assert.deepEqual(
    labels(withConversationV2QuickReplies(plan({ dialogueAct: "clarify" }), state).quickReplyItems),
    ["了解 ONDA", "了解肉毒", "預約免費諮詢", "真人客服協助"],
    "waiting for staff must not remove AI fallback choices",
  );

  state.control = {
    handoff: {
      id: "fallback-human-active",
      reason: "human_request",
      requestedAt: NOW,
      status: "active",
    },
    mode: "human_active",
  };
  assert.deepEqual(
    labels(withConversationV2QuickReplies(plan({ dialogueAct: "clarify" }), state).quickReplyItems),
    [],
    "once staff formally takes over, AI must not project fallback choices",
  );
}

async function validateFallbackChoicesHaveLiveDestinations() {
  const dependencies = {
    factsProvider: createStaticClinicFactsProvider(),
    getCanarySettings: () => ({
      allowlistedUserIds: ["U-fallback-buttons", "U-fallback-booking", "U-fallback-handoff"],
      mode: "canary" as const,
    }),
    requestFrame: async () => ({
      errorCode: "nlu_unavailable",
      frame: null,
      latencyMs: 1,
      model: "fixture",
      promptVersion: "fixture",
      tokensIn: 1,
      tokensOut: 0,
    }),
  };
  const route = (userId: string, context: ReturnType<typeof createEmptyConversationContext>, eventIdentity: string, message: string) =>
    routeConversationV2Canary({
      context,
      eventIdentity,
      message,
      now: new Date(NOW),
      sourceType: "user",
      sourceUserId: userId,
    }, dependencies);

  const fallback = await route(
    "U-fallback-buttons",
    createEmptyConversationContext("U-fallback-buttons"),
    "fallback-buttons-open",
    "我不知道要問什麼",
  );
  assert.equal(fallback.kind, "routed");
  assert.deepEqual(
    labels(fallback.decision.replyPlan?.quickReplyItems ?? []),
    ["了解 ONDA", "了解肉毒", "預約免費諮詢", "真人客服協助"],
    "the actual NLU-outage fallback must carry the four LINE choices",
  );

  const bookingContext = fallback.decision.nextContext;
  const booking = await route(
    "U-fallback-booking",
    { ...bookingContext, userId: "U-fallback-booking" },
    "fallback-buttons-booking",
    "我要預約免費諮詢",
  );
  assert.equal(booking.kind, "routed");
  assert.equal(booking.decision.nextContext.conversationV2State?.bookingTask.status, "collecting");
  assert.equal(booking.decision.nextContext.conversationV2State?.bookingTask.expectedField, "treatment");

  const handoffContext = createEmptyConversationContext("U-fallback-handoff");
  const handoff = await route(
    "U-fallback-handoff",
    handoffContext,
    "fallback-buttons-handoff",
    "我要找真人客服",
  );
  assert.equal(handoff.kind, "routed");
  assert.equal(handoff.decision.decisionType, "handoff_pending");
  assert.match(handoff.decision.replyText, /週一至週五 09:00-18:00/u);
  assert.match(handoff.decision.replyText, /國定假日休息/u);
}

async function validateLiveRuntimePersistsAndConsumesVisibleContract() {
  const userId = "U-v2-pending-contract";
  const unavailableProvider = createStaticClinicFactsProvider({
    priceSourceAvailable: false,
    pricingCampaigns: [BOTOX_PRICE],
    snapshotId: "runtime-price-source-unavailable",
  });
  const readyProvider = createStaticClinicFactsProvider({
    pricingCampaigns: [BOTOX_PRICE],
    snapshotId: "runtime-price-ready",
  });
  let snapshotLoads = 0;
  const provider = {
    loadSnapshot: (input: Parameters<typeof readyProvider.loadSnapshot>[0]) => {
      snapshotLoads += 1;
      return (snapshotLoads === 1 ? unavailableProvider : readyProvider).loadSnapshot(input);
    },
  };
  const dependencies = {
    factsProvider: provider,
    getCanarySettings: () => ({ allowlistedUserIds: [userId], mode: "canary" as const }),
    requestFrame: async (message: string) => ({
      errorCode: message === "ONDA" ? null : "nlu_unavailable",
      frame: message === "ONDA"
        ? {
            areas: [],
            confidence: 0.99,
            concerns: [],
            dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
            intents: ["treatment"],
            negated: [],
            safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
            schemaVersion: 2,
            treatments: ["onda_pro"],
          } satisfies NluFrame
        : null,
      latencyMs: 1,
      model: "fixture",
      promptVersion: "fixture",
      tokensIn: 1,
      tokensOut: message === "ONDA" ? 1 : 0,
    }),
  };
  let context = createEmptyConversationContext(userId);
  const route = async (eventIdentity: string, message: string) => {
    const result = await routeConversationV2Canary({
      context,
      eventIdentity,
      message,
      now: new Date(NOW),
      sourceType: "user",
      sourceUserId: userId,
    }, dependencies);
    assert.equal(result.kind, "routed");
    context = result.decision.nextContext;
    return result;
  };

  await route("pending-contract-open", "ONDA");
  assert.equal(
    context.conversationV2State?.pendingQuickReply?.owner.treatmentKey,
    "onda_pro",
    "the actual ONDA reply must persist the owner of its visible semantic choices",
  );
  assert.equal(snapshotLoads, 1, "the first visible ONDA choices are issued while the price source is unavailable");
  context.conversationV2State!.control = {
    handoff: {
      id: "pending-human-review-live",
      reason: "pregnancy_nursing_risk",
      requestedAt: NOW,
      status: "pending",
    },
    mode: "handoff_pending",
  };
  await route("pending-contract-concern", "我想改善雙下巴／嘴邊肉");
  assert.equal(snapshotLoads, 2, "the delivered choice is selected after the price source becomes ready");
  assert.ok(
    context.conversationV2State?.pendingQuickReply?.choices.some((choice) => choice.messageText === "脂肪堆積"),
    "the follow-up LINE reply must persist the exact displayed concern choice",
  );
  context.conversationV2State!.knowledge.treatmentKeys = ["onda_pro", "botox"];
  const fat = await route("pending-contract-fat", "脂肪堆積");
  assert.match(
    fat.decision.replyText,
    /脂肪型困擾/u,
    "a tap must resolve from its delivered contract instead of guessing from multi-treatment history",
  );
  assert.doesNotMatch(fat.decision.replyText, /想先了解這個部位可評估的方向/u);

  const botox = await route("pending-contract-botox", "肉毒");
  assert.match(botox.decision.replyText, /肉毒.*動態紋/us);
  assert.deepEqual(
    labels(botox.decision.replyPlan?.quickReplyItems ?? []),
    ["動態紋", "咀嚼肌／小臉", "肩頸／小腿", "腋下／手汗"],
    "pending human review must not hide the initial Botox choices",
  );
  const dynamicWrinkles = await route("pending-contract-dynamic", "我想改善動態紋");
  assert.match(dynamicWrinkles.decision.replyText, /抬頭紋.*皺眉紋.*魚尾紋/us);
  assert.deepEqual(
    labels(dynamicWrinkles.decision.replyPlan?.quickReplyItems ?? []),
    ["做表情時明顯", "平時也看得到", "價格／活動", "預約免費諮詢"],
  );
  const price = await route("pending-contract-price", "肉毒體驗價多少");
  assert.match(price.decision.replyText, /999/u);
  assert.doesNotMatch(
    price.decision.replyText,
    /12\s*U|Neuronox|優力柔|奇蹟肉毒/iu,
    "the customer price must not expose the intentionally omitted brand or dose",
  );
  const booking = await route("pending-contract-booking", "我要預約免費諮詢");
  assert.equal(booking.decision.nextContext.conversationV2State?.bookingTask.status, "collecting");
  assert.equal(booking.decision.nextContext.conversationV2State?.bookingTask.expectedField, "branch");
}

function quickReplyLabelsFromPayload(messages: readonly LineReplyMessage[]) {
  const message = messages.find((item): item is LineTextMessage =>
    item.type === "text" && (item.quickReply?.items.length ?? 0) > 0,
  );
  return message?.quickReply?.items.map((item) => item.action.label) ?? [];
}

function visibleTextFromPayload(messages: readonly LineReplyMessage[]) {
  return messages
    .filter((item): item is LineTextMessage => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function webhookEvent(input: { id: string; message: string; userId: string }) {
  return JSON.stringify({
    events: [{
      message: { id: input.id, text: input.message, type: "text" },
      replyToken: `reply-${input.id}`,
      source: { type: "user", userId: input.userId },
      timestamp: new Date(NOW).getTime(),
      type: "message",
      webhookEventId: `event-${input.id}`,
    }],
  });
}

async function validateSemanticQuickReplyJourneys() {
  const factsProvider = createStaticClinicFactsProvider({
    pricingCampaigns: [ONDA_PRICE, ONDA_BOTOX_COMBO_PRICE],
  });
  const overviewFrame = (treatmentKey: "botox" | "onda_pro"): NluFrame => ({
    areas: [],
    confidence: 0.99,
    concerns: [],
    dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
    intents: ["treatment"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments: [treatmentKey],
  });
  const routeJourney = (userId: string) =>
    async (input: Parameters<typeof routeConversationV2Canary>[0]) =>
      routeConversationV2Canary(input, {
        factsProvider,
        getCanarySettings: () => ({ allowlistedUserIds: [userId], mode: "canary" as const }),
        requestFrame: async (message) => {
          const treatmentKey = message === "ONDA"
            ? "onda_pro" as const
            : message === "我想了解肉毒"
              ? "botox" as const
              : undefined;
          return {
            errorCode: treatmentKey ? null : "nlu_unavailable",
            frame: treatmentKey ? overviewFrame(treatmentKey) : null,
            latencyMs: 1,
            model: "fixture",
            promptVersion: "fixture",
            tokensIn: 1,
            tokensOut: treatmentKey ? 1 : 0,
          };
        },
      });
  const send = async (input: {
    expectApprovedDeterministic?: boolean;
    id: string;
    message: string;
    userId: string;
  }) => {
    const result = await processWebhookRequestBody(webhookEvent(input), {
      includePending: false,
      routeConversationV2: routeJourney(input.userId),
      routeLegacy: async () => {
        throw new Error("V1 must not run during a semantic V2 quick-reply journey");
      },
    });
    const payload = result.results[0]?.replyPayload;
    assert.ok(payload, `missing LINE payload for ${input.message}`);
    if (input.expectApprovedDeterministic) {
      assert.equal(
        result.results[0]?.usedAiReplyGenerator,
        false,
        `a displayed quick reply must use approved deterministic copy: ${input.message}`,
      );
    }
    return payload;
  };

  const ondaUserId = `U-v2-semantic-onda-${Date.now()}`;
  await send({ id: "semantic-onda-open", message: "ONDA", userId: ondaUserId });
  const featuresUserId = `${ondaUserId}-features`;
  await send({ id: "semantic-features-open", message: "ONDA", userId: featuresUserId });
  const features = await send({
    id: "semantic-onda-features",
    message: "ONDA 療程特色",
    userId: featuresUserId,
  });
  assert.match(visibleTextFromPayload(features.messages), /Coolwaves®.*冷卻控溫/us);
  assert.deepEqual(
    quickReplyLabelsFromPayload(features.messages),
    ["雙下巴／嘴邊肉", "身體局部脂肪", "療程特色", "價格／活動"],
  );
  const jawline = await send({
    expectApprovedDeterministic: true,
    id: "semantic-onda-jawline",
    message: "我想改善雙下巴／嘴邊肉",
    userId: ondaUserId,
  });
  assert.match(visibleTextFromPayload(jawline.messages), /雙下巴.*脂肪肉感/us);
  assert.deepEqual(
    quickReplyLabelsFromPayload(jawline.messages),
    ["脂肪堆積", "下顎線鬆弛", "ONDA＋肉毒組合", "預約免費諮詢"],
  );

  const fat = await send({
    id: "semantic-onda-fat",
    message: "脂肪堆積",
    userId: ondaUserId,
  });
  assert.match(visibleTextFromPayload(fat.messages), /脂肪型困擾/u);
  assert.equal(
    visibleTextFromPayload(fat.messages).match(/以上為 AI 客服順順初步回覆。/gu)?.length,
    1,
    "a deterministic approved-asset reply must carry exactly one AI disclosure",
  );
  assert.deepEqual(
    quickReplyLabelsFromPayload(fat.messages),
    ["單做 ONDA", "ONDA＋肉毒組合", "價格／活動", "預約免費諮詢"],
  );

  const combination = await send({
    id: "semantic-onda-combination",
    message: "ONDA＋肉毒小臉組合",
    userId: ondaUserId,
  });
  const combinationText = visibleTextFromPayload(combination.messages);
  assert.match(combinationText, /ONDA Pro.*肉毒小臉/us);
  assert.match(combinationText, /12,999/u);
  assert.equal(
    combinationText.match(/以上為 AI 客服順順初步回覆。/gu)?.length,
    1,
    "an approved deterministic combination reply must carry exactly one AI disclosure",
  );
  assert.doesNotMatch(combinationText, /哪一項療程|剛剛沒有完整理解/u);
  assert.deepEqual(
    quickReplyLabelsFromPayload(combination.messages),
    ["預約免費諮詢", "真人客服協助", "繼續詢問"],
  );

  const bodyUserId = `${ondaUserId}-body`;
  await send({ id: "semantic-body-open", message: "ONDA", userId: bodyUserId });
  const body = await send({
    id: "semantic-body-concern",
    message: "我想改善身體局部脂肪",
    userId: bodyUserId,
  });
  assert.match(visibleTextFromPayload(body.messages), /身體局部脂肪/u);
  const abdomen = await send({
    id: "semantic-body-abdomen",
    message: "我在意腹部／腰側脂肪",
    userId: bodyUserId,
  });
  assert.match(visibleTextFromPayload(abdomen.messages), /局部脂肪厚度、線條與緊實需求/u);
  assert.deepEqual(
    quickReplyLabelsFromPayload(abdomen.messages),
    ["價格／活動", "預約免費諮詢", "真人客服協助", "繼續詢問"],
  );

  const botoxUserId = `U-v2-semantic-botox-${Date.now()}`;
  await send({ id: "semantic-botox-open", message: "我想了解肉毒", userId: botoxUserId });
  const masseter = await send({
    expectApprovedDeterministic: true,
    id: "semantic-botox-masseter",
    message: "我想改善咀嚼肌／小臉",
    userId: botoxUserId,
  });
  assert.match(visibleTextFromPayload(masseter.messages), /咀嚼肌.*臉型偏寬/us);
  const faceWidth = await send({
    id: "semantic-botox-face-width",
    message: "臉型偏寬",
    userId: botoxUserId,
  });
  const faceWidthText = visibleTextFromPayload(faceWidth.messages);
  assert.match(faceWidthText, /咀嚼肌造成的下半臉偏寬/u);
  assert.doesNotMatch(faceWidthText, /哪一項療程|剛剛沒有完整理解/u);
  assert.deepEqual(
    quickReplyLabelsFromPayload(faceWidth.messages),
    ["預約免費諮詢", "真人客服協助", "繼續詢問"],
  );
}

async function validatePriceDeclinePausesSameTreatmentInvitation() {
  const userId = `U-v2-price-decline-${Date.now()}`;
  const dependencies = {
    factsProvider: createStaticClinicFactsProvider({ pricingCampaigns: [ONDA_PRICE] }),
    getCanarySettings: () => ({ allowlistedUserIds: [userId], mode: "canary" as const }),
    requestFrame: async (message: string) => ({
      errorCode: message === "ONDA" ? null : "nlu_unavailable",
      frame: message === "ONDA"
        ? {
            areas: [],
            confidence: 0.99,
            concerns: [],
            dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
            intents: ["treatment"],
            negated: [],
            safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
            schemaVersion: 2,
            treatments: ["onda_pro"],
          } satisfies NluFrame
        : null,
      latencyMs: 1,
      model: "fixture",
      promptVersion: "fixture",
      tokensIn: 1,
      tokensOut: message === "ONDA" ? 1 : 0,
    }),
  };
  let context = createEmptyConversationContext(userId);
  const route = async (eventIdentity: string, message: string) => {
    const result = await routeConversationV2Canary({
      context,
      eventIdentity,
      message,
      now: new Date(NOW),
      sourceType: "user",
      sourceUserId: userId,
    }, dependencies);
    assert.equal(result.kind, "routed");
    context = result.decision.nextContext;
    return result;
  };

  await route("price-decline-open", "ONDA");
  const firstPrice = await route("price-decline-price-1", "ONDA 體驗價多少");
  assert.ok(
    labels(firstPrice.decision.replyPlan?.quickReplyItems ?? []).includes("預約免費諮詢"),
    "an approved price may invite the first consultation step",
  );
  const declined = await route("price-decline-no", "先不用，暫時不預約");
  assert.equal(
    declined.decision.nextContext.conversationV2State?.bookingTask.status,
    "suspended",
    "declining after a price CTA must persist the paused same-treatment invitation",
  );
  assert.deepEqual(
    declined.decision.nextContext.conversationV2State?.bookingTask.draft.treatmentKeys,
    ["onda_pro"],
    "the paused invitation must retain the exact pricing subject",
  );
  const secondPrice = await route("price-decline-price-2", "ONDA 體驗價多少");
  assert.ok(
    !labels(secondPrice.decision.replyPlan?.quickReplyItems ?? []).includes("預約免費諮詢"),
    "the same treatment must not repeat its booking invitation after a decline",
  );
}

async function validateHumanRequestStartsGuidedBookingWithoutPausingAi() {
  const userId = `U-v2-handoff-booking-${Date.now()}`;
  const dependencies = {
    factsProvider: createStaticClinicFactsProvider(),
    getCanarySettings: () => ({ allowlistedUserIds: [userId], mode: "canary" as const }),
    requestFrame: async (message: string) => ({
      errorCode: message === "ONDA" ? null : "nlu_unavailable",
      frame: message === "ONDA"
        ? {
            areas: [],
            confidence: 0.99,
            concerns: [],
            dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
            intents: ["treatment"],
            negated: [],
            safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
            schemaVersion: 2,
            treatments: ["onda_pro"],
          } satisfies NluFrame
        : null,
      latencyMs: 1,
      model: "fixture",
      promptVersion: "fixture",
      tokensIn: 1,
      tokensOut: message === "ONDA" ? 1 : 0,
    }),
  };
  let context = createEmptyConversationContext(userId);
  const route = async (eventIdentity: string, message: string) => {
    const result = await routeConversationV2Canary({
      context,
      eventIdentity,
      message,
      now: new Date(NOW),
      sourceType: "user",
      sourceUserId: userId,
    }, dependencies);
    assert.equal(result.kind, "routed");
    context = result.decision.nextContext;
    return result;
  };

  await route("handoff-booking-open", "ONDA");
  const handoff = await route("handoff-booking-request", "我要找真人客服");
  assert.equal(handoff.decision.nextContext.conversationV2State?.control.mode, "handoff_pending");
  assert.equal(handoff.decision.nextContext.conversationV2State?.bookingTask.status, "collecting");
  assert.equal(handoff.decision.nextContext.conversationV2State?.bookingTask.expectedField, "branch");
  assert.match(handoff.decision.replyText, /真人客服服務時間.*週一至週五 09:00-18:00/u);
  assert.match(handoff.decision.replyText, /先幫您整理預約資料.*較方便前往哪個館別/su);
  assert.deepEqual(
    labels(handoff.decision.replyPlan?.quickReplyItems ?? []),
    ["高雄館", "台中館", "桃園館", "林口館"],
    "a human request must offer the first guided booking choices",
  );

  const branch = await route("handoff-booking-branch", "高雄館");
  assert.equal(
    branch.decision.nextContext.conversationV2State?.control.mode,
    "handoff_pending",
    "AI must remain active until staff explicitly takes ownership",
  );
  assert.equal(branch.decision.nextContext.conversationV2State?.bookingTask.expectedField, "time_slots");
  assert.match(branch.decision.replyText, /3 個方便的日期與時段/u);
}

async function validateFinalWebhookPayload() {
  const userId = `U-v2-quick-replies-e2e-${Date.now()}`;
  const fixtureRoute = (value: NluFrame | null) =>
    async (input: Parameters<typeof routeConversationV2Canary>[0]) =>
      routeConversationV2Canary(input, {
        factsProvider: createStaticClinicFactsProvider({ pricingCampaigns: [ONDA_PRICE] }),
        getCanarySettings: () => ({
          allowlistedUserIds: [userId, `${userId}-booking`],
          mode: "canary" as const,
        }),
        requestFrame: async () => ({
          errorCode: value ? null : "nlu_unavailable",
          frame: value,
          latencyMs: 1,
          model: "fixture",
          promptVersion: "fixture",
          tokensIn: 1,
          tokensOut: 1,
        }),
      });

  const priceFrame: NluFrame = {
    areas: [],
    confidence: 0.99,
    concerns: [],
    dialogue: { focus: "price_unspecified", move: "continue", reference: "explicit", speechAct: "ask_price" },
    intents: ["pricing"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments: ["onda_pro"],
  };
  const price = await processWebhookRequestBody(
    webhookEvent({ id: "v2-price", message: "ONDA 體驗價多少", userId }),
    {
      includePending: false,
      routeConversationV2: fixtureRoute(priceFrame),
      routeLegacy: async () => {
        throw new Error("V1 must not run when the V2 price route is eligible");
      },
    },
  );
  const pricePayload = price.results[0]?.replyPayload;
  assert.ok(pricePayload, "the final webhook payload must exist for an approved V2 price reply");
  assert.match(JSON.stringify(pricePayload), /16,888/u, "the final payload must retain the approved ONDA price");
  assert.deepEqual(
    quickReplyLabelsFromPayload(pricePayload.messages),
    ["ONDA＋肉毒組合", "預約免費諮詢", "真人客服協助"],
    "the approved-price CTA choices must survive V2 route, renderer, and webhook formatting",
  );

  const seedData = await loadSeedData();
  const productionPriceProvider = createStaticClinicFactsProvider({
    pricingCampaigns: seedData.pricingCampaigns,
  });
  const wrongLearnTreatmentFrame = (treatments: string[]): NluFrame => ({
    areas: [],
    confidence: 0.99,
    concerns: [],
    dialogue: {
      focus: "overview",
      move: "start",
      reference: "active_subject",
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
    treatments,
  });
  for (const [suffix, message, frame] of [
    ["nlu-outage", "ONDA怎麼收費", null],
    [
      "confident-wrong-act",
      "ONDA 體驗價多少",
      {
        areas: [],
        confidence: 0.99,
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
      } satisfies NluFrame,
    ],
    ["original-price-empty-owner", "ONDA原價多少", wrongLearnTreatmentFrame([])],
    ["fee-empty-owner", "ONDA怎麼收費", wrongLearnTreatmentFrame([])],
    [
      "campaign-stale-owner",
      "ONDA有活動嗎",
      {
        ...wrongLearnTreatmentFrame(["botox"]),
        areas: ["face"],
        concerns: [{ area: "face", key: "dynamic_wrinkles" }],
      } satisfies NluFrame,
    ],
  ] as const) {
    const productionUserId = `${userId}-${suffix}`;
    const routed = await processWebhookRequestBody(
      webhookEvent({ id: `v2-price-${suffix}`, message, userId: productionUserId }),
      {
        includePending: false,
        routeConversationV2: (input) => routeConversationV2Canary(input, {
          factsProvider: productionPriceProvider,
          getCanarySettings: () => ({
            allowlistedUserIds: [productionUserId],
            mode: "canary" as const,
          }),
          requestFrame: async () => ({
            errorCode: frame ? null : "nlu_unavailable",
            frame,
            latencyMs: 1,
            model: "fixture",
            promptVersion: "fixture",
            tokensIn: 1,
            tokensOut: frame ? 1 : 0,
          }),
        }),
        routeLegacy: async () => {
          throw new Error("V1 must not run for an explicit V2 ONDA price question");
        },
      },
    );
    const payload = routed.results[0]?.replyPayload;
    assert.ok(payload, `${message}: final LINE payload must exist`);
    const visible = visibleTextFromPayload(payload.messages);
    assert.match(visible, /16,888/u, `${message}: final LINE text must quote the approved ONDA price`);
    assert.match(
      visible,
      /ONDA PRO＋肉毒.*12,999/su,
      `${message}: final LINE text must also identify and quote the approved combination offer`,
    );
    assert.doesNotMatch(
      visible,
      /最想先確認的療程|請告訴我這次最想確認/u,
      `${message}: price must not degrade to generic onboarding copy`,
    );
    assert.doesNotMatch(
      visible,
      /魚尾紋|抬頭紋|皺眉紋|動態紋/u,
      `${message}: stale model concerns must not alter the current-text price campaign or CTA`,
    );
  }

  for (const [suffix, treatments] of [
    ["empty-owner", []],
    ["stale-onda-owner", ["onda_pro"]],
  ] as const) {
    const productionUserId = `${userId}-botox-typo-${suffix}`;
    const routed = await processWebhookRequestBody(
      webhookEvent({
        id: `v2-price-botox-typo-${suffix}`,
        message: "奇蹟肉毒少錢",
        userId: productionUserId,
      }),
      {
        includePending: false,
        routeConversationV2: (input) => routeConversationV2Canary(input, {
          factsProvider: productionPriceProvider,
          getCanarySettings: () => ({
            allowlistedUserIds: [productionUserId],
            mode: "canary" as const,
          }),
          requestFrame: async () => ({
            errorCode: null,
            frame: wrongLearnTreatmentFrame([...treatments]),
            latencyMs: 1,
            model: "fixture",
            promptVersion: "fixture",
            tokensIn: 1,
            tokensOut: 1,
          }),
        }),
        routeLegacy: async () => {
          throw new Error("V1 must not run for an explicit V2 Botox price question");
        },
      },
    );
    const payload = routed.results[0]?.replyPayload;
    assert.ok(payload, `奇蹟肉毒少錢 ${suffix}: final LINE payload must exist`);
    const visible = visibleTextFromPayload(payload.messages);
    assert.match(visible, /999/u, `奇蹟肉毒少錢 ${suffix}: must quote the approved Botox offer`);
    assert.doesNotMatch(
      visible,
      /16,888|12,999|哪一項療程/u,
      `奇蹟肉毒少錢 ${suffix}: must not leak an ONDA owner or generic clarification`,
    );
  }

  const brandedBotoxUserId = `${userId}-botox-brand-price`;
  const brandedBotox = await processWebhookRequestBody(
    webhookEvent({
      id: "v2-price-botox-brand",
      message: "BOTOX 魚尾紋 12U原價多少",
      userId: brandedBotoxUserId,
    }),
    {
      includePending: false,
      routeConversationV2: (input) => routeConversationV2Canary(input, {
        factsProvider: productionPriceProvider,
        getCanarySettings: () => ({
          allowlistedUserIds: [brandedBotoxUserId],
          mode: "canary" as const,
        }),
        requestFrame: async () => ({
          errorCode: null,
          frame: wrongLearnTreatmentFrame(["botox"]),
          latencyMs: 1,
          model: "fixture",
          promptVersion: "fixture",
          tokensIn: 1,
          tokensOut: 1,
        }),
      }),
      routeLegacy: async () => {
        throw new Error("V1 must not run for an explicit V2 branded Botox price question");
      },
    },
  );
  const brandedBotoxPayload = brandedBotox.results[0]?.replyPayload;
  assert.ok(brandedBotoxPayload, "BOTOX原價多少: final LINE payload must exist");
  const brandedBotoxVisible = visibleTextFromPayload(brandedBotoxPayload.messages);
  assert.match(
    brandedBotoxVisible,
    /BOTOX（經典肉毒）方案價格需要由真人客服確認/u,
    "a requested brand without an approved price must be disclosed before offering a generic alternative",
  );
  assert.match(brandedBotoxVisible, /肉毒.*999/su);
  assert.doesNotMatch(
    brandedBotoxVisible,
    /BOTOX[^\n。]*999/iu,
    "the generic 999 offer must not be attributed to BOTOX",
  );
  assert.match(brandedBotoxVisible, /週一至週五\s*09:00-18:00.*國定假日休息/su);
  assert.match(
    brandedBotoxVisible,
    /魚尾紋/u,
    "the final LINE reply must preserve the compatible current concern in its consultation CTA",
  );
  assert.doesNotMatch(
    brandedBotoxVisible,
    /12\s*U/iu,
    "the final LINE reply must not expose the intentionally omitted dose",
  );

  const bookingUserId = `${userId}-booking`;
  const overviewFrame: NluFrame = {
    areas: [],
    confidence: 0.99,
    concerns: [],
    dialogue: { focus: "overview", move: "start", reference: "explicit", speechAct: "learn_treatment" },
    intents: ["treatment"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments: ["onda_pro"],
  };
  await processWebhookRequestBody(
    webhookEvent({ id: "v2-booking-onda", message: "我想了解 ONDA", userId: bookingUserId }),
    {
      includePending: false,
      routeConversationV2: fixtureRoute(overviewFrame),
      routeLegacy: async () => {
        throw new Error("V1 must not run when the V2 ONDA context route is eligible");
      },
    },
  );
  const booking = await processWebhookRequestBody(
    webhookEvent({ id: "v2-booking", message: "我要預約免費諮詢", userId: bookingUserId }),
    {
      includePending: false,
      routeConversationV2: fixtureRoute(null),
      routeLegacy: async () => {
        throw new Error("V1 must not run when explicit V2 booking is eligible");
      },
    },
  );
  const bookingPayload = booking.results[0]?.replyPayload;
  assert.ok(bookingPayload, "the final webhook payload must exist for V2 booking intake");
  assert.deepEqual(
    quickReplyLabelsFromPayload(bookingPayload.messages),
    ["高雄館", "台中館", "桃園館", "林口館"],
    "booking branch choices must survive V2 route, renderer, and webhook formatting",
  );

  const followupUserId = `${userId}-followup`;
  const botoxOverviewFrame: NluFrame = {
    ...overviewFrame,
    treatments: ["botox"],
  };
  const dynamicWrinklesFrame: NluFrame = {
    areas: ["face"],
    confidence: 0.99,
    concerns: [{ area: "face", key: "dynamic_wrinkles" }],
    dialogue: { focus: "benefits", move: "continue", reference: "explicit", speechAct: "ask_concern" },
    intents: ["treatment_consultation"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments: ["botox"],
  };
  const routeFollowupJourney = async (input: Parameters<typeof routeConversationV2Canary>[0]) =>
    routeConversationV2Canary(input, {
      factsProvider: createStaticClinicFactsProvider(),
      getCanarySettings: () => ({ allowlistedUserIds: [followupUserId], mode: "canary" as const }),
      requestFrame: async (message) => ({
        errorCode: null,
        frame: message.includes("動態紋") ? dynamicWrinklesFrame : botoxOverviewFrame,
        latencyMs: 1,
        model: "fixture",
        promptVersion: "fixture",
        tokensIn: 1,
        tokensOut: 1,
      }),
    });
  const botoxOpening = await processWebhookRequestBody(
    webhookEvent({ id: "v2-botox-open", message: "我想了解肉毒", userId: followupUserId }),
    { includePending: false, routeConversationV2: routeFollowupJourney },
  );
  const botoxOpeningPayload = botoxOpening.results[0]?.replyPayload;
  assert.ok(botoxOpeningPayload, "the final webhook payload must exist for the Botox opening");
  assert.match(
    visibleTextFromPayload(botoxOpeningPayload.messages),
    /肉毒.*動態紋/su,
    "a rejected generator must fall back to the approved Botox introduction, not generic onboarding",
  );
  const dynamicWrinkles = await processWebhookRequestBody(
    webhookEvent({ id: "v2-botox-wrinkles", message: "我想改善動態紋", userId: followupUserId }),
    { includePending: false, routeConversationV2: routeFollowupJourney },
  );
  const dynamicPayload = dynamicWrinkles.results[0]?.replyPayload;
  assert.ok(dynamicPayload, "the final webhook payload must exist for an understood Botox concern");
  assert.match(
    visibleTextFromPayload(dynamicPayload.messages),
    /表情肌活動|動態紋位置/u,
    "a Botox dynamic-wrinkle turn must retain its approved concern answer in final LINE text",
  );
  assert.deepEqual(
    quickReplyLabelsFromPayload(dynamicPayload.messages),
    ["做表情時明顯", "平時也看得到", "價格／活動", "預約免費諮詢"],
    "an understood Botox concern must receive its own state-driven next-step buttons in the final LINE payload",
  );

  const flexPlan = legacyDecisionToReplyPlan({
    decisionType: "clinic_info_reply",
    matchedKey: "fixture:v2-flex-quick-replies",
    matchedType: "config",
    replyMessages: [{
      altText: "活動卡片",
      contents: {
        contents: [{ body: { contents: [{ text: "核准活動", type: "text" }], layout: "vertical", type: "box" }, type: "bubble" }],
        type: "carousel",
      },
      type: "flex",
    }],
    replyText: "核准活動內容。",
  }, {
    dialogueAct: "quote_approved_price",
    renderMode: "deterministic",
    treatmentKeys: ["onda_pro"],
  });
  const flexState = createConversationV2State({ episodeId: "flex-buttons", now: NOW });
  flexState.knowledge.treatmentKeys = ["onda_pro"];
  const flexDecision = withConversationV2QuickReplies(flexPlan, flexState);
  const flex = await processWebhookRequestBody(
    webhookEvent({ id: "v2-flex", message: "活動卡片", userId: `${userId}-flex` }),
    {
      includePending: false,
      routeConversationV2: async ({ context }) => ({
        dataStatus: "ready" as const,
        decision: {
          decisionType: "clinic_info_reply" as const,
          matchedKey: flexDecision.matchedKey,
          matchedType: "config" as const,
          nextContext: context,
          replyPlan: flexDecision,
          replyText: flexDecision.fallbackText,
        },
        gate: { eligible: true, reason: "eligible" as const },
        kind: "routed" as const,
      }),
      routeLegacy: async () => {
        throw new Error("V1 must not run when the V2 flex fixture is eligible");
      },
    },
  );
  const flexPayload = flex.results[0]?.replyPayload;
  assert.ok(flexPayload, "the final webhook payload must exist for the V2 flex fixture");
  assert.ok(
    flexPayload.messages.some((message) => message.type === "flex"),
    "webhook formatting must preserve a V2 rich Flex message",
  );
  assert.deepEqual(
    quickReplyLabelsFromPayload(flexPayload.messages),
    ["ONDA＋肉毒組合", "預約免費諮詢", "真人客服協助"],
    "a V2 Flex reply must retain its CTA quick replies after webhook formatting",
  );
}

async function main() {
  validateOndaChoices();
  validateBotoxChoices();
  validateUndeliveredContractCleanup();
  validateEveryConfiguredSemanticChoiceResolves();
  validateEveryConfiguredChoiceHasCustomerDestination();
  validatePendingQuickReplyContractOwnsHistoricalState();
  validateCurrentConcernChoosesQuickReplyOwnerFromHistory();
  validateBookingChoicesAndPayload();
  validatePriceCallToAction();
  validateFallbackChoicesRespectConversationOwnership();
  await validateLiveRuntimeAttachesV2Choices();
  await validateLiveRuntimePersistsAndConsumesVisibleContract();
  await validateSemanticQuickReplyJourneys();
  await validatePriceDeclinePausesSameTreatmentInvitation();
  await validateHumanRequestStartsGuidedBookingWithoutPausingAi();
  await validateFallbackChoicesHaveLiveDestinations();
  await validateFinalWebhookPayload();
  console.log("Conversation V2 quick reply validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
