import { createEmptyConversationContext } from "../src/lib/conversation-context";
import { routeCustomerMessage } from "../src/lib/router";

const STEPS = [
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_location_preference:高雄館",
    message: "我住高雄",
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "nearest_branch:高雄館",
    message: "離我最近的診所是哪一間",
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_focus:高雄館",
    message: "高雄館",
  },
  {
    expectedDecisionType: "clinic_info_reply",
    expectedMatchedKey: "branch_address:高雄館",
    message: "地址",
  },
];

async function main() {
  let context = createEmptyConversationContext("demo-user");
  const results = [];

  for (const step of STEPS) {
    const result = await routeCustomerMessage({
      conversationContext: context,
      includePending: false,
      message: step.message,
    });

    context = result.nextContext;
    results.push({
      context: {
        lastReferencedBranch: context.lastReferencedBranch,
        locationPreference: context.locationPreference,
        preferredBranch: context.preferredBranch,
      },
      expectedDecisionType: step.expectedDecisionType,
      expectedMatchedKey: step.expectedMatchedKey,
      message: step.message,
      passed: result.decisionType === step.expectedDecisionType && result.matchedKey === step.expectedMatchedKey,
      result: {
        decisionType: result.decisionType,
        matchedKey: result.matchedKey,
        replyText: result.replyText,
      },
    });
  }

  console.log(JSON.stringify(results, null, 2));

  if (results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
