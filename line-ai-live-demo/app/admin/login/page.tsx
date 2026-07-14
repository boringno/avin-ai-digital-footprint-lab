type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

function getErrorMessage(error?: string) {
  switch (error) {
    case "invalid_credentials":
      return "帳號或密碼不正確，或此帳號尚未加入 staff_users。";
    case "missing_credentials":
      return "請輸入 Email 與密碼。";
    case "supabase_not_configured":
      return "Supabase 後台環境變數尚未設定完整。";
    default:
      return "";
  }
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const errorMessage = getErrorMessage(params?.error);

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "72px 20px" }}>
      <section
        style={{
          background: "#fff",
          border: "1px solid #d5e4de",
          borderRadius: 20,
          boxShadow: "0 16px 40px rgba(22, 48, 43, 0.08)",
          padding: 28,
        }}
      >
        <p style={{ color: "#4a6a62", fontSize: 14, margin: 0 }}>LINE AI Admin</p>
        <h1 style={{ fontSize: 28, margin: "8px 0 20px" }}>客服後台登入</h1>
        {errorMessage ? (
          <p style={{ background: "#fff2f0", borderRadius: 12, color: "#9f1d1d", padding: 12 }}>{errorMessage}</p>
        ) : null}
        <form action="/api/admin/auth/login" method="post" style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input name="email" required type="email" style={{ border: "1px solid #b9cbc5", borderRadius: 10, fontSize: 16, padding: 12 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>密碼</span>
            <input name="password" required type="password" style={{ border: "1px solid #b9cbc5", borderRadius: 10, fontSize: 16, padding: 12 }} />
          </label>
          <button
            type="submit"
            style={{
              background: "#16302b",
              border: 0,
              borderRadius: 12,
              color: "#fff",
              cursor: "pointer",
              fontSize: 16,
              padding: "12px 16px",
            }}
          >
            登入
          </button>
        </form>
      </section>
    </main>
  );
}
