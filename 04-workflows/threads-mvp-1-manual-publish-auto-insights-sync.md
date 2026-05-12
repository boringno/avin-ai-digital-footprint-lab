# Threads MVP 1｜Manual Publish + Auto Threads Insights Sync

日期：2026-05-12
分類：Workflow / MVP Spec / Threads Insights
狀態：Spec Draft

Parent doc：`04-workflows/threads-publishing-feedback-loop.md`

---

## 1. Purpose

MVP 1 的目的不是自動發文，而是先建立 Threads 發布後的數據回收能力。

本階段讓 AVIN 可以：

- 手動發布 Threads 貼文
- 將 Threads URL / Threads Post ID 填回 Notion
- 由系統定時自動同步 Threads insights
- 將成效數據回寫 Notion
- 更新 Sync Status 與 Data Last Synced At
- 必要時產生 GitHub performance log
- 為後續 Threads 自動發文 MVP 2 建立基礎

**MVP 1 是最低風險版本。**

優先驗證 Insights Sync 與 Notion writeback 是否可運作，不涉及自動發布。

Threads 自動發布邏輯、Human Review Gate 的觸發機制，全部留給 MVP 2。

---

## 2. Scope

### 本階段包含

- Manual Threads publishing（AVIN 手動）
- Threads URL / Post ID input（AVIN 手動填回 Notion）
- Notion Content Queue read（系統讀取）
- Threads Insights API sync（系統自動）
- Notion metrics writeback（系統自動）
- Sync Status update（系統自動）
- Sync Error Note（系統寫入）
- Optional GitHub performance log（視情況產生）

### 本階段不包含

- Threads auto publishing
- Instagram publishing 或 insights
- Content generation automation
- 未審核內容自動發布
- Human Review Gate 觸發邏輯（屬於 MVP 2）
- token / secret commit 到 GitHub
- 多平台 dashboard
- Cross-platform comparison

---

## 3. Workflow Overview

```
AVIN manually publishes Threads post
  → AVIN pastes Threads URL into Notion
  → AVIN pastes Threads Post ID into Notion (or parsed from URL)
  → AVIN sets Notion Status = Published
  → Scheduled sync job triggers
    → Read Notion items where:
        Platform = Threads
        AND Status = Published or Insights Synced
        AND Threads Post ID exists
        AND Sync Enabled = true
        AND No Blocking Issue = true
    → Validate Threads Post ID format
    → Call Threads Insights API
    → Receive metrics response
    → Normalize metrics fields
    → Write metrics back to Notion
    → Update Data Last Synced At
    → Update Sync Status = Synced
  → Optional: generate GitHub Performance Log
  → Lifecycle Ready check
    → If Threads URL + metrics present → Insights Synced
    → If lifecycle criteria met → Lifecycle Completed
```

---

## 4. Trigger Rules

### 同步觸發條件（必要，all must pass）

| 條件 | 說明 |
|------|------|
| Platform = `Threads` | 確認平台為 Threads |
| Status = `Published` 或 `Insights Synced` | 已發布內容才可同步 |
| Threads Post ID exists | Post ID 不可空白 |
| Sync Enabled = `true` | AVIN 主動啟用同步 |
| No Blocking Issue = `true` | 無阻擋問題 |

### 可選條件（優化用）

- Published At exists（確認已有發布時間）
- Data Last Synced At is empty（尚未同步過，優先處理）
- Data Last Synced At 超過設定間隔（重新同步更新數據）

### 禁止同步的狀態（Any one = Skip）

```
Status = Idea                  → SKIP
Status = Draft                 → SKIP
Status = Ready for Review      → SKIP
Status = Revision Needed       → SKIP
Status = Approved by AVIN      → SKIP
Status = Scheduled             → SKIP
Threads Post ID missing        → SKIP + log
Sync Enabled = false           → SKIP
Blocking Issue exists          → SKIP + log
```

---

## 5. Notion Database Fields

### 必要欄位

| 欄位 | 類型 | 填寫方式 | 說明 |
|------|------|----------|------|
| Title | Title | AVIN 手動 | 貼文標題或內容摘要 |
| Platform | Select | AVIN 手動 | 本階段填 Threads |
| Content Type | Select | AVIN 手動 | Text / Image / Video / Carousel |
| Status | Select | AVIN 手動 → 系統更新 | 見狀態設計 Section 9 |
| Published At | Date | AVIN 手動 | 實際發布時間 |
| Threads URL | URL | AVIN 手動 | Threads 貼文公開連結 |
| Threads Post ID | Text | AVIN 手動（或從 URL 解析） | 用於呼叫 Insights API |
| Sync Enabled | Checkbox | AVIN 手動 | 是否允許自動 insights 同步 |

### 系統自動回寫欄位

| 欄位 | 類型 | 填寫方式 | 說明 |
|------|------|----------|------|
| Sync Status | Select | 系統自動 | Not Started / Pending / Synced / Failed / Skipped / Needs Review |
| Sync Error Note | Text | 系統自動 | 失敗時記錄錯誤原因 |
| Data Last Synced At | Date | 系統自動 | 最後成功同步時間 |
| Views | Number | 系統自動 | 觀看次數（API dependent） |
| Likes | Number | 系統自動 | 按讚數 |
| Replies | Number | 系統自動 | 回覆數 |
| Reposts | Number | 系統自動 | 轉發數 |
| Quotes | Number | 系統自動 | 引用數 |
| Shares | Number | 系統自動 | 分享數（API dependent） |
| Engagement Rate | Formula / Number | 系統計算 | 見 Section 6 |

### 生命週期欄位

| 欄位 | 類型 | 填寫方式 | 說明 |
|------|------|----------|------|
| Lifecycle Status | Select | 系統 + AVIN 確認 | Draft / Published / Completed / Archived |
| GitHub Log Path | Text | 系統自動（若產生 log） | 對應 GitHub performance log 路徑 |
| No Blocking Issue | Checkbox | AVIN 手動 | 確認無阻擋問題 |

---

## 6. Metrics Mapping

### Threads Insights 指標對應

| Notion 欄位 | Threads API 指標 | 狀態 |
|------------|-----------------|------|
| Views | views | optional / API dependent |
| Likes | likes | expected available |
| Replies | replies | expected available |
| Reposts | reposts | expected available |
| Quotes | quotes | optional / API dependent |
| Shares | shares | optional / API dependent |
| Engagement Rate | calculated | 見公式說明 |

> **重要：** 以上指標名稱以 Meta 官方 Threads API 最新文件為準。部分指標可能不開放、名稱不同、或依帳號類型而異。

### Engagement Rate 公式

```
Engagement Rate = (likes + replies + reposts + quotes + shares) / views
```

**特殊處理：**

- 若 `views` 不可用或為 0，Engagement Rate 不計算
- 寫入 Notion 時標記：`Engagement Rate = N/A (views unavailable)`
- 若部分指標為 null（API 未回傳），以 0 代入計算，並在 Sync Error Note 標記哪些指標缺失

---

## 7. Sync Frequency Options

| 選項 | 頻率 | 適用情境 |
|------|------|----------|
| Option A | 每天一次 | 低量發文，降低 API rate limit 風險 |
| Option B | 每天兩次 | 發布後需要較即時的數據 |
| Option C | 發布後 24 / 48 / 72 小時密集 + 之後每日 | 想觀察早期互動曲線 |
| Option D | 手動觸發 | 完全人工控制，不依賴排程 |

### MVP 1 推薦方案

**每天一次 + 手動觸發備用**

原因：

- 降低 API rate limit 風險
- 降低實作複雜度（只需一個 cron job）
- 對初期 performance log 已足夠
- 手動觸發保留彈性，不需等待排程

---

## 8. Error Handling

### 錯誤類型與處理方式

| 錯誤 | 處理方式 |
|------|----------|
| Threads Post ID missing | Skip item，寫入 Sync Error Note，Sync Status = Skipped |
| Token expired | Stop sync，Sync Status = Failed，Error Note 標記 token issue |
| Permission denied | Stop sync，Sync Status = Failed，Error Note 標記 permission issue |
| API rate limit | Pause，Sync Status = Pending，下次排程再試 |
| API response missing expected metric | 以 null 處理，繼續回寫，Error Note 列出缺失欄位 |
| Notion writeback failed | Sync Status = Failed，Error Note 記錄，不改變現有數據 |
| Network error | Retry 最多 N 次，超過後 Sync Status = Failed |
| Invalid Post ID format | Skip，Sync Status = Skipped，Error Note 標記格式問題 |

### 核心安全原則

- **不覆蓋舊數據**：失敗時保留前次成功的 metrics
- **更新 Sync Status = Failed**：讓 AVIN 可以看到同步狀態
- **寫入 Sync Error Note**：記錄錯誤原因，便於排查
- **更新 Last Sync Attempt At**（若此欄位存在）：記錄最後嘗試時間
- **保留可重試狀態**：不要讓 Status 被改為無法重試的值

---

## 9. Sync Status Design

| 狀態 | 使用時機 |
|------|----------|
| `Not Started` | 初始狀態，尚未執行過同步 |
| `Pending` | 同步已觸發，等待 API 回應中 |
| `Synced` | 同步成功，metrics 已回寫 Notion |
| `Failed` | 同步失敗，錯誤已記錄，舊數據保留 |
| `Skipped` | 不符合同步條件（Post ID 缺失、Sync Enabled = false 等） |
| `Needs Review` | 同步完成但有異常需 AVIN 確認（例如數據異常低或 API response 不完整） |

---

## 10. Data Safety Rules

> 以下規則不得以任何理由繞過。

- access token、app secret、client secret、refresh token **不得 commit 到 GitHub**
- **GitHub Actions log 不可印出 token 或 secret**
- Notion database 不存放任何敏感 token 或 secret
- API response 原始資料若含使用者 PII 或敏感欄位，不直接寫入公開 repo
- GitHub performance log 只寫公開內容與聚合數據（metrics 數字、狀態）
- `.env` 不得 commit，必須列在 `.gitignore`
- 使用 GitHub Actions Secrets 或 local secret manager（如 macOS Keychain）管理 token

---

## 11. Suggested Implementation Options

### Option A：Python script + GitHub Actions（推薦長期方向）

**優點：**
- 與 repo 自然整合，操作記錄留在 GitHub
- 容易產生 performance log 並 commit
- Cron 排程由 GitHub Actions 管理，不依賴本機開機
- Secrets 由 GitHub Actions Secrets 管理

**缺點：**
- OAuth / token refresh 機制需要設計
- 初次建置需要測試 Notion API + Threads API 串接
- GitHub Actions log 需注意不印出敏感資訊

---

### Option B：n8n / Make

**優點：**
- 快速串接 Notion
- 視覺化流程，初期測試快
- 不需要寫 code 即可測試 MVP 1 邏輯

**缺點：**
- 文件化與版本控制較弱（無法直接在 GitHub 看到邏輯）
- 長期不如 repo-native 可追蹤
- 與 AVIN Digital Footprint OS 的 GitHub 文件積累方式不一致

---

### Option C：Local script only

**優點：**
- 最安全，token 完全在本機
- 不需要先處理雲端排程
- 最快驗證 API 串接是否可行

**缺點：**
- 無法自動定時，需人工執行
- 長期不可持續

---

### MVP 1 建議方案

**先用 Local script spec 設計，驗證 API 串接後，再評估是否放進 GitHub Actions。**

理由：
- Local script 最快驗證 Threads Insights API 是否可用
- 確認可行後，再遷移到 GitHub Actions 比較安全
- 避免在 API 還沒確認前就設計複雜 CI/CD 流程

---

## 12. Proposed File Structure for Future Implementation

> 本節僅為規格說明，不建立任何程式檔案。

```
scripts/
  threads/
    sync_threads_insights.py    ← MVP 1 insights sync script

.github/
  workflows/
    threads-insights-sync.yml   ← GitHub Actions cron job (MVP 1 後期)

logs/
  social-performance/
    YYYY-MM-DD-[content-slug].md  ← 每篇貼文的 performance log
```

`.env` 範本（不 commit 實際 `.env`）：

```
NOTION_TOKEN=
THREADS_ACCESS_TOKEN=
NOTION_DATABASE_ID=
```

`.gitignore` 需包含：

```
.env
*.env
```

---

## 13. GitHub Performance Log Template

```markdown
# Threads Performance Log｜[Content Title]

## Published Output

Platform：Threads
Threads URL：
Threads Post ID：
Published At：

## Source

Source Signal：
Workflow：
Content Type：

## Metrics Snapshot

Views：
Likes：
Replies：
Reposts：
Quotes：
Shares：
Engagement Rate：

## Sync Info

Data Last Synced At：
Sync Status：
Error Note：

## Lifecycle

Lifecycle Status：
GitHub Log Path：
Next Action：
```

---

## 14. MVP 1 Acceptance Criteria

以下所有條件達成，才視為 MVP 1 完成：

- [ ] Notion 中 Status = Published 的 Threads item 可被系統讀取
- [ ] Threads Post ID 可被驗證（格式正確、不為空）
- [ ] Threads Insights API 可被成功呼叫
- [ ] Metrics 可正確 mapping 到 Notion 欄位
- [ ] Notion 可被成功回寫（metrics + Sync Status + Data Last Synced At）
- [ ] 同步失敗時不覆蓋舊數據，Sync Status = Failed，Error Note 有內容
- [ ] 任何 token 不出現在 GitHub repo 或 Actions log
- [ ] 可產生 performance log 草稿（即使只有部分欄位）
- [ ] API dependent metrics 在文件中有明確標註
- [ ] `.env` 不在 git tracking 中

---

## 15. Pending Decisions

在開始 MVP 1 實作前，AVIN 需要確認：

1. **Threads 帳號連結狀態**：Threads 帳號是否已可連結 Meta Developer App？
2. **Meta Developer App**：是否已申請？目前審核狀態？
3. **實作方式**：先用 local script 驗證，還是直接規劃 GitHub Actions？
4. **Notion database**：是否已存在 Content Queue 資料庫？名稱為何？資料庫 ID 是否已知？
5. **Threads Post ID 來源**：由 AVIN 手動填入，還是由系統從 Threads URL 自動解析？
6. **Insights sync 頻率**：確認採用「每天一次 + 手動觸發備用」？
7. **GitHub performance log**：MVP 1 是否要在每次 sync 成功後產生 log？還是只在 lifecycle completed 時才建立？
8. **Log 公開性**：performance log 是否 commit 到 public repo，還是只保留在本機 / private repo？
9. **同步欄位拆分**：是否需要 `Data Last Synced At` 與 `Last Sync Attempt At` 兩個欄位分開記錄？
10. **初始同步範圍**：第一次執行時，是同步所有歷史 Published 貼文，還是只從指定日期後的新貼文開始？

---

## 16. Next Action

**建議下一步不是直接寫完整腳本，而是按以下順序推進：**

### Step 1：確認 Notion database 欄位

- 建立或更新 Notion Content Queue 資料庫
- 確認 Section 5 所有欄位都已存在
- 手動填入第一筆測試資料（已發布的 Threads 貼文）

### Step 2：確認 Threads API 權限

- 確認 Meta Developer App 狀態
- 確認 Threads Insights API 是否可呼叫
- 確認可取得哪些 metrics 欄位
- 記錄 API dependent metrics 的實際可用性

### Step 3：Manual test checklist

- 用 API testing tool（如 Postman / curl）手動呼叫 Threads Insights API
- 確認 response 格式與欄位名稱
- 確認 metrics mapping 是否與 Section 6 設計一致
- 記錄任何與預期不符的地方

### Step 4：MVP 1 script spec

- 依據 Step 1–3 的實際確認結果
- 撰寫 `sync_threads_insights.py` 的詳細 function spec
- 再進入實作

**不要跳過 Step 1–3，直接進入 script spec 或 GitHub Actions 設計。**
