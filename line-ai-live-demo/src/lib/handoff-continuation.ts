import { classifyBookingSpeechAct } from "@/lib/booking-speech-act";
import { findAllTreatmentsByMessage } from "@/lib/clinic-config";
import { parsePricingQuestionKind } from "@/lib/pricing-subject";
import {
  isPostProcedureEmergency,
} from "@/lib/safety-preflight";

const PENDING_MEDICAL_CONTINUATION_REASONS = new Set([
  "post_procedure_emergency",
  "post_procedure_issue",
]);

const CLINIC_INFORMATION_TERMS = /(?:幾家店|幾間店|幾間分店|館別|分館|分店|據點|門市|地址|營業時間|門診|醫師班表|醫生班表|交通|停車|刷卡|信用卡|現金|付款|分期)/u;
const TREATMENT_QUESTION_TERMS = /(?:想了解|想問|想知道|請介紹|介紹一下|是什麼|有什麼|怎麼|功效|效果|副作用|禁忌|適合|品牌|差別|差異|比較|可以改善|可不可以|能不能|推薦|多久|幾次|療程時間|恢復期|要做幾次)/u;
const TOPIC_SHIFT_CONNECTORS = /(?:另外|對了|順便|還想問|再問|改問|換個問題|但我想問|但我想知道)/u;
const TREATMENT_LIKE_TERMS = /(?:音波|電波|雷射|皮秒|肉毒|玻尿酸|膠原|微整|針劑|療程|手術|除毛|飛梭|海芙|無雙)/u;
const BOOKING_AVAILABILITY_TERMS = /(?:時段|空位|名額|有空|可以幫我排|能幫我排|幫我排|安排(?:週|平日|假日|上午|下午|晚上|白天))/u;
const POST_PROCEDURE_REFERENCE = /(?:打完|做完|術後|剛做|剛打|昨天打|前天打|回去後|注射後|施作後|療程後|打的地方|注射處|施作處|傷口)/u;
const EXPLICIT_EDUCATION_QUESTION = /^(?:(?:有什麼|有哪些|想了解|想問|請問)(?:副作用|風險|術後反應|正常反應)|(?:副作用|風險|術後反應|正常反應)(?:是什麼|有什麼|有哪些|可能有哪些))$/u;
const CONTINUATION_MARKER = /(?:還是|仍然|持續|一直|沒有改善|越來越|又在|還在)/u;

type PendingHandoffTopicContext = {
  activeTreatmentKeys?: readonly string[];
};

export function getRepeatedHandoffAcknowledgement() {
  return "我們已收到您補充的訊息，真人客服會一併確認並接續協助。";
}

/**
 * A pending handoff is not a global pause. Explicit clinic, price, booking, or
 * treatment questions remain routable while staff are still following up on
 * the earlier medical issue.
 */
function stripTopicConnector(message: string) {
  return message.replace(/^\s*(?:另外|對了|順便|還想問|再問|改問|換個問題|但我想問|但我想知道)\s*/u, "").trim();
}

function treatmentKeys(message: string) {
  return new Set(findAllTreatmentsByMessage(message).map((treatment) => treatment.key));
}

function hasDifferentTreatment(input: {
  activeTreatmentKeys: readonly string[];
  candidate: string;
  precedingMessage: string;
}) {
  const candidateKeys = treatmentKeys(input.candidate);
  if (candidateKeys.size === 0) return false;
  const baselineKeys = new Set([
    ...input.activeTreatmentKeys,
    ...treatmentKeys(input.precedingMessage),
  ]);
  if (baselineKeys.size === 0) {
    // With no recoverable subject, an explicitly named treatment is a safe new
    // topic only when the customer is not describing something that happened
    // after that treatment.
    return !POST_PROCEDURE_REFERENCE.test(input.candidate) &&
      !(input.candidate.includes("後") && candidateKeys.size > 0);
  }
  return [...candidateKeys].some((key) => !baselineKeys.has(key));
}

function isConcreteRoutableTopic(
  message: string,
  precedingMessage = "",
  context: PendingHandoffTopicContext = {},
) {
  const candidate = stripTopicConnector(message).replace(/[。；;！？!?]+$/gu, "").trim();
  if (!candidate) return false;
  if (EXPLICIT_EDUCATION_QUESTION.test(candidate.replace(/\s+/gu, ""))) return true;
  if (CONTINUATION_MARKER.test(candidate)) return false;
  if (parsePricingQuestionKind(candidate) !== null) return true;
  if (classifyBookingSpeechAct(candidate) !== "none") return true;
  if (BOOKING_AVAILABILITY_TERMS.test(candidate.replace(/\s+/gu, ""))) return true;
  if (CLINIC_INFORMATION_TERMS.test(candidate.replace(/\s+/gu, ""))) return true;
  if (hasDifferentTreatment({
    activeTreatmentKeys: context.activeTreatmentKeys ?? [],
    candidate,
    precedingMessage,
  })) return true;

  // Unsupported treatment names are not in the ontology, so they cannot be
  // compared by key. They may still be routed as a new education question,
  // but not when the wording describes an event after treatment.
  return (
    findAllTreatmentsByMessage(candidate).length === 0 &&
    TREATMENT_LIKE_TERMS.test(candidate) &&
    !POST_PROCEDURE_REFERENCE.test(candidate) &&
    TREATMENT_QUESTION_TERMS.test(candidate)
  );
}

/**
 * Return only the new, concrete topic after a pending medical issue. Feeding
 * this clause to NLU prevents words in the unresolved symptom clause from
 * contaminating the new question (for example "打完還痛，對了副作用？").
 */
export function extractExplicitPendingHandoffTopic(
  message: string,
  context: PendingHandoffTopicContext = {},
) {
  const connectorSuffix = extractPendingHandoffTopicSuffix(message);
  if (connectorSuffix) {
    const connectorIndex = message.lastIndexOf(connectorSuffix);
    if (
      isConcreteRoutableTopic(
        connectorSuffix,
        connectorIndex > 0 ? message.slice(0, connectorIndex) : "",
        context,
      )
    ) return connectorSuffix;
  }

  const segments = message
    .split(/[，,。；;！？!?]+/u)
    .map((segment) => stripTopicConnector(segment))
    .filter(Boolean);
  for (let index = 0; index < segments.length; index += 1) {
    const candidate = segments[index];
    if (
      candidate &&
      isConcreteRoutableTopic(
        candidate,
        segments.slice(0, index).join("，"),
        context,
      )
    ) return segments.slice(index).join("，");
  }

  if (isConcreteRoutableTopic(message, "", context)) {
    return stripTopicConnector(message);
  }
  return null;
}

/** Return the complete connector suffix so booking fields/price qualifiers in
 * later comma-separated clauses stay in the same turn. */
export function extractPendingHandoffTopicSuffix(message: string) {
  const connectors = [...message.matchAll(new RegExp(TOPIC_SHIFT_CONNECTORS.source, "gu"))];
  const lastConnector = connectors.at(-1);
  if (lastConnector?.index === undefined) return null;
  const suffix = stripTopicConnector(
    message.slice(lastConnector.index + lastConnector[0].length),
  ).replace(/[。；;！？!?]+$/gu, "").trim();
  return suffix || null;
}

export function hasExplicitPendingHandoffTopicShift(message: string) {
  return extractExplicitPendingHandoffTopic(message) !== null;
}

export function isPendingMedicalContinuation(input: {
  handoffReason: null | string;
  message: string;
  activeTreatmentKeys?: readonly string[];
}) {
  if (
    !input.handoffReason ||
    !PENDING_MEDICAL_CONTINUATION_REASONS.has(input.handoffReason) ||
    isPostProcedureEmergency(input.message)
  ) {
    return false;
  }
  // While a medical handoff is unresolved, the safe default is to keep the
  // message with that handoff. Only a provable operational pivot or a clearly
  // different treatment topic is released back to automation.
  return extractExplicitPendingHandoffTopic(input.message, {
    activeTreatmentKeys: input.activeTreatmentKeys,
  }) === null;
}
