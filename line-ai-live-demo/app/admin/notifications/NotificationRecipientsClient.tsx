"use client";

import { useState } from "react";

type Scope = "clinic" | "platform";
type Channel = "email" | "line_group";
type Recipient = {
  branch: string;
  channel: Channel;
  id: string;
  isActive: boolean;
  scope: Scope;
  target: string;
};
type PendingGroup = {
  groupId: string;
  groupName: string | null;
  lastSeenAt: string;
};

export function NotificationRecipientsClient(input: {
  branches: string[];
  initialPendingGroups: PendingGroup[];
  initialRecipients: Recipient[];
  scope: Scope;
}) {
  const { branches, initialPendingGroups, initialRecipients, scope } = input;
  const [recipients, setRecipients] = useState(initialRecipients);
  const [pendingGroups, setPendingGroups] = useState(initialPendingGroups);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string[]>>(() => toEmailDrafts(branches, initialRecipients));
  const [lineGroupDrafts, setLineGroupDrafts] = useState<Record<string, string>>(() => toLineGroupDrafts(branches, initialRecipients));
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const emailLimit = scope === "clinic" ? 3 : 10;
  const title = scope === "clinic" ? "各館待處理通知設定" : "平台待處理通知設定";

  const branchRecipientMap = new Map<string, Recipient[]>();
  for (const branch of branches) {
    branchRecipientMap.set(branch, recipients.filter((recipient) => recipient.branch === branch));
  }

  async function saveBranch(branch: string) {
    const requestKey = `save:${branch}`;
    if (busyKey) {
      return;
    }

    setBusyKey(requestKey);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/notifications/recipients", {
        body: JSON.stringify({
          branch,
          emails: emailDrafts[branch] ?? [],
          lineGroups: lineGroupDrafts[branch]?.trim() ? [lineGroupDrafts[branch].trim()] : [],
        }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const body = (await response.json()) as { error?: string; ok?: boolean; recipients?: Recipient[] };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "儲存通知設定失敗");
      }

      const nextRecipients = body.recipients ?? [];
      setRecipients(nextRecipients);
      setEmailDrafts(toEmailDrafts(branches, nextRecipients));
      setLineGroupDrafts(toLineGroupDrafts(branches, nextRecipients));
      setPendingGroups((current) =>
        current.filter((group) => group.groupId !== (lineGroupDrafts[branch]?.trim() || "")),
      );
      setNotice(`${branch} 的通知設定已更新`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "儲存通知設定失敗");
    } finally {
      setBusyKey("");
    }
  }

  async function sendTest(branch: string, channel: Channel) {
    const requestKey = `test:${branch}:${channel}`;
    if (busyKey) {
      return;
    }

    setBusyKey(requestKey);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/notifications/handoff-digest-test", {
        body: JSON.stringify({ branch, channel }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "測試通知發送失敗");
      }

      setNotice(`${branch} 的 ${channel === "email" ? "Email" : "LINE 群組"} 測試通知已送出`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "測試通知發送失敗");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>{scope === "clinic" ? "館別通知設定" : "平台通知設定"}</p>
            <h1 style={{ margin: "4px 0 0" }}>{title}</h1>
            <p style={introStyle}>
              下班後的待處理通知會依館別分流，email 與 LINE 群組各自獨立冪等。白天不會主動發送，客人訊息仍只進客服工作台。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/admin/workbench" style={linkButtonStyle}>客服工作台</a>
            <a href="/admin/team" style={linkButtonStyle}>團隊管理</a>
          </div>
        </header>

        {error ? <p style={errorStyle}>{error}</p> : null}
        {notice ? <p style={noticeStyle}>{notice}</p> : null}

        <section style={noticePanelStyle}>
          <strong>發送規則</strong>
          <span>平日 21:00 發送一次；週六、週日 08:00 與 20:00 各發一次。</span>
          <span>通知只包含各館待處理數量與工作台連結，不會帶出姓名、電話或對話內容。</span>
          <span>LINE 群組採 webhook 自動偵測群組 ID，請先讓診所官方帳號加入各館群組，再到這頁完成綁定。</span>
        </section>

        <section style={pendingPanelStyle}>
          <div style={{ display: "grid", gap: 4 }}>
            <strong>待綁定 LINE 群組</strong>
            <span style={helperStyle}>
              這裡列出近期在 webhook 中出現、但還沒有綁到任何館別的群組。點選後可直接填入對應館別。
            </span>
          </div>
          {pendingGroups.length === 0 ? (
            <span style={helperStyle}>目前沒有待綁定群組。</span>
          ) : (
            <div style={groupListStyle}>
              {pendingGroups.map((group) => (
                <div key={group.groupId} style={groupCardStyle}>
                  <strong>{group.groupName || "未命名群組"}</strong>
                  <code style={codeStyle}>{group.groupId}</code>
                  <span style={helperStyle}>最近出現：{formatTime(group.lastSeenAt)}</span>
                  <div style={groupActionsStyle}>
                    {branches.map((branch) => (
                      <button
                        key={`${group.groupId}:${branch}`}
                        onClick={() => setLineGroupDrafts((current) => ({ ...current, [branch]: group.groupId }))}
                        style={secondaryButtonStyle}
                        type="button"
                      >
                        綁到 {branch}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div style={gridStyle}>
          {branches.map((branch) => {
            const emails = emailDrafts[branch] ?? [];
            const lineGroupValue = lineGroupDrafts[branch] ?? "";
            const activeRecipients = branchRecipientMap.get(branch) ?? [];
            const isSaving = busyKey === `save:${branch}`;
            const isTestingEmail = busyKey === `test:${branch}:email`;
            const isTestingLine = busyKey === `test:${branch}:line_group`;

            return (
              <section key={branch} style={panelStyle}>
                <h2 style={{ margin: 0 }}>{branch}</h2>
                <p style={helperStyle}>
                  {scope === "clinic"
                    ? `館方可設定最多 ${emailLimit} 組 email 與 1 組 LINE 群組。`
                    : `平台層可疊加最多 ${emailLimit} 組 email 與 1 組 LINE 群組。`}
                </p>

                <div style={channelBlockStyle}>
                  <div style={channelHeaderStyle}>
                    <strong>Email 收件人</strong>
                    <button
                      disabled={isSaving || emails.length >= emailLimit}
                      onClick={() => setEmailDrafts((current) => ({ ...current, [branch]: [...(current[branch] ?? []), ""] }))}
                      style={secondaryButtonStyle}
                      type="button"
                    >
                      新增 Email
                    </button>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {emails.length === 0 ? <span style={helperStyle}>尚未設定 email 收件人。</span> : null}
                    {emails.map((email, index) => (
                      <div key={`${branch}:email:${index}`} style={{ display: "flex", gap: 8 }}>
                        <input
                          aria-label={`${branch} email ${index + 1}`}
                          onChange={(event) =>
                            setEmailDrafts((current) => ({
                              ...current,
                              [branch]: (current[branch] ?? []).map((value, itemIndex) => itemIndex === index ? event.target.value : value),
                            }))
                          }
                          placeholder="name@example.com"
                          style={inputStyle}
                          type="email"
                          value={email}
                        />
                        <button
                          aria-label={`移除 ${branch} email ${index + 1}`}
                          disabled={isSaving}
                          onClick={() =>
                            setEmailDrafts((current) => ({
                              ...current,
                              [branch]: (current[branch] ?? []).filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                          style={removeButtonStyle}
                          type="button"
                        >
                          移除
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={channelBlockStyle}>
                  <div style={channelHeaderStyle}>
                    <strong>LINE 群組</strong>
                  </div>
                  <input
                    aria-label={`${branch} LINE 群組 ID`}
                    onChange={(event) => setLineGroupDrafts((current) => ({ ...current, [branch]: event.target.value }))}
                    placeholder="例如：Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    style={inputStyle}
                    type="text"
                    value={lineGroupValue}
                  />
                  <span style={helperStyle}>每個館別目前綁定 1 個 LINE 群組，通知會直接 push 到該群組。</span>
                </div>

                <div style={actionRowStyle}>
                  <button disabled={Boolean(busyKey)} onClick={() => void saveBranch(branch)} style={primaryButtonStyle} type="button">
                    {isSaving ? "儲存中..." : "儲存館別設定"}
                  </button>
                  <button
                    disabled={Boolean(busyKey) || emails.filter((value) => value.trim()).length === 0}
                    onClick={() => void sendTest(branch, "email")}
                    style={secondaryButtonStyle}
                    type="button"
                  >
                    {isTestingEmail ? "發送中..." : "測試 Email"}
                  </button>
                  <button
                    disabled={Boolean(busyKey) || !lineGroupValue.trim()}
                    onClick={() => void sendTest(branch, "line_group")}
                    style={secondaryButtonStyle}
                    type="button"
                  >
                    {isTestingLine ? "發送中..." : "測試 LINE"}
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <strong>目前啟用中的收件人</strong>
                  {activeRecipients.length === 0 ? (
                    <span style={helperStyle}>目前沒有啟用中的收件設定。</span>
                  ) : (
                    <div style={recipientListStyle}>
                      {activeRecipients.map((recipient) => (
                        <div key={recipient.id} style={recipientRowStyle}>
                          <span style={recipientBadgeStyle}>{recipient.channel === "email" ? "Email" : "LINE 群組"}</span>
                          <code style={codeStyle}>{recipient.target}</code>
                          <span style={helperStyle}>{recipient.isActive ? "啟用中" : "已停用"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function toEmailDrafts(branches: string[], recipients: Recipient[]) {
  return Object.fromEntries(
    branches.map((branch) => [
      branch,
      recipients.filter((recipient) => recipient.branch === branch && recipient.channel === "email").map((recipient) => recipient.target),
    ]),
  ) as Record<string, string[]>;
}

function toLineGroupDrafts(branches: string[], recipients: Recipient[]) {
  return Object.fromEntries(
    branches.map((branch) => [
      branch,
      recipients.find((recipient) => recipient.branch === branch && recipient.channel === "line_group")?.target ?? "",
    ]),
  ) as Record<string, string>;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-TW", { hour12: false });
}

const pageStyle = { background: "#f6faf8", minHeight: "100vh", padding: "20px 12px 80px" } satisfies React.CSSProperties;
const shellStyle = { margin: "0 auto", maxWidth: 1120 } satisfies React.CSSProperties;
const headerStyle = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginBottom: 18 } satisfies React.CSSProperties;
const eyebrowStyle = { color: "#5e7a72", fontSize: 14, margin: 0 } satisfies React.CSSProperties;
const introStyle = { color: "#66756f", fontSize: 14, lineHeight: 1.55, margin: "6px 0 0", maxWidth: 720 } satisfies React.CSSProperties;
const noticePanelStyle = { background: "#eaf6ef", border: "1px solid #b9e3c5", borderRadius: 16, color: "#23563b", display: "grid", fontSize: 14, gap: 6, lineHeight: 1.5, marginBottom: 16, padding: 16 } satisfies React.CSSProperties;
const pendingPanelStyle = { background: "#fffaf1", border: "1px solid #ecd39a", borderRadius: 16, display: "grid", gap: 10, marginBottom: 16, padding: 16 } satisfies React.CSSProperties;
const groupListStyle = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" } satisfies React.CSSProperties;
const groupCardStyle = { background: "#fff", border: "1px solid #ead9b3", borderRadius: 14, display: "grid", gap: 8, padding: 12 } satisfies React.CSSProperties;
const groupActionsStyle = { display: "flex", flexWrap: "wrap", gap: 8 } satisfies React.CSSProperties;
const gridStyle = { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" } satisfies React.CSSProperties;
const panelStyle = { background: "#fff", border: "1px solid #d5e4de", borderRadius: 18, display: "grid", gap: 14, padding: 18 } satisfies React.CSSProperties;
const channelBlockStyle = { display: "grid", gap: 10 } satisfies React.CSSProperties;
const channelHeaderStyle = { alignItems: "center", display: "flex", justifyContent: "space-between" } satisfies React.CSSProperties;
const helperStyle = { color: "#66756f", fontSize: 13, lineHeight: 1.5, margin: 0 } satisfies React.CSSProperties;
const inputStyle = { border: "1px solid #b9cbc5", borderRadius: 10, font: "inherit", minHeight: 44, padding: "10px 12px", width: "100%" } satisfies React.CSSProperties;
const actionRowStyle = { display: "flex", flexWrap: "wrap", gap: 8 } satisfies React.CSSProperties;
const recipientListStyle = { display: "grid", gap: 8 } satisfies React.CSSProperties;
const recipientRowStyle = { alignItems: "center", background: "#f8fbf9", border: "1px solid #d5e4de", borderRadius: 12, display: "flex", flexWrap: "wrap", gap: 8, padding: 10 } satisfies React.CSSProperties;
const recipientBadgeStyle = { background: "#e7f1ec", borderRadius: 999, color: "#23563b", fontSize: 12, fontWeight: 700, padding: "4px 10px" } satisfies React.CSSProperties;
const codeStyle = { background: "#f3f5f4", borderRadius: 8, fontSize: 12, padding: "4px 8px" } satisfies React.CSSProperties;
const primaryButtonStyle = { background: "#159947", border: 0, borderRadius: 10, color: "#fff", cursor: "pointer", font: "inherit", fontWeight: 700, minHeight: 44, padding: "10px 14px" } satisfies React.CSSProperties;
const secondaryButtonStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 10, color: "#173d31", cursor: "pointer", font: "inherit", minHeight: 40, padding: "8px 12px" } satisfies React.CSSProperties;
const removeButtonStyle = { background: "#fff", border: "1px solid #efb8b8", borderRadius: 10, color: "#9c2323", cursor: "pointer", font: "inherit", minHeight: 44, padding: "8px 10px" } satisfies React.CSSProperties;
const linkButtonStyle = { background: "#fff", border: "1px solid #b9cbc5", borderRadius: 999, color: "#173d31", padding: "9px 14px", textDecoration: "none" } satisfies React.CSSProperties;
const errorStyle = { background: "#fff1f0", border: "1px solid #f5b8b5", borderRadius: 12, color: "#a02621", margin: "0 0 14px", padding: 12 } satisfies React.CSSProperties;
const noticeStyle = { background: "#e9f8ee", border: "1px solid #b9e7c7", borderRadius: 12, color: "#246a3f", margin: "0 0 14px", padding: 12 } satisfies React.CSSProperties;
