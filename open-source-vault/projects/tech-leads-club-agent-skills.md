# tech-leads-club/agent-skills

## Source URL

- https://github.com/tech-leads-club/agent-skills

## Date Added

- 2026-05-19（候選批次審查）

## Signal Source

- GitHub AI Capability Candidate Batch｜2026-05-18

## Why It Matters

- tech-leads-club/agent-skills 是一套企業安全稽核等級的 agent skills 市集，涵蓋 Snyk Agent Scan + human review + static analysis。
- 它提供 MCP server（3 個 tools：list_skills, search_skills, read_skill），可讓 agent 動態查詢與調用技能。
- 與 mattpocock/skills 的最大差異：這不是個人維護的 skill 集合，而是有治理結構的多 agent 支援平台。
- 4,100 stars，維護活躍，技術棧 TypeScript 主導。

## Trend Category

- Agent Skills
- AI Coding
- MCP Integration
- Enterprise Security

## Architecture Fit

- open-source-vault
- Hermes Agent Track
- Workflow Experiment
- Content Pipeline

## Potential Use Case

- 作為 AVIN 理解「企業級 agent skills 市集如何設計安全治理」的參考
- 比較 mattpocock/skills（個人維護）與 tech-leads-club/agent-skills（企業治理）的設計差異
- MCP server 設計（3 工具）可作為 AVIN 評估 MCP Potential 的對比案例
- 作為 GitHub note 或 AI signal 文章的素材（agent skills 治理與 MCP 整合方向）

## Required Permissions

- npm global install 或 npx（不需要安裝即可查看文件）
- cache 存放於 `~/.cache/agent-skills/`（Local file 讀寫）
- 不需要 API key（base）
- 部分 skill 可能需要特定服務憑證（視 skill 內容而定）

## Security Notes

- TypeScript 主語言（68.1%），安裝後涉及本地 cache 寫入
- npm global install 影響範圍需要確認
- 具有企業安全稽核流程（Snyk Agent Scan + human review + static analysis）——這是差異化優勢，但不代表可跳過 Security Checklist
- MCP server 的 3 個 tool 的 write permission 邊界在 document-only 階段尚未確認
- 在 Security Checklist 通過前，不應進入任何形式的安裝或整合

## MCP Potential

- Candidate
- 明確提供 MCP server（list_skills, search_skills, read_skill 3 個工具）
- MCP Potential Checklist 尚未逐條確認

## Test Plan

- 先讀 README，釐清 skills 的格式與調用方式
- 確認 MCP server 的實際 permission scope
- 確認 cache 存放路徑是否可控
- 只在 Security Checklist 通過後才考慮 npx 試用

## Test Material

- GitHub repo 首頁
- README.md（公開）
- MCP server 說明文件
- 安裝說明與支援 agent 清單

## External Output

- Document Only Review：`open-source-vault/reviews/tech-leads-club-agent-skills-document-only-review.md`
- Comparison Note：`open-source-vault/reviews/agent-skills-comparison-note.md`

## Comparison Note

- 與 mattpocock/skills 比較：個人維護（minimal）vs 企業治理（security-audited）
- 與 obra/superpowers 比較：skills 集合 vs 方法論框架
- Comparison Note 已建立：`open-source-vault/reviews/agent-skills-comparison-note.md`

## Decision

- Watch
- Document Only Completed

## Localized Final Version

- 尚無

## Published URL

- 尚無

## Lifecycle Status

- Document Only Review Completed

## Why It Looks Interesting

- 業界少見的「企業安全稽核等級 agent skills 市集」，差異化定位清楚
- 明確提供 MCP server，3 個工具（list_skills, search_skills, read_skill）是 MCP Potential 的強信號
- 多 agent 支援（Claude Code、Cursor、Cline 等）代表它在設計時就考慮跨 agent 互通性

## Suggested First Action

- Security Checklist（釐清 npm global install 邊界、cache 路徑可控性、MCP tool permission）

## Initial Risk Level

- Medium（有企業安全稽核，但 npm global install + cache 寫入需要確認邊界）

## Notes

- 從候選批次的「Agent Skills 類別」引入，與 mattpocock/skills 同批評估
- Document Only Review 後定位確認：這是有安全治理結構的 agent skills 市集，不是普通的 skill prompt 集合
