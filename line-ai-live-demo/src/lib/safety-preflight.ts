import { clinicConfig } from "@/lib/clinic-config";
import { getHumanSupportStatus } from "@/lib/human-support";

export type DeterministicPreflightDecision = {
  decisionType: "clinic_info_reply" | "handoff_pending" | "medical_guidance_reply";
  matchedKey: string;
  matchedType: "guided_reply" | "handoff_rule";
  replyText: string;
};

const POST_PROCEDURE_CONTEXT_TERMS = ["打完", "做完", "術後", "剛做", "剛打", "昨天打", "前天打", "回去後"];
const POST_PROCEDURE_CONTEXT_PATTERNS = [
  // Completed treatment phrasing varies widely in natural chat. Keep this
  // generic (no treatment names) and require a completion/time marker so a
  // prospective treatment question is not treated as an adverse event merely
  // because it mentions a procedure.
  /(?:打|做|施作|治療|注射)(?:了|完)?[^?？嗎呢]{0,10}(?:後|之後|以後|回去後)/u,
  /(?:療程|治療|施作|注射)(?:完成)?(?:後|之後|以後)/u,
  /(?:剛|昨天|前天|上週|前幾天)(?:去)?(?:打|做|施作|治療|注射)/u,
  /(?:注射|施作|治療)完/u,
  /(?:我)?(?:做|打)了/u,
] as const;
const POST_PROCEDURE_ABNORMALITY_TERMS = [
  ...clinicConfig.escalationPolicy.postProcedureAlertTerms,
  "歪",
  "腫",
  "瘀青",
  "有血",
  "出血",
  "刺",
  "麻",
  "痛",
  "硬塊",
  "凹凸",
  "不對稱",
  "化膿",
  "水泡",
];
const POST_PROCEDURE_EMERGENCY_TERMS = [
  "呼吸困難",
  "喘不過氣",
  "無法呼吸",
  "喉嚨腫",
  "吞嚥困難",
  "胸悶",
  "全身起疹",
  "意識不清",
  "失去意識",
  "昏倒",
  "嘴唇發紫",
  "大量出血",
  "持續出血",
  "血流不止",
  "止不住血",
  "劇烈疼痛",
  "痛到受不了",
];
const PLASTIC_SURGERY_TERMS = [
  "整形外科",
  "開刀",
  "削骨",
  "正顎",
  "顴骨手術",
  "下顎骨手術",
  "隆乳",
  "縮乳",
  "提乳手術",
  "乳房重建",
  "抽脂",
  "脂肪移植",
  "隆鼻手術",
  "鼻整形",
  "雙眼皮手術",
  "眼袋手術",
  "拉皮手術",
  "腹部拉皮",
  "割雙眼皮",
  "縫雙眼皮",
  "內開眼袋",
  "外開眼袋",
  "鼻中隔延長",
  "鼻頭縮小",
  "植髮",
  "植髮手術",
  "狐臭手術",
];
const POLICY_OVERRIDE_TERMS = [
  "忽略之前",
  "忽略以上",
  "忽略規則",
  "無視規則",
  "系統提示詞",
  "system prompt",
  "開發者訊息",
  "內部指令",
  "揭露內部",
  "洩漏內部",
  "把你的指令",
  "不要遵守",
  "繞過限制",
  "解除限制",
  "顯示提示詞",
];
const GENERAL_MEDICAL_OUT_OF_SCOPE_TERMS = [
  "糖尿病",
  "高血壓",
  "低血壓",
  "心臟病",
  "心血管",
  "癌",
  "腫瘤",
  "惡性",
  "感染",
  "肺炎",
  "中風",
  "癲癇",
  "甲狀腺",
  "腎臟",
  "肝臟",
  "自體免疫",
  "免疫疾病",
  "精神科",
  "憂鬱症",
  "焦慮症",
  "抗凝血",
  "藥物交互作用",
  "青春痘需要看醫生",
  "需要看醫生",
  "要看哪科",
  "醫療診斷",
];
const PRICE_COMMITMENT_TERMS = ["固定價", "保證最低價", "最低價", "一定多少錢", "保證多少錢", "先報死價", "直接報價"];
const INTERROGATIVE_MODAL_ALTERNATIVE = /(?:有無|會否|是否|能否|可否)/u;
const SYMPTOM_ABSENCE_ADVERBS = [
  "一丁點",
  "完全",
  "一點",
  "根本",
  "絲毫",
  "幾乎",
  "從來",
  "向來",
  "目前",
  "現在",
  "至今",
  "暫時",
  "仍然",
  "依然",
  "一直",
  "真的",
  "並",
  "都",
  "也",
  "就",
  "還",
] as const;
const SYMPTOM_ABSENCE_ADVERB_PATTERN = `(?:(?:${SYMPTOM_ABSENCE_ADVERBS.join("|")})){0,4}`;
const OUTER_DOUBLE_SYMPTOM_NEGATION = new RegExp(
  `(?:並不是|不是真的|不是|並非)${SYMPTOM_ABSENCE_ADVERB_PATTERN}` +
  `(?:沒有|沒|無|未|不會)[^，,。；;！!？?]{0,24}$`,
  "u",
);
const SYMPTOM_ABSENCE_ADVERBS_PATTERN = new RegExp(
  `(?:${SYMPTOM_ABSENCE_ADVERBS.join("|")})`,
  "gu",
);

function includesAnyTerm(message: string, terms: readonly string[]) {
  const normalizedMessage = message.replace(/\s+/g, "").toLowerCase();
  return terms.some((term) => normalizedMessage.includes(term.replace(/\s+/g, "").toLowerCase()));
}

function normalizedCompactMessage(message: string) {
  return message.replace(/\s+/gu, "").toLowerCase();
}

function postProcedureContextIndices(message: string) {
  const indices: number[] = [];
  for (const term of POST_PROCEDURE_CONTEXT_TERMS) {
    const normalizedTerm = normalizedCompactMessage(term);
    let from = 0;
    while (from <= message.length) {
      const index = message.indexOf(normalizedTerm, from);
      if (index < 0) break;
      indices.push(index);
      from = index + Math.max(normalizedTerm.length, 1);
    }
  }
  for (const pattern of POST_PROCEDURE_CONTEXT_PATTERNS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    for (const match of message.matchAll(globalPattern)) {
      if (match.index !== undefined) indices.push(match.index);
    }
  }
  return Array.from(new Set(indices)).sort((left, right) => left - right);
}

function isGeneralSideEffectEducationQuestion(message: string) {
  const normalized = normalizedCompactMessage(message);
  if (!/(?:副作用|風險|後遺症)/u.test(normalized)) return false;
  return (
    /(?:副作用|風險|後遺症)(?:是什麼|有哪些|有什麼|常見嗎|會不會有|會有嗎|多久|嗎|呢)[?？]?$/u.test(normalized) ||
    /(?:會不會有|會有什麼|有沒有|有什麼|有哪些|可能有什麼).{0,8}(?:副作用|風險|後遺症)[?？]?$/u.test(normalized)
  );
}

function hasExplicitSymptomNegation(prefix: string) {
  if (OUTER_DOUBLE_SYMPTOM_NEGATION.test(prefix)) return false;
  const match = prefix.match(
    /(?:(?:完全|並|還|尚|一點都)?(?:沒有|沒|無|未|不會)|(?:完全|一點都)不)([^，,。；;！!？?]{0,24})$/u,
  );
  if (!match) return false;
  const beforeMatch = prefix.slice(0, match.index ?? 0);
  // Double negation such as `不是沒有紅腫` is not evidence that the symptom
  // is absent. Likewise, `沒有停止出血` and `不斷出血` describe persistence,
  // not absence.
  if (/(?:不是|並非|不是真的|會|有)$/u.test(beforeMatch)) return false;
  return !/(?:不斷|不停|停止|減少|改善|消退|加劇|惡化|越來越|更嚴重|正常)/u.test(match[0]);
}

function hasExplicitSymptomPostfixNegation(prefix: string, suffix: string) {
  const absence = suffix.match(/^(?<before>\p{Script=Han}{0,12}?)(?:沒有|沒|無|未)(?<tail>.*)$/u);
  if (!absence) return false;
  const before = absence.groups?.before ?? "";
  const tail = absence.groups?.tail ?? "";
  // Double negation remains an actual symptom even when degree/time adverbs
  // appear between the two negators (`並非根本沒有`, `不是從來都沒有`).
  if (/(?:不是|並非|不是真的)/u.test(before)) return false;
  const adverbRemainder = before.replace(
    SYMPTOM_ABSENCE_ADVERBS_PATTERN,
    "",
  );
  if (adverbRemainder) return false;
  // Only a sentence-final absence marker proves absence. Any lexical tail
  // (`沒有減輕`, `沒有好轉`, `沒有停止`) describes an ongoing symptom and
  // must be escalated without maintaining an open-ended recovery-verb list.
  if (!/^(?:了|過|而已|喔|哦|啦|呢|欸|啊|呀|唷)*[，,。；;！!？?]*$/u.test(tail)) return false;
  return !/(?:不是|並非|不是真的)[^，,。；;！!？?]{0,16}$/u.test(prefix);
}

function isProspectivePreventionGoal(suffix: string) {
  return /^(?:我)?(?:能否|可否|能不能|可不可以|是否能|會否|可以|要|該|能|希望)?(?:要怎麼|怎麼|如何)?(?:避免|預防|減少|降低|防止)(?:嗎|呢)?[！!？?]*$/u.test(suffix);
}

function isProspectivePreventionBeforeSymptom(prefix: string) {
  return /(?:我)?(?:希望(?:能)?(?:不要|別|不會)|(?:該|能|可以)?(?:要怎麼|怎麼|如何)(?:避免|預防|減少|降低|防止))$/u.test(prefix);
}

function isProspectivePostProcedureRiskQuestion(message: string) {
  const normalized = normalizedCompactMessage(message);
  const concreteAbnormalities = POST_PROCEDURE_ABNORMALITY_TERMS
    .filter((term) => term !== "副作用")
    .map((term) => normalizedCompactMessage(term))
    .sort((left, right) => right.length - left.length);

  // Parse natural chat one clause at a time. Completion context carries
  // forward, but prospective wording in an earlier clause must not mask a
  // later actual symptom (and a time word such as "今天" must not make a
  // question like "今天想問會不會腫" look like an occurrence).
  const clauses = normalized
    .replace(/(但是|但|可是|不過|然而|然後|結果|後來|而且|卻)/gu, "。$1")
    .match(/[^，,。；;！!？?]+[！!？?]?/gu) ?? [];
  let completedProcedureSeen = false;

  for (const clause of clauses) {
    const completedBeforeClause = completedProcedureSeen;
    const contextIndices = postProcedureContextIndices(clause);
    const rawSymptomMatches = concreteAbnormalities
      .flatMap((term) => {
        const matches: Array<{ term: string; index: number }> = [];
        let from = 0;
        while (from <= clause.length) {
          const index = clause.indexOf(term, from);
          if (index < 0) break;
          matches.push({ term, index });
          from = index + Math.max(term.length, 1);
        }
        return matches;
      });
    const symptomMatches = rawSymptomMatches
      .filter((match) => !rawSymptomMatches.some((other) =>
        other.term.length > match.term.length &&
        other.index <= match.index &&
        other.index + other.term.length >= match.index + match.term.length,
      ))
      .sort((left, right) => left.index - right.index || right.term.length - left.term.length);
    for (const { term, index } of symptomMatches) {
      const latestLocalContext = contextIndices
        .filter((contextIndex) => contextIndex <= index)
        .at(-1);
      if (!completedBeforeClause && latestLocalContext === undefined) continue;

      // Reset the semantic window at the latest completed-procedure marker.
      // This lets a later actual report win in a run-on sentence such as
      // "先問會不會腫做完後真的腫了" without letting the first hypothetical
      // occurrence leak into the second one.
      const hasEarlierSymptomBeforeContext = latestLocalContext !== undefined &&
        symptomMatches.some((match) => match.index < latestLocalContext);
      const contextStart = hasEarlierSymptomBeforeContext
        ? latestLocalContext
        : 0;
      const contextWindow = clause.slice(contextStart, index);
      const outerDoubleNegationBeforeSymptom = OUTER_DOUBLE_SYMPTOM_NEGATION.test(contextWindow);
      const actualResetMatches = Array.from(
        contextWindow.matchAll(/(?:我)?(?:現在|目前|已經|已|其實|當下(?:就)?|真的|開始|突然|越來越|還在|仍然|變得|變成)/gu),
      );
      const latestActualReset = actualResetMatches.at(-1)?.index;
      const resetStart = latestActualReset === undefined
        ? contextStart
        : contextStart + latestActualReset;
      const previousSymptomEnd = symptomMatches
        .filter((match) => match.index < index)
        .map((match) => match.index + match.term.length)
        .at(-1);
      const localStart = Math.max(resetStart, previousSymptomEnd ?? contextStart);
      const beforeSymptom = clause.slice(localStart, index);
      const afterSymptom = clause.slice(index + term.length);
      const symptomIsExplicitlyNegated = !outerDoubleNegationBeforeSymptom && (
        hasExplicitSymptomNegation(beforeSymptom) ||
        hasExplicitSymptomPostfixNegation(beforeSymptom, afterSymptom) ||
        /(?:沒事|沒有不適)/u.test(clause.slice(localStart))
      );
      if (symptomIsExplicitlyNegated) continue;

      const prospectiveBeforeSymptom = /(?:如果|假如|會不會|是不是|有沒有|可能|容易不容易|腫不腫|痛不痛|麻不麻|紅不紅|出不出血|舒服不舒服|起不起水泡)/u.test(beforeSymptom) ||
        INTERROGATIVE_MODAL_ALTERNATIVE.test(beforeSymptom) ||
        isProspectivePreventionBeforeSymptom(beforeSymptom);
      const alternativeMatches = Array.from(
        clause.matchAll(/([\p{Script=Han}]{1,3})不\1/gu),
      );
      const prospectiveAlternativeForm = INTERROGATIVE_MODAL_ALTERNATIVE.test(beforeSymptom) ||
        /與否/u.test(beforeSymptom) ||
        /^與否/u.test(afterSymptom) ||
        alternativeMatches.some((match) => {
          const matchIndex = match.index ?? -1;
          const matchEnd = matchIndex + match[0].length;
          return matchIndex <= index &&
            (matchIndex >= localStart || matchEnd >= index + term.length);
        });
      const prospectiveRiskMeasure = /(?:多久|久不久|幾天|幾週|幾個月|多長時間|多長|機率|機會|可能性|風險|常見|嚴重|程度)/u.test(afterSymptom);
      const prospectivePreventionGoal = isProspectivePreventionGoal(afterSymptom);
      const prospectiveOccurrenceQuestion = /^(?:到底|究竟)?(?:會不會|是否會|會否)(?:發生|出現)(?:嗎|呢)?[！!？?]*$/u.test(afterSymptom);
      // A bare symptom followed by a management question is still an actual
      // symptom report. Only a question marker attached directly to the
      // symptom (for example `腫嗎`) makes the symptom itself the operand of
      // the question. Do not let a question mark at the end of a longer
      // management request retroactively make the whole clause prospective.
      const simpleQuestion = /^(?:(?:嗎|呢)[！!？?]*|[！!？?]+)$/u.test(afterSymptom);
      const followupAlternativeForm = /^(?:了|中|著)?[^，,。；;！!？?]{0,4}([\p{Script=Han}]{1,3})不\1/u.test(afterSymptom);
      const occurrenceSuffix = /^(?:了|中|著)/u.test(afterSymptom);
      const explicitOccurrence = /(?:現在|目前|已經|已|其實|當下|當下就|一直|持續|開始|突然|越來越|還在|仍然|很|變|變得|有|真的)$/u.test(beforeSymptom);

      if (occurrenceSuffix) {
        return false;
      }

      if (prospectivePreventionGoal && !explicitOccurrence) {
        continue;
      }

      if (prospectiveOccurrenceQuestion && !explicitOccurrence) {
        continue;
      }

      if (
        followupAlternativeForm && !prospectiveRiskMeasure &&
        !prospectiveBeforeSymptom
      ) {
        return false;
      }
      if (explicitOccurrence && !prospectiveBeforeSymptom && !prospectiveAlternativeForm && !simpleQuestion) {
        return false;
      }
      if (prospectiveBeforeSymptom || prospectiveAlternativeForm || prospectiveRiskMeasure || simpleQuestion) {
        continue;
      }

      // A bare symptom statement after a completed procedure is actual. Keep
      // the conservative fail-safe used by existing production behavior:
      // "我打完肉毒會麻" without a question is treated as a symptom report,
      // while "我打完肉毒會麻嗎" remains prospective education.
      return false;
    }

    if (contextIndices.length > 0) completedProcedureSeen = true;
  }

  return true;
}

function hasContraindicationOrMedicalHistorySignal(message: string) {
  if (/(?:懷孕|孕婦|孕期|有孕|哺乳|餵奶|親餵|母乳|備孕|準備懷孕|想懷孕|試管)/u.test(message)) {
    return false;
  }
  const normalizedMessage = message.replace(/\s+/g, "").toLowerCase();
  return (
    /我有.{1,30}(?:可以|可不可以|能不能|能否|適不適合)/u.test(normalizedMessage) ||
    /我在(?:吃|服用)|我正在用/u.test(normalizedMessage) ||
    /(?:我有)?.{0,30}病史/u.test(normalizedMessage) ||
    /開過刀|動過手術/u.test(normalizedMessage) ||
    /我對.{1,30}過敏/u.test(normalizedMessage)
  );
}

export function buildHumanHandoffReply(extraGuidance: string | null, now: Date) {
  const supportStatus = getHumanSupportStatus(now);
  const baseReply = supportStatus.inServiceHours
    ? "我先幫您整理需求，真人客服會接續協助。"
    : "我會先幫您整理需求，待真人客服上班後接續協助。";
  const guidance = extraGuidance ?? "這個問題需要由真人客服進一步確認。";
  return `${guidance}\n${baseReply}\n${clinicConfig.humanSupportHours.fallbackSummary}`;
}

export function isPostProcedureEmergency(message: string) {
  return includesAnyTerm(message, POST_PROCEDURE_EMERGENCY_TERMS);
}

export function hasPostProcedureContext(message: string) {
  const normalized = normalizedCompactMessage(message);
  return includesAnyTerm(normalized, POST_PROCEDURE_CONTEXT_TERMS) ||
    POST_PROCEDURE_CONTEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function hasPostProcedureAbnormality(message: string) {
  return includesAnyTerm(message, POST_PROCEDURE_ABNORMALITY_TERMS);
}

export function isPostProcedureIssue(message: string) {
  if (!hasPostProcedureContext(message) || !hasPostProcedureAbnormality(message)) return false;

  // "副作用是什麼" (including a prospective "打完會有什麼副作用") is
  // treatment education, not evidence that the customer has already developed
  // an abnormal reaction. A concrete symptom such as redness, inflammation or
  // discomfort still wins unless the sentence is clearly asking about a future
  // possibility rather than reporting a symptom that already occurred.
  const concreteAbnormalities = POST_PROCEDURE_ABNORMALITY_TERMS.filter(
    (term) => term !== "副作用",
  );
  const hasConcreteAbnormality = includesAnyTerm(message, concreteAbnormalities);
  if (hasConcreteAbnormality) {
    return !isProspectivePostProcedureRiskQuestion(message);
  }
  if (isGeneralSideEffectEducationQuestion(message)) {
    return false;
  }
  return true;
}

export function isPlasticSurgeryRequest(message: string) {
  return includesAnyTerm(message, PLASTIC_SURGERY_TERMS);
}

export function isPolicyOverrideAttempt(message: string) {
  return includesAnyTerm(message, POLICY_OVERRIDE_TERMS);
}

export function isGeneralMedicalOutOfScope(message: string) {
  return includesAnyTerm(message, GENERAL_MEDICAL_OUT_OF_SCOPE_TERMS);
}

export function isPriceCommitmentRequest(message: string) {
  return includesAnyTerm(message, PRICE_COMMITMENT_TERMS);
}

function isCustomerAccountLookupRequest(message: string) {
  const normalized = message.replace(/\s+/gu, "");
  if (/(?:會員|帳號|我的資料|個資|既有紀錄|預約紀錄|療程紀錄)/u.test(normalized)) {
    return /(?:查|查詢|查看|確認|核對|調閱|紀錄|記錄|資料|是什麼|有哪些)/u.test(normalized);
  }
  return (
    /(?:查|查詢|查看|確認|核對|調閱).{0,16}(?:姓名|電話|手機|號碼|資料|紀錄|記錄)/u.test(normalized) ||
    /(?:姓名|電話|手機|號碼).{0,16}(?:是誰|哪位|哪個人|哪個客人|對應|資料|紀錄|記錄|是什麼|哪一個)/u.test(normalized) ||
    /(?:誰|哪位|哪個人|哪個客人).{0,16}(?:姓名|電話|手機|號碼|資料|紀錄|記錄)/u.test(normalized) ||
    /之前.{0,16}(?:留|提供|填).{0,8}(?:姓名|電話|手機|號碼)/u.test(normalized)
  );
}

export function runImmediateSafetyPreflight(input: {
  message: string;
  now: Date;
  skipCustomerAccountLookup?: boolean;
}): DeterministicPreflightDecision | null {
  const { message, now, skipCustomerAccountLookup = false } = input;
  if (isPostProcedureEmergency(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "post_procedure_emergency",
      matchedType: "handoff_rule",
      replyText: "若有呼吸困難、意識異常、大量或持續出血等緊急症狀，請立即撥打 119 或前往急診，不要等待線上回覆；安全後再聯絡診所。",
    };
  }
  if (isPolicyOverrideAttempt(message)) {
    return {
      decisionType: "clinic_info_reply",
      matchedKey: "policy_override_attempt",
      matchedType: "guided_reply",
      replyText: "我無法變更或揭露內部規則，只能協助診所療程與預約相關問題。請問想了解哪項微整療程？",
    };
  }
  if (isPlasticSurgeryRequest(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "plastic_surgery_scope",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply(
        "整形外科涉及手術評估，AI 暫不提供自由解說，也可預約現場由醫師評估。",
        now,
      ),
    };
  }
  if (isPostProcedureIssue(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "post_procedure_issue",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply(
        "這類術後反應需要真人確認，請直接撥打診所電話聯繫；若症狀快速惡化，請立即就醫。",
        now,
      ),
    };
  }
  if (includesAnyTerm(message, clinicConfig.escalationPolicy.seriousComplaintTerms)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "serious_complaint",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("我先幫您記錄這次狀況與訴求。", now),
    };
  }
  if (isPriceCommitmentRequest(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "price_commitment_request",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("價格承諾這類問題需要由真人客服進一步確認，我先幫您整理想了解的療程與館別。", now),
    };
  }
  if (includesAnyTerm(message, clinicConfig.escalationPolicy.humanRequestTerms)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "human_request",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("沒問題，我先幫您整理目前需求。", now),
    };
  }
  if (hasContraindicationOrMedicalHistorySignal(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "contraindication_or_medical_history",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("這類涉及既往病史、用藥或過敏狀況，需要由真人客服與醫師進一步確認。", now),
    };
  }
  if (isGeneralMedicalOutOfScope(message)) {
    return {
      decisionType: "medical_guidance_reply",
      matchedKey: "general_medical_out_of_scope",
      matchedType: "guided_reply",
      replyText: "這屬於一般醫療問題，不在微整衛教範圍內；請直接諮詢合適科別的醫師，AI 不會自行判斷。",
    };
  }
  if (!skipCustomerAccountLookup && isCustomerAccountLookupRequest(message)) {
    return {
      decisionType: "handoff_pending",
      matchedKey: "customer_account_lookup",
      matchedType: "handoff_rule",
      replyText: buildHumanHandoffReply("這類涉及個人資料或既有紀錄查詢，我先幫您記下需求。", now),
    };
  }
  return null;
}

export function isImmediateSafetyBoundaryMessage(message: string) {
  return Boolean(runImmediateSafetyPreflight({ message, now: new Date(0) }));
}
