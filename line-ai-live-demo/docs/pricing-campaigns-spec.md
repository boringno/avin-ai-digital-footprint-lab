# 活動價格資料規格

## 用途

這張表只用來放「有時效性的活動價 / 體驗價 / 檔期方案」。

只有診所明確核准為可由 LINE 報價的價格可以直接回答。核准價格分為期間活動與常態報價；沒有核准的其他價格仍由真人客服或現場評估確認。

## 價格生命週期與優先序

- `pricing_kind=campaign`：周年慶或其他期間活動，必須有 `start_date` 與 `end_date`。
- `pricing_kind=standing`：常態核准線上報價，可不設起迄日期；調價時建立新版本並重新發布。
- 同一療程與同一適用條件同時有常態價及周年慶價時，以較高的 `quote_priority` 決定一般詢價要回答哪一個。
- 周年慶只覆蓋衝突方案，不能刪掉其他療程仍有效的常態核准報價。
- 同療程但品牌、劑量、套組或部位不同時不算同一衝突項；客人明確指定的核准常態方案仍可報價。例如泛問「肉毒多少錢」可優先回周年慶主打方案，明確問 `BOTOX 12U` 則回該規格已核准的常態價格。
- 「有哪些活動」只展示 `campaign`；`standing` 只在客人詢問對應療程價格時回答。
- 已取消方案必須從完整 Runtime Snapshot 排除或停用，不因活動結束而自動恢復。

## 核心原則

- AI 預設不回答一般定價。
- 只有活動資料存在，且仍在有效日期內時，AI 才能回答活動價。
- 每筆活動一定要有開始日與結束日。
- 超過日期後，AI 會自動忽略該活動，不需要手動關閉。
- 資料不完整、未審核、未啟用，都不能拿來回答客人。

## 欄位說明

| 欄位 | 必填 | 說明 |
| --- | --- | --- |
| `id` | 否 | 活動識別碼，建議唯一 |
| `treatment_name` | 是 | 對應療程名稱，建議和系統療程名稱一致 |
| `branch_scope` | 是 | 適用館別，可填 `all`、`高雄`、`台中`、`桃園`、`林口`，或用 `|` 串接多館 |
| `asset_urls` | 否 | 活動圖網址，可放一張或多張，用 `|` 串接 |
| `campaign_aliases` | 否 | 活動別名，可填客人常用問法，例如 `onda體驗價|七月活動|暑期優惠` |
| `campaign_name` | 是 | 活動名稱，例如 `2026 七月體驗活動` |
| `pricing_kind` | 是 | `campaign`（期間活動）或 `standing`（常態核准報價）；舊資料預設為 `campaign` |
| `price_text` | 是 | 舊流程相容欄位；不得視為 V2 客顯價格的核准依據 |
| `customer_price_approval_status` | 是 | 客顯價格的獨立審核狀態；只有 `approved` / `stable` 可用 |
| `customer_price_text` | 是 | 僅放客人可見價格，例如 `體驗價 16888`；禁止放活動日期或期限 |
| `dose` | 否 | 價格限定的劑量／發數；有填時，客人未確認相同規格前不得直接報價 |
| `package_key` | 否 | 價格限定的方案代碼；不同方案不可共用價格 |
| `session_count` | 否 | 價格限定的堂數；單堂與多堂價格分開 |
| `variant_key` | 否 | 價格限定的產品或規格版本 |
| `start_date` | 是 | 活動開始日，格式 `YYYY-MM-DD` |
| `end_date` | 是 | 活動結束日，格式 `YYYY-MM-DD` |
| `is_active` | 是 | `true` 或 `false` |
| `approval_status` | 是 | 建議使用 `approved`、`pending_review`、`expired`、`rejected` |
| `fallback_message` | 是 | 客人還要進一步確認時，要補的安全話術 |
| `notes` | 否 | 內部備註，不對客人顯示 |

## 日期生效邏輯

系統只會使用符合以下條件的活動：

1. `is_active = true`
2. `approval_status = approved`
3. `treatment_name` 不為空
4. `campaign_name` 不為空
5. `customer_price_approval_status = approved`（V2）
6. `customer_price_text` 不為空且不含活動日期／期限（V2）
7. `start_date` 格式正確
8. `end_date` 格式正確
9. 今天日期介於 `start_date 00:00:00` 到 `end_date 23:59:59`

只要其中一條不成立，AI 就不會使用這筆活動。

## 意圖正規化邏輯

系統目前會把以下問法視為同一類「活動 / 優惠」意圖：

- 活動
- 活動療程
- 近期活動
- 最近活動
- 優惠
- 優惠方案
- 優惠活動
- 方案
- 體驗價
- 折扣

如果有填 `campaign_aliases`，系統也會一起拿來比對。

例如：

- 客人問 `ONDA 最近有活動嗎`
- 客人問 `onda 體驗價`
- 客人問 `七月優惠方案`

都可以透過 `treatment_name + treatment aliases + campaign_aliases` 共同命中。

## 建議填值

### `branch_scope`

- `all`
- `高雄`
- `台中`
- `桃園`
- `林口`
- `高雄|台中`

### `approval_status`

- `approved`
- `pending_review`
- `expired`
- `rejected`

## 範例

```csv
id,treatment_name,branch_scope,asset_urls,campaign_aliases,campaign_name,price_text,customer_price_approval_status,customer_price_text,start_date,end_date,is_active,approval_status,fallback_message,notes,dose,package_key,session_count,variant_key
sf-2026-07-onda-01,ONDA PRO,all,https://line-ai-live-demo.vercel.app/demo/promotions/tenthermage-2026-07-09-to-07-15.jpg,onda體驗價|onda活動|七月onda優惠,2026 七月體驗活動,體驗價 16888,approved,體驗價 16888,2026-07-01,2026-07-31,true,approved,目前活動內容可能依日期或館別調整，若您想確認實際可約時段與適用條件，我可以再幫您整理給真人客服確認。,July campaign
sf-2026-07-pico-01,探索皮秒,台中|高雄,https://line-ai-live-demo.vercel.app/demo/promotions/multi-treatment-2026-07-09-to-07-15.jpg,皮秒活動|皮秒體驗價|暑期皮秒方案,2026 七月新客活動,新客體驗價 3888,approved,新客體驗價 3888,2026-07-01,2026-07-15,true,approved,目前活動內容可能依日期或館別調整，若您想確認實際可約時段與適用條件，我可以再幫您整理給真人客服確認。,July campaign
```

## 維運流程

1. 診所或合作方提供活動資料
2. 維護方檢查內容與日期
3. 確認後把 `approval_status` 設為 `approved`
4. 上傳到 CSV / Sheet / 資料庫
5. AI 僅在有效日期內回答
6. 活動過期後，系統自動停止使用
