import type { ClinicOntology } from "@/lib/clinic-ontology";
import { parseNluFrame, type NluFrame } from "@/lib/nlu-frame";
import { getSupabaseServerClient, hasSupabaseServerConfig } from "@/lib/supabase-server";

const TENANT_ID = "tenant_001";

export type DeterministicDecisionSnapshot = {
  conversationStatus?: string;
  conversationV2?: Record<string, unknown>;
  decisionType: string;
  matchedKey: string;
  matchedType: string;
};

export type NluShadowObservation = {
  confidence: number | null;
  deterministicDecision: DeterministicDecisionSnapshot;
  divergenceCategories: string[];
  errorCode: string | null;
  frame: NluFrame | null;
  latencyMs: number;
  messageId: string;
  model: string;
  /**
   * The exact recognition registry used for this inference. It contains no
   * prices or customer content and is compacted before persistence.
   */
  ontology?: ClinicOntology;
  ontologySnapshotId?: string;
  promptVersion: string;
  tokensIn: number;
  tokensOut: number;
};

export type NluShadowTimelineRecord = {
  divergenceCategories: string[];
  frame: NluFrame;
  legacyDecision: DeterministicDecisionSnapshot;
  lineMessageId?: string;
  lineTimestamp: number;
  messageId: string;
  ontology?: ClinicOntology;
  ontologySnapshotId?: string;
  sourceEventId?: string;
  text: string;
};

export type NluShadowConversationTimeline = {
  records: NluShadowTimelineRecord[];
  totalCustomerMessages: number;
};

type CustomerMessageRow = {
  content: string;
  created_at: string;
  id: string;
  line_message_id: null | string;
  payload_json: unknown;
  source_event_id: null | string;
};

type ShadowObservationRow = {
  deterministic_decision: unknown;
  divergence_categories: unknown;
  message_id: string;
  nlu_frame: unknown;
};

type ConversationOwnerRow = {
  id: string;
  line_user_id: string;
};

type NluShadowQueryError = { message: string };

type NluShadowQueryResult<T> = {
  data: T | null;
  error: NluShadowQueryError | null;
};

type StoredOntologyRegistry = {
  areas: Array<{ key: string; label: string }>;
  concerns: Array<{ areaKeys: string[]; key: string }>;
  schemaVersion: 1;
  treatments: Array<{
    category: ClinicOntology["treatments"][number]["category"];
    key: string;
    name: string;
  }>;
};

type StoredNluFrameEnvelope = {
  frame: unknown;
  ontology: StoredOntologyRegistry;
  ontologySnapshotId: string | null;
  schemaVersion: 1;
};

export type NluShadowTimelineQueryBuilder = {
  eq(column: string, value: unknown): NluShadowTimelineQueryBuilder;
  in(column: string, values: readonly string[]): PromiseLike<NluShadowQueryResult<unknown[]>>;
  limit(count: number): PromiseLike<NluShadowQueryResult<unknown[]>>;
  maybeSingle<T>(): PromiseLike<NluShadowQueryResult<T>>;
  order(column: string, options: { ascending: boolean }): NluShadowTimelineQueryBuilder;
  select(columns: string): NluShadowTimelineQueryBuilder;
};

export type NluShadowTimelineQueryClient = {
  from(table: string): NluShadowTimelineQueryBuilder;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function parseStringArray(value: unknown) {
  return Array.isArray(value) && value.every(isNonEmptyString)
    ? [...new Set(value.map((item) => item.trim()))]
    : null;
}

function compactOntology(ontology: ClinicOntology): StoredOntologyRegistry {
  return {
    areas: ontology.areas.map(({ key, label }) => ({ key, label })),
    concerns: ontology.concerns.map(({ areaKeys, key }) => ({ areaKeys: [...areaKeys], key })),
    schemaVersion: 1,
    treatments: ontology.treatments.map(({ category, key, name }) => ({ category, key, name })),
  };
}

function parseStoredOntology(value: unknown): ClinicOntology | null {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || !Array.isArray(value.areas)
    || !Array.isArray(value.concerns)
    || !Array.isArray(value.treatments)) {
    return null;
  }
  const areas = value.areas.flatMap((item) => {
    if (!isRecord(item) || !isNonEmptyString(item.key) || !isNonEmptyString(item.label)) return [];
    return [{ key: item.key.trim(), keywords: [], label: item.label.trim() }];
  });
  const areaKeys = new Set(areas.map((item) => item.key));
  const concerns = value.concerns.flatMap((item) => {
    if (!isRecord(item) || !isNonEmptyString(item.key)) return [];
    const parsedAreaKeys = parseStringArray(item.areaKeys);
    if (!parsedAreaKeys || parsedAreaKeys.some((key) => !areaKeys.has(key))) return [];
    return [{
      areaKeys: parsedAreaKeys,
      key: item.key.trim(),
      keywords: [],
      recommendedTreatmentKeys: [],
      summary: "",
    }];
  });
  const categories = new Set(["energy", "injectable", "laser", "skin_care", "surgery"]);
  const treatments = value.treatments.flatMap((item) => {
    if (!isRecord(item)
      || !isNonEmptyString(item.key)
      || !isNonEmptyString(item.name)
      || !isNonEmptyString(item.category)
      || !categories.has(item.category)) {
      return [];
    }
    return [{
      aliases: [],
      category: item.category as ClinicOntology["treatments"][number]["category"],
      key: item.key.trim(),
      name: item.name.trim(),
    }];
  });
  if (areas.length !== value.areas.length
    || concerns.length !== value.concerns.length
    || treatments.length !== value.treatments.length
    || new Set(areas.map((item) => item.key)).size !== areas.length
    || new Set(concerns.map((item) => item.key)).size !== concerns.length
    || new Set(treatments.map((item) => item.key)).size !== treatments.length) {
    return null;
  }
  return {
    areas: areas as ClinicOntology["areas"],
    concerns: concerns as ClinicOntology["concerns"],
    treatments,
  };
}

export function encodeNluShadowFrameForStorage(input: NluShadowObservation): unknown {
  if (!input.ontology) return input.frame;
  return {
    frame: input.frame,
    ontology: compactOntology(input.ontology),
    ontologySnapshotId: isNonEmptyString(input.ontologySnapshotId)
      ? input.ontologySnapshotId.trim()
      : null,
    schemaVersion: 1,
  } satisfies StoredNluFrameEnvelope;
}

function decodeNluShadowFrameFromStorage(value: unknown): {
  frame: NluFrame;
  ontology?: ClinicOntology;
  ontologySnapshotId?: string;
} | null {
  if (!isRecord(value) || !("frame" in value) || !("ontology" in value)) {
    const frame = parseNluFrame(value);
    return frame ? { frame } : null;
  }
  if (value.schemaVersion !== 1) return null;
  const ontology = parseStoredOntology(value.ontology);
  if (!ontology) return null;
  const frame = parseNluFrame(value.frame, ontology);
  if (!frame) return null;
  return {
    frame,
    ontology,
    ...(isNonEmptyString(value.ontologySnapshotId)
      ? { ontologySnapshotId: value.ontologySnapshotId.trim() }
      : {}),
  };
}

function parseCustomerMessageRow(value: unknown): CustomerMessageRow | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.content !== "string"
    || typeof value.created_at !== "string"
    || (value.line_message_id !== null && typeof value.line_message_id !== "string")
    || (value.source_event_id !== null && typeof value.source_event_id !== "string")) {
    return null;
  }
  return {
    content: value.content,
    created_at: value.created_at,
    id: value.id,
    line_message_id: value.line_message_id,
    payload_json: value.payload_json,
    source_event_id: value.source_event_id,
  };
}

function parseShadowObservationRow(value: unknown): ShadowObservationRow | null {
  return isRecord(value) && typeof value.message_id === "string"
    ? {
        deterministic_decision: value.deterministic_decision,
        divergence_categories: value.divergence_categories,
        message_id: value.message_id,
        nlu_frame: value.nlu_frame,
      }
    : null;
}

function parseDecision(value: unknown): DeterministicDecisionSnapshot {
  const record = isRecord(value) ? value : {};
  return {
    ...(typeof record.conversationStatus === "string"
      ? { conversationStatus: record.conversationStatus }
      : {}),
    decisionType: typeof record.decisionType === "string" ? record.decisionType : "fallback_reply",
    matchedKey: typeof record.matchedKey === "string" ? record.matchedKey : "unknown",
    matchedType: typeof record.matchedType === "string" ? record.matchedType : "generic_fallback",
  };
}

function lineTimestamp(row: CustomerMessageRow) {
  const payload = isRecord(row.payload_json) ? row.payload_json : {};
  if (typeof payload.event_timestamp === "number" && Number.isSafeInteger(payload.event_timestamp) && payload.event_timestamp >= 0) {
    return payload.event_timestamp;
  }
  const fallback = Date.parse(row.created_at);
  return Number.isSafeInteger(fallback) && fallback >= 0 ? fallback : 0;
}

function dialogueEpisodeKey(row: CustomerMessageRow) {
  const payload = isRecord(row.payload_json) ? row.payload_json : {};
  return typeof payload.dialogue_episode_key === "string" && payload.dialogue_episode_key.trim()
    ? payload.dialogue_episode_key
    : null;
}

export function buildNluShadowConversationTimeline(input: {
  episodeKey?: string;
  messageRows: readonly unknown[];
  observationRows: readonly unknown[];
}): NluShadowConversationTimeline {
  const messages = input.messageRows
    .map(parseCustomerMessageRow)
    .filter((message): message is CustomerMessageRow => Boolean(message))
    .filter((message) => input.episodeKey ? dialogueEpisodeKey(message) === input.episodeKey : true);
  const observations = new Map(
    input.observationRows
      .map(parseShadowObservationRow)
      .filter((row): row is ShadowObservationRow => Boolean(row))
      .map((row) => [row.message_id, row]),
  );
  const records = messages.flatMap((message) => {
    const observation = observations.get(message.id);
    const storedFrame = decodeNluShadowFrameFromStorage(observation?.nlu_frame);
    if (!observation || !storedFrame) return [];
    return [{
      divergenceCategories: Array.isArray(observation.divergence_categories)
        ? observation.divergence_categories.filter((value): value is string => typeof value === "string")
        : [],
      frame: storedFrame.frame,
      legacyDecision: parseDecision(observation.deterministic_decision),
      ...(message.line_message_id ? { lineMessageId: message.line_message_id } : {}),
      lineTimestamp: lineTimestamp(message),
      messageId: message.id,
      ...(storedFrame.ontology ? { ontology: storedFrame.ontology } : {}),
      ...(storedFrame.ontologySnapshotId
        ? { ontologySnapshotId: storedFrame.ontologySnapshotId }
        : {}),
      ...(message.source_event_id ? { sourceEventId: message.source_event_id } : {}),
      text: message.content,
    }];
  });
  return { records, totalCustomerMessages: messages.length };
}

/**
 * Loads message text only in memory so V2 can be replayed. The returned text
 * must never be copied into nlu_shadow_observations or diagnostic payloads.
 */
export async function loadNluShadowConversationTimeline(input: {
  conversationId: string;
  episodeKey?: string;
  expectedUserId: string;
  promptVersion: string;
  tenantId?: string;
}, dependencies: {
  client?: NluShadowTimelineQueryClient;
  hasServerConfig?: () => boolean;
} = {}): Promise<NluShadowConversationTimeline> {
  const hasServerConfig = dependencies.hasServerConfig ?? hasSupabaseServerConfig;
  if (!input.conversationId || !input.expectedUserId || !hasServerConfig()) {
    return { records: [], totalCustomerMessages: 0 };
  }
  const supabase = dependencies.client
    ?? getSupabaseServerClient() as unknown as NluShadowTimelineQueryClient;
  const tenantId = input.tenantId ?? TENANT_ID;
  const { data: owner, error: ownerError } = await supabase
    .from("conversations")
    .select("id,line_user_id")
    .eq("tenant_id", tenantId)
    .eq("id", input.conversationId)
    .maybeSingle<ConversationOwnerRow>();
  if (ownerError) throw new Error(`Failed to verify NLU shadow conversation owner: ${ownerError.message}`);
  if (!owner || owner.line_user_id !== input.expectedUserId) {
    throw new Error("NLU shadow conversation owner mismatch");
  }
  const { data: messageData, error: messageError } = await supabase
    .from("conversation_messages")
    .select("id,content,created_at,line_message_id,source_event_id,payload_json")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", input.conversationId)
    .eq("direction", "customer")
    // Keep the newest window so long-running conversations still include the
    // current turn. Replay restores authoritative LINE ordering afterwards.
    .order("created_at", { ascending: false })
    .limit(200);
  if (messageError) throw new Error(`Failed to load NLU shadow message timeline: ${messageError.message}`);
  const messageRows = messageData ?? [];
  const messages = messageRows
    .map(parseCustomerMessageRow)
    .filter((message): message is CustomerMessageRow => Boolean(message))
    .filter((message) => input.episodeKey ? dialogueEpisodeKey(message) === input.episodeKey : true);
  if (messages.length === 0) return { records: [], totalCustomerMessages: 0 };

  const observationRows: unknown[] = [];
  const messageIds = messages.map((message) => message.id);
  for (let offset = 0; offset < messageIds.length; offset += 50) {
    const { data: observationData, error: observationError } = await supabase
      .from("nlu_shadow_observations")
      .select("message_id,nlu_frame,deterministic_decision,divergence_categories")
      .eq("tenant_id", tenantId)
      .eq("prompt_version", input.promptVersion)
      .in("message_id", messageIds.slice(offset, offset + 50));
    if (observationError) throw new Error(`Failed to load NLU shadow observations: ${observationError.message}`);
    observationRows.push(...(observationData ?? []));
  }
  return buildNluShadowConversationTimeline({
    episodeKey: input.episodeKey,
    messageRows,
    observationRows,
  });
}

export async function patchNluShadowObservationDecision(input: {
  deterministicDecision: DeterministicDecisionSnapshot;
  divergenceCategories: string[];
  messageId: string;
  promptVersion: string;
  tenantId?: string;
}) {
  if (!input.messageId || !hasSupabaseServerConfig()) return;
  const { error } = await getSupabaseServerClient()
    .from("nlu_shadow_observations")
    .update({
      deterministic_decision: input.deterministicDecision,
      divergence_categories: input.divergenceCategories,
    })
    .eq("tenant_id", input.tenantId ?? TENANT_ID)
    .eq("message_id", input.messageId)
    .eq("prompt_version", input.promptVersion);
  if (error) throw new Error(`Failed to patch Conversation V2 shadow decision: ${error.message}`);
}

export async function storeNluShadowObservation(input: NluShadowObservation) {
  if (!input.messageId || !hasSupabaseServerConfig()) return;

  const { error } = await getSupabaseServerClient().from("nlu_shadow_observations").upsert(
    {
      confidence: input.confidence,
      deterministic_decision: input.deterministicDecision,
      divergence_categories: input.divergenceCategories,
      error_code: input.errorCode,
      latency_ms: input.latencyMs,
      message_id: input.messageId,
      model: input.model,
      nlu_frame: encodeNluShadowFrameForStorage(input),
      prompt_version: input.promptVersion,
      tenant_id: TENANT_ID,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
    },
    { onConflict: "tenant_id,message_id,prompt_version" },
  );

  if (error) throw new Error(`Failed to store NLU shadow observation: ${error.message}`);
}
