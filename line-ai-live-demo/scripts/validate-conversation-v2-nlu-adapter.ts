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
    confidence: 0.92,
    concerns: [],
    intents: ["unknown"],
    negated: [],
    safety: {
      complaint: false,
      humanRequest: false,
      postTreatmentRisk: false,
      pregnancyNursing: false,
    },
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
  assert.equal(unknownNegation.treatments[0]?.resolution, "underspecified");
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

validateTreatmentAndEntityMapping();
validateNegationPolarity();
validateMultipleIntentResolution();
validateSafetyPreservation();
validateBookingSupplement();
validateSelectionAndClarification();
validateInvalidAndUnderspecifiedInputs();
validateEnvelopeContract();

console.log("Conversation V2 NLU adapter validation passed (8 scenario families)");
