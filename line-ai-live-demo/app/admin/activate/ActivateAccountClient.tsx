"use client";

import { FormEvent, useEffect, useState } from "react";

export function ActivateAccountClient() {
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    setAccessToken(params.get("access_token") ?? "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");
    setNotice("");
    if (!accessToken) {
      setError("此邀請連結已失效，請聯絡診所管理者重新寄送。");
      return;
    }
    if (password.length < 12) {
      setError("密碼至少需要 12 碼。");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("兩次輸入的密碼不一致。");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/auth/activate", {
        body: JSON.stringify({ accessToken, password }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "設定密碼失敗，請稍後再試。");
      }
      setNotice("密碼設定完成，請使用您的 Email 與新密碼登入後台。");
      setPassword("");
      setPasswordConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "設定密碼失敗，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ margin: "0 auto", maxWidth: 420, padding: "72px 20px" }}>
      <section style={{ background: "#fff", border: "1px solid #d5e4de", borderRadius: 20, boxShadow: "0 16px 40px rgba(22, 48, 43, 0.08)", padding: 28 }}>
        <p style={{ color: "#4a6a62", fontSize: 14, margin: 0 }}>LINE AI 客服系統</p>
        <h1 style={{ fontSize: 28, margin: "8px 0 10px" }}>設定後台密碼</h1>
        <p style={{ color: "#66756f", lineHeight: 1.6, margin: "0 0 20px" }}>完成後請使用 Email 與新密碼登入。請勿與其他人共用帳號。</p>
        {error ? <p style={errorStyle}>{error}</p> : null}
        {notice ? <p style={noticeStyle}>{notice} <a href="/admin/login">前往登入</a></p> : null}
        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>新密碼</span>
            <input autoComplete="new-password" disabled={!accessToken || submitting} minLength={12} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} style={inputStyle} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>再次輸入新密碼</span>
            <input autoComplete="new-password" disabled={!accessToken || submitting} minLength={12} onChange={(event) => setPasswordConfirmation(event.target.value)} required type="password" value={passwordConfirmation} style={inputStyle} />
          </label>
          <button disabled={!accessToken || submitting} type="submit" style={buttonStyle}>{submitting ? "設定中..." : "完成設定"}</button>
        </form>
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

const errorStyle = {
  background: "#fff2f0",
  borderRadius: 12,
  color: "#9f1d1d",
  padding: 12,
} satisfies React.CSSProperties;

const noticeStyle = {
  background: "#e8f7ed",
  borderRadius: 12,
  color: "#126838",
  padding: 12,
} satisfies React.CSSProperties;
