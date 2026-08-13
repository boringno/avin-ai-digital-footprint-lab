import { parseTreatmentSelection } from "@/lib/treatment-selection";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type SelectionExpectation = {
  directive: boolean;
  excluded: string[];
  mentioned: string[];
  neutral?: boolean;
  replace?: boolean;
  selected: string[];
};

function validateSelection(message: string, expected: SelectionExpectation) {
  const actual = parseTreatmentSelection(message);
  const label = JSON.stringify(message);

  assert(
    JSON.stringify(actual.mentionedKeys) === JSON.stringify(expected.mentioned),
    `${label}: mentioned=${JSON.stringify(actual.mentionedKeys)}, expected=${JSON.stringify(expected.mentioned)}`,
  );
  assert(
    JSON.stringify(actual.selectedKeys) === JSON.stringify(expected.selected),
    `${label}: selected=${JSON.stringify(actual.selectedKeys)}, expected=${JSON.stringify(expected.selected)}`,
  );
  assert(
    JSON.stringify(actual.excludedKeys) === JSON.stringify(expected.excluded),
    `${label}: excluded=${JSON.stringify(actual.excludedKeys)}, expected=${JSON.stringify(expected.excluded)}`,
  );
  assert(actual.hasDirective === expected.directive, `${label}: hasDirective=${actual.hasDirective}, expected=${expected.directive}`);
  assert(actual.replaceExisting === (expected.replace ?? false), `${label}: replaceExisting=${actual.replaceExisting}, expected=${expected.replace ?? false}`);
  assert(actual.neutralContrast === (expected.neutral ?? false), `${label}: neutralContrast=${actual.neutralContrast}, expected=${expected.neutral ?? false}`);
  assert(
    actual.mentioned.map((treatment) => treatment.key).join("|") === actual.mentionedKeys.join("|"),
    `${label}: mentioned objects and keys must stay aligned`,
  );
  assert(
    actual.selected.map((treatment) => treatment.key).join("|") === actual.selectedKeys.join("|"),
    `${label}: selected objects and keys must stay aligned`,
  );
  assert(
    actual.excluded.map((treatment) => treatment.key).join("|") === actual.excludedKeys.join("|"),
    `${label}: excluded objects and keys must stay aligned`,
  );
}

const ONDA = "onda_pro";
const BOTOX = "botox";

const cases: Array<[string, SelectionExpectation]> = [
  ["ONDA 是什麼？", { mentioned: [ONDA], selected: [ONDA], excluded: [], directive: false }],
  ["ONDA 跟肉毒差在哪？", { mentioned: [ONDA, BOTOX], selected: [ONDA, BOTOX], excluded: [], directive: false }],

  ["我不要肉毒，只想做 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["我不想打肉毒，想做 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["先不考慮肉毒，我想了解 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["我不需要肉毒，只要 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["排除肉毒，ONDA 可以", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["我不是想做肉毒，我是想做 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["我不要肉毒只想做ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],

  ["肉毒先不要，我想做 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["肉毒我不想做，ONDA 就好", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["肉毒不考慮，ONDA 為主", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["我不要搭肉毒", { mentioned: [BOTOX], selected: [], excluded: [BOTOX], directive: true, replace: true }],
  ["我不搭配肉毒", { mentioned: [BOTOX], selected: [], excluded: [BOTOX], directive: true, replace: true }],
  ["先不要搭肉毒", { mentioned: [BOTOX], selected: [], excluded: [BOTOX], directive: true, replace: true }],
  ["肉毒不搭", { mentioned: [BOTOX], selected: [], excluded: [BOTOX], directive: true, replace: true }],
  ["肉毒不是我想做的，我要 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],

  ["除了肉毒以外，我想做 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["肉毒以外都可以", { mentioned: [BOTOX], selected: [], excluded: [BOTOX], directive: true, replace: true }],

  ["我原本想做肉毒，現在改成 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [], directive: true, replace: true }],
  ["把 ONDA 換成肉毒", { mentioned: [ONDA, BOTOX], selected: [BOTOX], excluded: [], directive: true, replace: true }],
  ["更正為 ONDA", { mentioned: [ONDA], selected: [ONDA], excluded: [], directive: true, replace: true }],
  ["其實我主要想做 ONDA", { mentioned: [ONDA], selected: [ONDA], excluded: [], directive: true, replace: true }],
  ["不是肉毒，是 ONDA", { mentioned: [BOTOX, ONDA], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],

  ["肉毒不是不能做", { mentioned: [BOTOX], selected: [BOTOX], excluded: [], directive: false, neutral: true }],
  ["我不是不想做肉毒", { mentioned: [BOTOX], selected: [BOTOX], excluded: [], directive: false, neutral: true }],
  ["ONDA 不是肉毒", { mentioned: [ONDA, BOTOX], selected: [ONDA, BOTOX], excluded: [], directive: false, neutral: true }],
  ["ONDA 並不是肉毒嗎？", { mentioned: [ONDA, BOTOX], selected: [ONDA, BOTOX], excluded: [], directive: false, neutral: true }],
  ["ONDA 跟肉毒不是一樣的療程", { mentioned: [ONDA, BOTOX], selected: [ONDA, BOTOX], excluded: [], directive: false, neutral: true }],
  ["我要 ONDA，不是肉毒", { mentioned: [ONDA, BOTOX], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["我問的是 ONDA 不是肉毒", { mentioned: [ONDA, BOTOX], selected: [ONDA], excluded: [BOTOX], directive: true, replace: true }],
  ["不要只介紹肉毒，也說明 ONDA", { mentioned: [BOTOX, ONDA], selected: [BOTOX, ONDA], excluded: [], directive: false }],

  ["我不要肉毒，但後來改成肉毒", { mentioned: [BOTOX], selected: [BOTOX], excluded: [], directive: true, replace: true }],
  ["我想做肉毒，但後來不要肉毒", { mentioned: [BOTOX], selected: [], excluded: [BOTOX], directive: true, replace: true }],
  ["我想比較 ONDA 跟肉毒", { mentioned: [ONDA, BOTOX], selected: [ONDA, BOTOX], excluded: [], directive: true }],
];

for (const [message, expected] of cases) {
  validateSelection(message, expected);
}

console.log(`treatment selection validation passed (${cases.length} semantic cases)`);

// Assertions above execute synchronously when this validator is invoked.
