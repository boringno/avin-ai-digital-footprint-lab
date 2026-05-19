# Open Source Vault｜現況快照 | 2026-05-19

## 快照日期

- 2026-05-19

## 候選項目總覽

| 候選 | Lifecycle Status | Risk Level | MCP Potential | Document Only | Security Checklist |
|---|---|---|---|---|---|
| mattpocock/skills | Document Only Completed | Medium | Watch | ✓ 完成 | 未啟動 |
| rohitg00/agentmemory | Document Only Completed | Medium-High | Watch / Candidate | ✓ 完成 | 未啟動（Prep 完成）|
| obra/superpowers | Document Only Completed | Medium | Watch | ✓ 完成 | 未啟動（Prep 完成）|
| tech-leads-club/agent-skills | Document Only Completed | Medium | Candidate | ✓ 完成 | 未啟動 |

## 各候選下一步

| 候選 | 建議下一步 | 優先度 |
|---|---|---|
| obra/superpowers | 啟動 Security Checklist（shell 執行邊界 + git branch 操作）| 高 |
| rohitg00/agentmemory | 啟動 Security Checklist（SQLite 路徑 + hook 範圍 + MCP write permission）| 高 |
| tech-leads-club/agent-skills | 啟動 Security Checklist（npm global install + cache 路徑）+ MCP Potential Checklist | 中 |
| mattpocock/skills | 啟動 Security Checklist（npx 安裝範圍）| 中 |

## 文件現況

### 候選項目卡（projects/）

- `open-source-vault/projects/mattpocock-skills.md` ✓
- `open-source-vault/projects/rohitg00-agentmemory.md` ✓
- `open-source-vault/projects/obra-superpowers.md` ✓
- `open-source-vault/projects/tech-leads-club-agent-skills.md` ✓（2026-05-19 新增）

### Document Only Reviews（reviews/）

- `open-source-vault/reviews/mattpocock-skills-document-only-review.md` ✓
- `open-source-vault/reviews/rohitg00-agentmemory-document-only-review.md` ✓
- `open-source-vault/reviews/obra-superpowers-document-only-review.md` ✓
- `open-source-vault/reviews/tech-leads-club-agent-skills-document-only-review.md` ✓（2026-05-19 新增）
- `open-source-vault/reviews/agent-skills-comparison-note.md` ✓（2026-05-19 新增）

### Security Checklist Preps（security-reviews/）

- `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist-prep.md` ✓（2026-05-19 新增）
- `open-source-vault/security-reviews/obra-superpowers-security-checklist-prep.md` ✓（2026-05-19 新增）

### 治理基礎文件

- `open-source-vault/README.md` ✓
- `open-source-vault/security-checklist.md` ✓
- `open-source-vault/workflow.md` ✓
- `open-source-vault/mcp-potential-checklist.md` ✓
- `open-source-vault/practical-trial-lane.md` ✓
- `open-source-vault/project-template.md` ✓

## 已觸發的 OS Trigger Rules

| Rule | 說明 | 觸發紀錄 |
|---|---|---|
| Rule 11 | Security Checklist initiated（Prep 完成）| rohitg00/agentmemory、obra/superpowers |
| Rule 10 | MCP Potential Check | tech-leads-club/agent-skills 列為 Candidate |
| Rule 9 | Sandbox Test | 尚未觸發（待 Security Checklist 後）|

## Candidate Batch 狀態

| Batch | 日期 | 狀態 |
|---|---|---|
| GitHub AI Capability Candidate Batch 2026-05-18 | 2026-05-18 | 所有候選已完成 Document Only Review；Security Checklist 尚未啟動 |

## 觀察重點（2026-05-19 當下）

1. **MCP 整合密度分化**：rohitg00/agentmemory（53 工具）vs tech-leads-club/agent-skills（3 工具）vs obra/superpowers（無）——三種不同的 MCP 整合策略正在業界並行發展。
2. **Security Checklist 是下一個關鍵門檻**：4 個候選都已通過 Document Only，下一步都需要 Security Checklist 才能進入任何形式的 trial。
3. **obra/superpowers 的方法論意義**：197,000 stars 代表業界對「structured agent execution」的強烈共識，AVIN 應深入理解它在說什麼，無論最終是否導入。
