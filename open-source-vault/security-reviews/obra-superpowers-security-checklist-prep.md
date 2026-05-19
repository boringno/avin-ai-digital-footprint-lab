# obra/superpowers｜Security Checklist Prep

## 文件目的

本文件是 Security Checklist（Rule 11）的前置準備，整理目前從公開文件中可以確認的安全相關資訊。
這不是正式的 Security Checklist 執行，而是讓 AVIN 在啟動 Rule 11 時有清楚的起點。

Document Only Review：`open-source-vault/reviews/obra-superpowers-document-only-review.md`

---

## 候選基本資訊

| 項目 | 內容 |
|---|---|
| Repo | obra/superpowers |
| URL | https://github.com/obra/superpowers |
| License | MIT |
| Stars | 197,000 |
| Forks | 17,600 |
| 版本 | v5.1.0（2026-05-04）|
| 語言 | Shell 66.4%、JavaScript 24.8% |
| Risk Level（目前）| Medium |

---

## 已從公開文件確認的安全相關資訊

### 權限與憑證

| 項目 | 狀態 | 說明 |
|---|---|---|
| API key needed | 否（目前確認）| 公開文件未提及需要 API key 或外部服務 |
| GitHub token needed | 未確認 | 公開文件未提及，但 git branch 操作可能涉及 |
| Credential / token / CI/CD | 待確認 | git branch 操作是設計核心，是否需要 token 需確認 |
| 接觸 Notion / GitHub / local repo | **是** | 隔離工作區設計以 git branch 為核心，會主動操作 git 狀態 |

### 本地與執行能力

| 項目 | 狀態 | 說明 |
|---|---|---|
| Touches local files | **是** | git branch 操作 + 工作區隔離涉及 local file system |
| Runs shell commands | **是** | Shell 佔 66.4%，是主語言，確認有 shell command 執行 |
| Code execution | 是（shell 執行）| 方法論透過 shell command 驅動 agent 執行 |
| Package install needed | 依平台 | Claude Code 走官方市場；Cursor、Codex 等有各自安裝方式 |

### 外部連線與自動化

| 項目 | 狀態 | 說明 |
|---|---|---|
| 連外部服務 | 未確認 | 公開文件未提及需要外部服務 |
| 瀏覽器存取 | 未確認 | 公開文件未提及 |
| Browser automation | 未確認 | 公開文件未提及 |

### 治理與可控性

| 項目 | 狀態 | 說明 |
|---|---|---|
| License clarity | ✓ 清楚 | MIT，條款清楚，商業使用友善 |
| Recent maintenance | ✓ 活躍 | v5.1.0 發布於 2026-05-04，仍在活躍維護 |
| Sandbox fit | 待確認 | git branch 操作範圍需確認；是否可在 test repo 中安全試用需確認 |
| Read-only test possible | 待確認 | 作為方法論框架，部分概念可純閱讀；但 Claude Code plugin 安裝後的實際影響需確認 |

---

## Security Checklist 啟動時的重點問題

以下是 Rule 11 Security Checklist 執行時應優先確認的問題：

1. **Shell 執行範圍**：Shell command 執行的實際範圍為何？是否可限制在特定目錄？
2. **Git branch 操作邊界**：安裝後會在哪些 repo 上操作 git branch？是否僅限使用者指定的 repo？
3. **Claude Code plugin 安裝影響**：透過 Claude Code 官方市場安裝後，實際會在本地產生哪些影響？安裝後是否自動啟用？
4. **工作區隔離設計**：隔離工作區（git branch）在啟動時是否需要使用者明確授權？還是自動執行？
5. **各平台安裝方式差異**：Claude Code（官方市場）vs Cursor vs Codex 的安裝方式有何不同？影響範圍是否不同？
6. **Uninstall 機制**：如何完整移除？移除後是否留下任何 git 狀態或 local file？

---

## 前置研究結論

- **整體評估**：obra/superpowers 是高能見度的方法論框架候選（197,000 stars），主體是文件而非執行邏輯，但 Shell 為主語言代表它執行時有真實的系統操作。
- **最大風險因素**：Shell 66.4% + git branch 操作是設計核心，這兩個因素疊加代表安裝後對本地 git repo 有主動影響。
- **優先確認項目**：Shell 執行範圍 → git branch 操作邊界 → Claude Code plugin 安裝後的實際影響。
- **不做**：在 Security Checklist 完成前，不安裝、不 clone、不執行任何部分。

---

## 補充說明

obra/superpowers 的特殊性在於：它以方法論框架為主要定位，因此 Document Only Review 的目的已相當完整。然而，如果 AVIN 未來考慮透過 Claude Code 官方市場安裝，那麼「plugin 安裝後的實際行為範圍」就成為 Security Checklist 的核心問題——因為官方市場安裝並不代表沒有本地影響。

---

## 下一步

| 行動 | 優先級 |
|---|---|
| 啟動 Rule 11 Security Checklist | 高 |
| 釐清 Claude Code plugin 安裝後的實際影響 | 高（與上面同步進行）|
| 繼續觀察版本更新（特別是 permission model 改善）| 持續 |

---

## Lifecycle Status

- Document Only Review：Completed（2026-05-19）
- Security Checklist Prep：Completed（2026-05-19）
- Security Checklist：Not Started
