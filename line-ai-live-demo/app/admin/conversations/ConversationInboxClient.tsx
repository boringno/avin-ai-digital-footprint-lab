"use client";

import { useEffect, useState } from "react";

import type { ConversationInboxData, ConversationInboxItem } from "@/lib/admin-conversation-inbox-data";

type ControlAction = "" | "mark_human_active" | "resume_ai";

export function ConversationInboxClient({ initialData, staffName }: { initialData: ConversationInboxData; staffName: string }) {
  const [data, setData] = useState(initialData);
  const [searchText, setSearchText] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState(initialData.detail?.conversationId ?? "");
  const [messageText, setMessageText] = useState("");
  const [controlAction, setControlAction] = useState<ControlAction>("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCompact, setIsCompact] = useState(false);

  async function refresh(conversationId = selectedConversationId, search = searchText) {
    const params = new URLSearchParams();
    if (conversationId) params.set("conversation_id", conversationId);
    if (search.trim()) params.set("q", search.trim());
    const response = await fetch(`/api/admin/conversations?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      setErrorMessage("對話載入失敗，請重新整理再試。");
      return;
    }

    const nextData = (await response.json()) as ConversationInboxData;
    setData(nextData);
    if (nextData.detail?.conversationId) {
      setSelectedConversationId(nextData.detail.conversationId);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [selectedConversationId, searchText]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const updateLayout = () => setIsCompact(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  async function selectConversation(item: ConversationInboxItem) {
    setSelectedConversationId(item.conversationId);
    await refresh(item.conversationId);
  }

  async function controlConversation(action: Exclude<ControlAction, "">) {
    const detail = data.detail;
    if (!detail || controlAction) return;

    setErrorMessage("");
    setControlAction(action);
    try {
      const response = await fetch("/api/admin/conversations/control", {
        body: JSON.stringify({ action, assigned_to: staffName, user_id: detail.lineUserId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { ok?: boolean };
      if (!response.ok || !result.ok) {
        setErrorMessage(action === "mark_human_active" ? "接手失敗，請再按一次。" : "交由 AI 協助失敗，請再按一次。");
        return;
      }
      await refresh(detail.conversationId);
    } catch {
      setErrorMessage("狀態更新失敗，請再按一次。");
    } finally {
      setControlAction("");
    }
  }

  async function sendMessage() {
    const detail = data.detail;
    if (!detail || !messageText.trim() || isSending) return;

    setErrorMessage("");
    setIsSending(true);
    try {
      const response = await fetch("/api/admin/conversations/staff-message", {
        body: JSON.stringify({ assigned_to: staffName, message_text: messageText.trim(), user_id: detail.lineUserId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { line_push?: { ok?: boolean }; ok?: boolean };
      if (!response.ok || !result.ok) {
        setErrorMessage("訊息傳送失敗，請再按一次。");
        return;
      }
      setMessageText("");
      if (result.line_push && !result.line_push.ok) {
        setErrorMessage("訊息已記錄，但 LINE 推送失敗；請稍後重試。");
      }
      await refresh(detail.conversationId);
    } catch {
      setErrorMessage("訊息傳送失敗，請再按一次。");
    } finally {
      setIsSending(false);
    }
  }

  const detail = data.detail;

  return (
    <section style={{ display: "grid", gap: 14 }}>
      {errorMessage ? <div style={errorStyle}>{errorMessage}</div> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void refresh("", searchText);
        }}
        style={searchPanelStyle}
      >
        <input onChange={(event) => setSearchText(event.target.value)} placeholder="搜尋 LINE 名稱、客人姓名、訊息內容或 LINE ID" style={inputStyle} value={searchText} />
        <button style={secondaryButtonStyle} type="submit">搜尋</button>
        <button onClick={() => void refresh()} style={secondaryButtonStyle} type="button">重新整理</button>
        <span style={countStyle}>顯示 {data.items.length} 位客人</span>
      </form>

      <div style={{ ...layoutStyle, gridTemplateColumns: isCompact ? "minmax(0, 1fr)" : layoutStyle.gridTemplateColumns }}>
        <aside style={panelStyle}>
          <strong>全部對話</strong>
          <p style={hintStyle}>最近 100 位有互動的客人。手動接手後會出現在接手工作台追蹤。</p>
          <div style={{ display: "grid", gap: 8 }}>
            {data.items.length === 0 ? <p style={hintStyle}>找不到符合條件的對話。</p> : null}
            {data.items.map((item) => (
              <button
                key={item.conversationId}
                onClick={() => void selectConversation(item)}
                style={{ ...conversationButtonStyle, borderColor: item.conversationId === selectedConversationId ? "#159447" : "#d4e2dc" }}
                type="button"
              >
                <span style={nameRowStyle}>
                  <strong>{item.displayName}</strong>
                  <span style={statusStyle}>{formatStatus(item.status)}</span>
                </span>
                {hasDistinctCustomerName(item.customerName, item.displayName) ? <span style={customerNameStyle}>客人姓名：{item.customerName}</span> : null}
                <span style={messagePreviewStyle}>{item.lastMessage}</span>
                <span style={timeStyle}>{formatTime(item.lastSeenAt)}</span>
              </button>
            ))}
          </div>
        </aside>

        <section style={panelStyle}>
          {!detail ? (
            <p style={hintStyle}>從左側選擇一位客人，即可查看完整對話並安全接手。</p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <header style={detailHeaderStyle}>
                <div>
                  <p style={eyebrowStyle}>LINE 對話</p>
                  <h2 style={{ margin: "4px 0" }}>{detail.displayName}</h2>
                  {hasDistinctCustomerName(detail.bookingLead?.customerName, detail.displayName) ? <p style={customerNameStyle}>客人姓名：{detail.bookingLead?.customerName}</p> : null}
                  <p style={hintStyle}>{maskLineUserId(detail.lineUserId)}</p>
                </div>
                <div style={actionRowStyle}>
                  {detail.state.status === "human_active" ? (
                    <button disabled={Boolean(controlAction)} onClick={() => void controlConversation("resume_ai")} style={secondaryButtonStyle} type="button">
                      {controlAction === "resume_ai" ? "處理中..." : "交由 AI 協助"}
                    </button>
                  ) : (
                    <button disabled={Boolean(controlAction)} onClick={() => void controlConversation("mark_human_active")} style={primaryButtonStyle} type="button">
                      {controlAction === "mark_human_active" ? "處理中..." : "真人接手"}
                    </button>
                  )}
                </div>
              </header>

              <div style={noticeStyle}>
                {detail.state.status === "human_active"
                  ? "真人已接手，AI 不會插話。"
                  : "尚未由真人接手；按真人接手或直接傳送訊息後，AI 就會停止插話。"}
              </div>

              <div style={timelineStyle}>
                {detail.messages.map((message) => (
                  <article key={message.id} style={{ ...messageStyle, ...(message.direction === "customer" ? customerMessageStyle : message.direction === "staff" ? staffMessageStyle : aiMessageStyle) }}>
                    <strong>{message.direction === "customer" ? "客人" : message.direction === "staff" ? message.staffName ? `真人客服・${message.staffName}` : "真人客服" : message.direction === "ai" ? "AI 客服" : "系統"}</strong>
                    <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
                    <small>{formatTime(message.createdAt)}</small>
                  </article>
                ))}
              </div>

              <div style={composerStyle}>
                <strong>真人客服回覆</strong>
                <p style={hintStyle}>訊息會由本後台推送至 LINE，並先切換為真人接手。</p>
                <textarea disabled={isSending} onChange={(event) => setMessageText(event.target.value)} placeholder="輸入要傳送給客人的訊息" rows={4} style={textareaStyle} value={messageText} />
                <button disabled={!messageText.trim() || isSending} onClick={() => void sendMessage()} style={primaryButtonStyle} type="button">
                  {isSending ? "傳送中..." : "傳送並真人接手"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function formatStatus(status: string) {
  return { ai_active: "AI 協助", handoff_pending: "待接手", human_active: "真人處理中" }[status] ?? "已結束";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-TW", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" });
}

function hasDistinctCustomerName(customerName: string | null | undefined, displayName: string) {
  return Boolean(customerName && customerName.trim() && customerName.trim() !== displayName.trim());
}

function maskLineUserId(lineUserId: string) {
  return lineUserId.length <= 8 ? "LINE 身分：已同步" : `LINE ID：${lineUserId.slice(0, 2)}…${lineUserId.slice(-4)}`;
}

const panelStyle = { background: "#fff", border: "1px solid #d4e2dc", borderRadius: 18, padding: 16 } satisfies React.CSSProperties;
const layoutStyle = { alignItems: "start", display: "grid", gap: 14, gridTemplateColumns: "minmax(280px, 0.7fr) minmax(0, 1.5fr)" } satisfies React.CSSProperties;
const searchPanelStyle = { alignItems: "center", background: "#fff", border: "1px solid #d4e2dc", borderRadius: 16, display: "flex", flexWrap: "wrap", gap: 8, padding: 12 } satisfies React.CSSProperties;
const inputStyle = { border: "1px solid #b9cbc5", borderRadius: 10, flex: "1 1 280px", font: "inherit", minHeight: 44, padding: "0 12px" } satisfies React.CSSProperties;
const textareaStyle = { border: "1px solid #b9cbc5", borderRadius: 10, font: "inherit", minHeight: 100, padding: 12, resize: "vertical", width: "100%" } satisfies React.CSSProperties;
const primaryButtonStyle = { background: "#159447", border: "1px solid #159447", borderRadius: 10, color: "#fff", cursor: "pointer", font: "inherit", minHeight: 44, padding: "0 14px" } satisfies React.CSSProperties;
const secondaryButtonStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 10, color: "#16302b", cursor: "pointer", font: "inherit", minHeight: 44, padding: "0 14px" } satisfies React.CSSProperties;
const conversationButtonStyle = { background: "#fbfdfc", border: "1px solid #d4e2dc", borderRadius: 12, cursor: "pointer", display: "grid", gap: 5, padding: 12, textAlign: "left", width: "100%" } satisfies React.CSSProperties;
const nameRowStyle = { alignItems: "center", display: "flex", gap: 8, justifyContent: "space-between" } satisfies React.CSSProperties;
const statusStyle = { background: "#e7f5ed", borderRadius: 999, color: "#147a3b", fontSize: 12, padding: "3px 7px" } satisfies React.CSSProperties;
const customerNameStyle = { color: "#335563", fontSize: 13, fontWeight: 700, margin: 0 } satisfies React.CSSProperties;
const messagePreviewStyle = { color: "#3e554d", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies React.CSSProperties;
const timeStyle = { color: "#6c8078", fontSize: 12 } satisfies React.CSSProperties;
const hintStyle = { color: "#62766e", fontSize: 14, lineHeight: 1.5, margin: "6px 0" } satisfies React.CSSProperties;
const countStyle = { color: "#5e7a72", fontSize: 14 } satisfies React.CSSProperties;
const detailHeaderStyle = { alignItems: "flex-start", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" } satisfies React.CSSProperties;
const actionRowStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 } satisfies React.CSSProperties;
const eyebrowStyle = { color: "#5e7a72", fontSize: 13, margin: 0 } satisfies React.CSSProperties;
const noticeStyle = { background: "#edf8f1", border: "1px solid #cde9d8", borderRadius: 10, color: "#245d3b", fontSize: 14, padding: 10 } satisfies React.CSSProperties;
const timelineStyle = { background: "#f5f9f7", border: "1px solid #dce9e3", borderRadius: 14, display: "grid", gap: 10, maxHeight: 560, overflowY: "auto", padding: 12 } satisfies React.CSSProperties;
const messageStyle = { borderRadius: 12, display: "grid", gap: 5, maxWidth: "88%", padding: 10 } satisfies React.CSSProperties;
const customerMessageStyle = { background: "#fff", border: "1px solid #d4e2dc", justifySelf: "start" } satisfies React.CSSProperties;
const staffMessageStyle = { background: "#e1f7e9", justifySelf: "end" } satisfies React.CSSProperties;
const aiMessageStyle = { background: "#e6f1f8", justifySelf: "start" } satisfies React.CSSProperties;
const composerStyle = { borderTop: "1px solid #dce9e3", display: "grid", gap: 8, paddingTop: 14 } satisfies React.CSSProperties;
const errorStyle = { background: "#fff0ef", border: "1px solid #f3b8b3", borderRadius: 10, color: "#9f3025", padding: 12 } satisfies React.CSSProperties;
