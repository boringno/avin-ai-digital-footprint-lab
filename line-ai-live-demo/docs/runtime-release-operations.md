# Runtime 回覆發布與回退

## 目的

這份流程把「診所內容更新」和「正式 LINE 客人收到的新回覆」分開。內容版本先依既有草稿、送審與發布流程完成；再由 `正式回覆發布` 建立不可變 snapshot、跑固定回歸題庫，才可以小量或全量套用到 runtime。

安全基線永遠是既有 seed。runtime release 只覆蓋已發布的 FAQ 與活動價格內容，不能覆蓋安全分流、真人接手、預約、館別與醫師班表規則。

對被灰度選入 release 的客人，該 snapshot 內的活動價格清單是完整且唯一的價格來源；未收進 snapshot 的 seed 價格不會補回。建立 release 前，必須先確認所有仍要對客顯示的核准活動價格皆為已發布狀態。未被灰度選入、尚未啟用 release 或 rollback 後，才使用 seed 基線。

## 正式操作

1. 在 `/admin/content` 將 FAQ 或活動內容走完草稿、送審與發布。
2. 進入 `/admin/runtime-releases`，建立一個命名清楚的 snapshot，例如 `2026-08 活動與 FAQ v1`。
3. 按 `跑回歸題庫`。所有安全、真人接手、預約與館別題目都必須通過。
4. 先選 `10% 灰度`。同一個 LINE user ID 會固定落在同一組，不會每次訊息切換版本。
5. 在監控與工作台觀察至少一個營業時段，確認沒有異常 handoff、FAQ miss 或客服回報。
6. 再按 `全量啟用`。
7. 任何異常按 `切回安全版本`。這只切換資料庫的 active 指標，不刪除 snapshot，也不需要重新部署。

## Staging 與測試 LINE

Staging 必須是獨立資源，不能共用正式客人資料：

1. 建立 `staging` Git branch，Vercel 建立對應 Preview 或第二個 staging project。
2. 建立獨立 Supabase project，僅匯入去識別化 seed 與測試帳號；執行所有 migrations。
3. 在 LINE Developers 建立獨立測試 Messaging API channel／官方帳號，Webhook 指向 staging URL 的 `/api/line/webhook`。
4. staging Vercel 只設定 staging 的 LINE、Supabase、AI 與 cron secrets。不可複製正式客人資料或正式 LINE token。
5. 測試帳號加入測試 LINE 後，逐一跑回歸題庫、預約、真人接手、交回 AI、班表、活動與異常分流。
6. staging 通過後，才把相同已審核內容在正式環境建立 runtime snapshot；不要把 staging database 複製回正式。

## 發布前檢查

```powershell
cd "C:\Users\user\Documents\New project 2\line-ai-live-demo"
npm run validate:runtime-releases
npm run validate:router
npm run validate:conversation-guard
npm run check
npm run build
```

## 異常監控

- Sentry：webhook、router、Supabase、AI provider 例外與 release ID 關聯。
- Vercel Logs：確認 webhook 4xx/5xx、cron 與 deployment errors。
- 月報／FAQ miss：觀察新 release 後未分類比例、FAQ miss、真人接手率是否異常上升。
- 一鍵回退後，保留 audit log、對話時間窗與 release snapshot，工程師才能定位問題。

## 權限

- 診所管理員（owner）與系統維運（maintainer）可以建立、測試、灰度啟用、全量啟用與回退。
- 診所客服主管與第一線客服不能略過這道發布流程。
- 所有操作寫入 audit log；不得在回歸案例或 audit payload 寫入客人原始訊息或電話。
