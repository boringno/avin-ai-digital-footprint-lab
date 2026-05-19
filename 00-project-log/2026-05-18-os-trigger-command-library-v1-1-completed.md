# OS Trigger Rules & Command Library v1.1｜GitHub 同步完成紀錄 | 2026-05-18

## 1. 任務背景

Claude Code 完成 read-only inventory audit 後，發現 Notion Trigger Rules v1 與 repo 現況大致符合，但有幾條 repo 已存在的完整文件在 Notion 沒有對應的獨立 Trigger Rule。

AVIN 根據 audit 建議，在 Notion 補上 v1.1，本次任務將 v1.1 同步到 GitHub 的 `00-meta/os-trigger-rules-and-command-library.md`。

## 2. Claude Code read-only inventory audit 發現的缺口

| 缺口類型 | 說明 | 對應 repo 文件 |
|---|---|---|
| Sandbox Test 沒有獨立 Trigger | Practical Trial 和 Sandbox Test 是不同 risk level 的 track，但 Notion 只有 Rule 4（Practical Trial），Sandbox Test 被合併進去 | practical-trial-lane.md + security-checklist.md |
| MCP Potential Check 沒有獨立 Trigger | mcp-potential-checklist.md 完整存在 12 項清單，但 Notion 完全沒有對應 Trigger Rule | mcp-potential-checklist.md |
| Security Checklist 沒有獨立 Trigger | security-checklist.md 定義了完整的 4 Risk Level 判斷，但 Notion 只是把它當作 open-source-vault 流程中的隱含步驟，不是獨立可觸發的 Rule | security-checklist.md |

## 3. Notion v1.1 已補的項目

**OS Trigger Rules 新增：**
- Rule 9 — Candidate selected for Sandbox Test
- Rule 10 — MCP Potential Check triggered
- Rule 11 — Security Checklist initiated

**OS Command Library 新增：**
- 啟動 MCP 潛力判斷：\<candidate\>
- 啟動 Sandbox Test：\<candidate\>

## 4. 本次同步到 GitHub 的內容

修改文件：

| 文件路徑 | 變更 |
|---|---|
| `00-meta/os-trigger-rules-and-command-library.md` | 新增 Rule 9 / 10 / 11（Sandbox Test / MCP Potential Check / Security Checklist）；Command Library 表格新增 2 條口令 |
| `docs-index.md` | 新增本 completion log 條目 |

新增文件：

| 文件路徑 | 用途 |
|---|---|
| `00-project-log/2026-05-18-os-trigger-command-library-v1-1-completed.md` | 本次任務完成紀錄 |

## 5. 不做事項

- 沒有建立新 workflow 文件
- 沒有改動前端
- 沒有接 API / MCP / Hermes
- 沒有操作 Notion（由 AVIN 手動維護）
- 沒有操作 New project 2
- 沒有使用 git add .
- 沒有 force push
- 沒有修改指定範圍外的文件

## 6. 下一步建議

1. 可以開始測試第一條口令：**啟動 Document Only Review**，對象建議為 `rohitg00-agentmemory`（已有 project card）
2. 口令 9（`啟動 dashboard-data.json 規劃`）建議先建立 `dashboard-data.json` 文件後再啟用
3. 口令 10（`啟動 Notion 管理層更新`）建議補充觸發條件定義，讓 scope 更明確
4. 未來 Notion 規則有重大更新時，記得同步更新 `00-meta/os-trigger-rules-and-command-library.md`

## 7. Git status snapshot

```text
初始狀態（任務開始前）：
git status --short → (empty — clean)
git rev-list --left-right --count main...origin/main → 0	0

任務完成後變更文件：
M  00-meta/os-trigger-rules-and-command-library.md
A  00-project-log/2026-05-18-os-trigger-command-library-v1-1-completed.md
M  docs-index.md

Commit message: docs: update OS trigger command library v1.1
```
