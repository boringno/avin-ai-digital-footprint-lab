"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ background: "#f6faf8", color: "#16302b", fontFamily: "sans-serif", margin: 0 }}>
        <main style={{ margin: "0 auto", maxWidth: 520, padding: "96px 24px" }}>
          <section style={{ background: "#fff", border: "1px solid #d5e4de", borderRadius: 20, padding: 28 }}>
            <p style={{ color: "#5e7a72", margin: 0 }}>LINE AI 客服系統</p>
            <h1 style={{ margin: "8px 0 12px" }}>系統暫時無法使用</h1>
            <p style={{ lineHeight: 1.6, margin: 0 }}>請稍後重新整理頁面；若問題持續，請聯絡系統管理員。</p>
            <button onClick={() => window.location.reload()} style={{ background: "#16302b", border: 0, borderRadius: 10, color: "#fff", cursor: "pointer", marginTop: 20, padding: "10px 14px" }} type="button">
              重新整理
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
