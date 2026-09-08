import assert from "node:assert/strict";

import { createStaticClinicFactsProvider } from "@/lib/clinic-facts/static-provider";
import { routeConversationV2Canary } from "@/lib/conversation-v2/live-runtime";
import { createEmptyConversationContext, type ConversationContext } from "@/lib/conversation-context";
import type { NluFrame } from "@/lib/nlu-frame";

const NOW = new Date("2026-09-08T12:00:00+08:00");

function frame(treatments: string[] = []): NluFrame {
  return {
    areas: [],
    confidence: 0.95,
    concerns: [],
    dialogue: {
      focus: "overview",
      move: "start",
      reference: "explicit",
      speechAct: "learn_treatment",
    },
    intents: ["treatment"],
    negated: [],
    safety: { complaint: false, humanRequest: false, postTreatmentRisk: false, pregnancyNursing: false },
    schemaVersion: 2,
    treatments,
  };
}

async function route(input: {
  context: ConversationContext;
  frame?: NluFrame | null;
  message: string;
  notOfferedTreatmentKeys?: string[];
  staleTreatmentKeys?: string[];
  turn: number;
}) {
  const result = await routeConversationV2Canary({
    context: input.context,
    eventIdentity: `concern-projection-${input.turn}`,
    message: input.message,
    now: NOW,
    sourceType: "user",
    sourceUserId: "U-concern-projection",
  }, {
    factsProvider: createStaticClinicFactsProvider({
      notOfferedTreatmentKeys: input.notOfferedTreatmentKeys,
      staleTreatmentKeys: input.staleTreatmentKeys,
    }),
    getCanarySettings: () => ({ allowlistedUserIds: ["U-concern-projection"], mode: "canary" as const }),
    requestFrame: async () => ({
      errorCode: input.frame === null ? "nlu_unavailable" : null,
      frame: input.frame ?? frame(),
      latencyMs: 1,
      model: "fixture",
      promptVersion: "fixture",
      tokensIn: 1,
      tokensOut: 1,
    }),
  });
  assert.equal(result.kind, "routed");
  assert.ok("decision" in result && result.decision);
  return result as Extract<typeof result, { kind: "routed" }>;
}

function actions(result: Awaited<ReturnType<typeof route>>) {
  return result.decision.replyPlan?.quickReplyItems ?? [];
}

function actionText(result: Awaited<ReturnType<typeof route>>, label: string) {
  const action = actions(result).find((item) => item.action.label === label);
  assert.ok(action, `missing quick reply: ${label}`);
  return action.action.text;
}

async function main() {
  let turn = 1;
  const entry = await route({
    context: createEmptyConversationContext("U-concern-entry"),
    frame: null,
    message: "我想依困擾找適合療程",
    turn: turn++,
  });
  assert.deepEqual(actions(entry).map((item) => item.action.label), [
    "雙下巴／嘴邊肉",
    "細紋／皺紋",
    "膚質／毛孔／斑點",
    "臉部鬆弛／下垂",
    "不確定，想預約免費諮詢",
  ]);

  const unknownBranch = await route({
    context: entry.decision.nextContext,
    frame: null,
    message: actionText(entry, "雙下巴／嘴邊肉"),
    turn: turn++,
  });
  assert.deepEqual(actions(unknownBranch).map((item) => item.action.label), [
    "ONDA PRO", "十蓓電波", "美國音波 2.0", "Q+音波",
  ]);

  const wrinkles = await route({
    context: entry.decision.nextContext,
    frame: null,
    message: actionText(entry, "細紋／皺紋"),
    turn: turn++,
  });
  assert.deepEqual(actions(wrinkles).map((item) => item.action.label), ["肉毒", "十蓓電波", "玻尿酸", "逆時針"]);
  assert.match(wrinkles.decision.replyText, /不同改善方向/u);

  const skin = await route({
    context: entry.decision.nextContext,
    frame: null,
    message: actionText(entry, "膚質／毛孔／斑點"),
    turn: turn++,
  });
  assert.deepEqual(actions(skin).map((item) => item.action.label), ["探索皮秒", "M22 彩衝光", "LUMECCA 三倍光", "水飛梭", "水光針"]);

  const loose = await route({
    context: entry.decision.nextContext,
    frame: null,
    message: actionText(entry, "臉部鬆弛／下垂"),
    turn: turn++,
  });
  assert.deepEqual(actions(loose).map((item) => item.action.label), ["十蓓電波", "鳳凰電波", "美國音波 2.0", "Q+音波", "ONDA PRO"]);

  const kaohsiung = await route({
    context: createEmptyConversationContext("U-concern-kaohsiung"),
    frame: frame(["emface"]),
    message: "我在高雄，想做菲斯波",
    turn: turn++,
  });
  assert.match(kaohsiung.decision.replyText, /EMFACE目前僅台中館提供/u);
  assert.match(kaohsiung.decision.replyText, /如果希望在高雄處理/u);
  const kaohsiungDoubleChin = await route({
    context: kaohsiung.decision.nextContext,
    frame: null,
    message: actionText(kaohsiung, "雙下巴／嘴邊肉"),
    turn: turn++,
  });
  assert.ok(!actions(kaohsiungDoubleChin).some((item) => item.action.label === "EMFACE"));

  const taichungEntry = await route({
    context: createEmptyConversationContext("U-concern-taichung"),
    frame: null,
    message: "我在台中，我想依困擾找適合療程",
    turn: turn++,
  });
  const taichungDoubleChin = await route({
    context: taichungEntry.decision.nextContext,
    frame: null,
    message: actionText(taichungEntry, "雙下巴／嘴邊肉"),
    turn: turn++,
  });
  assert.ok(actions(taichungDoubleChin).some((item) => item.action.label === "EMFACE"));

  const taichungLoose = await route({
    context: taichungEntry.decision.nextContext,
    frame: null,
    message: actionText(taichungEntry, "臉部鬆弛／下垂"),
    turn: turn++,
  });
  assert.deepEqual(actions(taichungLoose).map((item) => item.action.label), [
    "十蓓電波", "鳳凰電波", "美國音波 2.0", "Q+音波", "ONDA PRO", "EMFACE",
  ]);

  const candidateIdentityCases = [
    [unknownBranch, ["ONDA PRO", "十蓓電波", "美國音波 2.0", "Q+音波"], ["onda_pro", "tenthermage", "ultherapy", "qplus"]],
    [wrinkles, ["肉毒", "十蓓電波", "玻尿酸", "逆時針"], ["botox", "tenthermage", "filler", "counterclockwise"]],
    [skin, ["探索皮秒", "M22 彩衝光", "LUMECCA 三倍光", "水飛梭", "水光針"], ["pico", "m22_ipl", "lumecca", "hydrafacial", "skin_booster"]],
    [loose, ["十蓓電波", "鳳凰電波", "美國音波 2.0", "Q+音波", "ONDA PRO"], ["tenthermage", "phoenix_thermage", "ultherapy", "qplus", "onda_pro"]],
    [taichungDoubleChin, ["EMFACE"], ["emface"]],
    [taichungLoose, ["EMFACE"], ["emface"]],
  ] as const;
  for (const [surface, labels, expectedKeys] of candidateIdentityCases) {
    for (const [index, label] of labels.entries()) {
      const expectedKey = expectedKeys[index]!;
      const selected = await route({
        context: surface.decision.nextContext,
        frame: frame([expectedKey === "emface" ? "fisbo" : expectedKey]),
        message: actionText(surface, label),
        turn: turn++,
      });
      const treatmentKeys = selected.decision.nextContext.conversationV2State?.knowledge.treatmentKeys ?? [];
      assert.ok(treatmentKeys.includes(expectedKey), `${label} must enter ${expectedKey}`);
      if (expectedKey === "phoenix_thermage") assert.ok(!treatmentKeys.includes("tenthermage"));
      if (expectedKey === "emface") assert.ok(!treatmentKeys.includes("fisbo"));
    }
  }

  const selectedEmface = await route({
    context: taichungDoubleChin.decision.nextContext,
    frame: frame(["fisbo"]),
    message: actionText(taichungDoubleChin, "EMFACE"),
    turn: turn++,
  });
  const emfaceKeys = selectedEmface.decision.nextContext.conversationV2State?.knowledge.treatmentKeys ?? [];
  assert.ok(emfaceKeys.includes("emface"));
  assert.ok(!emfaceKeys.includes("fisbo"));

  const selectedPhoenix = await route({
    context: loose.decision.nextContext,
    frame: frame(["phoenix_thermage"]),
    message: actionText(loose, "鳳凰電波"),
    turn: turn++,
  });
  const phoenixKeys = selectedPhoenix.decision.nextContext.conversationV2State?.knowledge.treatmentKeys ?? [];
  assert.ok(phoenixKeys.includes("phoenix_thermage"));
  assert.ok(!phoenixKeys.includes("tenthermage"));

  const selectedFiller = await route({
    context: wrinkles.decision.nextContext,
    frame: frame(["filler"]),
    message: actionText(wrinkles, "玻尿酸"),
    turn: turn++,
  });
  assert.ok(["適合方向", "預約免費諮詢", "真人客服協助"].every((label) =>
    actions(selectedFiller).some((item) => item.action.label === label),
  ));
  assert.ok(actions(selectedFiller).some((item) =>
    ["價格／活動", "本療程價格"].includes(item.action.label),
  ));

  const booking = await route({
    context: entry.decision.nextContext,
    frame: null,
    message: actionText(entry, "不確定，想預約免費諮詢"),
    turn: turn++,
  });
  assert.equal(booking.decision.nextContext.conversationV2State?.bookingTask.status, "collecting");
  assert.doesNotMatch(booking.decision.replyText, /預約(?:已)?成功|已完成預約/u);

  const unavailable = await route({
    context: entry.decision.nextContext,
    frame: null,
    message: actionText(entry, "雙下巴／嘴邊肉"),
    notOfferedTreatmentKeys: ["qplus"],
    turn: turn++,
  });
  assert.ok(!actions(unavailable).some((item) => item.action.label === "Q+音波"));

  const unknown = await route({
    context: entry.decision.nextContext,
    frame: null,
    message: actionText(entry, "雙下巴／嘴邊肉"),
    staleTreatmentKeys: ["qplus"],
    turn: turn++,
  });
  assert.ok(!actions(unknown).some((item) => item.action.label === "Q+音波"));

  for (const mode of ["human_active", "ai_paused"] as const) {
    const controlledContext = structuredClone(entry.decision.nextContext);
    assert.ok(controlledContext.conversationV2State);
    controlledContext.conversationV2State.control.mode = mode;
    const controlled = await route({
      context: controlledContext,
      frame: null,
      message: "我想依困擾找適合療程",
      turn: turn++,
    });
    assert.notEqual(controlled.policyAction, "launch_concern_projection");
    assert.ok(!actions(controlled).some((item) => item.action.label === "雙下巴／嘴邊肉"));
  }

  const safety = await route({
    context: entry.decision.nextContext,
    frame: null,
    message: "我昨天打完很腫",
    turn: turn++,
  });
  assert.equal(safety.decision.decisionType, "handoff_pending");
  assert.equal(actions(safety).length, 0);
  console.log("Concern candidate projection validation passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
