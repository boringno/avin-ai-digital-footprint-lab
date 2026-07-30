# 活動價格資料規格

## 用途

這張表只用來放「有時效性的活動價 / 體驗價 / 檔期方案」。

平常的一般價格，仍然以真人客服或現場評估為準。

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
| `price_text` | 是 | 對客人顯示的價格文字，例如 `體驗價 16888` |
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
5. `price_text` 不為空
6. `start_date` 格式正確
7. `end_date` 格式正確
8. 今天日期介於 `start_date 00:00:00` 到 `end_date 23:59:59`

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
id,treatment_name,branch_scope,asset_urls,campaign_aliases,campaign_name,price_text,start_date,end_date,is_active,approval_status,fallback_message,notes
sf-2026-07-onda-01,ONDA PRO,all,https://line-ai-live-demo.vercel.app/demo/promotions/tenthermage-2026-07-09-to-07-15.jpg,onda體驗價|onda活動|七月onda優惠,2026 七月體驗活動,體驗價 16888,2026-07-01,2026-07-31,true,approved,目前活動內容可能依日期或館別調整，若您想確認實際可約時段與適用條件，我可以再幫您整理給真人客服確認。,July campaign
sf-2026-07-pico-01,探索皮秒,台中|高雄,https://line-ai-live-demo.vercel.app/demo/promotions/multi-treatment-2026-07-09-to-07-15.jpg,皮秒活動|皮秒體驗價|暑期皮秒方案,2026 七月新客活動,新客體驗價 3888,2026-07-01,2026-07-15,true,approved,目前活動內容可能依日期或館別調整，若您想確認實際可約時段與適用條件，我可以再幫您整理給真人客服確認。,July campaign
```

## 維運流程

1. 診所或合作方提供活動資料
2. 維護方檢查內容與日期
3. 確認後把 `approval_status` 設為 `approved`
4. 上傳到 CSV / Sheet / 資料庫
5. AI 僅在有效日期內回答
6. 活動過期後，系統自動停止使用
