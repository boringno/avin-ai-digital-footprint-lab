import assert from "node:assert/strict";

import { captureConversationV2ShadowRecord } from "../src/lib/conversation-v2/runtime-shadow";
import type { NluFrame } from "../src/lib/nlu-frame";
import {
  buildNluShadowConversationTimeline,
  patchNluShadowObservationDecision,
  type NluShadowObservation,
  type NluShadowObservationPatchQueryBuilder,
  type NluShadowObservationPatchQueryClient,
  type NluShadowTimelineRecord,
} from "../src/lib/nlu-shadow-store";

function frame(treatment = "onda_pro"): NluFrame {
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
    intents: ["treatment_consultation"],
    negated: [],
    safety: {
      complaint: false,
      humanRequest: false,
      postTreatmentRisk: false,
      pregnancyNursing: false,
    },
    schemaVersion: 2,
    treatments: [treatment],
  };
}

const FUTURE_ENVELOPE = {
  future: { keep: ["opaque", 42] },
  schemaVersion: 99,
};

function decision(conversationV2?: Record<string, unknown>) {
  return {
    ...(conversationV2 ? { conversationV2 } : {}),
    decisionType: "treatment_intro_reply",
    matchedKey: "fixture",
    matchedType: "guided_reply",
  };
}

function observation(messageId: string, conversationV2?: Record<string, unknown>): NluShadowObservation {
  return {
    confidence: 0.95,
    deterministicDecision: decision(conversationV2),
    divergenceCategories: [],
    errorCode: null,
    frame: frame(),
    latencyMs: 1,
    messageId,
    model: "fixture",
    promptVersion: "fixture",
    tokensIn: 0,
    tokensOut: 0,
  };
}

function record(messageId: string, lineTimestamp: number, conversationV2?: Record<string, unknown>): NluShadowTimelineRecord {
  return {
    divergenceCategories: [],
    frame: frame(),
    legacyDecision: decision(conversationV2),
    lineTimestamp,
    messageId,
    text: "想了解 ONDA",
  };
}

async function validateTimelinePreservesOpaqueEnvelope() {
  const timeline = buildNluShadowConversationTimeline({
    messageRows: [{
      content: "想了解 ONDA",
      created_at: "2026-08-20T14:00:00.000Z",
      id: "future-row",
      line_message_id: "line-future-row",
      payload_json: { event_timestamp: 1_000 },
      source_event_id: "event-future-row",
    }],
    observationRows: [{
      deterministic_decision: decision(FUTURE_ENVELOPE),
      divergence_categories: [],
      message_id: "future-row",
      nlu_frame: frame(),
    }],
  });
  assert.deepEqual(
    timeline.records[0]?.legacyDecision.conversationV2,
    FUTURE_ENVELOPE,
    "SHF-1: timeline parsing must not erase a future shadow envelope",
  );
}

async function validateCurrentFutureEnvelopeIsNeverPatched() {
  let loadCount = 0;
  let patchCount = 0;
  const captured = await captureConversationV2ShadowRecord({
    conversationId: "conversation-future",
    lineTimestamp: 1_000,
    observation: observation("future-current", FUTURE_ENVELOPE),
    sourceUserId: "line-user-future",
  }, {
    getMode: () => "shadow",
    loadTimeline: async () => {
      loadCount += 1;
      return { records: [record("future-current", 1_000, FUTURE_ENVELOPE)], totalCustomerMessages: 1 };
    },
    patch: async () => {
      patchCount += 1;
    },
  });
  assert.equal(captured, null, "SHF-2: older runtime must decline a future current envelope");
  assert.equal(loadCount, 0, "SHF-2: future current envelope must stop before replay");
  assert.equal(patchCount, 0, "SHF-2: future current envelope must never be downgraded");
}

async function validateFutureSuccessorIsSkipped() {
  const patched: string[] = [];
  const captured = await captureConversationV2ShadowRecord({
    conversationId: "conversation-successor",
    lineTimestamp: 1_000,
    observation: observation("current"),
    sourceUserId: "line-user-successor",
  }, {
    getMode: () => "shadow",
    loadTimeline: async () => ({
      records: [
        record("current", 1_000),
        record("future-successor", 2_000, FUTURE_ENVELOPE),
        record("after-future-successor", 3_000),
      ],
      totalCustomerMessages: 3,
    }),
    patch: async (input) => {
      patched.push(input.messageId);
    },
  });
  assert(captured, "SHF-3: the compatible current turn may still materialize");
  assert.deepEqual(
    patched,
    ["current"],
    "SHF-3: late replay must skip, not downgrade, a future successor envelope",
  );
}

async function validateCompareAndSwapRejectsFutureWrite() {
  const oldDecision = decision();
  const futureDecision = decision(FUTURE_ENVELOPE);
  let storedDecision: Record<string, unknown> = futureDecision;
  let storedCategories: string[] = ["future_writer"];
  const audit = { expected: "", updates: 0 };
  const client: NluShadowObservationPatchQueryClient = {
    from: () => {
      const builder = {} as NluShadowObservationPatchQueryBuilder;
      let nextValues: Record<string, unknown> | null = null;
      let expectedDecision: string | null = null;
      builder.update = (values) => {
        nextValues = values;
        return builder;
      };
      builder.eq = (column, value) => {
        if (column === "deterministic_decision") {
          expectedDecision = String(value);
          audit.expected = expectedDecision;
        }
        return builder;
      };
      builder.select = async () => {
        const matches = expectedDecision === JSON.stringify(storedDecision);
        if (matches && nextValues) {
          audit.updates += 1;
          storedDecision = nextValues.deterministic_decision as Record<string, unknown>;
          storedCategories = nextValues.divergence_categories as string[];
        }
        return { data: matches ? [{ message_id: "cas-row" }] : [], error: null };
      };
      return builder;
    },
  };
  const result = await patchNluShadowObservationDecision({
    deterministicDecision: decision({ schemaVersion: 2 }),
    divergenceCategories: ["old_writer"],
    expectedDeterministicDecision: oldDecision,
    messageId: "cas-row",
    promptVersion: "fixture",
  }, { client, hasServerConfig: () => true });
  assert.equal(result, "skipped", "SHF-4: a changed row must fail CAS instead of being overwritten");
  assert.equal(audit.updates, 0, "SHF-4: failed CAS must not execute an update");
  assert.equal(audit.expected, JSON.stringify(oldDecision), "SHF-4: CAS must compare the complete read snapshot");
  assert.deepEqual(storedDecision, futureDecision, "SHF-4: a future schema writer must remain authoritative");
  assert.deepEqual(storedCategories, ["future_writer"], "SHF-4: failed CAS must not replace future diagnostics");
}

async function validateReplayStopsAtFirstCasConflict() {
  const timeline = {
    records: [
      record("cas-current", 1_000),
      record("cas-successor-1", 2_000),
      record("cas-successor-2", 3_000),
    ],
    totalCustomerMessages: 3,
  };

  const currentCalls: string[] = [];
  const currentCaptured = await captureConversationV2ShadowRecord({
    conversationId: "conversation-cas-current",
    lineTimestamp: 1_000,
    observation: observation("cas-current"),
    sourceUserId: "line-user-cas-current",
  }, {
    getMode: () => "shadow",
    loadTimeline: async () => timeline,
    patch: async (input) => {
      currentCalls.push(input.messageId);
      return input.messageId === "cas-current" ? "skipped" : "applied";
    },
  });
  assert.equal(currentCaptured, null, "SHF-5: a current-row CAS conflict must not report stale materialization");
  assert.deepEqual(currentCalls, ["cas-current"], "SHF-5: a current-row conflict must stop all successor writes");

  const successorCalls: string[] = [];
  const successorCaptured = await captureConversationV2ShadowRecord({
    conversationId: "conversation-cas-successor",
    lineTimestamp: 1_000,
    observation: observation("cas-current"),
    sourceUserId: "line-user-cas-successor",
  }, {
    getMode: () => "shadow",
    loadTimeline: async () => timeline,
    patch: async (input) => {
      successorCalls.push(input.messageId);
      return input.messageId === "cas-successor-1" ? "skipped" : "applied";
    },
  });
  assert(successorCaptured, "SHF-5: an already-applied current row may still be reported");
  assert.deepEqual(
    successorCalls,
    ["cas-current", "cas-successor-1"],
    "SHF-5: a successor conflict must stop stale replay before later successors",
  );
}

async function validateFuturePredecessorBlocksCurrentSuffix() {
  let patchCount = 0;
  const captured = await captureConversationV2ShadowRecord({
    conversationId: "conversation-future-predecessor",
    lineTimestamp: 2_000,
    observation: observation("current-after-future"),
    sourceUserId: "line-user-future-predecessor",
  }, {
    getMode: () => "shadow",
    loadTimeline: async () => ({
      records: [
        record("future-predecessor", 1_000, FUTURE_ENVELOPE),
        record("current-after-future", 2_000),
        record("successor-after-future", 3_000),
      ],
      totalCustomerMessages: 3,
    }),
    patch: async () => {
      patchCount += 1;
      return "applied";
    },
  });
  assert.equal(captured, null, "SHF-6: a current turn after future state must fail closed");
  assert.equal(patchCount, 0, "SHF-6: a future predecessor must block the whole old-runtime suffix");
}

async function main() {
  await validateTimelinePreservesOpaqueEnvelope();
  await validateCurrentFutureEnvelopeIsNeverPatched();
  await validateFutureSuccessorIsSkipped();
  await validateCompareAndSwapRejectsFutureWrite();
  await validateReplayStopsAtFirstCasConflict();
  await validateFuturePredecessorBlocksCurrentSuffix();
  console.log("Conversation V2 shadow forward-preservation validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
