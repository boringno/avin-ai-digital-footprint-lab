import {
  filterDirectMessageResults,
  isGroupSourceResult,
  type ProcessedWebhookResult,
} from "../src/lib/line-webhook";

function result(sourceType: string, sourceUserId = "U-test") {
  return { sourceType, sourceUserId } as Pick<ProcessedWebhookResult, "sourceType" | "sourceUserId">;
}

const cases = [
  { name: "group events are isolated even when LINE supplies a user ID", passed: isGroupSourceResult(result("group")) },
  { name: "room events are isolated even when LINE supplies a user ID", passed: isGroupSourceResult(result("room")) },
  { name: "direct user events remain eligible", passed: !isGroupSourceResult(result("user")) },
  {
    name: "external sync receives only direct user events",
    passed:
      filterDirectMessageResults([result("group"), result("room"), result("user")]).length === 1 &&
      filterDirectMessageResults([result("group"), result("room"), result("user")])[0]?.sourceType === "user",
  },
];

for (const testCase of cases) {
  console.log(`${testCase.passed ? "PASS" : "FAIL"}: ${testCase.name}`);
}

if (cases.some((testCase) => !testCase.passed)) {
  process.exitCode = 1;
} else {
  console.log(`Group source isolation validation passed: ${cases.length} cases`);
}
