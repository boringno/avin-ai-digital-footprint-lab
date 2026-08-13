import {
  findAllTreatmentsByMessage,
  normalizeClinicText,
  type TreatmentConfig,
} from "@/lib/clinic-config";

export type TreatmentSelectionResult = {
  excluded: TreatmentConfig[];
  excludedKeys: string[];
  hasDirective: boolean;
  mentioned: TreatmentConfig[];
  mentionedKeys: string[];
  neutralContrast: boolean;
  replaceExisting: boolean;
  selected: TreatmentConfig[];
  selectedKeys: string[];
};

type TreatmentPolarity = "excluded" | "selected";

const CLAUSE_SEPARATOR = /[,，、;；。.!！?？\n]+|(?:但(?:是)?|可是|不過|而是)/u;
const CORRECTION_PATTERN = /(?:改成|換成|更正(?:為|成)?|其實(?:我)?(?:主要)?(?:是|想|要)|後來(?:改成|換成|想做|要做|想打|要打)|現在(?:改成|換成|想做|要做|想打|要打)|我(?:才)?是想|我要的是|我想的是|不對(?:應該)?是)/gu;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTreatmentAliases(treatment: TreatmentConfig) {
  return Array.from(
    new Set(
      [treatment.name, ...treatment.aliases, ...(treatment.availableBrands ?? [])]
        .map(normalizeClinicText)
        .filter(Boolean),
    ),
  ).sort((left, right) => right.length - left.length);
}

function hasDoubleNegation(clause: string, alias: string) {
  const escapedAlias = escapeRegExp(alias);
  return [
    new RegExp(`${escapedAlias}(?:並)?不是(?:完全)?(?:不能|不行|不可以|不適合|不想|不要)(?:做|打|選|考慮|了解)?`, "u"),
    new RegExp(`(?:不是不|並非不)(?:想|要|能|可以|適合|考慮)?(?:做|打|選|了解)?${escapedAlias}`, "u"),
    new RegExp(`不是(?:完全)?(?:不能|不行|不可以|不適合)(?:做|打|選|考慮|了解)?${escapedAlias}`, "u"),
  ].some((pattern) => pattern.test(clause));
}

function hasSelectionCueBefore(clause: string, index: number) {
  const prefix = clause.slice(Math.max(0, index - 18), index);
  return /(?:我(?:想|要|選|做|打|問)|想做|要做|選擇|改成|換成|更正|其實|問的是|要的是|想的是)/u.test(prefix);
}

function isIdentityContrast(
  clause: string,
  targetAlias: string,
  otherTreatments: TreatmentConfig[],
) {
  const escapedTarget = escapeRegExp(targetAlias);

  return otherTreatments.some((otherTreatment) =>
    getTreatmentAliases(otherTreatment).some((otherAlias) => {
      const pattern = new RegExp(`${escapeRegExp(otherAlias)}(?:並|可|就)?不是${escapedTarget}`, "u");
      const match = pattern.exec(clause);
      return Boolean(match && !hasSelectionCueBefore(clause, match.index));
    }),
  );
}

function isFirstPersonIdentityCorrection(
  clause: string,
  targetAlias: string,
  otherTreatments: TreatmentConfig[],
) {
  const escapedTarget = escapeRegExp(targetAlias);

  return otherTreatments.some((otherTreatment) =>
    getTreatmentAliases(otherTreatment).some((otherAlias) => {
      const pattern = new RegExp(`${escapeRegExp(otherAlias)}(?:並|可|就)?不是${escapedTarget}`, "u");
      const match = pattern.exec(clause);
      return Boolean(match && hasSelectionCueBefore(clause, match.index));
    }),
  );
}

function isExplicitlyExcluded(
  clause: string,
  treatment: TreatmentConfig,
  clauseTreatments: TreatmentConfig[],
) {
  const otherTreatments = clauseTreatments.filter((candidate) => candidate.key !== treatment.key);

  return getTreatmentAliases(treatment).some((alias) => {
    if (hasDoubleNegation(clause, alias)) return false;
    if (isFirstPersonIdentityCorrection(clause, alias, otherTreatments)) return true;
    if (isIdentityContrast(clause, alias, otherTreatments)) return false;

    const escapedAlias = escapeRegExp(alias);
    const doNotTreatExclusiveWordingAsRejection = new RegExp(
      `不要只(?:做|打|介紹|說明|考慮|了解)?${escapedAlias}`,
      "u",
    ).test(clause);
    if (doNotTreatExclusiveWordingAsRejection) return false;

    return [
      new RegExp(`(?:不想|不要|不用|不需要|不考慮|不選|不做|不打|先不|排除)(?:再|先)?搭(?:配)?${escapedAlias}`, "u"),
      new RegExp(`(?:不搭配|不搭|先不要搭(?:配)?)(?:做|打)?${escapedAlias}`, "u"),
      new RegExp(`(?:不想|不要|不用|不需要|不考慮|不選|不做|不打|先不|排除)(?:再|先)?(?:做|打|選|選擇|考慮|了解|問|要)?(?:的是)?${escapedAlias}`, "u"),
      new RegExp(`(?:^|我|而)不是(?:想|要|想做|要做|打|做|選|選擇|考慮|了解|問|在問)?(?:的是)?${escapedAlias}`, "u"),
      new RegExp(`${escapedAlias}(?:我)?(?:先)?(?:不要|不用|不需要|不考慮|不選|不做|不打|排除)`, "u"),
      new RegExp(`${escapedAlias}(?:我)?(?:先)?(?:不要搭配|不要搭|不搭配|不搭)`, "u"),
      new RegExp(`${escapedAlias}(?:我)?(?:先)?不想(?:做|打|選|選擇|考慮|了解|問)?`, "u"),
      new RegExp(`${escapedAlias}(?:先)?不是(?:我)?(?:想|要|想做|要做|打|做|選|選擇|考慮|了解|問)(?:的)?`, "u"),
      new RegExp(`${escapedAlias}不是(?:我的)?(?:首選|優先)`, "u"),
      new RegExp(`除了${escapedAlias}(?:以外|之外)`, "u"),
      new RegExp(`${escapedAlias}(?:以外|之外)`, "u"),
    ].some((pattern) => pattern.test(clause));
  });
}

function hasPositiveDirective(clause: string, treatment: TreatmentConfig) {
  return getTreatmentAliases(treatment).some((alias) => {
    if (hasDoubleNegation(clause, alias)) return false;
    const escapedAlias = escapeRegExp(alias);
    return [
      new RegExp(`(?:^|我|那我|所以我|目前|現在|後來|其實)(?:只想|只要|想要|想做|要做|想打|要打|想選|要選|想了解|要了解|想問|要問|想比較|選擇|考慮|選|要|了解)(?:再|先)?(?:做|打|選|選擇|考慮|了解|問)?(?:的是)?${escapedAlias}`, "u"),
      new RegExp(`(?:改成|換成|更正(?:為|成)?|我要的是|我想的是|我是想)(?:做|打|選|選擇|考慮|了解|問)?${escapedAlias}`, "u"),
      new RegExp(`${escapedAlias}(?:就好|為主|優先)`, "u"),
    ].some((pattern) => pattern.test(clause));
  });
}

function findLastCorrectionIndex(message: string) {
  let lastIndex = -1;
  for (const match of message.matchAll(CORRECTION_PATTERN)) {
    lastIndex = match.index;
  }
  return lastIndex;
}

function occursAtOrAfter(message: string, treatment: TreatmentConfig, startIndex: number) {
  return getTreatmentAliases(treatment).some((alias) => message.indexOf(alias, startIndex) >= startIndex);
}

/**
 * Separates treatment mentions from the customer's current selection.
 *
 * `mentioned` is the complete ontology match. `selected` keeps neutral and
 * positive mentions unless the customer explicitly excludes them. A strong
 * correction such as "把 ONDA 改成肉毒" narrows `selected` to the treatment(s)
 * named after the correction without pretending the earlier mention vanished.
 */
export function parseTreatmentSelection(message: string): TreatmentSelectionResult {
  const mentioned = findAllTreatmentsByMessage(message);
  const mentionedByKey = new Map(mentioned.map((treatment) => [treatment.key, treatment]));
  const finalPolarity = new Map<string, TreatmentPolarity>();
  const clauses = message
    .normalize("NFKC")
    .split(CLAUSE_SEPARATOR)
    .map((clause) => clause.trim())
    .filter(Boolean);

  for (const clauseText of clauses) {
    const clause = normalizeClinicText(clauseText);
    const clauseTreatments = findAllTreatmentsByMessage(clauseText)
      .filter((treatment) => mentionedByKey.has(treatment.key));

    for (const treatment of clauseTreatments) {
      if (isExplicitlyExcluded(clause, treatment, clauseTreatments)) {
        finalPolarity.set(treatment.key, "excluded");
      } else if (hasPositiveDirective(clause, treatment)) {
        finalPolarity.set(treatment.key, "selected");
      }
    }
  }

  const excluded = mentioned.filter((treatment) => finalPolarity.get(treatment.key) === "excluded");
  let selected = mentioned.filter((treatment) => finalPolarity.get(treatment.key) !== "excluded");
  const normalizedMessage = normalizeClinicText(message);
  const correctionIndex = findLastCorrectionIndex(normalizedMessage);

  if (correctionIndex >= 0) {
    const correctedSelection = selected.filter((treatment) =>
      occursAtOrAfter(normalizedMessage, treatment, correctionIndex),
    );
    if (correctedSelection.length > 0) {
      selected = correctedSelection;
    }
  }

  const hasDirective = mentioned.length > 0 && (
    excluded.length > 0 ||
    correctionIndex >= 0 ||
    [...finalPolarity.values()].includes("selected")
  );
  const replaceExisting = mentioned.length > 0 && (
    excluded.length > 0 ||
    correctionIndex >= 0 ||
    /(?:^|我|那我|所以我|目前|現在|其實)(?:只想|只要).{0,12}(?:做|打|選|了解|問)?/u.test(normalizedMessage)
  );
  const neutralContrast = mentioned.length > 0 && !hasDirective && (
    /(?:不是不能|不是不想|不是不要|並非不能|並非不想)/u.test(normalizedMessage) ||
    (mentioned.length > 1 && /(?:不是|並不是|不一樣|不同療程)/u.test(normalizedMessage))
  );

  return {
    excluded,
    excludedKeys: excluded.map((treatment) => treatment.key),
    hasDirective,
    mentioned,
    mentionedKeys: mentioned.map((treatment) => treatment.key),
    neutralContrast,
    replaceExisting,
    selected,
    selectedKeys: selected.map((treatment) => treatment.key),
  };
}
