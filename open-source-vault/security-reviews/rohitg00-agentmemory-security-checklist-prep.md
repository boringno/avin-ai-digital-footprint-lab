# rohitg00/agentmemory｜Security Checklist Prep

## 文件目的

本文件是 Security Checklist（Rule 11）的前置準備，整理目前從公開文件中可以確認的安全相關資訊。
這不是正式的 Security Checklist 執行，而是讓 AVIN 在啟動 Rule 11 時有清楚的起點。

Document Only Review：`open-source-vault/reviews/rohitg00-agentmemory-document-only-review.md`

---

## 候選基本資訊

| 項目 | 內容 |
|---|---|
| Repo | rohitg00/agentmemory |
| URL | https://github.com/rohitg00/agentmemory |
| License | Apache-2.0 |
| Stars | 13,100 |
| Forks | 1,100 |
| 版本 | v0.9.20（2026-05-18）|
| 語言 | TypeScript 81.4% |
| Risk Level（目前）| Medium-High |

---

## 已從公開文件確認的安全相關資訊

### 權限與憑證

| 項目 | 狀態 | 說明 |
|---|---|---|
| API key needed | 可選 | 預設使用本地模型（all-MiniLM-L6-v2），不需要 API key；若要使用雲端嵌入（Gemini、OpenAI、Voyage AI）才需要 key |
| GitHub token needed | 未確認 | 公開文件未提及，需 Security Checklist 確認 |
| Credential / token / CI/CD | 未確認 | 公開文件未提及，需確認 |
| 接觸 Notion / GitHub / local repo | 需確認 | 主動 hook 捕獲行為涉及工具使用記錄，範圍需確認 |

### 本地與執行能力

| 項目 | 狀態 | 說明 |
|---|---|---|
| Touches local files | **是** | SQLite 資料庫存放在本地，確認有本地 file 讀寫 |
| Runs shell commands | 未確認 | 公開文件未明確提及 shell command，需確認 |
| Code execution | 是（生命周期鉤子）| 12 個生命周期鉤子可自動捕獲工具使用、文件存取與結果 |
| Package install needed | 是 | `npm install -g` 或 `npx`，屬 global install |

### 外部連線與自動化

| 項目 | 狀態 | 說明 |
|---|---|---|
| 連外部服務 | 可選 | 預設不需要；選用雲端嵌入時才連外 |
| 瀏覽器存取 | 未確認 | 公開文件未提及 |
| Browser automation | 未確認 | 公開文件未提及 |

### 治理與可控性

| 項目 | 狀態 | 說明 |
|---|---|---|
| License clarity | ✓ 清楚 | Apache-2.0，商業使用友善 |
| Recent maintenance | ✓ 活躍 | v0.9.20 發布於 2026-05-18（昨天）|
| Sandbox fit | 待確認 | SQLite 存放路徑可控性需確認；hook 範圍需確認 |
| Read-only test possible | 待確認 | 12 個生命周期鉤子為主動捕獲，不確定是否可停用 |

---

## Security Checklist 啟動時的重點問題

以下是 Rule 11 Security Checklist 執行時應優先確認的問題：

1. **SQLite 存放路徑**：SQLite 資料庫放在哪裡？路徑是否可配置？是否會寫入主 repo 目錄？
2. **生命周期鉤子範圍**：12 個 hook 的實際捕獲範圍為何？是否可選擇性停用？會捕獲哪些 file access？
3. **MCP 工具 permission**：53 個 MCP 工具中，有哪些具有 write permission？write 範圍是否可限制？
4. **npm global install 影響**：global install 後會修改哪些系統路徑？是否有 `npx` 替代方式可限制範圍？
5. **雲端嵌入觸發條件**：在什麼條件下會連外？是否有明確的開關？
6. **主動捕獲 vs 被動查詢**：工具是否預設為主動捕獲模式？是否有只讀模式？
7. **Sandbox 可行性**：能否在隔離目錄（非主 repo）中做有限測試？

---

## 前置研究結論

- **整體評估**：rohitg00/agentmemory 是高相關性候選（Hermes Agent Track、MCP Potential），但 Medium-High risk 代表需要謹慎進行 Security Checklist。
- **最大風險因素**：12 個生命周期鉤子的主動捕獲行為，這比一般 memory helper 更主動，需要確認是否可控。
- **優先確認項目**：SQLite 路徑 → hook 捕獲範圍 → MCP write permission。
- **不做**：在 Security Checklist 完成前，不安裝、不 clone、不執行任何部分。

---

## 下一步

| 行動 | 優先級 |
|---|---|
| 啟動 Rule 11 Security Checklist | 高 |
| 用 MCP Potential Checklist 12 項逐條評估 | 中（可在 Security Checklist 後進行）|
| 繼續觀察版本更新（特別是 permission model 改善）| 持續 |

---

## Lifecycle Status

- Document Only Review：Completed（2026-05-19）
- Security Checklist Prep：Completed（2026-05-19）
- Security Checklist：Not Started
