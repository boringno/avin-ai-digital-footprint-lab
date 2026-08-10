import { createEmptyConversationContext, type ConversationContext } from "../src/lib/conversation-context";
import { clinicConfig } from "../src/lib/clinic-config";
import { routeCustomerMessage, type RouterDecision } from "../src/lib/router";

const NOW = new Date("2026-08-06T06:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTurns(messages: string[]) {
  let context: ConversationContext = createEmptyConversationContext("treatment-pack-validation");
  const decisions: RouterDecision[] = [];

  for (const message of messages) {
    const decision = await routeCustomerMessage({ conversationContext: context, includePending: false, message, now: NOW });
    decisions.push(decision);
    context = decision.nextContext;
  }

  return { context, decisions };
}

async function validateAspectProgression() {
  const { context, decisions } = await runTurns([
    "我想改善雙下巴",
    "我在意厚度，這個能消除雙下巴嗎",
    "幫我介紹雙下巴的部分",
    "再介紹一次雙下巴",
  ]);

  assert(
    context.treatmentConsultation?.answeredAspectKeys?.includes("concern:jawline_looseness:overview"),
    "TP1: a treatment pack must record the initial concern overview",
  );
  assert(
    context.treatmentConsultation?.answeredAspectKeys?.includes("detail:jawline_expectation"),
    "TP1: a treatment pack must record the answered expectation aspect",
  );
  assert(
    context.treatmentConsultation?.answeredAspectKeys?.includes("detail:jawline_intro"),
    "TP1: a treatment pack must record the answered introduction aspect",
  );
  assert(decisions[1].replyText.includes("肉感／厚度"), "TP1: thickness question must receive the expectation answer");
  assert(decisions[2].replyText.includes("針對雙下巴／嘴邊肉"), "TP1: introduction question must receive the introduction answer");
  assert(
    decisions[3].replyText.includes("重點已先為您整理"),
    "TP1: repeated aspect question must move to the next action instead of repeating the same paragraph",
  );
  assert(decisions[2].replyText !== decisions[3].replyText, "TP1: repeated detail must not return the identical text");
  console.log("PASS: TP1 treatment pack tracks answered aspects and avoids repetition");
}

async function validateDirectDetailQuestion() {
  const { context, decisions } = await runTurns(["想介紹一下雙下巴"]);

  assert(decisions[0].replyText.includes("針對雙下巴／嘴邊肉"), "TP2: direct detail inquiry must skip the generic concern loop");
  assert(
    context.treatmentConsultation?.answeredAspectKeys?.includes("detail:jawline_intro"),
    "TP2: direct detail inquiry must persist its answered aspect",
  );
  console.log("PASS: TP2 direct detail question uses the matching pack aspect");
}

async function validatePrimaryConcernDoesNotLoop() {
  const { decisions } = await runTurns(["我想改善雙下巴", "主要是雙下巴", "雙下巴"]);

  assert(
    decisions[2].replyText.includes("我們先以 雙下巴 為主安排"),
    "TP3: repeating a selected primary concern must advance to the next action instead of asking the same priority question",
  );
  console.log("PASS: TP3 selected primary concern does not loop back to discovery");
}

function validatePackSchema() {
  const packs = clinicConfig.treatmentList.filter((treatment) => treatment.consultationGuide);
  assert(packs.length > 0, "TP4: at least one treatment conversation pack must be configured");

  for (const treatment of packs) {
    const concernReplies = treatment.consultationGuide?.concernReplies ?? [];
    const aspectKeys = treatment.consultationGuide?.detailReplies?.map((item) => item.aspectKey) ?? [];
    assert(concernReplies.length > 0, `TP4: ${treatment.name} requires at least one discovery option`);
    assert(
      concernReplies.every((item) => item.discoveryLabel.trim()),
      `TP4: ${treatment.name} discovery options require labels generated from the same concern records`,
    );
    assert(aspectKeys.every(Boolean), `TP4: ${treatment.name} detail replies require stable aspect keys`);
    assert(
      new Set(aspectKeys).size === aspectKeys.length,
      `TP4: ${treatment.name} detail aspect keys must not repeat within a treatment pack`,
    );
  }

  console.log("PASS: TP4 treatment pack schema has stable, unique detail aspect keys");
}

async function validateGeneratedDiscoveryOptions() {
  for (const treatment of clinicConfig.treatmentList.filter((item) => item.consultationGuide)) {
    const guide = treatment.consultationGuide!;
    const introduction = await runTurns([`我想了解${treatment.name}`]);

    for (const [index, concernReply] of (guide.concernReplies ?? []).entries()) {
      assert(
        introduction.decisions[0].replyText.includes(concernReply.discoveryLabel),
        `TP6: ${treatment.name} generated discovery prompt must include option ${index + 1}`,
      );
      const selected = await runTurns([`我想了解${treatment.name}`, String(index + 1)]);
      assert(
        selected.decisions[1].matchedKey === `treatment_consult:${treatment.key}`,
        `TP6: ${treatment.name} numeric option ${index + 1} must route to its declared concern`,
      );
      assert(
        selected.decisions[1].replyText.includes(concernReply.reply.split("\n")[0]),
        `TP6: ${treatment.name} numeric option ${index + 1} must use its configured reply`,
      );
    }

    if (guide.discoveryFallbackOption) {
      const fallbackIndex = (guide.concernReplies?.length ?? 0) + 1;
      const selected = await runTurns([`我想了解${treatment.name}`, String(fallbackIndex)]);
      assert(
        selected.decisions[1].matchedKey === `treatment_consult:${treatment.key}:other`,
        `TP6: ${treatment.name} fallback option must not repeat the generic treatment paragraph`,
      );
    }
  }

  const wrinkleTerms = ["皺眉紋", "我在意皺眉紋", "眉間紋", "川字紋", "抬頭紋"];
  for (const message of wrinkleTerms) {
    const routed = await runTurns(["我想了解肉毒", message]);
    assert(routed.decisions[1].matchedKey === "treatment_consult:botox", `TP6: ${message} must enter the Botox concern reply`);
    assert(routed.decisions[1].replyText.includes("動態紋路"), `TP6: ${message} must not fall back to the generic Botox paragraph`);
  }

  const masseter = await runTurns(["我想了解肉毒", "2"]);
  assert(masseter.decisions[1].replyText.includes("肉毒小臉"), "TP6: Botox option 2 must enter the masseter concern reply");
  console.log("PASS: TP6 generated discovery options route every displayed choice and Botox wrinkle synonym");
}

async function validateCrossCategoryPackReuse() {
  const expectedPackKeys = ["onda_pro", "botox", "pico"];
  const configuredPacks = clinicConfig.treatmentList.filter((treatment) => treatment.consultationGuide);

  for (const treatmentKey of expectedPackKeys) {
    assert(
      configuredPacks.some((treatment) => treatment.key === treatmentKey),
      `TP5: ${treatmentKey} must use the shared consultation pack engine`,
    );
  }

  const configuredCategories = new Set(
    configuredPacks
      .filter((treatment) => expectedPackKeys.includes(treatment.key))
      .map((treatment) => treatment.category),
  );
  assert(configuredCategories.size === 3, "TP5: Phase 4 must prove reuse across energy, injectable, and laser treatment categories");

  const botoxConcern = await runTurns(["我想改善魚尾紋"]);
  assert(botoxConcern.decisions[0].matchedKey === "treatment_consult:botox", "TP5: dynamic wrinkles must enter the Botox pack");
  assert(botoxConcern.decisions[0].replyText.includes("肉毒"), "TP5: Botox concern reply must identify the selected treatment");

  const botoxFeature = await runTurns(["肉毒有什麼特色"]);
  assert(
    botoxFeature.decisions[0].matchedKey === "treatment_consult:botox:features",
    "TP5: Botox feature question must use its configured quick reply",
  );

  const picoConcern = await runTurns(["我在意毛孔粗大"]);
  assert(picoConcern.decisions[0].matchedKey === "treatment_consult:pico", "TP5: pore concern must enter the Pico pack");
  assert(picoConcern.decisions[0].replyText.includes("探索皮秒"), "TP5: Pico concern reply must identify the selected treatment");

  const picoFeature = await runTurns(["探索皮秒有什麼特色"]);
  assert(
    picoFeature.decisions[0].matchedKey === "treatment_consult:pico:features",
    "TP5: Pico feature question must use its configured quick reply",
  );

  const botoxThenJawline = await runTurns(["我想改善魚尾紋", "我想改善雙下巴"]);
  assert(
    botoxThenJawline.decisions[1].matchedKey === "treatment_consult:onda_pro",
    "TP5: a new concern outside the active pack must switch to its recommended treatment",
  );

  const picoThenWrinkles = await runTurns(["我在意毛孔粗大", "我想改善魚尾紋"]);
  assert(
    picoThenWrinkles.decisions[1].matchedKey === "treatment_consult:botox",
    "TP5: a new concern must not remain trapped in an unrelated active treatment pack",
  );

  console.log("PASS: TP5 three treatment categories reuse the same consultation pack engine and switch safely between concerns");
}

async function main() {
  await validateAspectProgression();
  await validateDirectDetailQuestion();
  await validatePrimaryConcernDoesNotLoop();
  validatePackSchema();
  await validateCrossCategoryPackReuse();
  await validateGeneratedDiscoveryOptions();
  console.log("treatment pack validation passed (6 scenarios)");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});
