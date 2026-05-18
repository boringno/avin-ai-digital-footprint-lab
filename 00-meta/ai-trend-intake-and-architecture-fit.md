# AI Trend Intake and Architecture Fit｜AI 趨勢 Intake 與架構契合層

## 1. 文件目的

這份文件用來定義 AVIN AI Digital Footprint OS 的 `AI Trend Intake Layer`。

它不是用來追逐每一個新工具，也不是用來快速產品化，而是讓 AVIN 在看到 GitHub repo、paper、product launch、MCP server、agent framework 或 social discussion 時，先做結構化判斷，再決定是否值得觀察、實測、文件化或暫緩。

---

## 2. 為什麼需要 AI Trend Intake Layer

Stage 2 的重點是 `Public Research & Real Workflow Experiments`。

AVIN 目前的核心工作，不是做 SaaS，不是做學院平台，也不是衝著完整產品化走，而是持續把 AI 趨勢研究、工具實測、workflow 拆解、GitHub 文件化與公開輸出，整理成可被搜尋、可被驗證、可被長期累積的數位足跡。

如果沒有 intake layer，新的 AI signal 很容易變成：

- 看到熱門 repo 就想 clone
- 看到新框架就想裝
- 看到別人討論就想追
- 還沒判斷與 AVIN 的關係，就先投入時間
- source of truth、風險邊界與公開內容角度都還沒想清楚

AI Trend Intake Layer 的作用，就是把「衝動追趨勢」改成「先判斷，再行動」。

---

## 3. 它在 AI Digital Footprint OS 的位置

AI Trend Intake Layer 應放在目前 OS 的前段判斷區。

建議關係：

1. AI Trend Intake Layer
2. Weekly Review
3. Workflow Experiment
4. GitHub Note / Workflow Doc
5. LinkedIn / Threads / IG / Website Output
6. Published URL 回寫
7. Lifecycle Completion Log
8. Productization Layer 判斷

它的角色不是取代 Weekly Review，而是替 Weekly Review 提供更好的前置篩選。

---

## 4. 什麼算 AI trend signal

AI trend signal 不是單純「有人在討論」。

它至少應該符合以下其中幾項：

- 有明確的新能力、新工作流或新 interaction pattern
- 會改變 AI 工具的使用方式、整合方式或導入門檻
- 可能影響 AVIN 目前在研究的 workflow、agent、content、website 或 documentation layer
- 能帶出實際測試題目，而不是只停留在概念
- 有可能變成公開 note、workflow test、comparison 或 case study

如果只有話題性，沒有 workflow 意義，就不應該直接進入 OS 的主線。

---

## 5. Signal source types

- GitHub repo
- arXiv / research paper
- product launch
- developer tool
- MCP server / tool
- agent framework
- AI coding workflow
- AI video / media workflow
- personal website / AI-readable web
- social discussion

---

## 6. Trend category

- AI Agent
- MCP
- AI Coding
- AI Video
- AgentOps
- Evaluation
- Security
- Workflow Tool
- Personal Website / AI-readable Web

Trend category 的目的，是讓 AVIN 在週回顧與文件化時，不只是收集連結，而是知道這則 signal 正在影響哪一種能力帶。

---

## 7. Architecture Fit

看到 signal 後，先判斷它跟哪一層有關。

### Manual OS

與 AVIN 目前手控主系統直接相關，能支持 GitHub 文件化、weekly review、內容輸出、proof-of-work 或實際工作流整理。

### Hermes Agent Track

與未來自主探索支線相關，特別是 agent experiment、agent review、agent observability、agent import proposal 這類題目。

### Open-source-vault

適合作為 open-source-vault 的觀察或候選條目，但還不應直接進主 repo 主線。

### Website / llms.txt

與個人網站、AI-readable layer、public entry layer、GitHub Pages、`llms.txt` 或 machine-readable context 有關。

### Content Pipeline

適合被轉成 GitHub note、LinkedIn / Threads / IG 內容、輪播素材或短影音腳本。

### Productization Layer

不是現在就做產品，而是這個 signal 有可能讓某個已完成 workflow 在未來具備可複用資產潛力。

### Not Fit

與 AVIN 現階段主線無直接關係，或短期內無法形成有效 proof-of-work。

---

## 8. Risk Check

在判斷是否值得測之前，先看風險。

- Local file access
- Token / credential access
- Code execution
- Browser automation
- GitHub permission
- Notion permission
- Package supply chain
- Unclear license
- Immature documentation

補充判讀原則：

- 需要高權限 token，先降級處理
- 文件不清楚、license 不清楚、input / output 不清楚，先列為高風險
- 會讀寫本地檔案、可自動執行 shell、可連外部服務的工具，要先定義權限邊界
- 不能因為熱門就跳過風險審查

---

## 9. Experiment Level

### Watch Only

只記錄，先不安裝、不測試、不導入。

### Light Test

1 到 2 小時內可完成的輕量判讀或 demo 級測試。

### Local Test

需要本地執行，但還沒進 workflow 主線。

### Workflow Test

已經值得變成完整的小型 workflow experiment，有明確假設、步驟與 human review。

### Public Note

即使不深入整合，也值得先做公開 note 或內容輸出。

### Do Not Touch Yet

風險、權限、文件成熟度或時間成本不合理，先不碰。

---

## 10. Decision

- Watch
- Test
- Document
- Integrate
- Reject
- Archive

Decision 的含義：

- `Watch`：先追蹤，不投入操作成本
- `Test`：值得做小型實測
- `Document`：值得先形成 GitHub note 或流程文
- `Integrate`：已確認有穩定價值，適合納入 OS 某一層
- `Reject`：與定位不合、風險不合理或只是噪音
- `Archive`：曾有觀察價值，但暫時失去優先順序

---

## 11. Recommended intake flow

```text
AI Trend Signal
-> Source Check
-> Category
-> Architecture Fit
-> Risk Check
-> Experiment Level
-> Content Potential
-> Decision
-> Log / GitHub Note / Notion Update
```

### Source Check

先確認來源可信度、原始連結、作者 / 維護者、release context、被討論的具體功能。

### Category

避免把 agent、MCP、workflow tool、AI coding、AI video 混成同一類訊號。

### Architecture Fit

判斷它跟 AVIN 的哪一層真正有關，而不是抽象地覺得「好像很酷」。

### Risk Check

先看權限、執行方式、license、文件成熟度與供應鏈風險。

### Experiment Level

決定這次只觀察、做輕測、做本地測試，還是值得進完整 workflow experiment。

### Content Potential

判斷它是否能形成公開 note、比較文、工作流案例、輪播題目或短影音角度。

### Decision

最後不是只有「要不要用」，而是要落到明確動作：Watch / Test / Document / Integrate / Reject / Archive。

---

## 12. AVIN tone

這一層不要寫成：

- AI 大師宣言
- AI 工具搬運清單
- 爆款工具速報
- 什麼都能導入的萬用框架

這一層應該寫成：

- AI Workflow Explorer 的判斷層
- AI Operations Strategist 的風險與架構判讀層
- 公開研究與真實 workflow experiment 的前置篩選層

核心語氣應該是：

不是先追熱度，而是先判斷這則 AI trend 對 AVIN 的 workflow、OS 架構、公開輸出與可驗證證據層，到底有沒有真實意義。
