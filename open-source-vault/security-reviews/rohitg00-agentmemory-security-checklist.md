# rohitg00/agentmemory｜Security Checklist

## 執行資訊

- Date：2026-05-19
- Mode：Document-Only Analysis（公開文件，無安裝、無執行、無 API、無 MCP）
- Source：GitHub README、Document Only Review、Security Checklist Prep
- Rule：Rule 11 Security Checklist + Rule 12 Design Approval Gate（首次正式試跑）
- 前置文件：`open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist-prep.md`

---

## 1. 標準格式核對表

```
Project:                   rohitg00/agentmemory
URL:                       https://github.com/rohitg00/agentmemory
Version:                   v0.9.20（2026-05-18）
Language:                  TypeScript 81.4%
Stars / Forks:             13,100 / 1,100

API key needed:            可選（預設不需要；選用雲端嵌入才需要）
GitHub token needed:       未確認（公開文件未提及，需實測才能確認）
Credential / token:        未確認（hook 是否可讀取環境變數，需實測確認）
Touches Notion / GitHub:   未確認（hook 捕獲範圍待確認）

Touches local files:       是（SQLite 資料庫，本地讀寫確認）
Runs shell commands:       未確認（公開文件未明確提及）
Code execution:            是（12 個生命周期鉤子，自動捕獲行為）
Package install needed:    是（npm install -g 或 npx）

External service access:   可選（選用雲端嵌入時連外）
Browser access:            未確認
Browser automation:        未確認

License clarity:           ✓ 清楚（Apache-2.0）
Recent maintenance:        ✓ 活躍（v0.9.20 發布於 2026-05-18）
Sandbox fit:               待確認（SQLite 路徑與 hook 隔離性未確認）
Read-only test possible:   待確認（hooks 為主動捕獲，不確定是否可停用）

Risk level:                Medium-High
```

---

## 2. 八維度安全評估

---

### A. Local Storage / Database

**已知（公開文件）：**
- 使用 SQLite 作為主要持久化儲存
- 向量索引（`all-MiniLM-L6-v2` 本地模型）也存於本地
- 知識圖譜結構亦存於本地

**分析：**

| 問題 | 狀態 | 說明 |
|---|---|---|
| SQLite 路徑是否可配置 | **待確認** | 公開文件未明確說明預設路徑，需確認是否在 home dir / working dir / repo dir |
| 是否可能寫入主 repo | **待確認** | 若預設路徑在 working dir，有寫入主 repo 的風險 |
| 儲存內容是否含敏感資料 | **是（設計目的）** | memory 設計本身就是存放工具使用歷史、文件存取、結果，本質上就是敏感資料 |
| 是否可刪除所有記憶 | **待確認** | 公開文件提到 memory 管理，但 complete wipe 的指令未確認 |

**風險評估：Medium**
路徑可配置性是關鍵。若 SQLite 預設不在 repo 目錄，且路徑可明確設定到隔離資料夾，此維度風險降至 Low。若不可配置，風險升至 High。

---

### B. Hooks / Automatic Capture

**已知（公開文件）：**
- 12 個生命周期鉤子（lifecycle hooks）
- 可自動捕獲：工具使用、文件存取、執行結果
- 這是主動監聽行為，不是被動查詢

**分析：**

| 問題 | 狀態 | 說明 |
|---|---|---|
| 12 個 hook 各自的名稱與觸發時機 | **未確認** | 公開文件列舉功能但未逐一描述每個 hook |
| 是否可選擇性停用 | **未確認** | 這是最關鍵的安全問題 |
| 是否會捕獲 AVIN prompt 內容 | **高風險** | hooks 設計目的是捕獲 agent 工作過程，有極高機率包含 prompt |
| 是否會捕獲 Claude Code 指令 | **高風險** | 明確支援 Claude Code 作為 agent，hooks 在此情境下會主動記錄 |
| 是否有純讀取模式（不觸發 hook） | **未確認** | |

**風險評估：High**
這是 rohitg00/agentmemory 整個安全評估中**風險最高的單一維度**。主動捕獲行為意味著安裝後若不能明確停用 hooks，工具就會持續記錄 AVIN 的工作內容。在 disable 方法未確認之前，這個維度的風險是 High，且是 Practical Trial 的最大阻礙。

---

### C. MCP Tools（53 個）

**已知（公開文件）：**
- 53 個 MCP 工具
- 支援 MCP server 整合方式
- 工具功能包含：記憶存儲、記憶搜尋、記憶更新、記憶刪除

**分析（依 mcp-potential-checklist.md 框架）：**

| 問題 | 狀態 | 說明 |
|---|---|---|
| Write permission 工具數量 | **未確認** | 53 個中有多少是 write action 不明 |
| 是否需要 credentials | **待確認** | MCP server 本身的認證需求未確認 |
| 是否可限制 write scope | **未確認** | |
| 是否有越權操作風險 | **待確認** | write 工具若可操作任意路徑，風險升高 |
| 現階段是否禁止接 MCP | **是** | AVIN OS 的 mcp-potential-checklist.md 明確：不把 MCP 當 default destination |

**MCP Potential 初步評估：**

| 維度 | 結果 |
|---|---|
| CLI 介面 | ✓ |
| API / MCP server | ✓（明確提供） |
| 本地執行 | ✓ |
| Input / output 清楚 | ✓（基本功能清楚） |
| Credential 需求 | 可選（預設無）|
| Local file access | ✓（有） |
| External service | 可選 |
| Permission boundary | **待確認** |
| License | ✓ Apache-2.0 |
| Maintenance | ✓ 活躍 |
| Tests | 未確認 |
| Sandbox potential | 待確認 |
| Agent-safe callable | **待確認（write scope 不明）** |

**MCP Potential Decision：Watch / Candidate**（維持原 project card 評估，不升級）
理由：write permission 邊界不明，不能在未確認前評為 Candidate。升級條件：確認 write scope + sandbox 可行。

**風險評估：Medium-High**
53 個工具密度高，且 write scope 不明是主要風險。

---

### D. Agent Memory

**已知（公開文件）：**
- 4 層記憶：工作記憶（Working）、情節記憶（Episodic）、語意記憶（Semantic）、程序記憶（Procedural）
- 混合搜尋：BM25 + 向量嵌入 + 知識圖譜
- 跨工作階段持久化

**分析：**

| 問題 | 狀態 | 說明 |
|---|---|---|
| 記憶是否可完整刪除 | **待確認** | 是否有 `clear all memory` 指令 |
| 是否可匯出審計 | **待確認** | 是否有 export 功能 |
| 是否可隔離到 test repo | **待確認** | 取決於 SQLite 路徑可配置性 |
| 是否會污染 AVIN OS 主記憶層 | **風險存在** | 若 hooks 捕獲 Claude Code session，AVIN OS 工作內容有被記憶的風險 |
| 與 Hermes 未來記憶層的隔離 | **待設計** | Hermes 目前在 proposal layer，隔離邊界尚未定義 |

**風險評估：Medium**
若 memory 可完整刪除且路徑可隔離，此維度降至 Low。最大風險是「不知道裡面存了什麼，且無法完整清除」。

---

### E. Local File Access

**已知（公開文件）：**
- 有本地 SQLite 讀寫（確認）
- hooks 會記錄文件存取

**分析：**

| 問題 | 狀態 | 說明 |
|---|---|---|
| File access scope 是否可限制 | **未確認** | 是否有 directory scope 設定 |
| 是否可能讀取 `.env` / `secrets.*` | **未確認** | hooks 在捕獲「文件存取」時的邊界不明 |
| 是否可能跨目錄讀寫 | **未確認** | 最高風險場景：進入 New project 2 |
| 是否可能讀取 git credentials | **未確認** | `~/.gitconfig` 或 `~/.ssh/` 是否在捕獲範圍 |

**風險評估：Medium-High**
hooks 捕獲「文件存取」的邊界未確認之前，這個維度是 Medium-High。確認邊界後可重評。

---

### F. Credentials / Secrets

**已知（公開文件）：**
- 預設：本地模型 `all-MiniLM-L6-v2`，**不需要 API key**
- 可選：Gemini / OpenAI / Voyage AI 雲端嵌入，需要對應 API key
- GitHub token：公開文件未提及

**分析：**

| 問題 | 狀態 | 說明 |
|---|---|---|
| 預設模式無 API key | ✓ 確認 | 低風險 |
| 雲端嵌入是否自動觸發 | **待確認** | 若有某種條件會自動切換到雲端，存在意外洩漏風險 |
| 是否讀取環境變數中的 token | **待確認** | hooks 是否有能力讀取 `$OPENAI_API_KEY` 等環境變數 |
| 是否記住 credentials | **待確認** | memory 設計是否包含 credential 層 |
| GitHub token | **未確認** | |

**使用原則：**
→ **在 Security Checklist 未全部 Confirmed 前，絕對不使用真實 API key**
→ **雲端嵌入觸發條件必須明確確認後才能評估 credential 風險**

**風險評估：Low-Medium**
預設模式風險低。雲端模式觸發條件需確認。

---

### G. Hermes Agent Track Relevance

**已知：**
- agentmemory README 明確將 Hermes 列為支援 agent
- 4 層記憶結構與 Hermes 未來記憶層設計問題直接重疊
- `agent-evaluation-and-observability-layer.md` 中的 Agent Activity Log 概念，agentmemory 是其工具化版本

**現階段評估：**

| 問題 | 評估 |
|---|---|
| 是否適合 Hermes Future | 概念層：高度適合 / 執行層：目前不適合（Hermes 在 proposal layer） |
| 是否只是概念參考 | **現階段是** — 研究參考價值高，但不可整合 |
| 是否是 Shared Memory Bridge 候選 | **有潛力，但尚早** — 需先通過完整 Security Checklist + Practical Trial |
| 現階段建議 | Watch + Security Review — 不進行任何形式的整合 |

**風險評估：N/A（概念層，無執行風險）**
Hermes 目前只在 proposal layer，此維度的風險來自「誤以為現在可以整合」。明確記錄「不可整合」即可控制此風險。

---

### H. Practical Trial Readiness

**依 practical-trial-lane.md 前置條件評估：**

| 前置條件 | 狀態 | 說明 |
|---|---|---|
| README 清楚 | ✓ | |
| License 可辨識（Apache-2.0） | ✓ | |
| 不要求高權限 token（預設） | ✓ | 預設模式不需要 |
| 不要求直接改 local repo | **待確認** | hook 範圍是否包含 repo 目錄 |
| 可用 demo / sandbox 測試 | **待確認** | SQLite 路徑隔離 + hook disable 未確認 |
| 能在 30–90 分鐘內完成初步體驗 | 未知 | |

**Practical Trial 阻礙清單（需全部解決才能進 Trial）：**

1. **Hooks disable 方法**：12 個 lifecycle hooks 是否可全部停用或選擇性停用？文件中需確認。
2. **SQLite 路徑隔離**：是否可配置到非主 repo 的隔離目錄？
3. **MCP write scope**：53 個工具中的 write 工具，其操作邊界是否可限制？
4. **Memory delete / export 機制**：是否有完整的「清除所有記憶」與「匯出審計」功能？
5. **Credential 讀取行為**：hooks 是否可能讀取環境變數中的 credentials？

**結論：現階段尚不具備 Practical Trial 條件。**

若上述 5 項阻礙均能從公開文件確認可解決，則可定義隔離式 Practical Trial 條件（Document Only Trial 模式，或在全新隔離資料夾下的受控試驗）。

---

## 3. 整體 Risk Level

**Risk Level：Medium-High**

| 維度 | 風險 |
|---|---|
| A. Local storage / SQLite | Medium |
| B. Hooks / automatic capture | **High（最大風險）** |
| C. MCP tools（53 個）| Medium-High |
| D. Agent memory | Medium |
| E. Local file access | Medium-High |
| F. Credentials / secrets | Low-Medium |
| G. Hermes relevance | N/A（概念層）|
| H. Practical Trial readiness | 尚不具備 |

**定性：** 整體評估為 **Medium-High**，主要驅動因素是 hooks 的主動捕獲行為（B 維度 High）與 MCP write scope 不明（C 維度 Medium-High）。預設模式的 API key 需求（Low）和 Apache-2.0 License（清楚）是正面因素，但不足以拉低整體評估。

---

## 4. Security Checklist 結論

### 通過項目

- ✓ License 清楚（Apache-2.0，商業使用友善）
- ✓ 維護活躍（v0.9.20，2026-05-18）
- ✓ 預設模式不需要 API key
- ✓ 有明確的技術文件

### 待確認項目（不通過）

- ✗ Hooks 是否可停用（最關鍵）
- ✗ SQLite 路徑是否可配置至隔離目錄
- ✗ MCP write permission 邊界
- ✗ Memory 是否可完整刪除 / 匯出
- ✗ File access scope 是否可限制
- ✗ Credential 讀取行為（環境變數）

### 決定

**Document Only — 不進入 Practical Trial（目前）**

在上述 6 項待確認問題全部從公開文件確認之前，不安裝、不 clone、不執行、不接 MCP。

---

## 5. 建議下一步

| 行動 | 優先級 | 說明 |
|---|---|---|
| 繼續 Watch | 持續 | 觀察下一個大版本是否有 permission model 或 sandbox mode 的改善 |
| 確認 hooks disable 方法 | 高 | 若公開文件中有相關設定，可在不安裝的情況下確認 |
| 確認 SQLite 路徑配置 | 高 | 同上，若 README 有說明預設路徑與配置方式 |
| MCP Potential 深化評估 | 中 | 可用 mcp-potential-checklist.md 的 13 項逐條確認，但需先解決 write scope 問題 |
| Content material | 中 | agentmemory 可作為「agent memory 現況」AI signal 文章素材 |
| 啟動 Practical Trial | 暫緩 | 需等以上 5 項阻礙全部解決後才能定義試用條件 |

---

## 6. Lifecycle Status

- Document Only Review：Completed（2026-05-19）
- Security Checklist Prep：Completed（2026-05-19）
- Security Checklist：**Completed（2026-05-19）**
  - Risk Level：Medium-High
  - Decision：Document Only — 不進入 Practical Trial（目前）
- Practical Trial：尚不具備條件（見 Section 2-H）
