# Agent Skills Comparison Note｜mattpocock vs tech-leads-club vs obra

## 1. 文件目的

這份 Comparison Note 比較三個已完成 Document Only Review 的候選項目：

- `mattpocock/skills`（個人維護的 skill 集合）
- `tech-leads-club/agent-skills`（企業安全稽核等級的 skills 市集）
- `obra/superpowers`（AI coding agent 工作流方法論框架）

目標是讓 AVIN 對「agent skills 生態的三種典型模式」有清楚的對比視角，作為後續 Security Checklist 優先順序、Content material 方向與 Hermes Agent Track 設計參考的依據。

---

## 2. 三個候選基本資訊對比

| 項目 | mattpocock/skills | tech-leads-club/agent-skills | obra/superpowers |
|---|---|---|---|
| URL | github.com/mattpocock/skills | github.com/tech-leads-club/agent-skills | github.com/obra/superpowers |
| Stars | 未記錄（候選批次）| 4,100 | 197,000 |
| License | MIT | MIT + CC-BY-4.0 | MIT |
| 主語言 | 未確認 | TypeScript 68.1% | Shell 66.4% |
| 版本 / 維護 | 活躍 | skills-catalog-v0.14.3 | v5.1.0 |
| Risk Level | Medium | Medium | Medium |
| MCP 整合 | 無明確 MCP server | 是（3 工具）| 無明確 MCP server |
| Install 方式 | npx | npm global 或 npx | 依平台（Claude Code 官方市場等）|
| Local cache | 未確認 | `~/.cache/agent-skills/` | 未確認 |
| API key 需求 | 無 | 無（base）| 無（目前確認）|

---

## 3. 用途類型對比（最核心差異）

### mattpocock/skills：個人 skill 集合（Minimal）

- **本質**：個人維護的 skills 和 workflow 集合，面向 coding 場景
- **設計哲學**：Minimal、直接、為個人使用優化
- **安全治理**：無正式治理流程，文件成熟度較低
- **對 AVIN 的意義**：理解「個人如何組織 agent skills」的參考；風險在於缺乏安全稽核

### tech-leads-club/agent-skills：企業安全稽核 Skills 市集

- **本質**：有治理結構的 agent skills 市集，面向企業 / 多 agent 環境
- **設計哲學**：Security-first，有完整稽核流程（Snyk + human review + static analysis）
- **MCP 整合**：明確提供 MCP server（list_skills, search_skills, read_skill）
- **對 AVIN 的意義**：理解「企業如何對 agent skills 建立安全治理」的參考；MCP server 設計值得深入研究

### obra/superpowers：AI Coding Agent 工作流方法論框架

- **本質**：完整的工作流方法論，不是 skills 集合，而是告訴 agent「如何做事」
- **設計哲學**：Structured execution（設計精化 → 隔離工作區 → 任務拆解 → 子 agent 執行 → TDD → Code Review）
- **平台整合**：支援 Claude Code、Cursor、Codex、Gemini CLI 等
- **對 AVIN 的意義**：理解「structured agent execution 的業界現況」；Hermes Agent Track 設計的方法論參考

---

## 4. 安全層面對比

| 安全維度 | mattpocock/skills | tech-leads-club/agent-skills | obra/superpowers |
|---|---|---|---|
| 安全稽核機制 | 無 | Snyk + human review + static analysis | 無正式稽核 |
| Shell 執行 | 未確認 | 低（TypeScript 主語言）| **高**（Shell 66.4%）|
| Local file 讀寫 | 未確認 | Cache 寫入（`~/.cache/`）| Git branch 操作 |
| Git 操作 | 未確認 | 未確認 | **是**（設計核心）|
| MCP tool write | 未確認 | 需確認（3 tools）| 無明確 MCP |
| Risk Level | Medium | Medium | Medium |
| Security Checklist 優先度 | 中 | 中 | **高**（Shell + git 操作）|

---

## 5. MCP 整合對比

| MCP 維度 | mattpocock/skills | tech-leads-club/agent-skills | obra/superpowers |
|---|---|---|---|
| 明確 MCP server | 無 | **是（3 工具）** | 無 |
| MCP 工具清單 | — | list_skills, search_skills, read_skill | — |
| MCP Potential | Watch | **Candidate** | Watch |
| 適合 MCP Potential Checklist | 低 | **高（下一步）** | 低 |

→ 在 MCP 整合層面，tech-leads-club/agent-skills 是三個候選中最具體的 MCP Candidate。

---

## 6. AVIN 相關性排序（依架構層）

### Hermes Agent Track

1. **obra/superpowers**：方法論最直接對應 Hermes 的任務拆解、子 agent 分工、隔離執行邊界問題
2. **tech-leads-club/agent-skills**：MCP server 設計對 Hermes 未來的 skill 調用架構有參考價值
3. **mattpocock/skills**：設計比較 minimal，對 Hermes 的直接參考價值相對有限

### MCP Potential

1. **tech-leads-club/agent-skills**：唯一有明確 MCP server 的候選，應優先進行 MCP Potential Checklist
2. **obra/superpowers**：有平台整合模式，值得觀察是否發展出 MCP server
3. **mattpocock/skills**：目前無 MCP 信號

### Content Pipeline

1. **obra/superpowers**：197,000 stars，是業界最高能見度的候選，content 潛力最高
2. **tech-leads-club/agent-skills**：企業安全稽核 + MCP 整合的組合是好的 AI signal 角度
3. **mattpocock/skills**：個人維護 minimal 設計，適合作為對比素材

---

## 7. 後續行動建議

### Security Checklist 優先順序

1. **obra/superpowers**（最優先）：Shell 66.4% + git branch 操作是三個候選中 security scope 最明確需要確認的
2. **rohitg00/agentmemory**（同優先）：Medium-High risk，12 個生命周期鉤子需要確認 hook 範圍
3. **tech-leads-club/agent-skills**：Medium risk，npm global install + cache 路徑需確認
4. **mattpocock/skills**：Medium risk，npx 安裝方式，security scope 相對清楚

### Content material 建議

- 「Agent skills 生態的三種模式：個人 minimal（mattpocock）、企業安全治理（tech-leads-club）、方法論框架（obra）」——這是清楚的 AI signal 文章框架
- 可以先寫 obra/superpowers（最高 stars），再寫 tech-leads-club/agent-skills（MCP 角度）

---

## 8. 結論

三個候選代表 agent skills 生態的三種不同典型：

| 模式 | 代表 | 核心定位 |
|---|---|---|
| 個人 Minimal | mattpocock/skills | 個人用、快速、無治理 |
| 企業安全治理 | tech-leads-club/agent-skills | 安全稽核、MCP 整合、多 agent 支援 |
| 方法論框架 | obra/superpowers | 告訴 agent 怎麼做事（不是 skills 本身）|

這三個候選可以共存於 AVIN 的 open-source-vault 觀察庫，分別從不同角度豐富 AVIN 對 agent skills 生態的理解。
