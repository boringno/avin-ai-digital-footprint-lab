# Threads Publishing & Feedback Loop (Phase 1 Threads-only)

日期：2026-05-12
分類：Workflow / Automation Planning / Threads Publishing
狀態：Planning

---

## 1. Purpose

這個模組的目的是把 Threads / 脆 的內容發布流程與成效數據回收接進 AVIN AI Digital Footprint OS。

讓每一篇 Threads 內容從靈感到結案，都留下可追蹤的紀錄：

靈感 → 草稿 → 人工審核 → 發布 → 數據回收 → Notion 回寫 → GitHub lifecycle 文件化

這不是無人看管的自動發文系統。

這是 **AVIN 審核後才觸發發布的 Human-in-the-loop publishing workflow**。

AI / OS 可以協助整理草稿、準備發布素材、格式檢查、排入佇列、發布後回寫數據。

**但 AVIN 必須明確核准，系統才能執行 Threads 發布。**

---

## 2. Scope

### 本階段包含

- Threads publishing（人工核准後）
- Threads Insights sync（發布後自動）
- Notion writeback（URL、Post ID、Published At、metrics）
- GitHub lifecycle log（lifecycle completed 紀錄）
- Human Review Gate（核心控制層）
- Published URL writeback
- Performance data sync

### 本階段不包含

- Instagram auto publishing（本階段不做）
- Instagram insights sync（本階段不做）
- 未審核草稿自動發布
- AI 自動產生內容後直接發布（不經 AVIN 確認）
- 未經 AVIN 同意的排程大量發文
- access token、app secret、refresh token 寫入 GitHub

### Future Scope

Instagram publishing and insights sync will be considered in a later phase.

---

## 3. Workflow Overview

```
Signal / Idea
  → Draft
  → AVIN Review
  → Revision Needed (if needed, loop back to Draft)
  → Approved by AVIN       ← 唯一允許發布的節點
  → Scheduled
  → Threads Publisher
  → Threads
  → Threads URL / Threads Post ID / Published At
  → Notion Writeback
  → Threads Insights Sync   ← 可自動執行
  → Performance Log
  → GitHub Lifecycle Record
  → Lifecycle Completed
```

---

## 4. Human Review Gate

### 核心原則

所有 Threads 自動發布流程都必須經過 AVIN 人工審核。

系統可以協助：

- 整理內容草稿
- 格式與欄位完整性檢查
- 準備 Threads 發布素材
- 排入待發布佇列
- 發布後回寫 Threads URL
- 發布後回寫成效數據

**系統不得在未經 AVIN 明確核准前，自動發布任何 Threads 內容。**

### 發布前必要條件（All must be true）

| 條件 | 說明 |
|------|------|
| Status = `Approved by AVIN` | 狀態欄必須是此值 |
| Approval Checkbox = `true` | 人工勾選核准 |
| Last Reviewed By = `AVIN` | 確認審核者身份 |
| Platform = `Threads` | 確認目標平台 |
| Scheduled At 已填寫 | 排程發布時間不可空白 |
| Final Threads Text 已填寫 | 最終文字內容不可空白 |
| Content Type 已指定 | 確認貼文格式 |
| No Blocking Issue = `true` | 無已知阻擋問題 |

若為 media post，額外需要：

| 條件 | 說明 |
|------|------|
| Final Media URL 已存在 | 媒體素材連結不可空白 |
| Media Type 已指定 | 圖片 / 影片 / 輪播需明確指定 |
| Media URL 可被 Threads API 讀取 | 確認素材可存取性 |

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

> **Only `Approved by AVIN` can trigger Threads publishing.**
>
> **Draft content must never be published automatically.**

---

## 6. Threads Content Types

### 本階段規劃支援的格式

| 格式 | 說明 |
|------|------|
| Text post | 純文字貼文 |
| Image post | 單張圖片 + 文字 |
| Video post | 影片 + 文字 |
| Carousel post | 多張圖片輪播 |

### MVP 優先順序

| 階段 | 格式 | 理由 |
|------|------|------|
| MVP 1 | Text post only | 風險最低，先讓迴路跑通 |
| MVP 2 | Text + Image post | 加入媒體處理，但格式單純 |
| MVP 3 | Carousel post | 多媒體組合，需要更多 API 步驟 |
| MVP 4 | Video post | 格式最複雜，放最後 |

**先降低格式與媒體處理風險，讓發布與回寫迴路先跑通再擴展。**

---

## 7. MVP Roadmap

### MVP 1：Manual Publish + Auto Threads Insights Sync

**優先做，風險最低。**

流程：

1. AVIN 手動在 Threads 發布內容
2. AVIN 將 Threads URL 或 Threads Post ID 填回 Notion
3. 系統定時讀取 Notion 中 Platform = Threads 且 Status = Published 的內容
4. 系統呼叫 Threads Insights API 抓取成效數據
5. 系統回寫 metrics（Views、Likes、Replies、Reposts 等）
6. 系統更新 `Data Last Synced At`
7. 若失敗，寫入 Sync Error Note，不覆蓋前次數據
8. 若成功，狀態進入 `Insights Synced`
9. 必要時產生 GitHub performance / lifecycle log

**這個階段先建立數據回收能力，不涉及自動發布。**

---

### MVP 2：Threads Text Auto Publishing After Approval

流程：

1. AVIN 在 Notion 完成內容審核
2. Status 設為 `Approved by AVIN`
3. Approval Checkbox = `true`
4. Scheduled At 填寫完成
5. Final Threads Text 填寫完成
6. 系統確認 Human Review Gate 所有條件通過
7. 系統自動發布 Threads text post
8. 發布後回寫：Threads Post ID、Threads URL、Published At
9. Status 更新為 `Published`
10. 自動進入 Threads Insights Sync 流程

---

### MVP 3：Threads Media Auto Publishing After Approval

流程：

1. AVIN 在 Notion 完成內容審核
2. Status 設為 `Approved by AVIN`
3. Scheduled At 填寫完成
4. Final Threads Text 與 Final Media URL 完整
5. Media Type 已指定，Media URL 可存取
6. 系統確認 Human Review Gate 所有條件通過（含 media 條件）
7. 系統自動發布 Threads image / carousel / video content
8. 發布後回寫：Threads Post ID、Threads URL、Published At
9. Status 更新為 `Published`
10. 自動進入 Threads Insights Sync 流程

---

## 8. Required Meta / Threads APIs

> **重要：API 細節以 Meta 官方文件最新版本為準，以下為研究方向清單，不代表最終實作規格。**

### 需要研究的 API

| API | 用途 |
|-----|------|
| Threads API | 管理 Threads presence、發布、讀取貼文 |
| Threads Publishing API | 發布 text、image、video、carousel posts |
| Threads Insights API | 讀取自己 Threads 貼文的成效數據 |
| Meta Graph API | token 驗證、帳號資料、媒體管理 |

### 目前已知方向

- Threads API 可用於管理 Threads presence
- Threads API 支援發布 text、image、video、carousel posts
- Threads Insights API 可讀取自己 Threads 內容的 insights

**但細節、權限、限制、endpoint 都必須以 Meta 官方文件為準。**

### 需要釐清的細節

- token 類型：short-lived vs long-lived token lifecycle
- Threads API 目前開放的發布格式與限制
- App Review 必要條件與審核時程
- Threads 帳號類型要求（是否需要連結 Meta 帳號）
- publish rate limits 與 quota 管理
- Threads Insights 可讀取的 metrics 欄位清單
- media 格式規格（圖片尺寸、影片長度、檔案大小限制）

---

## 9. Required Permissions / Tokens

### 帳號與應用程式條件

- Meta Developer App（需申請）
- Threads 帳號連結（需確認是否需要 Meta 帳號綁定）
- Meta App Review（發布與 Insights 讀取可能需要審核通過）
- 可能的 Business Verification（部分進階權限）

### 可能需要的 API 權限（需以官方最新文件確認）

- Threads 發布相關 permissions
- Threads Insights 讀取相關 permissions
- 具體 scope 名稱以 Meta 官方文件為準

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

## 10. Notion Database Fields

### Content Queue / Threads Output 資料庫設計

#### 基本資訊

| 欄位 | 類型 | 說明 |
|------|------|------|
| Title | Title | 內容標題 |
| Platform | Select | Threads（本階段限定） |
| Content Type | Select | Text、Image、Video、Carousel |
| Status | Select | 見 Section 5 狀態設計 |
| Approval Checkbox | Checkbox | AVIN 人工勾選核准 |
| Last Reviewed By | Text | 審核者名稱（預設 AVIN） |

#### 排程與發布

| 欄位 | 類型 | 說明 |
|------|------|------|
| Scheduled At | Date | 排程發布時間 |
| Published At | Date | 實際發布時間（發布後回寫） |
| Final Threads Text | Text | 最終發布文字內容 |
| Final Media URL | URL | 媒體素材連結（image / video / carousel 時填寫） |
| Media Type | Select | Image / Video / Carousel（text post 可留空） |

#### 平台回寫欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| Threads URL | URL | Threads 貼文公開連結（發布後回寫） |
| Threads Post ID | Text | Threads Post ID（用於 Insights API） |

#### 內容來源

| 欄位 | 類型 | 說明 |
|------|------|------|
| Source Signal | Text / Relation | 對應的 AI 信號或學習來源 |
| Workflow Stage | Select | 對應 AVIN OS 的哪個工作流環節 |

#### 成效數據

| 欄位 | 類型 | 說明 |
|------|------|------|
| Views | Number | 觀看次數 |
| Likes | Number | 按讚數 |
| Replies | Number | 回覆數 |
| Reposts | Number | 轉發數 |
| Quotes | Number | 引用數 |
| Shares | Number | 分享數 |
| Engagement Rate | Formula / Number | 互動率 |
| Data Last Synced At | Date | 最後一次數據同步時間 |
| Sync Status | Select | Success / Failed / Pending |
| Sync Error Note | Text | 若同步失敗，記錄錯誤原因 |

#### 生命週期

| 欄位 | 類型 | 說明 |
|------|------|------|
| Lifecycle Status | Select | Draft / Published / Completed / Archived |
| GitHub Log Path | Text | 對應 GitHub lifecycle log 檔案路徑 |
| No Blocking Issue | Checkbox | 確認無阻擋問題，發布前必填 |

---

## 11. Data Flow

```
Notion Content Queue
  → Human Review Gate
    → [Check: Platform = Threads?]
    → [Check: Status = Approved by AVIN?]
    → [Check: Approval Checkbox = true?]
    → [Check: Scheduled At, Final Threads Text present?]
    → [Check: Media conditions (if media post)?]
    → [If any check fails → Block + log Blocking Reason]
  → Threads Publisher
  → Threads API
  → Threads URL / Threads Post ID / Published At
  → Notion Writeback（URL、Post ID 回寫）
  → Threads Insights Sync（可自動執行，定時）
    → Threads Insights API
    → Performance Metrics
    → Notion Metrics Writeback
    → Data Last Synced At 更新
    → Sync Status 更新
  → GitHub Performance Log（選擇性，有必要時才建立）
  → Lifecycle Completed Record
```

---

## 12. Automation Rules

### 允許發布的條件（All must pass）

```
Platform = Threads
AND Status = Approved by AVIN
AND Approval Checkbox = true
AND Last Reviewed By = AVIN
AND Scheduled At is not empty
AND Final Threads Text is not empty
AND Content Type is selected
AND No Blocking Issue = true
```

若為 media post，額外需要：

```
AND Final Media URL is not empty
AND Media Type is selected
AND Media URL is accessible to the publishing workflow
```

### 禁止發布的情況（Any one = Block）

```
Status = Idea                     → BLOCKED
Status = Draft                    → BLOCKED
Status = Ready for Review         → BLOCKED
Status = Revision Needed          → BLOCKED
Approval Checkbox = false         → BLOCKED
Final Threads Text is empty       → BLOCKED
Platform is not Threads           → BLOCKED
Scheduled At is empty             → BLOCKED
Blocking Issue exists             → BLOCKED
Media asset missing (media post)  → BLOCKED
```

### 數據同步規則

```
- Platform = Threads AND Status = Published → 可進入 Threads Insights Sync
- Threads Insights Sync 可自動定時執行（不需每次人工確認）
- 每次同步後更新 Data Last Synced At 與 Sync Status
- 同步失敗 → 寫入 Sync Error Note，不覆蓋前次 metrics
- 同步成功 → 更新所有 metrics 欄位 → 進入 Insights Synced
```

---

## 13. Risk Notes

| 風險 | 說明 |
|------|------|
| Threads API App Review | 發布與 Insights 權限可能需要通過 Meta App Review，時程不定 |
| Token 過期管理 | Short-lived token 需定期換成 Long-lived token，需設計 rotation 機制 |
| Threads API 格式限制 | text、image、video、carousel 支援細節可能隨官方更新變動 |
| Publish Rate Limits | Threads API 有發布頻率限制，需確認 quota |
| Media 格式規格 | 圖片尺寸、影片長度、檔案大小有限制，發布前需驗證 |
| Media URL 可存取性 | Final Media URL 必須是 Threads API 可讀取的公開 URL |
| 自動發布前人工確認 | Human Review Gate 任一條件未過即阻擋，不得例外繞過 |
| Token 安全 | 絕對不能 commit token 到 GitHub，不能寫進 Notion 明文欄位 |
| GitHub Actions log | 執行 log 不可印出 token 或 secret |
| Notion 欄位狀態錯誤 | 欄位填錯可能觸發錯誤發布，UI 設計需避免誤操作 |
| 先數據回寫、再自動發文 | MVP 1 先建立數據回收能力，比直接做自動發布安全 |

---

## 14. Suggested Implementation Stack

### 方案比較

| 方案 | 優點 | 缺點 |
|------|------|------|
| Python script | 彈性高、Meta SDK 支援好 | 需要自行管理 server / scheduler |
| Node.js script | npm 生態豐富 | 同上 |
| GitHub Actions（scheduled） | 零 server、直接用 repo、log 留在 GitHub | 不適合即時觸發、log 需注意安全 |
| n8n | 可視化 workflow、有 Notion + Threads node | 需要自己 host 或付費雲端版 |
| Make（Integromat） | 設定快、Notion 整合成熟 | 付費、流程彈性較低 |

### 各階段建議

| 階段 | 建議方案 | 理由 |
|------|----------|------|
| MVP 1（Insights Sync） | GitHub Actions + Python | 定時抓數據、不需 server、與 AVIN repo 高度整合 |
| MVP 2（Text Auto Publish） | Python script + GitHub Actions | Threads text publish 相對單純，script 易 debug |
| MVP 3（Media Auto Publish） | Python script + GitHub Actions | 在 MVP 2 基礎上擴展 media 處理邏輯 |

### 與 AVIN AI Digital Footprint OS 的符合度

- GitHub Actions 最符合「每個操作都留有文件紀錄」的 OS 精神
- Python script 可以直接在 repo 中維護，搭配 GitHub Secrets 管理 token
- n8n / Make 適合日後擴展，MVP 1 不需要這個複雜度

---

## 15. Suggested MVP 1 Spec

### Manual Publish + Auto Threads Insights Sync

**目標：先建立數據回收能力，不做自動發布。**

完整流程：

1. AVIN 手動在 Threads 發布內容
2. AVIN 將 Threads URL 或 Threads Post ID 填入 Notion 對應欄位
3. AVIN 將 Notion 中該內容 Platform 設為 `Threads`，Status 改為 `Published`
4. GitHub Actions 定時（例如每日一次）讀取 Notion 中 Platform = Threads 且 Status = Published 的所有內容
5. 系統檢查是否有 Threads Post ID
6. 若有 → 呼叫 Threads Insights API，取得 metrics
7. 系統將 metrics 回寫 Notion：Views、Likes、Replies、Reposts、Quotes、Shares、Engagement Rate
8. 系統更新 `Data Last Synced At` 與 `Sync Status = Success`
9. 若數據抓取失敗 → 寫入 Sync Error Note，Sync Status = Failed，不覆蓋前次數據，不改變 Status
10. 若數據成功回寫 → Status 進入 `Insights Synced`
11. 若 lifecycle 條件滿足（已有 Threads URL + 已有核心 metrics）→ 可建立 GitHub lifecycle / performance log

### MVP 1 所需條件

- Notion API access（integration token）
- Threads Insights API access（至少 Insights 讀取權限）
- GitHub Actions Secret：`NOTION_TOKEN`、`THREADS_ACCESS_TOKEN`（不 commit、不 print）
- `.env` 用於本地測試（加入 `.gitignore`）
- Python 腳本（邏輯見上述流程）

---

## 16. Suggested MVP 2 Spec

### Threads Text Auto Publishing After Approval

**目標：AVIN 審核後，系統自動發布 Threads text post。**

完整流程：

1. 系統定時讀取 Notion Content Queue（例如每 15 分鐘或每小時一次）
2. 篩選 Platform = `Threads`
3. 篩選 Status = `Approved by AVIN`
4. 確認 Approval Checkbox = `true`
5. 確認 Scheduled At 已到或已過
6. 確認 Last Reviewed By = `AVIN`
7. 確認 Final Threads Text 已填寫（不可空白）
8. 確認 Content Type = `Text`
9. 確認 No Blocking Issue = `true`
10. 所有條件通過 → 呼叫 Threads Publishing API 發布 text post
11. 發布成功後回寫：Threads Post ID、Threads URL、Published At
12. 將 Status 更新為 `Published`
13. 後續由 Threads Insights Sync 流程（MVP 1）接手

### MVP 2 額外所需條件

- Threads Publishing API access（發布權限，可能需要 App Review）
- GitHub Actions Secret：`THREADS_ACCESS_TOKEN`（不 commit、不 print）
- 發布頻率需符合 Threads API rate limits

---

## 17. Suggested GitHub Log Format

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

## 18. Future Scope

以下項目屬於後續階段，本文件不展開規劃：

- Instagram publishing（待 Meta App Review 評估後獨立規劃）
- Instagram insights sync
- Cross-posting strategy（Threads + IG 同步發布）
- Multi-platform content comparison（跨平台成效比較）
- Unified social performance dashboard

---

## 19. Files to Create or Update

### 本次已新增

| 檔案 | 動作 |
|------|------|
| `04-workflows/threads-publishing-feedback-loop.md` | 新增（本文件） |
| `docs-index.md` | 新增索引條目 |

### 未來可能新增（實作時）

| 檔案 | 時機 |
|------|------|
| `scripts/threads-insights-sync.py` | MVP 1 實作時 |
| `scripts/threads-publisher.py` | MVP 2 / MVP 3 實作時 |
| `.github/workflows/threads-insights-sync.yml` | GitHub Actions 啟用時 |
| `06-platform-outputs/threads-performance-logs/` | 第一篇有數據時 |
| `.env.example` | 腳本建立時（實際 `.env` 不 commit） |
| `.gitignore` 更新 | 確保 `.env` 不被 commit |

---

## 20. Pending Decisions

在開始實作前，AVIN 需要確認：

1. Threads 帳號是否已連結 Meta 帳號？是否可進行 API 操作？
2. Meta Developer App 是否已申請？
3. Threads API 的 App Review 狀態是否已確認（需查 Meta 最新官方文件）？
4. MVP 1 的 Insights Sync 頻率：每日一次 / 每 6 小時 / webhook？
5. 是否要接進 Notion 現有的 Content Queue 資料庫，還是新建 Threads 專用資料庫？
6. GitHub Actions 或本地 cron，哪個符合目前 workflow？
7. 數據 log 是否每篇內容都建立 GitHub 文件，還是只在 lifecycle completed 時？
8. Token 的管理方式：本地 `.env` + GitHub Secrets，還是其他方案？
