# OS Trigger Rules and Command Library｜自動觸發條件庫與口令觸發庫

## Purpose

Notion 是 AVIN OS 的日常管理層，但 GitHub 是公開的 evidence layer。

如果觸發規則和口令庫只存在 Notion，AI 接手時只能依賴聊天紀錄。一旦對話上下文消失，Codex / Claude Code / ChatGPT / 未來的 Hermes 就不知道：

- 什麼情況該啟動哪個流程
- 什麼口令對應哪個 OS route
- 哪些任務交給 ChatGPT
- 哪些任務交給 Codex
- 哪些任務交給 Claude Code
- 哪些任務未來才交給 Hermes
- 哪些動作永遠需要 AVIN Review

本文件是 Notion 觸發規則的 GitHub 摘要，不取代 Notion 資料庫，只確保 GitHub repo 也是可信的 evidence layer。

## B. Notion Source

**OS Trigger Rules｜自動觸發條件庫**
https://www.notion.so/c2f75a4ba9ff4d859e61988e29314859

**OS Command Library｜口令觸發庫**
https://www.notion.so/b9a2fd86c3cc4c81b28eb9a9d43ec69d

角色分工：
- Notion 是日常管理層：AVIN 在 Notion 裡維護、更新、細化規則
- GitHub 是公開證據層：AI agent 接手時可讀的 structured reference
- 本文件是橋接：每當規則有重大更新，需要同步更新本文件

## C. Trigger Rule Types

### 1. Manual Command
AVIN 用口令或自然語言主動啟動流程。
目前所有觸發均為此類型。

### 2. Automatic Condition
未來由 RSS、GitHub Trending、Notion inbox、Hermes、GitHub Actions 或其他 signal 自動偵測並提案。
目前未啟用；這是未來演進目標。

### 3. Hybrid
目前先由 AVIN 手動確認啟動，未來可轉成自動偵測 + 人工審核的組合模式。

## D. Core Trigger Rules v1

### Rule 1 — New GitHub repo found

**Input signal:**
AVIN 貼 GitHub repo URL，或從 GitHub Trending / 社群看到工具。

**Route:**
AI Trend Intake → open-source-vault → Open-source Candidates

**Assigned tool:**
ChatGPT 先判斷，Codex 或 Claude Code 後續依任務類型接手。

**Allowed:**
- 初步分類
- 風險判斷
- 建議 Watch / Document Only / Practical Trial / Sandbox Test
- 建立 Notion candidate
- 需要時產生 Codex / Claude Code 任務

**Forbidden:**
- 不直接 install
- 不直接 clone
- 不直接放進 skills
- 不直接改主 repo

**Required output:**
Initial fit judgement, risk level, suggested first action, AVIN Review needed.

---

### Rule 2 — New external skill found

**Input signal:**
AVIN 發現外部 Skill、agent skill、prompt framework、tool rule、workflow method。

**Route:**
External Skill Evaluation → open-source-vault → Document Only / Comparison Note

**Assigned tool:**
ChatGPT 判斷，Codex / Claude Code 文件化或稽核。

**Forbidden:**
- 不直接整包採用
- 不直接覆蓋現有 skill
- 不直接啟用 plugin / hook / command

---

### Rule 3 — Candidate selected for Document Only

**Input signal:**
AVIN 說「先只看文件」「先做 Document Only」。

**Route:**
open-source-vault → project card → review note → docs-index → completion log

**Assigned tool:**
Codex 或 Claude Code Write Documentation Mode

**Required output:**
project card, review note, docs-index update, completion log, commit hash.

---

### Rule 4 — Candidate selected for Practical Trial

**Input signal:**
AVIN 說「這個我想實際試用」「看看能不能用」。

**Route:**
Practical Trial Lane → Security Checklist → Sandbox Plan → AVIN Approval

**Assigned tool:**
ChatGPT 先定義 trial boundary；Codex / Claude Code 只在明確授權後文件化。

**Forbidden:**
- 不直接安裝
- 不直接執行 shell
- 不直接碰主 repo
- 不直接接 API key

**Review gate:**
Approval Required — AVIN 明確批准後才能進入下一步。

---

### Rule 5 — Codex repo task requested

**Input signal:**
任務需要建立 / 修改 repo 文件、更新 docs-index、建立 completion log、commit / push。

**Route:**
Agent Tasks → Codex Task → Git Safety Check → scoped edit → commit / push

**Assigned tool:**
Codex，或 Codex 不可用時 Claude Code Write Documentation Mode（需 AVIN 明確指定）。

**Forbidden:**
- git add .
- reset --hard
- force push
- clean
- stash
- 操作 New project 2
- 操作 parent repo

---

### Rule 6 — Claude Code audit requested

**Input signal:**
需要 repo 掃描、品質檢查、read-only review、風險稽核。

**Route:**
Agent Tasks → Claude Code Read-only Audit → AVIN Review

**Assigned tool:**
Claude Code

**Allowed:**
read-only audit, summarize, recommend.

**Forbidden:**
edit, commit, push, pull, rebase, reset, clean, stash, install.

---

### Rule 7 — Published output added

**Input signal:**
LinkedIn / Threads / Website / GitHub Note / Carousel / public URL 已發布。

**Route:**
Content Pipeline → Published URL 回填 → Lifecycle Completion → Productization Layer check

**Assigned tool:**
ChatGPT 判斷，Codex 文件化。

**Required output:**
Published URL confirmed, Notion updated, lifecycle log created.

---

### Rule 8 — Workflow completed

**Input signal:**
某個 workflow / 文件 / dashboard / review 已完成並 push。

**Route:**
Project Log → docs-index → Notion update → possible Website / OS Control Panel update

**Required output:**
completion log, commit hash, next action.

---

### Rule 9 — Candidate selected for Sandbox Test

**Input signal:**
AVIN 說候選項目需要 Sandbox Test，或 Security Checklist 判定需要隔離測試。

**Route:**
open-source-vault → Security Checklist → Practical Trial Lane → Sandbox Plan → AVIN Approval

**Assigned tool:**
ChatGPT 先定義 sandbox boundary；Claude Code / Codex 只能在明確授權下文件化。

**Allowed:**
- define sandbox scope
- define sample data boundary
- define stop conditions
- define approval checkpoint

**Forbidden:**
- 不使用真實資料
- 不使用 sensitive token
- 不改主 repo
- 不在 approval 前執行 runtime adoption

**Required output:**
sandbox plan, risk boundary, stop conditions, AVIN approval checkpoint.

**Review gate:**
Approval Required

---

### Rule 10 — MCP Potential Check triggered

**Input signal:**
新工具、repo、workflow 或 service 可能成為 agent-callable capability 或 MCP candidate。

**Route:**
AI Trend Intake → open-source-vault → MCP Potential Checklist → Decision

**Assigned tool:**
ChatGPT

**Allowed:**
- evaluate MCP fit
- classify capability
- recommend Not Fit / Watch / Candidate / Reject

**Forbidden:**
- 不連接 MCP server
- 不暴露 credentials
- 不給 write permission
- 不把 MCP 當 default destination

**Required output:**
MCP potential rating, reason, risk level, suggested next action.

**Review gate:**
AVIN Review Needed

---

### Rule 11 — Security Checklist initiated

**Input signal:**
候選項目準備從 Watch / Document Only 進入 Practical Trial、Sandbox Test、local execution、API usage 或 install-like behavior。

**Route:**
open-source-vault → Security Checklist → Risk Level → Decision

**Assigned tool:**
Claude Code read-only audit 或 ChatGPT 初判

**Allowed:**
- read public docs
- inspect repo structure
- summarize risk indicators
- recommend safe next route

**Forbidden:**
- 不 install
- 不 execution
- 不使用 secrets
- 不清理 workspace
- 不改 main repo

**Required output:**
security checklist result, risk level, recommended route, stop conditions.

**Review gate:**
Approval Required

---

## E. Command Library v1

| Command Phrase | Route To | Assigned Tool | Use When | Required Output | Review Gate |
|---|---|---|---|---|---|
| 啟動開源候選評估 | AI Trend Intake → open-source-vault | ChatGPT first, then Codex/Claude Code | 發現新 GitHub repo 或工具 | fit judgement, risk level, suggested action | AVIN Review |
| 啟動 Skill 導入評估 | External Skill Evaluation → open-source-vault | ChatGPT first, then Codex/Claude Code audit | 發現外部 skill / prompt framework | evaluation note, risk flag | AVIN Review |
| 啟動 Document Only Review | open-source-vault → project card → review note | Codex or Claude Code Write Documentation Mode | 候選決定先只看文件 | project card, review note, docs-index, completion log, commit | 完成後回報即可 |
| 啟動 Practical Trial Lane | Practical Trial Lane → Security Checklist → Sandbox Plan | ChatGPT define scope, Codex/Claude Code docs only | 候選決定實際試用 | trial plan, security checklist, sandbox scope | Approval Required |
| 啟動 Codex 安全施工 | Agent Tasks → Codex Task → Git Safety Check | Codex (or Claude Code Write Documentation Mode) | 需要 repo 文件變更 / commit / push | files changed, docs-index, completion log, commit hash, git status | 指定範圍才執行 |
| 啟動 Claude Code 唯讀稽核 | Agent Tasks → Claude Code Read-only Audit | Claude Code | 需要掃描、品質檢查、風險稽核 | audit summary, recommendations | AVIN Review |
| 啟動 OS 收尾 | Project Log → docs-index → Notion | Codex or Claude Code Write Documentation Mode | 一個 workflow / 文件 / 專案完成 | completion log, commit hash, next action | 回報確認 |
| 啟動內容轉文章 | Content Pipeline → Platform Output | ChatGPT draft, Codex doc | AI signal 或 workflow 要轉成公開內容 | draft, platform format, published URL | AVIN Review before publish |
| 啟動 dashboard-data.json 規劃 | OS Control Panel → data layer planning | ChatGPT design, Codex implement | 要更新 OS Control Panel 的資料來源 | schema design, data spec, implementation plan | Approval Required |
| 啟動 Notion 管理層更新 | Notion databases → AVIN manual update | ChatGPT as guide | Notion 規則或資料需要更新 | Notion updated, summary back to GitHub if needed | AVIN 手動操作 |
| 啟動 MCP 潛力判斷：\<candidate\> | open-source-vault → MCP Potential Checklist | ChatGPT | 工具 / repo / service 可能成為 agent-callable capability 或 MCP candidate | MCP potential rating, risk level, reason, suggested next action | AVIN Review Needed |
| 啟動 Sandbox Test：\<candidate\> | Practical Trial Lane → Sandbox Plan | ChatGPT | 候選項目需要隔離測試，不能直接 practical trial | Sandbox plan, sample data boundary, stop conditions, AVIN approval checkpoint | Approval Required |

## F. Current Automation Level

目前是：
**Manual Trigger + AI Assisted Execution**

不是：
**Fully Autonomous Execution**

具體說明：
- 所有觸發都由 AVIN 主動說出口令或指示
- AI 工具依照授權範圍執行，不超出指定 scope
- 任何安裝、clone、push 都要明確授權
- 所有高風險動作都需要 AVIN Review Gate

未來可以演進成：
**Signal Detected → Proposal Created → AVIN Review → Human-approved Action**

但這是 Phase 2 / Hermes 層的目標，不是現在。

## G. Non-goals

本文件明確不做以下事項：

- 不做完全自動執行（不允許任何 agent 自主決定並執行）
- 不讓 agent 自動安裝 repo（所有 install 都需要 AVIN 手動批准）
- 不讓 agent 自動改主資料庫（Notion 主資料庫只有 AVIN 手動修改）
- 不讓 agent 自動 push（push 前必須執行安全檢查並確認 AVIN 授權）
- 不讓 Hermes 直接改 Manual OS（Hermes 目前只是 proposal layer）
- 不把 Notion 當唯一 source of truth（GitHub 也是 evidence layer，兩者需要同步）
- 不讓口令繞過 AVIN Review Gate（任何標記 Approval Required 的動作都不能跳過）
