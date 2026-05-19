# rohitg00/agentmemory Document Only Review

## 1. Review Purpose

- 透過公開 GitHub 文件，理解 `rohitg00/agentmemory` 的實際用途與架構。
- 判斷它是否值得在 AVIN 的 `open-source-vault` 持續觀察。
- 判斷它與 Hermes Agent Track、MCP 層、Workflow Experiment 的契合程度。
- 判斷是否值得後續進行 Security Checklist 或 Sandbox Test。
- 不安裝、不 clone、不測試、不匯入任何東西。

## 2. Source Checked

- GitHub repo URL：`https://github.com/rohitg00/agentmemory`
- GitHub repo 首頁
- README.md（公開）
- License 頁面：Apache-2.0 已確認
- 最新 Release：v0.9.20（2026-05-18）
- Stars / Forks：13,100 stars / 1,100 forks（2026-05-19 觀察）
- 支援 agent 列表（README 公開列舉）

## 3. What This Repo Appears To Be

從公開 GitHub 頁面來看，`rohitg00/agentmemory` 是一個 AI agent 跨會話持久化記憶系統。

它不是通用程式庫，也不是一個 framework。它的核心主張是：讓 AI agent 在不同對話、不同工作階段之間，保留上下文、歷史決策、使用過的工具與文件的記憶，而不是每次重新開始都要重新解釋背景。

技術上，它使用 TypeScript 撰寫，以本地 SQLite 作為儲存，加上向量索引做語意搜尋，並提供 53 個 MCP 工具讓 agent 能呼叫。它標榜 4 層記憶結構（工作記憶、情節記憶、語意記憶、程序記憶），以及混合搜尋（BM25 + 向量嵌入 + 知識圖譜）。

它明確支援的 agent 包含 Claude Code、Hermes、Cursor、Cline、Windsurf 等 15+ 個常見工具，並提供 MCP server、REST API 與 native plugin 三種整合方式。

這是一份 document-only 閱讀，runtime 行為尚未實際確認。

## 4. Why It Looks Interesting for AVIN

agentmemory 的核心問題與 AVIN 的 Hermes Agent Track 高度重疊：

- **Hermes Agent Track 的核心挑戰之一**：Hermes 如果要從 proposal layer 逐步升級到 execution layer，它需要能記住過去做過什麼、看過什麼、AVIN 核准過什麼。agentmemory 正是處理這個層面的工具。
- **Agent Activity Log 概念的延伸**：AVIN 在 `agent-evaluation-and-observability-layer.md` 裡定義了 Agent Activity Log（記錄 task、input、tools used、files touched、output 等），agentmemory 在概念上是這個方向的工具化版本。
- **README 明確列出 Hermes**：這不是模糊的架構契合猜測，agentmemory 的 README 直接把 Hermes 列為支援的 agent。
- **MCP 整合**：53 個 MCP 工具意味著它的功能可以被 agent 直接呼叫，這與 AVIN 的 MCP Potential Checklist 評估方向一致。

但這些相關性也帶來更高的審查標準：越有用的工具，越需要先確認邊界與風險。

## 5. Architecture Fit

- **Hermes Agent Track**：最強契合。agentmemory 正是 Hermes 在記憶層、任務追蹤、上下文保存這些方向所需要理解的工具類型。如果 Hermes 未來要有 memory，這是第一個應深度比較的候選。
- **open-source-vault**：強契合。這是典型的「需要先觀察、比較、做完整 security check 再決定」的候選，完全符合 open-source-vault 的治理目的。
- **MCP Potential**：有潛力。53 個 MCP 工具是明確的技術信號，但 MCP Potential Checklist 裡的 12 項還沒逐條確認，不能直接升到 Candidate 狀態。
- **Workflow Experiment**：有限契合。它的記憶概念可以啟發 AVIN 對 Hermes workflow 的設計思路，但本身不是 AVIN 能直接用的工作流工具。
- **Content Pipeline**：有機會。這個 repo 很適合作為 GitHub note 或 AI signal 文章的素材，說明 agent memory 的現況與挑戰。
- **Manual OS**：弱契合。AVIN 的 Manual OS 是手動觸發的 workflow，agentmemory 的持久化機制對 Manual OS 層沒有直接用途。
- **直接導入**：不適合。在 Security Checklist 通過前，不應考慮任何形式的安裝或整合。

## 6. Security / Governance Notes

- **License**：Apache-2.0，商業使用友善，條款清楚。
- **Local file 讀寫**：確認需要。SQLite 資料庫存放在本地，這意味著工具在執行時會對本地 file system 有讀寫行為。
- **API key 需求**：可選。預設使用本地模型（`all-MiniLM-L6-v2`），不需要任何外部服務。若要使用雲端向量嵌入（Gemini、OpenAI、Voyage AI），才需要 API key。
- **安裝方式**：`npm install -g` 或 `npx`，屬於 global install，影響範圍需要確認。
- **MCP 工具數量**：53 個 MCP 工具是高密度整合，每個 tool 的 permission scope 在 document-only 階段尚未確認。
- **自動捕獲行為**：README 提到 12 個「生命周期鉤子」可自動記錄工具使用、文件存取與結果，這是比一般 memory helper 更主動的行為，需要在 Security Checklist 階段仔細確認。
- **Risk Level**：Medium-High。本地 SQLite + 主動捕獲 hook + 可選雲端嵌入的組合，讓這個工具的 risk level 高於純文件工具。
- **適合 Document Only**：是。
- **適合直接 Practical Trial**：否，需先通過 Security Checklist。
- **Sandbox Test 前置條件**：必須確認 SQLite 存放路徑可控、hook 範圍可限制、不觸及主 repo 或真實資料。

## 7. What AVIN Can Learn From It

- **Memory 分層概念**：工作記憶 / 情節記憶 / 語意記憶 / 程序記憶的 4 層結構，是理解 agent memory 設計的好切入點，對 Hermes Agent Track 的記憶層規劃有直接參考價值。
- **MCP 工具密度的可能性**：53 個 MCP 工具展示了一個工具如何被完整地暴露給 agent 生態。這對 AVIN 理解 MCP Potential 的邊界很有幫助。
- **主動捕獲 vs 被動查詢的差異**：agentmemory 採用的是主動鉤子捕獲，而不是等 agent 主動問。這是一個值得理解的設計決策，它的 tradeoff 是更多的自動化但也更多的 side effect。
- **跨 agent 支援的現實**：README 列出 Claude Code、Hermes、Cursor 等 15+ agents，代表這類工具正在走向標準化整合。這對 AVIN 判斷 Hermes 未來的 tool ecosystem 有參考意義。
- **Content material**：這個 repo 的存在本身就是一個 AI signal：2026 年 5 月，agent memory 工具已有 13,000 stars 並在活躍維護。可作為「AI agent 記憶層現況」的 content 素材。

## 8. Suggested Next Action

- **Watch**：繼續觀察，留意下一個大版本是否有 permission model 或 sandbox mode 的改善。
- **啟動安全檢查**：在進入任何 trial 前，先走 Security Checklist（Rule 11），特別確認 SQLite 存放路徑、hook 捕獲範圍、MCP 工具的 write permission 邊界。
- **Content material**：可以把「agentmemory 作為 agent memory 基礎設施」作為一篇 GitHub note 或 AI signal 文章的主題。
- **MCP Potential 深化**：下一步可以用 `mcp-potential-checklist.md` 的 12 項逐條確認，判斷是否升到 MCP Candidate 狀態。
- **不做**：不要在 Security Checklist 前進行任何安裝或 sandbox test。

## 9. Decision

- **Current Decision**：Document Only Completed / Watch
- **Next Recommended Status**：Ready for Security Checklist
- **MCP Potential**：Watch / Candidate（有潛力，但 53 個 MCP 工具需逐條確認 permission）
- **Content Potential**：高，可作為 AI signal 文章素材
