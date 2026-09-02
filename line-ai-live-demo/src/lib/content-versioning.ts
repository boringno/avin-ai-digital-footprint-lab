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

export type CampaignBookingFields = {
  bookingTreatments: string[];
  startsBookingIntake: boolean;
};

export type CampaignApplicabilityFields = {
  dose: string;
  packageKey: string;
  sessionCount: string;
  variantKey: string;
};

export type CampaignQuoteSettings = {
  quotePriority: string;
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
  assertRequiredText(input.payload, "customer_price_text", "請填寫客人可見的核准價格文字。");
  assertRequiredText(input.payload, "branch_scope", "請填寫適用館別。");
  assertRequiredText(input.payload, "fallback_message", "請填寫無法直接套用時的保守說明。");
  assertCampaignBookingFields(input.payload);
  assertCampaignApplicabilityFields(input.payload);
  assertCampaignQuoteSettings(input.payload);
  if (!input.startAt || !input.endAt) {
    throw new Error("活動內容必須填寫開始與結束時間。");
  }
}

export function readCampaignBookingFields(payload: Record<string, unknown>): CampaignBookingFields {
  return {
    bookingTreatments: normalizeBookingTreatments(payload.booking_treatments),
    startsBookingIntake: payload.starts_booking_intake === true || payload.starts_booking_intake === "true",
  };
}

export function writeCampaignBookingFields(input: {
  bookingTreatments: readonly string[] | string;
  startsBookingIntake: boolean;
}) {
  return {
    booking_treatments: normalizeBookingTreatments(input.bookingTreatments),
    starts_booking_intake: input.startsBookingIntake ? "true" : "false",
  };
}

export function readCampaignApplicabilityFields(
  payload: Record<string, unknown>,
): CampaignApplicabilityFields {
  return {
    dose: optionalScalarText(payload.dose),
    packageKey: optionalScalarText(payload.package_key),
    sessionCount: optionalScalarText(payload.session_count),
    variantKey: optionalScalarText(payload.variant_key),
  };
}

export function writeCampaignApplicabilityFields(input: CampaignApplicabilityFields) {
  return {
    dose: input.dose.trim(),
    package_key: input.packageKey.trim(),
    session_count: input.sessionCount.trim(),
    variant_key: input.variantKey.trim(),
  };
}

export function readCampaignQuoteSettings(
  payload: Record<string, unknown>,
): CampaignQuoteSettings {
  return { quotePriority: optionalScalarText(payload.quote_priority) };
}

export function writeCampaignQuoteSettings(input: CampaignQuoteSettings) {
  return { quote_priority: input.quotePriority.trim() };
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

function assertCampaignBookingFields(payload: Record<string, unknown>) {
  const bookingTreatments = payload.booking_treatments;
  if (
    bookingTreatments !== undefined &&
    typeof bookingTreatments !== "string" &&
    !(Array.isArray(bookingTreatments) && bookingTreatments.every((value) => typeof value === "string"))
  ) {
    throw new Error("預約療程組合請使用療程名稱清單。");
  }

  const startsBookingIntake = payload.starts_booking_intake;
  if (
    startsBookingIntake !== undefined &&
    startsBookingIntake !== "true" &&
    startsBookingIntake !== "false"
  ) {
    throw new Error("是否接續預約必須儲存為 true 或 false 文字值。");
  }
}

function assertCampaignApplicabilityFields(payload: Record<string, unknown>) {
  for (const key of ["dose", "package_key", "variant_key"] as const) {
    const value = payload[key];
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`${key} must be text when provided`);
    }
  }

  const sessionCount = payload.session_count;
  if (
    sessionCount !== undefined &&
    typeof sessionCount !== "string" &&
    !(typeof sessionCount === "number" && Number.isInteger(sessionCount) && sessionCount > 0)
  ) {
    throw new Error("session_count must be a positive integer or text when provided");
  }
}

function assertCampaignQuoteSettings(payload: Record<string, unknown>) {
  const raw = payload.quote_priority;
  if (raw === undefined || raw === "") return;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error("一般詢價主方案順位必須是 0 至 10000 的整數。");
  }
}

function optionalScalarText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeBookingTreatments(value: unknown) {
  const values = typeof value === "string"
    ? value.split(/[|、,，\n]/u)
    : Array.isArray(value)
      ? value
      : [];

  return Array.from(new Set(
    values
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  ));
}
