# 新客戶導入 SOP

## 架構原則

目前產品採「一個診所客戶，一套獨立部署」：獨立 Vercel 專案、獨立 Supabase 專案、獨立 LINE Messaging API channel。`tenant_id` 是未來遷移預留，**不是**目前共用部署的授權依據。

不可在同一個部署接兩個診所的 LINE channel。每位客戶資料必須留在自己的 Supabase 專案。

## 簽約後先蒐集

- 品牌與診所名稱、AI 客服名稱。
- 每館名稱、地址、營業時間、交通、公開電話、可服務狀態。
- 核准療程、別名、第一層介紹、不可回答範圍。
- 活動名稱、核准價格文字、開始與結束日期、活動圖片。
- 付款方式、初診準備、預約/改期/取消規則。
- 真人客服服務時段、通知對象、客訴與術後異常的升級規則。
- 至少 20 題常見問答，及後台 owner 的 email。

## LINE 權限

建議客戶在 LINE Official Account Manager 與 LINE Developers Console 將你加為管理員，不交付帳密。Messaging API channel 應建立在客戶自己的 Provider 下，避免把不相關診所混在同一個 Provider。

若客戶自行操作，客戶必須自行完成 LINE 帳號、Messaging API 啟用與管理員設定；你提供 webhook URL 與逐步操作文件。

## Secret 處理鐵則

- Channel secret、access token、AI key、Supabase service-role key、CRON_SECRET 不可傳到 LINE、Email、聊天室、Git 或 issue。
- 有 console 權限時，直接從 LINE Developers 複製到該客戶 Vercel 專案的 Production environment。
- 必須協作時，使用一次性密碼管理器分享連結，或螢幕共享指導客戶自行貼入 Vercel。
- 一旦憑證曾以明文傳送，立即在原服務重新產生值並撤銷舊值。

## 建立一位客戶

1. 從已審查的模板版本建立新的私有 repository 或受保護分支；不可直接複製尚未提交的工作樹。
2. 建立客戶專屬 Supabase 專案，依序執行 `C:\Users\user\Documents\New project 2\supabase\migrations` 全部 migration。
3. 在客戶 repository 填寫 `src/lib/clinic-config.ts` 與 `data/live-demo-seed`。所有對外療程、活動、館別都必須先經客戶核准。
4. 建立客戶專屬 Vercel 專案，設定 Production environment variables。以 `.env.example` 為欄位清單，但不要把值存進檔案或回傳到聊天。
5. 執行 `npm run init:client-data`，確認診所設定與 seed 基礎資料完整。
6. 建立/邀請客戶後台 owner，執行 `npm run bootstrap:owner` 前先確認 owner email。
7. 將 `https://<client-domain>/api/line/webhook` 填入客戶的 LINE Developers，開啟 webhook，並關閉會與 webhook 衝突的自動回覆。
8. 設定 `CRON_SECRET` 後 redeploy，讓 `vercel.json` 的每日報表排程生效。

## 模板與 fork 流程

1. `main` 只保留已審查、已部署驗證的產品程式。
2. 建立客戶前從固定 release commit 建立 private repository，例如 `client-<slug>`。
3. 客戶設定放在該客戶 repository；共用功能修正先回主產品 repository，審查後再同步到客戶 repository。
4. 禁止把客戶資料、客服名單、真實活動圖、production `.env` 回推到共用模板。
5. 每次升級先在 demo 或 staging 驗證，再逐客戶安排部署窗口。

## 上線與交接

完整項目請依 [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) 勾選。客戶可隨時移除你的 LINE 管理員權限；Vercel、Supabase 與網域 ownership 的最終歸屬需在合約中寫明。

停用時：先關 webhook、匯出已約定的資料、移除存取權、確認保留期後再刪除客戶專案。不要直接刪除資料庫或憑證。
