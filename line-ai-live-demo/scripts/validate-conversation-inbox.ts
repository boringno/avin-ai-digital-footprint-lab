import { matchesConversationSearch, type ConversationInboxItem } from "../src/lib/admin-conversation-inbox-data";
import {
  ADMIN_CONVERSATION_MESSAGE_LIMIT,
  orderNewestMessagesChronologically,
} from "../src/lib/admin-workbench-data";
import { getConversationDecisionTrace } from "../src/lib/admin-conversation-decision-trace";

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const sample: ConversationInboxItem = {
  conversationId: "conversation-demo",
  customerName: "王小明",
  displayName: "+7",
  lastMessage: "想詢問高雄館的預約時間",
  lastSeenAt: "2026-07-22T10:00:00.000Z",
  lineUserId: "U1234567890abcdef",
  pregnancyRisk: false,
  status: "ai_active",
};

expect(matchesConversationSearch(sample, "王小明"), "應可用客人姓名搜尋");
expect(matchesConversationSearch(sample, "+7"), "應可用 LINE 顯示名稱搜尋");
expect(matchesConversationSearch(sample, "高雄館"), "應可用最後訊息搜尋");
expect(matchesConversationSearch(sample, "u123456"), "應可用 LINE ID 搜尋");
expect(!matchesConversationSearch(sample, "不存在的客人"), "不相符的搜尋不得命中");

const chronologicalMessages = Array.from({ length: ADMIN_CONVERSATION_MESSAGE_LIMIT + 1 }, (_, index) => index + 1);
const newestFirstLimitedMessages = [...chronologicalMessages].reverse().slice(0, ADMIN_CONVERSATION_MESSAGE_LIMIT);
const timelineMessages = orderNewestMessagesChronologically(newestFirstLimitedMessages);

expect(timelineMessages.length === 80, "對話時間軸應保留最新 80 筆");
expect(timelineMessages[0] === 2, "最新 80 筆應排除最舊的一筆");
expect(timelineMessages.at(-1) === 81, "時間軸最後一筆應是最新訊息");

const decisionTrace = getConversationDecisionTrace({
  conversation_v2_nlu_confidence: 0.84,
  conversation_v2_nlu_status: "success",
  conversation_v2_policy_action: "answer_followup",
  conversation_v2_tool_request_type: "request_fact_confirmation",
  matched_key: "conversation_v2:answer_followup",
  renderer_fallback_reason: "generator_unavailable",
  renderer_guard_replaced_text: true,
  renderer_mode: "fallback",
  renderer_reply_text_source: "approved_fallback",
  reply_delivery_attempts: 1,
  reply_delivery_status: "sent",
  reply_delivery_suppressed_reason: null,
  route_version: "v2",
});
expect(decisionTrace?.routeVersion === "v2", "決策路徑應顯示實際 V1/V2 路由");
expect(decisionTrace?.policyAction === "answer_followup", "決策路徑應保留 policy action");
expect(decisionTrace?.nluStatus === "success" && decisionTrace.nluConfidence === 0.84, "決策路徑應保留 NLU 狀態與信心");
expect(decisionTrace?.fallbackReason === "generator_unavailable", "決策路徑應保留 fallback 原因");
expect(decisionTrace?.guardReplacedText === true, "決策路徑應顯示 guard 是否替換客人文字");
expect(decisionTrace?.replyTextSource === "approved_fallback", "決策路徑應顯示客人文字來源");
expect(decisionTrace?.replyDeliveryStatus === "sent" && decisionTrace.replyDeliveryAttempts === 1, "決策路徑應顯示 LINE 送達結果");
expect(getConversationDecisionTrace({ official_source_url: "https://internal.example" }) === null, "後台決策路徑不得暴露內部來源網址");
expect(getConversationDecisionTrace(null) === null, "舊訊息沒有 telemetry 時應維持相容");

console.log("Conversation inbox validation passed: 17 checks");
