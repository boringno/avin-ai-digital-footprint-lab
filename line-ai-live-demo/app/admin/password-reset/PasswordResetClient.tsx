"use client";

import { FormEvent, useState } from "react";

export function PasswordResetClient() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/auth/request-password-reset", {
        body: JSON.stringify({ email }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as { message?: string };
      setMessage(body.message ?? "請查看您的 Email 信箱。");
    } catch {
      setMessage("暫時無法處理，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ margin: "0 auto", maxWidth: 420, padding: "72px 20px" }}>
      <section style={{ background: "#fff", border: "1px solid #d5e4de", borderRadius: 20, boxShadow: "0 16px 40px rgba(22, 48, 43, 0.08)", padding: 28 }}>
        <p style={{ color: "#4a6a62", fontSize: 14, margin: 0 }}>LINE AI 客服系統</p>
        <h1 style={{ fontSize: 28, margin: "8px 0 10px" }}>重設後台密碼</h1>
        <p style={{ color: "#66756f", lineHeight: 1.6, margin: "0 0 20px" }}>輸入您的後台帳號 Email，我們會寄送安全連結。</p>
        {message ? <p style={noticeStyle}>{message}</p> : null}
        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} style={inputStyle} />
          </label>
          <button disabled={submitting} type="submit" style={buttonStyle}>{submitting ? "寄送中..." : "寄送設定密碼連結"}</button>
        </form>
        <p style={{ marginBottom: 0, marginTop: 18 }}><a href="/admin/login">返回登入</a></p>
      </section>
    </main>
  );
}

const inputStyle = {
  border: "1px solid #b9cbc5",
  borderRadius: 10,
  fontSize: 16,
  padding: 12,
} satisfies React.CSSProperties;

const buttonStyle = {
  background: "#16302b",
  border: 0,
  borderRadius: 12,
  color: "#fff",
  cursor: "pointer",
  fontSize: 16,
  padding: "12px 16px",
} satisfies React.CSSProperties;

const noticeStyle = {
  background: "#e8f7ed",
  borderRadius: 12,
  color: "#126838",
  padding: 12,
} satisfies React.CSSProperties;
