import { clinicConfig, type TreatmentConversationPack } from "@/lib/clinic-config";
import { createEmptyConversationContext } from "@/lib/conversation-context";
import { routeCustomerMessage } from "@/lib/router";

const NOW = new Date("2026-08-10T06:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function route(message: string) {
  return routeCustomerMessage({
    conversationContext: createEmptyConversationContext("routing-snapshot"),
    includePending: false,
    message,
    now: NOW,
  });
}

async function main() {
  const snapshots = [
    { message: "我想改善魚尾紋", decisionType: "treatment_intro_reply", matchedKey: "treatment_consult:botox" },
    { message: "我在意毛孔粗大", decisionType: "treatment_intro_reply", matchedKey: "treatment_consult:pico" },
    { message: "我想改善雙下巴", decisionType: "treatment_intro_reply", matchedKey: "treatment_consult:onda_pro" },
  ];

  for (const snapshot of snapshots) {
    const decision = await route(snapshot.message);
    assert(decision.decisionType === snapshot.decisionType, `${snapshot.message}: decision type changed`);
    assert(decision.matchedKey === snapshot.matchedKey, `${snapshot.message}: matched key changed`);
  }

  const tenthermage = clinicConfig.treatmentList.find((treatment) => treatment.key === "tenthermage");
  assert(tenthermage, "snapshot fixture requires tenthermage");
  const originalGuide = tenthermage.consultationGuide;
  const competingGuide: TreatmentConversationPack = {
    concernReplies: [
      {
        concernKey: "jawline_looseness",
        discoveryLabel: "fixture concern",
        followupPrompt: "想先了解哪個方向呢？",
        reply: "fixture only",
      },
    ],
    discoveryQuestion: "fixture only",
    featureSummary: "fixture only",
    followupPrompt: "fixture only",
  };

  try {
    tenthermage.consultationGuide = competingGuide;
    const ambiguous = await route("我想改善雙下巴");
    assert(ambiguous.decisionType === "treatment_intro_reply", "multiple eligible packs must remain in the guided treatment flow");
    assert(
      ambiguous.matchedKey === "treatment_consult:clarify:jawline_looseness",
      "ambiguous concern must have a stable snapshot key",
    );
    assert(ambiguous.replyText.includes("ONDA PRO") && ambiguous.replyText.includes("十蓓電波"), "clarification must name every eligible pack");
  } finally {
    tenthermage.consultationGuide = originalGuide;
  }

  console.log("routing snapshot validation passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
