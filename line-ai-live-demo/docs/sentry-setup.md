# Sentry 設定說明

## 目的

Sentry 用來接：

- webhook 執行錯誤
- OpenAI / Claude API 錯誤
- Supabase 寫入錯誤
- Google Sheets 寫入錯誤

它的作用不是讓客服變聰明，而是讓你知道哪裡壞了、何時壞了、哪一段壞了。

## 目前程式已支援的環境變數

```env
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ENVIRONMENT=production
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
```

## 最少要填哪些

### 只想先開錯誤監控

只填這兩個就能開始收 runtime 錯誤：

```env
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_ENVIRONMENT=production
```

### 想連 source map 一起上傳

再補這三個：

```env
SENTRY_AUTH_TOKEN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
```

這樣之後在 Sentry 看錯誤堆疊時，會比較容易對到實際程式碼位置。

## Health 狀態判讀

部署後打：

```text
/api/health
```

會看到：

### `sentry_status = disabled_or_missing_env`

代表 Sentry 還沒啟用，通常是 `NEXT_PUBLIC_SENTRY_DSN` 沒填。

### `sentry_status = configured_runtime_only`

代表 runtime 錯誤監控已開，但 source map 上傳還沒開。

### `sentry_status = configured_runtime_and_build_upload`

代表 runtime 監控與 build source map 上傳都已開。

## 建議順序

1. 先填 `NEXT_PUBLIC_SENTRY_DSN`
2. 重新部署
3. 看 `/api/health`
4. 確認 `sentry_status` 不再是 `disabled_or_missing_env`
5. 再補 `SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT`

## 實務建議

- Demo 階段：先開 runtime 監控就夠了
- 正式簽約前：建議把 source map 也補齊
- 正式版：建議把 Sentry 與 LINE 告警一起保留，這樣出錯時你會比較快知道
