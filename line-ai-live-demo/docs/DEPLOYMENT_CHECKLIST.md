# 客戶 Production 部署檢查表

## 部署前

- [ ] 客戶已核准品牌、館別、療程、FAQ、活動與真人客服升級規則。
- [ ] 客戶使用自己的 LINE Official Account、LINE Provider、Vercel 與 Supabase 專案。
- [ ] 所有 migrations 已依檔名順序在客戶 Supabase SQL Editor 成功執行。
- [ ] `clinic-config.ts` 與 `data/live-demo-seed` 已完成 review，沒有 demo 名稱、TODO 或未核准價格。
- [ ] `npm run init:client-data` 通過。
- [ ] `npm run validate:router`、`npm run validate:conversation-guard`、`npm run validate:intent-classify` 通過。
- [ ] `npm run validate:admin-reports`、`npm run validate:reporting-privacy`、`npm run validate:reporting-time` 通過。
- [ ] 若部署內容管理，`npm run validate:content-versioning` 通過，且 `20260715_content_versions_v1.sql` 已在客戶 Supabase SQL Editor 成功執行。
- [ ] `npm run validate:retention-sweep` 通過，且 `20260716_retention_sweep_r1.sql` 已在客戶 Supabase SQL Editor 成功執行。
- [ ] `npm run check` 與 `npm run build` 通過。

## Production 環境設定

- [ ] LINE channel access token 與 channel secret 已直接填入客戶 Vercel Production environment。
- [ ] 客戶 Supabase URL 與 service-role key 已填入 Vercel Production environment。
- [ ] 已設定選定 AI provider 的 key，未選 provider 的 key 沒有被要求或外傳。
- [ ] `APP_BASE_URL` 是客戶自己的 production URL。
- [ ] `LIVE_DEMO_SEND_REPLY=true`。
- [ ] `LIVE_DEMO_SKIP_SIGNATURE_VERIFY=false`。
- [ ] `CRON_SECRET` 是每客戶獨立、至少 32 字元的隨機值。
- [ ] `BOOTSTRAP_OWNER_EMAIL` 是客戶指定的後台 owner。
- [ ] `RETENTION_SWEEP_MODE` 保持未設定（dry-run，只計數不刪除、不寫 audit_logs）。dry-run 先跑至少一週，owner 核可 dry-run 報數後，才可設為 `apply` 並 redeploy 開真刪。
- [ ] 已 redeploy Production。
- [ ] 以安全的部署環境執行 `npm run init:client-data -- --check-production-env`，只確認值是否存在，不輸出任何值。

## LINE 與功能驗收

- [ ] LINE Developers webhook URL 為 `https://<client-domain>/api/line/webhook`，Verify 成功。
- [ ] LINE 的自動回覆不會與 webhook 回覆重複。
- [ ] 基本館別、地址、付款、初診、療程第一層介紹可正確回答。
- [ ] 價格與活動只有在核准且有效日期內才回答。
- [ ] 懷孕、哺乳、備孕、術後異常、醫療風險、客訴與效果保證都正確轉真人。
- [ ] 預約可收集療程、館別、三個時段、初診/複診、稱呼、電話；可改期與取消。
- [ ] 真人接手後 AI 不插話；交回 AI 後才恢復。
- [ ] owner、manager、agent、analyst、maintainer 各實測一次頁面與 API 權限。
- [ ] analyst 只能看報表，報表沒有電話、原始訊息或完整 LINE user ID。
- [ ] 手機 375px 實測 reports、workbench、leads；鍵盤彈出時 sticky 操作列不遮住輸入或送出按鈕。
- [ ] owner／manager 建立 FAQ 與活動草稿、送審、發布、停用各走一次；確認舊版本仍保留在歷史中，且內容發布尚未切換 LINE runtime。

## 報表、通知與交接

- [ ] 手動 dry-run：`npm run reporting:daily -- --dry-run --date=<前一天日期>`。
- [ ] 每日排程已在 Vercel 生效，台灣時間凌晨 01:00 統計前一天。
- [ ] Sentry 或等效監控可收到錯誤事件，且不含 prompt、token、電話或原始訊息。
- [ ] 客戶了解 Supabase 方案的備份/PITR 範圍，並確認資料保留與停用流程。
- [ ] 客戶與你都確認 LINE、Vercel、Supabase 的管理員/ownership 交接方式。
