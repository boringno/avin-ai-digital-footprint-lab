import { matchesConversationSearch, type ConversationInboxItem } from "../src/lib/admin-conversation-inbox-data";
import {
  ADMIN_CONVERSATION_MESSAGE_LIMIT,
  orderNewestMessagesChronologically,
} from "../src/lib/admin-workbench-data";

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

console.log("Conversation inbox validation passed: 8 checks");
