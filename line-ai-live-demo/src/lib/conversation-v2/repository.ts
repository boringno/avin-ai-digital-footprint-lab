import { routeConversationTurnV2 } from "./engine";
import { cloneConversationV2State, createConversationV2State } from "./state";
import type {
  BookingDraft,
  ConversationV2State,
  DialoguePolicyResult,
  EntityMention,
  TurnUnderstanding,
} from "./types";

export const CONVERSATION_V2_REPLAY_RECORD_SCHEMA_VERSION = 1 as const;
export const DEFAULT_TEST_ACCOUNT_EPISODE_STRATEGY = "new_episode" as const;

type JsonRecord = Record<string, unknown>;

/**
 * One immutable input fact for offline/shadow replay. The record stores the
 * structured understanding, never a mutable "latest state" snapshot.
 */
export type ConversationV2ShadowRecord = {
  episodeId: string;
  /** LINE's event timestamp in milliseconds; server completion time is not authoritative. */
  lineTimestamp: number;
  messageId?: string;
  schemaVersion: typeof CONVERSATION_V2_REPLAY_RECORD_SCHEMA_VERSION;
  tenantId: string;
  turn: TurnUnderstanding;
  userId: string;
  webhookEventId?: string;
};

export type ConversationV2InvalidRecord = {
  index: number;
  reason:
    | "invalid_schema_version"
    | "invalid_scope"
    | "invalid_episode"
    | "invalid_line_timestamp"
    | "missing_event_identity"
    | "invalid_turn";
};

export type ConversationV2ReplayConflict = {
  identity: string;
  recordCount: number;
  /** Different structured turns were stored for the same LINE message/event. */
  variantCount: number;
};

export type ConversationV2ReplayStep = {
  identity: string;
  lineTimestamp: number;
  result: DialoguePolicyResult;
  state: ConversationV2State;
};

export type ConversationV2ReplaySource =
  | "replayed"
  | "new_episode"
  | "missing_rebuilt"
  | "invalid_rebuilt";

export type ConversationV2ReplayResult = {
  appliedRecordCount: number;
  conflicts: ConversationV2ReplayConflict[];
  duplicateRecordCount: number;
  episodeId: string;
  ignoredEpisodeRecordCount: number;
  ignoredScopeRecordCount: number;
  invalidRecords: ConversationV2InvalidRecord[];
  source: ConversationV2ReplaySource;
  state: ConversationV2State;
  status: "complete" | "conflict";
  steps: ConversationV2ReplayStep[];
};

export type ConversationV2ReplayInput = {
  /** Explicit episode selection wins over every automatic strategy. */
  episodeId?: string;
  isTestAccount?: boolean;
  records: readonly unknown[];
  tenantId: string;
  /** Test accounts start clean unless resume_latest is explicitly requested. */
  testAccountEpisodeStrategy?: "new_episode" | "resume_latest";
  userId: string;
};

export type ConversationV2ReplayRepositoryOptions = {
  createEpisodeId?: (input: { now: string; tenantId: string; userId: string }) => string;
  now?: () => string;
};

type IndexedRecord = {
  canonicalTurn: TurnUnderstanding;
  fingerprint: string;
  identity: string;
  index: number;
  record: ConversationV2ShadowRecord;
};

const SPEECH_ACTS = new Set([
  "learn_treatment",
  "ask_treatment_detail",
  "compare_treatments",
  "ask_concern",
  "ask_clinic_info",
  "ask_price",
  "book_consultation",
  "manage_booking",
  "provide_booking_field",
  "request_handoff",
  "select_options",
  "urgent_safety",
  "unknown",
]);
const BOOKING_INTENTS = new Set(["none", "create", "modify", "cancel"]);
const OPTION_ENTITIES = new Set(["area", "concern", "treatment", "answer"]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isEntityMention(value: unknown): value is EntityMention {
  return isRecord(value)
    && isConfidence(value.confidence)
    && isNonEmptyString(value.key)
    && isOptionalString(value.label)
    && (value.polarity === "affirmed" || value.polarity === "negated")
    && (value.resolution === "resolved" || value.resolution === "underspecified");
}

function isEntityMentionArray(value: unknown): value is EntityMention[] {
  return Array.isArray(value) && value.every(isEntityMention);
}

function isPartialBookingDraft(value: unknown) {
  if (!isRecord(value)) return false;
  const draft = value as Partial<BookingDraft>;
  return isOptionalString(draft.appointmentReference)
    && isOptionalString(draft.branch)
    && isOptionalString(draft.changeRequest)
    && (draft.firstVisit === undefined || typeof draft.firstVisit === "boolean")
    && isOptionalString(draft.name)
    && isOptionalString(draft.phone)
    && (draft.timeSlots === undefined || isStringArray(draft.timeSlots))
    && (draft.treatmentKeys === undefined || isStringArray(draft.treatmentKeys));
}

function isBookingUnderstanding(value: unknown) {
  return isRecord(value)
    && typeof value.explicit === "boolean"
    && BOOKING_INTENTS.has(String(value.intent))
    && (value.fields === undefined || isPartialBookingDraft(value.fields));
}

function isAwaitingOption(value: unknown) {
  return isRecord(value)
    && OPTION_ENTITIES.has(String(value.entity))
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.label)
    && isNonEmptyString(value.value);
}

function isClarification(value: unknown) {
  return isRecord(value)
    && typeof value.allowMultiple === "boolean"
    && Array.isArray(value.options)
    && value.options.every(isAwaitingOption)
    && isNonEmptyString(value.prompt)
    && (value.slot === "area" || value.slot === "concern" || value.slot === "treatment");
}

function isSelection(value: unknown) {
  if (!isRecord(value)) return false;
  if (value.mode === "all") return true;
  if (value.mode === "indexes") {
    return Array.isArray(value.indexes)
      && value.indexes.length > 0
      && value.indexes.every((entry) => Number.isSafeInteger(entry) && Number(entry) > 0);
  }
  return value.mode === "keys" && isStringArray(value.keys) && value.keys.length > 0;
}

export function parseConversationV2Turn(value: unknown): TurnUnderstanding | null {
  if (!isRecord(value)
    || !isEntityMentionArray(value.areas)
    || !isEntityMentionArray(value.concerns)
    || !isEntityMentionArray(value.treatments)
    || !isConfidence(value.confidence)
    || !isNonEmptyString(value.receivedAt)
    || !isNonEmptyString(value.turnId)
    || typeof value.text !== "string"
    || !SPEECH_ACTS.has(String(value.speechAct))
    || (value.booking !== undefined && !isBookingUnderstanding(value.booking))
    || (value.clarification !== undefined && !isClarification(value.clarification))
    || (value.selection !== undefined && !isSelection(value.selection))) {
    return null;
  }
  return structuredClone(value) as TurnUnderstanding;
}

function inspectRecord(value: unknown):
  | { kind: "invalid"; reason: ConversationV2InvalidRecord["reason"] }
  | { kind: "valid"; record: ConversationV2ShadowRecord } {
  if (!isRecord(value) || value.schemaVersion !== CONVERSATION_V2_REPLAY_RECORD_SCHEMA_VERSION) {
    return { kind: "invalid", reason: "invalid_schema_version" };
  }
  if (!isNonEmptyString(value.tenantId) || !isNonEmptyString(value.userId)) {
    return { kind: "invalid", reason: "invalid_scope" };
  }
  if (!isNonEmptyString(value.episodeId)) {
    return { kind: "invalid", reason: "invalid_episode" };
  }
  if (!Number.isSafeInteger(value.lineTimestamp) || Number(value.lineTimestamp) < 0) {
    return { kind: "invalid", reason: "invalid_line_timestamp" };
  }
  if (!isOptionalString(value.messageId)
    || !isOptionalString(value.webhookEventId)
    || (!isNonEmptyString(value.messageId) && !isNonEmptyString(value.webhookEventId))) {
    return { kind: "invalid", reason: "missing_event_identity" };
  }
  const turn = parseConversationV2Turn(value.turn);
  if (!turn) return { kind: "invalid", reason: "invalid_turn" };
  return {
    kind: "valid",
    record: {
      episodeId: value.episodeId,
      lineTimestamp: Number(value.lineTimestamp),
      messageId: isNonEmptyString(value.messageId) ? value.messageId : undefined,
      schemaVersion: CONVERSATION_V2_REPLAY_RECORD_SCHEMA_VERSION,
      tenantId: value.tenantId,
      turn,
      userId: value.userId,
      webhookEventId: isNonEmptyString(value.webhookEventId) ? value.webhookEventId : undefined,
    },
  };
}

function identityOf(record: ConversationV2ShadowRecord) {
  return record.messageId
    ? `message:${record.messageId}`
    : `event:${record.webhookEventId}`;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function compareIndexedRecords(left: IndexedRecord, right: IndexedRecord) {
  if (left.record.lineTimestamp !== right.record.lineTimestamp) {
    return left.record.lineTimestamp - right.record.lineTimestamp;
  }
  const messageOrder = (left.record.messageId ?? "").localeCompare(right.record.messageId ?? "");
  if (messageOrder !== 0) return messageOrder;
  const eventOrder = (left.record.webhookEventId ?? "").localeCompare(right.record.webhookEventId ?? "");
  if (eventOrder !== 0) return eventOrder;
  const episodeOrder = left.record.episodeId.localeCompare(right.record.episodeId);
  if (episodeOrder !== 0) return episodeOrder;
  return left.fingerprint.localeCompare(right.fingerprint);
}

function canonicalize(record: ConversationV2ShadowRecord, index: number): IndexedRecord {
  const identity = identityOf(record);
  const canonicalTurn = {
    ...structuredClone(record.turn),
    // Replay uses LINE ordering facts, not nondeterministic after() completion time.
    receivedAt: new Date(record.lineTimestamp).toISOString(),
    turnId: identity,
  };
  return {
    canonicalTurn,
    fingerprint: stableSerialize(canonicalTurn),
    identity,
    index,
    record,
  };
}

function defaultEpisodeId() {
  return `v2:${globalThis.crypto.randomUUID()}`;
}

export class ConversationV2ReplayRepository {
  readonly #createEpisodeId: NonNullable<ConversationV2ReplayRepositoryOptions["createEpisodeId"]>;
  readonly #now: NonNullable<ConversationV2ReplayRepositoryOptions["now"]>;

  constructor(options: ConversationV2ReplayRepositoryOptions = {}) {
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#createEpisodeId = options.createEpisodeId ?? (() => defaultEpisodeId());
  }

  /**
   * Pure replay: no database reads or writes and no mutable latest-state save.
   * The same record set always produces the same state, regardless of the
   * order in which after() callbacks finished or records were supplied.
   */
  replay(input: ConversationV2ReplayInput): ConversationV2ReplayResult {
    if (!input.userId || !input.tenantId) {
      throw new Error("Conversation V2 replay requires userId and tenantId");
    }
    const now = this.#now();
    const invalidRecords: ConversationV2InvalidRecord[] = [];
    const valid: IndexedRecord[] = [];
    let ignoredScopeRecordCount = 0;

    input.records.forEach((value, index) => {
      const inspected = inspectRecord(value);
      if (inspected.kind === "invalid") {
        invalidRecords.push({ index, reason: inspected.reason });
        return;
      }
      if (inspected.record.userId !== input.userId || inspected.record.tenantId !== input.tenantId) {
        ignoredScopeRecordCount += 1;
        return;
      }
      valid.push(canonicalize(inspected.record, index));
    });
    valid.sort(compareIndexedRecords);

    const testStartsFresh = input.isTestAccount === true
      && !input.episodeId
      && (input.testAccountEpisodeStrategy ?? DEFAULT_TEST_ACCOUNT_EPISODE_STRATEGY) === "new_episode";
    const episodeId = input.episodeId
      ?? (testStartsFresh
        ? this.#createEpisodeId({ now, tenantId: input.tenantId, userId: input.userId })
        : valid.at(-1)?.record.episodeId
          ?? this.#createEpisodeId({ now, tenantId: input.tenantId, userId: input.userId }));
    const selected = testStartsFresh ? [] : valid.filter((entry) => entry.record.episodeId === episodeId);
    const ignoredEpisodeRecordCount = valid.length - selected.length;

    const grouped = new Map<string, IndexedRecord[]>();
    for (const entry of selected) {
      grouped.set(entry.identity, [...(grouped.get(entry.identity) ?? []), entry]);
    }

    const conflicts: ConversationV2ReplayConflict[] = [];
    const replayable: IndexedRecord[] = [];
    let duplicateRecordCount = 0;
    for (const [identity, group] of grouped) {
      const variants = new Set(group.map((entry) => entry.fingerprint));
      if (variants.size > 1) {
        conflicts.push({ identity, recordCount: group.length, variantCount: variants.size });
        continue;
      }
      duplicateRecordCount += group.length - 1;
      replayable.push(group[0]!);
    }
    replayable.sort(compareIndexedRecords);
    conflicts.sort((left, right) => left.identity.localeCompare(right.identity));

    const initialAt = replayable[0]
      ? new Date(replayable[0].record.lineTimestamp).toISOString()
      : now;
    let state = createConversationV2State({ episodeId, now: initialAt });
    const steps: ConversationV2ReplayStep[] = [];
    for (const entry of replayable) {
      const routed = routeConversationTurnV2(state, entry.canonicalTurn);
      if (routed.duplicate || !routed.result) continue;
      state = routed.nextState;
      steps.push({
        identity: entry.identity,
        lineTimestamp: entry.record.lineTimestamp,
        result: routed.result,
        state: cloneConversationV2State(state),
      });
    }

    const source: ConversationV2ReplaySource = testStartsFresh
      ? "new_episode"
      : replayable.length > 0
        ? "replayed"
        : valid.length === 0 && invalidRecords.length > 0
          ? "invalid_rebuilt"
          : "missing_rebuilt";
    return {
      appliedRecordCount: replayable.length,
      conflicts,
      duplicateRecordCount,
      episodeId,
      ignoredEpisodeRecordCount,
      ignoredScopeRecordCount,
      invalidRecords,
      source,
      state,
      status: conflicts.length > 0 ? "conflict" : "complete",
      steps,
    };
  }
}
