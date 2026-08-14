import {
  CONTROLLED_INTENTS,
  type ControlledIntent,
} from "@/lib/ai-intent-classifier";
import { clinicOntology } from "@/lib/clinic-ontology";
import {
  parseNluFrame,
  type NluFrame,
  type NluSafetyFrame,
} from "@/lib/nlu-frame";

import type {
  AwaitingOption,
  BookingDraft,
  BookingUnderstanding,
  ClarificationNeed,
  EntityMention,
  SelectionUnderstanding,
  TurnSpeechAct,
  TurnUnderstanding,
} from "./types";

const EMPTY_SAFETY: NluSafetyFrame = {
  complaint: false,
  humanRequest: false,
  postTreatmentRisk: false,
  pregnancyNursing: false,
};

const BOOKING_INTENTS = new Set(["none", "create", "modify", "cancel"]);
const BOOKING_FIELD_KEYS = new Set([
  "appointmentReference",
  "branch",
  "changeRequest",
  "firstVisit",
  "name",
  "phone",
  "timeSlots",
  "treatmentKeys",
]);
const OPTION_ENTITIES = new Set(["area", "concern", "treatment", "answer"]);
const CLARIFICATION_SLOTS = new Set(["area", "concern", "treatment"]);
const INTENT_KEYS = new Set<string>(CONTROLLED_INTENTS);
const TREATMENT_KEYS = new Set(clinicOntology.treatments.map((item) => item.key));
const CONCERN_KEYS = new Set(clinicOntology.concerns.map((item) => item.key));
const AREA_KEYS = new Set<string>(clinicOntology.areas.map((item) => item.key));
const TREATMENT_LABELS = new Map(clinicOntology.treatments.map((item) => [item.key, item.name]));
const AREA_LABELS = new Map<string, string>(
  clinicOntology.areas.map((item) => [item.key, item.label]),
);
const CONCERNS_BY_KEY = new Map(clinicOntology.concerns.map((item) => [item.key, item]));

/** Kept aligned with the V2 policy's confirmed-entity threshold. */
export const CONVERSATION_V2_NLU_MIN_CONFIDENCE = 0.65;

export type ConversationV2NluSupplement = {
  /** Trusted deterministic booking parsing; NluFrame cannot represent these fields. */
  booking?: BookingUnderstanding;
  /** Trusted clarification produced by a deterministic resolver. */
  clarification?: ClarificationNeed;
  /** Trusted selection parsed against the currently awaited options. */
  selection?: SelectionUnderstanding;
};

export type ConversationV2NluAdapterInput = {
  frame: NluFrame | null | undefined;
  receivedAt: string;
  supplemental?: ConversationV2NluSupplement;
  text: string;
  turnId: string;
};

/**
 * Adapter-only evidence retained for shadow review. The object remains a valid
 * TurnUnderstanding and can be passed directly to the pure V2 engine.
 */
export type AdaptedConversationV2Turn = TurnUnderstanding & {
  safetySignals: NluSafetyFrame;
  sourceIntents: ControlledIntent[];
};

type NormalizedSupplement = {
  booking?: BookingUnderstanding;
  clarification?: ClarificationNeed;
  selection?: SelectionUnderstanding;
  valid: boolean;
};

type EntityAdaptation = {
  areas: EntityMention[];
  concerns: EntityMention[];
  treatments: EntityMention[];
  valid: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function cleanRequiredString(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function cleanOptionalStringField(
  record: Record<string, unknown>,
  key: string,
  target: Partial<BookingDraft>,
  targetKey: keyof BookingDraft,
) {
  if (!(key in record) || record[key] === undefined) return true;
  const cleaned = cleanRequiredString(record[key]);
  if (!cleaned) return false;
  Object.assign(target, { [targetKey]: cleaned });
  return true;
}

function normalizeBookingFields(value: unknown) {
  if (value === undefined) {
    return { valid: true, value: undefined as Partial<BookingDraft> | undefined };
  }
  if (!isRecord(value) || Object.keys(value).some((key) => !BOOKING_FIELD_KEYS.has(key))) {
    return { valid: false, value: undefined };
  }

  const fields: Partial<BookingDraft> = {};
  const stringFields = [
    ["appointmentReference", "appointmentReference"],
    ["branch", "branch"],
    ["changeRequest", "changeRequest"],
    ["name", "name"],
    ["phone", "phone"],
  ] as const;
  if (
    stringFields.some(
      ([sourceKey, targetKey]) =>
        !cleanOptionalStringField(value, sourceKey, fields, targetKey),
    )
  ) {
    return { valid: false, value: undefined };
  }

  if ("firstVisit" in value && value.firstVisit !== undefined) {
    if (typeof value.firstVisit !== "boolean") return { valid: false, value: undefined };
    fields.firstVisit = value.firstVisit;
  }

  if ("timeSlots" in value && value.timeSlots !== undefined) {
    if (
      !Array.isArray(value.timeSlots) ||
      !value.timeSlots.every((item) => cleanRequiredString(item) !== null)
    ) {
      return { valid: false, value: undefined };
    }
    fields.timeSlots = uniqueStrings(value.timeSlots.map((item) => item.trim()));
  }

  if ("treatmentKeys" in value && value.treatmentKeys !== undefined) {
    if (
      !Array.isArray(value.treatmentKeys) ||
      !value.treatmentKeys.every(
        (item) => typeof item === "string" && TREATMENT_KEYS.has(item),
      )
    ) {
      return { valid: false, value: undefined };
    }
    fields.treatmentKeys = uniqueStrings(value.treatmentKeys);
  }

  return { valid: true, value: fields };
}

function normalizeBooking(value: unknown) {
  if (value === undefined) {
    return { valid: true, value: undefined as BookingUnderstanding | undefined };
  }
  if (!isRecord(value)) return { valid: false, value: undefined };
  if (
    typeof value.explicit !== "boolean" ||
    typeof value.intent !== "string" ||
    !BOOKING_INTENTS.has(value.intent)
  ) {
    return { valid: false, value: undefined };
  }

  const fields = normalizeBookingFields(value.fields);
  if (!fields.valid) return { valid: false, value: undefined };
  return {
    valid: true,
    value: {
      explicit: value.explicit,
      ...(fields.value === undefined ? {} : { fields: fields.value }),
      intent: value.intent as BookingUnderstanding["intent"],
    },
  };
}

function normalizeSelection(value: unknown) {
  if (value === undefined) {
    return { valid: true, value: undefined as SelectionUnderstanding | undefined };
  }
  if (!isRecord(value) || typeof value.mode !== "string") {
    return { valid: false, value: undefined };
  }
  if (value.mode === "all") {
    return { valid: true, value: { mode: "all" } as const };
  }
  if (value.mode === "indexes") {
    if (
      !Array.isArray(value.indexes) ||
      value.indexes.length === 0 ||
      !value.indexes.every((item) => Number.isInteger(item) && Number(item) > 0)
    ) {
      return { valid: false, value: undefined };
    }
    return {
      valid: true,
      value: {
        indexes: Array.from(new Set(value.indexes as number[])),
        mode: "indexes",
      } as const,
    };
  }
  if (value.mode === "keys") {
    if (
      !Array.isArray(value.keys) ||
      value.keys.length === 0 ||
      !value.keys.every((item) => cleanRequiredString(item) !== null)
    ) {
      return { valid: false, value: undefined };
    }
    return {
      valid: true,
      value: {
        keys: uniqueStrings(value.keys.map((item) => item.trim())),
        mode: "keys",
      } as const,
    };
  }
  return { valid: false, value: undefined };
}

function normalizeOption(value: unknown, slot: ClarificationNeed["slot"]) {
  if (!isRecord(value)) return null;
  const entity = value.entity;
  const id = cleanRequiredString(value.id);
  const label = cleanRequiredString(value.label);
  const optionValue = cleanRequiredString(value.value);
  if (
    typeof entity !== "string" ||
    !OPTION_ENTITIES.has(entity) ||
    entity !== slot ||
    !id ||
    !label ||
    !optionValue
  ) {
    return null;
  }
  return { entity, id, label, value: optionValue } as AwaitingOption;
}

function normalizeClarification(value: unknown) {
  if (value === undefined) {
    return { valid: true, value: undefined as ClarificationNeed | undefined };
  }
  if (
    !isRecord(value) ||
    typeof value.allowMultiple !== "boolean" ||
    typeof value.slot !== "string" ||
    !CLARIFICATION_SLOTS.has(value.slot) ||
    !Array.isArray(value.options)
  ) {
    return { valid: false, value: undefined };
  }
  const prompt = cleanRequiredString(value.prompt);
  if (!prompt) return { valid: false, value: undefined };
  const slot = value.slot as ClarificationNeed["slot"];
  const options = value.options.map((option) => normalizeOption(option, slot));
  if (options.some((option) => option === null)) {
    return { valid: false, value: undefined };
  }
  const normalizedOptions = options as AwaitingOption[];
  if (new Set(normalizedOptions.map((option) => option.id)).size !== normalizedOptions.length) {
    return { valid: false, value: undefined };
  }
  return {
    valid: true,
    value: {
      allowMultiple: value.allowMultiple,
      options: normalizedOptions,
      prompt,
      slot,
    },
  };
}

function normalizeSupplement(value: unknown): NormalizedSupplement {
  if (value === undefined) return { valid: true };
  if (!isRecord(value)) return { valid: false };
  const booking = normalizeBooking(value.booking);
  const clarification = normalizeClarification(value.clarification);
  const selection = normalizeSelection(value.selection);
  return {
    ...(booking.value ? { booking: booking.value } : {}),
    ...(clarification.value ? { clarification: clarification.value } : {}),
    ...(selection.value ? { selection: selection.value } : {}),
    valid: booking.valid && clarification.valid && selection.valid,
  };
}

function rawStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Extract safety before validating the rest of the frame so malformed facts cannot hide risk. */
function extractSafetySignals(value: unknown): NluSafetyFrame {
  if (!isRecord(value)) return { ...EMPTY_SAFETY };
  const safety = isRecord(value.safety) ? value.safety : {};
  const intents = rawStringArray(value.intents);
  const negatedIntentKeys = new Set(
    Array.isArray(value.negated)
      ? value.negated.flatMap((item) =>
          isRecord(item) && item.type === "intent" && typeof item.key === "string"
            ? [item.key]
            : [],
        )
      : [],
  );
  const hasIntent = (intent: ControlledIntent) =>
    intents.includes(intent) && !negatedIntentKeys.has(intent);
  return {
    complaint: safety.complaint === true || hasIntent("complaint"),
    humanRequest: safety.humanRequest === true || hasIntent("human_request"),
    postTreatmentRisk:
      safety.postTreatmentRisk === true || hasIntent("post_treatment_risk"),
    pregnancyNursing:
      safety.pregnancyNursing === true || hasIntent("pregnancy_nursing"),
  };
}

function hasAnySafetySignal(safety: NluSafetyFrame) {
  return Object.values(safety).some(Boolean);
}

function validNegationKey(type: NluFrame["negated"][number]["type"], key: string) {
  switch (type) {
    case "area":
      return AREA_KEYS.has(key);
    case "concern":
      return CONCERN_KEYS.has(key);
    case "intent":
      return INTENT_KEYS.has(key);
    case "treatment":
      return TREATMENT_KEYS.has(key);
  }
}

function addMention(
  mentions: Map<string, EntityMention>,
  input: EntityMention,
) {
  const existing = mentions.get(input.key);
  if (!existing || input.polarity === "negated" || existing.polarity !== "negated") {
    mentions.set(input.key, input);
  }
}

function adaptEntities(frame: NluFrame): EntityAdaptation {
  const validNegations = frame.negated.every((item) => validNegationKey(item.type, item.key));
  const negatedTreatments = new Set(
    frame.negated.filter((item) => item.type === "treatment").map((item) => item.key),
  );
  const negatedConcerns = new Set(
    frame.negated.filter((item) => item.type === "concern").map((item) => item.key),
  );
  const negatedAreas = new Set(
    frame.negated.filter((item) => item.type === "area").map((item) => item.key),
  );
  const treatments = new Map<string, EntityMention>();
  const concerns = new Map<string, EntityMention>();
  const areas = new Map<string, EntityMention>();
  let valid = validNegations;

  for (const treatmentKey of frame.treatments) {
    if (!TREATMENT_KEYS.has(treatmentKey)) {
      valid = false;
      continue;
    }
    addMention(treatments, {
      confidence: frame.confidence,
      key: treatmentKey,
      label: TREATMENT_LABELS.get(treatmentKey),
      polarity: negatedTreatments.has(treatmentKey) ? "negated" : "affirmed",
      resolution: "resolved",
    });
  }
  for (const treatmentKey of negatedTreatments) {
    if (!TREATMENT_KEYS.has(treatmentKey)) continue;
    addMention(treatments, {
      confidence: frame.confidence,
      key: treatmentKey,
      label: TREATMENT_LABELS.get(treatmentKey),
      polarity: "negated",
      resolution: "resolved",
    });
  }

  for (const concernFrame of frame.concerns) {
    const concern = CONCERNS_BY_KEY.get(concernFrame.key);
    if (!concern) {
      valid = false;
      continue;
    }
    if (
      concernFrame.area !== null &&
      (!AREA_KEYS.has(concernFrame.area) ||
        !concern.areaKeys.some((areaKey) => areaKey === concernFrame.area))
    ) {
      valid = false;
      continue;
    }
    const polarity = negatedConcerns.has(concern.key) ? "negated" : "affirmed";
    addMention(concerns, {
      confidence: frame.confidence,
      key: concern.key,
      polarity,
      resolution: "resolved",
    });
    if (concernFrame.area !== null && polarity === "affirmed") {
      addMention(areas, {
        confidence: frame.confidence,
        key: concernFrame.area,
        label: AREA_LABELS.get(concernFrame.area),
        polarity: negatedAreas.has(concernFrame.area) ? "negated" : "affirmed",
        resolution: "resolved",
      });
    }
  }
  for (const concernKey of negatedConcerns) {
    if (!CONCERN_KEYS.has(concernKey)) continue;
    addMention(concerns, {
      confidence: frame.confidence,
      key: concernKey,
      polarity: "negated",
      resolution: "resolved",
    });
  }
  for (const areaKey of negatedAreas) {
    if (!AREA_KEYS.has(areaKey)) continue;
    addMention(areas, {
      confidence: frame.confidence,
      key: areaKey,
      label: AREA_LABELS.get(areaKey),
      polarity: "negated",
      resolution: "resolved",
    });
  }

  return {
    areas: [...areas.values()],
    concerns: [...concerns.values()],
    treatments: [...treatments.values()],
    valid,
  };
}

function hasUsefulBookingFields(booking: BookingUnderstanding | undefined) {
  const fields = booking?.fields;
  if (!fields) return false;
  return Boolean(
    fields.appointmentReference ||
      fields.branch ||
      fields.changeRequest ||
      typeof fields.firstVisit === "boolean" ||
      fields.name ||
      fields.phone ||
      fields.timeSlots?.length ||
      fields.treatmentKeys?.length,
  );
}

function resolveSpeechAct(input: {
  entities: EntityAdaptation;
  frame: NluFrame;
  safety: NluSafetyFrame;
  supplemental: NormalizedSupplement;
}): { needsClarification: boolean; speechAct: TurnSpeechAct } {
  if (input.safety.postTreatmentRisk) {
    return { needsClarification: false, speechAct: "urgent_safety" };
  }
  if (
    input.safety.humanRequest ||
    input.safety.complaint ||
    input.safety.pregnancyNursing
  ) {
    return { needsClarification: false, speechAct: "request_handoff" };
  }
  if (input.frame.confidence < CONVERSATION_V2_NLU_MIN_CONFIDENCE) {
    return { needsClarification: true, speechAct: "unknown" };
  }
  if (!input.entities.valid || !input.supplemental.valid) {
    return { needsClarification: true, speechAct: "unknown" };
  }

  const negatedIntents = new Set(
    input.frame.negated.filter((item) => item.type === "intent").map((item) => item.key),
  );
  const activeIntents = input.frame.intents.filter((intent) => !negatedIntents.has(intent));
  const coreIntents = activeIntents.filter(
    (intent) =>
      ![
        "complaint",
        "human_request",
        "post_treatment_risk",
        "pregnancy_nursing",
      ].includes(intent),
  );
  const hasUnknownIntent = coreIntents.includes("unknown");
  const families = new Set(
    coreIntents.flatMap((intent) => {
      if (["branch_info", "doctor_schedule"].includes(intent)) return ["clinic"];
      if (["pricing", "promotion"].includes(intent)) return ["price"];
      if (["treatment", "treatment_consultation"].includes(intent)) return ["treatment"];
      if (intent === "booking") return ["booking"];
      return [];
    }),
  );

  if (input.supplemental.selection) {
    const conflictingFamilies = [...families].filter((family) => family !== "treatment");
    if (!input.supplemental.booking && conflictingFamilies.length === 0) {
      return { needsClarification: false, speechAct: "select_options" };
    }
    return { needsClarification: true, speechAct: "unknown" };
  }

  const booking = input.supplemental.booking;
  if (booking) {
    const conflictingFamilies = [...families].filter(
      (family) => family !== "booking" && family !== "treatment",
    );
    if (conflictingFamilies.length > 0) {
      return { needsClarification: true, speechAct: "unknown" };
    }
    if (booking.explicit && booking.intent !== "none") {
      return {
        needsClarification: false,
        speechAct: booking.intent === "create" ? "book_consultation" : "manage_booking",
      };
    }
    if (!booking.explicit && hasUsefulBookingFields(booking)) {
      return { needsClarification: false, speechAct: "provide_booking_field" };
    }
    return { needsClarification: true, speechAct: "unknown" };
  }

  if (families.has("booking")) {
    return { needsClarification: true, speechAct: "unknown" };
  }
  if (hasUnknownIntent || families.size !== 1) {
    return { needsClarification: true, speechAct: "unknown" };
  }

  const family = [...families][0];
  if (family === "clinic") return { needsClarification: false, speechAct: "ask_clinic_info" };
  if (family === "price") return { needsClarification: false, speechAct: "ask_price" };
  if (family !== "treatment") {
    return { needsClarification: true, speechAct: "unknown" };
  }

  const affirmedTreatments = input.entities.treatments.filter(
    (item) => item.polarity === "affirmed",
  );
  const affirmedConcerns = input.entities.concerns.filter(
    (item) => item.polarity === "affirmed",
  );
  const affirmedAreas = input.entities.areas.filter((item) => item.polarity === "affirmed");
  if (affirmedTreatments.length > 1) {
    // NluFrame has no comparison speech act. Do not infer comparison from two names.
    return { needsClarification: true, speechAct: "unknown" };
  }
  if (affirmedTreatments.length === 1) {
    return { needsClarification: false, speechAct: "learn_treatment" };
  }
  if (affirmedConcerns.length > 0 || affirmedAreas.length > 0) {
    return { needsClarification: false, speechAct: "ask_concern" };
  }
  return { needsClarification: true, speechAct: "unknown" };
}

function makeMentionsConservative(
  items: EntityMention[],
  needsClarification: boolean,
) {
  if (!needsClarification) return items;
  return items.map((item) =>
    item.polarity === "affirmed" ? { ...item, resolution: "underspecified" as const } : item,
  );
}

function assertEnvelope(input: ConversationV2NluAdapterInput) {
  if (!cleanRequiredString(input.turnId)) {
    throw new TypeError("Conversation V2 NLU adapter requires a non-empty turnId");
  }
  if (!cleanRequiredString(input.receivedAt)) {
    throw new TypeError("Conversation V2 NLU adapter requires a non-empty receivedAt");
  }
  if (typeof input.text !== "string") {
    throw new TypeError("Conversation V2 NLU adapter requires text to be a string");
  }
}

/**
 * Converts the current conservative NluFrame into the richer V2 contract.
 * Missing semantics are never invented: deterministic supplemental evidence is
 * required for booking fields, selections, and explicit clarification.
 */
export function adaptNluFrameToConversationV2Turn(
  input: ConversationV2NluAdapterInput,
): AdaptedConversationV2Turn {
  assertEnvelope(input);
  const safetySignals = extractSafetySignals(input.frame);
  const parsedFrame = parseNluFrame(input.frame);
  const supplemental = normalizeSupplement(input.supplemental);

  if (!parsedFrame) {
    const safetySpeechAct: TurnSpeechAct = safetySignals.postTreatmentRisk
      ? "urgent_safety"
      : hasAnySafetySignal(safetySignals)
        ? "request_handoff"
        : "unknown";
    return {
      areas: [],
      concerns: [],
      confidence: 0,
      receivedAt: input.receivedAt,
      safetySignals,
      sourceIntents: [],
      speechAct: safetySpeechAct,
      text: input.text,
      treatments: [],
      turnId: input.turnId,
    };
  }

  const entities = adaptEntities(parsedFrame);
  const resolution = resolveSpeechAct({
    entities,
    frame: parsedFrame,
    safety: safetySignals,
    supplemental,
  });
  const sourceIntents = parsedFrame.intents.filter((intent) => INTENT_KEYS.has(intent));
  return {
    areas: makeMentionsConservative(entities.areas, resolution.needsClarification),
    ...(supplemental.booking ? { booking: supplemental.booking } : {}),
    ...(supplemental.clarification ? { clarification: supplemental.clarification } : {}),
    concerns: makeMentionsConservative(entities.concerns, resolution.needsClarification),
    confidence: parsedFrame.confidence,
    receivedAt: input.receivedAt,
    safetySignals,
    ...(supplemental.selection ? { selection: supplemental.selection } : {}),
    sourceIntents,
    speechAct: resolution.speechAct,
    text: input.text,
    treatments: makeMentionsConservative(
      entities.treatments,
      resolution.needsClarification,
    ),
    turnId: input.turnId,
  };
}
