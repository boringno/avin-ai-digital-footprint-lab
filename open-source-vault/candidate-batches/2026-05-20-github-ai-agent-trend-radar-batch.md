# 2026-05-20 GitHub AI Agent Trend Radar Batch

## 批次概覽

- **批次名稱：** GitHub AI Agent Trend Radar Batch｜2026-05-20
- **執行日期：** 2026-05-20
- **候選數量：** 5 個（3 個進入 open-source-vault lifecycle，2 個為 Content/Research Signal）
- **信號來源：** AVIN GitHub 趨勢觀察 + AI Agent 生態掃描
- **執行工具：** Claude Code Write Documentation Mode（AVIN 審核 + AI 文件化）
- **Rule 12 套用：** Phase 1 設計 → AVIN 核准 → Phase 2 執行

---

## 候選清單

| # | 候選 | 類型 | 信號來源 | 初判路線 | Source Status |
|---|---|---|---|---|---|
| 1 | openclaw/openclaw | Full personal agent OS | AVIN-provided signal | Document Only（高優先）| AVIN-provided signal / not independently verified in this run |
| 2 | modelcontextprotocol/registry | MCP registry 基礎建設 | AVIN-provided signal | Document Only + MCP Potential Check reference | AVIN-provided signal / not independently verified in this run |
| 3 | crewAIInc/crewAI | Multi-agent 框架 | AVIN-provided signal | Watch / Document Only（中優先）| AVIN-provided signal / not independently verified in this run |
| 4 | 1GC-7RC Benchmark | Coding agent benchmark | AVIN-provided signal | Content/Research only（不入 trial）| AVIN-provided signal / not independently verified in this run |
| 5 | AIDev / coding agent adoption | 採用研究報告 | AVIN-provided signal | Content/Research only（不入 trial）| AVIN-provided signal / not independently verified in this run |

---

## 候選分析

### 1. openclaw/openclaw

**Source Status：** AVIN-provided signal / not independently verified in this run

**信號摘要：**
- 定位為 Full personal agent OS / always-on agent
- 涵蓋 skill + channel + gateway 三個層次
- 公開能見度：High public visibility / trending signal / needs source verification

**與 AVIN OS 的關聯性：**

| 維度 | 說明 |
|---|---|
| Hermes Agent Track | 可能與 always-on agent 設計直接相關 |
| Skill 系統 | skill + channel 架構與 AVIN 的 skill / task routing 概念高度重疊 |
| Gateway | 若有 gateway 層，可能有 MCP Potential |
| 與 obra/superpowers 比較 | obra/superpowers 是方法論框架；openclaw 若為完整 OS 實作，層次更深、更具體，但也意味著更複雜的安全考量 |

**初判 Lifecycle：** Document Only（高優先）

**建議下一步：**
1. Document Only Review — 讀 README / 架構說明，確認 skill / channel / gateway 的實際含義
2. 確認是否為可安裝工具或僅為概念 OS
3. 依 Document Only Review 結果決定是否走 Security Checklist

---

### 2. modelcontextprotocol/registry

**Source Status：** AVIN-provided signal / not independently verified in this run

**信號摘要：**
- MCP 官方 registry 基礎建設
- 作為 MCP 工具的集中目錄 / 索引系統
- 公開能見度：High public visibility / trending signal / needs source verification

**與 AVIN OS 的關聯性：**

| 維度 | 說明 |
|---|---|
| MCP 生態參考 | 這是 MCP 協議的官方 registry，對理解整個 MCP 生態至關重要 |
| 工具選型依據 | 可作為 AVIN 未來評估 MCP 工具時的索引來源 |
| tech-leads-club/agent-skills MCP Potential | tech-leads-club 的 3 個 MCP tools 可在此 registry 做交叉確認 |
| 不屬於可安裝工具 | registry 本身是基礎建設，不是 AVIN 直接試用的對象 |

**MCP Potential 初判：** N/A（這是 registry 本身，不是 MCP server/tool）

**建議下一步：**
1. Document Only Review — 了解 registry 的收錄標準、瀏覽方式、更新頻率
2. 作為後續 MCP Potential Check 的參考索引，而非直接試用對象
3. 不需要走 Security Checklist（基礎建設文件，無安裝行為）

---

### 3. crewAIInc/crewAI

**Source Status：** AVIN-provided signal / not independently verified in this run

**信號摘要：**
- Multi-agent 框架 / orchestration 系統
- 廣泛採用，社群活躍
- 公開能見度：High public visibility / trending signal / needs source verification

**與現有候選比較：**

| 比較維度 | rohitg00/agentmemory | crewAIInc/crewAI |
|---|---|---|
| 層次 | Agent memory / 記憶層 | Multi-agent orchestration / 協調層 |
| 安裝需求 | Python，SQLite | Python，較重依賴 |
| 主要功能 | 記住過去任務、建立記憶庫 | 協調多個 agent 協作執行任務 |
| AVIN 相關性 | Hermes Agent Track 記憶層 | Hermes Agent Track 執行層 / 多 agent 協作 |
| Risk Level 初判 | Medium-High（已完成 Security Checklist）| 未知（需 Security Checklist 確認）|

**與 AVIN OS 的關聯性：**
- crewAI 的 multi-agent 協作設計可能與 Hermes Agent Track 的 orchestration 需求相關
- 但框架本身較重，AVIN 目前處於概念研究階段，直接導入可能過早
- 初判：Watch / Document Only，觀察社群發展

**建議下一步：**
1. Document Only Review — 了解框架架構、安裝需求、agent 定義方式
2. 與 rohitg00/agentmemory 做比較分析（memory vs orchestration 兩個層次）
3. 暫不走 Security Checklist，等 Document Only Review 確認實際安裝複雜度後決定

---

## Content / Research Signal 候選

### 4. 1GC-7RC Benchmark

**Source Status：** AVIN-provided signal / not independently verified in this run

**信號摘要：**
- Coding agent 能力基準測試
- 評估不同 coding agent 的實際能力表現
- 公開能見度：High public visibility / trending signal / needs source verification

**不進入 open-source-vault trial 的理由：**
- 這是能力評測基準，不是可安裝的開源工具
- 對 AVIN 的價值在於：了解不同 coding agent 的能力邊界，作為工具選型的參考依據
- 適合作為 AI Signal 觀察素材或 content 研究素材，而非 open-source-vault lifecycle 的試用對象

**建議用途：**
- 若 AVIN 未來要比較 Claude Code vs Codex vs 其他 coding agent 的能力，可參考此 benchmark 的評測方法
- 可作為 `03-content/` 或 `00-meta/` 層級的 reference 文件

---

### 5. AIDev / Coding Agent Adoption Research

**Source Status：** AVIN-provided signal / not independently verified in this run

**信號摘要：**
- Coding agent 在開發者社群的採用趨勢研究
- 市場層面的採用數據與行為模式
- 公開能見度：High public visibility / trending signal / needs source verification

**不進入 open-source-vault trial 的理由：**
- 這是採用研究報告，不是可安裝的工具
- 對 AVIN 的價值在於：了解 AI coding agent 的市場採用現況，作為 AI Digital Footprint 的背景脈絡
- 適合作為 content research 素材，不走 open-source-vault lifecycle

**建議用途：**
- 可作為 GitHub Note、AI Signal 觀察文章的佐證素材
- 了解 coding agent 採用曲線，幫助 AVIN 判斷自身在整體趨勢中的位置

---

## 候選優先序比較表

| 排序 | 候選 | 初判路線 | 優先度 | 關鍵評估點 | 建議時機 |
|---|---|---|---|---|---|
| 1 | openclaw/openclaw | Document Only | 高 | always-on agent OS 的架構深度；skill/channel/gateway 實際含義 | 下一批次首選 |
| 2 | modelcontextprotocol/registry | Document Only（參考用）| 高 | MCP 生態索引；收錄標準；作為 MCP Potential Check 的參考基礎 | 與 openclaw 同批 |
| 3 | crewAIInc/crewAI | Watch / Document Only | 中 | multi-agent orchestration 重量；安裝複雜度；與 Hermes 的契合度 | 暫觀察，下批次評估 |
| 4 | 1GC-7RC Benchmark | Content/Research | 中 | coding agent 能力評測參考 | 需要時查閱 |
| 5 | AIDev Adoption | Content/Research | 低 | 市場趨勢佐證 | 需要時查閱 |

---

## 與前批次待處理事項銜接

本批次不影響前批次（2026-05-18~19）的待處理事項，以下為延續確認：

| 前批次待處理事項 | 狀態 | 說明 |
|---|---|---|
| tech-leads-club/agent-skills Security Checklist | 仍待啟動（高優先）| npm global install 邊界、MCP tool permission |
| mattpocock/skills Security Checklist | 仍待啟動（中優先）| npx 安裝範圍、skill 執行行為 |
| tech-leads-club/agent-skills MCP Potential Check（完整）| 仍待執行（中優先）| 3 個 MCP tools 逐條確認 |
| rohitg00/agentmemory 觀察 | 持續（等版本更新）| 5 項阻礙待解決 |

---

## 建議下一批次行動順序

1. **openclaw/openclaw Document Only Review**（高）— 下一批次首選，full agent OS 概念值得深入理解
2. **modelcontextprotocol/registry Document Only Review**（高）— 作為 MCP 生態基礎參考
3. **tech-leads-club/agent-skills Security Checklist**（高）— 前批次未完成，應盡快執行
4. **mattpocock/skills Security Checklist**（中）— 前批次未完成
5. **crewAIInc/crewAI Document Only Review**（中）— 待前述優先項完成後再評估

---

## 禁止事項確認

- 沒有安裝套件
- 沒有 clone repo
- 沒有執行任何程式碼
- 沒有接 API / MCP
- 沒有操作 Notion
- 沒有操作 New project 2
- 沒有使用 git add .
- 沒有 force push
- 沒有為候選建立 project card（project card 等待個別 Document Only Review 時再建立）
