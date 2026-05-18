# GitHub AI Capability Candidate Batch｜2026-05-18

## 1. 文件目的

這份文件是 AVIN 第一批 GitHub AI Capability Candidate Batch。

目的不是把 repo 直接導入 OS，也不是現在就安裝、clone、實測或評價誰好誰壞，而是把 AVIN 覺得有趣、可能讓自己能力變強的 GitHub repo，先放進候選池，再用：

- AI Trend Intake Layer
- open-source-vault workflow
- security-checklist
- practical-trial-lane

去做後續分流與評估。

AVIN 不是 AI / 軟體本科出身，因此很多開源工具需要透過實際操作才知道價值。  
但實際操作前，必須先有候選分流與風險標記，避免看到熱門 repo 就直接 clone / install / 導入。

---

## 2. 使用說明

這一批是 `initial candidate batch`，屬於名稱、定位與可能用途層級的初步整理。

這不代表：

- 已完整研究 repo 內容
- 已確認安全
- 已確認適合 Practical Trial
- 已確認值得導入

這只是第一層候選池，目的是幫 AVIN 把「感興趣的 GitHub repo」先放進可治理的批次文件裡。

---

## 3. Candidate Table

| Repo | Source URL | Initial Category | Possible Architecture Fit | Why It Looks Interesting | Initial Risk Guess | Suggested First Action | Notes |
|---|---|---|---|---|---|---|---|
| openhuman | https://github.com/tinyhumansai/openhuman | AI Agent | Hermes Agent Track / open-source-vault / Workflow Experiment | 名稱看起來像 human-like agent 或 personal AI interaction 類工具，可能對 agent use case 與 workflow framing 有啟發。 | Medium | Document Only | 先不要假設它真的適合 AVIN，需先看 README 與權限需求。 |
| bun | https://github.com/oven-sh/bun | Developer Tool | Workflow Experiment / AI Trend Research / Content Pipeline | 是高熱度開發工具名稱，可能和 runtime、dev workflow、AI coding environment 有關，具內容角度。 | Medium | Watch Only | 名稱很熟，但與 AVIN 主線的直接關係需判斷，不宜因知名度就直接試。 |
| Open-Generative-AI | https://github.com/Anil-matcha/Open-Generative-AI | AI Resource Collection | AI Trend Research / Content Pipeline / open-source-vault | 看起來像 generative AI 資源整理或學習型 repo，可能適合先做研究筆記或內容整理。 | Low | Document Only | 先當資源型候選看待，不急著操作。 |
| Shadowbroker | https://github.com/BigBodyCobain/Shadowbroker | Unknown / Needs Review | Not Fit / Needs Review | 名稱帶有 broker / shadow 感，可能涉及 automation、security 或權限敏感能力。 | Critical | Do Not Touch Yet | 名稱本身已偏敏感，先不要進 Practical Trial。 |
| agent-skills | https://github.com/tech-leads-club/agent-skills | Agent Skills | Hermes Agent Track / open-source-vault / AI Trend Research | 名稱直接對應 agent skills，可能有助於理解 agent 能力切分與 skill 組織方式。 | Medium | Document Only | 很適合先做 skill 架構研究，但不代表可直接導入。 |
| DreamServer | https://github.com/Light-Heart-Labs/DreamServer | Unknown / Needs Review | open-source-vault / Workflow Experiment / Not Fit / Needs Review | 名稱顯示 server 類工具，可能與本地服務、模型服務或自架環境有關。 | High | Sandbox Test | 只在隔離環境概念下考慮，先看是否需要高權限與長時間 setup。 |
| AiToEarn | https://github.com/yikart/AiToEarn | Unknown / Needs Review | Content Pipeline / Not Fit / Needs Review | 名稱偏 growth / earning / 平台感，可能和 AVIN 目前 Stage 2 主線不完全一致。 | High | Watch Only | 先保持距離，避免被名稱導向過度產品化或變現導向。 |
| agentmemory | https://github.com/rohitg00/agentmemory | Agent Memory | Hermes Agent Track / open-source-vault / Workflow Experiment | 名稱直指 agent memory，可能對 Hermes Agent Track 的長短期記憶概念有啟發。 | Medium | Sandbox Test | memory 類通常涉及 state 與本地存取，適合先做隔離式理解。 |
| CloakBrowser | https://github.com/CloakHQ/CloakBrowser | Browser / Automation | open-source-vault / Workflow Experiment / Not Fit / Needs Review | 名稱涉及 browser，可能與 automation、session、stealth 或 controlled browsing 有關。 | High | Do Not Touch Yet | browser 類工具需要特別看權限、行為與風險邊界。 |
| academic-research-skills | https://github.com/Imbad0202/academic-research-skills | AI Research | AI Trend Research / open-source-vault / Content Pipeline | research skills 類很接近 AVIN 的 public research 主線，適合先當研究框架候選。 | Low | Document Only | 看起來是相對安全的閱讀型候選，適合先做方法論比較。 |
| skills | https://github.com/mattpocock/skills | Agent Skills | open-source-vault / Hermes Agent Track / AI Trend Research | 名稱泛但聚焦於 skills，可能有助於理解 skill packaging、skill UX 或 skill documentation。 | Medium | Document Only | 先當參考架構，不要直接搬進 AVIN 的 skills 思維。 |
| DeepSeek-TUI | https://github.com/Hmbown/DeepSeek-TUI | AI Coding | Workflow Experiment / AI Trend Research / Content Pipeline | TUI 類工具通常有明確操作介面，可能有助理解 AI coding / local interaction workflow。 | Medium | Practical Trial | 若 README 清楚且可 sample / local sandbox，這類 TUI 很適合做短時間初步體驗。 |
| superpowers | https://github.com/obra/superpowers | Personal Productivity | Workflow Experiment / Content Pipeline / Not Fit / Needs Review | 名稱很泛，可能是 productivity、augmentation 或 AI helper 類工具，內容角度可能存在。 | Unknown | Watch Only | 需要先釐清實際用途，避免名稱誤導。 |

---

## 4. Initial Batch Triage

## A. 可以優先 Document / Practical Trial 的候選

- `Open-Generative-AI`
- `agent-skills`
- `academic-research-skills`
- `skills`
- `DeepSeek-TUI`
- `bun`

這一組大多比較接近：

- agent skills 類
- research skills 類
- resource collection 類
- TUI / developer tool 類

其中：

- `Document Only` 適合先做結構理解與方法論比較
- `Practical Trial` 則可優先留給像 `DeepSeek-TUI` 這類比較容易在 30–90 分鐘內理解實際操作感的候選

## B. 需要 Sandbox Test 的候選

- `openhuman`
- `DreamServer`
- `agentmemory`

這一組名稱比較偏：

- memory
- server
- local execution
- stateful tool

即使可能有價值，也更適合在後續用 `Practical Trial Lane` 的 `Local Sandbox` 或 `Sample Data` 模式處理，而不是直接碰主環境。

## C. 先 Do Not Touch Yet / Document Only 的候選

- `Shadowbroker`
- `CloakBrowser`
- `AiToEarn`
- `superpowers`

原因多半是：

- 名稱不明
- 權限不明
- browser / stealth / security-sensitive 感太強
- 可能偏 token / credential / local repo access
- 或與 AVIN 當前 Stage 2 主線距離較遠

這組不是永遠排除，而是目前先保持保守。

---

## 5. AVIN 的使用觀點

AVIN 不是要從工程師視角評測所有 repo，而是從 `AI Workflow Explorer` 的角度，判斷這些工具是否能：

- 幫助理解 AI workflow
- 提升個人研究效率
- 強化 Hermes Agent Track
- 補足 open-source-vault
- 轉成公開內容
- 形成 GitHub Note / LinkedIn / Threads / 低成本短影音
- 未來成為可重複資產

所以這份 candidate batch 的核心，不是「選出最強 repo」，而是先把值得進一步觀察的方向整理成可治理的清單。

---

## 6. 下一步建議

1. 先從 `Document Only` 候選中挑 1–2 個，補成 `project-template.md` 格式
2. 再從 `Practical Trial` 或 `Sandbox Test` 組裡挑 1 個風險較低的候選，進 `practical-trial-lane.md` 的安全試用流程
3. 對每個候選補一次 `security-checklist` 與 `mcp-potential-checklist`
4. 視結果決定是 `Watch`、`Practical Trial`、`Move to Intake Review`、`Reject` 或 `Archive`
