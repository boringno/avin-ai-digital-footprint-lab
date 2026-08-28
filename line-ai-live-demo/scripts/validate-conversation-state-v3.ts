import assert from "node:assert/strict";

import {
  cloneConversationStateV3,
  commitDeliveredResponseToConversationStateV3,
  CONVERSATION_STATE_V3_SCHEMA_VERSION,
  loadPersistedConversationStateV3,
  migrateConversationV2StateToV3,
  transitionConversationStateV3Progress,
  transitionConversationStateV3Subject,
  type ConversationStateV3Registry,
  type ConversationStateV3,
} from "../src/lib/conversation-v2/state-v3";
import { createConversationV2State } from "../src/lib/conversation-v2/state";
import type { ConversationV2State, KnowledgeContext } from "../src/lib/conversation-v2/types";
import { RESPONSE_CONTRACT_SCHEMA_VERSION, type ResponseContract } from "../src/lib/response-contract";

const NOW = "2026-08-20T08:00:00.000Z";
const LATER = "2026-08-20T08:01:00.000Z";

const REGISTRY: ConversationStateV3Registry = {
  answerKeys: new Set(["no", "yes"]),
  approvedFactIds: new Set(["fact-onda", "fact-botox"]),
  areaKeys: new Set(["lower_face"]),
  concernKeys: new Set(["expression_lines", "jawline_looseness", "local_contour"]),
  treatmentKeys: new Set([
    "botox",
    "onda_pro",
    "pico",
    ...Array.from({ length: 12 }, (_, index) => `treatment_${index + 1}`),
  ]),
};

function responseContext() {
  return {
    affirmedAreaKeys: ["lower_face"],
    affirmedConcernKeys: ["jawline_looseness"],
    affirmedTreatmentKeys: ["onda_pro", "botox"],
    conversationMove: "compare" as const,
    declinedTreatmentKeys: [],
    dialogueReference: "active_comparison" as const,
    excludedAreaKeys: [],
    excludedConcernKeys: [],
    excludedTreatmentKeys: [],
    questionAspect: "general_difference" as const,
    treatmentApproach: "unspecified" as const,
  };
}

function completeV2Fixture() {
  const state = createConversationV2State({ episodeId: "episode-v2", now: NOW });
  const processedTurnIds = Array.from({ length: 64 }, (_, index) => `turn-${index + 1}`);
  state.activeTask = {
    id: "episode-v2:compare",
    kind: "compare_treatments",
    startedAt: NOW,
    subjectKey: "comparison:botox+onda_pro",
  };
  state.awaiting = {
    allowMultiple: false,
    continuation: {
      kind: "answer_price",
      priceApplicability: {
        branch: "高雄館",
        dose: "12U",
        package: "face-contour",
        sessionCount: 1,
        variant: "standard",
      },
      priceKind: "campaign",
    },
    expectedField: "selection",
    id: "awaiting-comparison",
    knowledgeMode: "merge",
    options: [
      { entity: "treatment", id: "option-onda", label: "ONDA Pro", value: "onda_pro" },
      { entity: "treatment", id: "option-botox", label: "肉毒", value: "botox" },
    ],
    pendingKnowledge: {
      areaKeys: ["lower_face"],
      concernKeys: ["jawline_looseness"],
      treatmentKeys: ["onda_pro", "botox"],
    },
    prompt: "比較想先了解哪一項？",
    responseContext: responseContext(),
  };
  state.bookingTask = {
    draft: {
      branch: "高雄館",
      firstVisit: true,
      name: "王小美",
      phone: "0912345678",
      timeSlots: ["8/22 下午", "8/23 晚上"],
      treatmentKeys: ["onda_pro"],
    },
    expectedField: "phone",
    id: "booking-1",
    intent: "create",
    status: "suspended",
  };
  state.control = {
    handoff: {
      id: "handoff-1",
      reason: "customer_requested_human",
      requestedAt: NOW,
      status: "pending",
    },
    mode: "handoff_pending",
  };
  state.knowledge = {
    approvedFactIds: ["fact-onda", "fact-botox"],
    areaKeys: ["lower_face"],
    consultedTreatmentKeys: ["onda_pro", "botox"],
    concernKeys: ["jawline_looseness"],
    treatmentKeys: ["onda_pro", "botox"],
  };
  state.lastProcessedTurnId = processedTurnIds.at(-1);
  state.preferences = {
    excludedAreaKeys: ["body"],
    excludedConcernKeys: ["local_contour"],
    excludedTreatmentKeys: ["pico"],
    treatmentApproach: "single",
  };
  state.pricingSubjectTreatmentKeys = ["onda_pro"];
  state.processedTurnIds = processedTurnIds;
  state.revision = 18;
  state.updatedAt = NOW;
  return state;
}

function v2Projection(state: ConversationStateV3): ConversationV2State {
  const { dialogueProgress: _progress, schemaVersion: _version, ...legacy } = state;
  return { ...legacy, schemaVersion: 2 };
}

function knowledge(overrides: Partial<KnowledgeContext> = {}): KnowledgeContext {
  const base: KnowledgeContext = {
    approvedFactIds: [],
    areaKeys: [],
    consultedTreatmentKeys: [],
    concernKeys: [],
    treatmentKeys: [],
  };
  return {
    ...base,
    ...overrides,
    consultedTreatmentKeys: overrides.consultedTreatmentKeys ?? base.consultedTreatmentKeys,
  };
}

function activeContract(): ResponseContract {
  return {
    ctaPolicy: "allow",
    mustAnswer: ["benefits"],
    mustNotRepeat: ["overview"],
    nextStep: {
      aspect: "need_discovery",
      expectedAnswerType: "concern",
      kind: "ask",
    },
    schemaVersion: RESPONSE_CONTRACT_SCHEMA_VERSION,
    subjectKeys: [],
  };
}

function validateLosslessV2Migration() {
  const original = completeV2Fixture();
  const immutableInput = structuredClone(original);
  const loaded = loadPersistedConversationStateV3(original, REGISTRY);
  assert.equal(loaded.kind, "migrated", "SV3-1: valid V2 state must migrate");
  if (loaded.kind !== "migrated") return;

  assert.equal(loaded.state.schemaVersion, CONVERSATION_STATE_V3_SCHEMA_VERSION);
  assert.deepEqual(v2Projection(loaded.state), immutableInput, "SV3-1: all V2 semantics must be preserved");
  assert.deepEqual(original, immutableInput, "SV3-1: migration must not mutate its input");
  assert.equal(loaded.state.dialogueProgress.customerGoal, "unspecified");
  assert.equal(loaded.state.dialogueProgress.stage, "unknown");
  assert.equal(loaded.state.dialogueProgress.pendingQuestion, undefined);
  assert.equal(loaded.state.dialogueProgress.activeSubjectKey, "comparison:botox+onda_pro");
  assert.deepEqual(
    loaded.state.dialogueProgress.subjects[0]?.knowledge,
    original.knowledge,
    "SV3-1: existing active knowledge must seed only its subject memory",
  );
  const progressJson = JSON.stringify(loaded.state.dialogueProgress);
  assert(!progressJson.includes("王小美") && !progressJson.includes("0912345678"), "SV3-1: migration must not copy PII into dialogue progress");
}

function validateRoundTripAndVersionBoundaries() {
  const migrated = migrateConversationV2StateToV3(completeV2Fixture(), REGISTRY);
  assert.deepEqual(
    loadPersistedConversationStateV3(completeV2Fixture()),
    { kind: "needs_ontology", version: 2 },
    "SV3-2: V2 migration must fail closed without a tenant-scoped ontology",
  );
  assert.deepEqual(
    loadPersistedConversationStateV3(migrated),
    { kind: "needs_ontology", version: 3 },
    "SV3-2: V3 parsing must fail closed without a tenant-scoped ontology",
  );
  const roundTrip = loadPersistedConversationStateV3(JSON.parse(JSON.stringify(migrated)), REGISTRY);
  assert.equal(roundTrip.kind, "current", "SV3-2: serialized V3 must load as current");
  if (roundTrip.kind !== "current") return;
  assert.deepEqual(roundTrip.state, migrated, "SV3-2: V3 JSON round trip must preserve semantics");
  assert.deepEqual(
    cloneConversationStateV3(roundTrip.state),
    migrated,
    "SV3-2: a validated current V3 state must remain clone-idempotent",
  );

  const cloned = cloneConversationStateV3(roundTrip.state);
  cloned.dialogueProgress.subjects[0]!.knowledge.treatmentKeys.push("mutation");
  assert(!roundTrip.state.dialogueProgress.subjects[0]!.knowledge.treatmentKeys.includes("mutation"), "SV3-2: clone must be deep");

  const futureRaw = { schemaVersion: 4, nested: { receipts: ["a", "b"] } };
  const future = loadPersistedConversationStateV3(futureRaw);
  assert.equal(future.kind, "future", "SV3-2: future schema must fail closed, not downgrade");
  if (future.kind === "future") assert.deepEqual(future.raw, futureRaw, "SV3-2: future raw JSON must remain intact");
  const futureWithProto = JSON.parse('{"schemaVersion":4,"__proto__":{"keep":true}}') as unknown;
  const futureProtoLoad = loadPersistedConversationStateV3(futureWithProto);
  assert.equal(futureProtoLoad.kind, "future");
  if (futureProtoLoad.kind === "future") {
    assert.equal(Object.prototype.hasOwnProperty.call(futureProtoLoad.raw, "__proto__"), true);
    assert.deepEqual(futureProtoLoad.raw, futureWithProto, "SV3-2: future JSON keys must remain lossless");
  }
  const inheritedSchema = Object.create({ schemaVersion: 4 }) as unknown;
  assert.equal(
    loadPersistedConversationStateV3(inheritedSchema).kind,
    "invalid",
    "SV3-2: inherited schema metadata must not validate",
  );
  assert.equal(loadPersistedConversationStateV3(undefined).kind, "missing");

  const piiSubject = completeV2Fixture();
  piiSubject.activeTask.subjectKey = "0912345678";
  const piiMigration = migrateConversationV2StateToV3(piiSubject, REGISTRY);
  assert.equal(
    piiMigration.dialogueProgress.activeSubjectKey,
    "comparison:botox+onda_pro",
    "SV3-2: untrusted subject keys must be rebuilt only from canonical knowledge",
  );
  assert(!JSON.stringify(piiMigration.dialogueProgress).includes("0912345678"), "SV3-2: a phone-like subject key must not enter dialogue progress");
}

function validateTenantScopedOntologyAndPiiBoundaries() {
  const contaminated = completeV2Fixture();
  contaminated.activeTask.subjectKey = "treatment:0912345678";
  contaminated.knowledge = {
    approvedFactIds: ["fact-onda", "0912345678", "王小美", "wang_xiaomei"],
    areaKeys: ["lower_face", "0912345678", "王小美", "onda_pro"],
    consultedTreatmentKeys: ["botox", "onda_pro", "0912345678", "王小美"],
    concernKeys: ["jawline_looseness", "0912345678", "王小美", "onda_pro"],
    treatmentKeys: ["botox", "onda_pro", "0912345678", "王小美", "lower_face"],
  };
  const original = structuredClone(contaminated);
  const migrated = migrateConversationV2StateToV3(contaminated, REGISTRY);
  assert.deepEqual(
    v2Projection(migrated),
    original,
    "SV3-PII-1: filtering dialogue progress must not mutate the lossless V2 projection",
  );
  assert.deepEqual(migrated.dialogueProgress.subjects[0]?.knowledge, {
    approvedFactIds: ["fact-onda"],
    areaKeys: ["lower_face"],
    consultedTreatmentKeys: ["botox", "onda_pro"],
    concernKeys: ["jawline_looseness"],
    treatmentKeys: ["botox", "onda_pro"],
  }, "SV3-PII-1: only keys allowed for their exact ontology category may seed progress");
  const progressJson = JSON.stringify(migrated.dialogueProgress);
  for (const secret of ["0912345678", "王小美", "wang_xiaomei"]) {
    assert(!progressJson.includes(secret), `SV3-PII-1: dialogue progress must not contain ${secret}`);
  }

  const allContaminated = completeV2Fixture();
  allContaminated.activeTask = {
    ...allContaminated.activeTask,
    kind: "learn_treatment",
    subjectKey: "treatment:0912345678",
  };
  allContaminated.knowledge = {
    approvedFactIds: ["wang_xiaomei"],
    areaKeys: ["王小美"],
    consultedTreatmentKeys: ["tel_0912345678"],
    concernKeys: ["0912345678"],
    treatmentKeys: ["tel_0912345678"],
  };
  const emptyProgress = migrateConversationV2StateToV3(allContaminated, REGISTRY).dialogueProgress;
  assert.equal(emptyProgress.activeSubjectKey, undefined, "SV3-PII-2: polluted knowledge must not create a subject");
  assert.deepEqual(emptyProgress.subjects, [], "SV3-PII-2: polluted knowledge must not create subject memory");

  const tenantState = createConversationV2State({ episodeId: "tenant-scope", now: NOW });
  tenantState.activeTask = {
    id: "tenant-scope:learn",
    kind: "learn_treatment",
    startedAt: NOW,
    subjectKey: "treatment:tenant_a_only",
  };
  tenantState.knowledge.treatmentKeys = ["tenant_a_only"];
  const tenantARegistry: ConversationStateV3Registry = {
    answerKeys: new Set(),
    approvedFactIds: new Set(),
    areaKeys: new Set(),
    concernKeys: new Set(),
    treatmentKeys: new Set(["tenant_a_only"]),
  };
  const tenantBRegistry: ConversationStateV3Registry = {
    answerKeys: new Set(),
    approvedFactIds: new Set(),
    areaKeys: new Set(),
    concernKeys: new Set(),
    treatmentKeys: new Set(["tenant_b_only"]),
  };
  assert.equal(
    migrateConversationV2StateToV3(tenantState, tenantARegistry).dialogueProgress.activeSubjectKey,
    "treatment:tenant_a_only",
    "SV3-PII-3: a tenant may retain its own active or archived canonical key",
  );
  assert.equal(
    migrateConversationV2StateToV3(tenantState, tenantBRegistry).dialogueProgress.activeSubjectKey,
    undefined,
    "SV3-PII-3: another tenant's key must not enter dialogue progress",
  );

  const noFactRegistry: ConversationStateV3Registry = {
    ...REGISTRY,
    approvedFactIds: new Set(),
  };
  assert.deepEqual(
    migrateConversationV2StateToV3(completeV2Fixture(), noFactRegistry).dialogueProgress.subjects[0]?.knowledge.approvedFactIds,
    [],
    "SV3-PII-4: approved fact IDs must not seed progress without their own registry",
  );

  const contaminatedV3 = migrateConversationV2StateToV3(completeV2Fixture(), REGISTRY);
  contaminatedV3.dialogueProgress.subjects[0]!.knowledge.treatmentKeys.push("tel_0912345678");
  assert.equal(
    loadPersistedConversationStateV3(JSON.parse(JSON.stringify(contaminatedV3)), REGISTRY).kind,
    "invalid",
    "SV3-PII-5: persisted V3 with non-allowlisted subject knowledge must be rejected",
  );
  const contaminatedFactV3 = migrateConversationV2StateToV3(completeV2Fixture(), REGISTRY);
  contaminatedFactV3.dialogueProgress.subjects[0]!.knowledge.approvedFactIds.push("0912345678");
  assert.equal(
    loadPersistedConversationStateV3(JSON.parse(JSON.stringify(contaminatedFactV3)), REGISTRY).kind,
    "invalid",
    "SV3-PII-5: approved fact allowlist must reject contamination independently of subject matching",
  );
}

function validateMalformedStateIsRejected() {
  const base = completeV2Fixture() as unknown as Record<string, unknown>;
  const cases: Array<[string, Record<string, unknown>]> = [
    ["active task enum", { ...structuredClone(base), activeTask: { ...(base.activeTask as object), kind: "bogus" } }],
    ["booking field", { ...structuredClone(base), bookingTask: { ...(base.bookingTask as object), expectedField: "bogus" } }],
    ["handoff", { ...structuredClone(base), control: { mode: "handoff_pending", handoff: "bad" } }],
    ["timestamp", { ...structuredClone(base), updatedAt: "not-a-date" }],
    ["receipt limit", { ...structuredClone(base), processedTurnIds: Array.from({ length: 65 }, (_, index) => `x-${index}`), lastProcessedTurnId: "x-64" }],
    ["awaiting option", { ...structuredClone(base), awaiting: { ...(base.awaiting as object), options: ["bad"] } }],
    ["awaiting applicability branch", {
      ...structuredClone(base),
      awaiting: {
        ...(base.awaiting as object),
        continuation: { kind: "answer_price", priceApplicability: { branch: 123 }, priceKind: "campaign" },
      },
    }],
    ["awaiting applicability sessions", {
      ...structuredClone(base),
      awaiting: {
        ...(base.awaiting as object),
        continuation: { kind: "answer_price", priceApplicability: { sessionCount: -1 }, priceKind: "campaign" },
      },
    }],
  ];
  for (const [name, value] of cases) {
    assert.equal(loadPersistedConversationStateV3(value, REGISTRY).kind, "invalid", `SV3-3: malformed ${name} must be rejected`);
  }

  const invalidProgress = migrateConversationV2StateToV3(completeV2Fixture(), REGISTRY) as unknown as Record<string, unknown>;
  invalidProgress.dialogueProgress = { customerGoal: "learn", processedDeliveryIds: [], stage: "bogus", subjects: [] };
  assert.equal(loadPersistedConversationStateV3(invalidProgress, REGISTRY).kind, "invalid", "SV3-3: malformed V3 progress must be rejected");
}

function validateSubjectTransitionsAndDeliveryCommit() {
  let state = migrateConversationV2StateToV3(completeV2Fixture(), REGISTRY);
  const initialRevision = state.revision;
  state = transitionConversationStateV3Progress(state, { at: LATER, customerGoal: "compare", stage: "compare" });
  assert.equal(state.dialogueProgress.customerGoal, "compare");
  assert.equal(state.dialogueProgress.stage, "compare");
  assert.equal(state.revision, initialRevision + 1, "SV3-4: valid progress transition must bump revision");
  assert.equal(state.updatedAt, LATER, "SV3-4: valid progress transition must advance updatedAt");
  const invalidProgressTransition = transitionConversationStateV3Progress(state, {
    at: LATER,
    customerGoal: "bogus" as never,
    stage: "bogus" as never,
  });
  assert.deepEqual(invalidProgressTransition, state, "SV3-4: invalid runtime enums must be a no-op");

  state = commitDeliveredResponseToConversationStateV3(state, {
    askedQuestion: {
      expectedAnswerType: "concern",
      options: [{ entity: "concern", label: "王小美 0912345678", value: "jawline_looseness" }],
      purpose: "need_discovery",
      question: "王小美，0912345678 正確嗎？",
    } as never,
    completedAspects: ["overview", "benefits"],
    contract: activeContract(),
    deliveredAt: LATER,
    deliveryId: "delivery-1",
    sourceTurnId: "turn-65",
    subjectKey: "comparison:botox+onda_pro",
  }, REGISTRY);
  assert.deepEqual(
    state.dialogueProgress.subjects.find((subject) => subject.subjectKey === "comparison:botox+onda_pro")?.answeredAspects.map((answer) => answer.aspect),
    ["overview", "benefits"],
    "SV3-4: only renderer-reported completed aspects are committed",
  );
  assert.equal(state.dialogueProgress.pendingQuestion?.purpose, "need_discovery");
  assert.equal(state.dialogueProgress.pendingQuestion?.questionKey, "need_discovery:concern");
  assert(
    !JSON.stringify(state.dialogueProgress.pendingQuestion).includes("王小美") &&
      !JSON.stringify(state.dialogueProgress.pendingQuestion).includes("0912345678"),
    "SV3-4: rendered question prose and option labels must never enter persisted progress",
  );

  const duplicate = commitDeliveredResponseToConversationStateV3(state, {
    completedAspects: ["mechanism"],
    contract: activeContract(),
    deliveredAt: "2026-08-20T08:02:00.000Z",
    deliveryId: "delivery-1",
    sourceTurnId: "turn-65",
    subjectKey: "comparison:botox+onda_pro",
  }, REGISTRY);
  assert.deepEqual(duplicate, state, "SV3-4: duplicate delivery receipt must be idempotent");

  const duplicateTurn = commitDeliveredResponseToConversationStateV3(state, {
    completedAspects: ["mechanism"],
    contract: activeContract(),
    deliveredAt: "2026-08-20T08:02:00.000Z",
    deliveryId: "delivery-retry-with-new-id",
    sourceTurnId: "turn-65",
    subjectKey: "comparison:botox+onda_pro",
  }, REGISTRY);
  assert.deepEqual(duplicateTurn, state, "SV3-4: one inbound turn must not commit two response deliveries");

  const interruptionReply = commitDeliveredResponseToConversationStateV3(state, {
    completedAspects: ["direct_answer"],
    contract: activeContract(),
    deliveredAt: "2026-08-20T08:02:00.000Z",
    deliveryId: "delivery-interruption",
    sourceTurnId: "turn-interruption",
    subjectKey: "comparison:botox+onda_pro",
  }, REGISTRY);
  assert.equal(
    interruptionReply.dialogueProgress.pendingQuestion?.deliveryId,
    "delivery-1",
    "SV3-4: an informational interruption must preserve the question the customer already received",
  );
  const clearedQuestion = commitDeliveredResponseToConversationStateV3(interruptionReply, {
    completedAspects: ["direct_answer"],
    contract: activeContract(),
    deliveredAt: "2026-08-20T08:03:00.000Z",
    deliveryId: "delivery-clear-question",
    pendingQuestionDisposition: "clear",
    sourceTurnId: "turn-clear-question",
    subjectKey: "comparison:botox+onda_pro",
  }, REGISTRY);
  assert.equal(
    clearedQuestion.dialogueProgress.pendingQuestion,
    undefined,
    "SV3-4: only an explicit transition may clear a delivered pending question",
  );

  const unknownSubjectReceipt = commitDeliveredResponseToConversationStateV3(state, {
    completedAspects: ["benefits"],
    contract: activeContract(),
    deliveredAt: "2026-08-20T08:02:00.000Z",
    deliveryId: "delivery-unknown-subject",
    sourceTurnId: "turn-unknown-subject",
    subjectKey: "treatment:pico",
  }, REGISTRY);
  assert.deepEqual(
    unknownSubjectReceipt,
    state,
    "SV3-4: delivery commit must not create a policy-owned subject implicitly",
  );

  const interrupted = transitionConversationStateV3Subject(state, {
    at: "2026-08-20T08:02:00.000Z",
    knowledge: knowledge({ treatmentKeys: ["onda_pro", "botox"] }),
    subjectKey: "comparison:botox+onda_pro",
    transition: "interrupt",
  }, REGISTRY);
  assert.equal(interrupted.dialogueProgress.pendingQuestion?.deliveryId, "delivery-1", "SV3-4: same-subject price/clinic interruption must preserve pending question");

  const replaced = transitionConversationStateV3Subject(interrupted, {
    at: "2026-08-20T08:03:00.000Z",
    knowledge: knowledge({ concernKeys: ["expression_lines"], treatmentKeys: ["botox"] }),
    subjectKey: "treatment:botox",
    transition: "replace",
  }, REGISTRY);
  assert.equal(replaced.dialogueProgress.pendingQuestion, undefined, "SV3-4: explicit subject replacement must cancel prior pending question");
  assert.equal(replaced.dialogueProgress.subjects.length, 2, "SV3-4: prior and new subject memories must remain isolated");
  assert.equal(
    replaced.dialogueProgress.subjects.find((subject) => subject.subjectKey === "treatment:botox")?.answeredAspects.length,
    0,
    "SV3-4: answered aspects must not leak into a new subject",
  );
}

function validateBoundedDeliveryAndSubjectHistory() {
  let state = migrateConversationV2StateToV3(completeV2Fixture(), REGISTRY);
  for (let index = 0; index < 65; index += 1) {
    state = commitDeliveredResponseToConversationStateV3(state, {
      completedAspects: ["benefits"],
      contract: activeContract(),
      deliveredAt: new Date(Date.parse(LATER) + index * 1000).toISOString(),
      deliveryId: `delivery-boundary-${index}`,
      sourceTurnId: `turn-boundary-${index}`,
      subjectKey: "comparison:botox+onda_pro",
    }, REGISTRY);
  }
  assert.equal(state.dialogueProgress.processedDeliveryIds.length, 64, "SV3-5: delivery dedupe ring must stay bounded");
  assert.equal(
    loadPersistedConversationStateV3(JSON.parse(JSON.stringify(state)), REGISTRY).kind,
    "current",
    "SV3-5: a state produced after the 65th delivery must remain loadable",
  );

  state = commitDeliveredResponseToConversationStateV3(state, {
    askedQuestion: {
      expectedAnswerType: "concern",
      purpose: "need_discovery",
    },
    completedAspects: ["direct_answer"],
    contract: activeContract(),
    deliveredAt: "2026-08-20T09:30:00.000Z",
    deliveryId: "delivery-owner",
    sourceTurnId: "turn-owner",
    subjectKey: "comparison:botox+onda_pro",
  }, REGISTRY);
  for (let index = 1; index <= 12; index += 1) {
    state = transitionConversationStateV3Subject(state, {
      at: new Date(Date.parse("2026-08-20T09:30:00.000Z") + index * 1000).toISOString(),
      knowledge: knowledge({ treatmentKeys: [`treatment_${index}`] }),
      subjectKey: `treatment:treatment_${index}`,
      transition: "interrupt",
    }, REGISTRY);
  }
  assert.equal(state.dialogueProgress.subjects.length, 12, "SV3-5: subject memory must stay bounded");
  assert(
    state.dialogueProgress.subjects.some((subject) => subject.subjectKey === "comparison:botox+onda_pro"),
    "SV3-5: pending question owner must not be evicted",
  );
  assert.equal(
    loadPersistedConversationStateV3(JSON.parse(JSON.stringify(state)), REGISTRY).kind,
    "current",
    "SV3-5: bounded subject state must remain loadable",
  );
}

function validateReplayAfterMigration() {
  const v2 = completeV2Fixture();
  const migrated = loadPersistedConversationStateV3(JSON.parse(JSON.stringify(v2)), REGISTRY);
  assert.equal(migrated.kind, "migrated");
  if (migrated.kind !== "migrated") return;
  assert.equal(migrated.state.processedTurnIds.length, 64);
  assert.equal(migrated.state.processedTurnIds.at(-1), v2.lastProcessedTurnId);
  const roundTrip = loadPersistedConversationStateV3(JSON.parse(JSON.stringify(migrated.state)), REGISTRY);
  assert.equal(roundTrip.kind, "current");
  if (roundTrip.kind !== "current") return;
  assert.deepEqual(roundTrip.state.processedTurnIds, v2.processedTurnIds, "SV3-5: replay receipts must survive migration and serialization");
}

validateLosslessV2Migration();
validateRoundTripAndVersionBoundaries();
validateTenantScopedOntologyAndPiiBoundaries();
validateMalformedStateIsRejected();
validateSubjectTransitionsAndDeliveryCommit();
validateBoundedDeliveryAndSubjectHistory();
validateReplayAfterMigration();

console.log("PASS: Conversation State V3 migration and transition validation");
