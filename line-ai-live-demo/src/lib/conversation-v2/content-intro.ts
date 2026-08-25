const CONTENT_INTRO_LEADS = ["只想要", "只想", "想要", "想", "要"] as const;
const CONTENT_INTRO_VERBS = ["了解", "問", "知道", "諮詢", "看看", "介紹", "說明", "認識"] as const;
const CONTENT_INTRO_PATTERN = `(?:${CONTENT_INTRO_LEADS.join("|")})(?:先)?(?:${CONTENT_INTRO_VERBS.join("|")})`;
const ADDITIVE_CONTENT_PREFIX = "(?:另外|此外|同時|順便|也|還)";
const LEADING_CONTENT_INTRO = new RegExp(
  `^(?:我)?(?:(?:${ADDITIVE_CONTENT_PREFIX})?${CONTENT_INTRO_PATTERN}|` +
    `${ADDITIVE_CONTENT_PREFIX}(?:先)?(?:${CONTENT_INTRO_VERBS.join("|")}))`,
  "u",
);
const NEGATED_CONTENT_INTRO_PREFIX = /(?:(?:並)?不|不是|沒有|沒|無|並非)(?:太|很|真的|特別|那麼)?$/u;
const NEGATIVE_INTENT_NEGATORS = [
  "並不是",
  "並沒有",
  "並非",
  "並無",
  "不是",
  "沒有",
  "沒",
  "無",
] as const;
const NEGATIVE_INTENT_NOUNS = [
  "興趣",
  "意願",
  "意圖",
  "打算",
  "想法",
  "需求",
  "念頭",
  "意",
] as const;
const NEGATIVE_INTENT_BRIDGES = ["進一步", "繼續", "再", "去", "來"] as const;
// A customer can freely modify an intent noun (`沒有太大的興趣`,
// `並沒有多少的意願`, `沒有這方面的需求`). The polarity belongs to the
// nominal head, not to a fixed modifier vocabulary. Keep the span bounded so
// an earlier negative/meta statement cannot reach across an omitted clause
// boundary and capture a later, independent request.
const NEGATIVE_INTENT_BOUNDED_MODIFIER = String.raw`\p{Script=Han}{0,8}?`;
const NEGATIVE_INTENT_NOMINAL_COMPLEMENT = new RegExp(
  `(?:${NEGATIVE_INTENT_NEGATORS.join("|")})(?:有)?` +
  NEGATIVE_INTENT_BOUNDED_MODIFIER +
  `(?:${NEGATIVE_INTENT_NOUNS.join("|")})` +
  `(?:(?:${NEGATIVE_INTENT_BRIDGES.join("|")}))?$`,
  "u",
);

function compactIntroText(message: string) {
  return message.normalize("NFKC").replace(/\s+/gu, "").trim();
}

/** Matches the bounded language family that starts an independent content request. */
export function matchPositiveContentIntros(message: string) {
  return message.matchAll(new RegExp(CONTENT_INTRO_PATTERN, "gu"));
}

/** Canonicalizes equivalent intros so downstream residual checks share one filler. */
export function normalizeLeadingPositiveContentIntro(message: string) {
  return message.replace(LEADING_CONTENT_INTRO, "想了解");
}

/** Prevents `我不太想了解...` from being mistaken for a positive clause break. */
export function isNegatedContentIntroPrefix(prefix: string) {
  return NEGATED_CONTENT_INTRO_PREFIX.test(compactIntroText(prefix));
}

/** A negative intention noun owns the following infinitive; it is not meta context. */
export function hasNegativeIntentNominalComplement(prefix: string) {
  return NEGATIVE_INTENT_NOMINAL_COMPLEMENT.test(compactIntroText(prefix));
}
