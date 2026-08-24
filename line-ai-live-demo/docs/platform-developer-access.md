# 平台開發管理員存取規範

平台開發管理員沿用資料庫既有的 `maintainer` 角色，但在產品介面顯示為「平台開發管理員」。這是平台開發與緊急維運專用帳號，不是診所人員角色。

## 權限邊界

- 可使用既有管理後台、客服工作台、報表、內容審核與發布、Runtime release、除錯資料及一般人員管理功能。
- 不會出現在診所邀請或角色變更選單；診所管理者不能建立、指派、停用或移除平台開發管理員。
- 平台開發管理員與診所管理者帳號都只能經受控的後台程序建立或調整。
- 所有既有敏感異動仍由伺服器端重新驗權，並寫入管理稽核紀錄；隱藏按鈕不是權限控制。

## 雙重授權

平台開發管理員登入必須同時符合兩項條件：

1. `staff_users.role` 為 `maintainer`，且帳號仍為啟用狀態。
2. Supabase Auth User ID 精確列在 Production 環境變數 `PLATFORM_DEVELOPER_AUTH_USER_IDS`。

環境變數接受逗號分隔的 UUID。沒有設定、格式錯誤或只修改資料庫角色時，一律拒絕平台開發管理員登入。不要把 UUID、密碼、token 或 service role key 寫入 Git。

## 建立與撤銷程序

1. 為每位開發者建立獨立 Supabase Auth 帳號，禁止共用帳號。
2. 完成身分確認並啟用 MFA；Production 權限只給實際需要維運的人。
3. 由受控後台程序建立或更新 `staff_users`，指定正確 tenant 與 `maintainer` 角色。
4. 將該帳號的 Auth User ID 加入 Production 的 `PLATFORM_DEVELOPER_AUTH_USER_IDS`，再重新部署。
5. 驗證登入、越權測試與稽核紀錄後才投入使用。
6. 人員離職或不再需要存取時，先從 allowlist 移除並重新部署，再停用 `staff_users` 與 Supabase Auth 帳號。

## 安全限制

這套設計能防止一般使用者透過前端或單獨竄改角色取得平台權限，但不能宣稱「不可能被駭」。目前程式會精確驗證 Auth UUID 與資料庫角色；MFA 啟用仍屬帳號開通程序，尚未由應用程式強制檢查 AAL2。若要對外網路長期開放，下一階段應加入應用程式層的 MFA/AAL2 強制、異常登入告警與定期權限複核。
