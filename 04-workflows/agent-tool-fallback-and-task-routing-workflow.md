# Agent Tool Fallback and Task Routing Workflow｜工具替補與任務路由規則

Date: 2026-05-18
Type: Workflow / Agent Governance
Status: Active

---

## 1. Purpose

定義 Codex / Claude Code / ChatGPT / Hermes Future 的任務分工與替補規則。

當 Codex 算力不足、Claude Code 可用，或反過來 Claude Code 不可用時，這份文件定義如何安全替補，不讓 AI 工具自行決定越權執行。

任何工具的邊界都是：

- 做被授權的事
- 不做沒被明確授權的事
- 遇到不確定就停下回報

---

## 2. Tool Roles

### ChatGPT
- Strategy 策略判斷
- AVIN perspective 角度分析
- Prompt design 提示詞設計
- Task routing 任務分配決策
- Notion management reasoning Notion 管理層推理
- 適合：問題釐清、框架設計、方向確認

### Codex
- Repo editing repo 文件建立與修改
- docs-index update docs-index 維護
- Static frontend 靜態前端更新
- Completion log 完成紀錄建立
- Commit / push 版本控制操作
- 適合：有明確 scope 的 repo 任務

### Claude Code
- Read-only audit 唯讀稽核
- Repo scan repo 結構掃描
- Quality review 文件品質檢查
- Risk review 風險評估
- **臨時替補：** 當 AVIN 明確授權且 scope 明確時，可以執行 Write Documentation Mode

### Hermes Future（未來層）
- Proposal layer：提案，不直接執行
- 目前不在 active execution scope
- 不直接操作 repo、不直接改 Notion、不直接 push

---

## 3. Operating Modes

### Mode 1 — Read-only Audit Mode

**Allowed:**
- 讀取 repo 文件
- 掃描目錄結構
- 讀取 git log / diff
- 生成品質報告
- 提出改進建議

**Forbidden:**
- 建立或修改任何文件
- 執行 git add / commit / push
- 安裝任何套件
- 操作外部 API

**Default tool:** Claude Code

---

### Mode 2 — Write Documentation Mode

**Allowed:**
- 建立或修改指定範圍內的 Markdown 文件
- 更新 docs-index.md
- 建立 completion log
- 執行 git add（只限指定文件）
- 執行 git commit / push（push 前必須確認安全）

**Forbidden:**
- git add .（禁止 mass staging）
- 修改指定範圍外的文件
- 安裝套件
- 接 API / MCP
- 啟動 Hermes
- 操作 New project 2 或 parent repo

**Trigger requirement:**
AVIN 必須明確說「Write Documentation Mode」或「替補 Codex」，並指定文件 scope。

**Default tool:** Codex（Codex 不可用時 Claude Code 可替補）

---

### Mode 3 — Repo Edit Mode

**Allowed:**
- Write Documentation Mode 的所有 allowed 項目
- 修改靜態前端文件（HTML / CSS / JS，限 website/ 和 docs/）
- 依照明確授權修改 config 文件

**Forbidden:**
- 自行判斷並修改超出 scope 的文件
- 安裝 npm / pip / brew 或其他套件管理工具
- 執行 shell script
- 操作 New project 2 或 parent repo

**Trigger requirement:**
AVIN 明確指定要修改的文件和允許的操作範圍。

**Default tool:** Codex

---

### Mode 4 — High-risk Execution Mode

**定義：** 需要安裝、clone、執行 shell、接 API、操作外部服務的任務。

**Trigger requirement:**
AVIN 必須明確、逐步批准每一個高風險動作。

**Default tool:** 無預設工具 — 必須在 AVIN 明確批准後才決定。

**重要：** Codex 和 Claude Code 都不能在沒有 AVIN 授權的情況下自動進入 High-risk Execution Mode。

---

## 4. Fallback Rules

### Codex 不可用時

Claude Code 可以替補文件型 repo 任務，條件：
1. AVIN 明確說「Claude Code 替補」或「Write Documentation Mode」
2. AVIN 明確指定允許的文件 scope
3. Claude Code 替補不能自動升級到 Repo Edit Mode 或 High-risk Execution Mode

### Claude Code 不可用時

Codex 繼續執行原定任務，不需要特別替補聲明。

### 兩者都不可用時

停止，由 ChatGPT 協助 AVIN 人工執行或等待工具恢復。

### 安全底線（任何工具都適用）

- 沒有授權時不安裝
- 沒有授權時不 clone
- 沒有授權時不清理 / reset / force push
- 任何工具只要遇到 dirty worktree 或 origin/main...main 不安全，都必須停止回報

---

## 5. Trigger Routing

| 任務類型 | 優先工具 | 替補工具 | 備注 |
|---|---|---|---|
| Strategy / judgement | ChatGPT | — | 不需要 repo 操作 |
| Repo file change | Codex | Claude Code (Write Documentation Mode) | 需 AVIN 授權 scope |
| Read-only QA | Claude Code | — | 唯讀不需要替補 |
| Open-source candidate judgement | ChatGPT | — | 先判斷再決定後續 |
| Project card creation | Codex | Claude Code (Write Documentation Mode) | 限文件 scope |
| Install / trial | 不允許 | 不允許 | 必須等 AVIN Approval |
| Completion log creation | Codex | Claude Code (Write Documentation Mode) | 限 00-project-log/ |
| docs-index update | Codex | Claude Code (Write Documentation Mode) | 限 docs-index.md |
| Push to GitHub | Codex | Claude Code (Write Documentation Mode) | 必須先執行安全檢查 |
| Notion management | ChatGPT guide, AVIN manual | — | Notion 只有 AVIN 手動操作 |

---

## 6. Standard Safety Check

每次 repo 任務前都要執行以下檢查，並回報結果：

```bash
pwd
git branch --show-current
git remote -v
git status --short
git rev-list --left-right --count main...origin/main
git log --oneline -5
```

判斷標準：
- `pwd` 必須在正確的 repo 路徑
- `git branch` 必須是 `main`
- `git remote -v` 必須是授權的 remote URL
- `git status --short` 必須是空白（clean worktree）
- `git rev-list` 必須顯示安全狀態（通常是 `0	0`）

**禁止執行的 git 操作：**
```bash
git add .            # 禁止 mass staging
git reset --hard     # 禁止強制重置
git push --force     # 禁止強制推送
git clean            # 禁止清理
git stash            # 禁止暫存
```

---

## 7. Stop Conditions

遇到以下任何情況，必須立即停止並回報，不繼續執行：

- Wrong repo：pwd 不在授權的 repo 路徑
- Dirty worktree：git status --short 不是空白
- Untracked files outside task scope：發現非任務範圍的未追蹤文件
- main...origin/main not safe：rev-list 顯示不安全狀態
- Conflict outside expected file：merge conflict 發生在非預期文件
- Task asks for install / clone without approval：沒有 AVIN 明確批准就要求安裝或 clone
- New project 2 path detected：任何操作涉及 New project 2
- Parent repo detected：任何操作涉及 parent repo
- Unclear source of truth：不清楚哪個版本是最新的

停止時的回報格式：
```
STOP: [stop condition]
Current state: [git status output]
Reason: [why this is a stop condition]
Recommended action: [what AVIN should do next]
```

---

## 8. Handoff Report Format

每次 repo 任務完成後，工具應依序回報：

1. **Initial repo state** — 任務開始前的 git status、branch、remote
2. **Files changed** — 新增 / 修改 / 刪除的文件清單
3. **Whether non-task changes existed** — 是否有非任務範圍的變更
4. **docs-index updated or not** — docs-index.md 是否已更新
5. **completion log created or not** — completion log 是否已建立
6. **commit hash** — 此次 commit 的 hash
7. **push status** — push 是否成功
8. **final git status** — 最終的 git status --short
9. **final origin/main...main** — 最終的 rev-list 狀態
10. **next recommendation** — 建議的下一步行動

---

## What This Avoids

- 工具自行判斷並執行超出 scope 的操作
- Codex / Claude Code 在沒有授權下進入 High-risk Execution Mode
- mass staging（git add .）導致意外提交非任務文件
- force push 覆蓋 origin/main 的歷史
- 在 dirty worktree 上執行任務導致不可預期的變更
- 工具靜默替補而不通知 AVIN
