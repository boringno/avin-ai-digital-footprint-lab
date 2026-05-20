# Agent Task Spec Template 完成紀錄 | 2026-05-19

## 1. 任務背景

obra/superpowers Workflow Experiment 完成後，AVIN 觸發本任務：

**口令：** 「建立 Claude Code / Codex 共用 Task Spec Template」

**任務目標：** 將已 localize 進 AVIN OS 的 Rule 12（Design Approval Gate）與 Section H（Task Spec Format），整理成一份可重複使用的任務交辦模板。

本任務為 **Rule 12 的第一次正式試跑**：
- Rule 12 Design Approval Gate 完整套用
- Phase 1（設計核准）→ AVIN 核准 → Phase 2（執行）流程全程走完

Claude Code 以 Write Documentation Mode 執行。

## 2. Rule 12 執行紀錄

| 步驟 | 執行狀態 |
|---|---|
| Agent 提交設計方案（Phase 1） | ✓ 完成 |
| 設計摘要包含 10 項必要資訊 | ✓ 完成 |
| 未修改任何文件即等待核准 | ✓ 確認 |
| AVIN 明確回覆「核准」 | ✓ 確認 |
| 核准後才開始執行（Phase 2） | ✓ 確認 |

## 3. 已完成事項

| 項目 | 狀態 | 說明 |
|---|---|---|
| `04-workflows/templates/agent-task-spec-template.md` | ✓ 建立 | 主模板，含 Rule 12 嵌入 + Section H + 3 個範例 |
| `docs-index.md` | ✓ 更新 | 新增 2 個條目 |
| 本文件（completion log） | ✓ 建立 | |
| Commit & Push | ✓ 完成 | 見 Section 5 |

## 4. 模板文件概覽

**路徑：** `04-workflows/templates/agent-task-spec-template.md`

**包含章節：**
- Purpose / When to Use / How to Use
- Rule 12 嵌入摘要（觸發條件、設計摘要格式、核准流程）
- Section H Task Spec Format
- 任務交辦單（可複製區塊）
- Allowed Actions by Mode（3 個 Mode）
- Forbidden Actions（通用）
- Stop Conditions（9 項）
- Safety Check（6 道指令）
- Staging / Commit / Push Rules
- Final Report Format（10 點）
- Example A：Claude Code Read-only Audit
- Example B：Claude Code Write Documentation Mode
- Example C：Codex Repo Edit Task

## 5. Git 狀態

```
Commit: docs: add agent task spec template for claude code and codex

新增文件：
A  04-workflows/templates/agent-task-spec-template.md
A  00-project-log/2026-05-19-agent-task-spec-template-completed.md

修改文件：
M  docs-index.md
```

## 6. 不修改確認

| 文件 | 狀態 |
|---|---|
| `00-meta/os-trigger-rules-and-command-library.md` | 未修改 ✓ |
| `04-workflows/agent-tool-fallback-and-task-routing-workflow.md` | 未修改 ✓ |
| `open-source-vault/` 所有文件 | 未修改 ✓ |
| `website/`、`docs/` | 未修改 ✓ |
| New project 2 | 未觸碰 ✓ |

## 7. 禁止事項確認

- 沒有安裝任何套件
- 沒有 clone repo
- 沒有執行任何程式碼
- 沒有接 API / MCP
- 沒有操作 Notion
- 沒有操作 New project 2
- 沒有使用 git add .
- 沒有 force push
