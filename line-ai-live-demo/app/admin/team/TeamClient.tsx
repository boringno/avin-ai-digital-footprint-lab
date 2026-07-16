"use client";

import { FormEvent, useState } from "react";

import type { TeamMember } from "@/lib/admin-team-data";
import { staffRoleLabels } from "@/lib/admin-display-maps";

type ClientManagedRole = "agent" | "analyst" | "manager";

function formatDate(value: string | null) {
  if (!value) {
    return "尚未發送邀請";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

export function TeamClient({ canManage, initialMembers }: { canManage: boolean; initialMembers: TeamMember[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ClientManagedRole>("agent");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingDigestTest, setIsSendingDigestTest] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState("");

  async function parseResponse(response: Response) {
    const body = (await response.json()) as { error?: string; member?: TeamMember; invitationSent?: boolean; members?: TeamMember[]; ok?: boolean };
    if (!response.ok || !body.ok) {
      throw new Error(body.error ?? "操作失敗，請稍後再試。");
    }
    return body;
  }

  async function refreshMembers() {
    const response = await fetch("/api/admin/team", { cache: "no-store" });
    const body = await parseResponse(response);
    setMembers(body.members ?? []);
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/admin/team/invite", {
        body: JSON.stringify({ display_name: displayName, email, role }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = await parseResponse(response);
      setDisplayName("");
      setEmail("");
      setRole("agent");
      setNotice(body.invitationSent ? "邀請已寄出；對方完成密碼設定後即可登入。" : "此帳號已存在，已更新為可存取此診所後台。");
      await refreshMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "邀請失敗，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateMember(memberId: string, patch: { is_active?: boolean; role?: ClientManagedRole }) {
    if (busyMemberId) {
      return;
    }

    setError("");
    setNotice("");
    setBusyMemberId(memberId);
    try {
      const response = await fetch("/api/admin/team/member", {
        body: JSON.stringify({ member_id: memberId, ...patch }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      await parseResponse(response);
      await refreshMembers();
      setNotice("人員權限已更新。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更新失敗，請稍後再試。");
    } finally {
      setBusyMemberId("");
    }
  }

  async function resendInvite(memberId: string) {
    if (busyMemberId) return;

    setError("");
    setNotice("");
    setBusyMemberId(memberId);
    try {
      const response = await fetch("/api/admin/team/member/resend-invite", {
        body: JSON.stringify({ member_id: memberId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      await parseResponse(response);
      setNotice("邀請信已重新寄送，對方請在一小時內開啟連結並設定密碼。");
      await refreshMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重新寄送邀請失敗，請稍後再試。");
    } finally {
      setBusyMemberId("");
    }
  }

  async function removeMember(member: TeamMember) {
    if (busyMemberId || !window.confirm(`確定要移除「${member.displayName}」嗎？移除後對方將無法登入，且會從目前人員清單消失。`)) {
      return;
    }

    setError("");
    setNotice("");
    setBusyMemberId(member.id);
    try {
      const response = await fetch("/api/admin/team/member", {
        body: JSON.stringify({ member_id: member.id }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
      await parseResponse(response);
      await refreshMembers();
      setNotice("人員已移除，已無法登入且不再顯示於目前清單。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "移除人員失敗，請稍後再試。");
    } finally {
      setBusyMemberId("");
    }
  }

  async function sendHandoffDigestTest() {
    if (isSendingDigestTest) return;

    setError("");
    setNotice("");
    setIsSendingDigestTest(true);
    try {
      const response = await fetch("/api/admin/notifications/handoff-digest-test", { method: "POST" });
      await parseResponse(response);
      setNotice("高雄館通知測試信已寄出，請查看指定信箱。測試信不含客人資料。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "通知測試失敗，請稍後再試。");
    } finally {
      setIsSendingDigestTest(false);
    }
  }

  return (
    <main style={{ background: "#f6faf8", minHeight: "100vh", padding: "20px 12px 80px" }}>
      <div style={{ margin: "0 auto", maxWidth: 980 }}>
        <header style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <p style={{ color: "#5e7a72", fontSize: 14, margin: 0 }}>團隊管理</p>
            <h1 style={{ color: "#16302b", margin: "4px 0 0" }}>人員與權限管理</h1>
            <p style={{ color: "#66756f", fontSize: 14, margin: "6px 0 0" }}>帳號採邀請制；停用後將立即無法登入後台。</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/admin/workbench" style={linkButtonStyle}>接手工作台</a>
            <a href="/admin/leads" style={linkButtonStyle}>預約線索</a>
          </div>
        </header>

        {error ? <p style={errorStyle}>{error}</p> : null}
        {notice ? <p style={noticeStyle}>{notice}</p> : null}

        {canManage ? (
          <>
            <section style={panelStyle}>
              <h2 style={{ marginTop: 0 }}>邀請診所人員</h2>
              <p style={{ color: "#66756f", marginTop: 0 }}>可邀請客服主管、第一線客服或行銷／報表查看人員。系統維護與診所管理者由平台端管理。</p>
              <form onSubmit={submitInvite} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <input aria-label="顯示名稱" onChange={(event) => setDisplayName(event.target.value)} placeholder="姓名或顯示名稱" required value={displayName} style={inputStyle} />
                <input aria-label="電子郵件" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required type="email" value={email} style={inputStyle} />
                <select aria-label="角色" onChange={(event) => setRole(event.target.value as ClientManagedRole)} value={role} style={inputStyle}>
                  <option value="manager">客服主管</option>
                  <option value="agent">第一線客服</option>
                  <option value="analyst">行銷／報表查看</option>
                </select>
                <button disabled={isSubmitting} type="submit" style={primaryButtonStyle}>{isSubmitting ? "寄送中..." : "寄送邀請"}</button>
              </form>
            </section>
            <section style={panelStyle}>
              <h2 style={{ marginTop: 0 }}>真人接手通知測試</h2>
              <p style={{ color: "#66756f", marginTop: 0 }}>目前只測試高雄館指定信箱。測試信與正式摘要都不包含客人姓名、電話、LINE ID 或對話內容。</p>
              <button disabled={isSendingDigestTest} onClick={sendHandoffDigestTest} style={secondaryButtonStyle} type="button">
                {isSendingDigestTest ? "寄送中..." : "寄送高雄館測試信"}
              </button>
            </section>
          </>
        ) : (
          <p style={noticeStyle}>只有診所管理者可以邀請、停用或調整人員權限。</p>
        )}

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>目前人員</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {members.map((member) => {
              const canEdit = canManage && member.role !== "owner" && member.role !== "maintainer";
              const isBusy = busyMemberId === member.id;
              return (
                <article key={member.id} style={{ background: "#fff", border: "1px solid #d5e4de", borderRadius: 14, display: "grid", gap: 8, padding: 14 }}>
                  <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
                    <strong style={{ color: "#16302b" }}>{member.displayName}</strong>
                    <span style={{ ...badgeStyle, background: member.isActive ? "#daf6e3" : "#f3e5e5", color: member.isActive ? "#126838" : "#8c2323" }}>
                      {member.isActive ? "使用中" : "已停用"}
                    </span>
                  </div>
                  <span style={{ color: "#516660", fontSize: 14 }}>{member.email || "尚未取得 Email"}</span>
                  <span style={{ color: "#516660", fontSize: 14 }}>角色：{staffRoleLabels[member.role]}</span>
                  <span style={{ color: "#516660", fontSize: 13 }}>最近邀請：{formatDate(member.lastInvitedAt ?? member.invitedAt)}</span>
                  {canEdit ? (
                    <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <select disabled={isBusy} onChange={(event) => updateMember(member.id, { role: event.target.value as ClientManagedRole })} value={member.role} style={inputStyle}>
                        <option value="manager">客服主管</option>
                        <option value="agent">第一線客服</option>
                        <option value="analyst">行銷／報表查看</option>
                      </select>
                      {member.isActive ? (
                        <button disabled={isBusy} onClick={() => resendInvite(member.id)} style={secondaryButtonStyle} type="button">
                          重新寄送邀請
                        </button>
                      ) : null}
                      <button disabled={isBusy} onClick={() => updateMember(member.id, { is_active: !member.isActive })} style={secondaryButtonStyle} type="button">
                        {isBusy ? "處理中..." : member.isActive ? "停用帳號" : "重新啟用"}
                      </button>
                      <button disabled={isBusy} onClick={() => removeMember(member)} style={removeButtonStyle} type="button">
                        {isBusy ? "處理中..." : "移除人員"}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

const panelStyle = {
  background: "#fff",
  border: "1px solid #d5e4de",
  borderRadius: 18,
  marginBottom: 16,
  padding: 18,
} satisfies React.CSSProperties;

const inputStyle = {
  background: "#fff",
  border: "1px solid #b9cbc5",
  borderRadius: 10,
  fontSize: 16,
  minHeight: 44,
  padding: "10px 12px",
} satisfies React.CSSProperties;

const primaryButtonStyle = {
  background: "#159947",
  border: 0,
  borderRadius: 10,
  color: "#fff",
  cursor: "pointer",
  fontSize: 16,
  minHeight: 44,
  padding: "10px 14px",
} satisfies React.CSSProperties;

const secondaryButtonStyle = {
  background: "#fff",
  border: "1px solid #b9cbc5",
  borderRadius: 10,
  color: "#16302b",
  cursor: "pointer",
  fontSize: 15,
  minHeight: 42,
  padding: "8px 12px",
} satisfies React.CSSProperties;

const removeButtonStyle = {
  background: "#fff7f5",
  border: "1px solid #d88a7a",
  borderRadius: 10,
  color: "#9f1d1d",
  cursor: "pointer",
  fontSize: 15,
  minHeight: 42,
  padding: "8px 12px",
} satisfies React.CSSProperties;

const linkButtonStyle = {
  background: "#fff",
  border: "1px solid #b9cbc5",
  borderRadius: 999,
  color: "#16302b",
  padding: "8px 12px",
  textDecoration: "none",
} satisfies React.CSSProperties;

const errorStyle = {
  background: "#fff2f0",
  border: "1px solid #f3b9b3",
  borderRadius: 12,
  color: "#8c2323",
  marginBottom: 16,
  padding: 12,
} satisfies React.CSSProperties;

const noticeStyle = {
  background: "#e8f7ed",
  border: "1px solid #b9e4c7",
  borderRadius: 12,
  color: "#17693a",
  marginBottom: 16,
  padding: 12,
} satisfies React.CSSProperties;

const badgeStyle = {
  borderRadius: 999,
  fontSize: 13,
  padding: "4px 9px",
} satisfies React.CSSProperties;
