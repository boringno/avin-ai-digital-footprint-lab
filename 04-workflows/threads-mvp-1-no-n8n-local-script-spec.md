# Threads MVP 1｜No-n8n Local Script Spec

日期：2026-05-12
分類：Workflow / MVP Spec / Implementation Plan
狀態：Spec Draft

Parent docs：
- `04-workflows/threads-mvp-1-manual-publish-auto-insights-sync.md`
- `04-workflows/threads-mvp-1-notion-fields-spec.md`

---

## 1. Purpose

本文件說明 AVIN 在不使用 n8n 的情況下，如何以免費、repo-native 的方式完成 Threads Insights Sync MVP 1。

### 為什麼不使用 n8n

- **降低付費依賴**：n8n cloud 需要訂閱費用；self-hosted n8n 需要額外維護伺服器
- **保持 repo-native**：腳本直接放在 GitHub repo，版本控制完整，每次修改都有紀錄
- **方便除錯**：local script 比視覺化 workflow 更容易追蹤錯誤與調整邏輯
- **符合 AI Digital Footprint OS 的長期累積方式**：所有工作流邏輯都在 repo 裡，不依賴外部付費平台
- **驗證優先**：先用本機腳本驗證 Threads API + Notion 串接是否可行，再決定是否升級 GitHub Actions

---

## 2. Recommended Path

### Phase 1：Local Script Manual Run（本次 MVP 1）

- AVIN 手動發布 Threads
- AVIN 手動將 URL / Post ID 填回 Notion
- AVIN 手動在本機執行 sync script
- Script 讀取 Notion、呼叫 Threads Insights API、回寫 metrics

**這是 MVP 1 的範圍，也是本文件的重點。**

---

### Phase 2：GitHub Actions Scheduled Sync

- 腳本邏輯與 Phase 1 相同
- 改為 GitHub Actions cron job 自動定時執行
- Secrets 從 local `.env` 遷移到 GitHub Actions Secrets
- 不再需要 AVIN 手動執行

---

### Phase 3：Threads Auto Publishing After Approval

- 加入 Human Review Gate 觸發邏輯
- Approved by AVIN → 系統自動發布 Threads → 回寫 URL / Post ID → 進入 Insights Sync
- 屬於 MVP 2 範疇，不在本次討論

---

**MVP 1 只做 Phase 1。不要跳到 Phase 2 / Phase 3。**

---

## 3. MVP 1 Flow

```
AVIN manually publishes Threads post
  → AVIN pastes Threads URL / Post ID into Notion
  → AVIN sets Status = Published in Notion
  → AVIN runs local sync script manually:
      python scripts/threads/sync_threads_insights.py
      (or equivalent)
  → Script reads Notion
      → filter Platform = Threads
      → filter Status = Published or Insights Synced
      → filter Threads Post ID exists
      → filter Sync Enabled = true
      → filter No Blocking Issue = true
  → Script validates Threads Post ID
  → Script calls Threads Insights API
  → Script normalizes metrics
  → Script calculates Engagement Rate (if views available)
  → Script writes metrics back to Notion
  → Script updates Sync Status = Synced
  → Script updates Data Last Synced At
  → Optional: script prints performance log draft to console or file
```

---

## 4. Required Secrets

以下 secrets 為腳本運行所需，**不得寫入任何 repo 檔案、不得寫入 Notion**。

| Secret | 用途 |
|--------|------|
| `THREADS_ACCESS_TOKEN` | 呼叫 Threads Insights API |
| `META_APP_SECRET` | 部分 API 簽名驗證可能需要 |
| `NOTION_API_KEY` | 讀寫 Notion Content Queue 資料庫 |
| `NOTION_DATABASE_ID` | 指定要讀取的 Notion 資料庫 |

> **這些值只能放在 local `.env`，不得 commit 到 GitHub。**

---

## 5. Suggested .env Example

以下為 `.env` 範本，只列 key names，不包含任何真值。

實際 `.env` 檔案放在 repo 根目錄，**必須加入 `.gitignore`**。

```
THREADS_ACCESS_TOKEN=
META_APP_SECRET=
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

> **重要：`.env` must be gitignored。**
>
> 目前 repo 尚未建立 `.gitignore`。在開始任何腳本實作前，必須先建立 `.gitignore` 並加入以下內容：
>
> ```
> .env
> *.env
> ```

---

## 6. Local Script Responsibilities

MVP 1 local script 需要處理以下邏輯：

### 環境載入

- 從 `.env` 讀取所有 secrets
- 驗證必要 secrets 不為空（若缺少則報錯並退出，不進入 API 呼叫）

### Notion 讀取

- 連接 Notion API
- 讀取指定 database 中的 items
- 篩選條件：
  - `Platform = Threads`
  - `Status = Published` 或 `Status = Insights Synced`
  - `Threads Post ID` 不為空
  - `Sync Enabled = true`
  - `No Blocking Issue = true`

### Post ID 驗證

- 確認 Threads Post ID 格式正確（非空、非顯然無效值）
- 若無效 → Skip，Sync Status = Skipped，記錄原因

### Threads Insights API 呼叫

- 使用 Threads Post ID 呼叫 Threads Insights API
- 取回 metrics（Views、Likes、Replies、Reposts、Quotes、Shares 等）
- API 細節以 Meta 官方文件最新版本為準

### Metrics 正規化

- 將 API 回傳的 metrics 對應到 Notion 欄位
- 若某指標為 null（API 未回傳）：以 null 處理，不代入 0
- 記錄哪些指標缺失

### Engagement Rate 計算

```
Engagement Rate = (likes + replies + reposts + quotes + shares) / views
```

- 若 `views` 不可用或為 0：不計算，Engagement Rate 留空，寫入說明
- 若部分指標為 null：以 0 代入計算，並在 Sync Error Note 列出缺失欄位名稱

### Notion 回寫

- 將 metrics 寫回對應 Notion item
- 更新 `Sync Status = Synced`
- 更新 `Data Last Synced At`
- 清空或更新 `Sync Error Note`

### 失敗處理

- 若 API 呼叫失敗或 Notion 回寫失敗：
  - 不覆蓋前次成功的 metrics
  - 更新 `Sync Status = Failed`
  - 寫入 `Sync Error Note`（錯誤原因）
  - 保留可重試狀態

---

## 7. Local Script Non-goals

MVP 1 local script **不做**以下事項：

| 項目 | 說明 |
|------|------|
| Threads auto publishing | 屬於 MVP 2，不在本次範圍 |
| Instagram publishing | 後續 phase，本階段不處理 |
| Instagram insights sync | 後續 phase，本階段不處理 |
| Performance dashboard | 不建立視覺化 dashboard |
| OAuth full UI | 不建立 token 申請 UI 流程 |
| Token refresh automation | 手動更新 `.env` 中的 token |
| GitHub Actions scheduling | Phase 2 的工作，MVP 1 只做手動執行 |
| Public performance dashboard | 不建立公開展示頁面 |

---

## 8. Security Rules

> **以下規則不得以任何理由繞過。**

### Token 安全

- **Never print tokens in console logs**：任何 `print()` / `console.log()` 都不得輸出 token 或 secret
- **Never commit `.env`**：`.env` 必須在 `.gitignore` 中，且不得手動 `git add .env`
- **Never store secrets in Notion**：Notion 欄位只存放 metrics 數值與狀態，不存放任何 token

### 資料安全

- **Never store raw API response in public GitHub logs**：若有 logging，只記錄 metrics 數值，不記錄完整 API response
- **Use aggregated metrics only**：GitHub performance log 只寫聚合後的數字，不記錄 user PII 或敏感欄位

### 緊急提醒

> **目前 repo 尚未建立 `.gitignore`。**
>
> 在建立任何 `.env` 或執行任何腳本前，必須先建立 `.gitignore` 並加入：
>
> ```
> .env
> *.env
> ```
>
> 否則 `git add .` 或 `git commit -a` 可能意外 commit 含有 secrets 的 `.env` 檔案。

---

## 9. Future Upgrade to GitHub Actions

當 Phase 1 驗證完成後，升級到 GitHub Actions 的步驟：

1. 將以下 secrets 加入 GitHub repo 的 Actions Secrets（Settings → Secrets and variables → Actions）：
   - `THREADS_ACCESS_TOKEN`
   - `META_APP_SECRET`
   - `NOTION_API_KEY`
   - `NOTION_DATABASE_ID`

2. 建立 `.github/workflows/threads-insights-sync.yml`，設定 cron schedule（例如每日一次）

3. 腳本改為從環境變數讀取 secrets（`os.environ.get(...)` 或相同機制），不再依賴 `.env`

4. GitHub Actions log 設定不得印出任何 secret 值

5. 確認 workflow 的 `permissions: contents: write` 只在需要產生 performance log 時才開啟

---

## 10. Acceptance Criteria

以下所有條件達成，才視為 MVP 1 local script 完成：

- [ ] AVIN 可以在本機手動執行腳本
- [ ] 腳本可以正確讀取 Notion Content Queue
- [ ] 腳本可以呼叫 Threads Insights API 並取得 metrics
- [ ] 腳本可以將 metrics 正確寫回 Notion
- [ ] 同步失敗時不覆蓋前次成功的 metrics
- [ ] 任何 secrets 不出現在 console log 或 repo
- [ ] `.env` 不在 git tracking 中（`.gitignore` 已設定）
- [ ] 不依賴 n8n 或任何付費服務

---

## 11. Next Action

**下一步不是直接寫完整腳本，而是按順序推進：**

### Step 1：建立 `.gitignore`

在 repo 根目錄建立 `.gitignore`，至少包含：

```
.env
*.env
```

這是在建立任何 `.env` 或腳本前的**必要前置步驟**。

### Step 2：建立 local script spec

基於本文件 Section 6 的邏輯，撰寫 `sync_threads_insights.py` 的詳細 function-level spec（每個 function 的輸入、輸出、錯誤處理）。

### Step 3：建立 manual test checklist

在寫完整腳本前，先用 API testing tool（Postman / curl）手動：

- 呼叫 Threads Insights API，確認 response 格式
- 讀取 Notion database，確認欄位名稱對應
- 記錄任何與預期不符的地方

### Step 4：MVP 1 local script implementation

依據 Step 1–3 的實際確認結果，實作完整腳本。
