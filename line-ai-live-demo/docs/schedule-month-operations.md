# 門診班表月版作業

## 發布單位與狀態

- 發布單位是月份。一次發布必須包含高雄館、台中館、桃園館、林口館四張圖片與同月結構化 CSV。
- 上傳完成即建立草稿；owner 或 manager 確認後可一鍵發布；可手動停用。沒有獨立送審流程。
- 同月份舊版會保留在版本紀錄中。新版本發布時，該月先前已發布版本會自動停用。
- 停用只會停止後續主動傳送，已送出的 LINE 圖片訊息無法撤回。

## 每月上傳步驟

1. 整理四館當月原始班表圖，格式只可為 JPEG 或 PNG。
2. 準備 UTF-8 CSV，至少包含 `doctor_name`、`branch`、`schedule_date`、`time_slot`；可選 `source_month`、`status`、`notes`。
3. 進入 `/admin/schedules`，選月份、填寫變更原因、上傳 CSV 與四館圖片。
4. 系統在瀏覽器自動產生預覽縮圖，確認四館縮圖與資料無誤後建立草稿。
5. 在版本紀錄按「發布本月」。發布前會再檢查四館資產與 CSV 資料是否完整。
6. 用測試 LINE 帳號確認：各館問「門診表／醫師班表／診次表」會收到對應圖片；指定醫師則只回結構化門診文字；預約仍由客服確認。

## LINE 圖片限制

- 原圖與預覽圖 URL 必須為 HTTPS、TLS 1.2 以上，格式為 JPEG 或 PNG。
- 原圖最大 10 MB；預覽圖最大 1 MB；URL 最長 2,000 字元（百分比編碼後）。
- 此系統的 `schedule-assets` 為公開讀取 bucket；圖片與 CSV 只由後端 service role 寫入，瀏覽器不直接寫入 Storage。

限制依 [LINE Messaging API Image Message](https://developers.line.biz/en/reference/messaging-api/#image-message) 官方文件執行。

## 對話規則

- 未指定館別時，AI 先詢問要查看哪一館。
- 只有「當月且已發布」的班表可主動傳圖；未發布、停用或非當月一律不傳舊圖，改由真人客服確認。
- 指定醫師與日期的問題只使用結構化 `doctor_schedule` 資料；沒有資料時轉真人，不從圖片猜測。
- 客人要約指定醫師時，班表只供參考，預約仍走既有收單與真人確認流程。
