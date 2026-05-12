# Threads MVP 1｜Manual Test Checklist

日期：2026-05-12
分類：Workflow / MVP Spec / Test Checklist
狀態：Checklist Draft

Parent docs：
- `04-workflows/threads-mvp-1-manual-publish-auto-insights-sync.md`
- `04-workflows/threads-mvp-1-notion-fields-spec.md`
- `04-workflows/threads-mvp-1-no-n8n-local-script-spec.md`

---

## 1. Purpose

這份 checklist 用來驗證 Threads MVP 1 的最小可行流程，在撰寫完整腳本前確認每個環節皆可正常運作：

```
手動發布 Threads
  → 填 Threads URL / Post ID 到 Notion
  → 本機手動執行 sync script
  → 呼叫 Threads Insights API 抓取數據
  → 將 metrics 回寫 Notion
  → 確認沒有 secrets 外洩
```

通過此 checklist 代表 MVP 1 的前置條件已完備，可進入 local script skeleton 撰寫。

---

## 2. Pre-test Requirements

執行任何測試前，確認以下準備條件均已滿足：

- [ ] Meta Developer App 已建立並啟用
- [ ] Threads Access Token 已取得（短期或長期皆可）
- [ ] Meta App Secret 已取得
- [ ] Notion API Key 已建立（Integration token）
- [ ] Notion Database ID 已確認
- [ ] 本機 `.env` 已建立（key names + 真實值，不 commit）
- [ ] `.env` 已被 `.gitignore` 排除（見 Section 3）
- [ ] Notion Content Queue 資料庫欄位已建立（見 Section 4）
- [ ] 至少一篇 Threads 貼文已發布
- [ ] 該貼文的 Threads Post ID 已取得
- [ ] 沒有任何 token / secret 被貼入 GitHub、Notion 或 chat

> **重要：** 以上任何一項未完成，請先完成後再進行下方測試。

---

## 3. Local Secret Check

確認 secrets 不會意外進入 git tracking：

- [ ] `.gitignore` 存在於 repo 根目錄
- [ ] `.gitignore` 包含 `.env`
- [ ] `.gitignore` 包含 `*.env`
- [ ] 執行 `git check-ignore .env`，回傳 `.env`（確認 gitignore 生效）
- [ ] 執行 `git status`，確認 `.env` 不在 tracked / untracked 清單中
- [ ] 執行 `git log --all --full-history -- .env`，確認 `.env` 從未被 commit
- [ ] 掃描近期 commits，確認任何 `.md` 或 `.py` 檔案中沒有出現 token 字串

---

## 4. Notion Field Check

確認 Notion Content Queue 資料庫中，以下欄位均已建立並設定正確 Notion type：

| Field Name | Notion Type | 確認 |
|------------|-------------|------|
| Title | Title | [ ] |
| Platform | Select | [ ] |
| Content Type | Select | [ ] |
| Status | Select | [ ] |
| Published At | Date | [ ] |
| Threads URL | URL | [ ] |
| Threads Post ID | Text | [ ] |
| Sync Enabled | Checkbox | [ ] |
| Sync Status | Select | [ ] |
| Sync Error Note | Text | [ ] |
| Data Last Synced At | Date | [ ] |
| Last Sync Attempt At | Date | [ ] |
| Views | Number | [ ] |
| Likes | Number | [ ] |
| Replies | Number | [ ] |
| Reposts | Number | [ ] |
| Quotes | Number | [ ] |
| Shares | Number | [ ] |
| Engagement Rate | Number | [ ] |
| Lifecycle Status | Select | [ ] |
| GitHub Log Path | Text | [ ] |
| No Blocking Issue | Checkbox | [ ] |

> Status 欄位需包含以下選項：Idea / Draft / Ready for Review / Revision Needed / Approved by AVIN / Scheduled / Published / Insights Synced / Lifecycle Completed / Archived
>
> Sync Status 欄位需包含：Not Started / Pending / Synced / Failed / Skipped / Needs Review

---

## 5. Test Item Setup

在 Notion Content Queue 建立一筆測試資料，確認以下欄位均已填寫：

- [ ] Title：填入測試貼文名稱（例如：`[TEST] MVP1 Sync Test Post`）
- [ ] Platform：選擇 `Threads`
- [ ] Content Type：選擇對應格式（Text / Image / Video / Carousel）
- [ ] Status：設為 `Published`
- [ ] Published At：填入發布時間
- [ ] Threads URL：填入實際 Threads 貼文連結
- [ ] Threads Post ID：填入有效的 Threads Post ID
- [ ] Sync Enabled：勾選 `true`
- [ ] No Blocking Issue：勾選 `true`
- [ ] Sync Status：設為 `Not Started`
- [ ] 其他 metrics 欄位：保持空白（等系統回寫）

---

## 6. API Smoke Test

使用 Postman、curl 或 API testing tool，手動驗證 Threads Insights API 可正常呼叫。

> **注意：** 本節不記錄任何真實 endpoint URL 或 token 值。只記錄測試目標與預期結果。

測試目標：

- [ ] Token 可成功呼叫 Threads API（回傳 2xx，非 401 / 403）
- [ ] Token 具有存取目標 Threads media 的權限
- [ ] Threads Post ID 格式有效（API 不回傳 invalid media 錯誤）
- [ ] Insights response 至少包含一項可用 metric（Likes / Replies / Reposts 等）
- [ ] 缺失的 optional metrics（Views、Quotes、Shares）以 API dependent 方式記錄，不觸發錯誤
- [ ] 記錄實際 API response 結構，與 `threads-mvp-1-no-n8n-local-script-spec.md` Section 6 的欄位對應一致

**記錄區（手動填寫）：**

```
測試時間：
Threads Post ID（測試用）：
API 回傳的 metrics 欄位：
  - Views：available / not available
  - Likes：available / not available
  - Replies：available / not available
  - Reposts：available / not available
  - Quotes：available / not available
  - Shares：available / not available
Engagement Rate 可計算：yes / no（原因：）
異常或與預期不符的地方：
```

---

## 7. Notion Read Test

手動或以腳本片段驗證 Notion API 讀取流程：

- [ ] Script 可使用 `NOTION_API_KEY` 連線 Notion API
- [ ] Script 可使用 `NOTION_DATABASE_ID` 讀取指定資料庫
- [ ] Script 可篩選 `Platform = Threads` 的 items
- [ ] Script 可篩選 `Status = Published` 或 `Status = Insights Synced` 的 items
- [ ] Script 可讀取 `Threads Post ID` 欄位值
- [ ] Script 對 `Threads Post ID` 為空的 row，標記為 Skipped 並記錄原因
- [ ] Script 對 `Sync Enabled = false` 的 row，標記為 Skipped
- [ ] Script 對 `No Blocking Issue = false` 的 row，標記為 Skipped
- [ ] Script 不讀取其他平台（`Platform ≠ Threads`）的 items

---

## 8. Insights Sync Test

驗證 Insights 抓取與正規化邏輯：

- [ ] 對一筆有效 Threads Post ID 成功抓取 Insights
- [ ] 可用 metrics 正確對應到 Notion 欄位名稱
- [ ] `Views > 0` 時，Engagement Rate 正確計算
- [ ] `Views = 0` 或 Views 不可用時，Engagement Rate 留空，不計算
- [ ] Optional metrics 為 null 時，以 null 處理（不代入 0，不觸發錯誤）
- [ ] Engagement Rate 計算中使用 null 的 optional metrics 時，以 0 代入，並在 Sync Error Note 列出缺失欄位名稱
- [ ] 同步失敗時，不覆蓋前次成功的 metrics 數值
- [ ] 回傳 metrics 的完整記錄（API response 不 commit 到 repo）

---

## 9. Notion Writeback Test

驗證 metrics 回寫 Notion 的每個欄位：

- [ ] Views 寫回正確（或保持空白，若 API 不支援）
- [ ] Likes 寫回正確
- [ ] Replies 寫回正確
- [ ] Reposts 寫回正確
- [ ] Quotes 寫回正確（或保持空白，若 API 不支援）
- [ ] Shares 寫回正確（或保持空白，若 API 不支援）
- [ ] Engagement Rate 寫回正確（或保持空白，若 Views 不可用）
- [ ] Sync Status 更新為 `Synced`
- [ ] Data Last Synced At 更新為本次同步時間
- [ ] Last Sync Attempt At 更新（每次嘗試後更新，無論成功或失敗）
- [ ] Sync Error Note 在成功時清空或保留上次錯誤供參考
- [ ] Sync Error Note 在失敗時寫入錯誤原因

---

## 10. Failure Case Tests

驗證各種異常情境的處理行為：

| 情境 | 預期行為 | 通過 |
|------|----------|------|
| Threads Post ID 為空 | Sync Status = Skipped，記錄原因 | [ ] |
| Threads Post ID 格式無效 | Sync Status = Skipped，記錄原因 | [ ] |
| Token 過期 | Sync Status = Failed，Sync Error Note 寫入錯誤 | [ ] |
| Permission denied | Sync Status = Failed，Sync Error Note 寫入錯誤 | [ ] |
| API rate limit | Sync Status = Failed，不重試（不自動 retry loop） | [ ] |
| Notion 回寫失敗 | Sync Status = Failed，不覆蓋前次 metrics | [ ] |
| Views = 0 | Engagement Rate 留空，Sync Error Note 標記 | [ ] |
| Optional metric 缺失 | Engagement Rate 以 0 代入計算，Error Note 列出缺失欄位 | [ ] |
| Sync Enabled = false | Sync Status = Skipped | [ ] |
| No Blocking Issue = false | Sync Status = Skipped | [ ] |

> **重要：** 失敗情境下，前次成功的 metrics 數值必須保持不變。

---

## 11. Pass Criteria

以下所有條件達成，才視為 Manual Test Checklist 通過：

- [ ] 沒有任何 secret 被 commit 到 repo
- [ ] `.env` 確認被 `.gitignore` 排除
- [ ] Notion Content Queue 可被 script 正確讀取與篩選
- [ ] Threads Insights API 可成功取得至少一項 metric
- [ ] Metrics 可正確回寫 Notion
- [ ] 同步失敗時，Sync Error Note 有記錄，前次 metrics 不被覆蓋
- [ ] Sync Status 在每種情境下顯示正確狀態
- [ ] 手動流程可重複執行（idempotent：重複執行不產生錯誤或重複資料）
- [ ] Section 6 API Smoke Test 的「記錄區」已手動填寫完成

---

## 12. Next Step After Checklist

若以上 checklist 全部通過，才進入以下實作步驟：

1. **Local Script Skeleton** — 建立 `scripts/threads/sync_threads_insights.py` 的基本結構，實作環境變數讀取與 Notion 連線
2. **Single Post Insights Fetch** — 實作針對單一 Threads Post ID 的 API 呼叫與 metrics 抓取
3. **Notion Writeback Implementation** — 實作 metrics 回寫與狀態更新邏輯

> **若有任何 checklist 項目未通過：** 記錄失敗原因，回報給 AVIN 確認後再決定是否繼續。不跳過未通過的項目直接進入實作。
