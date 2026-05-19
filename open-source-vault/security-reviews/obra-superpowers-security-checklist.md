# obra/superpowers｜Security Checklist

## 執行資訊

- 執行日期：2026-05-19
- 執行方式：Document-only（公開文件 + Document Only Review 資料彙整）
- 不安裝、不 clone、不執行任何程式碼
- 前置文件：`open-source-vault/security-reviews/obra-superpowers-security-checklist-prep.md`
- Document Only Review：`open-source-vault/reviews/obra-superpowers-document-only-review.md`

---

## 標準記錄格式

```text
Project:                        obra/superpowers
URL:                            https://github.com/obra/superpowers
API key needed:                 No
GitHub token needed:            No（本地 git 操作不需要；遠端 push 走標準 git credential，非工具本身）
Touches local files:            Yes（git branch 操作 + 工作區隔離，scope 限於 active git repo 目錄）
Runs shell commands:            Yes（Shell 66.4%，是主語言，確認有 shell command 執行）
External service access:        No（公開文件未提及任何外部服務或 API 連線）
Browser access:                 No（公開文件未提及）
Package install needed:         依平台（Claude Code：官方市場；Cursor/Codex：各自安裝方式）
License clarity:                MIT，條款清楚，商業使用友善
Recent maintenance:             Active（v5.1.0，2026-05-04）
Touches Notion / GitHub / local repo: Local repo（git branch 操作）；Notion：否；GitHub remote：僅當使用者明確 push 時
Sandbox fit:                    Yes（可隔離於專用 test repo，git branch 可刪除，不影響主 repo）
Read-only test possible:        Partial（README/文件可只讀；主動使用需 git write 操作，但可限制在 test repo）
Credential / token / CI/CD involvement: No（無 credential 處理，無 CI/CD 鉤子）
Browser automation involved:    No
Code execution involved:        Yes（shell command 執行，scope 限於 active git repo 工作目錄）
Risk level:                     Medium（維持 Document Only Review 評估）
Notes:                          見下方詳細分析
```

---

## 逐項分析

### 1. API key / GitHub token

**API key**：公開文件明確確認不需要。obra/superpowers 是純本地工具，無需呼叫任何外部 API。

**GitHub token**：工具本身不需要 GitHub token。它操作的是本地 git repo（`git branch`、`git worktree` 等標準 git 命令）。若使用者在 test repo 操作後選擇 push 到 remote，則走的是標準 git credential 機制，與工具本身無關。

→ **結論**：憑證風險低。

### 2. Local file / Shell / Code execution

**Shell 執行**：Shell 佔 66.4% 是主語言，確認有真實 shell command 執行。關鍵觀察：Shell command 的執行 scope 受限於 active git repo 的工作目錄。它不是系統層級的廣域 shell，而是 git repo 範圍內的操作。

**Local file 讀寫**：確認有，核心機制是 `git branch` 和 `git worktree`，這些操作在本地 `.git` 目錄中寫入，不觸及其他路徑。

**Scope 可控性**：✓ 可控。Practical Trial 使用專用 test repo 即可有效隔離。

→ **結論**：有 shell 執行和 local file 寫入，但 scope 可確定且可沙箱化。

### 3. 外部連線 / 瀏覽器 / Browser automation

公開文件中無任何外部服務、瀏覽器存取或 browser automation 的提及。obra/superpowers 的設計是本地 coding agent 工作流，不依賴外部服務。

→ **結論**：無外部連線風險。

### 4. 安裝方式評估

| 平台 | 安裝方式 | 安全評估 |
|---|---|---|
| Claude Code | 官方市場（plugin）| 最低風險，走 Anthropic 官方管道 |
| Cursor | 各自安裝方式 | 需在 Security Checklist 後另行確認 |
| Codex | 各自安裝方式 | 需在 Security Checklist 後另行確認 |

→ **Practical Trial 建議路徑**：Claude Code 官方市場安裝（最低風險入口）。

### 5. Notion / GitHub / CI/CD 觸及評估

- **Notion**：無觸及。
- **GitHub（API）**：無觸及。本地 git 操作 ≠ GitHub API 呼叫。
- **CI/CD**：無觸及。公開文件無任何 CI/CD 鉤子或 webhook 提及。
- **avin-ai-digital-footprint-lab（主 repo）**：不應觸及。Practical Trial 必須在專用 test repo 進行。

→ **結論**：無 Notion/GitHub API/CI/CD 風險。

### 6. License / Maintenance

- MIT License：條款清楚，衍生使用友善，商業使用無限制。
- v5.1.0（2026-05-04）：活躍維護，版本號穩定（v5.x），不是實驗性早期版本。
- 197,000 stars / 17,600 forks：業界能見度極高，供應鏈風險極低（不是孤立小工具）。

→ **結論**：License 和維護狀態均佳，無治理疑慮。

---

## Risk Level 最終判定

**Medium**（維持 Document Only Review 評估，本次 Security Checklist 確認無升級）

理由：
- Shell 執行和 local file 寫入確認存在，但 scope 限於 active git repo，可沙箱化 ✓
- 無 API key、無 GitHub token、無 CI/CD、無外部服務、無瀏覽器存取 ✓
- MIT license，活躍維護，197,000 stars 供應鏈風險低 ✓
- 可在 test repo 做 Practical Trial，不觸及主 repo ✓

**不升至 High 的理由**：High 的典型條件（高權限 token、廣域 local file access、執行方式不透明、未知 package）在 obra/superpowers 均不成立。Shell 執行範圍可確定、git scope 可控、MIT license 清楚、Anthropic 官方市場提供安全安裝路徑。

---

## Practical Trial 前置條件（通過 Security Checklist 後）

若 AVIN 決定進入 Practical Trial，以下條件必須全部滿足：

1. **專用 test repo**：使用一個與 `avin-ai-digital-footprint-lab` 和 `New project 2` 完全隔離的 throwaway test repo，專為此次試用建立。
2. **安裝方式**：優先透過 Claude Code 官方市場安裝（plugin 形式），不走非官方渠道。
3. **觀察 git 狀態**：安裝後立即檢查 `git status` 和 `git branch -a`，記錄 baseline，再執行任何操作前確認無未預期變更。
4. **範圍限制**：所有 git branch 操作僅在 test repo 內進行，不影響任何真實工作 repo。
5. **uninstall 驗證**：試用結束後確認完整移除（plugin 停用），驗證無殘留 git 狀態或 local file。
6. **完整紀錄**：每一步操作都記錄於 Practical Trial Log（路徑：`open-source-vault/practical-trial-lane.md` 的規則框架下）。

---

## Security Checklist 決定

- **Risk Level（最終）**：Medium
- **通過 Security Checklist**：✓ 是
- **建議下一步**：Ready for Practical Trial（滿足上述 6 個前置條件後可啟動）
- **Practical Trial 入口**：Claude Code 官方市場 plugin 安裝 + 專用 test repo

---

## Lifecycle Status

- Document Only Review：Completed（2026-05-19）
- Security Checklist Prep：Completed（2026-05-19）
- Security Checklist：**Completed（2026-05-19）**
- Practical Trial：Not Started（Ready）
