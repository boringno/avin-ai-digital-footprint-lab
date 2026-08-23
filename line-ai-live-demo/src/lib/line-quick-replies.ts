import type { LineQuickReplyItem, LineReplyMessage, LineTextMessage } from "@/lib/treatment-carousel";

const CONSULTATION_ACTIONS = [
  { label: "預約免費諮詢", text: "我要預約免費諮詢" },
  { label: "真人客服協助", text: "我要找真人客服" },
  { label: "繼續詢問", text: "繼續詢問" },
] as const;

const BRANCH_ACTIONS = ["高雄館", "台中館", "桃園館", "林口館"].map((branch) => ({
  label: branch,
  text: branch,
}));

const FIRST_VISIT_ACTIONS = ["初診", "複診"].map((value) => ({ label: value, text: value }));

export function approvedQuickReplyItems(replyText: string): LineQuickReplyItem[] {
  if (
    replyText.includes("📅 預約免費諮詢") &&
    replyText.includes("👩‍💼 真人客服協助") &&
    replyText.includes("💬 繼續詢問")
  ) {
    return toLineItems(CONSULTATION_ACTIONS);
  }

  if (replyText.includes("較方便前往哪個館別")) {
    return toLineItems(BRANCH_ACTIONS);
  }
  if (replyText.includes("初診還是複診")) {
    return toLineItems(FIRST_VISIT_ACTIONS);
  }

  return [];
}

export function lineQuickReplyItems(
  actions: readonly { label: string; text: string }[],
): LineQuickReplyItem[] {
  return toLineItems(actions);
}

export function attachApprovedQuickReplies(
  messages: readonly LineReplyMessage[],
  replyText: string,
  explicitItems?: readonly LineQuickReplyItem[],
) {
  const items = explicitItems?.length
    ? [...explicitItems]
    : approvedQuickReplyItems(replyText);
  if (items.length === 0) return [...messages];

  let lastTextIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.type === "text") {
      lastTextIndex = index;
      break;
    }
  }
  if (lastTextIndex < 0) return [...messages];

  return messages.map((message, index) => {
    if (index !== lastTextIndex || message.type !== "text") return message;
    return {
      ...message,
      quickReply: { items },
    } satisfies LineTextMessage;
  });
}

function toLineItems(actions: readonly { label: string; text: string }[]): LineQuickReplyItem[] {
  return actions.map((action) => ({
    action: {
      label: action.label,
      text: action.text,
      type: "message",
    },
    type: "action",
  }));
}
