# OS Control Panel Bilingual Toggle Completed | 2026-05-18

## 1. 任務背景

AVIN 在人工驗收 `website/os-control-panel.html` 後，確認目前的 categorized control panel 方向可延續，但需要加入繁體中文 / English 切換，讓這頁同時能服務 AVIN 自己，以及未來的英文觀眾與 AI reviewer。

## 2. 為什麼需要中英切換

- 目前頁面已具備管理頁與控制艙定位，適合作為 AVIN 的 OS 狀態入口。
- 未來這頁除了自用，也會承接外部 reviewer、英文協作者與 AI audit 的閱讀情境。
- 單一語言會讓 handoff、review state 與 public-facing explanation 的可用性下降。
- 在 static-first 階段，先用單檔 HTML 內建切換即可，不需要提早引入多頁路由或外部 i18n 系統。

## 3. 本次修改內容

- 在 header 加入明確可見的 `繁中 / EN` 語言切換按鈕。
- 預設語言改為繁體中文。
- 以 `data-i18n` 搭配內建 `translations` 物件，切換主要 UI 文案：
  - Header / Hero
  - Navigation labels
  - Section headings
  - Overview 核心卡片
  - Workflow 手機 fallback 提示
  - Agent Handoff 關鍵說明與 Copy Prompt 類按鈕
  - Review Gate 關鍵說明與 visual-only decision preview
  - Future Integrations 標題
  - Footer 關鍵說明
- 使用 `localStorage` 記住語言偏好：
  - key：`avin-os-language`
- 讓 Copy Prompt 內容也依目前語言切換。

## 4. 保留 static-first / no API / no MCP 原則

- 仍然維持單檔 `HTML + CSS + 少量 vanilla JS`
- 無 build step
- 無外部套件
- 無 CDN
- 無翻譯 API
- 無 API / MCP / Hermes runtime
- 無新增任何真實 dashboard action

## 5. 不做事項

- 不改成 React / Vue / Svelte
- 不建立多個 HTML 檔
- 不建立語言路由
- 不重寫整個 CSS 或整頁 UI
- 不建立 `dashboard-data.json`
- 不接 Notion / GitHub API
- 不讓 Review Gate 或其他按鈕寫入任何狀態

## 6. 下一步建議

- 直接用桌機與手機人工檢查中英切換後的版面密度，特別看 topbar、sidebar、workflow mobile fallback。
- 如果英文文案長度造成局部擠壓，只做小型 spacing / line-height 微調，不要重構。
- 等中英切換穩定後，再決定是否把更細的 field labels 也納入完整雙語覆蓋。

## 7. Git status snapshot

```text
 M docs-index.md
 M website/os-control-panel.html
?? 00-project-log/2026-05-18-os-control-panel-bilingual-toggle-completed.md
```
