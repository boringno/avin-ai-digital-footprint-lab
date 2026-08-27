import {
  RESPONSE_CONTRACT_SCHEMA_VERSION,
  createOffResponseContract,
  isResponseAspect,
  type ResponseAspect,
  type ResponseContractAttachment,
  type ResponseContractRuntimeMode,
  type ResponseNextStep,
} from "@/lib/response-contract";

import type { DialoguePolicyAction, ReplyPlan, TurnUnderstanding } from "./types";

const PRICE_ASPECTS = new Set<ResponseAspect>([
  "price_campaign",
  "price_regular",
  "price_unspecified",
]);

const ENFORCEABLE_PRICE_SECONDARY_ASPECTS = new Set<ResponseAspect>([
  "overview",
  "benefits",
  "mechanism",
  "suitability",
  "comfort_recovery",
  "brands",
  "single_vs_combination",
  "combination_reason",
  "general_difference",
]);

function priceAspect(
  action: Extract<DialoguePolicyAction, { type: "answer_price" }>,
): ResponseAspect {
  if (action.priceKind === "campaign") return "price_campaign";
  if (action.priceKind === "regular") return "price_regular";
  return "price_unspecified";
}

function contractSubjectKeys(action: DialoguePolicyAction): string[] {
  switch (action.type) {
    case "answer_price":
    case "answer_selection":
    case "clarify":
    case "learn_treatment":
      return [...new Set(action.treatmentKeys)];
    case "start_booking":
      return [...new Set(action.initialDraft.treatmentKeys ?? [])];
    case "capture_booking_fields":
      return [...new Set(action.fields.treatmentKeys ?? [])];
    case "queue_handoff":
      return [...new Set(action.initialDraft?.treatmentKeys ?? [])];
    default:
      return [];
  }
}

function requestedResponseAspects(turn: TurnUnderstanding): ResponseAspect[] {
  const candidates = turn.questionAspects ?? [turn.questionAspect];
  return [...new Set(candidates.flatMap((aspect) => {
    if (aspect === "none") return [];
    // The clinic deliberately answers every price wording with the current
    // approved offer. The contract therefore records the answer obligation,
    // while the original NLU aspect remains available for analytics.
    if (PRICE_ASPECTS.has(aspect)) return ["price_campaign" as const];
    return [aspect];
  }))];
}

/**
 * First Response Contract pilot. It is deliberately limited to actions whose
 * customer-visible completion can be proven without asking another model.
 * Shadow mode records obligations only; it never changes policy, prompts,
 * prices, booking state, handoff state, or customer-visible text.
 */
export function buildResponseContractForAction(input: {
  action: DialoguePolicyAction;
  plan: ReplyPlan;
  requestedMode?: ResponseContractRuntimeMode;
  turn: TurnUnderstanding;
}): ResponseContractAttachment {
  if (input.action.type === "do_not_reply") return createOffResponseContract();

  const requestedAspects = requestedResponseAspects(input.turn);
  const frameAspect = input.turn.questionAspect !== "none"
    ? input.turn.questionAspect
    : null;
  const hasStructuredAspectList = Array.isArray(input.turn.questionAspects);
  let mustAnswer: ResponseAspect[];
  let nextStep: ResponseNextStep = { kind: "none" };
  let ctaPolicy: "allow" | "require" = "allow";

  switch (input.action.type) {
    case "answer_price": {
      const primary = priceAspect(input.action);
      const secondary = hasStructuredAspectList
        ? requestedAspects.filter((aspect) => !PRICE_ASPECTS.has(aspect))
        : frameAspect && frameAspect !== "overview" && !PRICE_ASPECTS.has(frameAspect)
          ? [frameAspect]
          : [];
      mustAnswer = [primary, ...secondary];
      break;
    }
    case "queue_handoff":
      mustAnswer = ["handoff_confirmation", ...(hasStructuredAspectList ? requestedAspects : [])];
      nextStep = { kind: "handoff" };
      ctaPolicy = "require";
      break;
    case "answer_safety":
      mustAnswer = ["urgent_instruction"];
      break;
    case "start_booking":
    case "capture_booking_fields":
      mustAnswer = ["booking_next_field", ...(hasStructuredAspectList ? requestedAspects : [])];
      break;
    case "answer_clinic_info":
      mustAnswer = input.action.topic && isResponseAspect(input.action.topic)
        ? [input.action.topic]
        : ["direct_answer"];
      if (hasStructuredAspectList) mustAnswer.push(...requestedAspects);
      break;
    case "clarify":
    case "fallback_clarify":
      // A clarification action means the current NLU candidates were not
      // trustworthy enough to answer. Do not turn those candidates into
      // promised obligations until the customer resolves the ambiguity.
      mustAnswer = ["direct_answer"];
      nextStep = {
        aspect: "direct_answer",
        expectedAnswerType: "free_text",
        kind: "ask",
      };
      break;
    case "answer_selection":
      mustAnswer = hasStructuredAspectList && requestedAspects.length > 0
        ? requestedAspects
        : frameAspect && frameAspect !== "overview"
        ? [frameAspect]
        : ["direct_answer"];
      break;
    case "learn_treatment":
      if (input.plan.mode !== "generated") {
        mustAnswer = ["direct_answer", ...(hasStructuredAspectList ? requestedAspects : [])];
      } else if (input.plan.dialogueAct === "introduce_treatment") {
        mustAnswer = hasStructuredAspectList && requestedAspects.length > 1
          ? [...requestedAspects, "need_discovery"]
          : ["overview", "benefits", "need_discovery"];
        nextStep = {
          aspect: "need_discovery",
          expectedAnswerType: "concern",
          kind: "ask",
        };
      } else if (input.plan.dialogueAct === "compare_options") {
        mustAnswer = hasStructuredAspectList && requestedAspects.length > 0
          ? requestedAspects
          : frameAspect && frameAspect !== "overview"
          ? [frameAspect]
          : ["general_difference"];
      } else if (input.plan.dialogueAct === "recommend_direction") {
        mustAnswer = hasStructuredAspectList && requestedAspects.length > 0
          ? [...requestedAspects, "need_discovery"]
          : ["benefits", "need_discovery"];
        nextStep = {
          aspect: "need_discovery",
          expectedAnswerType: "concern",
          kind: "ask",
        };
      } else {
        mustAnswer = hasStructuredAspectList && requestedAspects.length > 0
          ? requestedAspects
          : frameAspect && frameAspect !== "overview"
          ? [frameAspect]
          : ["direct_answer"];
      }
      break;
  }

  const mustNotRepeat: ResponseAspect[] =
    input.plan.mode === "generated" &&
    input.plan.dialogueAct !== "introduce_treatment" &&
    !mustAnswer.includes("overview")
      ? ["overview"]
      : [];

  const contract = {
      ctaPolicy,
      mustAnswer: [...new Set(mustAnswer)],
      mustNotRepeat,
      nextStep,
      schemaVersion: RESPONSE_CONTRACT_SCHEMA_VERSION,
      subjectKeys: contractSubjectKeys(input.action),
    };
  const secondaryAspects = contract.mustAnswer.filter((aspect) => !PRICE_ASPECTS.has(aspect));
  const hasExplicitResolvedConcern = input.turn.concerns.some(
    (mention) =>
      mention.confidence >= 0.65 &&
      mention.polarity === "affirmed" &&
      mention.resolution === "resolved",
  );
  const enforcePilotEligible =
    input.requestedMode === "enforce" &&
    input.action.type === "answer_price" &&
    contract.subjectKeys.length === 1 &&
    contract.mustAnswer.filter((aspect) => PRICE_ASPECTS.has(aspect)).length === 1 &&
    secondaryAspects.length > 0 &&
    secondaryAspects.every((aspect) => ENFORCEABLE_PRICE_SECONDARY_ASPECTS.has(aspect)) &&
    (!secondaryAspects.includes("suitability") || hasExplicitResolvedConcern);

  return {
    contract,
    mode: enforcePilotEligible ? "enforce" : "shadow",
  };
}

/** Backward-compatible helper for repository replay and existing validators. */
export function buildShadowResponseContractForAction(input: {
  action: DialoguePolicyAction;
  plan: ReplyPlan;
  turn: TurnUnderstanding;
}): ResponseContractAttachment {
  return buildResponseContractForAction({ ...input, requestedMode: "shadow" });
}
