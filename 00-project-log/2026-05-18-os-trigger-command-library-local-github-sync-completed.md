# OS Trigger Rules & Command Library｜本地 GitHub 同步完成紀錄 | 2026-05-18

## 1. 任務背景

AVIN 在 Notion 建立了兩個新的管理資料庫：

- **OS Trigger Rules｜自動觸發條件庫**（https://www.notion.so/c2f75a4ba9ff4d859e61988e29314859）
- **OS Command Library｜口令觸發庫**（https://www.notion.so/b9a2fd86c3cc4c81b28eb9a9d43ec69d）

同時 Codex 算力暫時用完，由 Claude Code 以 Write Documentation Mode 替補執行本次 repo 任務。

## 2. 為什麼 Notion 觸發條件與口令庫也需要同步到 GitHub

Notion 是日常管理層：AVIN 在 Notion 維護細節、更新規則、追蹤狀態。

但 GitHub 是公開的 evidence layer：

- AI agent 接手時（ChatGPT / Codex / Claude Code / 未來 Hermes），不能只依賴聊天紀錄
- 如果觸發規則和口令庫只在 Notion，AI 接手時就沒有 structured reference
- GitHub 文件讓 AI 知道什麼情況觸發哪個流程、什麼口令對應哪個 route、哪些動作永遠需要 AVIN Review

本次同步讓 GitHub repo 也成為可信的 source，不讓 Notion 成為唯一入口。

## 3. 本次新增文件

| 文件路徑 | 用途 |
|---|---|
| `00-meta/os-trigger-rules-and-command-library.md` | OS 觸發條件庫與口令庫的 GitHub 摘要 |
| `04-workflows/agent-tool-fallback-and-task-routing-workflow.md` | 工具替補與任務路由規則 |
| `00-project-log/2026-05-18-os-trigger-command-library-local-github-sync-completed.md` | 本次任務完成紀錄 |

修改文件：

| 文件路徑 | 變更 |
|---|---|
| `docs-index.md` | 新增上述三份文件的條目 |

## 4. 與 Notion 管理層的關係

- Notion 是主管理層：AVIN 在 Notion 持續維護細節規則
- GitHub 是公開摘要層：AI 接手時的 structured reference
- 本文件不取代 Notion，只確保 GitHub repo 有可讀的觸發邏輯

當 Notion 規則有重大更新，需要同步更新 `00-meta/os-trigger-rules-and-command-library.md`。

## 5. 與 Codex / Claude Code 替補規則的關係

本次任務同時建立了工具替補的正式文件：

`04-workflows/agent-tool-fallback-and-task-routing-workflow.md`

這份文件定義：
- Codex 不可用時，Claude Code 如何安全替補
- 四種 Operating Mode（Read-only / Write Documentation / Repo Edit / High-risk）
- 哪些任務交給哪個工具
- 每次 repo 任務的 Standard Safety Check
- 何時必須停止並回報（Stop Conditions）
- 任務完成後的 Handoff Report Format

## 6. 不做事項

- 沒有操作 Notion（Notion 是 AVIN 手動維護）
- 沒有安裝任何套件
- 沒有 clone 任何 repo
- 沒有接任何 API / MCP
- 沒有啟動 Hermes
- 沒有操作 New project 2
- 沒有操作 parent repo
- 沒有使用 git add .
- 沒有 force push
- 沒有修改非任務範圍的文件

## 7. 下一步建議

1. 每次 Notion 觸發條件有重大更新，同步更新 `00-meta/os-trigger-rules-and-command-library.md`
2. 每次新增口令或調整路由，更新 Command Library v1 表格
3. 當 Hermes 從 proposal layer 升級到 execution layer，更新 `04-workflows/agent-tool-fallback-and-task-routing-workflow.md` 的 Tool Roles 與 Fallback Rules
4. 可考慮在 OS Control Panel 加入 Trigger Rules / Command Library 的快速入口連結

## 8. Git status snapshot

```text
初始狀態（任務開始前）：
git status --short → (empty — clean)
git rev-list --left-right --count main...origin/main → 0	0

任務完成後新增文件：
A  00-meta/os-trigger-rules-and-command-library.md
A  04-workflows/agent-tool-fallback-and-task-routing-workflow.md
A  00-project-log/2026-05-18-os-trigger-command-library-local-github-sync-completed.md
M  docs-index.md

Commit message: docs: sync OS trigger and command library to GitHub
```
