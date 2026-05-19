# obra/superpowers Document Only Review

## 1. Review Purpose

- 透過公開 GitHub 文件，理解 `obra/superpowers` 的實際用途與架構。
- 更新候選批次中「用途不明 / Watch Only」的初始評估，給出更具體的 Document Only 結論。
- 判斷它與 Hermes Agent Track、Workflow Experiment、Content Pipeline 的契合程度。
- 判斷是否值得後續進行 Security Checklist 或 Practical Trial。
- 不安裝、不 clone、不測試、不匯入任何東西。

## 2. Source Checked

- GitHub repo URL：`https://github.com/obra/superpowers`
- GitHub repo 首頁
- README.md（公開）
- License 頁面：MIT 已確認
- 版本：v5.1.0（2026-05-04）
- Stars / Forks：197,000 stars / 17,600 forks（2026-05-19 觀察）
- 作者：Jesse Vincent / Prime Radiant

## 3. What This Repo Appears To Be

初始候選批次把它列為「用途不明 / Watch Only」，理由是名稱太泛（superpowers）。Document Only Review 後，定位清楚許多。

`obra/superpowers` 是一套**為 AI coding agent 設計的完整工作流方法論框架**。

它不是傳統的函式庫或 CLI 工具。它更接近一套有結構的工作模式規範，告訴 AI coding agent 應該如何拆解任務、隔離工作區、先設計再執行、用 TDD 驗證、最後做 code review。它的核心流程是：

> 設計精化 → 隔離工作區 → 任務拆解 → 子 agent 執行 → 測試驅動（RED-GREEN-REFACTOR）→ Code Review

它用 plugin 或套件形式整合進各個 agent 平台：Claude Code（官方市場）、Cursor、GitHub Copilot CLI、Codex、Factory Droid、Gemini CLI、OpenCode 等。

技術組成：Shell 66.4%（主語言）、JavaScript 24.8%、HTML、Python、TypeScript。

這份 Document Only Review 是純文件閱讀，runtime 行為尚未實際確認。

## 4. Why It Looks Interesting for AVIN

**方法論層面的相關性最高。**

AVIN 的 Hermes Agent Track 目前定義在 proposal layer，未來要升級到 execution layer 時，會面對的核心問題之一就是：「agent 應該怎麼拆解任務、怎麼執行、怎麼確保不亂來？」superpowers 正是在回答這個問題的業界框架。

具體相關點：

- **子 agent 驅動執行（subagent-driven execution）**：與 Hermes 未來分工的概念直接重疊。
- **隔離工作區設計**：Hermes 的安全邊界設計需要類似的隔離原則。
- **先問用戶真正想要什麼、再行動**：這與 AVIN 的 Review Gate 概念一致。
- **明確支援 Claude Code 和 Codex**：AVIN 目前的主要工具都在支援清單內。
- **197,000 stars，2026 年 5 月仍在活躍維護**：這是業界能見度很高的方法論，值得理解它在說什麼。

## 5. Architecture Fit

- **Workflow Experiment**：最強契合。superpowers 本身就是 agent workflow methodology，直接對應 AVIN 的 Workflow Experiment 層。可以先理解它的框架邏輯，再判斷哪些概念值得借用。
- **Hermes Agent Track**：強契合。子 agent 執行、任務拆解、隔離工作區設計都是 Hermes 未來升級 execution layer 時需要思考的問題，superpowers 是現成的參考框架。
- **Content Pipeline**：有機會。197,000 stars 的 agent workflow framework 是很好的 AI signal 素材，可以寫成 GitHub note 或 Threads 文章，介紹「structured agent execution 的業界現況」。
- **open-source-vault**：強契合。這是典型的「先理解、比較、再決定是否借用概念」的候選。
- **Manual OS**：弱契合。superpowers 是 coding agent 的方法論，AVIN 的 Manual OS 是 human-first 的操作層，直接套用的機會有限。
- **直接導入**：不適合。Shell 執行邊界未確認，不應在 Security Checklist 前考慮任何形式的安裝或整合。

## 6. Security / Governance Notes

- **License**：MIT，條款清楚，商業使用友善。
- **Shell 比例**：66.4%，是主語言。這意味著工具實際執行時會有 shell command，涉及本地 file system 操作。
- **Git branch 操作**：隔離工作區設計的核心就是 git branch，安裝後可能會主動操作 git 狀態。
- **API key 需求**：目前公開文件未提及需要 API key 或外部服務。
- **安裝方式**：依平台不同，Claude Code 走官方市場，其他平台有各自安裝方式，具體 scope 需要在 Security Checklist 確認。
- **Risk Level**：Medium。它的主體是方法論文件，比 runtime 工具的風險低，但 shell 執行邊界和 git 操作範圍需要在進一步試用前確認。
- **適合 Document Only**：是。
- **適合直接 Practical Trial**：需先通過 Security Checklist，特別是確認 shell 執行和 git 操作的實際邊界。

## 7. What AVIN Can Learn From It

- **Structured agent execution 的現狀**：superpowers 代表業界目前對「怎麼讓 agent 不亂做事」的答案之一，理解它的框架邏輯有助於 AVIN 判斷 Hermes 設計方向。
- **隔離工作區原則**：git branch 隔離是 superpowers 的核心設計，這和 AVIN 自己的 agent 安全邊界思考有直接對應。
- **Design before code 的方法論**：先問清楚要什麼再行動，而不是立刻開始 coding，這與 AVIN 的 Review Gate 精神一致。
- **Content material**：197,000 stars 的框架本身就是一個值得寫的 AI signal，可以介紹「AI coding agent 的工作流設計已演進到這個層次」。
- **比較素材**：和 mattpocock/skills 比較，可以建立「methods（superpowers）vs skills（mattpocock）」的對比，這是有意思的 GitHub note 主題。

## 8. Suggested Next Action

- **Watch**：繼續觀察，197,000 stars 的框架值得長期追蹤演進方向。
- **啟動安全檢查**：在進入任何 trial 前，先走 Security Checklist（Rule 11），特別確認 shell 執行邊界和 git 操作 scope。
- **Content material**：「業界最高能見度 AI coding agent workflow framework 的現況」是值得寫的 AI signal 文章主題。
- **Comparison Note**：與 mattpocock/skills 做「methods vs skills」的比較 note。
- **不做**：不在 Security Checklist 前安裝或執行任何部分。

## 9. Decision

- **Current Decision**：Document Only Completed / Watch
- **初始批次評估修正**：候選批次原為「Watch Only / Unknown risk」，Document Only 後修正為 Medium risk，用途已確認（AI coding agent workflow methodology）
- **Next Recommended Status**：Ready for Security Checklist
- **MCP Potential**：Watch（無明確 MCP server，但平台整合模式值得追蹤）
- **Content Potential**：高，197,000 stars 的框架是業界能見度極高的 AI signal
