# open-source-vault Agent Skills / Memory Review Closure Note｜2026-05-19

## 批次範圍

- **批次名稱：** GitHub AI Capability Candidate Batch 2026-05-18（Agent Skills & Memory Tools）
- **執行期間：** 2026-05-18 ~ 2026-05-19
- **候選數量：** 4 個
- **觸發原因：** GitHub Trending + AI signal batch intake，4 個候選同批評估
- **執行工具：** Claude Code Write Documentation Mode（AVIN 審核 + AI 文件化）

---

## 候選現況總覽

| 候選 | 類型 | Lifecycle 最終狀態 | Risk Level | MCP Potential |
|---|---|---|---|---|
| mattpocock/skills | Agent Skills 集合（個人維護）| Document Only Completed | Medium | Watch |
| rohitg00/agentmemory | Agent Memory 系統 | Security Checklist Completed | Medium-High | Watch / Candidate |
| obra/superpowers | Agent Workflow 方法論 | **Workflow Experiment Completed** | Medium | N/A |
| tech-leads-club/agent-skills | Agent Skills 市集（企業治理）| Document Only Completed | Medium | Candidate |

---

## 任務成果彙整

### mattpocock/skills

| 任務 | 狀態 | 文件 |
|---|---|---|
| Document Only Review | ✓ Completed（2026-05-18） | `open-source-vault/reviews/mattpocock-skills-document-only-review.md` |
| Security Checklist | 未啟動 | — |

---

### rohitg00/agentmemory

| 任務 | 狀態 | 文件 |
|---|---|---|
| Document Only Review | ✓ Completed（2026-05-19） | `open-source-vault/reviews/rohitg00-agentmemory-document-only-review.md` |
| Security Checklist Prep | ✓ Completed（2026-05-19） | `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist-prep.md` |
| Security Checklist（Rule 11）| ✓ Completed（2026-05-19） | `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist.md` |
| Practical Trial | 暫緩（5 項阻礙）| — |

**Security Checklist 結論：** Risk Level Medium-High。主要風險：12 個 lifecycle hooks 主動捕獲（High）+ 53 個 MCP tools write scope 不明（Medium-High）。Practical Trial 需先確認 hooks disable / SQLite 路徑隔離 / MCP write scope / memory delete-export / credential 讀取行為。

---

### obra/superpowers

| 任務 | 狀態 | 文件 |
|---|---|---|
| Document Only Review | ✓ Completed（2026-05-19） | `open-source-vault/reviews/obra-superpowers-document-only-review.md` |
| Security Checklist Prep | ✓ Completed（2026-05-19） | `open-source-vault/security-reviews/obra-superpowers-security-checklist-prep.md` |
| Security Checklist（Rule 11）| ✓ Completed（2026-05-19） | `open-source-vault/security-reviews/obra-superpowers-security-checklist.md` |
| Practical Trial Phase 1 | ✓ Completed（2026-05-19，install blocked）| `open-source-vault/practical-trials/obra-superpowers-practical-trial.md` |
| Practical Trial Phase 2（Manual Methodology Trial）| ✓ Completed（2026-05-19）| `open-source-vault/practical-trials/obra-superpowers-manual-methodology-trial.md` |
| Workflow Experiment（Rule 12 + Task Spec Format Localize）| ✓ Completed（2026-05-19）| — |

**Workflow Experiment 結論：** obra/superpowers 方法論中的 Design Approval Checkpoint 與 Task Spec Format 正式 localize 進 AVIN OS，成為 Rule 12 與 Section H。

---

### tech-leads-club/agent-skills

| 任務 | 狀態 | 文件 |
|---|---|---|
| Document Only Review | ✓ Completed（2026-05-19） | `open-source-vault/reviews/tech-leads-club-agent-skills-document-only-review.md` |
| Comparison Note | ✓ Completed（2026-05-19） | `open-source-vault/reviews/agent-skills-comparison-note.md` |
| Security Checklist | 未啟動 | — |
| MCP Potential Check | 未完整執行（初判 Candidate）| — |

---

## OS 層級 Meta-Outcome

本批次最重要的非預期成果：obra/superpowers 的 Workflow Experiment 產生了兩項 OS 層級的永久性文件更新。

### Rule 12 — Design Approval Gate

- **加入位置：** `00-meta/os-trigger-rules-and-command-library.md` Rule 12（Section D）
- **觸發條件：** 需要建立 3 個以上新文件 / 修改現有 Rule / 制定新 Rule / 大範圍重構
- **效果：** 正式化 AVIN OS 中已隱性存在的「設計核准優先於執行」原則

### Section H — Task Spec Format

- **加入位置：** `00-meta/os-trigger-rules-and-command-library.md` Section H
- **格式：** `File / Output / Verification` 三段標準規格
- **效果：** 讓任務交辦的完成條件從隱性變顯性，提供 Two-stage Review 的基礎

### Agent Task Spec Template

- **路徑：** `04-workflows/templates/agent-task-spec-template.md`
- **內容：** 整合 Rule 12 + Section H + Safety Check + Allowed/Forbidden + Stop Conditions + Final Report Format + 3 個 Example
- **效果：** AVIN 未來派長任務給 Claude Code / Codex 的可複製起點

### Rule 12 首次正式試跑

- **任務：** 建立 agent-task-spec-template.md（Rule 12 第一次正式試跑）
- **結果：** Phase 1 設計 → AVIN 核准 → Phase 2 執行，流程完整驗證

---

## 本批次建立的完整文件清單

### Project Cards（projects/）

- `open-source-vault/projects/mattpocock-skills.md`
- `open-source-vault/projects/rohitg00-agentmemory.md`
- `open-source-vault/projects/obra-superpowers.md`
- `open-source-vault/projects/tech-leads-club-agent-skills.md`

### Reviews（reviews/）

- `open-source-vault/reviews/mattpocock-skills-document-only-review.md`
- `open-source-vault/reviews/rohitg00-agentmemory-document-only-review.md`
- `open-source-vault/reviews/obra-superpowers-document-only-review.md`
- `open-source-vault/reviews/tech-leads-club-agent-skills-document-only-review.md`
- `open-source-vault/reviews/agent-skills-comparison-note.md`

### Security Reviews（security-reviews/）

- `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist-prep.md`
- `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist.md`
- `open-source-vault/security-reviews/obra-superpowers-security-checklist-prep.md`
- `open-source-vault/security-reviews/obra-superpowers-security-checklist.md`

### Practical Trials（practical-trials/）

- `open-source-vault/practical-trials/obra-superpowers-practical-trial.md`
- `open-source-vault/practical-trials/obra-superpowers-manual-methodology-trial.md`

### Status Snapshots（status/）

- `open-source-vault/status/open-source-vault-current-status-2026-05-19.md`
- `open-source-vault/status/open-source-vault-agent-skills-memory-batch-closure-2026-05-19.md`（本文件）

### OS 文件（修改）

- `00-meta/os-trigger-rules-and-command-library.md`（新增 Rule 12 + Section H + Command Library row）

### Workflow Templates（新增）

- `04-workflows/templates/agent-task-spec-template.md`

### Project Logs（00-project-log/）

- `00-project-log/2026-05-19-obra-superpowers-document-only-review-completed.md`
- `00-project-log/2026-05-19-rohitg00-agentmemory-document-only-review-completed.md`
- `00-project-log/2026-05-19-open-source-vault-agent-skills-batch-review-completed.md`
- `00-project-log/2026-05-19-obra-superpowers-security-checklist-completed.md`
- `00-project-log/2026-05-19-obra-superpowers-practical-trial-phase-1-completed.md`
- `00-project-log/2026-05-19-obra-superpowers-manual-methodology-trial-completed.md`
- `00-project-log/2026-05-19-obra-superpowers-workflow-experiment-completed.md`
- `00-project-log/2026-05-19-agent-task-spec-template-completed.md`
- `00-project-log/2026-05-19-rohitg00-agentmemory-security-checklist-completed.md`
- `00-project-log/2026-05-19-open-source-vault-agent-skills-memory-batch-closure.md`

---

## 待處理事項

### 高優先度

| 候選 | 待處理 | 說明 |
|---|---|---|
| tech-leads-club/agent-skills | Security Checklist | npm global install 邊界、cache 路徑可控性、MCP tool permission |
| mattpocock/skills | Security Checklist | npx 安裝範圍、skill 執行行為 |

### 中優先度

| 候選 | 待處理 | 說明 |
|---|---|---|
| tech-leads-club/agent-skills | MCP Potential Check（完整）| 3 個 MCP tools 的 13 項逐條確認 |
| rohitg00/agentmemory | 觀察下一版本 | hooks disable / SQLite 路徑 / MCP write scope 是否在新版確認 |

### 暫緩

| 候選 | 狀態 | 說明 |
|---|---|---|
| rohitg00/agentmemory Practical Trial | 暫緩 | 5 項阻礙未解決：hooks disable / SQLite 路徑 / MCP write scope / memory delete-export / credential 讀取行為 |

---

## 建議下一批次優先順序

1. **tech-leads-club/agent-skills Security Checklist**（高）— MCP Candidate 狀態最需要確認邊界
2. **mattpocock/skills Security Checklist**（中）— 範圍較小，npx 執行邊界是主要問題
3. **rohitg00/agentmemory 繼續觀察**（持續）— 等待版本更新後重評 Practical Trial 可行性
4. **obra/superpowers Content Material**（可選）— agent workflow 方法論適合作為 AI signal 文章素材

---

## Batch 治理完整性確認

| 治理項目 | 狀態 |
|---|---|
| 所有候選有 project card | ✓ |
| 所有候選有 Document Only Review | ✓ |
| Comparison Note 建立 | ✓（3-way comparison）|
| Security Checklist 執行的候選均有 prep | ✓ |
| 所有任務有 completion log | ✓ |
| docs-index 同步更新 | ✓ |
| OS Trigger Rules 同步更新 | ✓（Rule 12 + Section H）|
| Rule 12 首次正式試跑記錄 | ✓ |
