# 常態核准報價匯入 SOP

## 目的

把診所已核准、可由 LINE 直接報價的常態方案，安全地送進既有的內容審核與 Runtime Snapshot 流程。

這份 SOP 的重點不是「把價格寫進程式」，而是確保每一筆價格只有在完成下列流程後才會對客人可見：

```text
診所核准資料
  -> 匯入候選清單
  -> 內容草稿
  -> 審核
  -> 發布
  -> Runtime Snapshot
  -> 指定 DEMO / Production audience 啟用
```

## 價格優先規則

1. 周年慶等檔期方案使用 `campaign`；必須有開始與結束日。
2. 長期可線上報價的方案使用 `standing`；不需假造到期日。
3. 同一療程、同一規格同時命中時，當期 `campaign` 以較高 `quote_priority` 優先。
4. 不同療程或不同已明確指定的規格，常態價仍可報，不會被無關活動覆蓋。
5. 已撤下的價格不可因 seed 或舊 CSV 在 Runtime Snapshot 中復活。

> 規格很多的品項（例如性別／部位不同的除毛、皮秒局部或全臉）目前必須由
> 已核准按鈕或語意解析提供明確規格，才會直接報對應價格；泛稱「除毛多少」
> 應先讓客人選部位，不可任意挑一筆價格回答。

## 本批候選資料

`src/lib/approved-standing-price-import.ts` 是本次核准資料的**匯入來源**，不是客人端的即時資料來源。

- 62 筆可建立草稿的候選方案，涵蓋 31 種療程。
- 每筆都有 canonical `treatmentKey`、客人可見核准價格文字、館別與必要規格。
- 先執行 `npm run validate:approved-standing-price-import` 與
  `npm run validate:content-draft-batch-import`，再進行任何批次匯入。

## 本批刻意不匯入的資料

| 類型 | 原因 | 後續決策 |
| --- | --- | --- |
| ONDA 16,888 | 已由診所取消，周年慶 ONDA 8,999 為現行方案 | 永不重新匯入 |
| 蝴蝶電波 FORMA、Ultherapy | 原資料條件寫明 LINE 不報價 | 診所明確改為可線上報價後才納入 |
| ILIB 敦輝／長安 | 價格與館別對應未確認 | 診所決定公開規則後納入 |
| 5 筆 `draft:` placeholder | 條件尚未填完 | 補齊方案內容與客人文案後再審核 |

## 上線操作順序

1. 先由工程師在目標 Supabase 套用
   `20260906_content_draft_batch_import.sql`，再執行唯讀 postflight
   `20260906_content_draft_batch_import_readonly.sql`。未完成前，管理頁的預覽會停止，不可繞過。
2. 由具有內容草稿權限的人在「FAQ 與活動版本」載入匯入預覽。
3. 展開逐筆檢查 62 筆客人可見價格、療程、館別、既有版本與 10 筆排除原因。
4. 確認筆數與資料指紋後，一次建立完整批次；任何一筆碰撞或失敗，整個資料庫交易都會回滾。
5. 診所內容負責人抽查草稿後，再依既有流程逐步送審、核准與發布。
6. 建立新的 Runtime Snapshot，先指派給 DEMO audience。
7. 以 LINE 實測：泛稱價格、明確品牌／部位／規格、周年慶衝突、館別限定和無法線上報價。
8. 確認 Decision Trace 的 `campaignId` 與客人看到的價格一致後，才將 Snapshot 擴大到 Production audience。

## 批次安全邊界

批次建立功能已實作，但只負責**建立草稿**：

- 資料列、tenant、來源與 batch key 均由伺服器固定，瀏覽器不能替換。
- 先讀每個內容鍵的最新版本；若匯入期間有人更新同一鍵，整批停止並回滾。
- 同一 batch key 與相同資料可安全重播，不會重複建立版本；修正資料必須使用新的 batch key。
- 每一筆草稿與整批收據都有 audit log。
- 不會自動送審、核准、發布、建立或啟用 Runtime Snapshot。

交易失敗可自動回滾；**成功建立後沒有「一鍵刪除整批」**。若成功後發現內容問題，必須沿用既有版本審核／停用流程處理，不可宣稱成功批次也能自動撤銷。

目前 validator 可證明資料轉換、Runtime resolver、程式接線及 SQL 安全邊界；真正的 PostgreSQL 原子性、併發與權限仍必須在非 Production 測試資料庫套 migration 後做整合驗證，未驗證前不得在正式資料庫按下建立。
