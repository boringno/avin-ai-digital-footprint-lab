import { getRuntimeConfig } from "@/lib/live-demo-config";
import { getSeedSummary } from "@/lib/seed-loader";

export default async function HomePage() {
  const config = getRuntimeConfig();
  const summary = await getSeedSummary();

  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 20px 80px" }}>
      <div
        style={{
          padding: 24,
          borderRadius: 20,
          background: "linear-gradient(135deg, #ffffff, #e6f3ee)",
          border: "1px solid #c8ddd5",
          boxShadow: "0 16px 40px rgba(22, 48, 43, 0.08)",
        }}
      >
        <p style={{ margin: 0, color: "#4a6a62", fontSize: 14 }}>正式展示環境</p>
        <h1 style={{ margin: "8px 0 12px", fontSize: 34 }}>LINE AI 醫美客服系統</h1>
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          這個骨架目前只做安全路由：穩定 FAQ 自動回答，價格、預約、醫療風險與個人化問題一律轉真人。
        </p>
      </div>

      <section style={{ display: "grid", gap: 16, marginTop: 24 }}>
        <InfoCard
          title="系統資訊"
          rows={[
            ["健康檢查", "GET /api/health"],
            ["LINE Webhook", "POST /api/line/webhook"],
            ["近期記錄", "GET /api/debug/recent"],
            ["自動回覆", String(config.sendReply)],
            ["納入待審內容", String(config.includePending)],
          ]}
        />
        <InfoCard
          title="資料匯入摘要"
          rows={[
            ["資料夾", config.seedDir],
            ["FAQ 筆數", String(summary.faqCount)],
            ["轉真人規則", String(summary.handoffCount)],
            ["價格活動", String(summary.pricingCount)],
          ]}
        />
      </section>
    </main>
  );
}

function InfoCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 16,
        background: "#fff",
        border: "1px solid #d5e4de",
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map(([label, value]) => (
          <div
            key={label}
            style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}
          >
            <span style={{ color: "#5e7a72" }}>{label}</span>
            <code style={{ whiteSpace: "nowrap" }}>{value}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
