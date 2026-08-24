import {
  CONTROLLED_INTENTS,
  type ControlledIntent,
} from "@/lib/ai-intent-classifier";
import { clinicOntology, type ClinicOntology } from "@/lib/clinic-ontology";
import { matchClinicOntology } from "@/lib/clinic-ontology-matcher";
import {
  parseNluFrame,
  type NluFrame,
  type NluSafetyFrame,
} from "@/lib/nlu-frame";
import { isHedgedTreatmentReference, isPriceInquiry } from "@/lib/pricing-subject";
import {
  CONVERSATION_MOVES,
  DIALOGUE_REFERENCES,
  QUESTION_ASPECTS,
} from "@/lib/dialogue-semantics";

import type {
  AwaitingOption,
  BookingDraft,
  BookingUnderstanding,
  ClarificationNeed,
  DeterministicNegationGuard,
  EntityMention,
  SelectionUnderstanding,
  TrustedSemanticAnchor,
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
const SEMANTIC_ANCHOR_KEYS = new Set([
  "areaKeys",
  "concernKeys",
  "conversationMove",
  "dialogueReference",
  "questionAspect",
  "replyAssetId",
  "source",
  "speechAct",
  "treatmentKeys",
]);
const NEGATION_GUARD_KEYS = new Set([
  "affirmedAreaKeys",
  "affirmedConcernKeys",
  "affirmedTreatmentKeys",
  "areaKeys",
  "concernKeys",
  "treatmentKeys",
]);
const SEMANTIC_ANCHOR_SOURCES = new Set<TrustedSemanticAnchor["source"]>([
  "active_subject_query",
  "approved_asset",
  "exact_ontology",
]);
const SEMANTIC_ANCHOR_SPEECH_ACTS = new Set<TrustedSemanticAnchor["speechAct"]>([
  "ask_concern",
  "ask_treatment_detail",
  "learn_treatment",
]);
const CONVERSATION_MOVE_KEYS = new Set<string>(CONVERSATION_MOVES);
const DIALOGUE_REFERENCE_KEYS = new Set<string>(DIALOGUE_REFERENCES);
const QUESTION_ASPECT_KEYS = new Set<string>(QUESTION_ASPECTS);

function hasDeterministicPriceInquiry(text: string) {
  // Mentioning that the customer lacks price information is not itself a
  // request for a quote (for example, "我沒有費用資料想了解 ONDA"). Remove
  // only that meta statement before applying the shared price grammar so a
  // later explicit question such as "想問 ONDA 價格" still owns the turn.
  const inquiryText = text.replace(
    /(?:沒有|沒|無)(?:價格|價錢|價位|費用|收費|報價)(?:資料|資訊|概念)/gu,
    "",
  );
  return Boolean(isPriceInquiry(inquiryText) && !isHedgedTreatmentReference(inquiryText));
}

/** Kept aligned with the V2 policy's confirmed-entity threshold. */
export const CONVERSATION_V2_NLU_MIN_CONFIDENCE = 0.65;

export type ConversationV2NluSupplement = {
  /** Trusted deterministic booking parsing; NluFrame cannot represent these fields. */
  booking?: BookingUnderstanding;
  /** Trusted clarification produced by a deterministic resolver. */
  clarification?: ClarificationNeed;
  /** Current-text negation that must outrank model-produced positive entities. */
  negationGuard?: DeterministicNegationGuard;
  /** Deterministic safety/handoff preflight always outranks model semantics. */
  hardDecision?: {
    reason: string;
    speechAct: "request_handoff" | "urgent_safety";
  };
  /** Trusted selection parsed against the currently awaited options. */
  selection?: SelectionUnderstanding;
  /** Deterministic treatment-content evidence; never carries clinic facts or prose. */
  semanticAnchor?: TrustedSemanticAnchor;
};

export type ConversationV2NluAdapterInput = {
  frame: NluFrame | null | undefined;
  ontology?: ClinicOntology;
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
  hardDecision?: ConversationV2NluSupplement["hardDecision"];
  negationGuard?: DeterministicNegationGuard;
  selection?: SelectionUnderstanding;
  semanticAnchor?: TrustedSemanticAnchor;
  valid: boolean;
};

type EntityAdaptation = {
  areas: EntityMention[];
  concerns: EntityMention[];
  treatments: EntityMention[];
  valid: boolean;
};

type EntityRegistry = {
  areaKeys: Set<string>;
  areaLabels: Map<string, string>;
  concernKeys: Set<string>;
  concernsByKey: Map<string, ClinicOntology["concerns"][number]>;
  treatmentKeys: Set<string>;
  treatmentLabels: Map<string, string>;
};

function createEntityRegistry(ontology: ClinicOntology): EntityRegistry {
  return {
    areaKeys: new Set(ontology.areas.map((item) => item.key)),
    areaLabels: new Map(ontology.areas.map((item) => [item.key, item.label])),
    concernKeys: new Set(ontology.concerns.map((item) => item.key)),
    concernsByKey: new Map(ontology.concerns.map((item) => [item.key, item])),
    treatmentKeys: new Set(ontology.treatments.map((item) => item.key)),
    treatmentLabels: new Map(ontology.treatments.map((item) => [item.key, item.name])),
  };
}

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

function normalizeBookingFields(value: unknown, registry: EntityRegistry) {
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
        (item) => typeof item === "string" && registry.treatmentKeys.has(item),
      )
    ) {
      return { valid: false, value: undefined };
    }
    fields.treatmentKeys = uniqueStrings(value.treatmentKeys);
  }

  return { valid: true, value: fields };
}

function normalizeBooking(value: unknown, registry: EntityRegistry) {
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

  const fields = normalizeBookingFields(value.fields, registry);
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

function normalizeHardDecision(value: unknown) {
  if (value === undefined) {
    return {
      valid: true,
      value: undefined as ConversationV2NluSupplement["hardDecision"] | undefined,
    };
  }
  if (!isRecord(value) || Object.keys(value).some((key) => !["reason", "speechAct"].includes(key))) {
    return { valid: false, value: undefined };
  }
  const reason = cleanRequiredString(value.reason);
  if (
    !reason ||
    (value.speechAct !== "request_handoff" && value.speechAct !== "urgent_safety")
  ) {
    return { valid: false, value: undefined };
  }
  return {
    valid: true,
    value: {
      reason,
      speechAct: value.speechAct as "request_handoff" | "urgent_safety",
    },
  };
}

function normalizeSemanticAnchorKeys(value: unknown, allowedKeys: Set<string>) {
  if (!Array.isArray(value)) return { valid: false, value: [] as string[] };
  const normalized = value.map((item) => cleanRequiredString(item));
  if (normalized.some((item) => !item || !allowedKeys.has(item))) {
    return { valid: false, value: [] as string[] };
  }
  return {
    valid: true,
    value: uniqueStrings(normalized as string[]),
  };
}

function normalizeSemanticAnchor(value: unknown, registry: EntityRegistry) {
  if (value === undefined) {
    return {
      valid: true,
      value: undefined as TrustedSemanticAnchor | undefined,
    };
  }
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !SEMANTIC_ANCHOR_KEYS.has(key))
  ) {
    return { valid: false, value: undefined };
  }

  const areaKeys = normalizeSemanticAnchorKeys(value.areaKeys, registry.areaKeys);
  const concernKeys = normalizeSemanticAnchorKeys(value.concernKeys, registry.concernKeys);
  const treatmentKeys = normalizeSemanticAnchorKeys(value.treatmentKeys, registry.treatmentKeys);
  const conversationMove = cleanRequiredString(value.conversationMove);
  const dialogueReference = cleanRequiredString(value.dialogueReference);
  const questionAspect = cleanRequiredString(value.questionAspect);
  const replyAssetId = value.replyAssetId === undefined
    ? undefined
    : cleanRequiredString(value.replyAssetId);
  const source = cleanRequiredString(value.source);
  const speechAct = cleanRequiredString(value.speechAct);
  const hasEntityEvidence =
    areaKeys.value.length + concernKeys.value.length + treatmentKeys.value.length > 0;
  const hasValidAssetBinding = source === "approved_asset"
    ? Boolean(replyAssetId)
    : ["active_subject_query", "exact_ontology"].includes(source ?? "") &&
      replyAssetId === undefined;

  if (
    !areaKeys.valid ||
    !concernKeys.valid ||
    !treatmentKeys.valid ||
    !hasEntityEvidence ||
    !conversationMove ||
    !CONVERSATION_MOVE_KEYS.has(conversationMove) ||
    !dialogueReference ||
    !DIALOGUE_REFERENCE_KEYS.has(dialogueReference) ||
    !questionAspect ||
    !QUESTION_ASPECT_KEYS.has(questionAspect) ||
    !source ||
    !SEMANTIC_ANCHOR_SOURCES.has(source as TrustedSemanticAnchor["source"]) ||
    !speechAct ||
    !SEMANTIC_ANCHOR_SPEECH_ACTS.has(speechAct as TrustedSemanticAnchor["speechAct"]) ||
    !hasValidAssetBinding
  ) {
    return { valid: false, value: undefined };
  }

  return {
    valid: true,
    value: {
      areaKeys: areaKeys.value,
      concernKeys: concernKeys.value,
      conversationMove: conversationMove as TrustedSemanticAnchor["conversationMove"],
      dialogueReference: dialogueReference as TrustedSemanticAnchor["dialogueReference"],
      questionAspect: questionAspect as TrustedSemanticAnchor["questionAspect"],
      ...(replyAssetId ? { replyAssetId } : {}),
      source: source as TrustedSemanticAnchor["source"],
      speechAct: speechAct as TrustedSemanticAnchor["speechAct"],
      treatmentKeys: treatmentKeys.value,
    },
  };
}

function normalizeNegationGuard(value: unknown, registry: EntityRegistry) {
  if (value === undefined) {
    return {
      valid: true,
      value: undefined as DeterministicNegationGuard | undefined,
    };
  }
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !NEGATION_GUARD_KEYS.has(key))
  ) {
    return { valid: false, value: undefined };
  }
  const areaKeys = normalizeSemanticAnchorKeys(value.areaKeys, registry.areaKeys);
  const concernKeys = normalizeSemanticAnchorKeys(value.concernKeys, registry.concernKeys);
  const treatmentKeys = normalizeSemanticAnchorKeys(value.treatmentKeys, registry.treatmentKeys);
  const affirmedAreaKeys = normalizeSemanticAnchorKeys(
    value.affirmedAreaKeys,
    registry.areaKeys,
  );
  const affirmedConcernKeys = normalizeSemanticAnchorKeys(
    value.affirmedConcernKeys,
    registry.concernKeys,
  );
  const affirmedTreatmentKeys = normalizeSemanticAnchorKeys(
    value.affirmedTreatmentKeys,
    registry.treatmentKeys,
  );
  if (
    !areaKeys.valid ||
    !concernKeys.valid ||
    !treatmentKeys.valid ||
    !affirmedAreaKeys.valid ||
    !affirmedConcernKeys.valid ||
    !affirmedTreatmentKeys.valid
  ) {
    return { valid: false, value: undefined };
  }
  return {
    valid: true,
    value: {
      affirmedAreaKeys: affirmedAreaKeys.value,
      affirmedConcernKeys: affirmedConcernKeys.value,
      affirmedTreatmentKeys: affirmedTreatmentKeys.value,
      areaKeys: areaKeys.value,
      concernKeys: concernKeys.value,
      treatmentKeys: treatmentKeys.value,
    },
  };
}

function normalizeSupplement(value: unknown, registry: EntityRegistry): NormalizedSupplement {
  if (value === undefined) return { valid: true };
  if (!isRecord(value)) return { valid: false };
  if (Object.keys(value).some((key) => ![
    "booking",
    "clarification",
    "hardDecision",
    "negationGuard",
    "selection",
    "semanticAnchor",
  ].includes(key))) {
    return { valid: false };
  }
  const booking = normalizeBooking(value.booking, registry);
  const clarification = normalizeClarification(value.clarification);
  const hardDecision = normalizeHardDecision(value.hardDecision);
  const negationGuard = normalizeNegationGuard(value.negationGuard, registry);
  const selection = normalizeSelection(value.selection);
  const semanticAnchor = normalizeSemanticAnchor(value.semanticAnchor, registry);
  return {
    ...(booking.value ? { booking: booking.value } : {}),
    ...(clarification.value ? { clarification: clarification.value } : {}),
    ...(hardDecision.value ? { hardDecision: hardDecision.value } : {}),
    ...(negationGuard.value ? { negationGuard: negationGuard.value } : {}),
    ...(selection.value ? { selection: selection.value } : {}),
    ...(semanticAnchor.value ? { semanticAnchor: semanticAnchor.value } : {}),
    valid:
      booking.valid &&
      clarification.valid &&
      hardDecision.valid &&
      negationGuard.valid &&
      selection.valid &&
      semanticAnchor.valid,
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

function validNegationKey(
  registry: EntityRegistry,
  type: NluFrame["negated"][number]["type"],
  key: string,
) {
  switch (type) {
    case "area":
      return registry.areaKeys.has(key);
    case "concern":
      return registry.concernKeys.has(key);
    case "intent":
      return INTENT_KEYS.has(key);
    case "treatment":
      return registry.treatmentKeys.has(key);
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

function adaptEntities(frame: NluFrame, registry: EntityRegistry): EntityAdaptation {
  const validNegations = frame.negated.every((item) =>
    validNegationKey(registry, item.type, item.key));
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
    if (!registry.treatmentKeys.has(treatmentKey)) {
      valid = false;
      continue;
    }
    addMention(treatments, {
      confidence: frame.confidence,
      key: treatmentKey,
      label: registry.treatmentLabels.get(treatmentKey),
      polarity: negatedTreatments.has(treatmentKey) ? "negated" : "affirmed",
      resolution: "resolved",
    });
  }
  for (const treatmentKey of negatedTreatments) {
    if (!registry.treatmentKeys.has(treatmentKey)) continue;
    addMention(treatments, {
      confidence: frame.confidence,
      key: treatmentKey,
      label: registry.treatmentLabels.get(treatmentKey),
      polarity: "negated",
      resolution: "resolved",
    });
  }

  for (const areaKey of frame.areas) {
    if (!registry.areaKeys.has(areaKey)) {
      valid = false;
      continue;
    }
    addMention(areas, {
      confidence: frame.confidence,
      key: areaKey,
      label: registry.areaLabels.get(areaKey),
      polarity: negatedAreas.has(areaKey) ? "negated" : "affirmed",
      resolution: "resolved",
    });
  }

  for (const concernFrame of frame.concerns) {
    const concern = registry.concernsByKey.get(concernFrame.key);
    if (!concern) {
      valid = false;
      continue;
    }
    if (
      concernFrame.area !== null &&
      (!registry.areaKeys.has(concernFrame.area) ||
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
        label: registry.areaLabels.get(concernFrame.area),
        polarity: negatedAreas.has(concernFrame.area) ? "negated" : "affirmed",
        resolution: "resolved",
      });
    }
  }
  for (const concernKey of negatedConcerns) {
    if (!registry.concernKeys.has(concernKey)) continue;
    addMention(concerns, {
      confidence: frame.confidence,
      key: concernKey,
      polarity: "negated",
      resolution: "resolved",
    });
  }
  for (const areaKey of negatedAreas) {
    if (!registry.areaKeys.has(areaKey)) continue;
    addMention(areas, {
      confidence: frame.confidence,
      key: areaKey,
      label: registry.areaLabels.get(areaKey),
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

function adaptSemanticAnchorEntities(
  anchor: TrustedSemanticAnchor,
  registry: EntityRegistry,
): EntityAdaptation {
  const mention = (key: string, label?: string): EntityMention => ({
    confidence: 1,
    key,
    ...(label ? { label } : {}),
    polarity: "affirmed",
    resolution: "resolved",
  });
  return {
    areas: anchor.areaKeys.map((key) => mention(key, registry.areaLabels.get(key))),
    concerns: anchor.concernKeys.map((key) => mention(key)),
    treatments: anchor.treatmentKeys.map((key) =>
      mention(key, registry.treatmentLabels.get(key))),
    valid: true,
  };
}

function adaptDeterministicPriceEntities(
  text: string,
  ontology: ClinicOntology,
  registry: EntityRegistry,
): EntityAdaptation {
  const matched = matchClinicOntology(text, ontology);
  if (matched.negated) {
    return { areas: [], concerns: [], treatments: [], valid: true };
  }
  const treatmentKeys = Array.from(new Set(matched.treatments.map((item) => item.key)));
  return {
    areas: [],
    concerns: [],
    treatments: treatmentKeys.map((key) => ({
      confidence: 1,
      key,
      ...(registry.treatmentLabels.get(key)
        ? { label: registry.treatmentLabels.get(key) }
        : {}),
      polarity: "affirmed" as const,
      resolution: "resolved" as const,
    })),
    valid: true,
  };
}

function adaptNegationGuardEntities(
  guard: DeterministicNegationGuard,
  registry: EntityRegistry,
): EntityAdaptation {
  const mention = (
    key: string,
    polarity: EntityMention["polarity"],
    label?: string,
  ): EntityMention => ({
    confidence: 1,
    key,
    ...(label ? { label } : {}),
    polarity,
    resolution: "resolved",
  });
  const areas = new Map<string, EntityMention>();
  const concerns = new Map<string, EntityMention>();
  const treatments = new Map<string, EntityMention>();
  for (const key of guard.affirmedAreaKeys) {
    addMention(areas, mention(key, "affirmed", registry.areaLabels.get(key)));
  }
  for (const key of guard.affirmedConcernKeys) {
    addMention(concerns, mention(key, "affirmed"));
  }
  for (const key of guard.affirmedTreatmentKeys) {
    addMention(treatments, mention(key, "affirmed", registry.treatmentLabels.get(key)));
  }
  for (const key of guard.areaKeys) {
    addMention(areas, mention(key, "negated", registry.areaLabels.get(key)));
  }
  for (const key of guard.concernKeys) {
    addMention(concerns, mention(key, "negated"));
  }
  for (const key of guard.treatmentKeys) {
    addMention(treatments, mention(key, "negated", registry.treatmentLabels.get(key)));
  }
  return {
    areas: [...areas.values()],
    concerns: [...concerns.values()],
    treatments: [...treatments.values()],
    valid: true,
  };
}

function negationGuardSpeechAct(guard: DeterministicNegationGuard): TurnSpeechAct {
  if (guard.affirmedConcernKeys.length + guard.affirmedAreaKeys.length > 0) {
    return "ask_concern";
  }
  if (guard.affirmedTreatmentKeys.length === 1) {
    return "learn_treatment";
  }
  return "unknown";
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

function trustedBookingSpeechAct(booking: BookingUnderstanding | undefined): TurnSpeechAct | null {
  if (!booking) return null;
  if (booking.explicit && booking.intent !== "none") {
    return booking.intent === "create" ? "book_consultation" : "manage_booking";
  }
  return !booking.explicit && hasUsefulBookingFields(booking)
    ? "provide_booking_field"
    : null;
}

function activeIntentFamilies(frame: NluFrame) {
  const negatedIntents = new Set(
    frame.negated.filter((item) => item.type === "intent").map((item) => item.key),
  );
  const activeIntents = frame.intents.filter((intent) => !negatedIntents.has(intent));
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
  return { families, hasUnknownIntent };
}

function resolveLegacySpeechAct(input: {
  entities: EntityAdaptation;
  frame: NluFrame;
}): { needsClarification: boolean; speechAct: TurnSpeechAct } {
  const { families, hasUnknownIntent } = activeIntentFamilies(input.frame);

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
    // Legacy NluFrame has no comparison speech act. Do not infer comparison from two names.
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

function resolveV2SpeechAct(input: {
  entities: EntityAdaptation;
  frame: NluFrame;
}): { needsClarification: boolean; speechAct: TurnSpeechAct } {
  const dialogue = input.frame.dialogue;
  const affirmedTreatments = input.entities.treatments.filter(
    (item) => item.polarity === "affirmed",
  );
  const affirmedConcerns = input.entities.concerns.filter(
    (item) => item.polarity === "affirmed",
  );
  const affirmedAreas = input.entities.areas.filter((item) => item.polarity === "affirmed");
  const hasAffirmedEntities =
    affirmedTreatments.length > 0 || affirmedConcerns.length > 0 || affirmedAreas.length > 0;

  switch (dialogue.speechAct) {
    case "request_handoff":
    case "urgent_safety":
    case "ask_clinic_info":
    case "ask_price":
      return { needsClarification: false, speechAct: dialogue.speechAct };
    case "compare_treatments": {
      const enoughExplicitTreatments = affirmedTreatments.length >= 2;
      const canUseActiveSubject =
        dialogue.reference === "active_subject" && affirmedTreatments.length >= 1;
      const canUseActiveComparison =
        dialogue.reference === "active_comparison" && affirmedTreatments.length === 0;
      return enoughExplicitTreatments || canUseActiveSubject || canUseActiveComparison
        ? { needsClarification: false, speechAct: "compare_treatments" }
        : { needsClarification: true, speechAct: "unknown" };
    }
    case "learn_treatment":
      if (affirmedTreatments.length > 1) {
        return { needsClarification: true, speechAct: "unknown" };
      }
      return hasAffirmedEntities || ["active_subject", "active_comparison"].includes(dialogue.reference)
        ? { needsClarification: false, speechAct: "learn_treatment" }
        : { needsClarification: true, speechAct: "unknown" };
    case "ask_treatment_detail":
      return hasAffirmedEntities || ["active_subject", "active_comparison"].includes(dialogue.reference)
        ? { needsClarification: false, speechAct: "ask_treatment_detail" }
        : { needsClarification: true, speechAct: "unknown" };
    case "ask_concern":
      return hasAffirmedEntities || dialogue.reference === "active_subject"
        ? { needsClarification: false, speechAct: "ask_concern" }
        : { needsClarification: true, speechAct: "unknown" };
    case "book_consultation":
    case "manage_booking":
    case "provide_booking_field":
      // Booking mutations and fields require deterministic supplemental evidence.
      return { needsClarification: true, speechAct: "unknown" };
    case "select_options":
    case "unknown":
      return { needsClarification: true, speechAct: "unknown" };
  }
}

function shouldUseSemanticAnchor(input: {
  entities: EntityAdaptation;
  frame: NluFrame;
  supplemental: NormalizedSupplement;
}) {
  const anchor = input.supplemental.semanticAnchor;
  const hasAffirmedTreatmentOutsideAnchor = anchor && input.entities.treatments.some(
    (mention) =>
      mention.polarity === "affirmed" && !anchor.treatmentKeys.includes(mention.key),
  );
  const hasAffirmedOutsideAnchor = anchor && [
    [input.entities.areas, new Set(anchor.areaKeys)],
    [input.entities.concerns, new Set(anchor.concernKeys)],
    [input.entities.treatments, new Set(anchor.treatmentKeys)],
  ].some(([mentions, keys]) =>
    (mentions as EntityMention[]).some((mention) =>
      mention.polarity === "affirmed" && !(keys as Set<string>).has(mention.key)),
  );
  return Boolean(
    anchor &&
    (
      // These anchors are not merely entity corrections. An approved asset is
      // exact reviewed content, while an active-subject query has already
      // proven its aspect from the current text and consumed all residual
      // wording. Preserve that content capability even when a confident model
      // repeats the same owner or assigns a different focus; otherwise the
      // downstream facts/asset obligation silently disappears into a generic
      // reply. Hard-domain, safety, booking, multi-treatment and explicit
      // owner conflicts were rejected before an anchor can be created.
      ["active_subject_query", "approved_asset"].includes(anchor.source) ||
      // An explicit treatment plus a fully deterministic current-text aspect
      // (brand/risk/symptom grammar) must also correct a confident but
      // contradictory model focus. Bare treatment names do not satisfy this:
      // their anchor aspect simply mirrors the model and therefore does not
      // differ here.
      (
        anchor.source === "exact_ontology" &&
        anchor.speechAct === "ask_treatment_detail" &&
        !["none", "overview"].includes(anchor.questionAspect) &&
        anchor.questionAspect !== input.frame.dialogue.focus
      ) ||
      // "請重新介紹 ONDA" is an explicit customer reset. A confident model
      // may still call it a continuation because the same treatment is active;
      // deterministic current-text evidence must own start/overview semantics.
      (
        anchor.source === "exact_ontology" &&
        anchor.speechAct === "learn_treatment" &&
        anchor.conversationMove === "start" &&
        anchor.questionAspect === "overview" &&
        (
          input.frame.dialogue.move !== "start" ||
          input.frame.dialogue.focus !== "overview" ||
          input.frame.dialogue.speechAct !== "learn_treatment"
        )
      ) ||
      // Exact current-message ontology evidence owns entity provenance even
      // when the model is confident *and* the model supplied an entity outside
      // that anchor. This removes a stale active-treatment echo on a clean
      // topic switch without replacing a valid contextual follow-up merely
      // because the model omitted its already-known owner.
      (anchor.source === "exact_ontology" && hasAffirmedOutsideAnchor) ||
      // For a fully consumed active-subject/approved-asset question, the
      // current text proves which treatment owns the follow-up. A confident
      // model may still echo or hallucinate another treatment that the
      // customer never named; discard only that treatment mismatch. Concern
      // and area ownership remain contextual unless exact ontology evidence
      // above proves a clean current-text switch.
      (
        ["active_subject_query", "approved_asset"].includes(anchor.source) &&
        hasAffirmedTreatmentOutsideAnchor
      ) ||
      input.frame.confidence < CONVERSATION_V2_NLU_MIN_CONFIDENCE ||
      input.frame.dialogue.speechAct === "unknown" ||
      !input.entities.valid
    ),
  );
}

function resolveSpeechAct(input: {
  entities: EntityAdaptation;
  frame: NluFrame;
  safety: NluSafetyFrame;
  supplemental: NormalizedSupplement;
}): { needsClarification: boolean; speechAct: TurnSpeechAct } {
  if (input.supplemental.hardDecision) {
    return {
      needsClarification: false,
      speechAct: input.supplemental.hardDecision.speechAct,
    };
  }
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
  if (!input.supplemental.valid) {
    return { needsClarification: true, speechAct: "unknown" };
  }

  const trustedBooking = trustedBookingSpeechAct(input.supplemental.booking);
  if (trustedBooking) {
    return { needsClarification: false, speechAct: trustedBooking };
  }

  if (input.supplemental.selection) {
    const { families } = activeIntentFamilies(input.frame);
    const conflictingFamilies = [...families].filter((family) => family !== "treatment");
    if (
      input.frame.confidence < CONVERSATION_V2_NLU_MIN_CONFIDENCE ||
      conflictingFamilies.length === 0
    ) {
      return { needsClarification: false, speechAct: "select_options" };
    }
    return { needsClarification: true, speechAct: "unknown" };
  }
  // Current customer text is stronger evidence than an NLU entity echo. A
  // pure rejection remains unknown, while an independent positive clause may
  // keep its deterministically resolved treatment/concern as the content task.
  if (input.supplemental.negationGuard) {
    return {
      needsClarification: false,
      speechAct: negationGuardSpeechAct(input.supplemental.negationGuard),
    };
  }
  if (shouldUseSemanticAnchor(input)) {
    return {
      needsClarification: false,
      speechAct: input.supplemental.semanticAnchor!.speechAct,
    };
  }
  if (input.frame.confidence < CONVERSATION_V2_NLU_MIN_CONFIDENCE) {
    return { needsClarification: true, speechAct: "unknown" };
  }
  if (!input.entities.valid) {
    return { needsClarification: true, speechAct: "unknown" };
  }

  return input.frame.schemaVersion === 1
    ? resolveLegacySpeechAct(input)
    : resolveV2SpeechAct(input);
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
  const ontology = input.ontology ?? clinicOntology;
  const registry = createEntityRegistry(ontology);
  const safetySignals = extractSafetySignals(input.frame);
  const parsedFrame = parseNluFrame(input.frame, ontology);
  const supplemental = normalizeSupplement(input.supplemental, registry);

  if (!parsedFrame) {
    const trustedBooking = supplemental.valid
      ? trustedBookingSpeechAct(supplemental.booking)
      : null;
    const hasSafetyPriority = Boolean(
      supplemental.hardDecision || hasAnySafetySignal(safetySignals),
    );
    const selectedNegationGuard = supplemental.valid &&
      supplemental.negationGuard &&
      !hasSafetyPriority &&
      !trustedBooking &&
      !supplemental.selection
        ? supplemental.negationGuard
        : undefined;
    const selectedSemanticAnchor = supplemental.valid &&
      supplemental.semanticAnchor &&
      !hasSafetyPriority &&
      !trustedBooking &&
      !supplemental.selection &&
      !selectedNegationGuard
        ? supplemental.semanticAnchor
        : undefined;
    const deterministicPriceInquiry =
      !hasSafetyPriority &&
      !trustedBooking &&
      !supplemental.selection &&
      !supplemental.clarification &&
      !selectedNegationGuard &&
      !selectedSemanticAnchor &&
      hasDeterministicPriceInquiry(input.text);
    const deterministicSpeechAct = trustedBooking ??
      (supplemental.valid && supplemental.selection ? "select_options" as const : null) ??
      (selectedNegationGuard ? negationGuardSpeechAct(selectedNegationGuard) : null) ??
      selectedSemanticAnchor?.speechAct ??
      (deterministicPriceInquiry ? "ask_price" as const : null) ??
      null;
    const safetySpeechAct: TurnSpeechAct = supplemental.hardDecision?.speechAct ??
      (safetySignals.postTreatmentRisk
        ? "urgent_safety"
        : hasAnySafetySignal(safetySignals)
          ? "request_handoff"
          : deterministicSpeechAct ?? "unknown");
    const deterministicEntities = selectedNegationGuard
      ? adaptNegationGuardEntities(selectedNegationGuard, registry)
      : selectedSemanticAnchor
      ? adaptSemanticAnchorEntities(selectedSemanticAnchor, registry)
      : deterministicPriceInquiry
      ? adaptDeterministicPriceEntities(input.text, ontology, registry)
      : { areas: [], concerns: [], treatments: [], valid: true };
    const hasResolvedNegation = Boolean(
      selectedNegationGuard &&
      selectedNegationGuard.areaKeys.length +
        selectedNegationGuard.concernKeys.length +
        selectedNegationGuard.treatmentKeys.length > 0,
    );
    const hasResolvedAffirmation = Boolean(
      selectedNegationGuard &&
      selectedNegationGuard.affirmedAreaKeys.length +
        selectedNegationGuard.affirmedConcernKeys.length +
        selectedNegationGuard.affirmedTreatmentKeys.length > 0,
    );
    return {
      areas: deterministicEntities.areas,
      ...(supplemental.valid && supplemental.booking ? { booking: supplemental.booking } : {}),
      ...(supplemental.valid && supplemental.clarification ? { clarification: supplemental.clarification } : {}),
      conversationMove: selectedSemanticAnchor?.conversationMove ??
        (hasResolvedAffirmation ? "start" : hasResolvedNegation ? "reject" : "none"),
      concerns: deterministicEntities.concerns,
      confidence: deterministicSpeechAct || selectedNegationGuard ? 1 : 0,
      dialogueReference: selectedSemanticAnchor?.dialogueReference ?? (
        deterministicPriceInquiry && deterministicEntities.treatments.length > 0
          ? "explicit"
          : hasResolvedNegation || hasResolvedAffirmation
            ? "explicit"
            : "none"
      ),
      questionAspect: selectedSemanticAnchor?.questionAspect ??
        (hasResolvedAffirmation ? "overview" : "none"),
      receivedAt: input.receivedAt,
      ...(selectedSemanticAnchor?.replyAssetId
        ? { replyAssetId: selectedSemanticAnchor.replyAssetId }
        : {}),
      safetySignals,
      ...(supplemental.valid && supplemental.selection ? { selection: supplemental.selection } : {}),
      ...(selectedSemanticAnchor ? { semanticEvidence: selectedSemanticAnchor.source } : {}),
      sourceIntents: [],
      speechAct: safetySpeechAct,
      text: input.text,
      treatments: deterministicEntities.treatments,
      turnId: input.turnId,
    };
  }

  const entities = adaptEntities(parsedFrame, registry);
  const resolved = resolveSpeechAct({
    entities,
    frame: parsedFrame,
    safety: safetySignals,
    supplemental,
  });
  // A low model confidence must not erase deterministic price wording present in the
  // customer's own sentence. A named treatment can be resolved from this turn, while a
  // short follow-up such as `那價格呢` is owned later by policy from the active subject.
  // With no resolvable subject policy still asks a price-specific clarification; the
  // adapter never chooses a treatment or an amount. This only rescues the low-confidence
  // "unknown" outcome. It must never outrank resolveSpeechAct's earlier conclusions --
  // urgent_safety, request_handoff, a hard decision or a selection answer -- because
  // "做完 ONDA 後臉腫得厲害，處理要多少錢" is a safety turn that also names a price.
  const protectedSpeechActs = new Set<TurnSpeechAct>([
    "book_consultation",
    "manage_booking",
    "provide_booking_field",
    "request_handoff",
    "select_options",
    "urgent_safety",
  ]);
  const deterministicPriceOwnsTurn =
    hasDeterministicPriceInquiry(input.text) &&
    !protectedSpeechActs.has(resolved.speechAct) &&
    !supplemental.selection &&
    !supplemental.clarification &&
    !supplemental.negationGuard;
  // Explicit current-text price wording is stronger than a model that calls the
  // same sentence a treatment introduction. It still cannot outrank safety,
  // booking, handoff, a displayed selection, or a current-text negation guard.
  const resolution = deterministicPriceOwnsTurn
    ? { needsClarification: false, speechAct: "ask_price" as const }
    : resolved;
  const selectedNegationGuard =
    supplemental.valid &&
    supplemental.negationGuard &&
    resolution.speechAct === negationGuardSpeechAct(supplemental.negationGuard) &&
    !resolution.needsClarification
      ? supplemental.negationGuard
      : undefined;
  const selectedSemanticAnchor =
    !selectedNegationGuard &&
    supplemental.valid &&
    supplemental.semanticAnchor &&
    shouldUseSemanticAnchor({ entities, frame: parsedFrame, supplemental }) &&
    resolution.speechAct === supplemental.semanticAnchor.speechAct
      ? supplemental.semanticAnchor
      : undefined;
  const effectiveEntities = selectedNegationGuard
    ? adaptNegationGuardEntities(selectedNegationGuard, registry)
    : selectedSemanticAnchor
    ? adaptSemanticAnchorEntities(selectedSemanticAnchor, registry)
    : entities;
  const hasResolvedNegation = Boolean(
    selectedNegationGuard &&
    selectedNegationGuard.areaKeys.length +
      selectedNegationGuard.concernKeys.length +
      selectedNegationGuard.treatmentKeys.length > 0,
  );
  const hasResolvedAffirmation = Boolean(
    selectedNegationGuard &&
    selectedNegationGuard.affirmedAreaKeys.length +
      selectedNegationGuard.affirmedConcernKeys.length +
      selectedNegationGuard.affirmedTreatmentKeys.length > 0,
  );
  const sourceIntents = parsedFrame.intents.filter((intent) => INTENT_KEYS.has(intent));
  return {
    areas: makeMentionsConservative(effectiveEntities.areas, resolution.needsClarification),
    ...(supplemental.booking ? { booking: supplemental.booking } : {}),
    ...(supplemental.clarification ? { clarification: supplemental.clarification } : {}),
    conversationMove: selectedSemanticAnchor?.conversationMove ??
      (selectedNegationGuard
        ? hasResolvedAffirmation ? "start" : hasResolvedNegation ? "reject" : "none"
        : parsedFrame.dialogue.move),
    concerns: makeMentionsConservative(effectiveEntities.concerns, resolution.needsClarification),
    confidence: selectedSemanticAnchor || selectedNegationGuard || trustedBookingSpeechAct(supplemental.booking)
      ? 1
      : parsedFrame.confidence,
    dialogueReference: selectedSemanticAnchor?.dialogueReference ??
      (selectedNegationGuard
        ? hasResolvedNegation || hasResolvedAffirmation ? "explicit" : "none"
        : parsedFrame.dialogue.reference),
    questionAspect: selectedSemanticAnchor?.questionAspect ??
      (selectedNegationGuard
        ? hasResolvedAffirmation ? "overview" : "none"
        : parsedFrame.dialogue.focus),
    receivedAt: input.receivedAt,
    ...(selectedSemanticAnchor?.replyAssetId
      ? { replyAssetId: selectedSemanticAnchor.replyAssetId }
      : {}),
    safetySignals,
    ...(supplemental.selection ? { selection: supplemental.selection } : {}),
    ...(selectedSemanticAnchor ? { semanticEvidence: selectedSemanticAnchor.source } : {}),
    sourceIntents,
    speechAct: resolution.speechAct,
    text: input.text,
    treatments: makeMentionsConservative(
      effectiveEntities.treatments,
      resolution.needsClarification,
    ),
    turnId: input.turnId,
  };
}
