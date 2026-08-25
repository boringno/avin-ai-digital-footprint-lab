import { classifyBookingSpeechAct } from "@/lib/booking-speech-act";
import {
  buildTreatmentReplyAssets,
  type TreatmentReplyAsset,
} from "@/lib/clinic-facts/treatment-reply-assets";
import {
  normalizeClinicText,
  type ClinicConfig,
} from "@/lib/clinic-config";
import type { ClinicOntology } from "@/lib/clinic-ontology";
import { matchClinicOntology } from "@/lib/clinic-ontology-matcher";
import type {
  DialogueSpeechAct,
  QuestionAspect,
} from "@/lib/dialogue-semantics";
import {
  isHedgedTreatmentReference,
  isPriceInquiry,
} from "@/lib/pricing-subject";
import { isImmediateSafetyBoundaryMessage } from "@/lib/safety-preflight";

import type {
  ConversationV2State,
  TrustedSemanticAnchor,
} from "./types";
import {
  hasNegativeIntentNominalComplement,
  isNegatedContentIntroPrefix,
  matchPositiveContentIntros,
  normalizeLeadingPositiveContentIntro,
} from "./content-intro";
import { isExplicitTreatmentOverviewRestart } from "./episode-policy";
import { isConversationV2AiAssistanceEnabled } from "./state";

const CONTENT_SPEECH_ACTS = new Set<DialogueSpeechAct>([
  "ask_concern",
  "ask_treatment_detail",
  "compare_treatments",
  "learn_treatment",
  "unknown",
]);
const CONTENT_QUESTION_ASPECTS = new Set<QuestionAspect>([
  "overview",
  "benefits",
  "mechanism",
  "suitability",
  "comfort_recovery",
  "side_effects",
  "duration",
  "sessions",
  "single_vs_combination",
  "combination_reason",
  "general_difference",
  "brands",
  "brand_difference",
  "alternatives",
  "none",
]);
const CLINIC_INFO_TERMS = /(?:分店|分館|館別|幾家店|幾間店|哪間有|哪館有|哪裡有|地址|營業|班表|醫師|停車|交通|聯絡|電話|手機|客服)/u;
const CONSERVATIVE_NEGATION_TERMS = /(?:不是|不要|不想|不考慮|不需要|沒(?:有)?|無|並非|排除|別)/u;
const NON_CONTENT_INTENT_TERMS = /(?:收費|費用|價錢|價格|活動價|優惠價|可以約|能約|預約|約時間|還沒決定|尚未決定|沒決定|朋友|綽號)/u;
const ENTITY_ONLY_FILLERS = [
  "我想了解",
  "我想瞭解",
  "我響了解",
  "我向了解",
  "我想知道",
  "我比較在意",
  "我主要在意",
  "我在意",
  "主要是",
  "比較是",
  "想改善",
  "想了解",
  "想瞭解",
  "響了解",
  "向了解",
  "想知道",
  "請問",
  "這個",
  "可以幫我",
  "幫我",
  "介紹",
  "說明",
  "了解",
  "看看",
  "一下",
  "療程",
] as const;
const CONTENT_QUESTION_FILLERS = [
  ...ENTITY_ONLY_FILLERS,
  "好",
  "好的",
  "可以",
  "可以啊",
  "沒問題",
  "幫",
  "差異",
  "有什麼效果",
  "有沒有什麼效果",
  "有何效果",
  "效果如何",
  "主要改善啥",
  "可以改善啥",
  "能改善啥",
  "改善啥",
  "能幹嘛",
  "可以幹嘛",
  "可以改善什麼",
  "能改善什麼",
  "改善什麼",
  "可以打哪裡",
  "能打哪裡",
  "可以打哪些部位",
  "能打哪些部位",
  "適合哪些部位",
  "適合什麼",
  "適合誰",
  "適合我",
  "有什麼用",
  "是什麼",
  "怎麼做",
  "怎麼作用",
  "作用原理",
  "原理",
  "特色",
  "功效",
  "效果",
  "作用",
  "機制",
  "會不會痛",
  "會痛嗎",
  "痛嗎",
  "疼痛嗎",
  "要敷麻嗎",
  "敷麻",
  "恢復期",
  "有沒有恢復期",
  "修復期",
  "恢復多久",
  "多久",
  "副作用是什麼",
  "會不會有副作用",
  "會有什麼副作用",
  "有副作用嗎",
  "有沒有副作用",
  "有風險嗎",
  "做完會有副作用嗎",
  "有什麼副作用",
  "有哪些副作用",
  "副作用",
  "風險",
  "安全嗎",
  "需要幾次",
  "做幾次",
  "幾次",
  "單做",
  "搭配",
  "一起做",
  "差在哪",
  "差別",
  "有什麼不同",
  "為什麼",
  "哪個品牌",
  "什麼品牌",
  "用什麼品牌",
  "哪個牌子",
  "哪個廠牌",
  "哪一牌",
  "什麼牌",
  "哪牌",
  "品牌",
  "牌子",
  "廠牌",
  "比較",
  "跟",
  "和",
  "與",
] as const;
const PROSPECTIVE_RISK_FILLERS = [
  "做了之後",
  "打了之後",
  "做完之後",
  "打完之後",
  "施作之後",
  "治療之後",
  "療程之後",
  "做完",
  "打完",
  "施作後",
  "治療後",
  "療程後",
  "術後",
  "會",
  "會不會",
  "有沒有",
  "有無",
  "會否",
  "是否",
  "可能",
  "容易",
  "通常",
  "常見",
  "機率",
  "多久",
  "幾天",
  "久",
  "是什麼",
  "有哪些",
  "有什麼",
  "副作用",
  "風險",
  "後遺症",
  "發炎",
  "紅腫",
  "腫",
  "疼痛",
  "痛",
  "麻",
  "出血",
  "起水泡",
  "不舒服",
] as const;
const SIDE_EFFECT_QUESTION_FILLERS = [
  "副作用",
  "風險",
  "後遺症",
  "危險",
  "傷身",
  "安全",
  "會不會",
  "有沒有",
  "有無",
  "會否",
  "是否",
  "有什麼",
  "有哪些",
  "什麼",
  "可能",
  "容易",
  "通常",
  "常見",
  "嚴重",
  "高",
  "大",
  "久",
  "多",
  "對",
  "做起來",
  "起來",
  "為何",
  "有",
  "會",
] as const;
const SYMPTOM_QUESTION_FILLERS = [
  "發炎",
  "紅腫",
  "紅",
  "腫",
  "疼痛",
  "痛",
  "麻",
  "出血",
  "水泡",
  "起水泡",
  "不舒服",
  "會不會",
  "有沒有",
  "有無",
  "會否",
  "是否",
  "可能",
  "容易",
  "通常",
  "常見",
  "嚴重",
  "多久",
  "久",
  "幾天",
  "有",
  "會",
] as const;
const BRAND_QUESTION_FILLERS = [
  "機器品牌",
  "品牌",
  "牌子",
  "廠牌",
  "原廠",
  "廠商",
  "製造商",
  "製造",
  "公司",
  "名稱",
  "哪一個",
  "哪一",
  "哪個",
  "哪家",
  "哪牌",
  "牌",
  "什麼",
  "叫",
  "用",
  "出的",
  "出",
  "機器",
  "機台",
  "設備",
  "誰家",
  "哪間",
  "為何",
  "有哪些",
] as const;
const APPROVED_ASSET_NEUTRAL_FILLERS = [
  "我比較在意",
  "我主要在意",
  "我在意",
  "主要是",
  "比較是",
  "有點",
  "困擾",
  "問題",
  "堆積",
  // A matched approved-content term may itself be phrased as a proposal
  // (for example, `只做 <treatment>`).  Consume only the trailing yes/no
  // morphology here; price, booking, clinic and safety wording has already
  // been rejected by the hard-domain gate above.
  "可以嗎",
  "能嗎",
] as const;
const CLAUSE_BOUNDARY = /(?:[，,。！!？?；;]+|但是|可是|不過|而是|改成|但)/u;
const INTERROGATIVE_MODAL_ALTERNATIVE = /(?:有無|會否|是否|能否|可否)/gu;

export type SemanticAnchorCandidate = {
  questionAspect?: QuestionAspect;
  speechAct?: DialogueSpeechAct;
};

export type ResolveSemanticAnchorInput = {
  candidate?: SemanticAnchorCandidate;
  clinic: ClinicConfig;
  message: string;
  ontology: ClinicOntology;
  state: ConversationV2State;
};

function unique(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function hasConservativeNegation(message: string) {
  // Interrogative alternatives (`有沒有`, `安不安全`, `腫不腫`) are not
  // rejections. Remove the morphology before applying the conservative guard
  // so factual questions remain answerable while standalone negation such as
  // `我沒有...` or `我不想...` still fails closed.
  const withoutYesNoQuestion = normalizeClinicText(message)
    .replace(/有沒有/gu, "")
    .replace(INTERROGATIVE_MODAL_ALTERNATIVE, "")
    .replace(/([\p{Script=Han}]{1,3})不\1/gu, "$1");
  return CONSERVATIVE_NEGATION_TERMS.test(withoutYesNoQuestion);
}

function hasOntologyEntity(message: string, ontology: ClinicOntology) {
  const match = matchClinicOntology(message, ontology);
  return match.areas.length + match.concerns.length + match.treatments.length > 0;
}

function normalizeIndependentContentClause(message: string) {
  return normalizeLeadingPositiveContentIntro(message);
}

/**
 * A negative self-description in one clause must not erase a separate,
 * explicit treatment request. Scope only when there is exactly one ontology
 * clause and every other clause is negative/meta with no ontology entity.
 * This deliberately keeps real mixed price/booking/content requests on the
 * full-message path so their deterministic domain gate still owns the turn.
 */
function selectIndependentPositiveContentClause(
  message: string,
  ontology: ClinicOntology,
) {
  const clauses = message
    .split(CLAUSE_BOUNDARY)
    .map((clause) => clause.trim())
    .filter(Boolean);
  if (clauses.length < 2) {
    // Customers commonly omit punctuation: `我沒有做過醫美想了解ONDA`.
    // Treat an attached content-intro suffix as a separate clause only when
    // the prefix is a negative/meta self-description with no ontology entity.
    // Price/booking/clinic/safety wording remains in the selected suffix and
    // is still rejected by the hard-domain gate below.
    for (const match of matchPositiveContentIntros(message)) {
      const index = match.index;
      if (index === undefined || index <= 0) continue;
      const ignoredPrefix = message.slice(0, index).trim();
      const selected = message.slice(index).trim();
      if (
        ignoredPrefix &&
        !hasOntologyEntity(ignoredPrefix, ontology) &&
        hasConservativeNegation(ignoredPrefix) &&
        !isNegatedContentIntroPrefix(ignoredPrefix) &&
        !hasNegativeIntentNominalComplement(ignoredPrefix) &&
        hasOntologyEntity(selected, ontology) &&
        !hasConservativeNegation(selected)
      ) {
        return normalizeIndependentContentClause(selected);
      }
    }
    return normalizeIndependentContentClause(message);
  }
  const entityClauses = clauses.filter((clause) => hasOntologyEntity(clause, ontology));
  if (entityClauses.length !== 1) return message;
  const selected = entityClauses[0]!;
  if (hasConservativeNegation(selected)) return message;
  const ignoredClauses = clauses.filter((clause) => clause !== selected);
  return ignoredClauses.every((clause) =>
    !hasOntologyEntity(clause, ontology) && hasConservativeNegation(clause),
  )
    ? normalizeIndependentContentClause(selected)
    : message;
}

function subjectTreatmentKeys(subjectKey: string | undefined) {
  if (!subjectKey) return [];
  for (const prefix of ["treatment:", "comparison:"]) {
    if (subjectKey.startsWith(prefix)) {
      return subjectKey.slice(prefix.length).split("+").filter(Boolean);
    }
  }
  return [];
}

function activeTreatmentKeys(state: ConversationV2State) {
  if (state.activeTask.kind === "pricing") {
    return unique(state.pricingSubjectTreatmentKeys);
  }
  if (!["answer_concern", "learn_treatment", "compare_treatments"].includes(state.activeTask.kind)) return [];
  const subjectKeys = subjectTreatmentKeys(state.activeTask.subjectKey);
  if (subjectKeys.length > 0) return unique(subjectKeys);
  return unique(state.knowledge.treatmentKeys);
}

/**
 * A reviewed combination relationship belongs to the treatment pack. When a
 * customer accepts the comparison offered immediately after a price answer,
 * recover that exact pair from the active pricing subject instead of asking
 * them to repeat two treatment names that the clinic just offered.
 */
function resolveActiveCombinationQueryAnchor(
  input: ResolveSemanticAnchorInput,
  explicitTreatmentKeys: readonly string[],
  explicitConcernKeys: readonly string[],
  explicitAreaKeys: readonly string[],
  matchedTerms: readonly string[],
): TrustedSemanticAnchor | undefined {
  const ownerKeys = activeTreatmentKeys(input.state);
  if (ownerKeys.length !== 1 || explicitTreatmentKeys.length > 1) return undefined;
  const ownerKey = ownerKeys[0]!;
  if (explicitTreatmentKeys.length === 1 && explicitTreatmentKeys[0] !== ownerKey) return undefined;

  const aspect = inferDeterministicContentQuestionAspect(
    input.message,
    matchedTerms,
    APPROVED_ASSET_NEUTRAL_FILLERS,
  );
  if (!["single_vs_combination", "combination_reason", "general_difference"].includes(aspect ?? "")) {
    return undefined;
  }
  const treatment = input.clinic.treatmentList.find((item) => item.key === ownerKey);
  const companions = unique(
    (treatment?.consultationGuide?.approvedCombinationTreatmentKeys ?? [])
      .filter((key) => !input.state.preferences.excludedTreatmentKeys.includes(key)),
  );
  if (companions.length !== 1) return undefined;

  const concernKeys = unique([
    ...explicitConcernKeys,
    ...input.state.knowledge.concernKeys.filter((key) =>
      treatmentSupportsConcern(input.clinic, ownerKey, key)),
  ]);
  return {
    areaKeys: unique([...explicitAreaKeys, ...input.state.knowledge.areaKeys]),
    concernKeys,
    conversationMove: "continue",
    dialogueReference: "active_comparison",
    questionAspect: "single_vs_combination",
    source: "active_subject_query",
    speechAct: "compare_treatments",
    treatmentKeys: [ownerKey, companions[0]!],
  };
}

function contentActionAllowed(candidate: SemanticAnchorCandidate | undefined) {
  return !candidate?.speechAct || CONTENT_SPEECH_ACTS.has(candidate.speechAct);
}

function hasClinicInfoWording(message: string, clinic: ClinicConfig) {
  const normalizedMessage = normalizeClinicText(message);
  return CLINIC_INFO_TERMS.test(normalizedMessage) || clinic.branches.some((branch) =>
    [branch.name, branch.city, ...branch.aliases]
      .map(normalizeClinicText)
      .filter(Boolean)
      .some((term) => normalizedMessage.includes(term)),
  );
}

function hasHardDomainWording(message: string, clinic: ClinicConfig) {
  return isPriceInquiry(message) ||
    classifyBookingSpeechAct(message) !== "none" ||
    hasClinicInfoWording(message, clinic) ||
    NON_CONTENT_INTENT_TERMS.test(normalizeClinicText(message)) ||
    isImmediateSafetyBoundaryMessage(message);
}

function unresolvedResidual(
  message: string,
  matchedTerms: readonly string[],
  allowedFillers: readonly string[],
) {
  let residual = normalizeClinicText(message);
  for (const term of unique(matchedTerms).sort((left, right) => right.length - left.length)) {
    residual = residual.split(normalizeClinicText(term)).join("");
  }
  for (const filler of unique(allowedFillers).sort((left, right) => right.length - left.length)) {
    residual = residual.split(normalizeClinicText(filler)).join("");
  }
  residual = residual.replace(/[，。！？?、：:；;（）()「」『』【】]/gu, "");
  residual = residual.replace(/(?:我|想|要|先|是|的|呢|嗎|喔|哦|呀|啊)+/gu, "");
  return residual;
}

function isEntityOnlyMessage(message: string, matchedTerms: readonly string[]) {
  return unresolvedResidual(message, matchedTerms, ENTITY_ONLY_FILLERS).length === 0;
}

function isClearlyTreatmentContentQuestion(
  message: string,
  matchedTerms: readonly string[],
  candidate: SemanticAnchorCandidate | undefined,
) {
  if (!candidate || !CONTENT_QUESTION_ASPECTS.has(candidate.questionAspect ?? "none")) {
    return false;
  }
  if (inferHighTrustQuestionAspect(message, matchedTerms)) return true;
  return unresolvedResidual(message, matchedTerms, CONTENT_QUESTION_FILLERS).length === 0;
}

function hasInterrogativeMorphology(message: string) {
  const normalized = normalizeClinicText(message);
  return /(?:會不會|有沒有|有無|會否|是否|能否|可否|是不是|有什麼|有哪些|什麼|為何|誰家|哪間|哪一個|哪一|哪個|哪家|哪牌|用哪|對嗎|可能|容易)/u.test(normalized) ||
    /([\p{Script=Han}]{1,3})不\1/u.test(normalized) ||
    /(?:嗎|呢)[?？]?$|[?？]$/u.test(normalized);
}

function unresolvedQuestionGrammarResidual(
  message: string,
  matchedTerms: readonly string[],
  allowedFillers: readonly string[],
) {
  const withoutAlternativeMorphology = normalizeClinicText(message)
    .replace(/([\p{Script=Han}]{1,3})不\1/gu, "$1");
  return unresolvedResidual(withoutAlternativeMorphology, matchedTerms, allowedFillers);
}

function isDeterministicSideEffectQuestion(
  message: string,
  matchedTerms: readonly string[],
  additionalFillers: readonly string[] = [],
) {
  const normalized = normalizeClinicText(message);
  const hasAspectLexeme = /(?:副作用|風險|後遺症|安全|危險|傷身)/u.test(normalized);
  const interrogative = hasInterrogativeMorphology(normalized);
  const isScopedTerseAspect = matchedTerms.length > 0 && /(?:副作用|風險|後遺症)$/u.test(normalized);
  if (!hasAspectLexeme || (!interrogative && !isScopedTerseAspect)) return false;
  return unresolvedQuestionGrammarResidual(
    message,
    matchedTerms,
    [...SIDE_EFFECT_QUESTION_FILLERS, ...additionalFillers],
  ).length === 0;
}

function isDeterministicSymptomQuestion(
  message: string,
  matchedTerms: readonly string[],
  additionalFillers: readonly string[] = [],
) {
  const normalized = normalizeClinicText(message);
  if (
    !/(?:發炎|紅腫|紅|腫|疼痛|痛|麻|出血|水泡|不舒服)/u.test(normalized) ||
    !hasInterrogativeMorphology(normalized)
  ) {
    return false;
  }
  return unresolvedQuestionGrammarResidual(
    message,
    matchedTerms,
    [...SYMPTOM_QUESTION_FILLERS, ...additionalFillers],
  ).length === 0;
}

function isDeterministicBrandQuestion(
  message: string,
  matchedTerms: readonly string[],
  additionalFillers: readonly string[] = [],
) {
  const normalized = normalizeClinicText(message);
  const hasNamedBrandHead = /(?:品牌|牌子|廠牌|牌|原廠|廠商|製造商|製造|公司出|哪牌|哪家出)/u.test(normalized);
  const hasDevicePossessorQuestion =
    /(?:誰家|哪間|哪家).{0,3}(?:機器|機台|設備)|(?:機器|機台|設備).{0,3}(?:誰家|哪間|哪家)/u.test(normalized);
  const hasAspectLexeme = hasNamedBrandHead || hasDevicePossessorQuestion;
  if (!hasAspectLexeme || !hasInterrogativeMorphology(normalized)) return false;
  return unresolvedQuestionGrammarResidual(
    message,
    matchedTerms,
    [...BRAND_QUESTION_FILLERS, ...additionalFillers],
  ).length === 0;
}

function isDeterministicProspectiveRiskQuestion(
  message: string,
  matchedTerms: readonly string[],
  additionalFillers: readonly string[] = [],
) {
  const normalized = normalizeClinicText(message);
  const hasProcedureContext = /(?:做|打)(?:完|了之後|完之後)|(?:施作|治療|療程)(?:後|之後)|術後/u.test(normalized);
  const hasRiskSubject = /(?:副作用|風險|後遺症|發炎|紅腫|紅|腫|疼痛|痛|麻|出血|起水泡|不舒服)/u.test(normalized);
  const hasProspectiveForm = hasInterrogativeMorphology(normalized) ||
    /(?:通常|常見|機率|多久|久|幾天|是什麼|有哪些)/u.test(normalized);
  if (!hasProcedureContext || !hasRiskSubject || !hasProspectiveForm) return false;

  return unresolvedQuestionGrammarResidual(
    message,
    matchedTerms,
    // Procedure context and symptom/question morphology are orthogonal
    // components. Reuse the symptom grammar here so `做完紅不紅` and
    // `術後發炎嚴不嚴重` compose like every other A-not-A question rather
    // than requiring procedure-specific sentence variants.
    [...PROSPECTIVE_RISK_FILLERS, ...SYMPTOM_QUESTION_FILLERS, ...additionalFillers],
  ).length === 0;
}

function inferHighTrustQuestionAspect(
  message: string,
  matchedTerms: readonly string[],
  additionalFillers: readonly string[] = [],
): QuestionAspect | undefined {
  if (isDeterministicProspectiveRiskQuestion(message, matchedTerms, additionalFillers)) {
    return "side_effects";
  }
  if (isDeterministicSideEffectQuestion(message, matchedTerms, additionalFillers)) {
    return "side_effects";
  }
  if (isDeterministicSymptomQuestion(message, matchedTerms, additionalFillers)) {
    return "side_effects";
  }
  if (isDeterministicBrandQuestion(message, matchedTerms, additionalFillers)) {
    return "brands";
  }
  return undefined;
}

function inferDeterministicContentQuestionAspect(
  message: string,
  matchedTerms: readonly string[],
  additionalFillers: readonly string[] = [],
): QuestionAspect | undefined {
  const highTrustAspect = inferHighTrustQuestionAspect(message, matchedTerms, additionalFillers);
  if (highTrustAspect) return highTrustAspect;
  if (
    unresolvedResidual(
      message,
      matchedTerms,
      [...CONTENT_QUESTION_FILLERS, ...additionalFillers],
    ).length > 0
  ) {
    return undefined;
  }
  const normalized = normalizeClinicText(message);
  if (/(?:是什麼)/u.test(normalized)) return "overview";
  if (/(?:副作用|風險|安全)/u.test(normalized)) return "side_effects";
  if (/(?:品牌|牌子|廠牌|哪一牌|什麼牌|哪牌)/u.test(normalized)) return "brands";
  if (/(?:恢復|修復|敷麻|會痛|痛嗎|疼痛)/u.test(normalized)) return "comfort_recovery";
  if (/(?:需要幾次|做幾次|幾次)/u.test(normalized)) return "sessions";
  if (/(?:多久)/u.test(normalized)) return "duration";
  if (/(?:原理|機制|怎麼作用|怎麼做)/u.test(normalized)) return "mechanism";
  if (/(?:單做|搭配|一起做|差在哪|差別|有什麼不同)/u.test(normalized)) {
    return "general_difference";
  }
  if (/(?:效果|功效|改善(?:什麼|啥)|適合(?:什麼|哪些部位)|(?:可以|能)打(?:哪裡|哪些部位)|有什麼用|作用|幹嘛)/u.test(normalized)) {
    return "benefits";
  }
  return undefined;
}

function treatmentSupportsConcern(
  clinic: ClinicConfig,
  treatmentKey: string,
  concernKey: string,
) {
  const treatment = clinic.treatmentList.find((item) => item.key === treatmentKey);
  const concern = clinic.concernList.find((item) => item.key === concernKey);
  return Boolean(
    treatment?.consultationGuide?.concernReplies?.some((item) => item.concernKey === concernKey) ||
    concern?.recommendedTreatmentKeys.includes(treatmentKey),
  );
}

function treatmentSupportsArea(
  clinic: ClinicConfig,
  treatmentKey: string,
  areaKey: string,
) {
  return clinic.concernList.some((concern) =>
    concern.areaKeys.includes(areaKey as (typeof concern.areaKeys)[number]) &&
    treatmentSupportsConcern(clinic, treatmentKey, concern.key),
  );
}

function treatmentSupportsExplicitNeeds(
  clinic: ClinicConfig,
  treatmentKey: string,
  concernKeys: readonly string[],
  areaKeys: readonly string[],
) {
  return concernKeys.every((key) => treatmentSupportsConcern(clinic, treatmentKey, key)) &&
    areaKeys.every((key) => treatmentSupportsArea(clinic, treatmentKey, key));
}

function inferredAssetQuestionAspect(asset: TreatmentReplyAsset): QuestionAspect {
  const aspect = asset.aspectKey ?? "";
  if (/(?:comfort|recovery|downtime)/u.test(aspect)) return "comfort_recovery";
  if (/(?:side_effect|risk)/u.test(aspect)) return "side_effects";
  if (/(?:feature|mechanism|cooling|intro)/u.test(aspect)) return "mechanism";
  if (/(?:combination|single)/u.test(aspect)) return "single_vs_combination";
  return "benefits";
}

function assetSupportsQuestionAspect(
  asset: TreatmentReplyAsset,
  candidate: SemanticAnchorCandidate | undefined,
) {
  const questionAspect = candidate?.questionAspect;
  if (!questionAspect || ["none", "overview"].includes(questionAspect)) return true;
  const inferred = inferredAssetQuestionAspect(asset);
  if (inferred === "benefits") return ["benefits", "suitability"].includes(questionAspect);
  if (inferred === "single_vs_combination") {
    return ["single_vs_combination", "combination_reason", "general_difference"].includes(questionAspect);
  }
  return inferred === questionAspect;
}

function resolveApprovedAssetAnchor(
  input: ResolveSemanticAnchorInput,
  explicitTreatmentKeys: readonly string[],
  explicitConcernKeys: readonly string[],
  explicitAreaKeys: readonly string[],
  explicitMatchedTerms: readonly string[],
): TrustedSemanticAnchor | undefined {
  if (
    !["answer_concern", "learn_treatment"].includes(input.state.activeTask.kind) ||
    input.state.bookingTask.status === "collecting"
  ) {
    return undefined;
  }
  const treatmentKeys = activeTreatmentKeys(input.state);
  if (treatmentKeys.length !== 1 || input.state.knowledge.concernKeys.length !== 1) {
    return undefined;
  }
  if (
    explicitTreatmentKeys.length > 1 ||
    (explicitTreatmentKeys.length === 1 && explicitTreatmentKeys[0] !== treatmentKeys[0])
  ) {
    return undefined;
  }

  const treatmentKey = treatmentKeys[0]!;
  const concernKey = input.state.knowledge.concernKeys[0]!;
  if (explicitConcernKeys.length > 0 && !explicitConcernKeys.includes(concernKey)) {
    return undefined;
  }
  if (
    explicitAreaKeys.length > 0 &&
    input.state.knowledge.areaKeys.length > 0 &&
    !explicitAreaKeys.some((key) => input.state.knowledge.areaKeys.includes(key))
  ) {
    return undefined;
  }
  const normalizedMessage = normalizeClinicText(input.message);
  const candidates = buildTreatmentReplyAssets(input.clinic)
    .filter((asset) =>
      ["detail", "quick"].includes(asset.kind) &&
      asset.treatmentKey === treatmentKey &&
      (!asset.concernKey || asset.concernKey === concernKey) &&
      assetSupportsQuestionAspect(asset, input.candidate) &&
      asset.terms.length > 0,
    )
    .flatMap((asset) => {
      const matchedTerms = asset.terms
        .map(normalizeClinicText)
        .filter((term) => term && normalizedMessage.includes(term));
      const score = Math.max(0, ...matchedTerms.map((term) => term.length));
      return score > 0 ? [{ asset, matchedTerms, score }] : [];
    });
  if (candidates.length === 0) return undefined;
  const topScore = Math.max(...candidates.map((candidate) => candidate.score));
  const best = candidates.filter((candidate) => candidate.score === topScore);
  if (best.length !== 1) return undefined;

  const selected = best[0]!;
  const asset = selected.asset;
  if (
    unresolvedResidual(
      input.message,
      [...explicitMatchedTerms, ...selected.matchedTerms],
      APPROVED_ASSET_NEUTRAL_FILLERS,
    ).length > 0
  ) {
    return undefined;
  }
  return {
    areaKeys: unique(input.state.knowledge.areaKeys),
    concernKeys: [concernKey],
    conversationMove: "continue",
    dialogueReference: "active_subject",
    questionAspect: input.candidate?.questionAspect &&
        !["none", "overview"].includes(input.candidate.questionAspect)
      ? input.candidate.questionAspect
      : inferredAssetQuestionAspect(asset),
    replyAssetId: asset.id,
    source: "approved_asset",
    speechAct: "ask_treatment_detail",
    treatmentKeys: [treatmentKey],
  };
}

function resolveActiveSubjectQueryAnchor(
  input: ResolveSemanticAnchorInput,
  explicitTreatmentKeys: readonly string[],
  explicitConcernKeys: readonly string[],
  explicitAreaKeys: readonly string[],
  explicitMatchedTerms: readonly string[],
): TrustedSemanticAnchor | undefined {
  const treatmentKeys = activeTreatmentKeys(input.state);
  if (treatmentKeys.length !== 1 || input.state.bookingTask.status === "collecting") {
    return undefined;
  }
  const treatmentKey = treatmentKeys[0]!;
  if (
    explicitTreatmentKeys.length > 1 ||
    (explicitTreatmentKeys.length === 1 && explicitTreatmentKeys[0] !== treatmentKey) ||
    !treatmentSupportsExplicitNeeds(
      input.clinic,
      treatmentKey,
      explicitConcernKeys,
      explicitAreaKeys,
    )
  ) {
    return undefined;
  }

  const normalizedMessage = normalizeClinicText(input.message);
  const scopedAssetTerms = buildTreatmentReplyAssets(input.clinic)
    .filter((asset) =>
      asset.treatmentKey === treatmentKey &&
      (
        !asset.concernKey ||
        input.state.knowledge.concernKeys.includes(asset.concernKey)
      ),
    )
    .flatMap((asset) => asset.terms)
    .map(normalizeClinicText)
    .filter((term) => term && normalizedMessage.includes(term));
  // An active subject is context, not proof of what the customer asked this
  // turn.  The aspect must therefore be recoverable from the current text;
  // otherwise a low-confidence model label could turn a bare word such as
  // "脂肪" into a brand or side-effect question that was never asked.
  const textQuestionAspect = inferDeterministicContentQuestionAspect(
    input.message,
    [...explicitMatchedTerms, ...scopedAssetTerms],
    APPROVED_ASSET_NEUTRAL_FILLERS,
  );
  const candidateQuestionAspect = input.candidate?.questionAspect &&
      !["none", "overview"].includes(input.candidate.questionAspect)
    ? input.candidate.questionAspect
    : undefined;
  const highTrustQuestionAspect = inferHighTrustQuestionAspect(
    input.message,
    [...explicitMatchedTerms, ...scopedAssetTerms],
    APPROVED_ASSET_NEUTRAL_FILLERS,
  );
  if (
    !textQuestionAspect ||
    (
      !highTrustQuestionAspect &&
      candidateQuestionAspect &&
      candidateQuestionAspect !== textQuestionAspect
    )
  ) {
    return undefined;
  }
  const questionAspect = highTrustQuestionAspect ?? textQuestionAspect;
  if (
    !highTrustQuestionAspect &&
    unresolvedResidual(
      input.message,
      [...explicitMatchedTerms, ...scopedAssetTerms],
      [...CONTENT_QUESTION_FILLERS, ...APPROVED_ASSET_NEUTRAL_FILLERS],
    ).length > 0
  ) {
    return undefined;
  }

  return {
    areaKeys: unique(input.state.knowledge.areaKeys),
    concernKeys: unique(input.state.knowledge.concernKeys),
    conversationMove: "continue",
    dialogueReference: "active_subject",
    questionAspect,
    source: "active_subject_query",
    speechAct: "ask_treatment_detail",
    treatmentKeys: [treatmentKey],
  };
}

/**
 * Produces a narrow, high-trust semantic anchor for treatment-content turns.
 * It never writes customer copy and never decides price, booking, clinic,
 * safety, or handoff actions. The returned structure must still pass through
 * the ordinary V2 adapter, policy, reducer, facts layer, and renderer.
 */
export function resolveTrustedSemanticAnchor(
  input: ResolveSemanticAnchorInput,
): TrustedSemanticAnchor | undefined {
  const scopedMessage = selectIndependentPositiveContentClause(
    input.message,
    input.ontology,
  );
  const scopedInput = scopedMessage === input.message
    ? input
    : { ...input, message: scopedMessage };
  if (
    !isConversationV2AiAssistanceEnabled(input.state.control.mode) ||
    hasHardDomainWording(scopedMessage, input.clinic)
  ) {
    return undefined;
  }

  // Booking collection does not own a richer new question merely because it
  // is waiting for a short field. A deterministic booking answer still wins
  // later in the adapter; this anchor only lets an explicit treatment-content
  // question suspend the draft instead of being flattened into fallback text.

  const ontologyMatch = matchClinicOntology(scopedMessage, input.ontology);
  if (
    ontologyMatch.negated ||
    hasConservativeNegation(scopedMessage) ||
    isHedgedTreatmentReference(scopedMessage)
  ) {
    return undefined;
  }
  const treatmentKeys = unique(ontologyMatch.treatments.map((item) => item.key));
  const concernKeys = unique(ontologyMatch.concerns.map((item) => item.key));
  const areaKeys = unique(ontologyMatch.areas.map((item) => item.key));
  if (treatmentKeys.length > 1 || concernKeys.length > 1 || areaKeys.length > 1) {
    return undefined;
  }

  // A direct request to hear one named treatment again owns the current-text
  // dialogue move even when NLU echoes the old active subject and labels the
  // turn as a continuation. It still passes through policy/state/hydration;
  // this anchor only supplies deterministic current-message semantics.
  if (
    treatmentKeys.length === 1 &&
    concernKeys.length === 0 &&
    areaKeys.length === 0 &&
    isExplicitTreatmentOverviewRestart(scopedMessage)
  ) {
    return {
      areaKeys: [],
      concernKeys: [],
      conversationMove: "start",
      dialogueReference: "explicit",
      questionAspect: "overview",
      source: "exact_ontology",
      speechAct: "learn_treatment",
      treatmentKeys,
    };
  }

  const matchedTerms = [
    ...ontologyMatch.treatments.flatMap((item) => item.matchedTerms),
    ...ontologyMatch.concerns.flatMap((item) => item.matchedTerms),
    ...ontologyMatch.areas.flatMap((item) => item.matchedTerms),
  ];

  const highTrustQuestionAspect = inferHighTrustQuestionAspect(
    scopedMessage,
    matchedTerms,
  );
  // A deterministic, fully grounded question in the current text outranks a
  // stale or incorrect model speech act. Hard domains (price, booking, safety,
  // clinic info and handoff) were already rejected above, so this exception
  // cannot let content routing take ownership of those actions. Bare booking
  // field answers still have no high-trust question aspect and continue through
  // the deterministic booking adapter.
  if (!contentActionAllowed(input.candidate) && !highTrustQuestionAspect) {
    return undefined;
  }
  const deterministicQuestionAspect = input.candidate && !highTrustQuestionAspect
    ? undefined
    : inferDeterministicContentQuestionAspect(scopedMessage, matchedTerms);
  const effectiveCandidate = highTrustQuestionAspect
    ? {
        questionAspect: highTrustQuestionAspect,
        speechAct: "ask_treatment_detail" as const,
      }
    : input.candidate ?? (deterministicQuestionAspect
      ? {
          questionAspect: deterministicQuestionAspect,
          speechAct: "ask_treatment_detail" as const,
        }
      : undefined);
  const effectiveInput = effectiveCandidate === input.candidate
    ? scopedInput
    : { ...scopedInput, candidate: effectiveCandidate };

  const activeCombinationAnchor = resolveActiveCombinationQueryAnchor(
    effectiveInput,
    treatmentKeys,
    concernKeys,
    areaKeys,
    matchedTerms,
  );
  if (activeCombinationAnchor) return activeCombinationAnchor;

  const approvedAssetAnchor = resolveApprovedAssetAnchor(
    effectiveInput,
    treatmentKeys,
    concernKeys,
    areaKeys,
    matchedTerms,
  );
  if (approvedAssetAnchor) return approvedAssetAnchor;

  const activeSubjectQueryAnchor = resolveActiveSubjectQueryAnchor(
    effectiveInput,
    treatmentKeys,
    concernKeys,
    areaKeys,
    matchedTerms,
  );
  if (activeSubjectQueryAnchor) return activeSubjectQueryAnchor;

  // With no NLU frame, a short canonical entity and a fully consumed, explicit
  // treatment-content question are safe deterministic continuations. Price,
  // booking, clinic, safety and comparison residue were rejected above; any
  // remaining free text still fails closed instead of guessing an intent.
  if (
    !input.candidate &&
    !isEntityOnlyMessage(scopedMessage, matchedTerms) &&
    !deterministicQuestionAspect
  ) {
    return undefined;
  }

  const hasExplicitTreatment = treatmentKeys.length === 1;
  if (
    treatmentKeys.length + concernKeys.length + areaKeys.length === 0 ||
    (!hasExplicitTreatment && !isEntityOnlyMessage(scopedMessage, matchedTerms)) ||
    (
      hasExplicitTreatment &&
      !isEntityOnlyMessage(scopedMessage, matchedTerms) &&
      !isClearlyTreatmentContentQuestion(scopedMessage, matchedTerms, effectiveCandidate)
    )
  ) {
    return undefined;
  }

  const activeTreatments = activeTreatmentKeys(input.state);
  const prospectiveOwner = treatmentKeys.length === 1
    ? treatmentKeys[0]
    : activeTreatments.length === 1
      ? activeTreatments[0]
      : undefined;
  const hasExplicitNeeds = concernKeys.length + areaKeys.length > 0;
  const ownerSupportsExplicitNeeds = !prospectiveOwner || !hasExplicitNeeds ||
    treatmentSupportsExplicitNeeds(input.clinic, prospectiveOwner, concernKeys, areaKeys);
  if (treatmentKeys.length === 1 && !ownerSupportsExplicitNeeds) {
    return undefined;
  }
  const detachUnsupportedActiveTreatment =
    treatmentKeys.length === 0 &&
    activeTreatments.length === 1 &&
    hasExplicitNeeds &&
    !ownerSupportsExplicitNeeds;
  const contextualTreatmentKeys = treatmentKeys.length > 0
    ? treatmentKeys
    : hasExplicitNeeds && activeTreatments.length === 1 && !detachUnsupportedActiveTreatment
      ? activeTreatments
      : [];
  const continuesActiveSubject =
    activeTreatments.length === 1 &&
    contextualTreatmentKeys.length === 1 &&
    contextualTreatmentKeys[0] === activeTreatments[0];
  const isConcernTurn = concernKeys.length + areaKeys.length > 0;
  const anchoredSpeechAct = isConcernTurn
    ? "ask_concern" as const
    : effectiveCandidate?.speechAct === "ask_treatment_detail"
      ? "ask_treatment_detail" as const
      : effectiveCandidate?.speechAct === "ask_concern"
        ? "ask_concern" as const
        : "learn_treatment" as const;

  return {
    areaKeys,
    concernKeys,
    conversationMove: continuesActiveSubject ? "continue" : "start",
    dialogueReference: treatmentKeys.length === 0 && continuesActiveSubject
      ? "active_subject"
      : "explicit",
    questionAspect: effectiveCandidate?.questionAspect && effectiveCandidate.questionAspect !== "none"
      ? effectiveCandidate.questionAspect
      : "overview",
    source: "exact_ontology",
    speechAct: anchoredSpeechAct,
    treatmentKeys: contextualTreatmentKeys,
  };
}
