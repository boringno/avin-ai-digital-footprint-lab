import { createHash } from "node:crypto";
import { verifyLineSignature } from "./line-webhook";

/** R1 foundation: NOT_YET_WIRED. No live caller or fallback to /tmp. */
export interface TrustedInboxChannel {
  channelRef: string;
  destination: string;
  channelSecret: string;
}
export interface InboxInput {
  schemaVersion: 1;
  destination: string;
  eventId: string;
  eventType: string;
  timestamp: number;
  source: { type: "user" | "group" | "room"; id: string; userId?: string };
  message?: { id: string; type: string; text?: string; quotedMessageId?: string };
  postback?: { data: string; params?: { date?: string; time?: string; datetime?: string } };
  mode?: string;
}
export interface VerifiedInboxEvent {
  channelRef: string;
  input: InboxInput;
  isRedelivery: boolean;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("R1_INVALID_OBJECT");
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.length) throw new Error("R1_INVALID_STRING");
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("R1_INVALID_INTEGER");
  return value;
}
function uuid(value: unknown): string {
  const result = string(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) throw new Error("R1_INVALID_UUID");
  return result;
}
function hash(value: unknown): string {
  const result = string(value);
  if (!/^[0-9a-f]{64}$/.test(result)) throw new Error("R1_INVALID_HASH");
  return result;
}

/** Verify raw bytes BEFORE parsing/projection; tenant is deliberately not accepted. */
export function prepareVerifiedInboxEvents(rawBody: string, signature: string, channel: TrustedInboxChannel): VerifiedInboxEvent[] {
  if (!channel.channelSecret || !channel.channelRef || !channel.destination ||
    !verifyLineSignature(rawBody, channel.channelSecret, signature)) throw new Error("R1_SIGNATURE_REJECTED");
  const body = object(JSON.parse(rawBody));
  if (body.destination !== channel.destination) throw new Error("R1_DESTINATION_MISMATCH");
  if (!Array.isArray(body.events)) throw new Error("R1_EVENTS_REQUIRED");
  return body.events.map((raw: unknown) => {
    const event = object(raw);
    const source = object(event.source);
    const type = source.type;
    if (type !== "user" && type !== "group" && type !== "room") throw new Error("R1_SOURCE_REQUIRED");
    const input: InboxInput = {
      schemaVersion: 1, destination: channel.destination,
      eventId: string(event.webhookEventId), eventType: string(event.type), timestamp: integer(event.timestamp),
      source: { type, id: string(source[type === "user" ? "userId" : type === "group" ? "groupId" : "roomId"]) },
    };
    if (type !== "user" && typeof source.userId === "string") input.source.userId = string(source.userId);
    if (event.type === "message") {
      const message = object(event.message);
      input.message = { id: string(message.id), type: string(message.type) };
      if (message.type === "text") {
        if (typeof message.text !== "string") throw new Error("R1_TEXT_REQUIRED");
        input.message.text = message.text; // Preserve exact customer text, including whitespace.
      }
      if (typeof message.quotedMessageId === "string") input.message.quotedMessageId = string(message.quotedMessageId);
    }
    if (event.type === "postback") {
      const postback = object(event.postback);
      input.postback = { data: string(postback.data) };
      if (postback.params !== undefined) {
        const params = object(postback.params);
        input.postback.params = {};
        for (const key of ["date", "time", "datetime"] as const) {
          if (params[key] !== undefined) input.postback.params[key] = string(params[key]);
        }
      }
    }
    if (event.mode !== undefined) input.mode = string(event.mode);
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > 65536) throw new Error("R1_INPUT_TOO_LARGE");
    const delivery = event.deliveryContext === undefined ? {} : object(event.deliveryContext);
    return { channelRef: channel.channelRef, input, isRedelivery: delivery.isRedelivery === true };
  });
}

export type Admission = {
  disposition: "NEW_EVENT" | "EXISTING_EVENT";
  inboxId: string; tenantId: string; inputHash: string; decisionId: string;
} | { disposition: "IDENTITY_CONFLICT"; reason: "IMMUTABLE_INPUT_CONFLICT" | "SECONDARY_MESSAGE_IDENTITY" };
export interface ProcessingFence {
  tenantId: string; inboxId: string; generation: number; owner: string;
}
export type ProcessingClaim = {
  disposition: "CLAIM_GRANTED";
  fence: ProcessingFence;
  leaseExpiresAt: string;
  processingAttempt: number;
  decisionId: string;
} | { disposition: "RECOVERY_REQUIRED"; decisionId: string }
  | { disposition: "INCIDENT" | "DUPLICATE_COMPLETED" | "DUPLICATE_ALREADY_OWNED" | "CONVERSATION_BUSY" };

export interface InboxRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
function fenceArgs(fence: ProcessingFence) {
  return { p_tenant: string(fence.tenantId), p_inbox: uuid(fence.inboxId), p_generation: integer(fence.generation), p_owner: uuid(fence.owner) };
}
/** Inject a server/service-role client. Does not load env, create a client or send LINE. */
export function createInboxStore(client: InboxRpcClient) {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const response = await client.rpc(name, args);
      if (response.error) throw new Error("R1_RPC_FAILED");
      return response.data;
    } catch {
      // Never surface a provider error containing input/credentials; never fall back to legacy processing.
      throw new Error("R1_RPC_FAILED");
    }
  }
  return {
    async admit(event: VerifiedInboxEvent): Promise<Admission> {
      const row = object(await rpc("line_inbox_admit", {
        p_channel_ref: event.channelRef, p_input: event.input, p_redelivery: event.isRedelivery,
      }));
      if (row.disposition === "IDENTITY_CONFLICT") {
        if (row.reason !== "IMMUTABLE_INPUT_CONFLICT" && row.reason !== "SECONDARY_MESSAGE_IDENTITY") throw new Error("R1_UNKNOWN_CONFLICT");
        return { disposition: row.disposition, reason: row.reason };
      }
      if (row.disposition !== "NEW_EVENT" && row.disposition !== "EXISTING_EVENT") throw new Error("R1_UNKNOWN_ADMISSION");
      return { disposition: row.disposition, inboxId: uuid(row.inboxId), tenantId: string(row.tenantId), inputHash: hash(row.inputHash), decisionId: uuid(row.decisionId) };
    },
    async claim(admission: Exclude<Admission, { disposition: "IDENTITY_CONFLICT" }>, owner: string, leaseSeconds = 30): Promise<ProcessingClaim> {
      const row = object(await rpc("line_inbox_claim", {
        p_tenant: admission.tenantId, p_inbox: uuid(admission.inboxId), p_hash: hash(admission.inputHash), p_owner: uuid(owner), p_lease_seconds: leaseSeconds,
      }));
      switch (row.disposition) {
        case "CLAIM_GRANTED": {
          if (row.inboxId !== admission.inboxId || row.owner !== owner || row.decisionId !== admission.decisionId) throw new Error("R1_CLAIM_IDENTITY_MISMATCH");
          const expiry = string(row.leaseExpiresAt);
          if (!Number.isFinite(Date.parse(expiry))) throw new Error("R1_INVALID_EXPIRY");
          return { disposition: row.disposition, fence: { tenantId: admission.tenantId, inboxId: admission.inboxId, generation: integer(row.generation), owner },
            leaseExpiresAt: expiry, processingAttempt: integer(row.processingAttempt), decisionId: uuid(row.decisionId) };
        }
        case "RECOVERY_REQUIRED":
          if (row.decisionId !== admission.decisionId) throw new Error("R1_DECISION_MISMATCH");
          return { disposition: row.disposition, decisionId: uuid(row.decisionId) };
        case "INCIDENT": case "DUPLICATE_COMPLETED": case "DUPLICATE_ALREADY_OWNED": case "CONVERSATION_BUSY":
          return { disposition: row.disposition };
        default: throw new Error("R1_UNKNOWN_CLAIM");
      }
    },
    async renew(fence: ProcessingFence, leaseSeconds = 30): Promise<string> {
      const expiry = string(await rpc("line_inbox_renew", { ...fenceArgs(fence), p_lease_seconds: leaseSeconds }));
      if (!Number.isFinite(Date.parse(expiry))) throw new Error("R1_INVALID_EXPIRY");
      return expiry;
    },
    async persistCustomer(fence: ProcessingFence): Promise<string> {
      return uuid(await rpc("line_inbox_persist_customer", fenceArgs(fence)));
    },
  };
}

/** Stable across generations. Future effects still require DB uniqueness + the in-transaction fence. */
export function inboxActionIdentity(decisionId: string, actionKind: string, ordinal: number): string {
  uuid(decisionId);
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(actionKind) || !Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error("R1_INVALID_ACTION_IDENTITY");
  return createHash("sha256").update(JSON.stringify(["r1-action-v1", decisionId.toLowerCase(), actionKind, ordinal])).digest("hex");
}

/** Controlled metadata projection: never includes source ID, text, input JSON, secret or token. */
export function inboxTrace(event: VerifiedInboxEvent, admission: Admission, claim?: ProcessingClaim) {
  return {
    eventId: event.input.eventId, messageId: event.input.message?.id,
    admission: admission.disposition,
    inboxId: admission.disposition === "IDENTITY_CONFLICT" ? undefined : admission.inboxId,
    inputHash: admission.disposition === "IDENTITY_CONFLICT" ? undefined : admission.inputHash,
    recoveryDisposition: claim?.disposition,
    generation: claim?.disposition === "CLAIM_GRANTED" ? claim.fence.generation : undefined,
    leaseOwner: claim?.disposition === "CLAIM_GRANTED" ? claim.fence.owner : undefined,
    processingAttempt: claim?.disposition === "CLAIM_GRANTED" ? claim.processingAttempt : undefined,
  };
}
