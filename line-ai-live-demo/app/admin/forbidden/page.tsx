export default function AdminForbiddenPage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "72px 20px" }}>
      <section style={{ background: "#fff", border: "1px solid #d5e4de", borderRadius: 20, padding: 28 }}>
        <h1 style={{ marginTop: 0 }}>無法進入後台</h1>
        <p style={{ lineHeight: 1.7 }}>
          這個帳號尚未建立在 <code>staff_users</code>，或帳號已停用。請由 owner 執行 bootstrap 或在後台資料表啟用人員。
        </p>
        <form action="/api/admin/auth/logout" method="post">
          <button type="submit" style={{ border: 0, borderRadius: 10, padding: "10px 14px" }}>
            回登入頁
          </button>
        </form>
      </section>
    </main>
  );
}
