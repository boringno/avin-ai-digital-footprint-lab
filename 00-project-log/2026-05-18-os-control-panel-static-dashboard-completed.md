# OS Control Panel Static Dashboard Completed | 2026-05-18

## 1. 任務背景

這次任務把前一輪完成的 `OS Control Panel Reference Research` 與 `OS Control Panel UI UX Architecture`
轉成第一版可視化前端：

- `website/os-control-panel.html`

目標不是產品化，不是做 SaaS，也不是啟動 API / MCP / Hermes runtime，而是先建立一個
static-first、engineering-aware 的控制面板，讓 AVIN 每天能快速看懂目前 OS 狀態。

## 2. 為什麼需要第一版 static dashboard

目前 AI Digital Footprint OS 的 source of truth 已經存在於 GitHub Markdown、docs-index、
project cards、review notes 與 project logs。

但如果每次都要翻多份文件，AVIN 很容易失去狀態感。

第一版 static dashboard 的價值在於：

- 集中顯示 Stage 2 狀態
- 顯示 architecture layers
- 顯示 open-source-vault 候選隊列
- 顯示 Document Only / Practical Trial / Sandbox Test 流程
- 顯示 Agent Task Handoff Panel
- 顯示 AVIN Review Gate
- 保留未來 API / MCP / Hermes 的接入位置

## 3. 本次新增文件

- `website/os-control-panel.html`
- `00-project-log/2026-05-18-os-control-panel-static-dashboard-completed.md`
- `docs-index.md`

## 4. 與 Reference Research / UI UX Architecture 的關係

這次不是另起爐灶，而是把前面兩層轉成靜態前端：

- `00-meta/os-control-panel-reference-research.md`
  - 提供外部 UI / mission control / agent dashboard / registry pattern 參考
- `00-meta/os-control-panel-ui-ux-architecture.md`
  - 提供 AVIN 專屬 screen 設計、狀態模型、資料來源與工程路線

`website/os-control-panel.html` 是這兩份文件的第一版可視化落地。

## 5. 與 open-source-vault / Agent Task Handoff Panel 的關係

這一版 dashboard 把 open-source-vault 變成可視化隊列，直接顯示：

- `mattpocock/skills`
- `rohitg00/agentmemory`
- GitHub AI Capability Candidate Batch

同時也把任務交接邏輯顯示出來：

- ChatGPT：策略、角度、綜整
- Codex：repo 變更、文件更新、靜態前端、commit / push when safe
- Claude Code：read-only audit / scan / review
- Hermes Future：proposal only

重點是 handoff 與 prompt，可見但不可直接執行。

## 6. Demo-first, engineering-aware 原則

這次落地遵守以下原則：

- demo-first, but engineering-aware
- static now, structured later
- low-bug surface
- source of truth separation
- human review gate

具體做法：

- 只用 HTML / CSS / 少量 vanilla JS
- 不用外部 CDN
- 不用 npm package
- 不用 build step
- 不做複雜 state management
- 用清楚的 section / card / data-field naming，方便未來抽成 `dashboard-data.json`

## 7. 不做事項

這次明確沒有做：

- React / Vue / Svelte
- npm install
- API 接入
- MCP 接入
- Hermes Agent 啟動
- Codex / Claude 自動執行
- SaaS / auth / billing / backend
- `website/index.html` 重寫

## 8. 下一步建議

下一步比較合理的是：

1. 定義 `dashboard-data.json` 結構
2. 把目前硬編在 HTML 的欄位抽成可維護資料層
3. 之後再考慮 GitHub Action 生成 dashboard data
4. 保持 API / MCP / Hermes 先停在 read-only / proposal layer

## 9. Git status snapshot

完成本次修改後，預期應只看到：

- `M docs-index.md`
- `?? website/os-control-panel.html`
- `?? 00-project-log/2026-05-18-os-control-panel-static-dashboard-completed.md`
