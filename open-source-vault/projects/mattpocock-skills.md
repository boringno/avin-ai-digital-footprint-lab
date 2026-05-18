# mattpocock/skills

## Source URL

- https://github.com/mattpocock/skills

## Date Added

- 2026-05-18

## Signal Source

- GitHub AI Capability Candidate Batch｜2026-05-18

## Why It Matters

- 這類 skills repo 可能提供可複用的 AI agent / coding / productivity 能力結構，適合 AVIN 研究「外部 skills 是否能轉成 AVIN OS 可理解、可本地化、可安全使用的能力模組」。
- 這不是正式導入，不是安裝紀錄，也不是推薦清單，只是候選項目卡。

## Trend Category

- Agent Skills
- Personal Productivity
- AI Coding

## Architecture Fit

- Hermes Agent Track
- open-source-vault
- Workflow Experiment
- Content Pipeline

## Potential Use Case

- 作為外部 skills 組織方式的參考樣本
- 幫助 AVIN 理解 skills repo 的欄位、命名、用途分層與本地化可能性
- 提供未來 GitHub note、comparison note 或內容輸出的素材角度

## Required Permissions

- 目前未知
- 初步假設不應要求高權限 token 才能做文件研究

## Security Notes

- 尚未完整研究內容，不應假設可直接導入
- 若後續要進一步 Practical Trial，需先確認是否涉及 local file access、token、package install 或不透明 script
- 在目前階段應先維持文件層級研究

## MCP Potential

- Watch
- 可能偏向 skill 組織參考，而不是直接視為 MCP 候選

## Test Plan

- 先讀 README 與目錄結構
- 判斷它提供的是技能模板、工作流片段、prompt 包裝，還是可執行能力模組
- 比較它與 AVIN 目前 `open-source-vault` / Hermes Agent Track 的關聯

## Test Material

- GitHub repo 首頁
- README
- 目錄結構
- 若有示例檔案，先只做文件研究

## External Output

- 尚未產生

## Comparison Note

- 可與 AVIN 現有的 skills / workflow / open-source-vault 文件相比較
- 目前先作為「外部 skills 結構研究樣本」，不視為已可導入的能力

## Decision

- Watch
- Document Only

## Localized Final Version

- 尚無

## Published URL

- 尚無

## Lifecycle Status

- Candidate Created

## Why It Looks Interesting

- 名稱直接指向 `skills`，與 AVIN 正在建立的能力模組、agent track 與 workflow abstraction 有高度關聯
- 可能有助於 AVIN 理解外部 skills repo 的設計語言，而不是只從零開始想像

## Suggested First Action

- Document Only

## Initial Risk Level

- Medium / Unknown

## Notes

- 請保守看待，不要因為名稱剛好對應 `skills` 就視為可直接整合
- 下一步若要深入，應先走 `security-checklist` 與 `practical-trial-lane`，而不是直接導入
