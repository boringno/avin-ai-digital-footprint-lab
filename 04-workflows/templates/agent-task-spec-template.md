# Agent Task Spec Template｜Claude Code / Codex 任務交辦模板

Date: 2026-05-19
Type: Workflow Template / Agent Governance
Status: Active
Source: obra/superpowers Workflow Experiment Localize（Rule 12 + Section H）

---

## Purpose｜用途

當 AVIN 要派任務給 Claude Code 或 Codex 時，複製本模板填寫。

**核心目的：**
- 在執行前確認設計範圍（Rule 12 — Design Approval Gate）
- 讓每份任務有明確的「目標 → 輸出 → 驗證條件」格式（Section H — Task Spec Format）
- 整合安全檢查、禁止事項、停止條件、收尾規則為單一可複製文件
- 防止 AI 一收到任務就直接施工

---

## When to Use This Template｜何時使用

**必須使用：**
- 需要建立 3 個以上新文件
- 需要修改現有 Trigger Rule / Command Library
- 需要制定新 Rule
- 不確定任務範圍時的保守選擇

**可以不用（標準流程已覆蓋）：**
- 單一 completion log 建立
- 單一 Document Only Review（已有口令觸發）
- 已明確指定範圍的小型更新

---

## How to Use｜使用方式

```
Step 1：AVIN 複製下方「任務交辦單」區塊，填寫任務內容
Step 2：把填寫後的交辦單發給 Claude Code / Codex
Step 3：AI agent 依 Rule 12 提交設計方案，等待 AVIN 核准
Step 4：AVIN 回覆「核准」後，agent 才能開始執行
Step 5：完成後 agent 依「Final Report Format」回報
```

---

## Rule 12｜Design Approval Gate（嵌入摘要）

任務規模達到觸發條件時，agent **在執行前必須先提交設計摘要並等待核准**。

**觸發條件（任一成立即觸發）：**
- 需要建立 3 個以上新文件
- 需要修改現有 Trigger Rule / Command Library
- 需要制定新 Rule
- 需要大範圍重構 OS 文件結構

**設計摘要格式（agent 提交）：**
```
1. 任務目標（一句話）
2. 預計建立/修改的文件清單
3. 影響範圍（哪些現有文件或 Rule 受影響）
4. 風險點（如有）
5. 明確不會修改哪些文件
6. 風險等級
7. 停止條件
```

**核准流程：**
- Agent 提交設計摘要後，**等待 AVIN 明確說「核准」「繼續」「OK」**
- 核准前：不修改任何文件、不 staging、不 commit、不 push
- Plan mode 已核准的任務（ExitPlanMode）等同 AVIN 核准，不需要重複確認

**完整 Rule 說明位置：**
`00-meta/os-trigger-rules-and-command-library.md` — Rule 12（第 295 行起）

---

## Section H｜Task Spec Format（任務交辦規格）

每個子任務使用以下三段格式：

```
File:         [目標文件路徑（完整相對路徑）]
Output:       [完整預期輸出摘要（標題、核心內容、字數估計）]
Verification: [如何確認完成（文件存在 ✓、關鍵欄位存在 ✓、docs-index 更新 ✓）]
```

**完整 Section H 說明位置：**
`00-meta/os-trigger-rules-and-command-library.md` — Section H（第 384 行起）

---

## ═══════════════════════════════════════
## 任務交辦單（可複製區塊）
## ═══════════════════════════════════════

```
# 任務名稱
[填寫]

# 任務目標（一句話）
[填寫]

# Assigned Tool
Claude Code Write Documentation Mode
（或：Claude Code Read-only Audit / Codex Repo Edit）

# 禁止事項
不要：
- git add .
- reset --hard / force push / clean / stash
- 安裝套件 / clone repo / 接 API / 接 MCP
- 啟動 Hermes / 操作 Notion / 操作 New project 2
- 修改 website / 修改未指定文件

# Task Spec（每個子任務填一組）

Task 1:
  File:         [路徑]
  Output:       [預期輸出]
  Verification: [如何確認完成]

Task 2:
  File:         [路徑]
  Output:       [預期輸出]
  Verification: [如何確認完成]

（依需要增加）

# 影響範圍
[哪些現有文件或 Rule 受影響]

# 明確不修改
[列出不會動到的文件或目錄]

# 預計 Commit Message
[填寫]

# Phase 1｜請先輸出設計方案，等待核准後再執行
```

---

## Guarded Long Task Fields

Use this block when the task is expected to continue across multiple approved steps without asking AVIN to approve every small action.

This block does not replace `Rule 12`.

- `Rule 12` governs design first, approval second, execution third.
- `Guarded Long Task Fields` govern how an already approved task may continue safely.
- The agent may continue within approved scope.
- The agent may not expand scope on its own.
- If any stop condition is triggered, the agent must stop and report.

### Suggested values

- `Task Mode`
  - `read_only_long_task`
  - `documentation_long_task`
  - `guarded_execution_task`
- `Platform Compatibility Required`
  - `yes`
  - `no`
  - `not_enough_evidence`
- `Push Policy`
  - `approval_required`
  - `not_applicable`
- `Rebase / Merge Policy`
  - `approval_required`
  - `forbidden`
  - `not_applicable`
- `Encoding Safety Check`
  - `required`
  - `not_required`

### Template block

```text
## Guarded Long Task Fields

Task Mode:
[read_only_long_task / documentation_long_task / guarded_execution_task]

Scope Boundary:
[approved files, folders, and explicit exclusions]

Allowed Actions:
- [action]
- [action]

Forbidden Actions:
- [action]
- [action]

Universal Stop Conditions:
- worktree dirty
- remote ahead / behind / diverged
- rebase required
- merge conflict
- docs-index.md diff larger than expected
- docs-index.md contains BOM / Chinese mojibake / encoding pollution
- unapproved file changes appear
- unapproved folder creation is required
- prohibited scope must be touched
- install / clone / run script becomes necessary
- API key / secrets become necessary
- Notion / MCP / Hermes / external API access becomes necessary
- platform compatibility is unclear
- task goal drifts outside approved scope
- wrong repo / New project 2 / parent repo path detected
- force push / reset / clean / stash would be needed
- any git action is no longer clearly safe under the original approval

Report Cadence:
- after safety check
- after read-only inventory
- before file edits
- after file edits
- after diff review
- before commit
- after commit
- before push
- immediately when a stop condition appears

Git Safety Rules:
- never use git add .
- stage only explicitly approved paths
- check origin/main...main before push
- remote ahead means no direct push
- diverged history means no direct pull
- rebase or merge requires separate approval
- force push is forbidden unless AVIN explicitly approves a single use

docs-index Safety Rules:
- minimal update only
- no generator rerun unless separately approved
- no large section reorder
- check BOM
- check Chinese mojibake or encoding pollution
- stop and report if diff exceeds expectation

Platform Compatibility Required:
[yes / no / not_enough_evidence]

Continue Automatically When:
- approved scope is unchanged
- target files remain within approved boundary
- no universal stop condition is triggered
- git state remains safe
- platform compatibility is irrelevant or already understood

Ask AVIN When:
- a new file outside approved scope is needed
- a new folder is needed
- docs-index.md diff becomes unexpectedly large
- git divergence appears
- rebase or merge becomes necessary
- commit is ready
- push is ready
- platform compatibility is unclear
- install / clone / script execution / secrets / external system access becomes necessary
- the task objective itself appears to be changing

Commit Policy:
[state whether commit is allowed, and what must be checked first]

Push Policy:
[approval_required / not_applicable]

Rebase / Merge Policy:
[approval_required / forbidden / not_applicable]

Encoding Safety Check:
[required / not_required]
```

## Allowed Actions by Mode｜依模式的允許動作

### Read-only Audit Mode（Claude Code 預設）
- 讀取 repo 文件、掃描目錄結構、讀取 git log / diff
- 生成品質報告、提出改進建議
- **禁止**：建立或修改任何文件、git 操作、安裝套件

### Write Documentation Mode（Codex 預設；Claude Code 可替補）
- 建立或修改指定範圍內的 Markdown 文件
- 更新 docs-index.md、建立 completion log
- 執行 git add（只限指定文件）、git commit、git push（push 前必須確認安全）
- **禁止**：git add .、修改範圍外的文件、安裝套件、接 API/MCP

### Codex Repo Edit Mode（Codex 專用）
- Write Documentation Mode 的所有 allowed 項目
- 修改靜態前端文件（HTML / CSS / JS，限 website/ 和 docs/）
- 依明確授權修改 config 文件
- **禁止**：自行判斷修改超出 scope 的文件、安裝套件、執行 shell script

---

## Forbidden Actions｜通用禁止事項

以下動作在所有 mode 下均禁止：

```bash
git add .            # 禁止 mass staging
git reset --hard     # 禁止強制重置
git push --force     # 禁止強制推送
git clean            # 禁止清理
git stash            # 禁止暫存
```

以及：
- 安裝任何套件（npm / pip / brew / plugin）
- Clone 任何 repo
- 接 API / MCP
- 啟動 Hermes
- 操作 Notion（Notion 只有 AVIN 手動操作）
- 操作 New project 2 或 parent repo
- 修改 website/ 或 docs/ 下的 HTML（除非明確進入 Repo Edit Mode）

---

## Stop Conditions｜停止條件

遇到以下任一情況，**立即停止並回報，不繼續執行**：

| 條件 | 說明 |
|---|---|
| Wrong repo | pwd 不在授權的 repo 路徑 |
| Dirty worktree | git status --short 不是空白 |
| Untracked files outside task scope | 發現非任務範圍的未追蹤文件 |
| main...origin/main not safe | rev-list 顯示不安全狀態 |
| Conflict outside expected file | merge conflict 發生在非預期文件 |
| Task asks for install / clone without approval | 沒有 AVIN 明確批准就要求安裝或 clone |
| New project 2 path detected | 任何操作涉及 New project 2 |
| Parent repo detected | 任何操作涉及 parent repo |
| Unclear source of truth | 不清楚哪個版本是最新的 |

**停止時的回報格式：**
```
STOP: [stop condition]
Current state: [git status output]
Reason: [why this is a stop condition]
Recommended action: [what AVIN should do next]
```

---

## Safety Check｜安全檢查

每次 repo 任務前先執行，並回報結果：

```bash
pwd
git branch --show-current
git remote -v
git status --short
git rev-list --left-right --count main...origin/main
git log --oneline -5
```

**判斷標準：**
- `pwd` → 必須在正確的 repo 路徑
- `git branch` → 必須是 `main`
- `git remote -v` → 必須是授權的 remote URL
- `git status --short` → 必須是空白（clean worktree）
- `git rev-list` → 必須顯示安全狀態（通常是 `0	0`）

---

## Staging / Commit / Push Rules｜精確 staging 規則

```bash
# 只 staging 指定文件（禁止 git add .）
git add [file-1]
git add [file-2]
git add [file-3]

# Commit（附 Co-Authored-By）
git commit -m "$(cat <<'EOF'
[commit message]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

# Push 前 fetch，確認是否有 bot divergence
git fetch origin
git show origin/main --stat | head -8

# 若只有 docs-index.md 被 bot 修改 → rebase 解決
git rebase origin/main
# 解決 conflict → git add docs-index.md
# GIT_EDITOR=true git rebase --continue
# git push

# 若無 bot divergence → 直接 push
git push
```

---

## Final Report Format｜收尾回報格式

任務完成後，agent 依序回報：

```
1. Initial repo state     — 任務開始前的 git status、branch、remote
2. Files changed          — 新增 / 修改的文件清單
3. Non-task changes       — 是否有非任務範圍的變更
4. docs-index updated     — docs-index.md 是否已更新（是 / 否）
5. completion log created — completion log 是否已建立（是 / 否）
6. commit hash            — 此次 commit 的 hash
7. push status            — push 是否成功
8. final git status       — 最終的 git status --short
9. final rev-list         — 最終的 origin/main...main
10. next recommendation   — 建議的下一步行動
```

---

## Examples｜範例

---

### Example A：Claude Code Read-only Audit

```
# 任務名稱
docs-index 品質稽核

# 任務目標（一句話）
掃描 docs-index.md，確認所有條目的文件路徑是否實際存在。

# Assigned Tool
Claude Code Read-only Audit

# Task Spec

Task 1:
  File:         docs-index.md
  Output:       列出所有條目與對應路徑，標記「存在 ✓」或「缺失 ✗」
  Verification: 稽核報告存在，所有路徑均已核對

# 明確不修改
所有文件（read-only，不建立、不修改、不 commit）

# Commit Message
（無，此為 read-only 任務）
```

---

### Example B：Claude Code Write Documentation Mode

```
# 任務名稱
新增 rohitg00/agentmemory Security Checklist

# 任務目標（一句話）
完成 rohitg00/agentmemory 的 Security Checklist，更新 project card，建立 completion log。

# Assigned Tool
Claude Code Write Documentation Mode

# Task Spec

Task 1:
  File:         open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist.md
  Output:       完整 Security Checklist，含 Risk Level、10 項檢查項目、決策與下一步，約 400 字
  Verification: 文件存在 ✓ / Risk Level 欄位填寫 ✓ / Decision 欄位填寫 ✓

Task 2:
  File:         open-source-vault/projects/rohitg00-agentmemory.md
  Output:       Lifecycle Status 更新為 Security Checklist Completed
  Verification: Lifecycle Status 包含「Security Checklist Completed」✓

Task 3:
  File:         00-project-log/2026-05-19-rohitg00-agentmemory-security-checklist-completed.md
  Output:       completion log，含任務背景、已完成事項、git snapshot，約 300 字
  Verification: 文件存在 ✓ / git snapshot 欄位填寫 ✓

Task 4:
  File:         docs-index.md
  Output:       新增 Task 1–3 對應的三個條目
  Verification: grep 確認三個條目存在 ✓

# 影響範圍
docs-index.md（修改）
rohitg00-agentmemory.md（修改）

# 明確不修改
os-trigger-rules-and-command-library.md
agent-tool-fallback-and-task-routing-workflow.md
website/、docs/、New project 2

# 預計 Commit Message
docs: rohitg00 agentmemory security checklist completed
```

---

### Example C：Codex Repo Edit Task

```
# 任務名稱
OS Control Panel dashboard-data.json 欄位更新

# 任務目標（一句話）
在 dashboard-data.json 中新增 open-source-vault 的現況欄位，並同步更新 OS Control Panel。

# Assigned Tool
Codex Repo Edit Mode

# Task Spec

Task 1:
  File:         docs/dashboard-data.json（或對應路徑）
  Output:       新增 open_source_vault 物件，含 candidate_count、status、last_updated 欄位
  Verification: JSON 格式有效 ✓ / 新欄位存在 ✓

Task 2:
  File:         docs/index.html（或 OS Control Panel 對應文件）
  Output:       新增顯示 open-source-vault 狀態的 UI 區塊
  Verification: 頁面在 browser 中顯示新欄位 ✓

# 影響範圍
docs/（Repo Edit Mode）

# 明確不修改
00-meta/、04-workflows/、open-source-vault/、New project 2

# 預計 Commit Message
feat: add open-source-vault status to os control panel
```

---

*來源：obra/superpowers Workflow Experiment Localize — AVIN OS 2026-05-19*
*Rule 12 — Design Approval Gate：`00-meta/os-trigger-rules-and-command-library.md` 第 295 行*
*Section H — Task Spec Format：`00-meta/os-trigger-rules-and-command-library.md` 第 384 行*
