"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";

import { bookingStatusLabels, type BookingStatusKey } from "@/lib/admin-display-maps";
import {
  getWorkbenchQueueControlAction,
  getWorkbenchQueuePrimaryLabel,
  getWorkbenchQueueStatusLabel,
  getWorkbenchQueueStatusText,
} from "@/lib/admin-workbench-presentation";
import { useChatTimelineScroll } from "@/hooks/use-chat-timeline-scroll";

type QueueItem = {
  conversationId: string;
  createdAt: string;
  customerName: string | null;
  displayName: string;
  handoffReason: string;
  interestedTreatments: string[];
  lastCustomerMessage: string;
  lineUserId: string;
  phoneTail: string | null;
  pregnancyRisk: boolean;
  preferredBranch: string | null;
  status: string;
  taskAssignedTo: string | null;
  taskId: string;
  taskStatus: string;
};

type WorkbenchLeadSummary = {
  bookingStatus: BookingStatusKey;
  conversationId: string;
  customerName: string | null;
  displayName: string;
  id: string;
  interestedTreatments: string[];
  lineUserId: string;
  phone: string | null;
  pregnancyRisk: boolean;
  preferredBranch: string | null;
  preferredTimeSlots: string[];
  updatedAt: string;
};

type MessageItem = {
  content: string;
  createdAt: string;
  direction: "ai" | "customer" | "staff" | "system";
  id: string;
  sendError: string | null;
  sendStatus: string;
  staffName: string | null;
};

type Detail = {
  bookingLead: null | {
    bookingStatus: string;
    customerName: string | null;
    interestedTreatments: string[];
    phone: string | null;
    pregnancyRisk: boolean;
    preferredBranch: string | null;
    preferredTimeSlots: string[];
  };
  consultedTreatments: string[];
  conversationId: string;
  displayName: string;
  leadStage: string;
  lineUserId: string;
  messages: MessageItem[];
  state: {
    assignedTo: string | null;
    hasNewCustomerMessage: boolean;
    status: string;
  };
};

type WorkbenchData = {
  detail: Detail | null;
  leadSummaries: WorkbenchLeadSummary[];
  queue: QueueItem[];
};

type ConversationControlAction = "" | "complete" | "mark_human_active" | "reset_customer" | "resume_ai";

const quickReplies = [
  "收到，我先幫您確認需求，稍後由真人客服接續協助。",
  "好的，館別與療程我先記下來，接著幫您確認可安排時段。",
  "感謝補充，我先整理重點，稍後由客服為您確認。",
  "若您方便，也可以直接提供 3 個可配合時段，我一起整理給客服。",
];

export function WorkbenchClient({
  canResetTestCustomer,
  initialData,
  staffName,
}: {
  canResetTestCustomer: boolean;
  initialData: WorkbenchData;
  staffName: string;
}) {
  const [data, setData] = useState(initialData);
  const [selectedConversationId, setSelectedConversationId] = useState(initialData.detail?.conversationId ?? "");
  const [messageText, setMessageText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isCompact, setIsCompact] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [controlAction, setControlAction] = useState<ConversationControlAction>("");
  const [leadActionId, setLeadActionId] = useState("");
  const [isPending, startTransition] = useTransition();
  const composerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wasPageVisibleRef = useRef(true);
  const {
    handleTimelineScroll,
    prepareForConversationChange,
    timelineRef,
  } = useChatTimelineScroll(
    data.detail?.conversationId,
    data.detail?.messages.at(-1)?.id,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const apply = () => setIsCompact(mediaQuery.matches);
    apply();
    mediaQuery.addEventListener("change", apply);
    return () => mediaQuery.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const syncVisibility = () => setIsPageVisible(document.visibilityState === "visible");
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  async function refresh(conversationId = selectedConversationId) {
    const query = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : "";
    const response = await fetch(`/api/admin/workbench${query}`, { cache: "no-store" });
    if (!response.ok) {
      setErrorMessage("工作台重新整理失敗，請再按一次。");
      return;
    }

    const nextData = (await response.json()) as WorkbenchData;
    setData(nextData);
    if (nextData.detail?.conversationId) {
      setSelectedConversationId(nextData.detail.conversationId);
    } else if (nextData.queue[0]?.conversationId) {
      setSelectedConversationId(nextData.queue[0].conversationId);
    }
  }

  useEffect(() => {
    const resumedFromBackground = isPageVisible && !wasPageVisibleRef.current;
    wasPageVisibleRef.current = isPageVisible;
    if (resumedFromBackground && !controlAction && !leadActionId) {
      void refresh(selectedConversationId);
    }
  }, [controlAction, isPageVisible, leadActionId, selectedConversationId]);

  useEffect(() => {
    if (!isPageVisible) {
      return;
    }
    const timer = window.setInterval(() => {
      if (controlAction || leadActionId) {
        return;
      }
      void refresh(selectedConversationId);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [controlAction, isPageVisible, leadActionId, selectedConversationId]);

  function selectConversation(conversationId: string) {
    if (controlAction || isPending) {
      return;
    }
    prepareForConversationChange();
    setSelectedConversationId(conversationId);
    startTransition(() => {
      void refresh(conversationId);
    });
  }

  async function postControl(
    action: "complete" | "mark_human_active" | "reset_customer" | "resume_ai",
    target?: { conversationId: string; userId: string },
  ) {
    const conversationId = target?.conversationId ?? data.detail?.conversationId ?? "";
    const userId = target?.userId ?? data.detail?.lineUserId ?? "";
    if (!conversationId || !userId || controlAction) {
      return;
    }

    setErrorMessage("");
    setControlAction(action);
    try {
      const response = await fetch("/api/admin/conversations/control", {
        body: JSON.stringify({
          action,
          assigned_to: staffName,
          user_id: userId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const result = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !result.ok) {
        setErrorMessage(
          action === "mark_human_active"
            ? "接手失敗，請再按一次。"
            : action === "complete"
              ? "結案失敗，請再按一次。"
              : action === "reset_customer"
                ? result.error || "重置測試狀態失敗，請再按一次。"
                : "交由 AI 協助失敗，請再按一次。",
        );
        return;
      }

      setSelectedConversationId(conversationId);
      await refresh(conversationId);
    } catch {
      setErrorMessage(
        action === "mark_human_active"
          ? "接手失敗，請再按一次。"
          : action === "complete"
            ? "結案失敗，請再按一次。"
            : action === "reset_customer"
              ? "重置測試狀態失敗，請再按一次。"
              : "交由 AI 協助失敗，請再按一次。",
      );
    } finally {
      setControlAction("");
    }
  }

  async function updateLeadStatus(lead: WorkbenchLeadSummary, bookingStatus: BookingStatusKey) {
    if (leadActionId) {
      return;
    }

    setErrorMessage("");
    setLeadActionId(lead.id);
    try {
      const response = await fetch("/api/admin/leads/update", {
        body: JSON.stringify({
          booking_status: bookingStatus,
          lead_id: lead.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !result.ok) {
        setErrorMessage("更新預約線索失敗，請再按一次。");
        return;
      }

      if (bookingStatus === "booked") {
        await postControl("complete", {
          conversationId: lead.conversationId,
          userId: lead.lineUserId,
        });
      }
      await refresh(bookingStatus === "booked" ? lead.conversationId : selectedConversationId);
    } catch {
      setErrorMessage("更新預約線索失敗，請再按一次。");
    } finally {
      setLeadActionId("");
    }
  }

  async function sendStaffMessage() {
    if (!data.detail || !messageText.trim() || isSending) {
      return;
    }

    setErrorMessage("");
    setIsSending(true);
    try {
      const response = await fetch("/api/admin/conversations/staff-message", {
        body: JSON.stringify({
          assigned_to: staffName,
          message_text: messageText.trim(),
          user_id: data.detail.lineUserId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const result = (await response.json()) as { line_push?: { ok?: boolean }; ok?: boolean };
      if (!response.ok || !result.ok) {
        setErrorMessage("傳送訊息失敗，請重新送出。");
        return;
      }

      if (result.line_push && !result.line_push.ok) {
        setErrorMessage("訊息已寫入後台，但 LINE 推送失敗，請再確認一次。");
      }

      setMessageText("");
      await refresh(data.detail.conversationId);
    } finally {
      setIsSending(false);
    }
  }

  function focusComposer() {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => textareaRef.current?.focus(), 180);
  }

  const detail = data.detail;
  const pendingItems = data.queue.filter((item) => item.taskStatus === "open");
  const activeItems = data.queue.filter((item) => item.taskStatus === "taken" || item.status === "human_active");
  const stickyControlAction = detail?.state.status === "human_active" ? "resume_ai" : "mark_human_active";

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {errorMessage ? <div style={errorStyle}>{errorMessage}</div> : null}

      <div style={summaryStripStyle}>
        <SummaryPill label="待接手" tone="red" value={pendingItems.length} />
        <SummaryPill label="服務與追蹤中" tone="green" value={activeItems.length} />
        <SummaryPill label="今日要聯繫" tone="yellow" value={data.leadSummaries.length} />
      </div>

      <div style={isCompact ? compactLayoutStyle : wideLayoutStyle}>
        <div style={{ display: "grid", gap: 14 }}>
          <section style={panelStyle}>
            <SectionHeader
              action={(
                <button
                  disabled={isPending || Boolean(controlAction) || Boolean(leadActionId)}
                  onClick={() => void refresh()}
                  style={ghostButtonStyle}
                  type="button"
                >
                  重新整理
                </button>
              )}
              eyebrow="待接手"
              title={`先處理這 ${pendingItems.length} 位`}
            />
            <div style={{ display: "grid", gap: 10 }}>
              {pendingItems.length === 0 ? <EmptyState text="目前沒有待接手對話。" /> : null}
              {pendingItems.map((item) => (
                <ConversationCard
                  controlAction={controlAction}
                  isCompact={isCompact}
                  isSelected={item.conversationId === selectedConversationId}
                  item={item}
                  key={item.taskId}
                  mode="pending"
                  onOpen={() => selectConversation(item.conversationId)}
                  onPrimary={() =>
                    void postControl("mark_human_active", {
                      conversationId: item.conversationId,
                      userId: item.lineUserId,
                    })
                  }
                />
              ))}
            </div>
          </section>

          <section style={panelStyle}>
            <SectionHeader eyebrow="服務與追蹤中" title={`目前正在處理或追蹤 ${activeItems.length} 位`} />
            <div style={{ display: "grid", gap: 10 }}>
              {activeItems.length === 0 ? <EmptyState text="目前沒有需要真人追蹤的對話。" /> : null}
              {activeItems.map((item) => (
                <ConversationCard
                  controlAction={controlAction}
                  isCompact={isCompact}
                  isSelected={item.conversationId === selectedConversationId}
                  item={item}
                  key={item.taskId}
                  mode="active"
                  onOpen={() => selectConversation(item.conversationId)}
                  onPrimary={() =>
                    void postControl(getWorkbenchQueueControlAction("active", item.status), {
                      conversationId: item.conversationId,
                      userId: item.lineUserId,
                    })
                  }
                />
              ))}
            </div>
          </section>

          <section style={panelStyle}>
            <SectionHeader action={<a href="/admin/leads" style={linkActionStyle}>看完整線索</a>} eyebrow="今日要聯繫" title={`Top 3 追蹤清單`} />
            <div style={{ display: "grid", gap: 10 }}>
              {data.leadSummaries.length === 0 ? <EmptyState text="目前沒有需要追蹤的預約線索。" /> : null}
              {data.leadSummaries.map((lead) => (
                <LeadSummaryCard
                  controlAction={controlAction}
                  isBusy={leadActionId === lead.id}
                  isCompact={isCompact}
                  key={lead.id}
                  lead={lead}
                  onBooked={() => void updateLeadStatus(lead, "booked")}
                  onContacted={() => void updateLeadStatus(lead, "contacted")}
                  onOpenConversation={() => selectConversation(lead.conversationId)}
                />
              ))}
            </div>
          </section>
        </div>

        <section
          style={{
            ...panelStyle,
            paddingBottom: isCompact && detail ? 118 : 16,
          }}
        >
          {!detail ? (
            <EmptyState text="先從左側卡片選一位客人，右邊就會帶出完整對話與快捷操作。" />
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <header style={detailHeaderStyle}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <p style={eyebrowStyle}>對話內容</p>
                    {detail.state.hasNewCustomerMessage ? <span style={newMessagePillStyle}>有新訊息</span> : null}
                  </div>
                  <h2 style={detailNameStyle}>{detail.displayName}</h2>
                  {hasDistinctCustomerName(detail.bookingLead?.customerName, detail.displayName) ? (
                    <p style={detailCustomerNameStyle}>客人姓名：{detail.bookingLead?.customerName}</p>
                  ) : null}
                  <p style={detailCaptionStyle}>{formatLineIdentity(detail.lineUserId, isCompact)}</p>
                </div>
                <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                  {detail.bookingLead?.pregnancyRisk ? <PregnancyRiskBadge /> : null}
                  <StatusBadge label={formatRuntimeStatus(detail.state.status)} tone={detail.state.status === "human_active" ? "green" : "red"} />
                  {detail.state.assignedTo ? <span style={metaChipStyle}>目前由 {detail.state.assignedTo} 處理</span> : null}
                </div>
              </header>

              {detail.bookingLead?.pregnancyRisk ? (
                <div style={pregnancyRiskAlertStyle} role="alert">
                  <strong>孕期／哺乳／備孕風險</strong>
                  <span>回覆或安排療程前，請先由真人確認身體狀況與醫師評估。</span>
                </div>
              ) : null}

              <div style={detailMetaGridStyle}>
                <InfoTile label="對話狀態" value={leadStageLabel(detail.leadStage)} />
                <InfoTile
                  label="目前步驟"
                  value={
                    detail.state.status === "human_active"
                      ? "真人已接手"
                      : detail.state.status === "handoff_pending"
                        ? "等待客服接手"
                        : "AI 先回覆中"
                  }
                />
                <InfoTile
                  label="本輪曾詢問"
                  value={
                    detail.consultedTreatments.join("、") ||
                    detail.bookingLead?.interestedTreatments.join("、") ||
                    detail.bookingLead?.preferredBranch ||
                    "尚未記錄療程"
                  }
                />
              </div>

              {detail.bookingLead ? (
                <div style={bookingSummaryStyle}>
                  <div style={summaryHeaderRowStyle}>
                    <strong>預約摘要</strong>
                    <span style={statusBadgeStyle}>{detail.bookingLead.bookingStatus}</span>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <SmallLine label="療程" value={detail.bookingLead.interestedTreatments.join("、") || "-"} />
                    <SmallLine label="館別" value={detail.bookingLead.preferredBranch || "-"} />
                    <SmallLine label="時段" value={detail.bookingLead.preferredTimeSlots.join("、") || "-"} />
                    <SmallLine label="姓名" value={detail.bookingLead.customerName || "-"} />
                    <SmallLine
                      label="電話"
                      value={
                        detail.bookingLead.phone ? (
                          <a href={`tel:${detail.bookingLead.phone}`} style={phoneLinkStyle}>
                            {detail.bookingLead.phone}
                          </a>
                        ) : (
                          "-"
                        )
                      }
                    />
                  </div>
                </div>
              ) : null}

              <div onScroll={handleTimelineScroll} ref={timelineRef} style={timelineStyle}>
                {detail.messages.length === 0 ? <EmptyState text="目前還沒有可顯示的對話訊息。" /> : null}
                {detail.messages.map((message) => (
                  <MessageBubble isCompact={isCompact} key={message.id} message={message} />
                ))}
              </div>

              <div ref={composerRef} style={composerWrapStyle}>
                <div style={summaryHeaderRowStyle}>
                  <strong>客服回覆</strong>
                  <span style={smallMutedTextStyle}>會直接推送到 LINE 對話</span>
                </div>
                <div style={quickReplyWrapStyle}>
                  {quickReplies.map((reply) => (
                    <button key={reply} onClick={() => setMessageText(reply)} style={quickReplyStyle} type="button">
                      {reply}
                    </button>
                  ))}
                </div>
                <textarea
                  disabled={isSending}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="輸入真人客服要發給客人的訊息"
                  ref={textareaRef}
                  rows={isCompact ? 5 : 4}
                  style={{ ...inputStyle, minHeight: isCompact ? 124 : 96, resize: "vertical" }}
                  value={messageText}
                />
                {!isCompact ? (
                  <div style={desktopActionRowStyle}>
                    {detail.state.status !== "human_active" ? (
                      <button
                        disabled={Boolean(controlAction)}
                        onClick={() =>
                          void postControl("mark_human_active", {
                            conversationId: detail.conversationId,
                            userId: detail.lineUserId,
                          })
                        }
                        style={primaryButtonStyle}
                        type="button"
                      >
                        {controlAction === "mark_human_active" ? "處理中..." : "接手回覆"}
                      </button>
                    ) : (
                      <button
                        disabled={Boolean(controlAction)}
                        onClick={() =>
                          void postControl("resume_ai", {
                            conversationId: detail.conversationId,
                            userId: detail.lineUserId,
                          })
                        }
                        style={secondaryButtonStyle}
                        type="button"
                      >
                        {controlAction === "resume_ai" ? "處理中..." : "交由 AI 協助"}
                      </button>
                    )}
                    <button disabled={!messageText.trim() || isSending} onClick={() => void sendStaffMessage()} style={primaryButtonStyle} type="button">
                      {isSending ? "傳送中..." : "送出訊息"}
                    </button>
                    <button
                      disabled={Boolean(controlAction)}
                      onClick={() => {
                        if (window.confirm("確認結案？結案後 AI 將停止主動回覆這位客人。")) {
                          void postControl("complete", {
                            conversationId: detail.conversationId,
                            userId: detail.lineUserId,
                          });
                        }
                      }}
                      style={secondaryButtonStyle}
                      type="button"
                    >
                      {controlAction === "complete" ? "結案中..." : "結案並停止 AI"}
                    </button>
                    {canResetTestCustomer ? (
                      <button
                        disabled={Boolean(controlAction)}
                        onClick={() => {
                          if (window.confirm("確認將此 V2 測試帳號重置為新客人？歷史訊息會保留，但未完成預約、接手與對話狀態會清除。")) {
                            void postControl("reset_customer", {
                              conversationId: detail.conversationId,
                              userId: detail.lineUserId,
                            });
                          }
                        }}
                        style={secondaryButtonStyle}
                        type="button"
                      >
                        {controlAction === "reset_customer" ? "重置中..." : "重置測試狀態"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>

      {isCompact && detail ? (
        <div style={stickyActionBarShellStyle}>
          <div style={stickyActionBarStyle}>
            <div style={{ display: "grid", gap: 2 }}>
              <strong>{detail.displayName}</strong>
              <span style={smallMutedTextStyle}>{formatRuntimeStatus(detail.state.status)}</span>
            </div>
            <div style={stickyTopRowStyle}>
              {stickyControlAction === "mark_human_active" ? (
                <button
                  disabled={Boolean(controlAction)}
                  onClick={() =>
                    void postControl("mark_human_active", {
                      conversationId: detail.conversationId,
                      userId: detail.lineUserId,
                    })
                  }
                  style={primaryButtonStyle}
                  type="button"
                >
                  {controlAction === "mark_human_active" ? "處理中..." : "接手回覆"}
                </button>
              ) : (
                <button
                  disabled={Boolean(controlAction)}
                  onClick={() =>
                    void postControl("resume_ai", {
                      conversationId: detail.conversationId,
                      userId: detail.lineUserId,
                    })
                  }
                  style={secondaryButtonStyle}
                  type="button"
                >
                  {controlAction === "resume_ai" ? "處理中..." : "交由 AI 協助"}
                </button>
              )}

              {detail.bookingLead?.phone ? (
                <a href={`tel:${detail.bookingLead.phone}`} style={stickyLinkButtonStyle}>
                  致電客人
                </a>
              ) : (
                <button onClick={focusComposer} style={secondaryButtonStyle} type="button">
                  前往輸入
                </button>
              )}
              <button
                disabled={Boolean(controlAction)}
                onClick={() => {
                  if (window.confirm("確認結案？結案後 AI 將停止主動回覆這位客人。")) {
                    void postControl("complete", {
                      conversationId: detail.conversationId,
                      userId: detail.lineUserId,
                    });
                  }
                }}
                style={secondaryButtonStyle}
                type="button"
              >
                {controlAction === "complete" ? "結案中..." : "結案"}
              </button>
            </div>
            <button disabled={!messageText.trim() || isSending} onClick={() => void sendStaffMessage()} style={stickySendButtonStyle} type="button">
              {isSending ? "傳送中..." : "送出訊息"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ConversationCard({
  controlAction,
  isCompact,
  isSelected,
  item,
  mode,
  onOpen,
  onPrimary,
}: {
  controlAction: ConversationControlAction;
  isCompact: boolean;
  isSelected: boolean;
  item: QueueItem;
  mode: "active" | "pending";
  onOpen: () => void;
  onPrimary: () => void;
}) {
  const waitMinutes = minutesSince(item.createdAt);
  const isUrgent = mode === "pending" && waitMinutes >= 10;
  const primaryAction = getWorkbenchQueueControlAction(mode, item.status);
  const summaryParts = [
    item.interestedTreatments.length > 0 ? item.interestedTreatments.join("、") : "",
    item.preferredBranch ?? "",
    item.phoneTail ? `電話尾碼 ${item.phoneTail}` : "",
  ].filter(Boolean);

  return (
    <article
      style={{
        ...conversationCardStyle,
        borderColor: isSelected ? "#1f8a5b" : isUrgent ? "#f5c1be" : "#dbe8e1",
        boxShadow: isSelected ? "0 0 0 2px rgba(31, 138, 91, 0.12)" : "none",
      }}
    >
      <div style={cardHeaderRowStyle}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>{item.displayName}</strong>
          {hasDistinctCustomerName(item.customerName, item.displayName) ? <span style={customerNameStyle}>客人姓名：{item.customerName}</span> : null}
          <span style={waitTextStyle}>{getWorkbenchQueueStatusText(mode, item.status, waitMinutes)}</span>
        </div>
        <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 6 }}>
          {item.pregnancyRisk ? <PregnancyRiskBadge /> : null}
          <StatusBadge
            label={getWorkbenchQueueStatusLabel(mode, item.status)}
            tone={isUrgent || item.status === "handoff_pending" ? "red" : "green"}
          />
        </div>
      </div>

      <p style={quoteStyle}>{item.lastCustomerMessage || "尚未擷取到客人最新訊息"}</p>
      <p style={summaryTextStyle}>{summaryParts.length > 0 ? `摘要：${summaryParts.join("｜")}` : "摘要：尚未整理出療程、館別或電話資訊"}</p>
      <p style={hintTextStyle}>下一步：{mode === "pending" ? summarizeNextStep(item) : item.status === "ai_active" ? "AI 可先協助回覆；真人仍可隨時在此接手訊息。" : "確認需求後，可直接回覆，或交由 AI 協助。"}</p>

      <div style={{ display: "flex", flexDirection: isCompact ? "column" : "row", flexWrap: "wrap", gap: 8 }}>
        <button disabled={Boolean(controlAction)} onClick={onPrimary} style={primaryButtonStyle} type="button">
          {controlAction === primaryAction
            ? "處理中..."
            : getWorkbenchQueuePrimaryLabel(mode, item.status)}
        </button>
        <button disabled={Boolean(controlAction)} onClick={onOpen} style={secondaryButtonStyle} type="button">
          {mode === "pending" ? "查看對話" : "繼續回覆"}
        </button>
      </div>
    </article>
  );
}

function LeadSummaryCard({
  controlAction,
  isBusy,
  isCompact,
  lead,
  onBooked,
  onContacted,
  onOpenConversation,
}: {
  controlAction: ConversationControlAction;
  isBusy: boolean;
  isCompact: boolean;
  lead: WorkbenchLeadSummary;
  onBooked: () => void;
  onContacted: () => void;
  onOpenConversation: () => void;
}) {
  return (
    <article style={leadCardStyle}>
      <div style={cardHeaderRowStyle}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>{lead.displayName}</strong>
          {hasDistinctCustomerName(lead.customerName, lead.displayName) ? <span style={customerNameStyle}>客人姓名：{lead.customerName}</span> : null}
          <span style={waitTextStyle}>{formatTime(lead.updatedAt)} 更新</span>
        </div>
        <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", gap: 6 }}>
          {lead.pregnancyRisk ? <PregnancyRiskBadge /> : null}
          <span style={leadStatusPillStyle}>{bookingStatusLabels[lead.bookingStatus]}</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        <SmallLine label="療程" value={lead.interestedTreatments.join("、") || "-"} />
        <SmallLine label="館別" value={lead.preferredBranch || "-"} />
        <SmallLine label="時段" value={lead.preferredTimeSlots.join("、") || "-"} />
        <SmallLine
          label="電話"
          value={
            lead.phone ? (
              <a href={`tel:${lead.phone}`} style={phoneLinkStyle}>
                {lead.phone}
              </a>
            ) : (
              "-"
            )
          }
        />
      </div>

      <div style={{ display: "flex", flexDirection: isCompact ? "column" : "row", flexWrap: "wrap", gap: 8 }}>
        <button disabled={isBusy || Boolean(controlAction)} onClick={onOpenConversation} style={secondaryButtonStyle} type="button">
          查看對話
        </button>
        <button disabled={isBusy || Boolean(controlAction) || lead.bookingStatus === "contacted"} onClick={onContacted} style={secondaryButtonStyle} type="button">
          {isBusy ? "處理中..." : "標記已聯繫"}
        </button>
        <button disabled={isBusy || Boolean(controlAction) || lead.bookingStatus === "booked"} onClick={onBooked} style={primaryButtonStyle} type="button">
          {isBusy ? "處理中..." : "確認預約"}
        </button>
      </div>
    </article>
  );
}

function SectionHeader({
  action,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div style={sectionHeaderStyle}>
      <div style={{ display: "grid", gap: 4 }}>
        <p style={eyebrowStyle}>{eyebrow}</p>
        <h2 style={sectionTitleStyle}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SummaryPill({ label, tone, value }: { label: string; tone: "green" | "red" | "yellow"; value: number }) {
  return (
    <div
      style={{
        ...summaryPillStyle,
        background: tone === "red" ? "#fff1f0" : tone === "yellow" ? "#fff8e8" : "#edf8f1",
        borderColor: tone === "red" ? "#f5c2c0" : tone === "yellow" ? "#efd9a6" : "#cce6d6",
      }}
    >
      <span style={smallMutedTextStyle}>{label}</span>
      <strong style={{ fontSize: 20 }}>{value}</strong>
    </div>
  );
}

function MessageBubble({ isCompact, message }: { isCompact: boolean; message: MessageItem }) {
  const isStaff = message.direction === "staff";
  const isCustomer = message.direction === "customer";

  return (
    <div style={{ display: "flex", justifyContent: isStaff ? "flex-end" : "flex-start" }}>
      <div
        style={{
          background: isStaff ? "#dff5d8" : isCustomer ? "#f0f2f1" : "#eef7fb",
          border: "1px solid #d9e7e0",
          borderRadius: 18,
          maxWidth: isCompact ? "92%" : "88%",
          padding: "10px 12px",
          whiteSpace: "pre-wrap",
        }}
      >
        <p style={messageMetaStyle}>
          {formatMessageAuthor(message)} · {formatTime(message.createdAt)}
          {message.sendStatus === "failed" ? " · 傳送失敗" : ""}
          {message.sendStatus === "skipped" ? " （未傳送）" : ""}
        </p>
        <p style={messageBodyStyle}>{message.content}</p>
        {message.sendError ? <p style={messageErrorStyle}>{message.sendError}</p> : null}
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoTileStyle}>
      <span style={smallMutedTextStyle}>{label}</span>
      <strong style={{ lineHeight: 1.45 }}>{value}</strong>
    </div>
  );
}

function SmallLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <p style={smallLineStyle}>
      <span style={smallLineLabelStyle}>{label}：</span>
      {value}
    </p>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p style={emptyStateStyle}>{text}</p>;
}

function StatusBadge({ label, tone }: { label: string; tone: "green" | "red" }) {
  return (
    <span
      style={{
        background: tone === "green" ? "#dcfce7" : "#fee2e2",
        borderRadius: 999,
        color: tone === "green" ? "#166534" : "#991b1b",
        fontSize: 12,
        fontWeight: 700,
        padding: "6px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function PregnancyRiskBadge() {
  return <span style={pregnancyRiskBadgeStyle}>孕期風險・真人確認</span>;
}

function summarizeNextStep(item: QueueItem) {
  if (item.handoffReason.includes("post_treatment") || item.handoffReason.includes("術後")) {
    return "先確認異常狀況與時間點，再交由真人評估。";
  }
  if (item.handoffReason.includes("price") || item.lastCustomerMessage.includes("價格")) {
    return "先確認療程與館別，再整理成可回覆的價格需求。";
  }
  if (item.preferredBranch || item.interestedTreatments.length > 0) {
    return "先核對療程與館別，再補方便時段與聯絡方式。";
  }
  return "先補齊客人需求重點，再決定要直接回覆或轉交處理。";
}

function minutesSince(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return 0;
  }
  return Math.max(1, Math.floor(diffMs / 60000));
}

function formatDirection(direction: MessageItem["direction"]) {
  if (direction === "customer") return "客人";
  if (direction === "staff") return "真人客服";
  if (direction === "ai") return "AI";
  return "系統";
}

function formatMessageAuthor(message: MessageItem) {
  const direction = formatDirection(message.direction);
  return message.direction === "staff" && message.staffName ? `${direction}・${message.staffName}` : direction;
}

function formatRuntimeStatus(status: string) {
  const labels: Record<string, string> = {
    ai_active: "AI 協助中（真人持續追蹤）",
    ai_paused: "AI 暫停中",
    closed: "已結束",
    handoff_pending: "等待客服接手",
    human_active: "真人處理中",
  };
  return labels[status] ?? status;
}

function leadStageLabel(stage: string) {
  const labels: Record<string, string> = {
    booking_intent: "有預約意願",
    closed: "已結束",
    handoff_pending: "待真人接手",
    human_followup: "真人追蹤中",
    interested: "持續觀望",
    new_inquiry: "新進線",
  };
  return labels[stage] ?? stage;
}

function formatLineIdentity(lineUserId: string, isCompact: boolean) {
  if (!lineUserId) {
    return "LINE 身分：未帶入";
  }

  if (isCompact) {
    return `LINE 尾碼：${maskLineUserId(lineUserId)}`;
  }

  return `LINE ID：${lineUserId}`;
}

function hasDistinctCustomerName(customerName: string | null | undefined, displayName: string) {
  return Boolean(customerName && customerName.trim() && customerName.trim() !== displayName.trim());
}

function maskLineUserId(lineUserId: string) {
  return lineUserId.length <= 6 ? lineUserId : `${lineUserId.slice(0, 2)}…${lineUserId.slice(-4)}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

const compactLayoutStyle = {
  display: "grid",
  gap: 14,
} satisfies CSSProperties;

const wideLayoutStyle = {
  alignItems: "start",
  display: "grid",
  gap: 14,
  gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
} satisfies CSSProperties;

const panelStyle = {
  background: "#ffffff",
  border: "1px solid #d7e5df",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(20, 48, 43, 0.04)",
  padding: 16,
} satisfies CSSProperties;

const summaryStripStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
} satisfies CSSProperties;

const summaryPillStyle = {
  border: "1px solid #cce6d6",
  borderRadius: 16,
  display: "grid",
  gap: 3,
  minHeight: 74,
  padding: 12,
} satisfies CSSProperties;

const sectionHeaderStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  justifyContent: "space-between",
  marginBottom: 12,
} satisfies CSSProperties;

const sectionTitleStyle = {
  fontSize: 20,
  lineHeight: 1.2,
  margin: 0,
} satisfies CSSProperties;

const eyebrowStyle = {
  color: "#5e7a72",
  fontSize: 13,
  fontWeight: 700,
  margin: 0,
} satisfies CSSProperties;

const smallMutedTextStyle = {
  color: "#60736c",
  fontSize: 12,
  lineHeight: 1.5,
} satisfies CSSProperties;

const conversationCardStyle = {
  background: "#f8fcfa",
  border: "1px solid #dbe8e1",
  borderRadius: 18,
  display: "grid",
  gap: 8,
  padding: 14,
} satisfies CSSProperties;

const leadCardStyle = {
  background: "#f8fcfa",
  border: "1px solid #dbe8e1",
  borderRadius: 18,
  display: "grid",
  gap: 10,
  padding: 14,
} satisfies CSSProperties;

const cardHeaderRowStyle = {
  alignItems: "flex-start",
  display: "flex",
  gap: 10,
  justifyContent: "space-between",
} satisfies CSSProperties;

const waitTextStyle = {
  color: "#60736c",
  fontSize: 12,
  lineHeight: 1.5,
} satisfies CSSProperties;

const customerNameStyle = {
  color: "#335563",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.4,
} satisfies CSSProperties;

const pregnancyRiskBadgeStyle = {
  background: "#991b1b",
  borderRadius: 999,
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 800,
  padding: "6px 10px",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const pregnancyRiskAlertStyle = {
  background: "#fff1f0",
  border: "1px solid #ef9a95",
  borderRadius: 12,
  color: "#861f1a",
  display: "grid",
  gap: 4,
  lineHeight: 1.5,
  padding: 12,
} satisfies CSSProperties;

const quoteStyle = {
  color: "#18312b",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.55,
  margin: 0,
} satisfies CSSProperties;

const summaryTextStyle = {
  color: "#49615a",
  fontSize: 13,
  lineHeight: 1.55,
  margin: 0,
} satisfies CSSProperties;

const hintTextStyle = {
  color: "#5f726b",
  fontSize: 13,
  lineHeight: 1.55,
  margin: 0,
} satisfies CSSProperties;

const detailHeaderStyle = {
  borderBottom: "1px solid #e4eee9",
  display: "grid",
  gap: 10,
  paddingBottom: 12,
} satisfies CSSProperties;

const detailNameStyle = {
  fontSize: 30,
  lineHeight: 1.08,
  margin: 0,
} satisfies CSSProperties;

const detailCaptionStyle = {
  color: "#66756f",
  fontSize: 13,
  lineHeight: 1.5,
  margin: 0,
} satisfies CSSProperties;

const detailCustomerNameStyle = {
  color: "#335563",
  fontSize: 14,
  fontWeight: 700,
  margin: 0,
} satisfies CSSProperties;

const newMessagePillStyle = {
  background: "#fff8e8",
  border: "1px solid #efd9a6",
  borderRadius: 999,
  color: "#8a5b13",
  fontSize: 12,
  fontWeight: 700,
  padding: "4px 8px",
} satisfies CSSProperties;

const metaChipStyle = {
  background: "#f3f7f5",
  borderRadius: 999,
  color: "#4d655d",
  fontSize: 12,
  padding: "6px 10px",
} satisfies CSSProperties;

const detailMetaGridStyle = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
} satisfies CSSProperties;

const infoTileStyle = {
  background: "#f8fcfa",
  border: "1px solid #dbe8e1",
  borderRadius: 16,
  display: "grid",
  gap: 4,
  minHeight: 88,
  padding: 12,
} satisfies CSSProperties;

const bookingSummaryStyle = {
  background: "#f4faf7",
  border: "1px solid #d9e9e1",
  borderRadius: 16,
  display: "grid",
  gap: 10,
  padding: 12,
} satisfies CSSProperties;

const statusBadgeStyle = {
  background: "#edf8f1",
  border: "1px solid #cde6d7",
  borderRadius: 999,
  color: "#17693a",
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 10px",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const summaryHeaderRowStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "space-between",
} satisfies CSSProperties;

const timelineStyle = {
  display: "grid",
  gap: 10,
  maxHeight: 520,
  overflowY: "auto",
  paddingRight: 2,
} satisfies CSSProperties;

const composerWrapStyle = {
  borderTop: "1px solid #e4eee9",
  display: "grid",
  gap: 10,
  paddingTop: 12,
} satisfies CSSProperties;

const quickReplyWrapStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
} satisfies CSSProperties;

const quickReplyStyle = {
  background: "#ffffff",
  border: "1px solid #cfe0d8",
  borderRadius: 999,
  color: "#21433a",
  cursor: "pointer",
  font: "inherit",
  minHeight: 40,
  padding: "8px 12px",
  textAlign: "left",
} satisfies CSSProperties;

const desktopActionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "space-between",
} satisfies CSSProperties;

const inputStyle = {
  border: "1px solid #c9dad3",
  borderRadius: 14,
  font: "inherit",
  padding: 12,
  width: "100%",
} satisfies CSSProperties;

const ghostButtonStyle = {
  background: "#ffffff",
  border: "1px solid #b9cbc5",
  borderRadius: 14,
  color: "#16302b",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  minHeight: 44,
  padding: "10px 14px",
} satisfies CSSProperties;

const primaryButtonStyle = {
  background: "#16a34a",
  border: "1px solid #16a34a",
  borderRadius: 14,
  color: "#ffffff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  minHeight: 44,
  padding: "10px 14px",
  textDecoration: "none",
} satisfies CSSProperties;

const secondaryButtonStyle = {
  background: "#ffffff",
  border: "1px solid #b9cbc5",
  borderRadius: 14,
  color: "#16302b",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  minHeight: 44,
  padding: "10px 14px",
  textDecoration: "none",
} satisfies CSSProperties;

const stickyActionBarShellStyle = {
  bottom: 0,
  left: 0,
  padding: "0 10px 10px",
  position: "sticky",
  zIndex: 20,
} satisfies CSSProperties;

const stickyActionBarStyle = {
  backdropFilter: "blur(12px)",
  background: "rgba(255,255,255,0.95)",
  border: "1px solid #d7e5df",
  borderRadius: 18,
  boxShadow: "0 -8px 28px rgba(20, 48, 43, 0.08)",
  display: "grid",
  gap: 10,
  padding: 12,
} satisfies CSSProperties;

const stickyTopRowStyle = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
} satisfies CSSProperties;

const stickyLinkButtonStyle = {
  alignItems: "center",
  background: "#ffffff",
  border: "1px solid #b9cbc5",
  borderRadius: 14,
  color: "#16302b",
  display: "inline-flex",
  fontWeight: 700,
  justifyContent: "center",
  minHeight: 44,
  padding: "10px 14px",
  textDecoration: "none",
} satisfies CSSProperties;

const stickySendButtonStyle = {
  background: "#16302b",
  border: "1px solid #16302b",
  borderRadius: 14,
  color: "#ffffff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 700,
  minHeight: 48,
  padding: "10px 14px",
} satisfies CSSProperties;

const linkActionStyle = {
  color: "#17693a",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const leadStatusPillStyle = {
  background: "#eef7fb",
  borderRadius: 999,
  color: "#0f5d75",
  fontSize: 12,
  fontWeight: 700,
  padding: "5px 8px",
} satisfies CSSProperties;

const phoneLinkStyle = {
  color: "#0f766e",
  fontWeight: 700,
} satisfies CSSProperties;

const smallLineStyle = {
  color: "#31423d",
  fontSize: 13,
  lineHeight: 1.45,
  margin: 0,
} satisfies CSSProperties;

const smallLineLabelStyle = {
  color: "#60736c",
} satisfies CSSProperties;

const messageMetaStyle = {
  color: "#41534d",
  fontSize: 12,
  margin: "0 0 5px",
} satisfies CSSProperties;

const messageBodyStyle = {
  lineHeight: 1.55,
  margin: 0,
} satisfies CSSProperties;

const messageErrorStyle = {
  color: "#b42318",
  fontSize: 12,
  margin: "6px 0 0",
} satisfies CSSProperties;

const emptyStateStyle = {
  color: "#66756f",
  lineHeight: 1.7,
  margin: 0,
} satisfies CSSProperties;

const errorStyle = {
  background: "#fff1f0",
  border: "1px solid #ffccc7",
  borderRadius: 16,
  color: "#8c1d18",
  padding: 12,
} satisfies CSSProperties;
