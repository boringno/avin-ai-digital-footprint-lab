import assert from "node:assert/strict";

import { clinicConfig } from "../src/lib/clinic-config";
import { clinicOntology } from "../src/lib/clinic-ontology";
import type { NluFrame } from "../src/lib/nlu-frame";
import {
  adaptNluFrameToConversationV2Turn,
  type ConversationV2NluAdapterInput,
  type ConversationV2NluSupplement,
} from "../src/lib/conversation-v2/nlu-adapter";
import { resolveDeterministicNegationGuard } from "../src/lib/conversation-v2/deterministic-negation";
import { resolveTrustedSemanticAnchor } from "../src/lib/conversation-v2/semantic-anchor";
import { createConversationV2State } from "../src/lib/conversation-v2/state";
import type { ConversationV2State } from "../src/lib/conversation-v2/types";

const RECEIVED_AT = "2026-08-14T09:00:00.000Z";
let turnSequence = 0;

function frame(overrides: Partial<NluFrame> = {}): NluFrame {
  return {
    areas: [],
    confidence: 0.92,
    concerns: [],
    dialogue: { focus: "none", move: "none", reference: "none", speechAct: "unknown" },
    intents: ["unknown"],
    negated: [],
    safety: {
      complaint: false,
      humanRequest: false,
      postTreatmentRisk: false,
      pregnancyNursing: false,
    },
    schemaVersion: 1,
    treatments: [],
    ...overrides,
  };
}

function adapt(
  nluFrame: NluFrame | null,
  supplemental?: ConversationV2NluSupplement,
  text = "測試訊息",
) {
  return adaptNluFrameToConversationV2Turn({
    frame: nluFrame,
    receivedAt: RECEIVED_AT,
    supplemental,
    text,
    turnId: `turn-${++turnSequence}`,
  });
}

function v2Frame(
  dialogue: NluFrame["dialogue"],
  overrides: Partial<NluFrame> = {},
): NluFrame {
  return frame({
    ...overrides,
    dialogue,
    schemaVersion: 2,
  });
}

function validateTreatmentAndEntityMapping() {
  const result = adapt(
    frame({
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      intents: ["treatment_consultation"],
      treatments: ["onda_pro"],
    }),
  );
  assert.equal(result.speechAct, "learn_treatment");
  assert.equal(result.confidence, 0.92);
  assert.deepEqual(result.sourceIntents, ["treatment_consultation"]);
  assert.deepEqual(
    result.treatments.map(({ key, polarity, resolution }) => ({ key, polarity, resolution })),
    [{ key: "onda_pro", polarity: "affirmed", resolution: "resolved" }],
  );
  assert.deepEqual(
    result.concerns.map(({ key, polarity, resolution }) => ({ key, polarity, resolution })),
    [{ key: "jawline_looseness", polarity: "affirmed", resolution: "resolved" }],
  );
  assert.deepEqual(
    result.areas.map(({ key, polarity, resolution }) => ({ key, polarity, resolution })),
    [{ key: "jawline", polarity: "affirmed", resolution: "resolved" }],
  );

  const multiConcern = adapt(
    frame({
      concerns: [
        { area: "jawline", key: "jawline_looseness" },
        { area: "abdomen", key: "local_contour" },
      ],
      intents: ["treatment_consultation"],
    }),
  );
  assert.equal(multiConcern.speechAct, "ask_concern", "multiple explicit concerns must survive");
  assert.deepEqual(multiConcern.concerns.map((item) => item.key), ["jawline_looseness", "local_contour"]);
  assert.deepEqual(multiConcern.areas.map((item) => item.key), ["jawline", "abdomen"]);

  const noArea = adapt(
    frame({
      concerns: [{ area: null, key: "jawline_looseness" }],
      intents: ["treatment_consultation"],
    }),
  );
  assert.equal(noArea.speechAct, "ask_concern");
  assert.equal(noArea.concerns[0]?.resolution, "resolved");
  assert.deepEqual(noArea.areas, [], "a null area must not be invented");
}

function validateNegationPolarity() {
  const result = adapt(
    frame({
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      intents: ["treatment_consultation"],
      negated: [
        { key: "treatment_consultation", type: "intent" },
        { key: "onda_pro", type: "treatment" },
        { key: "jawline_looseness", type: "concern" },
        { key: "jawline", type: "area" },
      ],
      treatments: ["onda_pro"],
    }),
  );
  assert.equal(result.speechAct, "unknown", "a negated intent must not become a positive task");
  assert.equal(result.treatments[0]?.polarity, "negated");
  assert.equal(result.concerns[0]?.polarity, "negated");
  assert.equal(result.areas[0]?.polarity, "negated");
  assert.equal(result.treatments.some((item) => item.polarity === "affirmed"), false);
  assert.equal(result.concerns.some((item) => item.polarity === "affirmed"), false);

  const negatedHumanRequest = adapt(
    frame({
      intents: ["human_request"],
      negated: [{ key: "human_request", type: "intent" }],
    }),
  );
  assert.equal(negatedHumanRequest.safetySignals.humanRequest, false);
  assert.equal(negatedHumanRequest.speechAct, "unknown");
}

function validateMultipleIntentResolution() {
  const compatiblePrice = adapt(frame({ intents: ["pricing", "promotion"] }));
  assert.equal(compatiblePrice.speechAct, "ask_price", "compatible price intents may collapse safely");

  const compatibleClinic = adapt(frame({ intents: ["branch_info", "doctor_schedule"] }));
  assert.equal(compatibleClinic.speechAct, "ask_clinic_info");

  const incompatible = adapt(
    frame({ intents: ["pricing", "treatment"], treatments: ["onda_pro"] }),
  );
  assert.equal(incompatible.speechAct, "unknown", "different task families must not be prioritized by guess");
  assert.equal(
    incompatible.treatments[0]?.resolution,
    "underspecified",
    "entities on an ambiguous task must remain pending",
  );

  const twoTreatments = adapt(
    frame({ intents: ["treatment"], treatments: ["onda_pro", "botox"] }),
  );
  assert.equal(twoTreatments.speechAct, "unknown", "two names alone do not prove a comparison request");
  assert(twoTreatments.treatments.every((item) => item.resolution === "underspecified"));

  const lowConfidencePrice = adapt(frame({ confidence: 0.4, intents: ["pricing"] }));
  assert.equal(
    lowConfidencePrice.speechAct,
    "unknown",
    "low-confidence task classification must clarify instead of using stale price ownership",
  );
}

function validateSafetyPreservation() {
  const malformedButUrgent = adapt(
    {
      ...frame(),
      safety: { ...frame().safety, postTreatmentRisk: true },
      treatments: ["not_in_ontology"],
    } as NluFrame,
  );
  assert.equal(malformedButUrgent.speechAct, "urgent_safety");
  assert.equal(malformedButUrgent.safetySignals.postTreatmentRisk, true);
  assert.equal(malformedButUrgent.confidence, 0, "invalid facts must not retain trusted confidence");

  const handoff = adapt(
    frame({
      intents: ["pricing"],
      safety: {
        complaint: true,
        humanRequest: false,
        postTreatmentRisk: false,
        pregnancyNursing: true,
      },
    }),
  );
  assert.equal(handoff.speechAct, "request_handoff");
  assert.equal(handoff.safetySignals.complaint, true);
  assert.equal(handoff.safetySignals.pregnancyNursing, true);

  const intentOnly = adapt(frame({ intents: ["human_request"] }));
  assert.equal(intentOnly.speechAct, "request_handoff");
  assert.equal(intentOnly.safetySignals.humanRequest, true, "intent safety evidence must be retained");
}

/**
 * The deterministic price shortcut keys off the turn text, so a safety case whose text
 * happens to name a treatment and ask a price must still route to safety. The rest of
 * this file pins frames while leaving `text` at the default "測試訊息", which cannot
 * exercise a text-driven shortcut at all -- that blind spot is why these cases exist.
 */
function validateDeterministicPriceShortcutRespectsSafety() {
  const urgentWithPrice = adapt(
    frame({ intents: ["pricing"], safety: { ...frame().safety, postTreatmentRisk: true } }),
    undefined,
    "做完 ONDA 後臉腫得厲害，處理要多少錢",
  );
  assert.equal(
    urgentWithPrice.speechAct,
    "urgent_safety",
    "post-treatment risk must outrank a price question that names a treatment",
  );

  const pregnancyWithPrice = adapt(
    frame({ intents: ["pricing"], safety: { ...frame().safety, pregnancyNursing: true } }),
    undefined,
    "我懷孕可以做 ONDA 嗎，費用多少",
  );
  assert.equal(
    pregnancyWithPrice.speechAct,
    "request_handoff",
    "pregnancy must route to a human even when the turn asks a price",
  );

  const complaintWithPrice = adapt(
    frame({
      intents: ["pricing"],
      safety: { ...frame().safety, complaint: true, humanRequest: true },
    }),
    undefined,
    "ONDA 做完沒效果我要退費，想找真人",
  );
  assert.equal(
    complaintWithPrice.speechAct,
    "request_handoff",
    "a complaint asking for a refund must not be answered as a price question",
  );

  // The narrowing above must not undo what the shortcut was built for: a clean
  // low-confidence price question that names its treatment still has to reach the
  // approved price resolver.
  const lowConfidenceNamedPrice = adapt(
    frame({ confidence: 0.4, intents: ["pricing"] }),
    undefined,
    "ONDA 有沒有活動價格",
  );
  assert.equal(
    lowConfidenceNamedPrice.speechAct,
    "ask_price",
    "a named treatment plus explicit price wording must survive low NLU confidence",
  );

  const lowConfidenceContextualPrice = adapt(
    frame({ confidence: 0.4, intents: ["pricing"] }),
    undefined,
    "那價格呢",
  );
  assert.equal(
    lowConfidenceContextualPrice.speechAct,
    "ask_price",
    "clear price wording must reach policy so the active subject can own the follow-up",
  );

  for (const clearPriceQuestion of ["那個肉毒多少錢", "我不確定肉毒多少錢"]) {
    const colloquialNamedPrice = adapt(
      frame({ confidence: 0.4, intents: ["pricing"] }),
      undefined,
      clearPriceQuestion,
    );
    assert.equal(
      colloquialNamedPrice.speechAct,
      "ask_price",
      `a colloquial but explicitly named price subject must not be treated as ambiguous: ${clearPriceQuestion}`,
    );
  }

  const genuinelyHedgedPrice = adapt(
    frame({ confidence: 0.4, intents: ["pricing"] }),
    undefined,
    "我好像想問那個肉毒多少錢",
  );
  assert.equal(
    genuinelyHedgedPrice.speechAct,
    "unknown",
    "a genuinely uncertain treatment subject must still clarify",
  );
}

function validateBookingSupplement() {
  const create = adapt(
    frame({ intents: ["booking", "treatment"], treatments: ["onda_pro"] }),
    {
      booking: {
        explicit: true,
        fields: { branch: "高雄館", treatmentKeys: ["onda_pro"] },
        intent: "create",
      },
    },
  );
  assert.equal(create.speechAct, "book_consultation");
  assert.deepEqual(create.booking, {
    explicit: true,
    fields: { branch: "高雄館", treatmentKeys: ["onda_pro"] },
    intent: "create",
  });

  const modify = adapt(frame({ intents: ["booking"] }), {
    booking: {
      explicit: true,
      fields: { appointmentReference: "A123", changeRequest: "改到週六" },
      intent: "modify",
    },
  });
  assert.equal(modify.speechAct, "manage_booking");

  const missingSemantics = adapt(frame({ intents: ["booking"] }));
  assert.equal(
    missingSemantics.speechAct,
    "unknown",
    "the generic booking intent must not be guessed as create/modify/cancel",
  );

  const continuation = adapt(frame({ intents: ["unknown"] }), {
    booking: { explicit: false, fields: { branch: "高雄館" }, intent: "create" },
  });
  assert.equal(continuation.speechAct, "provide_booking_field");
  assert.equal(continuation.booking?.fields?.branch, "高雄館");

  const invalidTreatment = adapt(frame({ intents: ["booking"] }), {
    booking: {
      explicit: true,
      fields: { treatmentKeys: ["not_in_ontology"] },
      intent: "create",
    },
  } as ConversationV2NluSupplement);
  assert.equal(invalidTreatment.speechAct, "unknown");
  assert.equal(invalidTreatment.booking, undefined, "invalid booking facts must be discarded");

  const lowConfidenceCreate = adapt(frame({ confidence: 0.1, intents: ["unknown"] }), {
    booking: {
      explicit: true,
      fields: { treatmentKeys: ["botox"] },
      intent: "create",
    },
  });
  assert.equal(
    lowConfidenceCreate.speechAct,
    "book_consultation",
    "trusted deterministic booking evidence must not be vetoed by low-confidence NLU",
  );
  assert.equal(lowConfidenceCreate.confidence, 1);

  const missingFrameContinuation = adapt(null, {
    booking: {
      explicit: false,
      fields: { branch: "高雄館" },
      intent: "none",
    },
  });
  assert.equal(missingFrameContinuation.speechAct, "provide_booking_field");
  assert.equal(missingFrameContinuation.booking?.fields?.branch, "高雄館");
  assert.equal(missingFrameContinuation.confidence, 1);
}

function validateSelectionAndClarification() {
  const selection = adapt(frame({ intents: ["unknown"] }), {
    selection: { indexes: [2, 2], mode: "indexes" },
  }, "2");
  assert.equal(selection.speechAct, "select_options");
  assert.deepEqual(selection.selection, { indexes: [2], mode: "indexes" });

  const conflictingSelection = adapt(frame({ intents: ["pricing"] }), {
    selection: { indexes: [1], mode: "indexes" },
  }, "第一個的價格");
  assert.equal(conflictingSelection.speechAct, "unknown");

  const clarification = adapt(frame({ intents: ["unknown"] }), {
    clarification: {
      allowMultiple: false,
      options: [
        { entity: "treatment", id: "onda", label: "ONDA Pro", value: "onda_pro" },
      ],
      prompt: "想了解哪一個療程？",
      slot: "treatment",
    },
  });
  assert.equal(clarification.speechAct, "unknown");
  assert.equal(clarification.clarification?.options[0]?.value, "onda_pro");

  const invalidClarification = adapt(frame({ intents: ["unknown"] }), {
    clarification: {
      allowMultiple: false,
      options: [{ entity: "area", id: "x", label: "臉部", value: "face" }],
      prompt: "請選療程",
      slot: "treatment",
    },
  });
  assert.equal(invalidClarification.speechAct, "unknown");
  assert.equal(invalidClarification.clarification, undefined);
}

function validateInvalidAndUnderspecifiedInputs() {
  const invalidFrame = adapt(null);
  assert.equal(invalidFrame.speechAct, "unknown");
  assert.equal(invalidFrame.confidence, 0);
  assert.deepEqual(invalidFrame.treatments, []);

  const entityWithoutIntent = adapt(
    frame({ intents: [], treatments: ["onda_pro"] }),
  );
  assert.equal(entityWithoutIntent.speechAct, "unknown");
  assert.equal(entityWithoutIntent.treatments[0]?.resolution, "underspecified");

  const mismatchedArea = adapt(
    frame({
      concerns: [{ area: "abdomen", key: "jawline_looseness" }],
      intents: ["treatment_consultation"],
      treatments: ["onda_pro"],
    }),
  );
  assert.equal(mismatchedArea.speechAct, "unknown");
  assert.deepEqual(mismatchedArea.concerns, [], "a mismatched concern/area pair must be discarded");
  assert.equal(mismatchedArea.treatments[0]?.resolution, "underspecified");

  const unknownNegation = adapt(
    frame({
      intents: ["treatment"],
      negated: [{ key: "not_in_ontology", type: "treatment" }],
      treatments: ["onda_pro"],
    }),
  );
  assert.equal(unknownNegation.speechAct, "unknown");
  assert.equal(unknownNegation.confidence, 0);
  assert.deepEqual(
    unknownNegation.treatments,
    [],
    "an unknown negation invalidates the frame instead of retaining attacker-controlled data",
  );
}

function validateEnvelopeContract() {
  const base: ConversationV2NluAdapterInput = {
    frame: frame(),
    receivedAt: RECEIVED_AT,
    text: "test",
    turnId: "turn-1",
  };
  assert.throws(
    () => adaptNluFrameToConversationV2Turn({ ...base, turnId: " " }),
    /non-empty turnId/u,
  );
  assert.throws(
    () => adaptNluFrameToConversationV2Turn({ ...base, receivedAt: "" }),
    /non-empty receivedAt/u,
  );
}

function validateV2DialogueContract() {
  const explicitComparison = adapt(v2Frame({
    focus: "general_difference",
    move: "compare",
    reference: "explicit",
    speechAct: "compare_treatments",
  }, {
    intents: ["treatment_consultation"],
    treatments: ["onda_pro", "botox"],
  }));
  assert.equal(explicitComparison.speechAct, "compare_treatments");
  assert.equal(explicitComparison.questionAspect, "general_difference");
  assert.equal(explicitComparison.conversationMove, "compare");
  assert.equal(explicitComparison.dialogueReference, "explicit");

  const namesWithoutComparison = adapt(v2Frame({
    focus: "overview",
    move: "start",
    reference: "explicit",
    speechAct: "learn_treatment",
  }, {
    intents: ["treatment_consultation"],
    treatments: ["onda_pro", "botox"],
  }));
  assert.equal(
    namesWithoutComparison.speechAct,
    "unknown",
    "two treatment names must not silently override an explicit non-comparison act",
  );

  const followup = adapt(v2Frame({
    focus: "mechanism",
    move: "continue",
    reference: "active_subject",
    speechAct: "ask_treatment_detail",
  }, {
    intents: ["treatment_consultation"],
  }));
  assert.equal(followup.speechAct, "ask_treatment_detail");
  assert.equal(followup.questionAspect, "mechanism");
  assert.equal(followup.dialogueReference, "active_subject");

  const activeComparison = adapt(v2Frame({
    focus: "single_vs_combination",
    move: "compare",
    reference: "active_comparison",
    speechAct: "compare_treatments",
  }, {
    intents: ["treatment_consultation"],
  }));
  assert.equal(activeComparison.speechAct, "compare_treatments");

  const unsupportedBookingMutation = adapt(v2Frame({
    focus: "none",
    move: "start",
    reference: "explicit",
    speechAct: "book_consultation",
  }, {
    intents: ["booking"],
  }));
  assert.equal(
    unsupportedBookingMutation.speechAct,
    "unknown",
    "LLM dialogue semantics alone must never mutate booking state",
  );

  const explicitArea = adapt(v2Frame({
    focus: "suitability",
    move: "start",
    reference: "explicit",
    speechAct: "ask_concern",
  }, {
    areas: ["abdomen"],
    intents: ["treatment_consultation"],
  }));
  assert.equal(explicitArea.speechAct, "ask_concern");
  assert.deepEqual(explicitArea.areas.map((item) => item.key), ["abdomen"]);
}

function activeOndaJawlineState(): ConversationV2State {
  const state = createConversationV2State({
    episodeId: "semantic-anchor",
    now: RECEIVED_AT,
  });
  return {
    ...state,
    activeTask: {
      id: "semantic-anchor:jawline",
      kind: "answer_concern",
      startedAt: RECEIVED_AT,
      subjectKey: "treatment:onda_pro",
    },
    knowledge: {
      approvedFactIds: [],
      areaKeys: ["jawline"],
      concernKeys: ["jawline_looseness"],
      treatmentKeys: ["onda_pro"],
    },
  };
}

function validateTrustedSemanticAnchors() {
  const emptyState = createConversationV2State({
    episodeId: "semantic-anchor-empty",
    now: RECEIVED_AT,
  });
  const exactAnchor = resolveTrustedSemanticAnchor({
    candidate: { questionAspect: "overview", speechAct: "learn_treatment" },
    clinic: clinicConfig,
    message: "ONDA",
    ontology: clinicOntology,
    state: emptyState,
  });
  assert.ok(exactAnchor, "an exact canonical treatment must produce a semantic anchor");
  assert.equal(exactAnchor.source, "exact_ontology");
  assert.deepEqual(exactAnchor.treatmentKeys, ["onda_pro"]);
  assert.equal(exactAnchor.replyAssetId, undefined, "an ontology name alone must not invent a reply asset");

  const pendingState = createConversationV2State({
    episodeId: "semantic-anchor-pending-human",
    now: RECEIVED_AT,
  });
  pendingState.control = {
    handoff: {
      id: "pending-human-review",
      reason: "pregnancy_nursing_risk",
      requestedAt: RECEIVED_AT,
      status: "pending",
    },
    mode: "handoff_pending",
  };
  const pendingBotoxAnchor = resolveTrustedSemanticAnchor({
    clinic: clinicConfig,
    message: "肉毒",
    ontology: clinicOntology,
    state: pendingState,
  });
  assert.deepEqual(
    pendingBotoxAnchor?.treatmentKeys,
    ["botox"],
    "a pending human review must still allow one exact treatment question to continue through V2",
  );
  const humanState = structuredClone(pendingState);
  humanState.control = {
    handoff: {
      id: "active-human-review",
      reason: "pregnancy_nursing_risk",
      requestedAt: RECEIVED_AT,
      status: "active",
    },
    mode: "human_active",
  };
  assert.equal(
    resolveTrustedSemanticAnchor({
      clinic: clinicConfig,
      message: "肉毒",
      ontology: clinicOntology,
      state: humanState,
    }),
    undefined,
    "an active human owner must still block the AI content anchor",
  );

  const frameLessExactAnchor = resolveTrustedSemanticAnchor({
    clinic: clinicConfig,
    message: "ONDA",
    ontology: clinicOntology,
    state: emptyState,
  });
  assert.ok(frameLessExactAnchor, "frame-less rescue may accept one exact short ontology entity");
  assert.equal(frameLessExactAnchor.source, "exact_ontology");
  const frameLessContentAnchor = resolveTrustedSemanticAnchor({
    clinic: clinicConfig,
    message: "ONDA 有什麼效果",
    ontology: clinicOntology,
    state: emptyState,
  });
  assert.ok(
    frameLessContentAnchor,
    "frame-less rescue must retain an explicit treatment with a fully consumed content question",
  );
  assert.equal(frameLessContentAnchor.speechAct, "ask_treatment_detail");
  assert.equal(frameLessContentAnchor.questionAspect, "benefits");

  const exactQuestionAnchor = resolveTrustedSemanticAnchor({
    candidate: { questionAspect: "benefits", speechAct: "ask_treatment_detail" },
    clinic: clinicConfig,
    message: "ONDA 有什麼效果",
    ontology: clinicOntology,
    state: emptyState,
  });
  assert.ok(
    exactQuestionAnchor,
    "a unique explicit treatment must remain grounded when the customer also asks a content question",
  );
  assert.equal(exactQuestionAnchor.speechAct, "ask_treatment_detail");
  assert.equal(exactQuestionAnchor.questionAspect, "benefits");
  assert.deepEqual(exactQuestionAnchor.treatmentKeys, ["onda_pro"]);

  const lowConfidenceOnda = v2Frame({
    focus: "overview",
    move: "start",
    reference: "explicit",
    speechAct: "learn_treatment",
  }, {
    confidence: 0.4,
    intents: ["treatment_consultation"],
    treatments: ["onda_pro"],
  });
  const withoutAnchor = adapt(lowConfidenceOnda, undefined, "ONDA");
  assert.equal(
    withoutAnchor.speechAct,
    "unknown",
    "the low-confidence control must remain unresolved without deterministic evidence",
  );

  const exactTurn = adapt(lowConfidenceOnda, { semanticAnchor: exactAnchor }, "ONDA");
  assert.equal(exactTurn.speechAct, "learn_treatment");
  assert.equal(exactTurn.confidence, 1, "trusted current-message evidence must outrank low model confidence");
  assert.equal(exactTurn.semanticEvidence, "exact_ontology");
  assert.deepEqual(
    exactTurn.treatments.map(({ confidence, key, polarity, resolution }) => ({
      confidence,
      key,
      polarity,
      resolution,
    })),
    [{ confidence: 1, key: "onda_pro", polarity: "affirmed", resolution: "resolved" }],
  );

  const activeState = activeOndaJawlineState();
  const frameLessAssetAnchor = resolveTrustedSemanticAnchor({
    clinic: clinicConfig,
    message: "脂肪堆積",
    ontology: clinicOntology,
    state: activeState,
  });
  assert.ok(
    frameLessAssetAnchor,
    "frame-less rescue must retain a unique approved asset under an active treatment and concern",
  );
  assert.equal(frameLessAssetAnchor.source, "approved_asset");
  assert.equal(frameLessAssetAnchor.questionAspect, "benefits");
  const assetAnchor = resolveTrustedSemanticAnchor({
    candidate: { questionAspect: "benefits", speechAct: "ask_treatment_detail" },
    clinic: clinicConfig,
    message: "脂肪堆積",
    ontology: clinicOntology,
    state: activeState,
  });
  assert.ok(assetAnchor, "a reviewed concern-specific phrase must select an approved asset");
  assert.equal(assetAnchor.source, "approved_asset");
  assert.ok(assetAnchor.replyAssetId, "the anchor must carry the exact reviewed asset id");
  assert.deepEqual(assetAnchor.treatmentKeys, ["onda_pro"]);
  assert.deepEqual(assetAnchor.concernKeys, ["jawline_looseness"]);

  const assetTurn = adapt(v2Frame({
    focus: "benefits",
    move: "continue",
    reference: "active_subject",
    speechAct: "ask_treatment_detail",
  }, {
    confidence: 0.4,
    intents: ["treatment_consultation"],
    treatments: ["onda_pro"],
  }), { semanticAnchor: assetAnchor }, "脂肪堆積");
  assert.equal(assetTurn.speechAct, "ask_treatment_detail");
  assert.equal(assetTurn.confidence, 1);
  assert.equal(assetTurn.semanticEvidence, "approved_asset");
  assert.equal(assetTurn.replyAssetId, assetAnchor.replyAssetId);
  assert.deepEqual(
    assetTurn.concerns.map(({ confidence, key, polarity, resolution }) => ({
      confidence,
      key,
      polarity,
      resolution,
    })),
    [{ confidence: 1, key: "jawline_looseness", polarity: "affirmed", resolution: "resolved" }],
  );
  assert.deepEqual(
    assetTurn.areas.map(({ confidence, key, polarity, resolution }) => ({
      confidence,
      key,
      polarity,
      resolution,
    })),
    [{ confidence: 1, key: "jawline", polarity: "affirmed", resolution: "resolved" }],
  );

  const supportedConcernAnchor = resolveTrustedSemanticAnchor({
    candidate: { questionAspect: "benefits", speechAct: "ask_concern" },
    clinic: clinicConfig,
    message: "雙下巴",
    ontology: clinicOntology,
    state: activeState,
  });
  assert.ok(supportedConcernAnchor, "a concern supported by the active treatment may inherit that owner");
  assert.deepEqual(supportedConcernAnchor.treatmentKeys, ["onda_pro"]);

  const brandQueryAnchor = resolveTrustedSemanticAnchor({
    candidate: { questionAspect: "brands", speechAct: "ask_treatment_detail" },
    clinic: clinicConfig,
    message: "脂肪堆積是哪個品牌",
    ontology: clinicOntology,
    state: activeState,
  });
  assert.ok(brandQueryAnchor, "an explicit brand question must retain the active treatment subject");
  assert.equal(brandQueryAnchor.source, "active_subject_query");
  assert.equal(brandQueryAnchor.questionAspect, "brands");
  assert.equal(brandQueryAnchor.replyAssetId, undefined, "a brand query must not reuse a benefits asset");
  assert.deepEqual(brandQueryAnchor.treatmentKeys, ["onda_pro"]);
  assert.deepEqual(brandQueryAnchor.concernKeys, ["jawline_looseness"]);

  const sideEffectQueryAnchor = resolveTrustedSemanticAnchor({
    candidate: { questionAspect: "side_effects", speechAct: "ask_treatment_detail" },
    clinic: clinicConfig,
    message: "脂肪型副作用",
    ontology: clinicOntology,
    state: activeState,
  });
  assert.ok(sideEffectQueryAnchor, "an explicit side-effect question must retain the active treatment subject");
  assert.equal(sideEffectQueryAnchor.source, "active_subject_query");
  assert.equal(sideEffectQueryAnchor.questionAspect, "side_effects");
  assert.equal(sideEffectQueryAnchor.replyAssetId, undefined, "a side-effect query must not reuse a benefits asset");

  for (const message of [
    "脂肪型會不會有副作用",
    "脂肪型有風險嗎",
    "脂肪型會有什麼副作用",
    "這個脂肪型有什麼副作用",
    "脂肪型做完會有副作用嗎",
    "脂肪型有沒有副作用",
  ]) {
    const anchor = resolveTrustedSemanticAnchor({
      candidate: { questionAspect: "side_effects", speechAct: "ask_treatment_detail" },
      clinic: clinicConfig,
      message,
      ontology: clinicOntology,
      state: activeState,
    });
    assert.ok(anchor, `natural side-effect wording must retain the active subject: ${message}`);
    assert.equal(anchor.source, "active_subject_query", message);
    assert.equal(anchor.questionAspect, "side_effects", message);
    assert.equal(anchor.replyAssetId, undefined, message);
  }
  for (const input of [
    { aspect: "side_effects" as const, message: "ONDA有沒有副作用" },
    { aspect: "benefits" as const, message: "ONDA有沒有什麼效果" },
    { aspect: "comfort_recovery" as const, message: "ONDA有沒有恢復期" },
  ]) {
    const anchor = resolveTrustedSemanticAnchor({
      candidate: { questionAspect: input.aspect, speechAct: "ask_treatment_detail" },
      clinic: clinicConfig,
      message: input.message,
      ontology: clinicOntology,
      state: emptyState,
    });
    assert.ok(anchor, `yes/no wording must not be mistaken for negation: ${input.message}`);
    assert.equal(anchor.questionAspect, input.aspect, input.message);
    assert.deepEqual(anchor.treatmentKeys, ["onda_pro"], input.message);
  }
  for (const input of [
    {
      candidate: { questionAspect: "benefits" as const, speechAct: "unknown" as const },
      expectedAspect: "brands" as const,
      message: "脂肪堆積是哪個品牌",
    },
    {
      candidate: { questionAspect: "mechanism" as const, speechAct: "unknown" as const },
      expectedAspect: "side_effects" as const,
      message: "脂肪型副作用",
    },
  ]) {
    const anchor = resolveTrustedSemanticAnchor({
      candidate: input.candidate,
      clinic: clinicConfig,
      message: input.message,
      ontology: clinicOntology,
      state: activeState,
    });
    assert.ok(anchor, `current-text aspect evidence must override a mismatched model aspect: ${input.message}`);
    assert.equal(anchor.source, "active_subject_query", input.message);
    assert.equal(anchor.questionAspect, input.expectedAspect, input.message);
    assert.deepEqual(anchor.treatmentKeys, ["onda_pro"], input.message);
  }
  for (const message of [
    "有後遺症嗎",
    "會不會有後遺症",
    "有沒有後遺症",
    "危險嗎",
    "會不會傷身",
    "風險高嗎",
    "有什麼風險",
  ]) {
    const anchor = resolveTrustedSemanticAnchor({
      candidate: { questionAspect: "overview", speechAct: "unknown" },
      clinic: clinicConfig,
      message,
      ontology: clinicOntology,
      state: activeState,
    });
    assert.ok(anchor, `side-effect question grammar must retain the active subject: ${message}`);
    assert.equal(anchor.source, "active_subject_query", message);
    assert.equal(anchor.questionAspect, "side_effects", message);
    assert.deepEqual(anchor.treatmentKeys, ["onda_pro"], message);
  }
  for (const message of [
    "品牌叫什麼",
    "什麼牌子的",
    "用哪牌",
    "哪一個牌子",
    "原廠是哪家",
    "哪個廠商",
    "是哪家出的",
    "機器品牌是什麼",
  ]) {
    const anchor = resolveTrustedSemanticAnchor({
      candidate: { questionAspect: "overview", speechAct: "unknown" },
      clinic: clinicConfig,
      message,
      ontology: clinicOntology,
      state: activeState,
    });
    assert.ok(anchor, `brand question grammar must retain the active subject: ${message}`);
    assert.equal(anchor.source, "active_subject_query", message);
    assert.equal(anchor.questionAspect, "brands", message);
    assert.deepEqual(anchor.treatmentKeys, ["onda_pro"], message);
  }
  const compositionalAspectFamilies = [
    {
      aspect: "side_effects" as const,
      activeMessages: [
        "是否安全",
        "安不安全",
        "危不危險",
        "傷不傷身",
        "有無風險",
        "會否有副作用",
        "副作用大不大",
        "副作用常不常見",
        "風險嚴不嚴重",
        "做完腫不腫",
        "打完痛不痛",
        "紅不紅",
        "麻不麻",
        "術後出不出血",
        "起不起水泡",
        "發炎嚴不嚴重",
        "做完會否發炎",
        "打完有無紅腫",
        "打完紅腫久不久",
        "後遺症多不多",
        "會有風險對嗎",
        "做起來危險不危險",
      ],
    },
    {
      aspect: "brands" as const,
      activeMessages: [
        "有哪些品牌",
        "用的是哪個牌",
        "哪一品牌",
        "機台是哪個牌子",
        "品牌名稱是什麼",
        "哪個製造商",
        "機器哪家製造",
        "哪家公司出的",
        "牌子為何",
        "是誰家的機器",
        "廠牌為何",
        "用的哪間原廠",
        "設備是哪家的",
      ],
    },
  ];
  const compositionalCandidateVariants = [
    undefined,
    { questionAspect: "overview" as const, speechAct: "unknown" as const },
    { questionAspect: "benefits" as const, speechAct: "ask_treatment_detail" as const },
  ];
  for (const family of compositionalAspectFamilies) {
    for (const activeMessage of family.activeMessages) {
      for (const candidate of compositionalCandidateVariants) {
        for (const scope of ["active", "explicit"] as const) {
          const message = scope === "explicit" ? `ONDA${activeMessage}` : activeMessage;
          const anchor = resolveTrustedSemanticAnchor({
            candidate,
            clinic: clinicConfig,
            message,
            ontology: clinicOntology,
            state: scope === "explicit" ? emptyState : activeState,
          });
          assert.ok(
            anchor,
            `compositional ${family.aspect} grammar must resolve (${scope}): ${message}`,
          );
          assert.equal(anchor.questionAspect, family.aspect, message);
          assert.deepEqual(anchor.treatmentKeys, ["onda_pro"], message);
        }
      }
    }
  }
  for (const message of [
    "ONDA哪家公司出的朋友比較好",
    "ONDA做完腫不腫我要改預約",
    "ONDA有無風險費用多少",
  ]) {
    assert.equal(
      resolveTrustedSemanticAnchor({
        candidate: undefined,
        clinic: clinicConfig,
        message,
        ontology: clinicOntology,
        state: emptyState,
      }),
      undefined,
      `unconsumed or hard-domain residue must fail closed: ${message}`,
    );
  }
  for (const input of [
    { aspect: "side_effects" as const, message: "ONDA有後遺症嗎" },
    { aspect: "brands" as const, message: "ONDA機器品牌是什麼" },
  ]) {
    const anchor = resolveTrustedSemanticAnchor({
      candidate: undefined,
      clinic: clinicConfig,
      message: input.message,
      ontology: clinicOntology,
      state: emptyState,
    });
    assert.ok(anchor, `explicit treatment question grammar must resolve without an NLU frame: ${input.message}`);
    assert.equal(anchor.source, "exact_ontology", input.message);
    assert.equal(anchor.questionAspect, input.aspect, input.message);
    assert.deepEqual(anchor.treatmentKeys, ["onda_pro"], input.message);
  }
  for (const input of [
    { candidate: undefined, message: "ONDA做了之後會不會發炎", state: emptyState, source: "exact_ontology" as const },
    {
      candidate: { questionAspect: "overview" as const, speechAct: "unknown" as const },
      message: "ONDA做完有沒有副作用",
      state: emptyState,
      source: "exact_ontology" as const,
    },
    {
      candidate: { questionAspect: "overview" as const, speechAct: "unknown" as const },
      message: "做完有沒有副作用",
      state: activeState,
      source: "active_subject_query" as const,
    },
    {
      candidate: { questionAspect: "side_effects" as const, speechAct: "ask_treatment_detail" as const },
      message: "打完會不會發炎",
      state: activeState,
      source: "active_subject_query" as const,
    },
    {
      candidate: undefined,
      message: "ONDA做完會發炎嗎",
      state: emptyState,
      source: "exact_ontology" as const,
    },
  ]) {
    const anchor = resolveTrustedSemanticAnchor({
      candidate: input.candidate,
      clinic: clinicConfig,
      message: input.message,
      ontology: clinicOntology,
      state: input.state,
    });
    assert.ok(anchor, `prospective risk education must have a deterministic owner: ${input.message}`);
    assert.equal(anchor.source, input.source, input.message);
    assert.equal(anchor.questionAspect, "side_effects", input.message);
    assert.equal(anchor.speechAct, "ask_treatment_detail", input.message);
    assert.deepEqual(anchor.treatmentKeys, ["onda_pro"], input.message);
  }
  for (const message of [
    "脂肪堆積用什麼品牌",
    "脂肪堆積是哪個牌子",
    "脂肪型是哪個廠牌",
    "這個脂肪型是哪個品牌",
    "脂肪堆積是哪一牌",
    "脂肪堆積什麼牌",
    "脂肪堆積哪牌",
  ]) {
    const anchor = resolveTrustedSemanticAnchor({
      candidate: { questionAspect: "brands", speechAct: "ask_treatment_detail" },
      clinic: clinicConfig,
      message,
      ontology: clinicOntology,
      state: activeState,
    });
    assert.ok(anchor, `natural brand wording must retain the active subject: ${message}`);
    assert.equal(anchor.source, "active_subject_query", message);
    assert.equal(anchor.questionAspect, "brands", message);
    assert.equal(anchor.replyAssetId, undefined, message);
  }

  const unsupportedConcernAnchor = resolveTrustedSemanticAnchor({
    candidate: { questionAspect: "benefits", speechAct: "ask_concern" },
    clinic: clinicConfig,
    message: "毛孔",
    ontology: clinicOntology,
    state: activeState,
  });
  assert.ok(unsupportedConcernAnchor, "an explicit new concern must form a clean new ontology anchor");
  assert.equal(unsupportedConcernAnchor.source, "exact_ontology");
  assert.deepEqual(
    unsupportedConcernAnchor.treatmentKeys,
    [],
    "a concern unsupported by the active treatment must detach that treatment",
  );
  assert.deepEqual(unsupportedConcernAnchor.concernKeys, ["pores_texture"]);
  assert.deepEqual(unsupportedConcernAnchor.areaKeys, ["skin"]);
  assert.equal(unsupportedConcernAnchor.conversationMove, "start");

  const bookingCollectingState: ConversationV2State = {
    ...activeState,
    bookingTask: {
      ...activeState.bookingTask,
      expectedField: "treatment",
      intent: "create",
      status: "collecting",
    },
  };
  for (const message of ["ONDA", "脂肪堆積"]) {
    assert.equal(
      resolveTrustedSemanticAnchor({
        candidate: { questionAspect: "benefits", speechAct: "ask_treatment_detail" },
        clinic: clinicConfig,
        message,
        ontology: clinicOntology,
        state: bookingCollectingState,
      }),
      undefined,
      `booking collection must disable every semantic anchor: ${message}`,
    );
  }

  const rejectedCases = [
    {
      candidate: { questionAspect: "overview" as const, speechAct: "learn_treatment" as const },
      label: "hedged treatment reference",
      message: "我好像想問那個 ONDA",
    },
    {
      candidate: { questionAspect: "overview" as const, speechAct: "learn_treatment" as const },
      label: "negated treatment",
      message: "我不要 ONDA",
    },
    {
      candidate: { questionAspect: "overview" as const, speechAct: "learn_treatment" as const },
      label: "copular negation",
      message: "不是 ONDA",
    },
    {
      candidate: { questionAspect: "overview" as const, speechAct: "learn_treatment" as const },
      label: "negation containing 沒有",
      message: "我沒有要問 ONDA",
    },
    {
      candidate: { questionAspect: "overview" as const, speechAct: "unknown" as const },
      label: "multiple treatments",
      message: "ONDA 跟肉毒",
    },
    {
      candidate: { questionAspect: "price_unspecified" as const, speechAct: "ask_price" as const },
      label: "price question",
      message: "ONDA 多少錢",
    },
    {
      candidate: { questionAspect: "none" as const, speechAct: "book_consultation" as const },
      label: "booking request",
      message: "我要預約 ONDA",
    },
    {
      candidate: { questionAspect: "none" as const, speechAct: "unknown" as const },
      label: "clinic information question",
      message: "ONDA 高雄館在哪",
    },
    {
      candidate: { questionAspect: "overview" as const, speechAct: "learn_treatment" as const },
      label: "post-procedure reaction",
      message: "ONDA做了之後發炎",
    },
    {
      candidate: { questionAspect: "side_effects" as const, speechAct: "ask_treatment_detail" as const },
      label: "asset aspect mismatch",
      message: "脂肪",
    },
    {
      candidate: { questionAspect: "benefits" as const, speechAct: "ask_treatment_detail" as const },
      label: "asset phrase with an unsupported body area",
      message: "屁股脂肪堆積",
    },
    {
      candidate: { questionAspect: "none" as const, speechAct: "unknown" as const },
      label: "unrecognized fee intent",
      message: "ONDA 收費",
    },
    {
      candidate: { questionAspect: "none" as const, speechAct: "unknown" as const },
      label: "contact intent",
      message: "ONDA 聯絡電話",
    },
    {
      candidate: { questionAspect: "none" as const, speechAct: "unknown" as const },
      label: "availability by branch intent",
      message: "ONDA 哪間有",
    },
    {
      candidate: { questionAspect: "none" as const, speechAct: "unknown" as const },
      label: "unrecognized booking wording",
      message: "ONDA 可以約",
    },
    {
      candidate: { questionAspect: "overview" as const, speechAct: "learn_treatment" as const },
      label: "undecided customer statement",
      message: "ONDA 還沒決定",
    },
    {
      candidate: { questionAspect: "general_difference" as const, speechAct: "unknown" as const },
      label: "external treatment comparison",
      message: "ONDA 跟海芙差在哪",
    },
    {
      candidate: { questionAspect: "overview" as const, speechAct: "learn_treatment" as const },
      label: "treatment word used as a nickname",
      message: "朋友綽號叫 ONDA",
    },
  ];
  for (const item of rejectedCases) {
    const rejected = resolveTrustedSemanticAnchor({
      candidate: item.candidate,
      clinic: clinicConfig,
      message: item.message,
      ontology: clinicOntology,
      state: activeState,
    });
    assert.equal(rejected, undefined, `${item.label} must not be rescued by a content semantic anchor`);
  }

  for (const message of [
    "ONDA 收費",
    "ONDA 聯絡電話",
    "ONDA 哪間有",
    "ONDA 可以約",
    "ONDA 還沒決定",
    "ONDA 跟海芙差在哪",
    "朋友綽號叫 ONDA",
  ]) {
    assert.equal(
      resolveTrustedSemanticAnchor({
        clinic: clinicConfig,
        message,
        ontology: clinicOntology,
        state: activeState,
      }),
      undefined,
      `frame-less rescue must accept only a short entity answer: ${message}`,
    );
  }

  for (const message of [
    "我不想了解ONDA",
    "我沒有想了解ONDA",
    "我並非想了解ONDA",
  ]) {
    assert.equal(
      resolveTrustedSemanticAnchor({
        clinic: clinicConfig,
        message,
        ontology: clinicOntology,
        state: activeState,
      }),
      undefined,
      `a negated content-intro phrase must not become a positive anchor: ${message}`,
    );
  }

  for (const message of [
    "我沒有興趣想了解ONDA",
    "我沒興趣想問ONDA",
    "我並無意願想知道ONDA",
    "我無意想諮詢ONDA",
    "我沒有打算想了解ONDA",
    "沒有興趣要了解ONDA",
    "沒有意願要問ONDA",
    "並無打算要知道ONDA",
    "不是有興趣想了解ONDA",
    "並不是有意願想諮詢ONDA",
    "我沒有太大興趣想了解ONDA",
    "我沒多少興趣想問ONDA",
    "我並無特別意願想知道ONDA",
    "我沒有那個打算想了解ONDA",
    "我沒有這個念頭想問ONDA",
    "我沒有特別需求想知道ONDA",
    "我沒有半點興趣想了解ONDA",
    "我沒有很大的意願想諮詢ONDA",
    "我沒啥興趣想問ONDA",
    "我沒有興趣再想了解ONDA",
    "我沒有多大興趣想了解ONDA",
    "我沒有太大的興趣想了解ONDA",
    "我並沒有多少的意願想問ONDA",
    "我沒有絲毫興趣想知道ONDA",
    "我沒有真正的意願想諮詢ONDA",
    "我沒有任何的打算想了解ONDA",
    "我沒有這方面的需求想問ONDA",
    "我沒有一丁點興趣想了解ONDA",
  ]) {
    assert.equal(
      resolveTrustedSemanticAnchor({
        clinic: clinicConfig,
        message,
        ontology: clinicOntology,
        state: activeState,
      }),
      undefined,
      `a negative intent nominal must own its following content verb: ${message}`,
    );
  }

  for (const { label, message } of [
    { label: "price", message: "我沒有問題，但想問ONDA價格" },
    { label: "booking", message: "我不是很懂，可是想預約ONDA" },
    { label: "safety", message: "我沒有做過醫美，但做完ONDA後呼吸困難" },
    { label: "clinic", message: "我沒有問題，但想問哪間有ONDA" },
  ]) {
    assert.equal(
      resolveTrustedSemanticAnchor({
        clinic: clinicConfig,
        message,
        ontology: clinicOntology,
        state: activeState,
      }),
      undefined,
      `a negative/meta clause must not hide a mixed ${label} intent: ${message}`,
    );
  }

  const safetyTurn = adapt(
    lowConfidenceOnda,
    {
      hardDecision: { reason: "deterministic_post_treatment_risk", speechAct: "urgent_safety" },
      semanticAnchor: exactAnchor,
    },
    "做完 ONDA 後呼吸困難",
  );
  assert.equal(safetyTurn.speechAct, "urgent_safety", "hard safety must outrank a semantic anchor");
  assert.equal(safetyTurn.semanticEvidence, undefined, "ignored content evidence must not leak into a safety turn");

  const bookingTurn = adapt(
    lowConfidenceOnda,
    {
      booking: { explicit: true, intent: "create" },
      semanticAnchor: exactAnchor,
    },
    "我要預約 ONDA",
  );
  assert.equal(bookingTurn.speechAct, "book_consultation", "explicit booking must outrank a semantic anchor");
  assert.equal(bookingTurn.semanticEvidence, undefined, "ignored content evidence must not leak into booking");
}

function validateDeterministicHardDecision() {
  const validButOverridden = adapt(
    v2Frame({
      focus: "overview",
      move: "start",
      reference: "explicit",
      speechAct: "learn_treatment",
    }, {
      intents: ["treatment_consultation"],
      treatments: ["onda_pro"],
    }),
    { hardDecision: { reason: "deterministic_post_treatment_risk", speechAct: "urgent_safety" } },
  );
  assert.equal(validButOverridden.speechAct, "urgent_safety");

  const malformedButOverridden = adapt(
    { ...frame(), treatments: ["not_in_ontology"] } as NluFrame,
    { hardDecision: { reason: "deterministic_human_request", speechAct: "request_handoff" } },
  );
  assert.equal(malformedButOverridden.speechAct, "request_handoff");
  assert.equal(malformedButOverridden.confidence, 0);
}

function validateDeterministicCurrentTextNegation() {
  const state = createConversationV2State({ episodeId: "negation", now: RECEIVED_AT });
  const guard = resolveDeterministicNegationGuard({
    candidateSpeechAct: "ask_concern",
    clinic: clinicConfig,
    message: "我沒有脂肪堆積",
    ontology: clinicOntology,
    state,
  });
  assert.ok(guard, "an explicit current-text negation must create a deterministic guard");
  assert.deepEqual(
    guard,
    {
      affirmedAreaKeys: [],
      affirmedConcernKeys: [],
      affirmedTreatmentKeys: [],
      areaKeys: [],
      concernKeys: [],
      treatmentKeys: [],
    },
    "an unrecognized negated phrase must still clear model-positive entities without inventing a key",
  );

  for (const confidence of [0.4, 0.95]) {
    const guarded = adapt(
      v2Frame({
        focus: "benefits",
        move: "start",
        reference: "explicit",
        speechAct: "ask_concern",
      }, {
        confidence,
        concerns: [{ area: "jawline", key: "jawline_looseness" }],
        intents: ["treatment_consultation"],
      }),
      { negationGuard: guard },
      "我沒有脂肪堆積",
    );
    assert.equal(guarded.speechAct, "unknown", `${confidence}: negation must suppress the positive task`);
    assert.equal(guarded.confidence, 1, `${confidence}: deterministic evidence owns confidence`);
    assert.equal(
      guarded.concerns.some((item) => item.polarity === "affirmed"),
      false,
      `${confidence}: model-positive concerns must be discarded`,
    );
    assert.deepEqual(guarded.concerns, []);
  }

  const frameLess = adapt(null, { negationGuard: guard }, "我沒有脂肪堆積");
  assert.equal(frameLess.speechAct, "unknown");
  assert.equal(frameLess.confidence, 1);
  assert.deepEqual(frameLess.concerns, []);

  const exactGuard = resolveDeterministicNegationGuard({
    candidateSpeechAct: "ask_concern",
    clinic: clinicConfig,
    message: "我沒有雙下巴",
    ontology: clinicOntology,
    state,
  });
  assert.ok(exactGuard);
  assert.ok(exactGuard.concernKeys.includes("jawline_looseness"));
  const exact = adapt(null, { negationGuard: exactGuard }, "我沒有雙下巴");
  assert.equal(exact.speechAct, "unknown");
  assert.deepEqual(
    exact.concerns.map(({ key, polarity, resolution }) => ({ key, polarity, resolution })),
    [{ key: "jawline_looseness", polarity: "negated", resolution: "resolved" }],
  );

  for (const message of [
    "我沒脂肪堆積",
    "沒雙下巴",
    "我並非脂肪型",
    "非脂肪型",
    "我無脂肪堆積",
    "脂肪堆積不是我的困擾",
    "脂肪堆積我沒有",
    "雙下巴我沒有",
    "脂肪型我並沒有",
    "脂肪堆積我並非",
    "脂肪型我不是",
    "ONDA不是我想要的",
    "我不想了解ONDA",
    "ONDA我不選",
    "ONDA我不會選",
    "ONDA我不選擇",
    "ONDA我不打算選",
    "ONDA我不需要",
    "ONDA我不接受",
    "ONDA我不做",
    "ONDA我不打",
    "ONDA我不用",
    "ONDA我不考慮選",
    "ONDA絕對不選",
  ]) {
    assert.ok(
      resolveDeterministicNegationGuard({
        candidateSpeechAct: "ask_concern",
        clinic: clinicConfig,
        message,
        ontology: clinicOntology,
        state,
      }),
      `natural explicit negation must be guarded: ${message}`,
    );
  }

  for (const message of [
    "我沒有做過醫美，想了解ONDA",
    "我不是很懂，想了解ONDA",
    "我沒有問題。想了解ONDA",
    "我沒有做過醫美想了解ONDA",
    "我不是很懂想了解ONDA",
    "我沒有問題想了解ONDA",
    "我沒有問題只想問ONDA",
    "我沒做過醫美要諮詢ONDA",
    "我沒有經驗想了解ONDA",
    "我沒有概念想了解ONDA",
    "我不是專家想了解ONDA",
    "我沒有費用資料想了解ONDA",
  ]) {
    assert.equal(
      resolveDeterministicNegationGuard({
        candidateSpeechAct: "learn_treatment",
        clinic: clinicConfig,
        message,
        ontology: clinicOntology,
        state,
      }),
      undefined,
      `an unrelated negative clause must not own the positive ONDA clause: ${message}`,
    );
  }

  const mixedGuard = resolveDeterministicNegationGuard({
    candidateSpeechAct: "learn_treatment",
    clinic: clinicConfig,
    message: "我沒有脂肪堆積，但想了解ONDA",
    ontology: clinicOntology,
    state,
  });
  assert.ok(mixedGuard);
  assert.deepEqual(mixedGuard.affirmedTreatmentKeys, ["onda_pro"]);
  assert.deepEqual(mixedGuard.concernKeys, []);

  const unresolvedGuard = {
    affirmedAreaKeys: [],
    affirmedConcernKeys: [],
    affirmedTreatmentKeys: [],
    areaKeys: [],
    concernKeys: [],
    treatmentKeys: [],
  };
  const unresolved = adapt(
    v2Frame({
      focus: "benefits",
      move: "start",
      reference: "explicit",
      speechAct: "ask_concern",
    }, {
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
      intents: ["treatment_consultation"],
    }),
    { negationGuard: unresolvedGuard },
    "我沒有這個困擾",
  );
  assert.equal(unresolved.speechAct, "unknown");
  assert.deepEqual(unresolved.concerns, [], "unresolved negation must clear model-positive entities");

  for (const message of [
    "ONDA有沒有副作用",
    "ONDA是不是我想要的",
    "ONDA不是侵入式療程",
    "ONDA不用開刀",
    "ONDA不需要恢復期",
    "ONDA不做手術",
    "ONDA不打針",
    "我不確定肉毒多少錢",
    "ONDA沒有活動價格嗎",
    "我不要預約了",
    "做完ONDA後沒有呼吸困難但很痛",
  ]) {
    assert.equal(
      resolveDeterministicNegationGuard({
        candidateSpeechAct: message.includes("價格") || message.includes("多少")
          ? "ask_price"
          : "unknown",
        clinic: clinicConfig,
        message,
        ontology: clinicOntology,
        state,
      }),
      undefined,
      `hard-domain or yes/no wording must not be captured by the content negation guard: ${message}`,
    );
  }

  const hardSafety = adapt(
    v2Frame({
      focus: "benefits",
      move: "start",
      reference: "explicit",
      speechAct: "ask_concern",
    }, {
      concerns: [{ area: "jawline", key: "jawline_looseness" }],
    }),
    {
      hardDecision: { reason: "deterministic_post_treatment_risk", speechAct: "urgent_safety" },
      negationGuard: guard,
    },
    "做完 ONDA 後很痛",
  );
  assert.equal(hardSafety.speechAct, "urgent_safety", "hard safety must outrank negation");

  const booking = adapt(
    frame(),
    {
      booking: { explicit: true, intent: "cancel" },
      negationGuard: guard,
    },
    "我不要預約了",
  );
  assert.equal(booking.speechAct, "manage_booking", "booking must outrank content negation");

  const selection = adapt(
    v2Frame({
      focus: "none",
      move: "continue",
      reference: "active_subject",
      speechAct: "unknown",
    }, { confidence: 0.4, intents: ["treatment"] }),
    {
      negationGuard: guard,
      selection: { indexes: [1], mode: "indexes" },
    },
    "1",
  );
  assert.equal(selection.speechAct, "select_options", "an awaited selection must outrank negation");
}

validateTreatmentAndEntityMapping();
validateNegationPolarity();
validateMultipleIntentResolution();
validateSafetyPreservation();
validateDeterministicPriceShortcutRespectsSafety();
validateBookingSupplement();
validateSelectionAndClarification();
validateInvalidAndUnderspecifiedInputs();
validateEnvelopeContract();
validateV2DialogueContract();
validateTrustedSemanticAnchors();
validateDeterministicHardDecision();
validateDeterministicCurrentTextNegation();

console.log("Conversation V2 NLU adapter validation passed (13 scenario families)");
