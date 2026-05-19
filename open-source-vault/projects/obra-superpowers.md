# obra/superpowers

## Source URL

- https://github.com/obra/superpowers

## Date Added

- 2026-05-18（候選批次）/ 2026-05-19（project card 建立）

## Signal Source

- GitHub AI Capability Candidate Batch｜2026-05-18

## Why It Matters

- obra/superpowers 是為 AI coding agent 設計的完整工作流方法論框架，涵蓋從設計精化、隔離工作區、任務拆解、自主執行、TDD 到 code review 的全流程。
- 它的「子 agent 驅動執行」設計理念與 Hermes Agent Track 的分工概念高度重疊。
- 197,000 stars 顯示它已成為 agent-driven development 的業界高能見度參考框架。

## Trend Category

- AI Agent
- AI Coding
- Workflow Tool

## Architecture Fit

- Workflow Experiment
- Hermes Agent Track
- Content Pipeline
- open-source-vault

## Potential Use Case

- 作為 AVIN 理解 AI coding agent 工作流設計的方法論參考
- 協助思考 Hermes Agent Track 的任務拆解、子 agent 分工與隔離執行邊界
- 作為 GitHub note 或 AI signal 文章的素材（agent workflow methodology 方向）

## Required Permissions

- Shell command 執行（66.4% Shell 語言）
- Git branch 操作（隔離工作區設計）
- Local file 讀寫
- 無需 API key（目前確認）
- 無外部服務依賴（目前確認）

## Security Notes

- Shell 為主語言（66.4%），實際執行時涉及 git 操作與本地 file system
- 以方法論框架為主，但 git branch 隔離設計代表它會主動操作 git 狀態
- 安裝方式依平台不同，需在 Security Checklist 確認具體 scope
- 在未確認 shell 執行邊界前，不應進入 Practical Trial

## MCP Potential

- Watch
- 未明確提供 MCP server，但作為方法論框架支援多個 agent 平台

## Test Plan

- 先讀 README，釐清它是 plugin 形式還是 workflow prompt 集合
- 確認安裝後實際會在本地產生哪些影響（git branch / local files）
- 只在文件足夠清楚後，再考慮 Security Checklist

## Test Material

- GitHub repo 首頁
- README.md（公開）
- 安裝說明與支援平台清單
- 核心 workflow 步驟說明

## External Output

- Document Only Review：`open-source-vault/reviews/obra-superpowers-document-only-review.md`
- Security Checklist Prep：`open-source-vault/security-reviews/obra-superpowers-security-checklist-prep.md`
- Security Checklist：`open-source-vault/security-reviews/obra-superpowers-security-checklist.md`

## Comparison Note

- 可與 mattpocock/skills 比較：兩者都是「給 agent 用的方法論工具」，但 superpowers 更完整、更有結構，是 methodology，mattpocock/skills 更像 skills collection
- 可與 agent-skills（tech-leads-club）做後續比較

## Decision

- Watch
- Security Checklist Completed
- Ready for Practical Trial（需滿足 6 個前置條件）

## Localized Final Version

- 尚無

## Published URL

- 尚無

## Lifecycle Status

- Document Only Review Completed
- Security Checklist Completed（2026-05-19）
- Practical Trial：Ready（未啟動）

## Why It Looks Interesting

- 197,000 stars，v5.1.0，維護非常活躍
- 業界高能見度的 AI coding agent workflow 框架，是理解「structured agent execution」的重要參考
- 明確支援 Claude Code、Codex、Cursor、Gemini CLI 等 AVIN 熟悉的工具生態

## Suggested First Action

- Security Checklist（釐清 shell 執行邊界後再考慮 Practical Trial）

## Initial Risk Level

- Unknown（候選批次）→ Medium（Document Only Review 後修正）

## Notes

- 初始批次將它列為「先 Do Not Touch Yet / Document Only」，理由是用途不明
- Document Only Review 後確認：它是方法論框架，不是高風險工具，但 shell 執行邊界需要 Security Checklist 確認
