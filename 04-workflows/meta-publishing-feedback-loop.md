# Meta Publishing & Feedback Loop (Long-term Architecture)

日期：2026-05-12
分類：Workflow / Automation Planning / Publishing
狀態：Long-term Architecture Draft

> **Note:** This is a long-term architecture draft for multi-platform social publishing.
> Phase 1 focuses on Threads-only publishing and feedback loop.
> Instagram will be considered in a later phase.

---

## 1. Purpose

這個模組的目的是把 Instagram 與 Threads（脆）的內容發布流程與成效數據回收接進 AVIN AI Digital Footprint OS。

讓每一篇內容從靈感到結案，都留下可追蹤的紀錄：

- 靈感 → 草稿 → 人工審核 → 發布 → 數據回收 → Notion 回寫 → GitHub lifecycle 文件化

這不是無人看管的自動發文系統。

這是 AVIN 審核後才觸發發布的 **Human-in-the-loop publishing workflow**。

AI / OS 可以協助整理草稿、準備素材、格式檢查、排入佇列、發布後回寫數據。

但 **AVIN 必須明確核准，系統才能執行發布。**

---

## 2. Scope

### 包含

- Instagram publishing（後續階段）
- Instagram Insights sync（後續階段）
- Threads publishing（人工核准後）
- Threads Insights sync（發布後自動）
- Notion writeback（URL、Post ID、Published At、metrics）
- GitHub lifecycle log（lifecycle completed 紀錄）
- Human Review Gate（核心控制層）
- Published URL writeback
- Performance data sync

### 不包含

- 未審核草稿自動發布
- AI 自動產生內容後直接發布（不經 AVIN 確認）
- 未經 AVIN 同意的排程大量發文
- access token、app secret、refresh token 寫入 GitHub
- 任何繞過 Human Review Gate 的快捷路徑

---

## 3. Workflow Overview

```
Signal / Idea
  → Draft
  → AVIN Review
  → Revision Needed (if needed, loop back to Draft)
  → Approved by AVIN       ← 唯一允許發布的節點
  → Scheduled
  → Meta Publisher
  → Instagram / Threads
  → Published URL / Post ID / Published At
  → Notion Writeback
  → Insights Sync           ← 可自動執行
  → Performance Log
  → GitHub Lifecycle Record
  → Lifecycle Completed
```

---

## 4. Human Review Gate

### 核心原則

所有自動發布流程都必須經過 AVIN 人工審核。

系統可以協助：

- 整理內容草稿
- 格式與欄位完整性檢查
- 準備 IG / Threads 發布素材
- 排入待發布佇列
- 發布後回寫 Published URL
- 發布後回寫成效數據

**系統不得在未經 AVIN 明確核准前，自動發布任何內容。**

### 發布前必要條件（All must be true）

| 條件 | 說明 |
|------|------|
| Status = `Approved by AVIN` | 狀態欄必須是此值 |
| Approval Checkbox = `true` | 人工勾選核准 |
| Last Reviewed By = `AVIN` | 確認審核者身份 |
| Platform 已指定 | IG 或 Threads 擇一或兩者 |
| Scheduled At 已填寫 | 排程發布時間不可空白 |
| Final Caption 已填寫 | 最終文案不可空白 |
| Final Visual / Media URL 已存在 | 視覺素材已備妥（IG 輪播或圖片必填） |
| No Blocking Issue = `true` | 無已知阻擋問題 |

任一條件未滿足，系統拒絕發布並寫入 Blocking Reason。

---

## 5. Content Status Design

### 狀態流程

| 狀態 | 說明 | 允許發布 |
|------|------|----------|
| `Idea` | 靈感記錄，尚未成草稿 | ❌ |
| `Draft` | 草稿撰寫中 | ❌ |
| `Ready for Review` | 草稿完成，等待 AVIN 審核 | ❌ |
| `Revision Needed` | AVIN 審核後要求修改 | ❌ |
| `Approved by AVIN` | AVIN 明確核准，可進入排程 | ✅ 唯一允許節點 |
| `Scheduled` | 已排定發布時間，等待執行 | ✅（已核准前提下） |
| `Published` | 已發布，等待數據回寫 | — |
| `Insights Synced` | 成效數據已回寫 | — |
| `Lifecycle Completed` | 全流程結案 | — |
| `Archived` | 封存，不再流通 | ❌ |

### 重要規則標註

> **Only `Approved by AVIN` can trigger publishing.**
>
> **Draft content must never be published automatically.**

---

## 6. MVP Roadmap

### MVP 1：Manual Publish + Auto Insights Sync

**優先做，風險最低。**

流程：

1. AVIN 手動在 IG / Threads 發布內容
2. AVIN 將 Published URL 或 Post ID 填回 Notion
3. 系統定時讀取 Notion 中 `Status = Published` 的內容
4. 系統呼叫 Meta / Threads Insights API 抓取成效數據
5. 系統回寫 metrics（Reach、Views、Likes、Comments 等）
6. 系統更新 `Data Last Synced At`
7. 若失敗，寫入 Sync Error Note，不覆蓋前次數據
8. 若成功，狀態進入 `Insights Synced`
9. 必要時產生 GitHub performance / lifecycle log

**這個階段先建立數據回收能力，不涉及自動發布。**

---

### MVP 2：Threads Auto Publishing After Approval

流程：

1. AVIN 在 Notion 完成內容審核
2. Status 設為 `Approved by AVIN`
3. Scheduled At 填寫完成
4. 系統確認 Human Review Gate 所有條件通過
5. 系統自動發布 Threads text / image / carousel content
6. 發布後回寫：Threads Post ID、Threads URL、Published At
7. 自動進入 Insights Sync 流程

**Threads 先做，因為門檻相對較低，不需要 Facebook Page 連結。**

---

> Instagram auto publishing is out of scope for the current phase. The MVP below is included for long-term architecture reference only.

### MVP 3：Instagram Auto Publishing After Approval

流程：

1. AVIN 在 Notion 完成內容審核
2. Status 設為 `Approved by AVIN`
3. Scheduled At 填寫完成
4. Final Caption 與 Final Visual / Media URL 完整
5. 系統確認 Human Review Gate 所有條件通過
6. 系統自動發布 Instagram image / carousel / reel
7. 發布後回寫：IG Media ID、IG URL、Published At
8. 自動進入 Insights Sync 流程

**IG 需要 Facebook Page 連結與較嚴格的 App Review，放 MVP 3。**

---

## 7. Required Meta APIs

> **重要：API 細節以 Meta 官方文件最新版本為準，以下為研究方向清單，不代表最終實作規格。**

### 需要研究的 API

| API | 用途 |
|-----|------|
| Instagram Content Publishing API | 發布 IG 圖片、輪播、Reels |
| Instagram Graph API — Insights | 取得 IG 貼文成效數據 |
| Threads API（Meta 官方） | 發布 Threads 文字、圖片內容 |
| Threads Insights API | 取得 Threads 貼文成效數據 |
| Meta Graph API | 帳號資料、媒體管理、token 驗證 |

### 需要釐清的細節

- token 類型：short-lived vs long-lived token lifecycle
- 各平台支援的貼文格式（圖片、輪播、Reels、影片限制）
- App Review 必要條件與審核時程
- Instagram Professional Account 類型要求（Creator vs Business）
- Facebook Page 連結要求
- rate limits 與 quota 管理
- Threads API 目前是否已開放第三方發布功能（需確認）

---

## 8. Required Permissions / Tokens

### 帳號與應用程式條件

- Meta Developer App（需申請）
- Instagram Professional Account（Creator 或 Business）
- Facebook Page connection（IG 發布通常需要）
- Threads 帳號連結（需確認是否需要 Meta 帳號綁定）
- Meta App Review（發布到他人帳號或取得 Insights 可能需要）
- Business Verification（部分進階權限可能需要）

### 可能需要的 API 權限（需以官方最新文件確認）

- `instagram_basic`
- `instagram_content_publish`
- `instagram_manage_insights`
- `pages_show_list`
- `pages_read_engagement`
- Threads 相關 permissions（以官方文件為準）

### Token 管理規則

- 任何 access token、app secret、client secret、refresh token **不得 commit 到 GitHub**
- 不得寫入 Notion database 明文欄位
- GitHub Actions log 不可印出 token
- 建議儲存位置：
  - `.env`（本地開發，加入 `.gitignore`）
  - GitHub Actions Secrets（CI/CD 環境）
  - Local secret manager（如 macOS Keychain）
- Token refresh / rotation 策略需要納入設計

---

## 9. Notion Database Fields

### Content Queue / Public Output 資料庫設計

#### 基本資訊

| 欄位 | 類型 | 說明 |
|------|------|------|
| Title | Title | 內容標題 |
| Platform | Select / Multi-select | IG、Threads、LinkedIn 等 |
| Content Type | Select | Carousel、Single Image、Reel、Text Post 等 |
| Status | Select | 見 Section 5 狀態設計 |
| Approval Checkbox | Checkbox | AVIN 人工勾選核准 |
| Last Reviewed By | Text | 審核者名稱（預設 AVIN） |

#### 排程與發布

| 欄位 | 類型 | 說明 |
|------|------|------|
| Scheduled At | Date | 排程發布時間 |
| Published At | Date | 實際發布時間（發布後回寫） |
| Final Caption | Text | 最終發布文案 |
| Final Visual / Media URL | URL | 視覺素材連結（Canva、Figma export、Google Drive 等） |

#### 平台回寫欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| IG URL | URL | Instagram 貼文公開連結 |
| IG Media ID | Text | Instagram Media ID（用於 Insights API） |
| Threads URL | URL | Threads 貼文公開連結 |
| Threads Post ID | Text | Threads Post ID（用於 Insights API） |

#### 內容來源

| 欄位 | 類型 | 說明 |
|------|------|------|
| Source Signal | Text / Relation | 對應的 AI 信號或學習來源 |
| Workflow Stage | Select | 對應 AVIN OS 的哪個工作流環節 |

#### 成效數據

| 欄位 | 類型 | 說明 |
|------|------|------|
| Reach | Number | 觸及人數 |
| Views | Number | 觀看次數（Reels / 影片） |
| Likes | Number | 按讚數 |
| Comments | Number | 留言數 |
| Shares | Number | 分享數 |
| Saves | Number | 收藏數 |
| Replies | Number | 回覆數（Threads） |
| Engagement Rate | Formula / Number | 互動率 |
| Data Last Synced At | Date | 最後一次數據同步時間 |

#### 生命週期

| 欄位 | 類型 | 說明 |
|------|------|------|
| Lifecycle Status | Select | Draft / Published / Completed / Archived |
| GitHub Log Path | Text | 對應 GitHub lifecycle log 檔案路徑 |
| No Blocking Issue | Checkbox | 確認無阻擋問題，發布前必填 |

---

## 10. Data Flow

```
Notion Content Queue
  → Human Review Gate
    → [Check: Status = Approved by AVIN?]
    → [Check: Approval Checkbox = true?]
    → [Check: Scheduled At, Caption, Media all present?]
    → [If any check fails → Block + log reason]
  → Meta Publisher
  → Instagram / Threads API
  → Published URL / Post ID / Published At
  → Notion Writeback（URL 回寫）
  → Insights Sync（可自動執行，定時 or webhook）
    → Meta Insights API
    → Performance Metrics
    → Notion Metrics Writeback
    → Data Last Synced At 更新
  → GitHub Performance Log（選擇性，有必要時才建立）
  → Lifecycle Completed Record
```

---

## 11. Automation Rules

### 允許發布的條件（All must pass）

```
Status = Approved by AVIN
AND Approval Checkbox = true
AND Last Reviewed By = AVIN
AND Scheduled At is not empty
AND Final Caption is not empty
AND Final Visual / Media URL is not empty (for IG)
AND Platform is selected
AND No Blocking Issue = true
```

### 禁止發布的情況（Any one = Block）

```
Status = Idea                → BLOCKED
Status = Draft               → BLOCKED
Status = Ready for Review    → BLOCKED
Status = Revision Needed     → BLOCKED
Approval Checkbox = false    → BLOCKED
Final Caption is empty       → BLOCKED
Media asset missing          → BLOCKED (IG required)
Platform not selected        → BLOCKED
Scheduled At is empty        → BLOCKED
Blocking Issue exists        → BLOCKED
```

### 數據同步規則

```
- Status = Published → 可進入 Insights Sync
- Insights Sync 可自動定時執行（不需每次人工確認）
- 每次同步後更新 Data Last Synced At
- 同步失敗 → 寫入 Sync Error Note，不覆蓋前次 metrics
- 同步成功 → 更新所有 metrics 欄位 → 進入 Insights Synced
```

---

## 12. Risk Notes

| 風險 | 說明 |
|------|------|
| Meta App Review 不確定性 | 部分發布與 Insights 權限需要通過 Meta App Review，時程不定 |
| Token 過期管理 | Short-lived token 需定期換成 Long-lived token，需設計 rotation 機制 |
| IG vs Threads API 差異 | 兩個平台支援格式不同，Threads API 開放程度需再確認 |
| Rate Limits | Meta API 有每日與每小時限制，大量操作需注意 quota |
| 輪播 / Reels 格式限制 | IG Carousel、Reels 有額外 media container 建立步驟 |
| 自動發布風險 | 任何自動發布前必須確認 Human Review Gate 全過 |
| Token 安全 | 絕對不能 commit token 到 GitHub，不能寫進 Notion 明文欄位 |
| GitHub Actions log | 執行 log 不可印出 token 或 secret |
| Notion 欄位狀態錯誤 | 欄位填錯可能觸發錯誤發布，UI 設計需避免誤操作 |
| 先數據回寫、再自動發文 | MVP 1 先建立數據回收能力，比直接做自動發布安全 |

---

## 13. Suggested Implementation Stack

### 方案比較

| 方案 | 優點 | 缺點 |
|------|------|------|
| Python script | 彈性高、Meta SDK 支援好 | 需要自行管理 server / scheduler |
| Node.js script | npm 生態豐富 | 同上 |
| GitHub Actions（scheduled） | 零 server、直接用 repo | 不適合即時觸發、log 需注意安全 |
| n8n | 可視化 workflow、Notion + Meta 有 node | 需要自己 host 或付費雲端版 |
| Make（Integromat） | 設定快、Notion / Meta 整合成熟 | 付費、流程彈性較低 |

### 各階段建議

| 階段 | 建議方案 | 理由 |
|------|----------|------|
| MVP 1（Insights Sync） | GitHub Actions + Python | 定時抓數據、不需 server、符合 AVIN 目前 repo 累積方式 |
| MVP 2（Threads Auto Publish） | Python script + GitHub Actions | Threads API 門檻較低，可先用 script 測試 |
| MVP 3（IG Auto Publish） | Python script + GitHub Actions | IG 有更多格式要求，獨立 script 比較好 debug |

### 與 AVIN AI Digital Footprint OS 的符合度

- GitHub Actions 最符合「每個操作都留有文件紀錄」的 OS 精神
- Python script 可以直接在 repo 中維護，並搭配 secrets 管理
- n8n / Make 適合日後擴展，但目前 MVP 1 不需要這個複雜度

---

## 14. Suggested MVP 1 Spec

### Manual Publish + Auto Insights Sync

**目標：先建立數據回收能力，不做自動發布。**

完整流程：

1. AVIN 手動在 IG / Threads 發布內容
2. AVIN 將 Published URL 或 Post ID 填入 Notion 對應欄位
3. AVIN 將 Notion 中該內容 Status 改為 `Published`
4. GitHub Actions 定時（例如每日一次）讀取 Notion 中 `Status = Published` 的所有內容
5. 系統檢查是否有 IG Media ID 或 Threads Post ID
6. 若有 → 呼叫 Meta / Threads Insights API，取得 metrics
7. 系統將 metrics 回寫 Notion：Reach、Views、Likes、Comments、Shares、Saves、Replies、Engagement Rate
8. 系統更新 `Data Last Synced At`
9. 若數據抓取失敗 → 寫入 Sync Error Note，不覆蓋前次數據，不改變 Status
10. 若數據成功回寫 → Status 進入 `Insights Synced`
11. 若 lifecycle 條件滿足（已有 URL + 已有核心 metrics）→ 可建立 GitHub lifecycle / performance log

### MVP 1 所需條件

- Notion API access（integration token）
- Meta Graph API access（至少 Insights 讀取權限）
- GitHub Actions Secret：`NOTION_TOKEN`、`META_ACCESS_TOKEN`（不 commit、不 print）
- `.env` 用於本地測試
- Python 或 Node.js 腳本

---

## 15. Suggested GitHub Log Format

```markdown
# Social Performance Log｜[Content Title]

## Published Output

Platform：
URL：
Published At：

## Source

Source Signal：
Workflow：
Content Type：

## Metrics Snapshot

Reach：
Views：
Likes：
Comments：
Shares：
Saves：
Replies：
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

## 16. Files to Create or Update

### 本次已新增

| 檔案 | 動作 |
|------|------|
| `04-workflows/meta-publishing-feedback-loop.md` | 新增（本文件） |
| `docs-index.md` | 新增索引條目 |

### 未來可能新增（實作時）

| 檔案 | 時機 |
|------|------|
| `scripts/insights-sync.py` | MVP 1 實作時 |
| `scripts/meta-publisher.py` | MVP 2 / MVP 3 實作時 |
| `.github/workflows/insights-sync.yml` | GitHub Actions 啟用時 |
| `06-platform-outputs/performance-logs/` | 第一篇有數據時 |
| `.env.example` | 腳本建立時（實際 `.env` 不 commit） |
| `.gitignore` 更新 | 確保 `.env` 不被 commit |

---

## 17. Pending Decisions

在開始實作前，AVIN 需要確認：

1. Meta Developer App 是否已申請？
2. IG 帳號類型是否為 Professional（Creator / Business）？
3. Facebook Page 是否已連結 IG 帳號？
4. Threads API 是否已確認支援第三方發布（需查官方最新文件）？
5. MVP 1 的 Insights Sync 頻率：每日一次 / 每 6 小時 / webhook？
6. 是否要接進 Notion 現有的 Content Queue 資料庫，還是新建專用資料庫？
7. GitHub Actions 或本地 cron，哪個符合目前 workflow？
8. 數據 log 是否每篇內容都建立 GitHub 文件，還是只在 lifecycle completed 時？
