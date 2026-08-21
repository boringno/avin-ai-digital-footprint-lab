import {
  CONVERSATION_STATE_V3_SCHEMA_VERSION,
  loadPersistedConversationStateV3,
  type ConversationStateV3,
  type ConversationStateV3Registry,
  type JsonObject,
  type JsonValue,
  type PersistedConversationStateV3Load,
} from "./state-v3";
import {
  CONVERSATION_V2_SCHEMA_VERSION,
  type ConversationV2State,
} from "./types";

export const CONVERSATION_STATE_ENVELOPE_SCHEMA_VERSION = 1 as const;

/**
 * Durable scope metadata for a dialogue state blob.
 *
 * `registryId` is deliberately independent from a turn-scoped clinic facts
 * snapshot. Price, campaign, and availability refreshes may change a facts
 * snapshot without changing the canonical entity registry used by State V3.
 */
export type ConversationStatePersistenceEnvelope = {
  envelopeSchemaVersion: typeof CONVERSATION_STATE_ENVELOPE_SCHEMA_VERSION;
  registryId: string;
  state: JsonObject;
  stateRevision: number;
  stateUpdatedAt: string;
  tenantId: string;
};

/** Raw JSON retained by the generic context layer before tenant/registry validation. */
export type PreservedConversationStateEnvelope = JsonValue;

export type ParsedConversationStateEnvelope =
  | { kind: "missing" }
  | { kind: "invalid"; raw?: JsonValue; reason: string }
  | { kind: "future_envelope"; raw: JsonObject; version: number }
  | { envelope: ConversationStatePersistenceEnvelope; kind: "valid" };

export type ScopedConversationStateEnvelopeLoad =
  | { kind: "missing" }
  | { envelope?: JsonValue; kind: "invalid"; reason: string }
  | { envelope: JsonObject; kind: "future_envelope"; version: number }
  | { envelope: ConversationStatePersistenceEnvelope; expectedTenantId: string; kind: "tenant_mismatch" }
  | { envelope: ConversationStatePersistenceEnvelope; expectedRegistryId: string; kind: "registry_mismatch" }
  | {
      envelope: ConversationStatePersistenceEnvelope;
      kind: "state";
      stateLoad: PersistedConversationStateV3Load;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function cloneJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    const clone: JsonValue[] = [];
    for (const item of value) {
      const parsed = cloneJsonValue(item);
      if (parsed === undefined) return undefined;
      clone.push(parsed);
    }
    return clone;
  }
  if (isRecord(value)) {
    const clone: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      const parsed = cloneJsonValue(item);
      if (parsed === undefined) return undefined;
      // Defining the property avoids the legacy `__proto__` setter. Every
      // legal JSON key must survive the preservation-only round trip.
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        value: parsed,
        writable: true,
      });
    }
    return clone;
  }
  return undefined;
}

/**
 * The generic context serializer uses this preservation-only parser. It keeps
 * valid JSON even when the current runtime cannot understand the envelope or
 * state schema, so an unrelated context write cannot downgrade future state.
 */
export function preserveConversationStateEnvelope(value: unknown): JsonValue | undefined {
  return cloneJsonValue(value);
}

export function parseConversationStatePersistenceEnvelope(
  value: unknown,
): ParsedConversationStateEnvelope {
  if (value === undefined) return { kind: "missing" };
  const raw = preserveConversationStateEnvelope(value);
  if (raw === undefined) return { kind: "invalid", reason: "envelope_not_json_object" };
  if (raw === null || Array.isArray(raw) || typeof raw !== "object") {
    return { kind: "invalid", raw, reason: "envelope_not_json_object" };
  }
  if (
    Number.isSafeInteger(raw.envelopeSchemaVersion) &&
    Number(raw.envelopeSchemaVersion) > CONVERSATION_STATE_ENVELOPE_SCHEMA_VERSION
  ) {
    return {
      kind: "future_envelope",
      raw,
      version: Number(raw.envelopeSchemaVersion),
    };
  }
  if (
    raw.envelopeSchemaVersion !== CONVERSATION_STATE_ENVELOPE_SCHEMA_VERSION ||
    typeof raw.tenantId !== "string" || !raw.tenantId || raw.tenantId.trim() !== raw.tenantId ||
    typeof raw.registryId !== "string" || !raw.registryId || raw.registryId.trim() !== raw.registryId ||
    !Number.isSafeInteger(raw.stateRevision) || Number(raw.stateRevision) < 0 ||
    !isIsoTimestamp(raw.stateUpdatedAt) ||
    !isRecord(raw.state) ||
    !Number.isSafeInteger(raw.state.schemaVersion) || Number(raw.state.schemaVersion) < CONVERSATION_V2_SCHEMA_VERSION
  ) {
    return { kind: "invalid", raw, reason: "invalid_envelope_metadata" };
  }

  const state = preserveConversationStateEnvelope(raw.state);
  if (!state || Array.isArray(state) || typeof state !== "object") {
    return { kind: "invalid", raw, reason: "state_not_json_object" };
  }
  const stateVersion = Number(state.schemaVersion);
  if (stateVersion <= CONVERSATION_STATE_V3_SCHEMA_VERSION && (
    state.revision !== raw.stateRevision ||
    state.updatedAt !== raw.stateUpdatedAt
  )) {
    return { kind: "invalid", raw, reason: "state_metadata_mismatch" };
  }

  return {
    envelope: {
      envelopeSchemaVersion: CONVERSATION_STATE_ENVELOPE_SCHEMA_VERSION,
      registryId: raw.registryId.trim(),
      state,
      stateRevision: Number(raw.stateRevision),
      stateUpdatedAt: raw.stateUpdatedAt,
      tenantId: raw.tenantId.trim(),
    },
    kind: "valid",
  };
}

export function createConversationStatePersistenceEnvelope(input: {
  registryId: string;
  state: ConversationStateV3 | ConversationV2State;
  tenantId: string;
}): ConversationStatePersistenceEnvelope {
  const tenantId = input.tenantId;
  const registryId = input.registryId;
  if (
    !tenantId || tenantId.trim() !== tenantId ||
    !registryId || registryId.trim() !== registryId
  ) {
    throw new TypeError("Conversation state envelope requires exact tenantId and registryId");
  }
  const state = preserveConversationStateEnvelope(input.state);
  if (!state || Array.isArray(state) || typeof state !== "object") {
    throw new TypeError("Conversation state envelope requires JSON object state");
  }
  return {
    envelopeSchemaVersion: CONVERSATION_STATE_ENVELOPE_SCHEMA_VERSION,
    registryId,
    state,
    stateRevision: input.state.revision,
    stateUpdatedAt: input.state.updatedAt,
    tenantId,
  };
}

export function loadScopedConversationStateEnvelope(
  value: unknown,
  scope: {
    registry?: ConversationStateV3Registry;
    registryId: string;
    tenantId: string;
  },
): ScopedConversationStateEnvelopeLoad {
  const parsed = parseConversationStatePersistenceEnvelope(value);
  if (parsed.kind === "missing") return parsed;
  if (parsed.kind === "invalid") {
    return { envelope: parsed.raw, kind: "invalid", reason: parsed.reason };
  }
  if (parsed.kind === "future_envelope") {
    return { envelope: parsed.raw, kind: parsed.kind, version: parsed.version };
  }
  const expectedTenantId = scope.tenantId;
  const expectedRegistryId = scope.registryId;
  if (
    !expectedTenantId || expectedTenantId.trim() !== expectedTenantId ||
    parsed.envelope.tenantId !== expectedTenantId
  ) {
    return { envelope: parsed.envelope, expectedTenantId, kind: "tenant_mismatch" };
  }
  if (
    !expectedRegistryId || expectedRegistryId.trim() !== expectedRegistryId ||
    parsed.envelope.registryId !== expectedRegistryId
  ) {
    return { envelope: parsed.envelope, expectedRegistryId, kind: "registry_mismatch" };
  }
  return {
    envelope: parsed.envelope,
    kind: "state",
    stateLoad: loadPersistedConversationStateV3(parsed.envelope.state, scope.registry),
  };
}

export function cloneConversationStatePersistenceEnvelope(
  envelope: ConversationStatePersistenceEnvelope,
): ConversationStatePersistenceEnvelope {
  const parsed = parseConversationStatePersistenceEnvelope(envelope);
  if (parsed.kind !== "valid") throw new TypeError("Invalid conversation state envelope");
  return parsed.envelope;
}
