import { addCustomerReplyTone } from "../src/lib/reply-tone";
import { processWebhookRequestBody } from "../src/lib/line-webhook";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const cases = [
  { name: "branch", tone: { decisionType: "clinic_info_reply", matchedKey: "branch_list" }, expected: "📍" },
  { name: "booking", tone: { decisionType: "booking_intake_reply", matchedKey: "booking_intake" }, expected: "📅" },
  { name: "pricing", tone: { decisionType: "pricing_auto_reply", matchedKey: "ONDA PRO" }, expected: "✨" },
  { name: "treatment", tone: { decisionType: "treatment_intro_reply", matchedKey: "treatment_intro:other" }, expected: "🌿" },
  { name: "schedule", tone: { decisionType: "doctor_schedule_auto_reply", matchedKey: "doctor_schedule_found" }, expected: "🗓️" },
  { name: "handoff", tone: { decisionType: "handoff_pending", matchedKey: "post_procedure_issue" }, expected: "🧑‍⚕️" },
  { name: "general faq", tone: { decisionType: "faq_auto_reply", matchedKey: "faq:parking" }, expected: "😊" },
] as const;

async function main() {
  for (const testCase of cases) {
    const reply = addCustomerReplyTone("這是測試回覆。", testCase.tone);
    assert(reply.startsWith(testCase.expected), `${testCase.name}: must use the appropriate emoji`);
  }

  const existingEmoji = addCustomerReplyTone("🌿 已有院方核准的療程文案。", {
    decisionType: "treatment_intro_reply",
    matchedKey: "treatment_intro:onda_pro",
  });
  assert(existingEmoji === "🌿 已有院方核准的療程文案。", "existing emoji: must not add a second emoji");
  assert(addCustomerReplyTone("   ", { decisionType: "faq_auto_reply", matchedKey: "faq" }) === "", "empty: must remain empty");

  const result = await processWebhookRequestBody(JSON.stringify({
    events: [
      {
        message: { id: "reply-tone-payment", text: "付款方式有哪些", type: "text" },
        replyToken: "reply-tone-token",
        source: { type: "user", userId: "Ureplytonepayment000000000000000000" },
        type: "message",
        webhookEventId: "reply-tone-event",
      },
    ],
  }), { includePending: false });
  const paymentReply = result.results[0];
  assert(paymentReply.decision.replyText.startsWith("💳"), "webhook: payment decision must receive the payment emoji");
  assert(
    paymentReply.replyPayload?.messages.some(
      (message) => message.type === "text" && message.text.split("\n").some((line) => line.startsWith("💳")),
    ),
    "webhook: outgoing LINE text must keep the payment emoji",
  );

  console.log(`reply tone validation passed (${cases.length + 4} checks)`);
}

void main();
