# tech-leads-club/agent-skills Document Only Review

## 1. Review Purpose

- 透過公開 GitHub 文件，理解 `tech-leads-club/agent-skills` 的實際用途與架構。
- 與 mattpocock/skills（同批候選）進行初步比較，釐清定位差異。
- 判斷它與 AVIN 的 Hermes Agent Track、Workflow Experiment、MCP Potential 的契合程度。
- 判斷是否值得後續進行 Security Checklist 或 Practical Trial。
- 不安裝、不 clone、不測試、不匯入任何東西。

## 2. Source Checked

- GitHub repo URL：`https://github.com/tech-leads-club/agent-skills`
- GitHub repo 首頁
- README.md（公開）
- License 頁面：MIT（software）+ CC-BY-4.0（content）已確認
- 版本：skills-catalog-v0.14.3（2026-04-28）
- Stars / Forks：4,100 stars / 357 forks（2026-05-19 觀察）
- 維護者：tech-leads-club 組織

## 3. What This Repo Appears To Be

`tech-leads-club/agent-skills` 是一個**企業安全稽核等級的 agent skills 市集平台**。

它不是一般的 skill prompt 集合，也不是個人維護的 workflow 工具箱。它的核心主張是：提供一套經過安全稽核（Snyk Agent Scan + human review + static analysis）的 skills 庫，讓 AI coding agent 可以動態查詢、搜尋與調用這些技能，並支援 MCP 整合。

技術組成：TypeScript 68.1%（主語言）、Python 22.7%、Shell 2.3%。

MCP server 提供 3 個工具：`list_skills`、`search_skills`、`read_skill`。

安裝方式：npm global install 或 npx。本地 cache 路徑為 `~/.cache/agent-skills/`。

不需要 API key（base 版本）。部分 skill 可能需要特定服務憑證（視 skill 內容而定）。

這份 Document Only Review 是純文件閱讀，runtime 行為尚未實際確認。

## 4. Why It Looks Interesting for AVIN

**MCP 整合層面相關性最高。**

AVIN 的 MCP Potential Checklist 目前在評估「哪些外部工具可以透過 MCP 被 agent 調用」。tech-leads-club/agent-skills 明確提供 MCP server，且有 3 個工具（list_skills, search_skills, read_skill），是少見的「agent skills 本身就有 MCP 接口」的案例。

具體相關點：

- **MCP server（3 tools）**：這是具體的 MCP 整合信號，在 AVIN 的候選庫中，明確提供 MCP server 的工具並不多。
- **企業安全稽核設計**：Snyk Agent Scan + human review + static analysis 的稽核流程，是理解「如何對 agent skills 做安全治理」的參考。
- **多 agent 支援**：支援 Claude Code、Cursor、Cline 等主流 agent，設計時就考慮跨 agent 互通性。
- **TypeScript 主導**：與 rohitg00/agentmemory 相似的技術棧，有助於比較兩者的整合方式。
- **雙授權（MIT + CC-BY-4.0）**：software 走 MIT，content 走 CC-BY-4.0，授權條款分層清楚。

## 5. Architecture Fit

- **MCP Potential**：最強契合。3 個 MCP 工具（list_skills, search_skills, read_skill）是明確的 MCP Candidate 信號。可用 `mcp-potential-checklist.md` 的 12 項逐條確認。
- **Hermes Agent Track**：強契合。如果 Hermes 未來要有「動態調用外部 skill」的能力，tech-leads-club/agent-skills 的 MCP server 設計是很好的參考框架。
- **open-source-vault**：強契合。企業安全稽核 + MCP 整合的組合，是典型的「先理解治理框架，再決定是否借用概念」的候選。
- **Workflow Experiment**：有機會。它的 skills 市集概念（如何組織、搜尋、調用技能）對 AVIN 的 Workflow Experiment 層有方法論參考價值。
- **Content Pipeline**：有機會。「企業安全稽核等級的 agent skills 市集」是值得介紹的 AI signal，可作為 GitHub note 或 Threads 文章素材。
- **Manual OS**：弱契合。tech-leads-club/agent-skills 是 agent-centric 設計，AVIN 的 Manual OS 是 human-first 操作層，直接套用機會有限。
- **直接導入**：不適合。在 Security Checklist 通過前不應考慮任何安裝或整合。

## 6. Security / Governance Notes

- **License**：MIT（software）+ CC-BY-4.0（content）。雙授權條款清楚，商業使用友善。
- **安裝方式**：npm global install 或 npx。Global install 影響範圍需要在 Security Checklist 確認。
- **Local cache**：`~/.cache/agent-skills/`。確認有本地 cache 寫入行為。
- **API key 需求**：不需要（base）。部分 skill 可能需要特定服務憑證。
- **MCP tool 數量**：3 個（list_skills, search_skills, read_skill）。數量合理，但每個 tool 的 permission scope 在 document-only 階段尚未確認。
- **安全稽核機制**：Snyk Agent Scan + human review + static analysis。這是差異化優勢，但不代表可跳過 AVIN 自己的 Security Checklist。
- **Risk Level**：Medium。有企業安全稽核，但 npm global install + cache 寫入 + MCP tool 的 write permission 邊界需要 Security Checklist 確認。
- **適合 Document Only**：是。
- **適合直接 Practical Trial**：需先通過 Security Checklist，特別確認 npm global install 的影響範圍和 cache 路徑可控性。

## 7. What AVIN Can Learn From It

- **企業安全治理的 skills 市集設計**：Snyk + human review + static analysis 的稽核流程，是「如何對外部 skill 建立治理門檻」的實際案例，對 AVIN 的 open-source-vault 治理設計有直接參考價值。
- **MCP server 設計模式（3 工具）**：list_skills / search_skills / read_skill 的工具分層，展示了「skills 庫如何透過 MCP 暴露給 agent」的設計方式，與 rohitg00/agentmemory 的 53 個 MCP 工具形成對比（精簡 vs 完整）。
- **雙授權策略**：MIT（software）+ CC-BY-4.0（content）的授權分層，是 AVIN 未來若建立自己的 skills 庫時可以參考的授權模式。
- **Content material**：「企業安全稽核等級的 agent skills 市集已在 2026 年 5 月達到 4,100 stars」本身是一個 AI signal，可以與 mattpocock/skills 做對比，寫成「agent skills 生態的個人 vs 企業設計差異」的 content。
- **Comparison 框架**：與 mattpocock/skills（minimal、個人維護）和 obra/superpowers（方法論框架）放在一起，可以建立「agent skills 生態的三種典型模式」的比較框架。

## 8. Suggested Next Action

- **Watch**：繼續觀察，MCP server 設計值得長期追蹤演進方向。
- **啟動安全檢查**：在進入任何 trial 前，先走 Security Checklist（Rule 11），特別確認 npm global install 邊界、cache 路徑、MCP tool 的 write permission。
- **MCP Potential 深化**：下一步可用 `mcp-potential-checklist.md` 的 12 項逐條確認，判斷是否升到 MCP Candidate 狀態。
- **Comparison Note**：與 mattpocock/skills 和 obra/superpowers 做三向比較，已建立於 `open-source-vault/reviews/agent-skills-comparison-note.md`。
- **不做**：不在 Security Checklist 前安裝或執行任何部分。

## 9. Decision

- **Current Decision**：Document Only Completed / Watch
- **Next Recommended Status**：Ready for Security Checklist
- **MCP Potential**：Candidate（有明確 MCP server，3 個工具，需逐條確認 permission）
- **Content Potential**：中，可作為「agent skills 生態個人 vs 企業設計」的 content 素材
