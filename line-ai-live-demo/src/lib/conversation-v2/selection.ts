import type {
  AwaitingOption,
  AwaitingState,
  SelectionUnderstanding,
} from "./types";

function normalizeText(text: string) {
  return text.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

const ALL_OPTIONS_PATTERN = /^(?:(?:兩個|三個|這些)?都|全部|全都)(?:可以|能|想|要|幫我|給我|先)*(?:看|看看|了解|介紹)?(?:一下)?[!！。.]?$/u;
const PURE_INDEX_PATTERN = /^(?:[1-9])(?:[、,，及和與/／+]*(?:[1-9]))*[!！。.]?$/u;

function uniqueOptions(options: AwaitingOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

function optionTokens(option: AwaitingOption) {
  return Array.from(
    new Set(
      [option.id, option.value, ...option.label.split(/[、/／]/u)]
        .map(normalizeText)
        .filter(Boolean),
    ),
  );
}

function optionsFromStructuredSelection(
  selection: SelectionUnderstanding,
  awaiting: AwaitingState,
): AwaitingOption[] {
  if (selection.mode === "all") {
    return awaiting.allowMultiple ? awaiting.options.map((option) => ({ ...option })) : [];
  }
  if (selection.mode === "indexes") {
    return uniqueOptions(
      selection.indexes
        .map((index) => awaiting.options[index - 1])
        .filter((option): option is AwaitingOption => Boolean(option))
        .map((option) => ({ ...option })),
    );
  }
  const keys = new Set(selection.keys);
  return awaiting.options
    .filter((option) => keys.has(option.id) || keys.has(option.value))
    .map((option) => ({ ...option }));
}

/**
 * Resolves a short answer only against the exact options from the previous
 * question. It does not search global keywords and therefore cannot leak an
 * old treatment into a new task.
 */
export function resolveAwaitingSelection(input: {
  awaiting: AwaitingState;
  selection?: SelectionUnderstanding;
  text: string;
}): AwaitingOption[] {
  if (input.selection) {
    return optionsFromStructuredSelection(input.selection, input.awaiting);
  }

  const normalized = normalizeText(input.text);
  if (
    input.awaiting.allowMultiple &&
    ALL_OPTIONS_PATTERN.test(normalized)
  ) {
    return input.awaiting.options.map((option) => ({ ...option }));
  }

  const indexMatches = PURE_INDEX_PATTERN.test(normalized)
    ? Array.from(normalized.matchAll(/[1-9]/gu), (match) => Number(match[0]))
    : [];
  const byIndex = uniqueOptions(
    indexMatches
      .map((index) => input.awaiting.options[index - 1])
      .filter((option): option is AwaitingOption => Boolean(option))
      .map((option) => ({ ...option })),
  );
  if (byIndex.length > 0) {
    return input.awaiting.allowMultiple ? byIndex : byIndex.slice(0, 1);
  }

  const byLabel = input.awaiting.options.filter((option) => {
    return optionTokens(option).some((token) => normalized.includes(token));
  });
  return input.awaiting.allowMultiple ? byLabel : byLabel.slice(0, 1);
}

/** True only when the whole message can be explained by the pending options. */
export function isPureAwaitingSelectionAnswer(input: {
  awaiting: AwaitingState;
  text: string;
}) {
  const normalized = normalizeText(input.text);
  if (input.awaiting.allowMultiple && ALL_OPTIONS_PATTERN.test(normalized)) return true;
  if (PURE_INDEX_PATTERN.test(normalized)) return true;

  const matched = input.awaiting.options.filter((option) => {
    return optionTokens(option).some((token) => normalized.includes(token));
  });
  if (matched.length === 0) return false;

  const residual = matched
    .flatMap(optionTokens)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .reduce((text, token) => text.split(token).join(""), normalized)
    .replace(/(?:跟|和|與|及|還有|都|也|、|,|，|\/|／|\+|!|！|。|\.)/gu, "");
  return residual.length === 0;
}
