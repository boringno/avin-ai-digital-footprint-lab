import assert from "node:assert/strict";

import {
  parseTreatmentFollowupIntent,
  type BrandComparisonAspect,
  type TreatmentFollowupHistory,
} from "../src/lib/treatment-followup-intent";

type ExpectedIntent = {
  aspect: BrandComparisonAspect;
  kind: "brand_overview" | "brand_comparison";
  source: "explicit" | "elliptical";
};

function assertIntent(
  message: string,
  expected: ExpectedIntent,
  history: TreatmentFollowupHistory = {},
) {
  assert.deepEqual(
    parseTreatmentFollowupIntent(message, history),
    expected,
    `${message} must preserve the expected brand follow-up semantics`,
  );
}

function main() {
  const explicitFamilies: Array<[string, ExpectedIntent]> = [
    ["肉毒有什麼牌子？", { aspect: "overall", kind: "brand_overview", source: "explicit" }],
    ["你們使用哪些肉毒品牌", { aspect: "overall", kind: "brand_overview", source: "explicit" }],
    ["BOTOX 跟 Dysport 差在哪", { aspect: "overall", kind: "brand_comparison", source: "explicit" }],
    ["不同品牌效果有什麼差別", { aspect: "effect", kind: "brand_comparison", source: "explicit" }],
    ["Neuronox 跟 BOTOX 哪個維持比較久", { aspect: "duration", kind: "brand_comparison", source: "explicit" }],
    ["Dysport 起效速度如何", { aspect: "onset", kind: "brand_comparison", source: "explicit" }],
    ["哪個肉毒品牌比較適合咀嚼肌", { aspect: "suitability", kind: "brand_comparison", source: "explicit" }],
    ["肉毒品牌的副作用有差嗎", { aspect: "safety", kind: "brand_comparison", source: "explicit" }],
    ["品牌差在哪", { aspect: "overall", kind: "brand_comparison", source: "explicit" }],
    [
      "那這個肉毒有什麼牌子？跟 BOTOX 差別是什麼",
      { aspect: "overall", kind: "brand_comparison", source: "explicit" },
    ],
  ];

  for (const [message, expected] of explicitFamilies) {
    assertIntent(message, expected);
  }
  console.log("PASS: explicit brand overview and comparison semantic families are recognized");

  const matchedKeyHistory: TreatmentFollowupHistory = {
    previousMatchedKey: "treatment_brand:botox",
  };
  const ellipticalFamilies: Array<[string, BrandComparisonAspect]> = [
    ["效果上的差別呢", "effect"],
    ["那維持時間呢", "duration"],
    ["哪個比較持久", "duration"],
    ["起效速度呢", "onset"],
    ["適合部位有差嗎", "suitability"],
    ["安全性呢", "safety"],
    ["所以差在哪", "overall"],
    ["差在哪裡", "overall"],
    ["各有什麼特色", "effect"],
    ["持久度有差嗎", "duration"],
    ["哪個比較自然", "effect"],
    ["哪個維持比較久", "duration"],
    ["三種各自的優點呢", "effect"],
  ];

  for (const [message, aspect] of ellipticalFamilies) {
    assertIntent(message, { aspect, kind: "brand_comparison", source: "elliptical" }, matchedKeyHistory);
  }
  console.log("PASS: elliptical comparison wording continues a persisted treatment_brand matchedKey");

  const awaitingHistory: TreatmentFollowupHistory = {
    awaiting: {
      kind: "priority",
      questionSummary: "想先比較肉毒品牌的效果、維持時間，還是適合部位？",
    },
  };
  assertIntent(
    "效果呢",
    { aspect: "effect", kind: "brand_comparison", source: "elliptical" },
    awaitingHistory,
  );
  assertIntent(
    "維持時間呢",
    { aspect: "duration", kind: "brand_comparison", source: "elliptical" },
    awaitingHistory,
  );
  console.log("PASS: an explicit brand awaiting task also supports short follow-ups");

  const contextFreeEllipses = ["效果上的差別呢", "維持時間呢", "安全性呢", "所以差在哪"];
  for (const message of contextFreeEllipses) {
    assert.equal(
      parseTreatmentFollowupIntent(message),
      null,
      `${message} must not become a brand comparison without persisted brand context`,
    );
    assert.equal(
      parseTreatmentFollowupIntent(message, { previousMatchedKey: "treatment_consult:botox" }),
      null,
      `${message} must not inherit from a generic treatment consultation`,
    );
    assert.equal(
      parseTreatmentFollowupIntent(message, {
        awaiting: { kind: "priority", questionSummary: "想先比較哪個療程方向？" },
      }),
      null,
      `${message} must not inherit from a non-brand comparison question`,
    );
  }

  for (const message of ["肉毒效果如何", "ONDA 跟肉毒差在哪", "多少錢", "要先預約嗎"]) {
    assert.equal(parseTreatmentFollowupIntent(message), null, `${message} must remain outside the brand-comparison subtask`);
  }
  console.log("PASS: context-free ellipses and non-brand intents abstain");

  console.log("treatment follow-up intent validation passed (brand semantic families)");
}

main();
