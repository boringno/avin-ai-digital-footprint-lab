# OS Control Panel Static Dashboard UI Review Fixes Completed | 2026-05-18

## 1. 任務背景

這次任務不是重構 `website/os-control-panel.html`，也不是改成 React、接 API / MCP / Hermes，
而是根據前一輪 read-only UI review，對 static dashboard v1 做最小必要的 UI 語意校正。

目標是讓這一頁更像 AVIN 的管理頁面 / 任務航管塔，而不是看起來像可以直接執行流程的操作台。

## 2. Read-only UI review 發現的兩個必修項

- Codex 區塊的 `Current recommended task` 仍寫成 `Finish static OS Control Panel`
  - 但 static dashboard 已完成，文案已過期，會讓控制面板狀態失真
- Review Gate 使用 `Approve / Needs Edit / Move to Practical Trial` 等按鈕外觀
  - 雖然本頁沒有實作動作，但視覺上容易形成 false affordance，讓人誤解這裡會直接執行決策

## 3. 本次修正內容

- 更新 Codex 區塊的 `Current recommended task`
  - 改為先驗證 dashboard 在桌機與手機上的可讀性，再準備 `dashboard-data.json` 欄位設計
- 同步更新 Codex prompt 文案
  - 讓 prompt 與當前推薦任務一致，不再停留在「完成 static dashboard」階段
- 將 Review Gate 的操作型按鈕語意改成 visual-only decision preview
  - `Decision Controls` 改為 `Decision Preview`
  - `Visual-only Review Actions` 改為 `Visual-only Decision States`
  - 以 preview chip 顯示決策狀態，不提供任何真實操作
  - 明確加入說明：`These are visual-only decision states. No action is executed from this dashboard.`
- 加入小型手機提示
  - 在 Workflow Experiment Board 上方補充：`On smaller screens, scroll horizontally to view all workflow lanes.`

## 4. 不做事項

這次明確沒有做：

- 不重構整頁
- 不改成 React
- 不加 build step / npm
- 不接 API / MCP / Hermes runtime
- 不建立 `dashboard-data.json`
- 不修改 `website/index.html`
- 不讓 Review Gate 產生任何寫入或外部操作
- 不新增 Copy Prompt 以外的 JS 互動

## 5. 下一步建議

下一步仍應保持小步前進：

1. 人工檢查 `website/os-control-panel.html` 在桌機與手機上的可讀性
2. 確認 section 命名、欄位名稱與 review state 文案是否穩定
3. 之後再定義 `dashboard-data.json` 欄位結構
4. GitHub Action 自動產資料、API / MCP / Hermes proposal layer 仍放後期

## 6. Git status snapshot

完成本次修改後，預期只會看到：

- `M website/os-control-panel.html`
- `M docs-index.md`
- `?? 00-project-log/2026-05-18-os-control-panel-static-dashboard-ui-review-fixes-completed.md`
