import {
  CONVERSATION_MOVES,
  DIALOGUE_REFERENCES,
  QUESTION_ASPECTS,
} from "@/lib/dialogue-semantics";
import {
  isResponseContract,
  isResponseAspect,
  type ResponseAspect,
  type ResponseContract,
  type ResponseExpectedAnswerType,
} from "@/lib/response-contract";

import {
  cloneConversationV2State,
  parsePersistedConversationV2State,
  PROCESSED_TURN_ID_LIMIT,
} from "./state";
import {
  CONVERSATION_V2_SCHEMA_VERSION,
  type AwaitingOption,
  type ConversationV2State,
  type KnowledgeContext,
} from "./types";

export const CONVERSATION_STATE_V3_SCHEMA_VERSION = 3 as const;
export const CONVERSATION_STATE_V3_DELIVERY_ID_LIMIT = 64;
export const CONVERSATION_STATE_V3_SUBJECT_LIMIT = 12;
export const CONVERSATION_STATE_V3_ANSWERED_ASPECT_LIMIT = 24;

export type DialogueCustomerGoal =
  | "learn"
  | "compare"
  | "choose"
  | "resolve_objection"
  | "book"
  | "manage_booking"
  | "handoff"
  | "unspecified";

export type DialogueStage =
  | "unknown"
  | "introduce"
  | "discover"
  | "explain"
  | "compare"
  | "resolve"
  | "invite"
  | "collect_booking"
  | "handoff";

export type DeliveredAnsweredAspect = {
  answeredAt: string;
  aspect: ResponseAspect;
  deliveryId: string;
  sourceTurnId: string;
};

/**
 * A question that the customer actually received. A policy proposal must not be
 * written here before the LINE delivery succeeds.
 */
export type DeliveredPendingQuestion = {
  askedAt: string;
  deliveryId: string;
  expectedAnswerType: ResponseExpectedAnswerType;
  options: DeliveredPendingOption[];
  purpose: ResponseAspect;
  /** Derived from the policy-owned contract; rendered customer prose is never persisted. */
  questionKey: string;
  sourceTurnId: string;
  subjectKey?: string;
};

export type DeliveredPendingOption = Pick<AwaitingOption, "entity" | "value">;

export type SubjectDialogueMemory = {
  answeredAspects: DeliveredAnsweredAspect[];
  /** Subject-scoped facts observed from the customer or clinic data, never prose. */
  knowledge: KnowledgeContext;
  subjectKey: string;
  updatedAt: string;
};

export type DialogueProgress = {
  activeSubjectKey?: string;
  customerGoal: DialogueCustomerGoal;
  pendingQuestion?: DeliveredPendingQuestion;
  processedDeliveryIds: string[];
  processedResponseTurnIds: string[];
  stage: DialogueStage;
  subjects: SubjectDialogueMemory[];
};

/**
 * State V3 is intentionally separate from the live V2 persistence contract.
 * The legacy top-level `knowledge` remains the active projection during the
 * transition; `dialogueProgress.subjects` is the durable, subject-scoped model.
 */
export type ConversationStateV3 = Omit<ConversationV2State, "schemaVersion"> & {
  dialogueProgress: DialogueProgress;
  schemaVersion: typeof CONVERSATION_STATE_V3_SCHEMA_VERSION;
};

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export type PersistedConversationStateV3Load =
  | { kind: "missing" }
  | { kind: "current"; state: ConversationStateV3 }
  | { fromVersion: 2; kind: "migrated"; state: ConversationStateV3 }
  | { kind: "future"; raw: JsonObject; version: number }
  | { kind: "needs_ontology"; version: 2 | 3 }
  | { kind: "invalid"; reason: string };

/**
 * Tenant- and content-version-scoped keys accepted by State V3. The caller
 * owns construction of this registry from the same clinic facts snapshot used
 * for the turn. State code deliberately does not import a global clinic config.
 */
export type ConversationStateV3Registry = {
  answerKeys: ReadonlySet<string>;
  approvedFactIds: ReadonlySet<string>;
  areaKeys: ReadonlySet<string>;
  concernKeys: ReadonlySet<string>;
  treatmentKeys: ReadonlySet<string>;
};

export type DialogueSubjectTransition = "continue" | "interrupt" | "replace";

export type DeliveredResponseReceipt = {
  askedQuestion?: {
    expectedAnswerType: ResponseExpectedAnswerType;
    options?: DeliveredPendingOption[];
    purpose: ResponseAspect;
  };
  completedAspects: ResponseAspect[];
  contract: ResponseContract;
  deliveredAt: string;
  deliveryId: string;
  /** Preserve by default; only an explicit reducer decision may clear it. */
  pendingQuestionDisposition?: "preserve" | "clear";
  sourceTurnId: string;
  subjectKey?: string;
};

const CUSTOMER_GOALS = new Set<DialogueCustomerGoal>([
  "learn",
  "compare",
  "choose",
  "resolve_objection",
  "book",
  "manage_booking",
  "handoff",
  "unspecified",
]);
const DIALOGUE_STAGES = new Set<DialogueStage>([
  "unknown",
  "introduce",
  "discover",
  "explain",
  "compare",
  "resolve",
  "invite",
  "collect_booking",
  "handoff",
]);
const EXPECTED_ANSWER_TYPES = new Set<ResponseExpectedAnswerType>([
  "area",
  "concern",
  "treatment",
  "preference",
  "booking_field",
  "free_text",
]);
const AWAITING_OPTION_ENTITIES = new Set(["area", "concern", "treatment", "answer"]);
const ACTIVE_TASK_KINDS = new Set([
  "idle",
  "learn_treatment",
  "compare_treatments",
  "answer_concern",
  "pricing",
  "clinic_info",
  "booking",
  "safety",
]);
const BOOKING_FIELDS = new Set([
  "treatment",
  "branch",
  "time_slots",
  "first_visit",
  "name",
  "phone",
  "appointment_reference",
  "change_request",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLegacyResponseContext(value: unknown) {
  if (!isRecord(value)) return false;
  return [
    "affirmedAreaKeys",
    "affirmedConcernKeys",
    "affirmedTreatmentKeys",
    "declinedTreatmentKeys",
    "excludedAreaKeys",
    "excludedConcernKeys",
    "excludedTreatmentKeys",
  ].every((field) => isStringArray(value[field])) &&
    CONVERSATION_MOVES.includes(value.conversationMove as never) &&
    DIALOGUE_REFERENCES.includes(value.dialogueReference as never) &&
    QUESTION_ASPECTS.includes(value.questionAspect as never) &&
    ["single", "unspecified"].includes(String(value.treatmentApproach));
}

function isLegacyStateSemanticallyValid(state: ConversationV2State) {
  const draft = state.bookingTask.draft;
  const handoff = state.control.handoff;
  const awaiting = state.awaiting;
  if (
    !ACTIVE_TASK_KINDS.has(state.activeTask.kind) ||
    !isIsoTimestamp(state.activeTask.startedAt) ||
    (state.activeTask.subjectKey !== undefined && typeof state.activeTask.subjectKey !== "string") ||
    (state.bookingTask.expectedField !== undefined && !BOOKING_FIELDS.has(state.bookingTask.expectedField)) ||
    !isOptionalString(state.bookingTask.id) ||
    !isOptionalString(draft.appointmentReference) ||
    !isOptionalString(draft.branch) ||
    !isOptionalString(draft.changeRequest) ||
    (draft.firstVisit !== undefined && typeof draft.firstVisit !== "boolean") ||
    !isOptionalString(draft.name) ||
    !isOptionalString(draft.phone) ||
    !isOptionalString(state.lastProcessedTurnId) ||
    state.processedTurnIds.length > PROCESSED_TURN_ID_LIMIT ||
    (state.lastProcessedTurnId !== undefined && !state.processedTurnIds.includes(state.lastProcessedTurnId)) ||
    !isIsoTimestamp(state.updatedAt)
  ) return false;
  if (handoff && (
    typeof handoff.id !== "string" || !handoff.id.trim() ||
    typeof handoff.reason !== "string" || !handoff.reason.trim() ||
    !isIsoTimestamp(handoff.requestedAt) ||
    !["pending", "active"].includes(handoff.status)
  )) return false;
  if (awaiting && (
    typeof awaiting.allowMultiple !== "boolean" ||
    !BOOKING_FIELDS.has(awaiting.expectedField) && !["selection", "area", "concern"].includes(awaiting.expectedField) ||
    typeof awaiting.id !== "string" || !awaiting.id.trim() ||
    typeof awaiting.prompt !== "string" || !awaiting.prompt.trim() ||
    parseAwaitingOptions(awaiting.options) === null ||
    (awaiting.pendingKnowledge !== undefined && (
      !isStringArray(awaiting.pendingKnowledge.areaKeys) ||
      !isStringArray(awaiting.pendingKnowledge.concernKeys) ||
      !isStringArray(awaiting.pendingKnowledge.treatmentKeys)
    )) ||
    (awaiting.responseContext !== undefined && !isLegacyResponseContext(awaiting.responseContext))
  )) return false;
  return true;
}

function uniqueStrings(values: readonly string[], limit = Number.POSITIVE_INFINITY) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(-limit);
}

function cloneKnowledge(knowledge: KnowledgeContext): KnowledgeContext {
  return {
    approvedFactIds: [...knowledge.approvedFactIds],
    areaKeys: [...knowledge.areaKeys],
    consultedTreatmentKeys: [...knowledge.consultedTreatmentKeys],
    concernKeys: [...knowledge.concernKeys],
    treatmentKeys: [...knowledge.treatmentKeys],
  };
}

function filterKnowledgeForDialogueProgress(
  knowledge: KnowledgeContext,
  registry: ConversationStateV3Registry,
): KnowledgeContext {
  return {
    approvedFactIds: uniqueStrings(knowledge.approvedFactIds).filter((key) => registry.approvedFactIds.has(key)),
    areaKeys: uniqueStrings(knowledge.areaKeys).filter((key) => registry.areaKeys.has(key)),
    consultedTreatmentKeys: uniqueStrings(knowledge.consultedTreatmentKeys).filter((key) => registry.treatmentKeys.has(key)),
    concernKeys: uniqueStrings(knowledge.concernKeys).filter((key) => registry.concernKeys.has(key)),
    treatmentKeys: uniqueStrings(knowledge.treatmentKeys).filter((key) => registry.treatmentKeys.has(key)),
  };
}

function isCanonicalSubjectKey(
  subjectKey: string,
  registry: ConversationStateV3Registry,
) {
  const separator = subjectKey.indexOf(":");
  if (separator <= 0) return false;
  const kind = subjectKey.slice(0, separator);
  const keys = subjectKey.slice(separator + 1).split("+");
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) return false;
  if ([...keys].sort().join("+") !== keys.join("+")) return false;
  if (kind === "comparison") {
    return keys.length >= 2 && keys.every((key) => registry.treatmentKeys.has(key));
  }
  if (kind === "treatment") {
    return keys.every((key) => registry.treatmentKeys.has(key));
  }
  if (kind === "concern") {
    return keys.every((key) => registry.concernKeys.has(key) || registry.areaKeys.has(key));
  }
  return false;
}

function subjectKeyMatchesKnowledge(subjectKey: string, knowledge: KnowledgeContext) {
  const separator = subjectKey.indexOf(":");
  const kind = subjectKey.slice(0, separator);
  const value = subjectKey.slice(separator + 1);
  if (kind === "comparison") {
    return knowledge.treatmentKeys.length >= 2 &&
      value === [...knowledge.treatmentKeys].sort().join("+");
  }
  if (kind === "treatment") {
    return knowledge.treatmentKeys.length >= 1 &&
      value === [...knowledge.treatmentKeys].sort().join("+");
  }
  if (kind === "concern") {
    const keys = [...knowledge.concernKeys, ...knowledge.areaKeys].sort();
    return knowledge.treatmentKeys.length === 0 && keys.length >= 1 && value === keys.join("+");
  }
  return false;
}

function cloneDeliveredPendingOptions(options: readonly DeliveredPendingOption[]) {
  return options.map((option) => ({ ...option }));
}

function cloneDialogueProgress(progress: DialogueProgress): DialogueProgress {
  return {
    activeSubjectKey: progress.activeSubjectKey,
    customerGoal: progress.customerGoal,
    ...(progress.pendingQuestion
      ? {
          pendingQuestion: {
            ...progress.pendingQuestion,
            options: cloneDeliveredPendingOptions(progress.pendingQuestion.options),
          },
        }
      : {}),
    processedDeliveryIds: [...progress.processedDeliveryIds],
    processedResponseTurnIds: [...progress.processedResponseTurnIds],
    stage: progress.stage,
    subjects: progress.subjects.map((subject) => ({
      ...subject,
      answeredAspects: subject.answeredAspects.map((answer) => ({ ...answer })),
      knowledge: cloneKnowledge(subject.knowledge),
    })),
  };
}

function v2Projection(state: ConversationStateV3): ConversationV2State {
  const { dialogueProgress: _dialogueProgress, schemaVersion: _schemaVersion, ...rest } = state;
  return {
    ...rest,
    schemaVersion: CONVERSATION_V2_SCHEMA_VERSION,
  };
}

export function cloneConversationStateV3(state: ConversationStateV3): ConversationStateV3 {
  const legacy = cloneConversationV2State(v2Projection(state));
  return {
    ...legacy,
    dialogueProgress: cloneDialogueProgress(state.dialogueProgress),
    schemaVersion: CONVERSATION_STATE_V3_SCHEMA_VERSION,
  };
}

function derivedSubjectKey(state: ConversationV2State, knowledge: KnowledgeContext) {
  let canonicalFromKnowledge: string | undefined;
  if (state.activeTask.kind === "compare_treatments" && knowledge.treatmentKeys.length >= 2) {
    canonicalFromKnowledge = `comparison:${[...knowledge.treatmentKeys].sort().join("+")}`;
  }
  if (knowledge.treatmentKeys.length > 0) {
    canonicalFromKnowledge ??= `treatment:${[...knowledge.treatmentKeys].sort().join("+")}`;
  }
  const concernSubject = [...knowledge.concernKeys, ...knowledge.areaKeys]
    .map((key) => key.trim())
    .filter(Boolean)
    .sort();
  canonicalFromKnowledge ??= concernSubject.length > 0 ? `concern:${concernSubject.join("+")}` : undefined;
  const persistedSubjectKey = state.activeTask.subjectKey?.trim();
  return persistedSubjectKey && persistedSubjectKey === canonicalFromKnowledge
    ? persistedSubjectKey
    : canonicalFromKnowledge;
}

function initialDialogueProgress(
  state: ConversationV2State,
  registry: ConversationStateV3Registry,
): DialogueProgress {
  const knowledge = filterKnowledgeForDialogueProgress(state.knowledge, registry);
  const activeSubjectKey = derivedSubjectKey(state, knowledge);
  return {
    activeSubjectKey,
    customerGoal: "unspecified",
    processedDeliveryIds: [],
    processedResponseTurnIds: [],
    stage: "unknown",
    subjects: activeSubjectKey
      ? [{
          answeredAspects: [],
          knowledge,
          subjectKey: activeSubjectKey,
          updatedAt: state.updatedAt,
        }]
      : [],
  };
}

export function migrateConversationV2StateToV3(
  state: ConversationV2State,
  registry: ConversationStateV3Registry,
): ConversationStateV3 {
  const legacy = cloneConversationV2State(state);
  return {
    ...legacy,
    dialogueProgress: initialDialogueProgress(legacy, registry),
    schemaVersion: CONVERSATION_STATE_V3_SCHEMA_VERSION,
  };
}

function parseAwaitingOptions(value: unknown): AwaitingOption[] | null {
  if (!Array.isArray(value)) return null;
  const options: AwaitingOption[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !AWAITING_OPTION_ENTITIES.has(String(item.entity)) ||
      typeof item.id !== "string" || !item.id.trim() ||
      typeof item.label !== "string" || !item.label.trim() ||
      typeof item.value !== "string" || !item.value.trim()
    ) return null;
    options.push({
      entity: item.entity as AwaitingOption["entity"],
      id: item.id.trim(),
      label: item.label.trim(),
      value: item.value.trim(),
    });
  }
  return options.slice(0, 12);
}

function isRegisteredPendingOption(
  option: DeliveredPendingOption,
  registry: ConversationStateV3Registry,
) {
  if (option.entity === "area") return registry.areaKeys.has(option.value);
  if (option.entity === "concern") return registry.concernKeys.has(option.value);
  if (option.entity === "treatment") return registry.treatmentKeys.has(option.value);
  return option.entity === "answer" && registry.answerKeys.has(option.value);
}

function parseDeliveredPendingOptions(
  value: unknown,
  registry: ConversationStateV3Registry,
): DeliveredPendingOption[] | null {
  if (!Array.isArray(value)) return null;
  const options: DeliveredPendingOption[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      !AWAITING_OPTION_ENTITIES.has(String(item.entity)) ||
      typeof item.value !== "string" ||
      !item.value.trim()
    ) return null;
    const option: DeliveredPendingOption = {
      entity: item.entity as DeliveredPendingOption["entity"],
      value: item.value.trim(),
    };
    if (!isRegisteredPendingOption(option, registry)) return null;
    options.push(option);
  }
  return options.slice(0, 12);
}

function parseKnowledge(
  value: unknown,
  registry: ConversationStateV3Registry,
): KnowledgeContext | null {
  if (!isRecord(value)) return null;
  const fields = ["approvedFactIds", "areaKeys", "concernKeys", "treatmentKeys"] as const;
  if (fields.some((field) => !Array.isArray(value[field]) || !value[field].every((item) => typeof item === "string"))) {
    return null;
  }
  const raw: KnowledgeContext = {
    approvedFactIds: uniqueStrings(value.approvedFactIds as string[]),
    areaKeys: uniqueStrings(value.areaKeys as string[]),
    consultedTreatmentKeys: Array.isArray(value.consultedTreatmentKeys) && value.consultedTreatmentKeys.every((item) => typeof item === "string")
      ? uniqueStrings(value.consultedTreatmentKeys as string[])
      : [],
    concernKeys: uniqueStrings(value.concernKeys as string[]),
    treatmentKeys: uniqueStrings(value.treatmentKeys as string[]),
  };
  const accepted = filterKnowledgeForDialogueProgress(raw, registry);
  return fields.every((field) => accepted[field].length === raw[field].length) &&
    accepted.consultedTreatmentKeys.length === raw.consultedTreatmentKeys.length
    ? accepted
    : null;
}

function parseAnsweredAspects(value: unknown): DeliveredAnsweredAspect[] | null {
  if (!Array.isArray(value)) return null;
  const answers: DeliveredAnsweredAspect[] = [];
  const seenAspects = new Set<ResponseAspect>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      !isResponseAspect(item.aspect) ||
      !isIsoTimestamp(item.answeredAt) ||
      typeof item.deliveryId !== "string" || !item.deliveryId.trim() ||
      typeof item.sourceTurnId !== "string" || !item.sourceTurnId.trim()
    ) return null;
    if (seenAspects.has(item.aspect)) return null;
    seenAspects.add(item.aspect);
    answers.push({
      answeredAt: item.answeredAt,
      aspect: item.aspect,
      deliveryId: item.deliveryId.trim(),
      sourceTurnId: item.sourceTurnId.trim(),
    });
  }
  return answers.slice(-CONVERSATION_STATE_V3_ANSWERED_ASPECT_LIMIT);
}

function parsePendingQuestion(
  value: unknown,
  registry: ConversationStateV3Registry,
): DeliveredPendingQuestion | null {
  if (!isRecord(value)) return null;
  const options = parseDeliveredPendingOptions(value.options, registry);
  if (
    !isIsoTimestamp(value.askedAt) ||
    typeof value.deliveryId !== "string" || !value.deliveryId.trim() ||
    !EXPECTED_ANSWER_TYPES.has(value.expectedAnswerType as ResponseExpectedAnswerType) ||
    options === null ||
    !isResponseAspect(value.purpose) ||
    typeof value.questionKey !== "string" || !value.questionKey.trim() ||
    value.questionKey !== `${String(value.purpose)}:${String(value.expectedAnswerType)}` ||
    typeof value.sourceTurnId !== "string" || !value.sourceTurnId.trim() ||
    (value.subjectKey !== undefined && typeof value.subjectKey !== "string")
  ) return null;
  return {
    askedAt: value.askedAt,
    deliveryId: value.deliveryId.trim(),
    expectedAnswerType: value.expectedAnswerType as ResponseExpectedAnswerType,
    options,
    purpose: value.purpose,
    questionKey: value.questionKey.trim(),
    sourceTurnId: value.sourceTurnId.trim(),
    subjectKey: typeof value.subjectKey === "string" && value.subjectKey.trim()
      ? value.subjectKey.trim()
      : undefined,
  };
}

function parseDialogueProgress(
  value: unknown,
  registry: ConversationStateV3Registry,
): DialogueProgress | null {
  if (!isRecord(value)) return null;
  if (
    (value.activeSubjectKey !== undefined && typeof value.activeSubjectKey !== "string") ||
    !CUSTOMER_GOALS.has(value.customerGoal as DialogueCustomerGoal) ||
    !DIALOGUE_STAGES.has(value.stage as DialogueStage) ||
    !Array.isArray(value.processedDeliveryIds) ||
    !value.processedDeliveryIds.every((item) => typeof item === "string") ||
    !Array.isArray(value.processedResponseTurnIds) ||
    !value.processedResponseTurnIds.every((item) => typeof item === "string") ||
    !Array.isArray(value.subjects) ||
    value.subjects.length > CONVERSATION_STATE_V3_SUBJECT_LIMIT
  ) return null;

  const subjects: SubjectDialogueMemory[] = [];
  const seenSubjectKeys = new Set<string>();
  for (const item of value.subjects) {
    if (
      !isRecord(item) ||
      typeof item.subjectKey !== "string" || !item.subjectKey.trim() ||
      !isIsoTimestamp(item.updatedAt)
    ) return null;
    const subjectKey = item.subjectKey.trim();
    if (seenSubjectKeys.has(subjectKey) || !isCanonicalSubjectKey(subjectKey, registry)) return null;
    seenSubjectKeys.add(subjectKey);
    const knowledge = parseKnowledge(item.knowledge, registry);
    const answeredAspects = parseAnsweredAspects(item.answeredAspects);
    if (!knowledge || !answeredAspects || !subjectKeyMatchesKnowledge(subjectKey, knowledge)) return null;
    subjects.push({
      answeredAspects,
      knowledge,
      subjectKey,
      updatedAt: item.updatedAt,
    });
  }
  let pendingQuestion: DeliveredPendingQuestion | undefined;
  if (value.pendingQuestion !== undefined) {
    const parsedPendingQuestion = parsePendingQuestion(value.pendingQuestion, registry);
    if (!parsedPendingQuestion) return null;
    pendingQuestion = parsedPendingQuestion;
  }
  const activeSubjectKey = typeof value.activeSubjectKey === "string" && value.activeSubjectKey.trim()
    ? value.activeSubjectKey.trim()
    : undefined;
  const processedDeliveryIds = uniqueStrings(
    value.processedDeliveryIds as string[],
    CONVERSATION_STATE_V3_DELIVERY_ID_LIMIT,
  );
  const processedResponseTurnIds = uniqueStrings(
    value.processedResponseTurnIds as string[],
    CONVERSATION_STATE_V3_DELIVERY_ID_LIMIT,
  );
  if (
    (activeSubjectKey && !seenSubjectKeys.has(activeSubjectKey)) ||
    (pendingQuestion?.subjectKey && !seenSubjectKeys.has(pendingQuestion.subjectKey)) ||
    (pendingQuestion && !processedDeliveryIds.includes(pendingQuestion.deliveryId))
  ) return null;
  return {
    activeSubjectKey,
    customerGoal: value.customerGoal as DialogueCustomerGoal,
    ...(pendingQuestion ? { pendingQuestion } : {}),
    processedDeliveryIds,
    processedResponseTurnIds,
    stage: value.stage as DialogueStage,
    subjects: subjects.slice(-CONVERSATION_STATE_V3_SUBJECT_LIMIT),
  };
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (const item of value) {
      const parsed = jsonValue(item);
      if (parsed === undefined) return undefined;
      items.push(parsed);
    }
    return items;
  }
  if (isRecord(value)) {
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      const parsed = jsonValue(item);
      if (parsed === undefined) return undefined;
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: parsed,
        writable: true,
      });
    }
    return result;
  }
  return undefined;
}

/**
 * Version-aware loader for the future V3 cutover. The generic context layer now
 * preserves its raw envelope, but live policy still reads/writes schema V2.
 */
export function loadPersistedConversationStateV3(
  value: unknown,
  registry?: ConversationStateV3Registry,
): PersistedConversationStateV3Load {
  if (value === undefined || value === null) return { kind: "missing" };
  if (
    !isRecord(value) ||
    !Object.prototype.hasOwnProperty.call(value, "schemaVersion") ||
    !Number.isSafeInteger(value.schemaVersion)
  ) {
    return { kind: "invalid", reason: "invalid_envelope" };
  }
  const version = Number(value.schemaVersion);
  if (version > CONVERSATION_STATE_V3_SCHEMA_VERSION) {
    const raw = jsonValue(value);
    return raw && !Array.isArray(raw) && typeof raw === "object"
      ? { kind: "future", raw: raw as JsonObject, version }
      : { kind: "invalid", reason: "future_state_not_json" };
  }
  if (version === CONVERSATION_V2_SCHEMA_VERSION) {
    if (!registry) return { kind: "needs_ontology", version: 2 };
    const state = parsePersistedConversationV2State(value);
    return state && isLegacyStateSemanticallyValid(state)
      ? { fromVersion: 2, kind: "migrated", state: migrateConversationV2StateToV3(state, registry) }
      : { kind: "invalid", reason: "invalid_v2_state" };
  }
  if (version !== CONVERSATION_STATE_V3_SCHEMA_VERSION) {
    return { kind: "invalid", reason: `unsupported_schema_${version}` };
  }
  if (!registry) return { kind: "needs_ontology", version: 3 };

  const { dialogueProgress, ...legacyEnvelope } = value;
  const legacy = parsePersistedConversationV2State({
    ...legacyEnvelope,
    schemaVersion: CONVERSATION_V2_SCHEMA_VERSION,
  });
  const progress = parseDialogueProgress(dialogueProgress, registry);
  return legacy && isLegacyStateSemanticallyValid(legacy) && progress
    ? {
        kind: "current",
        state: cloneConversationStateV3({
          ...legacy,
          dialogueProgress: progress,
          schemaVersion: CONVERSATION_STATE_V3_SCHEMA_VERSION,
        }),
      }
    : { kind: "invalid", reason: legacy ? "invalid_v3_progress" : "invalid_v3_base" };
}

function mergeKnowledge(left: KnowledgeContext, right: KnowledgeContext): KnowledgeContext {
  return {
    approvedFactIds: uniqueStrings([...left.approvedFactIds, ...right.approvedFactIds]),
    areaKeys: uniqueStrings([...left.areaKeys, ...right.areaKeys]),
    consultedTreatmentKeys: uniqueStrings([
      ...left.consultedTreatmentKeys,
      ...right.consultedTreatmentKeys,
    ]),
    concernKeys: uniqueStrings([...left.concernKeys, ...right.concernKeys]),
    treatmentKeys: uniqueStrings([...left.treatmentKeys, ...right.treatmentKeys]),
  };
}

function laterTimestamp(current: string, candidate: string) {
  return Date.parse(candidate) >= Date.parse(current) ? candidate : current;
}

function boundedSubjects(
  subjects: SubjectDialogueMemory[],
  activeSubjectKey: string | undefined,
  pendingSubjectKey: string | undefined,
) {
  const requiredKeys = new Set([activeSubjectKey, pendingSubjectKey].filter(Boolean));
  const required = subjects.filter((subject) => requiredKeys.has(subject.subjectKey));
  const optional = subjects.filter((subject) => !requiredKeys.has(subject.subjectKey));
  return [
    ...optional.slice(-(CONVERSATION_STATE_V3_SUBJECT_LIMIT - required.length)),
    ...required,
  ].slice(-CONVERSATION_STATE_V3_SUBJECT_LIMIT);
}

/**
 * Updates subject ownership without consuming a pending question during a
 * temporary price/clinic interruption. Only an explicit replacement may clear
 * a question owned by the prior subject.
 */
export function transitionConversationStateV3Subject(
  state: ConversationStateV3,
  input: {
    at: string;
    knowledge: KnowledgeContext;
    subjectKey: string;
    transition: DialogueSubjectTransition;
  },
  registry: ConversationStateV3Registry,
): ConversationStateV3 {
  const next = cloneConversationStateV3(state);
  const subjectKey = input.subjectKey.trim();
  const knowledge = filterKnowledgeForDialogueProgress(input.knowledge, registry);
  if (
    !subjectKey ||
    !isIsoTimestamp(input.at) ||
    !isCanonicalSubjectKey(subjectKey, registry)
  ) return next;
  const prior = next.dialogueProgress.subjects.find((subject) => subject.subjectKey === subjectKey);
  const mergedKnowledge = prior
    ? mergeKnowledge(prior.knowledge, knowledge)
    : knowledge;
  if (!subjectKeyMatchesKnowledge(subjectKey, mergedKnowledge)) return next;
  const subject: SubjectDialogueMemory = prior
    ? {
        ...prior,
        answeredAspects: prior.answeredAspects.map((answer) => ({ ...answer })),
        knowledge: mergedKnowledge,
        updatedAt: input.at,
      }
    : {
        answeredAspects: [],
        knowledge: mergedKnowledge,
        subjectKey,
        updatedAt: input.at,
      };
  next.dialogueProgress.activeSubjectKey = subjectKey;
  if (
    input.transition === "replace" &&
    next.dialogueProgress.pendingQuestion &&
    next.dialogueProgress.pendingQuestion.subjectKey !== subjectKey
  ) {
    next.dialogueProgress.pendingQuestion = undefined;
  }
  next.dialogueProgress.subjects = boundedSubjects(
    [
      ...next.dialogueProgress.subjects.filter((item) => item.subjectKey !== subjectKey),
      subject,
    ],
    subjectKey,
    next.dialogueProgress.pendingQuestion?.subjectKey,
  );
  next.revision += 1;
  next.updatedAt = laterTimestamp(next.updatedAt, input.at);
  return next;
}

export function transitionConversationStateV3Progress(
  state: ConversationStateV3,
  input: { at: string; customerGoal: DialogueCustomerGoal; stage: DialogueStage },
): ConversationStateV3 {
  const next = cloneConversationStateV3(state);
  if (
    !isIsoTimestamp(input.at) ||
    !CUSTOMER_GOALS.has(input.customerGoal) ||
    !DIALOGUE_STAGES.has(input.stage)
  ) return next;
  next.dialogueProgress.customerGoal = input.customerGoal;
  next.dialogueProgress.stage = input.stage;
  next.revision += 1;
  next.updatedAt = laterTimestamp(next.updatedAt, input.at);
  return next;
}

/**
 * Delivery-side commit hook for a later outbox integration. It records only
 * renderer-reported completion, never assumes that policy obligations were met.
 */
export function commitDeliveredResponseToConversationStateV3(
  state: ConversationStateV3,
  receipt: DeliveredResponseReceipt,
  registry: ConversationStateV3Registry,
): ConversationStateV3 {
  const next = cloneConversationStateV3(state);
  const deliveryId = receipt.deliveryId.trim();
  const sourceTurnId = receipt.sourceTurnId.trim();
  const askedQuestionOptions = receipt.askedQuestion
    ? parseDeliveredPendingOptions(receipt.askedQuestion.options ?? [], registry)
    : [];
  if (
    !deliveryId ||
    !sourceTurnId ||
    !isIsoTimestamp(receipt.deliveredAt) ||
    !isResponseContract(receipt.contract) ||
    ![undefined, "preserve", "clear"].includes(receipt.pendingQuestionDisposition) ||
    (receipt.askedQuestion !== undefined && (
      !isResponseAspect(receipt.askedQuestion.purpose) ||
      !EXPECTED_ANSWER_TYPES.has(receipt.askedQuestion.expectedAnswerType) ||
      askedQuestionOptions === null ||
      receipt.contract.nextStep.kind !== "ask" ||
      receipt.contract.nextStep.aspect !== receipt.askedQuestion.purpose ||
      receipt.contract.nextStep.expectedAnswerType !== receipt.askedQuestion.expectedAnswerType ||
      receipt.pendingQuestionDisposition === "clear"
    )) ||
    next.dialogueProgress.processedDeliveryIds.includes(deliveryId) ||
    next.dialogueProgress.processedResponseTurnIds.includes(sourceTurnId)
  ) return next;

  next.dialogueProgress.processedDeliveryIds = uniqueStrings(
    [...next.dialogueProgress.processedDeliveryIds, deliveryId],
    CONVERSATION_STATE_V3_DELIVERY_ID_LIMIT,
  );
  next.dialogueProgress.processedResponseTurnIds = uniqueStrings(
    [...next.dialogueProgress.processedResponseTurnIds, sourceTurnId],
    CONVERSATION_STATE_V3_DELIVERY_ID_LIMIT,
  );
  const subjectKey = receipt.subjectKey?.trim() || next.dialogueProgress.activeSubjectKey;
  if (subjectKey && !next.dialogueProgress.subjects.some((subject) => subject.subjectKey === subjectKey)) {
    return cloneConversationStateV3(state);
  }
  if (subjectKey) {
    const prior = next.dialogueProgress.subjects.find((subject) => subject.subjectKey === subjectKey)!;
    const completedAspects = Array.from(new Set(receipt.completedAspects.filter(isResponseAspect)));
    const answeredAspects = prior.answeredAspects.filter(
      (answer) => !completedAspects.includes(answer.aspect),
    );
    answeredAspects.push(...completedAspects.map((aspect) => ({
      answeredAt: receipt.deliveredAt,
      aspect,
      deliveryId,
      sourceTurnId,
    })));
    next.dialogueProgress.subjects = boundedSubjects(
      [
        ...next.dialogueProgress.subjects.filter((subject) => subject.subjectKey !== subjectKey),
        {
          ...prior,
          answeredAspects: answeredAspects.slice(-CONVERSATION_STATE_V3_ANSWERED_ASPECT_LIMIT),
          knowledge: cloneKnowledge(prior.knowledge),
          updatedAt: receipt.deliveredAt,
        },
      ],
      subjectKey,
      next.dialogueProgress.pendingQuestion?.subjectKey,
    );
  }

  if (receipt.askedQuestion) {
    next.dialogueProgress.pendingQuestion = {
      askedAt: receipt.deliveredAt,
      deliveryId,
      expectedAnswerType: receipt.askedQuestion.expectedAnswerType,
      options: cloneDeliveredPendingOptions(askedQuestionOptions ?? []),
      purpose: receipt.askedQuestion.purpose,
      questionKey: `${receipt.askedQuestion.purpose}:${receipt.askedQuestion.expectedAnswerType}`,
      sourceTurnId,
      subjectKey,
    };
  } else if (receipt.pendingQuestionDisposition === "clear") {
    next.dialogueProgress.pendingQuestion = undefined;
  }
  next.dialogueProgress.subjects = boundedSubjects(
    next.dialogueProgress.subjects,
    next.dialogueProgress.activeSubjectKey,
    next.dialogueProgress.pendingQuestion?.subjectKey,
  );
  next.revision += 1;
  next.updatedAt = laterTimestamp(next.updatedAt, receipt.deliveredAt);
  return next;
}
