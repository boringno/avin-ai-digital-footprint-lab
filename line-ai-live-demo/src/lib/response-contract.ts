import { QUESTION_ASPECTS, type QuestionAspect } from "@/lib/dialogue-semantics";

export const RESPONSE_CONTRACT_SCHEMA_VERSION = 1 as const;
export type ResponseContractRuntimeMode = "shadow" | "enforce";

/**
 * Semantic units that a reply can complete. These are deliberately not prose
 * snippets: wording may change while the obligation remains the same.
 */
export type ResponseAspect =
  | Exclude<QuestionAspect, "none">
  | "need_discovery"
  | "direct_answer"
  | "urgent_instruction"
  | "booking_next_field"
  | "handoff_confirmation";

const RESPONSE_ASPECT_SET = new Set<string>([
  ...QUESTION_ASPECTS.filter((aspect) => aspect !== "none"),
  "need_discovery",
  "direct_answer",
  "urgent_instruction",
  "booking_next_field",
  "handoff_confirmation",
]);

export function isResponseAspect(value: unknown): value is ResponseAspect {
  return typeof value === "string" && RESPONSE_ASPECT_SET.has(value);
}

export type ResponseExpectedAnswerType =
  | "area"
  | "concern"
  | "treatment"
  | "preference"
  | "booking_field"
  | "free_text";

export type ResponseBookingField =
  | "treatment"
  | "branch"
  | "time_slots"
  | "first_visit"
  | "name"
  | "phone"
  | "appointment_reference"
  | "change_request";

export type ResponseNextStep =
  | { kind: "none" }
  | {
      aspect: ResponseAspect;
      expectedAnswerType: ResponseExpectedAnswerType;
      kind: "ask";
    }
  | { kind: "invite_consultation" }
  | { field: ResponseBookingField; kind: "collect_booking" }
  | { kind: "handoff" };

/**
 * Policy-owned response obligations. Facts providers may hydrate evidence and
 * renderers may phrase it, but neither layer may silently change this contract.
 */
export type ResponseContract = {
  ctaPolicy: "forbid" | "allow" | "require";
  /** Ordered; the first entry is the primary answer obligation for this turn. */
  mustAnswer: ResponseAspect[];
  /** Semantic aspects already completed for the same subject. */
  mustNotRepeat: ResponseAspect[];
  nextStep: ResponseNextStep;
  schemaVersion: typeof RESPONSE_CONTRACT_SCHEMA_VERSION;
  /** Canonical treatment subjects that the obligations refer to. */
  subjectKeys: string[];
};

/**
 * `off` makes rollout state explicit and prevents an optional field from being
 * forgotten. Shadow records obligations only. Enforce is selected by Policy
 * after an explicit runtime gate and must be verified by the renderer.
 */
export type ResponseContractAttachment =
  | { mode: "off" }
  | { contract: ResponseContract; mode: ResponseContractRuntimeMode };

const CTA_POLICIES = new Set<ResponseContract["ctaPolicy"]>(["forbid", "allow", "require"]);
const EXPECTED_ANSWER_TYPES = new Set<ResponseExpectedAnswerType>([
  "area",
  "concern",
  "treatment",
  "preference",
  "booking_field",
  "free_text",
]);
const BOOKING_FIELDS = new Set<ResponseBookingField>([
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

function isResponseNextStep(value: unknown): value is ResponseNextStep {
  if (!isRecord(value)) return false;
  if (value.kind === "none" || value.kind === "invite_consultation" || value.kind === "handoff") {
    return true;
  }
  if (value.kind === "ask") {
    return isResponseAspect(value.aspect) &&
      EXPECTED_ANSWER_TYPES.has(value.expectedAnswerType as ResponseExpectedAnswerType);
  }
  return value.kind === "collect_booking" && BOOKING_FIELDS.has(value.field as ResponseBookingField);
}

export function isResponseContract(value: unknown): value is ResponseContract {
  if (!isRecord(value) || value.schemaVersion !== RESPONSE_CONTRACT_SCHEMA_VERSION) return false;
  if (!Array.isArray(value.mustAnswer) || !Array.isArray(value.mustNotRepeat)) return false;
  const mustAnswer = value.mustAnswer;
  const mustNotRepeat = value.mustNotRepeat;
  const subjectKeys = value.subjectKeys;
  if (
    !CTA_POLICIES.has(value.ctaPolicy as ResponseContract["ctaPolicy"]) ||
    mustAnswer.length === 0 ||
    !mustAnswer.every(isResponseAspect) ||
    new Set(mustAnswer).size !== mustAnswer.length ||
    !mustNotRepeat.every(isResponseAspect) ||
    new Set(mustNotRepeat).size !== mustNotRepeat.length ||
    !Array.isArray(subjectKeys) ||
    !subjectKeys.every((key) => typeof key === "string" && key.trim().length > 0) ||
    new Set(subjectKeys).size !== subjectKeys.length ||
    mustAnswer.some((aspect) => mustNotRepeat.includes(aspect)) ||
    !isResponseNextStep(value.nextStep)
  ) return false;
  const nextKind = value.nextStep.kind;
  if (nextKind === "ask" && mustNotRepeat.includes(value.nextStep.aspect)) {
    return false;
  }
  if (value.ctaPolicy === "forbid" && ["invite_consultation", "collect_booking"].includes(nextKind)) {
    return false;
  }
  if (value.ctaPolicy === "require" && !["invite_consultation", "collect_booking", "handoff"].includes(nextKind)) {
    return false;
  }
  return true;
}

export function createResponseContract(value: ResponseContract): ResponseContract {
  if (!isResponseContract(value)) throw new Error("Invalid Response Contract");
  return {
    ...value,
    mustAnswer: [...value.mustAnswer],
    mustNotRepeat: [...value.mustNotRepeat],
    nextStep: { ...value.nextStep },
    subjectKeys: [...value.subjectKeys],
  };
}

export function createOffResponseContract(): ResponseContractAttachment {
  return { mode: "off" };
}

export function cloneResponseContractAttachment(
  attachment: ResponseContractAttachment,
): ResponseContractAttachment {
  if (attachment.mode === "off") return createOffResponseContract();
  return {
    contract: {
      ...attachment.contract,
      mustAnswer: [...attachment.contract.mustAnswer],
      mustNotRepeat: [...attachment.contract.mustNotRepeat],
      nextStep: { ...attachment.contract.nextStep },
      subjectKeys: [...attachment.contract.subjectKeys],
    },
    mode: attachment.mode,
  };
}
