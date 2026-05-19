# Open Source Vault Agent Skills Batch Review 完成紀錄 | 2026-05-19

## 1. 任務背景

本批次任務在 2026-05-19 執行，接續以下已完成工作：

- rohitg00/agentmemory Document Only Review（2026-05-19 前段）
- obra/superpowers Document Only Review（2026-05-19 前段）

本批次新增：tech-leads-club/agent-skills Document Only Review + 三向 Comparison Note + Security Checklist Prep（2 個）+ 狀態快照 + 完成紀錄。

Claude Code 以 Write Documentation Mode 執行。不安裝、不 clone、不執行任何程式碼。

## 2. 本次 Document Only Review：tech-leads-club/agent-skills

| 項目 | 內容 |
|---|---|
| Repo | tech-leads-club/agent-skills |
| URL | https://github.com/tech-leads-club/agent-skills |
| License | MIT（software）+ CC-BY-4.0（content）|
| Stars | 4,100 |
| Forks | 357 |
| 版本 | skills-catalog-v0.14.3（2026-04-28）|
| 語言 | TypeScript 68.1%、Python 22.7% |
| MCP 整合 | 是（3 工具：list_skills, search_skills, read_skill）|
| Risk Level | Medium |
| Decision | Watch / Document Only Completed |

**定位確認**：企業安全稽核等級的 agent skills 市集（Snyk + human review + static analysis），與 mattpocock/skills（個人 minimal）和 obra/superpowers（方法論框架）形成三角對比。

## 3. Security Checklist Prep 完成

| 候選 | Prep 文件 | 主要 Security 問題 |
|---|---|---|
| rohitg00/agentmemory | `security-reviews/rohitg00-agentmemory-security-checklist-prep.md` | SQLite 路徑、12 個 hook 捕獲範圍、MCP write permission |
| obra/superpowers | `security-reviews/obra-superpowers-security-checklist-prep.md` | Shell 執行範圍、git branch 操作邊界、Claude Code plugin 安裝影響 |

## 4. 三向 Comparison Note 完成

`open-source-vault/reviews/agent-skills-comparison-note.md`

三個候選的核心對比結論：

| 模式 | 代表 | 核心定位 |
|---|---|---|
| 個人 Minimal | mattpocock/skills | 個人用、快速、無治理 |
| 企業安全治理 | tech-leads-club/agent-skills | 安全稽核、MCP 整合、多 agent 支援 |
| 方法論框架 | obra/superpowers | 告訴 agent 怎麼做事（不是 skills 本身）|

MCP Potential：tech-leads-club/agent-skills 是三個候選中唯一有明確 MCP server 的 Candidate。

## 5. 本次新增文件清單

| 操作 | 文件路徑 |
|---|---|
| 新增 | `open-source-vault/projects/tech-leads-club-agent-skills.md` |
| 新增 | `open-source-vault/reviews/tech-leads-club-agent-skills-document-only-review.md` |
| 新增 | `open-source-vault/reviews/agent-skills-comparison-note.md` |
| 新增 | `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist-prep.md` |
| 新增 | `open-source-vault/security-reviews/obra-superpowers-security-checklist-prep.md` |
| 新增 | `open-source-vault/status/open-source-vault-current-status-2026-05-19.md` |
| 新增 | `00-project-log/2026-05-19-open-source-vault-agent-skills-batch-review-completed.md` |
| 修改 | `docs-index.md`（新增所有條目）|

注意：`open-source-vault/security-reviews/` 和 `open-source-vault/status/` 為本批次首次建立的新目錄。

## 6. 不做事項

- 沒有安裝任何套件
- 沒有 clone repo
- 沒有執行任何程式碼
- 沒有接 API / MCP
- 沒有操作 Notion
- 沒有操作 New project 2
- 沒有使用 git add .

## 7. 下一步建議

1. **啟動 Security Checklist：obra/superpowers**（Rule 11，shell 執行邊界 + git branch 操作邊界，最優先）
2. **啟動 Security Checklist：rohitg00/agentmemory**（Rule 11，SQLite 路徑 + hook 範圍 + MCP write permission）
3. **tech-leads-club/agent-skills MCP Potential Checklist**（Rule 10，逐條評估 12 項，判斷是否確認為 MCP Candidate）
4. **Content material**：obra/superpowers（197,000 stars 的 agent workflow 框架）是高優先度 AI signal 文章素材

## 8. Git status snapshot

```text
本批次任務完成後新增文件：
A  open-source-vault/projects/tech-leads-club-agent-skills.md
A  open-source-vault/reviews/tech-leads-club-agent-skills-document-only-review.md
A  open-source-vault/reviews/agent-skills-comparison-note.md
A  open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist-prep.md
A  open-source-vault/security-reviews/obra-superpowers-security-checklist-prep.md
A  open-source-vault/status/open-source-vault-current-status-2026-05-19.md
A  00-project-log/2026-05-19-open-source-vault-agent-skills-batch-review-completed.md
M  docs-index.md

Commit message: docs: add open-source vault agent skills batch review
```
