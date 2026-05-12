# Threads MVP 1｜Notion Fields Spec

日期：2026-05-12
分類：Workflow / MVP Spec / Notion Fields
狀態：Spec Draft

Parent doc：`04-workflows/threads-mvp-1-manual-publish-auto-insights-sync.md`

---

## 1. Purpose

這份文件用來定義 Threads MVP 1（Manual Publish + Auto Threads Insights Sync）在 Notion Content Queue 資料庫中所需的欄位規格。

目標是讓 AVIN 可以依照此規格：

- 建立或更新 Notion Content Queue 資料庫
- 確認所有必要欄位都已設定好
- 在開始 MVP 1 腳本設計前，先完成 Notion 側的準備工作

此規格只針對 Threads MVP 1 所需最小欄位集合。未來 MVP 2 / MVP 3 或 Instagram 擴展時可再增加欄位。

---

## 2. Required Fields Table

| Field Name | Notion Type | Filled By | Required for MVP 1 | Purpose | Notes |
|------------|-------------|-----------|---------------------|---------|-------|
| Title | Title | AVIN | Yes | 貼文標題或內容摘要，作為 Notion item 的主要識別名稱 | 建議用貼文主題命名，而非貼文全文 |
| Platform | Select | AVIN | Yes | 指定發布平台，MVP 1 只處理 Threads | 選項：Threads（MVP 1）；未來可加 Instagram、LinkedIn 等 |
| Content Type | Select | AVIN | Yes | 貼文格式，影響 Threads API 呼叫方式 | 選項：Text / Image / Video / Carousel |
| Status | Select | AVIN → System | Yes | 內容生命週期狀態，控制同步觸發條件 | 見 Section 3 狀態選項；系統在同步完成後可更新此欄位 |
| Published At | Date | AVIN | Yes | AVIN 手動發布的實際時間 | MVP 1 手動填寫；未來自動發布後可由系統回寫 |
| Threads URL | URL | AVIN | Yes | Threads 貼文公開連結 | AVIN 從 Threads app 複製後填入 |
| Threads Post ID | Text | AVIN | Yes | Threads Post ID，用於呼叫 Insights API | 可手動填入，或由腳本從 Threads URL 解析；見 Section 8 |
| Sync Enabled | Checkbox | AVIN | Yes | AVIN 主動啟用 insights 同步 | 預設 false，AVIN 確認可同步後勾選 true |
| Sync Status | Select | System | Yes | 記錄最新一次同步狀態 | 見 Section 4 狀態選項；系統自動更新 |
| Sync Error Note | Text | System | Yes | 同步失敗時，系統寫入錯誤原因 | 失敗時填入；成功後清空或保留上次錯誤供參考 |
| Data Last Synced At | Date | System | Yes | 最後一次成功同步的時間 | 只在同步成功時更新；失敗時保留上次成功時間 |
| Last Sync Attempt At | Date | System | Optional | 最後一次嘗試同步的時間，不論成功或失敗 | 與 Data Last Synced At 分開，便於判斷失敗是否為剛發生 |
| Views | Number | System | Optional | 觀看次數 | API dependent，若 API 不支援則留空；見 Section 2 Notes |
| Likes | Number | System | Yes | 按讚數 | 預期為 Threads Insights API 基本指標 |
| Replies | Number | System | Yes | 回覆數 | 預期為 Threads Insights API 基本指標 |
| Reposts | Number | System | Yes | 轉發數 | 預期為 Threads Insights API 基本指標 |
| Quotes | Number | System | Optional | 引用數 | API dependent，以官方文件為準 |
| Shares | Number | System | Optional | 分享數 | API dependent，以官方文件為準 |
| Engagement Rate | Formula / Number | System | Optional | 互動率，計算方式見下方 | 若 Views 不可用，則不計算；留空並寫入 Sync Error Note |
| Lifecycle Status | Select | System + AVIN | Optional | 記錄整體生命週期狀態 | 選項：Draft / Published / Completed / Archived；系統可更新，AVIN 可手動確認 |
| GitHub Log Path | Text | System | Optional | 對應 GitHub performance log 的路徑 | 若有產生 log 則填入；MVP 1 視情況而定 |
| No Blocking Issue | Checkbox | AVIN | Yes | 確認此 item 無阻擋同步的已知問題 | 預設 false；AVIN 確認無問題後勾選 true，才允許同步 |

### Engagement Rate 計算方式

```
Engagement Rate = (likes + replies + reposts + quotes + shares) / views
```

- 若 `views` 不可用或為 0：不計算，Engagement Rate 欄位留空，Sync Error Note 標記原因
- 若部分指標為 null（API 未回傳）：以 0 代入計算，Error Note 列出缺失指標名稱

---

## 3. Status Options

| 狀態 | 說明 | 允許 Insights Sync |
|------|------|-------------------|
| `Idea` | 靈感記錄，尚未成草稿 | ❌ |
| `Draft` | 草稿撰寫中 | ❌ |
| `Ready for Review` | 等待 AVIN 審核 | ❌ |
| `Revision Needed` | 需要修改 | ❌ |
| `Approved by AVIN` | AVIN 核准，可進入排程 | ❌ |
| `Scheduled` | 已排定發布時間 | ❌ |
| `Published` | 已發布 | ✅ |
| `Insights Synced` | 成效數據已回寫 | ✅（可重複同步更新數據） |
| `Lifecycle Completed` | 全流程結案 | ✅（選擇性重新同步） |
| `Archived` | 封存 | ❌ |

> MVP 1 只處理 Status = `Published` 或 `Insights Synced` 的項目。

---

## 4. Sync Status Options

| 狀態 | 使用時機 |
|------|----------|
| `Not Started` | 初始狀態，尚未執行過任何同步嘗試 |
| `Pending` | 同步已觸發，正在等待 API 回應 |
| `Synced` | 同步成功，metrics 已寫回 Notion，Data Last Synced At 已更新 |
| `Failed` | 同步失敗，Sync Error Note 有錯誤說明，舊數據保留不覆蓋 |
| `Skipped` | 不符合同步觸發條件（Post ID 缺失、Sync Enabled = false 等），系統略過並記錄原因 |
| `Needs Review` | 同步完成但有異常（數據異常低、API response 不完整），需 AVIN 確認 |

---

## 5. MVP 1 Trigger Criteria

系統只同步同時符合以下所有條件的 Notion item：

```
Platform = Threads
AND (Status = Published OR Status = Insights Synced)
AND Threads Post ID is not empty
AND Sync Enabled = true
AND No Blocking Issue = true
```

任一條件不符合 → 系統 **Skip** 此 item，Sync Status = `Skipped`，記錄跳過原因。

不處理的狀態（直接 Skip，不記錄錯誤）：

```
Status = Idea / Draft / Ready for Review / Revision Needed / Approved by AVIN / Scheduled / Archived
```

---

## 6. Manual Input Fields

以下欄位由 **AVIN 手動填寫**，系統不自動修改：

| Field Name | 填寫時機 |
|------------|----------|
| Title | 建立 item 時 |
| Platform | 建立 item 時（選 Threads） |
| Content Type | 建立 item 時 |
| Status | 各階段手動推進；發布後改為 `Published` |
| Published At | 手動發布 Threads 後填入實際時間 |
| Threads URL | 從 Threads app 複製連結後填入 |
| Threads Post ID | 手動填入，或確認系統從 URL 解析後是否正確 |
| Sync Enabled | 確認可同步後勾選 `true` |
| No Blocking Issue | 確認無問題後勾選 `true` |

---

## 7. System Writeback Fields

以下欄位由**系統自動回寫**，AVIN 不需手動填寫：

| Field Name | 回寫時機 |
|------------|----------|
| Sync Status | 每次同步嘗試後更新 |
| Sync Error Note | 同步失敗時寫入；成功時可清空或保留 |
| Data Last Synced At | 同步成功時更新 |
| Last Sync Attempt At | 每次同步嘗試後更新（無論成功或失敗） |
| Views | 同步成功後回寫（API dependent） |
| Likes | 同步成功後回寫 |
| Replies | 同步成功後回寫 |
| Reposts | 同步成功後回寫 |
| Quotes | 同步成功後回寫（API dependent） |
| Shares | 同步成功後回寫（API dependent） |
| Engagement Rate | 同步成功後計算並回寫（Views 可用時） |
| Lifecycle Status | 系統判斷條件達成後可更新（選擇性） |
| GitHub Log Path | 若產生 performance log，寫入對應路徑 |

> **安全規則：** 系統不得把任何 token、secret 或原始 API response 寫入 Notion 欄位。只寫公開可見的 metrics 數值與狀態。

---

## 8. Open Questions

在建立 Notion 資料庫與開始 MVP 1 腳本設計前，AVIN 需要確認以下問題：

| # | 問題 | 說明 |
|---|------|------|
| 1 | **Notion database 是否已存在？** | 若已有 Content Queue 資料庫，可直接在現有資料庫新增欄位；若尚未建立，需要新建 |
| 2 | **Database 名稱是什麼？** | 需要名稱或 database ID 才能用 Notion API 讀寫 |
| 3 | **Threads Post ID 手動填還是從 URL 解析？** | 若從 URL 解析，腳本需要加 URL parser 邏輯；手動填入較安全，但對 AVIN 多一步操作 |
| 4 | **是否保留 Last Sync Attempt At？** | 此欄位與 Data Last Synced At 分開，便於判斷失敗是否為近期發生；若覺得冗餘可合併 |
| 5 | **Performance log 是否在 MVP 1 就生成？** | 若 MVP 1 每次同步成功後都產生 GitHub performance log，需要額外的 file write 邏輯；可先設為 optional，只在 lifecycle completed 時才建立 |
