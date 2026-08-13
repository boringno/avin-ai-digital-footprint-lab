import { clinicConfig, normalizeClinicText } from "@/lib/clinic-config";

export type BrandComparisonAspect =
  | "overall"
  | "effect"
  | "duration"
  | "onset"
  | "suitability"
  | "safety";

export type TreatmentFollowupIntent = {
  aspect: BrandComparisonAspect;
  kind: "brand_overview" | "brand_comparison";
  source: "explicit" | "elliptical";
};

export type TreatmentFollowupHistory = {
  awaiting?: {
    kind?: string;
    questionSummary?: string;
  };
  previousMatchedKey?: string;
};

const BRAND_WORD_PATTERN = /(?:品牌|牌子|廠牌)/u;
const BRAND_COMPARISON_PATTERN = /(?:差在哪|差別|差異|不同|比較|哪個(?:比較)?好|怎麼選|有什麼差)/u;
const BRAND_QUESTION_PATTERN = /(?:哪些|哪個|哪款|什麼|有什麼|有沒有|使用|提供|效果|維持|持久|起效|見效|適合|部位|安全|副作用|差|比較)/u;
const BRAND_OVERVIEW_PATTERN = /(?:有什麼|有哪些|哪些|提供哪些|使用哪些|使用什麼|用什麼|用哪個|是哪個).*(?:品牌|牌子|廠牌)|(?:品牌|牌子|廠牌).*(?:有什麼|有哪些|哪些|提供哪些|使用什麼|用什麼|用哪個)/u;

const ELLIPTICAL_COMPARISON_PATTERN = /(?:差在哪(?:裡)?|差別|差異|不同|各(?:自)?(?:的|有什麼)?(?:特色|優點|優勢|強項)|(?:特色|優點|優勢|強項)有什麼不同|效果(?:上)?呢|效果如何|哪(?:一種|個)效果比較好|哪(?:一種|個)比較(?:好|自然|柔和|適合)|維持(?:時間)?呢|持久(?:度)?(?:有差|嗎|呢)|哪(?:一種|個)比較(?:持久|久)|哪(?:一種|個).{0,6}維持.{0,4}(?:久|比較久)|起效(?:速度)?呢|見效呢|適合(?:部位)?呢|部位有差|安全性呢|副作用呢|怎麼選)/u;

const KNOWN_BRAND_TOKENS = Array.from(
  new Set(
    clinicConfig.treatmentList.flatMap((treatment) =>
      (treatment.availableBrands ?? []).flatMap((brand) => [
        brand,
        ...brand.split(/[\s/／、,，()（）]+/u),
      ]),
    ),
  ),
)
  .map(normalizeClinicText)
  .filter((token) => token.length >= 3);

function mentionsKnownBrand(normalizedMessage: string) {
  return KNOWN_BRAND_TOKENS.some((token) => normalizedMessage.includes(token));
}

function inferBrandComparisonAspect(normalizedMessage: string): BrandComparisonAspect {
  if (/(?:維持|持久|多久)/u.test(normalizedMessage)) return "duration";
  if (/(?:起效|見效|生效|有感)/u.test(normalizedMessage)) return "onset";
  if (/(?:安全|副作用|風險)/u.test(normalizedMessage)) return "safety";
  if (/(?:適合|部位|怎麼選|選哪)/u.test(normalizedMessage)) return "suitability";
  if (/(?:效果|作用|效能|自然|柔和|特色|優點|優勢|強項)/u.test(normalizedMessage)) return "effect";
  return "overall";
}

function hasBrandTaskContinuity(history: TreatmentFollowupHistory) {
  const previousMatchedKey = history.previousMatchedKey?.trim() ?? "";
  if (/^treatment_brand(?::|_comparison:)/u.test(previousMatchedKey)) {
    return true;
  }

  const questionSummary = normalizeClinicText(history.awaiting?.questionSummary ?? "");
  return (
    BRAND_WORD_PATTERN.test(questionSummary) &&
    /(?:比較|差別|差異|不同|效果|維持|持久|起效|見效|適合|安全|想了解|哪個)/u.test(questionSummary)
  );
}

/**
 * Identifies the brand-comparison subtask without treating every short
 * "效果呢" follow-up as a brand question. Explicit brand wording can open the
 * task; elliptical wording may only continue a persisted brand matchedKey or
 * an awaiting question that explicitly mentions brand comparison.
 */
export function parseTreatmentFollowupIntent(
  message: string,
  history: TreatmentFollowupHistory = {},
): TreatmentFollowupIntent | null {
  const normalizedMessage = normalizeClinicText(message);
  if (!normalizedMessage) return null;

  const explicitBrandReference = BRAND_WORD_PATTERN.test(normalizedMessage) || mentionsKnownBrand(normalizedMessage);
  if (explicitBrandReference && BRAND_QUESTION_PATTERN.test(normalizedMessage)) {
    const isComparison =
      BRAND_COMPARISON_PATTERN.test(normalizedMessage) ||
      mentionsKnownBrand(normalizedMessage) && /(?:效果|維持|持久|起效|見效|適合|安全|副作用)/u.test(normalizedMessage);
    return {
      aspect: inferBrandComparisonAspect(normalizedMessage),
      kind: isComparison || !BRAND_OVERVIEW_PATTERN.test(normalizedMessage)
        ? "brand_comparison"
        : "brand_overview",
      source: "explicit",
    };
  }

  if (hasBrandTaskContinuity(history) && ELLIPTICAL_COMPARISON_PATTERN.test(normalizedMessage)) {
    return {
      aspect: inferBrandComparisonAspect(normalizedMessage),
      kind: "brand_comparison",
      source: "elliptical",
    };
  }

  return null;
}
