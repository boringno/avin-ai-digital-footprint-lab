import { classifyMessageIntent, type IntentKey } from "../src/lib/intent-classify";
import { redactQuestionForAnalytics } from "../src/lib/security-redaction";

type Fixture = {
  expected: IntentKey;
  input: Parameters<typeof classifyMessageIntent>[0];
  name: string;
};

const fixtures: Fixture[] = [
  { name: "branch", expected: "branch_info", input: { decisionType: "clinic_info_reply", matchedKey: "branch_address:kaohsiung" } },
  { name: "pricing", expected: "pricing", input: { decisionType: "pricing_auto_reply", matchedKey: "pricing_followup" } },
  { name: "campaign", expected: "campaign", input: { decisionType: "pricing_auto_reply", matchedKey: "promotion_followup" } },
  { name: "treatment", expected: "treatment", input: { decisionType: "treatment_intro_reply", matchedKey: "treatment_intro:onda" } },
  { name: "booking new", expected: "booking_new", input: { decisionType: "booking_intake_reply", matchedKey: "booking_intake" } },
  { name: "booking modify", expected: "booking_modify", input: { decisionType: "booking_intake_reply", matchedKey: "booking_modify_branch" } },
  { name: "booking cancel", expected: "booking_cancel", input: { decisionType: "booking_intake_reply", matchedKey: "booking_cancel" } },
  { name: "post treatment", expected: "post_treatment", input: { decisionType: "handoff_pending", matchedKey: "post_procedure_issue" } },
  { name: "pregnancy", expected: "pregnancy_nursing", input: { decisionType: "medical_guidance_reply", matchedKey: "pregnancy_caution" } },
  { name: "complaint", expected: "complaint", input: { decisionType: "handoff_pending", matchedKey: "serious_complaint" } },
  { name: "human request", expected: "human_request", input: { decisionType: "handoff_pending", matchedKey: "human_request" } },
  { name: "schedule", expected: "schedule", input: { decisionType: "doctor_schedule_auto_reply", matchedKey: "doctor_schedule_found:demo" } },
  { name: "off topic", expected: "off_topic", input: { decisionType: "faq_auto_reply", matchedKey: "off_topic" } },
  { name: "unclassified", expected: "unclassified", input: { decisionType: "ai_auto_reply", matchedKey: "ai_general_answer" } },
];

let failed = false;
for (const fixture of fixtures) {
  const result = classifyMessageIntent(fixture.input);
  if (result.intentKey !== fixture.expected) {
    failed = true;
    console.error(`FAIL ${fixture.name}: expected ${fixture.expected}, got ${result.intentKey}`);
  } else {
    console.log(`PASS ${fixture.name}: ${result.intentKey}`);
  }
}

const redacted = redactQuestionForAnalytics(
  "我是王小明，王小姐您好，電話 0912-345-678、02-1234-5678，LINE ID: chen0912tw，卡號 3782-822463-10005，信箱 test@example.com",
);
if (
  ["王小明", "王小姐", "0912", "02-1234", "chen0912tw", "3782", "test@example.com"].some((value) => redacted.includes(value))
) {
  failed = true;
  console.error("FAIL analytics redaction: contact data was retained");
} else {
  console.log("PASS analytics redaction");
}

if (failed) {
  process.exitCode = 1;
}
