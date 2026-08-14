import assert from "node:assert/strict";

import {
  CONVERSATION_V2_GOLDEN_JOURNEYS,
  type GoldenJourney,
  type GoldenJourneySeed,
  type GoldenJourneyTurn,
} from "./fixtures/conversation-v2-golden-journeys";
import { routeConversationTurnV2 } from "../src/lib/conversation-v2/engine";
import { createConversationV2State } from "../src/lib/conversation-v2/state";
import type {
  ConversationV2State,
  EntityMention,
  TurnUnderstanding,
} from "../src/lib/conversation-v2/types";

const RECEIVED_AT_BASE = Date.parse("2026-08-14T09:00:00.000Z");

function sorted(values: readonly string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertSameSet(actual: readonly string[], expected: readonly string[], label: string) {
  assert.deepEqual(sorted(actual), sorted(expected), label);
}

function mentions(
  affirmed: readonly string[] = [],
  negated: readonly string[] = [],
  confidence = 0.96,
): EntityMention[] {
  return [
    ...affirmed.map((key) => ({
      confidence,
      key,
      polarity: "affirmed" as const,
      resolution: "resolved" as const,
    })),
    ...negated.map((key) => ({
      confidence,
      key,
      polarity: "negated" as const,
      resolution: "resolved" as const,
    })),
  ];
}

function toTurn(
  journey: GoldenJourney,
  spec: GoldenJourneyTurn,
  turnIndex: number,
): TurnUnderstanding {
  const confidence = spec.confidence ?? 0.96;
  return {
    areas: mentions(spec.areas, spec.negatedAreas, confidence),
    ...(spec.booking ? { booking: structuredClone(spec.booking) } : {}),
    ...(spec.clarification ? { clarification: structuredClone(spec.clarification) } : {}),
    conversationMove: spec.semantics.conversationMove,
    concerns: mentions(spec.concerns, spec.negatedConcerns, confidence),
    confidence,
    dialogueReference: spec.semantics.dialogueReference,
    questionAspect: spec.semantics.questionAspect ?? "none",
    receivedAt: new Date(RECEIVED_AT_BASE + turnIndex * 1_000).toISOString(),
    ...(spec.selection ? { selection: structuredClone(spec.selection) } : {}),
    speechAct: spec.speechAct,
    text: spec.text,
    treatments: mentions(spec.treatments, spec.negatedTreatments, confidence),
    turnId: spec.turnId ?? `${journey.id}-turn-${turnIndex + 1}`,
  };
}

function seedState(journey: GoldenJourney): ConversationV2State {
  const now = new Date(RECEIVED_AT_BASE - 1_000).toISOString();
  const state = createConversationV2State({ episodeId: `golden-${journey.id}`, now });
  const seed: GoldenJourneySeed | undefined = journey.seed;
  if (!seed) return state;
  if (seed.controlMode) state.control.mode = seed.controlMode;
  if (seed.activeTask) {
    state.activeTask = {
      id: `${state.episodeId}:seed:${seed.activeTask.kind}`,
      kind: seed.activeTask.kind,
      startedAt: now,
      ...(seed.activeTask.subjectKey ? { subjectKey: seed.activeTask.subjectKey } : {}),
    };
  }
  if (seed.knowledge) {
    state.knowledge.areaKeys = [...(seed.knowledge.areaKeys ?? [])];
    state.knowledge.concernKeys = [...(seed.knowledge.concernKeys ?? [])];
    state.knowledge.treatmentKeys = [...(seed.knowledge.treatmentKeys ?? [])];
  }
  return state;
}

function assertBooking(
  state: ConversationV2State,
  expected: NonNullable<GoldenJourneyTurn["expect"]["booking"]>,
  label: string,
) {
  if (expected.intent !== undefined) {
    assert.equal(state.bookingTask.intent, expected.intent, `${label}: booking intent`);
  }
  if (expected.status !== undefined) {
    assert.equal(state.bookingTask.status, expected.status, `${label}: booking status`);
  }
  if (expected.expectedField !== undefined) {
    assert.equal(
      state.bookingTask.expectedField ?? null,
      expected.expectedField,
      `${label}: expected booking field`,
    );
  }
  const draft = expected.draftIncludes;
  if (!draft) return;
  for (const [key, value] of Object.entries(draft)) {
    const actual = state.bookingTask.draft[key as keyof typeof state.bookingTask.draft];
    if (Array.isArray(value)) {
      assert(Array.isArray(actual), `${label}: booking draft ${key} must be an array`);
      assertSameSet(actual as string[], value, `${label}: booking draft ${key}`);
    } else {
      assert.equal(actual, value, `${label}: booking draft ${key}`);
    }
  }
}

function assertStep(input: {
  after: ConversationV2State;
  before: ConversationV2State;
  journey: GoldenJourney;
  outcome: ReturnType<typeof routeConversationTurnV2>;
  spec: GoldenJourneyTurn;
  turnIndex: number;
}) {
  const { after, before, journey, outcome, spec, turnIndex } = input;
  const label = `${journey.id}.${turnIndex + 1} ${journey.title}`;
  const expected = spec.expect;

  assert.equal(outcome.duplicate, expected.duplicate ?? false, `${label}: duplicate flag`);
  assert.equal(
    outcome.result?.action.type ?? null,
    expected.action,
    `${label}: exactly one winning action`,
  );
  assert.equal(
    after.revision - before.revision,
    expected.revisionDelta ?? (outcome.duplicate ? 0 : 1),
    `${label}: revision delta`,
  );
  if (outcome.duplicate) {
    assert.equal(outcome.nextState, before, `${label}: duplicate must preserve the same immutable state`);
    return;
  }

  assert(outcome.result, `${label}: a non-duplicate turn must produce one result`);
  assert.equal(
    outcome.result.replyPlan.action,
    outcome.result.action.type,
    `${label}: ReplyPlan must belong to the same single action`,
  );
  if (
    spec.speechAct === "ask_treatment_detail" ||
    ["continue", "compare", "prefer_single", "reject"].includes(
      spec.semantics.conversationMove,
    )
  ) {
    assert(
      !("dialogueAct" in outcome.result.replyPlan) ||
        outcome.result.replyPlan.dialogueAct !== "introduce_treatment",
      `${label}: follow-up, comparison, or objection must never restart the first introduction`,
    );
  }
  if (
    outcome.result.replyPlan.mode === "generated" &&
    outcome.result.replyPlan.dialogueAct === "compare_options"
  ) {
    assert(
      outcome.result.replyPlan.knowledgeQuery.treatmentKeys.length >= 2,
      `${label}: treatment comparison must carry facts for both sides`,
    );
  }

  if (expected.dialogueAct !== undefined) {
    assert(
      "dialogueAct" in outcome.result.replyPlan,
      `${label}: expected a visible ReplyPlan with dialogueAct`,
    );
    assert.equal(
      "dialogueAct" in outcome.result.replyPlan
        ? outcome.result.replyPlan.dialogueAct
        : undefined,
      expected.dialogueAct,
      `${label}: dialogue act`,
    );
  }
  if (expected.activeTaskKind !== undefined) {
    assert.equal(after.activeTask.kind, expected.activeTaskKind, `${label}: active task kind`);
  }
  if (expected.activeSubjectKey !== undefined) {
    assert.equal(after.activeTask.subjectKey, expected.activeSubjectKey, `${label}: active subject`);
  }
  if (expected.controlMode !== undefined) {
    assert.equal(after.control.mode, expected.controlMode, `${label}: control mode`);
  }
  if (expected.booking) assertBooking(after, expected.booking, label);

  if (expected.knowledge?.areaKeys) {
    assertSameSet(after.knowledge.areaKeys, expected.knowledge.areaKeys, `${label}: area continuity`);
  }
  if (expected.knowledge?.concernKeys) {
    assertSameSet(after.knowledge.concernKeys, expected.knowledge.concernKeys, `${label}: concern continuity`);
  }
  if (expected.knowledge?.treatmentKeys) {
    assertSameSet(
      after.knowledge.treatmentKeys,
      expected.knowledge.treatmentKeys,
      `${label}: treatment continuity`,
    );
  }
  for (const treatmentKey of expected.knowledge?.excludesTreatments ?? []) {
    assert(
      !after.knowledge.treatmentKeys.includes(treatmentKey),
      `${label}: rejected ${treatmentKey} must leave active knowledge`,
    );
  }
  for (const treatmentKey of expected.preferenceExcludesTreatments ?? []) {
    assert(
      after.preferences.excludedTreatmentKeys.includes(treatmentKey),
      `${label}: rejected ${treatmentKey} must remain an explicit preference`,
    );
  }
  for (const treatmentKey of expected.preferenceAllowsTreatments ?? []) {
    assert(
      !after.preferences.excludedTreatmentKeys.includes(treatmentKey),
      `${label}: re-affirmed ${treatmentKey} must leave the exclusion list`,
    );
  }
  if (expected.pricingSubjectTreatmentKeys) {
    assertSameSet(
      after.pricingSubjectTreatmentKeys,
      expected.pricingSubjectTreatmentKeys,
      `${label}: canonical pricing subject`,
    );
  }

  if (expected.priceTreatmentKeys) {
    assert.equal(outcome.result.action.type, "answer_price", `${label}: price action required`);
    if (outcome.result.action.type === "answer_price") {
      assertSameSet(
        outcome.result.action.treatmentKeys,
        expected.priceTreatmentKeys,
        `${label}: price subject ownership`,
      );
      if (expected.priceKind) {
        assert.equal(outcome.result.action.priceKind, expected.priceKind, `${label}: price kind`);
      }
    }
  }
  if (expected.clinicTopic) {
    assert.equal(outcome.result.action.type, "answer_clinic_info", `${label}: clinic action required`);
    if (outcome.result.action.type === "answer_clinic_info") {
      assert.equal(outcome.result.action.topic, expected.clinicTopic, `${label}: clinic topic`);
    }
  }

  if (outcome.result.action.type === "learn_treatment") {
    assert(
      outcome.result.action.responseContext,
      `${label}: generated treatment action requires responseContext`,
    );
    assert.equal(
      outcome.result.action.responseContext.questionAspect,
      spec.semantics.questionAspect ?? "none",
      `${label}: question aspect must reach policy/renderer`,
    );
    assert.equal(
      outcome.result.action.responseContext.dialogueReference,
      spec.semantics.dialogueReference,
      `${label}: dialogue reference must reach policy/renderer`,
    );
    assert.equal(
      outcome.result.action.responseContext.conversationMove,
      spec.semantics.conversationMove,
      `${label}: conversation move must reach policy/renderer`,
    );
    if (expected.responseExcludesTreatments) {
      assertSameSet(
        outcome.result.action.responseContext.excludedTreatmentKeys,
        expected.responseExcludesTreatments,
        `${label}: persistent treatment exclusions must reach the renderer`,
      );
    }
    if (expected.treatmentApproach) {
      assert.equal(
        outcome.result.action.responseContext.treatmentApproach,
        expected.treatmentApproach,
        `${label}: persistent treatment approach must reach the renderer`,
      );
    }
    if (expected.replyKnowledgeTreatmentKeys) {
      assert.equal(outcome.result.replyPlan.mode, "generated", `${label}: generated plan required`);
      if (outcome.result.replyPlan.mode === "generated") {
        assertSameSet(
          outcome.result.replyPlan.knowledgeQuery.treatmentKeys,
          expected.replyKnowledgeTreatmentKeys,
          `${label}: reply plan must carry every required comparison fact`,
        );
      }
    }
  }
}

function validateFixtureShape() {
  assert(
    CONVERSATION_V2_GOLDEN_JOURNEYS.length >= 25 &&
      CONVERSATION_V2_GOLDEN_JOURNEYS.length <= 40,
    "golden suite must contain 25-40 multi-turn journeys",
  );
  const ids = CONVERSATION_V2_GOLDEN_JOURNEYS.map((journey) => journey.id);
  assert.equal(new Set(ids).size, ids.length, "journey ids must be unique");
  for (const journey of CONVERSATION_V2_GOLDEN_JOURNEYS) {
    assert(
      journey.turns.length >= 2 && journey.turns.length <= 6,
      `${journey.id}: each journey must contain 2-6 turns`,
    );
    for (const [index, turn] of journey.turns.entries()) {
      assert(turn.text.trim(), `${journey.id}.${index + 1}: text is required`);
      assert(turn.semantics.dialogueReference, `${journey.id}.${index + 1}: dialogueReference is required`);
      assert(turn.semantics.conversationMove, `${journey.id}.${index + 1}: conversationMove is required`);
    }
  }
}

function main() {
  validateFixtureShape();
  let turnCount = 0;
  const failures: string[] = [];
  for (const journey of CONVERSATION_V2_GOLDEN_JOURNEYS) {
    try {
      let state = seedState(journey);
      for (const [turnIndex, spec] of journey.turns.entries()) {
        const before = state;
        const outcome = routeConversationTurnV2(state, toTurn(journey, spec, turnIndex));
        assertStep({
          after: outcome.nextState,
          before,
          journey,
          outcome,
          spec,
          turnIndex,
        });
        state = outcome.nextState;
        turnCount += 1;
      }
      console.log(`PASS: ${journey.id} ${journey.title}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  console.log(
    `Conversation V2 golden journey validation passed (${CONVERSATION_V2_GOLDEN_JOURNEYS.length} journeys / ${turnCount} turns)`,
  );
}

try {
  main();
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
}
