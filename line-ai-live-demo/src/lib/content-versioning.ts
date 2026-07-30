export const editableContentTypes = ["faq", "campaign"] as const;

export type EditableContentType = (typeof editableContentTypes)[number];
export type ContentVersionStatus = "draft" | "in_review" | "changes_requested" | "approved" | "published" | "disabled" | "expired";

export type ContentDraftInput = {
  changeReason: string;
  contentKey: string;
  contentType: EditableContentType;
  displayName: string;
  endAt: string | null;
  payload: Record<string, unknown>;
  startAt: string | null;
};

const contentKeyPattern = /^[a-z0-9][a-z0-9_-]{1,79}$/;

export function assertContentDraftInput(input: ContentDraftInput) {
  if (!input.displayName.trim()) {
    throw new Error("A display name is required");
  }
  if (!contentKeyPattern.test(input.contentKey)) {
    throw new Error("內容識別名稱請使用 2 至 80 碼的小寫英文、數字、- 或 _。");
  }
  if (!input.changeReason.trim()) {
    throw new Error("請填寫這次修改的原因。");
  }
  if (input.endAt && input.startAt && new Date(input.endAt) <= new Date(input.startAt)) {
    throw new Error("結束時間必須晚於開始時間。");
  }

  if (input.contentType === "faq") {
    assertRequiredText(input.payload, "question_pattern", "請填寫客人常見問法。");
    assertRequiredText(input.payload, "answer_text", "請填寫核准回覆內容。");
    assertRequiredText(input.payload, "topic", "請填寫問題分類。");
    return;
  }

  assertRequiredText(input.payload, "campaign_name", "請填寫活動名稱。");
  assertRequiredText(input.payload, "treatment_name", "請填寫適用療程。");
  assertRequiredText(input.payload, "price_text", "請填寫活動價格說明。");
  assertRequiredText(input.payload, "branch_scope", "請填寫適用館別。");
  assertRequiredText(input.payload, "fallback_message", "請填寫無法直接套用時的保守說明。");
  if (!input.startAt || !input.endAt) {
    throw new Error("活動內容必須填寫開始與結束時間。");
  }
}

export type ContentVersionAction = "submit" | "approve" | "request_changes" | "publish" | "disable";

export function canTransitionContentStatus(from: ContentVersionStatus, action: ContentVersionAction) {
  if (action === "submit") return from === "draft";
  if (action === "approve" || action === "request_changes") return from === "in_review";
  if (action === "publish") return from === "approved";
  return from === "draft" || from === "in_review" || from === "changes_requested" || from === "approved" || from === "published";
}

function assertRequiredText(payload: Record<string, unknown>, key: string, message: string) {
  if (typeof payload[key] !== "string" || !payload[key].trim()) {
    throw new Error(message);
  }
}
