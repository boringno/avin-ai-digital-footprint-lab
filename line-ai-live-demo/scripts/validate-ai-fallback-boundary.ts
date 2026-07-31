import { buildSystemPrompt } from "../src/lib/openai-client";
import { routeCustomerMessage, shouldAllowAiFallbackReply } from "../src/lib/router";

const NOW = new Date("2026-07-31T04:00:00.000Z");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function route(message: string) {
  return routeCustomerMessage({ includePending: false, message, now: NOW });
}

async function assertBlocked(caseId: string, message: string) {
  const decision = await route(message);
  assert(!shouldAllowAiFallbackReply(message), `${caseId}: must not be eligible for the LLM fallback`);
  assert(decision.decisionType !== "fallback_reply", `${caseId}: must not remain a generic fallback`);
  console.log(`PASS: ${caseId} blocked from LLM (${decision.decisionType}/${decision.matchedKey})`);
}

async function main() {
  await assertBlocked("A1", "台北有分店嗎");
  await assertBlocked("A2", "台南有據點嗎");
  await assertBlocked("A3", "新竹有分店嗎");
  await assertBlocked("A4", "你們有做抽脂嗎");
  await assertBlocked("A5", "有做隆乳嗎");
  await assertBlocked("A6", "有沒有做植髮");
  await assertBlocked("A7", "台北館有嗎");

  const parking = await route("停車方便嗎");
  assert(shouldAllowAiFallbackReply("停車方便嗎") && parking.decisionType !== "handoff_pending", "A8: parking question must not be over-blocked");
  console.log("PASS: A8 parking question remains eligible and uses its existing deterministic reply");

  const card = await route("可以刷卡嗎");
  assert(shouldAllowAiFallbackReply("可以刷卡嗎") && card.decisionType !== "handoff_pending", "A9: card question must not be over-blocked");
  console.log("PASS: A9 card question remains eligible and is answered deterministically");

  const activeBranch = await route("高雄館在哪");
  assert(!shouldAllowAiFallbackReply("高雄館在哪") && activeBranch.matchedKey === "branch_address:高雄館", "A10: active branch must use the existing branch reply");
  console.log("PASS: A10 active branch uses existing branch reply");

  const approvedTreatment = await route("肉毒有做嗎");
  assert(approvedTreatment.decisionType === "treatment_intro_reply", "A11: approved treatment must not be handoff-blocked");
  console.log("PASS: A11 approved treatment remains answerable");

  const nearestClinic = await route("離我最近的診所是哪一間");
  assert(
    nearestClinic.matchedKey === "nearest_branch_clarify" && nearestClinic.decisionType === "clinic_info_reply",
    "A12: generic clinic wording must retain the existing nearest-branch clarification",
  );
  console.log("PASS: A12 nearest-clinic wording retains the existing nearest-branch clarification");

  const recommendedClinic = await route("推薦的診所有哪些");
  assert(
    recommendedClinic.decisionType !== "handoff_pending" &&
      !recommendedClinic.matchedKey.startsWith("unsupported_branch_query:"),
    "A13: generic clinic wording must not be mistaken for an unavailable branch",
  );
  console.log("PASS: A13 recommended-clinic wording is not blocked as an unavailable branch");

  const systemPrompt = buildSystemPrompt();
  for (const branch of ["高雄館", "台中館", "桃園館", "林口館"]) {
    assert(systemPrompt.includes(branch), `Prompt must include active branch: ${branch}`);
  }
  assert(!systemPrompt.includes("台北館") && !systemPrompt.includes("台南館"), "Prompt must exclude inactive branches");
  console.log("PASS: system prompt contains active branches and excludes inactive branches");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
