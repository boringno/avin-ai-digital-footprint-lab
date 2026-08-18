import assert from "node:assert/strict";

import type { NluFrame } from "../src/lib/nlu-frame";
import {
  adaptNluFrameToConversationV2Turn,
  type ConversationV2NluAdapterInput,
  type ConversationV2NluSupplement,
} from "../src/lib/conversation-v2/nlu-adapter";

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
validateDeterministicHardDecision();

console.log("Conversation V2 NLU adapter validation passed (10 scenario families)");
