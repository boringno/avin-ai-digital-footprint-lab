# obra/superpowers Manual Methodology Trial 完成紀錄 | 2026-05-19

## 1. 任務背景

obra/superpowers Practical Trial Phase 2 的替代路線。

原定 Phase 2 為安裝 plugin（`/plugin install superpowers@claude-plugins-official`），但此指令在目前 Claude Code 環境中返回 `/plugin isn't available in this environment`，安裝路線 blocked。

AVIN 決策：不找 workaround，改走 Manual Methodology Trial 替代路線，從方法論層面進行深度分析，並產出可供 AVIN OS Localize 參考的具體建議。

Claude Code 以 Write Documentation Mode 執行。

## 2. 已完成事項

| 項目 | 狀態 | 說明 |
|---|---|---|
| 安裝路線確認 blocked | ✓ 完成 | `/plugin` 指令在此環境不可用，不找 workaround |
| 公開文件研究 | ✓ 完成 | 從 GitHub 公開文件提取 6 步驟工作流 |
| Test repo 模擬執行 | ✓ 完成 | 6 步驟全部模擬，commit `7e9eaff` |
| AVIN OS 重疊分析 | ✓ 完成 | 6 項機制比對，重疊程度評估 |
| Localize 建議 | ✓ 完成 | 4 可採用 + 4 不建議採用 |
| Manual Trial 結果文件 | ✓ 完成 | `open-source-vault/practical-trials/obra-superpowers-manual-methodology-trial.md` |

## 3. Test Repo 狀態（任務完成確認）

| 項目 | 狀態 |
|---|---|
| 路徑 | `C:\Users\user\Desktop\superpowers-trial` |
| Branch | master |
| 最新 Commit | `7e9eaff trial: obra/superpowers manual methodology simulation completed` |
| 模擬文件 | `superpowers-methodology-test.md`（6 步驟完整模擬） |
| Remote | 無（純本地，throwaway） |

## 4. 分析結論摘要

### 可 Localize 的 4 項機制

1. **Task Spec Format**（任務規格格式）：「檔案路徑 + 完整輸出 + 驗證條件」→ 可加入 OS Trigger Rules 任務交辦規格
2. **Two-Stage Review Gate**（兩階段審查）：「Spec compliance → Quality check」→ 可加入 Write Documentation Mode 審查步驟
3. **Design Approval Checkpoint**（Rule 12 候選）：設計核准 gate 形式化 → 可升格為明確 Rule 12
4. **Finish-Task Decision**（任務收尾決策）：「commit / keep / discard」明確決策點 → 可加入任務完成 checklist

### 不建議採用的 4 項機制

1. **TDD（RED-GREEN-REFACTOR）**：coding-specific，無法套用於文件任務
2. **Git Worktree per task**：單文件任務 overhead 過高
3. **Automated Subagent Loops**：Hermes 目前只在 proposal layer
4. **2–5 Minute Task Granularity**：粒度不符 AVIN 的文件任務規模

## 5. Trial Decision

- **Decision**：Document / Localize selected elements
- **Risk**：無安裝，無執行，無 side effects
- **Overall Assessment**：obra/superpowers 作為方法論框架有實際參考價值。設計哲學（design gate、task spec、two-stage review）值得借用；TDD 和 worktree 是 coding-specific，不適用。

## 6. Lifecycle Status 更新

- Practical Trial Phase 1：Completed（test repo 建立，install route blocked）
- Practical Trial Phase 2（Manual Methodology Trial）：**Completed（2026-05-19）**
- 下一步（若決定 Localize）：Workflow Experiment（將 Rule 12 / Task Spec Format 正式整合入 OS）

## 7. 主要輸出文件

- Manual Trial 結果：`open-source-vault/practical-trials/obra-superpowers-manual-methodology-trial.md`
- Test Repo 模擬文件：`C:\Users\user\Desktop\superpowers-trial\superpowers-methodology-test.md`（本地，無 remote）

## 8. 禁止事項確認

- 沒有安裝任何套件
- 沒有 clone repo
- 沒有執行任何程式碼
- 沒有接 API / MCP
- 沒有操作 Notion
- 沒有操作 New project 2
- 沒有使用 git add .
- 沒有 force push

## 9. Git Snapshot（預計）

```
Commit: docs: add obra superpowers manual methodology trial

新增文件：
A  open-source-vault/practical-trials/obra-superpowers-manual-methodology-trial.md
A  00-project-log/2026-05-19-obra-superpowers-manual-methodology-trial-completed.md

修改文件：
M  docs-index.md
```
