import assert from "node:assert/strict";

import { runAdminSyncInTwoPhases } from "../src/lib/admin-webhook-sync";
import { clinicOntology } from "../src/lib/clinic-ontology";
import { captureConversationV2ShadowRecord } from "../src/lib/conversation-v2/runtime-shadow";
import {
  replayConversationV2Shadow,
  type ConversationV2ShadowInputRecord,
} from "../src/lib/conversation-v2/shadow";
import { getRuntimeConfig } from "../src/lib/live-demo-config";
import type { NluFrame } from "../src/lib/nlu-frame";
import {
  buildNluShadowConversationTimeline,
  encodeNluShadowFrameForStorage,
  loadNluShadowConversationTimeline,
  type NluShadowObservation,
  type NluShadowTimelineQueryBuilder,
  type NluShadowTimelineQueryClient,
  type NluShadowTimelineRecord,
} from "../src/lib/nlu-shadow-store";

function frame(input: Partial<NluFrame> = {}): NluFrame {
  return {
    areas: [],
    confidence: 0.97,
    concerns: [],
    dialogue: {
      focus: "overview",
      move: "start",
      reference: "explicit",
      speechAct: "learn_treatment",
    },
    intents: ["treatment_consultation"],
    negated: [],
    safety: {
      complaint: false,
      humanRequest: false,
      postTreatmentRisk: false,
      pregnancyNursing: false,
    },
    schemaVersion: 2,
    treatments: [],
    ...input,
  };
}

function record(input: {
  decisionType?: string;
  frame: NluFrame;
  legacyDecision?: Partial<ConversationV2ShadowInputRecord["legacyDecision"]>;
  lineTimestamp: number;
  messageId: string;
  text: string;
}): ConversationV2ShadowInputRecord {
  return {
    frame: input.frame,
    legacyDecision: {
      decisionType: input.decisionType ?? "treatment_intro_reply",
      matchedKey: "fixture",
      matchedType: "guided_reply",
      ...input.legacyDecision,
    },
    lineMessageId: `line-${input.messageId}`,
    lineTimestamp: input.lineTimestamp,
    messageId: input.messageId,
    sourceEventId: `event-${input.messageId}`,
    text: input.text,
  };
}

function timelineRecord(value: ConversationV2ShadowInputRecord): NluShadowTimelineRecord {
  return { ...value, divergenceCategories: [] };
}

async function main() {
const onda = record({
  frame: frame({ treatments: ["onda_pro"] }),
  lineTimestamp: 1_000,
  messageId: "db-onda",
  text: "想了解 ONDA",
});
const contextualPrice = record({
  decisionType: "pricing_auto_reply",
  frame: frame({
    dialogue: {
      focus: "price_unspecified",
      move: "continue",
      reference: "active_subject",
      speechAct: "ask_price",
    },
    intents: ["pricing"],
  }),
  lineTimestamp: 2_000,
  messageId: "db-price",
  text: "那價錢呢",
});
const correction = record({
  frame: frame({
    dialogue: {
      focus: "overview",
      move: "replace",
      reference: "explicit",
      speechAct: "learn_treatment",
    },
    negated: [{ key: "onda_pro", type: "treatment" }],
    treatments: ["botox"],
  }),
  lineTimestamp: 3_000,
  messageId: "db-correction",
  text: "不是 ONDA，我想了解肉毒",
});

const replay = replayConversationV2Shadow({
  episodeId: "shadow:conversation-1",
  records: [correction, contextualPrice, onda],
  tenantId: "tenant_001",
  totalCustomerMessages: 3,
  userId: "line-user-1",
});
assert.equal(replay.replayStatus, "complete");
assert.deepEqual(
  replay.turns.map((turn) => turn.messageId),
  ["db-onda", "db-price", "db-correction"],
  "shadow replay must follow LINE timestamps, not after() completion order",
);
assert.deepEqual(
  (replay.turns[1]?.action as { treatmentKeys?: string[] })?.treatmentKeys,
  ["onda_pro"],
  "a contextual price question must resolve against canonical V2 knowledge",
);
assert.deepEqual(
  (replay.finalState.knowledge as { treatmentKeys?: string[] }).treatmentKeys,
  ["botox"],
  "an affirmed correction must replace the prior treatment without retaining negated ONDA",
);
assert.equal(
  replay.turns[2]?.understanding.treatments.find((item) => item.key === "onda_pro")?.polarity,
  "negated",
  "negated entities must remain reviewable and never become canonical knowledge",
);
assert.ok(replay.turns.every((turn) => turn.divergenceCategories.length === 0));
assert.equal(replay.schemaVersion, 2, "shadow records must identify the V2 semantic schema");
assert.equal(replay.adapterVersion, "nlu-frame-adapter-v2");
assert.equal(replay.policyVersion, "conversation-v2-policy-v2");
assert.equal(replay.turns[1]?.understanding.questionAspect, "price_unspecified");
assert.equal(replay.turns[1]?.understanding.conversationMove, "continue");
assert.equal(replay.turns[1]?.understanding.dialogueReference, "active_subject");

const learnOnly = replayConversationV2Shadow({
  episodeId: "shadow:learn",
  records: [record({
    frame: frame({ treatments: ["botox"] }),
    lineTimestamp: 1,
    messageId: "learn",
    text: "想諮詢肉毒",
  })],
  tenantId: "tenant_001",
  userId: "line-user-1",
});
assert.equal(learnOnly.turns[0]?.action?.type, "learn_treatment", "consultation interest must not start booking");

const explicitBooking = replayConversationV2Shadow({
  episodeId: "shadow:booking",
  records: [record({
    decisionType: "booking_intake_reply",
    frame: frame({ intents: ["booking", "treatment_consultation"], treatments: ["botox"] }),
    lineTimestamp: 1,
    messageId: "booking",
    text: "我想預約肉毒",
  })],
  tenantId: "tenant_001",
  userId: "line-user-1",
});
assert.equal(explicitBooking.turns[0]?.action?.type, "start_booking", "explicit booking language must start booking");

const urgent = replayConversationV2Shadow({
  episodeId: "shadow:safety",
  records: [record({
    decisionType: "medical_guidance_reply",
    frame: frame({
      intents: ["post_treatment_risk"],
      safety: {
        complaint: false,
        humanRequest: false,
        postTreatmentRisk: true,
        pregnancyNursing: false,
      },
    }),
    lineTimestamp: 1,
    messageId: "safety",
    text: "打完後呼吸困難",
  })],
  tenantId: "tenant_001",
  userId: "line-user-1",
});
assert.equal(urgent.turns[0]?.action?.type, "answer_safety", "urgent post-treatment risk must outrank all sales dialogue");

const deterministicUrgent = replayConversationV2Shadow({
  episodeId: "shadow:deterministic-safety",
  records: [record({
    frame: frame(),
    legacyDecision: {
      decisionType: "handoff_pending",
      matchedKey: "post_procedure_emergency",
      matchedType: "handoff_rule",
    },
    lineTimestamp: 1,
    messageId: "deterministic-safety",
    text: "打完後呼吸困難",
  })],
  tenantId: "tenant_001",
  userId: "line-user-1",
});
assert.equal(
  deterministicUrgent.turns[0]?.action?.type,
  "answer_safety",
  "deterministic emergency preflight must override a benign model frame",
);

const deterministicHandoff = replayConversationV2Shadow({
  episodeId: "shadow:deterministic-handoff",
  records: [record({
    frame: frame(),
    legacyDecision: {
      decisionType: "handoff_pending",
      matchedKey: "human_request",
      matchedType: "handoff_rule",
    },
    lineTimestamp: 1,
    messageId: "deterministic-handoff",
    text: "我要找真人客服",
  })],
  tenantId: "tenant_001",
  userId: "line-user-1",
});
assert.equal(
  deterministicHandoff.turns[0]?.action?.type,
  "queue_handoff",
  "deterministic handoff preflight must override a benign model frame",
);

const duplicated = replayConversationV2Shadow({
  episodeId: "shadow:dedupe",
  records: [onda, structuredClone(onda)],
  tenantId: "tenant_001",
  totalCustomerMessages: 1,
  userId: "line-user-1",
});
assert.equal(duplicated.coverage.duplicateRecordCount, 1, "LINE retries must replay exactly once");

const timeline = buildNluShadowConversationTimeline({
  episodeKey: "ep_current",
  messageRows: [
    {
      content: "想了解 ONDA",
      created_at: "2026-08-14T01:00:00.000Z",
      id: "db-onda",
      line_message_id: "line-db-onda",
      payload_json: { dialogue_episode_key: "ep_current", event_timestamp: 1234 },
      source_event_id: "event-db-onda",
    },
    {
      content: "這一則沒有 frame",
      created_at: "2026-08-14T01:01:00.000Z",
      id: "db-missing",
      line_message_id: "line-db-missing",
      payload_json: { dialogue_episode_key: "ep_current", event_timestamp: 2345 },
      source_event_id: "event-db-missing",
    },
    {
      content: "舊 episode",
      created_at: "2026-08-13T01:00:00.000Z",
      id: "db-old",
      line_message_id: "line-db-old",
      payload_json: { dialogue_episode_key: "ep_old", event_timestamp: 1 },
      source_event_id: "event-db-old",
    },
  ],
  observationRows: [{
    deterministic_decision: onda.legacyDecision,
    message_id: "db-onda",
    nlu_frame: onda.frame,
  }],
});
assert.equal(timeline.totalCustomerMessages, 2, "episode filtering must exclude old dialogue state");
assert.equal(timeline.records.length, 1, "missing frames must reduce coverage instead of inventing understanding");
assert.equal(timeline.records[0]?.lineTimestamp, 1234, "LINE event time must outrank server insertion time");

const futureOntology = {
  ...clinicOntology,
  treatments: [
    ...clinicOntology.treatments,
    {
      aliases: ["未來儀器"],
      category: "energy" as const,
      key: "future_device",
      name: "未來儀器",
    },
  ],
};
const futureFrame = frame({ treatments: ["future_device"] });
const encodedFutureFrame = encodeNluShadowFrameForStorage({
  confidence: futureFrame.confidence,
  deterministicDecision: onda.legacyDecision,
  divergenceCategories: [],
  errorCode: null,
  frame: futureFrame,
  latencyMs: 1,
  messageId: "db-future",
  model: "fixture",
  ontology: futureOntology,
  ontologySnapshotId: "catalog-future-v1",
  promptVersion: "fixture",
  tokensIn: 0,
  tokensOut: 0,
});
assert.ok(
  !JSON.stringify(encodedFutureFrame).includes("想了解未來儀器"),
  "stored ontology envelopes must never include customer message text",
);
const futureTimeline = buildNluShadowConversationTimeline({
  messageRows: [{
    content: "想了解未來儀器",
    created_at: "2026-08-14T01:02:00.000Z",
    id: "db-future",
    line_message_id: "line-db-future",
    payload_json: { event_timestamp: 3456 },
    source_event_id: "event-db-future",
  }],
  observationRows: [{
    deterministic_decision: onda.legacyDecision,
    message_id: "db-future",
    nlu_frame: encodedFutureFrame,
  }],
});
assert.equal(futureTimeline.records.length, 1, "a future treatment frame must survive storage and replay parsing");
assert.equal(futureTimeline.records[0]?.ontologySnapshotId, "catalog-future-v1");
const futureReplay = replayConversationV2Shadow({
  episodeId: "shadow:future",
  records: futureTimeline.records,
  tenantId: "tenant_001",
  userId: "line-user-1",
});
assert.equal(futureReplay.turns[0]?.ontologySnapshotId, "catalog-future-v1");
assert.deepEqual(
  (futureReplay.turns[0]?.action as { treatmentKeys?: string[] })?.treatmentKeys,
  ["future_device"],
  "replay must adapt a stored frame with the ontology snapshot used at inference time",
);

function timelineQueryClient(input: {
  audit: {
    chunks: number[];
    limits: number[];
    orders: Array<{ ascending: boolean; column: string }>;
    tables: string[];
  };
  messageCount?: number;
  ownerUserId: string;
}): NluShadowTimelineQueryClient {
  return {
    from(table) {
      input.audit.tables.push(table);
      const builder = {} as NluShadowTimelineQueryBuilder;
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.order = (column, options) => {
        input.audit.orders.push({ ascending: options.ascending, column });
        return builder;
      };
      builder.limit = async (count) => {
        input.audit.limits.push(count);
        const data = Array.from({ length: input.messageCount ?? 0 }, (_, index) => ({
          content: `fixture-${index}`,
          created_at: new Date(1_000 + index).toISOString(),
          id: `message-${index}`,
          line_message_id: `line-${index}`,
          payload_json: { event_timestamp: 1_000 + index },
          source_event_id: `event-${index}`,
        }));
        return { data, error: null };
      };
      builder.in = async (_column, values) => {
        input.audit.chunks.push(values.length);
        return {
          data: values.map((messageId) => ({
            deterministic_decision: onda.legacyDecision,
            divergence_categories: [],
            message_id: messageId,
            nlu_frame: onda.frame,
          })),
          error: null,
        };
      };
      builder.maybeSingle = async <T>() => ({
        data: { id: "conversation-loader", line_user_id: input.ownerUserId } as T,
        error: null,
      });
      return builder;
    },
  };
}

const ownerMismatchAudit = { chunks: [] as number[], limits: [] as number[], orders: [] as Array<{ ascending: boolean; column: string }>, tables: [] as string[] };
await assert.rejects(
  loadNluShadowConversationTimeline(
    {
      conversationId: "conversation-loader",
      expectedUserId: "expected-user",
      promptVersion: "fixture-prompt",
    },
    {
      client: timelineQueryClient({ audit: ownerMismatchAudit, ownerUserId: "foreign-user" }),
      hasServerConfig: () => true,
    },
  ),
  /owner mismatch/u,
);
assert.deepEqual(
  ownerMismatchAudit.tables,
  ["conversations"],
  "owner mismatch must fail before customer messages or observations are queried",
);

const loaderAudit = { chunks: [] as number[], limits: [] as number[], orders: [] as Array<{ ascending: boolean; column: string }>, tables: [] as string[] };
const loadedTimeline = await loadNluShadowConversationTimeline(
  {
    conversationId: "conversation-loader",
    expectedUserId: "expected-user",
    promptVersion: "fixture-prompt",
  },
  {
    client: timelineQueryClient({ audit: loaderAudit, messageCount: 101, ownerUserId: "expected-user" }),
    hasServerConfig: () => true,
  },
);
assert.deepEqual(loaderAudit.orders, [{ ascending: false, column: "created_at" }]);
assert.deepEqual(loaderAudit.limits, [200], "runtime replay must cap the newest customer-message window");
assert.deepEqual(loaderAudit.chunks, [50, 50, 1], "observation lookup must stay below the 50-id query chunk");
assert.equal(loadedTimeline.records.length, 101);

const phaseOrder: string[] = [];
await runAdminSyncInTwoPhases(["A", "B"], {
  persistCore: async (item) => {
    phaseOrder.push(`core:${item}`);
    return item;
  },
  captureShadow: async (item) => {
    phaseOrder.push(`shadow:${item}`);
  },
});
assert.deepEqual(
  phaseOrder,
  ["core:A", "core:B", "shadow:A", "shadow:B"],
  "all AI/handoff/booking persistence must finish before any multi-event shadow work",
);

delete process.env.CONVERSATION_V2_MODE;
delete process.env.OPENAI_NLU_DECISION_MODE;
delete process.env.OPENAI_NLU_MODE;
assert.equal(getRuntimeConfig().conversationV2Mode, "off", "Conversation V2 shadow must default off");
process.env.CONVERSATION_V2_MODE = "shadow";
assert.equal(getRuntimeConfig().conversationV2Mode, "shadow", "explicit shadow mode must be accepted");
process.env.CONVERSATION_V2_MODE = "decision";
assert.throws(() => getRuntimeConfig(), /Unsupported CONVERSATION_V2_MODE/u);
delete process.env.CONVERSATION_V2_MODE;
process.env.OPENAI_NLU_MODE = "shadow";
process.env.OPENAI_NLU_DECISION_MODE = "canary";
assert.doesNotThrow(
  () => getRuntimeConfig(),
  "V2 off must preserve a pre-existing NLU shadow plus canary deployment",
);
process.env.CONVERSATION_V2_MODE = "shadow";
assert.throws(
  () => getRuntimeConfig(),
  /one message must make at most one NLU request/u,
  "NLU canary and shadow must not make duplicate model calls",
);
delete process.env.CONVERSATION_V2_MODE;
delete process.env.OPENAI_NLU_DECISION_MODE;
delete process.env.OPENAI_NLU_MODE;

const observation: NluShadowObservation = {
  confidence: 0.97,
  deterministicDecision: onda.legacyDecision,
  divergenceCategories: [],
  errorCode: null,
  frame: onda.frame,
  latencyMs: 10,
  messageId: onda.messageId,
  model: "fixture-model",
  promptVersion: "fixture-prompt",
  tokensIn: 10,
  tokensOut: 5,
};
let offLoadCalls = 0;
const offResult = await captureConversationV2ShadowRecord(
  { conversationId: "conversation-1", observation, sourceUserId: "line-user-1" },
  {
    getMode: () => "off",
    loadTimeline: async () => {
      offLoadCalls += 1;
      return { records: [timelineRecord(onda)], totalCustomerMessages: 1 };
    },
  },
);
assert.equal(offResult, null);
assert.equal(offLoadCalls, 0, "default-off mode must not read replay history");

const patchedValues: Array<{
  deterministicDecision: NluShadowObservation["deterministicDecision"];
  divergenceCategories: string[];
  messageId: string;
}> = [];
const captured = await captureConversationV2ShadowRecord(
  { conversationId: "conversation-1", lineTimestamp: onda.lineTimestamp, observation, sourceUserId: "line-user-1" },
  {
    getMode: () => "shadow",
    loadTimeline: async () => ({ records: [timelineRecord(onda)], totalCustomerMessages: 2 }),
    patch: async (value) => { patchedValues.push(value); },
  },
);
assert.equal(captured?.turn?.action?.type, "learn_treatment");
assert.equal(captured?.coverage.complete, false, "runtime replay cannot claim a settled watermark");
assert.equal(captured?.coverage.provisional, true);
const stored = patchedValues[0];
assert.ok(stored?.divergenceCategories.includes("v2_incomplete_history"));
assert.ok(stored?.deterministicDecision.conversationV2, "V2 record must enrich the existing observation row");
const persistedJson = JSON.stringify(stored?.deterministicDecision.conversationV2);
assert.ok(!persistedJson.includes(onda.text), "V2 diagnostics must not duplicate customer message text");
assert.ok(!persistedJson.includes("line-user-1"), "V2 diagnostics must not duplicate the LINE user id");
for (const rawLineIdentity of ["line-db-onda", "event-db-onda", "message:line-db-onda"]) {
  assert.ok(
    !persistedJson.includes(rawLineIdentity),
    "V2 diagnostics must not persist raw LINE message or event identities",
  );
}
const storedTurn = stored?.deterministicDecision.conversationV2 as {
  turn?: {
    action?: { turnId?: string };
    understanding?: { turnId?: string };
  };
} | undefined;
assert.match(storedTurn?.turn?.action?.turnId ?? "", /^turn_[a-f0-9]{16}$/u);
assert.equal(
  storedTurn?.turn?.action?.turnId,
  storedTurn?.turn?.understanding?.turnId,
  "opaque turn identity must correlate action and understanding without exposing LINE ids",
);

const staleCategoryPatches: typeof patchedValues = [];
await captureConversationV2ShadowRecord(
  { conversationId: "conversation-stale", lineTimestamp: onda.lineTimestamp, observation, sourceUserId: "line-user-1" },
  {
    getMode: () => "shadow",
    loadTimeline: async () => ({
      records: [{
        ...timelineRecord(onda),
        divergenceCategories: ["safety_disagreement", "v2_action_disagreement"],
      }],
      totalCustomerMessages: 1,
    }),
    patch: async (value) => { staleCategoryPatches.push(value); },
  },
);
assert.ok(staleCategoryPatches[0]?.divergenceCategories.includes("safety_disagreement"));
assert.ok(
  !staleCategoryPatches[0]?.divergenceCategories.includes("v2_action_disagreement"),
  "a corrected replay must replace stale V2 disagreement categories while preserving base NLU findings",
);

function observationFor(value: ConversationV2ShadowInputRecord): NluShadowObservation {
  return {
    ...observation,
    deterministicDecision: value.legacyDecision,
    frame: value.frame,
    messageId: value.messageId,
  };
}

const latePatches: typeof patchedValues = [];
await captureConversationV2ShadowRecord(
  {
    conversationId: "conversation-late",
    lineTimestamp: contextualPrice.lineTimestamp,
    observation: observationFor(contextualPrice),
    sourceUserId: "line-user-1",
  },
  {
    getMode: () => "shadow",
    loadTimeline: async () => ({ records: [timelineRecord(contextualPrice)], totalCustomerMessages: 1 }),
    patch: async (value) => { latePatches.push(value); },
  },
);
await captureConversationV2ShadowRecord(
  {
    conversationId: "conversation-late",
    lineTimestamp: onda.lineTimestamp,
    observation: observationFor(onda),
    sourceUserId: "line-user-1",
  },
  {
    getMode: () => "shadow",
    loadTimeline: async () => ({
      records: [timelineRecord(contextualPrice), timelineRecord(onda)],
      totalCustomerMessages: 2,
    }),
    patch: async (value) => { latePatches.push(value); },
  },
);
const repairedPrice = [...latePatches].reverse().find((value) => value.messageId === contextualPrice.messageId);
const repairedEnvelope = repairedPrice?.deterministicDecision.conversationV2 as {
  turn?: { action?: { treatmentKeys?: string[] } };
} | undefined;
assert.deepEqual(
  repairedEnvelope?.turn?.action?.treatmentKeys,
  ["onda_pro"],
  "a late older callback must backfill every visible later turn, not only itself",
);

const conflictingOnda = {
  ...timelineRecord(correction),
  lineMessageId: onda.lineMessageId,
  messageId: "db-conflicting-onda",
};
const conflictPatches: typeof patchedValues = [];
const conflictEnvelope = await captureConversationV2ShadowRecord(
  {
    conversationId: "conversation-conflict",
    lineTimestamp: onda.lineTimestamp,
    observation,
    sourceUserId: "line-user-1",
  },
  {
    getMode: () => "shadow",
    loadTimeline: async () => ({
      records: [timelineRecord(onda), conflictingOnda],
      totalCustomerMessages: 2,
    }),
    patch: async (value) => { conflictPatches.push(value); },
  },
);
assert.equal(conflictEnvelope?.replayStatus, "conflict");
assert.equal(conflictEnvelope?.errorCode, "replay_conflict");
assert.equal(conflictEnvelope?.turn, null, "a conflicting LINE identity must never pick an arbitrary turn");
assert.ok(
  conflictPatches[0]?.divergenceCategories.includes("v2_replay_conflict"),
  "runtime conflict diagnostics must remain visible for review",
);

const failedOpen = await captureConversationV2ShadowRecord(
  { conversationId: "conversation-1", observation, sourceUserId: "line-user-1" },
  {
    getMode: () => "shadow",
    loadTimeline: async () => { throw new Error("injected timeline failure"); },
  },
);
assert.equal(failedOpen, null, "V2 shadow failure must never escape background synchronization");

console.log("conversation V2 runtime shadow validation passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
