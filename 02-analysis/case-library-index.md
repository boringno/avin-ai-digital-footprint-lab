# Case Library Index｜案例資產庫索引

## 文件用途

本文件是 AVIN AI Digital Footprint OS 的案例資產索引。
記錄哪些工作成果可以轉化為正式案例，追蹤案例的 lifecycle 狀態，並定義案例的標準格式。

不是案例本身，不是展示頁，不是銷售材料。

最後更新：2026-05-21

---

## 1. 案例標準格式

每個案例應包含以下要素（v1 草案，可隨案例累積調整）：

| 欄位 | 說明 |
|---|---|
| **案例名稱** | 簡短可識別的名稱 |
| **案例類型** | 工作流自動化 / 方法論引入 / 工具評估 / 系統設計 / 服務驗證 |
| **時間** | 執行期間 |
| **問題背景** | 原本的狀況或痛點是什麼？ |
| **解決方向** | 採用什麼方法 / 工具 / 流程？ |
| **執行過程** | 實際做了哪些步驟？（可簡述）|
| **輸出成果** | 產生了什麼可見的結果？文件、SOP、系統、工具配置？ |
| **驗證信號** | 有什麼指標或回饋確認它有效？ |
| **可複用性** | 這個案例的哪些部分可以被他人複用？ |
| **公開狀態** | 是否可公開？以什麼形式公開（GitHub / LinkedIn / Threads / IG）？ |
| **GitHub 路徑** | 案例相關文件的 repo 路徑 |

---

## 2. 現有案例候選清單

### 第一批候選（已有足夠記錄，可轉化）

| # | 案例候選 | 類型 | 現況 | 公開潛力 | 轉化優先度 |
|---|---|---|---|---|---|
| 1 | obra/superpowers Localize — Rule 12 + Task Spec Format | 方法論引入 | **Completed** — 完整 lifecycle 記錄 | 高（GitHub + LinkedIn 文章）| **高** |
| 2 | Threads MVP 1 — 手動發布 + 自動 insights sync | 工作流自動化 | **Completed** — 有完整 SOP、Notion 整合、lifecycle 文件 | 高（最易理解，有可見輸出）| **高** |
| 3 | rohitg00/agentmemory Security Review | AI 工具評估 | **Completed** — 8 維度安全評估，Medium-High Risk 判定 | 中（AI Signal 文章素材）| **中** |

### 第二批候選（已有基礎，需要補充記錄）

| # | 案例候選 | 類型 | 現況 | 需要補充 | 優先度 |
|---|---|---|---|---|---|
| 4 | open-source-vault 治理系統整體 | 系統設計 | Active — 最完整但最複雜 | 需要整合成可對外說明的版本 | **中** |
| 5 | AI 工作流診斷框架（顧問診斷）| 服務方法論 | Draft — 17 段問卷 + scorecard 存在 | 需要真實對話案例佐證 | **中低** |
| 6 | AI Tool Status Radar — IG Carousel | 內容輸出案例 | Completed（2026-05-11 已發布）| 需要整理觸及數據與回饋 | **低中** |

### 第三批候選（訊號存在，暫觀察）

| # | 案例候選 | 類型 | 現況 | 說明 |
|---|---|---|---|---|
| 7 | crewAIInc/crewAI Document Only Review | AI 工具評估 | 未啟動（新批次候選）| 完成後可作為 multi-agent 評估案例 |
| 8 | openclaw/openclaw Document Only Review | 系統評估 | 未啟動（新批次候選）| 完成後可作為 full agent OS 評估案例 |
| 9 | 實際顧問診斷對話 | 服務驗證 | 尚未發生 | 需要真實客戶場景才能建立 |

---

## 3. 第一批案例候選詳述

### 案例 1｜obra/superpowers Localize — Rule 12 + Task Spec Format

**案例類型：** 方法論引入

**時間：** 2026-05-19

**問題背景：**
AVIN 在執行 AI 工具評估與 Claude Code 任務指派時，缺乏標準化的設計核准機制，導致執行前設計與執行後結果容易偏差。

**解決方向：**
從 GitHub 開源工具 obra/superpowers 的工作流方法論中，提取「設計核准檢查點」的概念，localize 進 AVIN OS。

**執行過程：**
1. Document Only Review（只讀文件，不安裝）
2. Security Checklist（安全評估，Risk Level Medium）
3. Practical Trial Phase 1（安裝嘗試，被 Node 版本封鎖）
4. Manual Methodology Trial（改用手動方式驗證方法論）
5. Workflow Experiment（正式 localize：Rule 12 + Section H + Agent Task Spec Template）

**輸出成果：**
- `Rule 12 — Design Approval Gate`（加入 OS Trigger Rules）
- `Section H — Task Spec Format`（File / Output / Verification 三段格式）
- `04-workflows/templates/agent-task-spec-template.md`（可複用的任務交辦模板）
- `open-source-vault/practical-trials/obra-superpowers-manual-methodology-trial.md`

**驗證信號：**
- Rule 12 首次正式試跑（agent-task-spec-template 任務）驗證通過
- 後續所有多文件任務均走 Rule 12 流程，未出現設計偏差

**可複用性：**
- Rule 12 本身即可複用（任何 3 個以上新文件的任務）
- Agent Task Spec Template 可複用（Claude Code / Codex 任務交辦）
- Document Only → Security → Trial 的評估流程可複用

**公開狀態：** 可公開，建議形式：GitHub Article + LinkedIn 文章（「我如何把開源工具的方法論引入自己的 AI OS」）

**GitHub 路徑：**
- `open-source-vault/practical-trials/obra-superpowers-manual-methodology-trial.md`
- `00-meta/os-trigger-rules-and-command-library.md`（Rule 12 + Section H）
- `04-workflows/templates/agent-task-spec-template.md`

---

### 案例 2｜Threads MVP 1 — 手動發布 + 自動 Insights Sync

**案例類型：** 工作流自動化

**時間：** 2026-05-11~12

**問題背景：**
AVIN 在 Threads 發文後，無法系統性地收集每篇貼文的觸及、互動、與追蹤者成長數據，導致無法驗證內容方向。

**解決方向：**
建立 MVP 1：手動發文 + 自動 Insights Sync（local script + Threads API + Notion writeback），讓數據自動回流，不依賴手動記錄。

**執行過程：**
1. 確認 Threads API 可取得的數據範圍
2. 設計 Notion 資料庫結構（fields spec）
3. 建立 local script（no-n8n）
4. 手動測試發布流程
5. 驗證 insights sync 是否正確寫入 Notion

**輸出成果：**
- `04-workflows/threads-mvp-1-no-n8n-local-script-spec.md`（技術規格）
- `04-workflows/threads-mvp-1-notion-fields-spec.md`（Notion 欄位設計）
- `04-workflows/threads-mvp-1-manual-test-checklist.md`（測試清單）
- `04-workflows/threads-mvp-1-manual-publish-auto-insights-sync.md`（完整 SOP）

**驗證信號：**
- MVP 1 lifecycle completed（2026-05-12）
- Notion writeback 正常運作（有 completion log 記錄）

**可複用性：**
- no-n8n local script 架構可套用於其他 API sync 場景
- Notion fields design 可作為其他數據同步的模板
- MVP → 驗證 → 下一版 的迭代節奏可複用

**公開狀態：** 可公開，建議形式：Threads 系列貼文（「我如何讓 AI 數位足跡自動化」）+ LinkedIn 文章

**GitHub 路徑：**
- `04-workflows/threads-mvp-1-*.md`（4 個相關文件）

---

### 案例 3｜rohitg00/agentmemory Security Review — AI 工具安全評估示範

**案例類型：** AI 工具評估

**時間：** 2026-05-19

**問題背景：**
面對「agentmemory」這類涉及資料儲存、lifecycle hooks、MCP tools 的 AI 工具，如何系統性評估其安全邊界，在不安裝的前提下做出有依據的決策？

**解決方向：**
套用 open-source-vault 的 Security Checklist 流程（Rule 11），從公開文件進行 8 維度安全分析。

**執行過程：**
1. Document Only Review（讀 README、架構說明）
2. Security Checklist Prep（確認評估範圍）
3. Security Checklist 執行（8 維度逐項分析）
4. 最終決策：Risk Level Medium-High，Practical Trial 暫緩，記錄 5 項阻礙

**輸出成果：**
- `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist.md`
- 8 維度風險評估表
- 5 項 Practical Trial 阻礙清單

**驗證信號：**
- 決策有明確依據（不是主觀判斷，是逐維度分析）
- 阻礙清單可作為後續版本更新的檢查依據

**可複用性：**
- Security Checklist 8 維度框架可複用
- 「只讀文件就能做出有依據決策」的方法論可複用
- 可作為「AI 工具引入前必須做什麼」的教學示範

**公開狀態：** 中（部分可公開）。建議形式：AI Signal 觀察文章（「我為什麼不試這個 AI Memory 工具」），需去掉內部細節

**GitHub 路徑：**
- `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist.md`
- `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist-prep.md`

---

## 4. 案例 → 公開內容橋接邏輯

| 案例 | 可轉化的公開形式 | 平台建議 |
|---|---|---|
| obra/superpowers Localize | 「如何把開源工具方法論引入個人 AI OS」| LinkedIn 文章 + GitHub Article |
| Threads MVP 1 | 「AI 數位足跡自動化：我的 MVP 1 怎麼做」| Threads 系列 + LinkedIn |
| agentmemory Security Review | 「我為什麼不試這個 AI Memory 工具（含評估過程）」| Threads + LinkedIn AI Signal 系列 |
| open-source-vault 整體 | 「我如何評估 AI 工具：open-source-vault 治理系統介紹」| GitHub README + LinkedIn 長文 |

---

## 5. 案例格式版本記錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1 | 2026-05-21 | 初版，13 欄位標準格式草案，3 個正式案例候選詳述 |

---

## 6. 關聯文件

| 文件 | 關係 |
|---|---|
| `00-meta/public-identity-layer.md` | 代表作候選來源 |
| `04-case-studies/threads-engine-2-to-digital-footprint-3.md` | 既有案例示範格式 |
| `03-offers/ai-workflow-consulting-and-case-building-strategy.md` | Case Building Sprint 的輸出格式定義 |
| `02-analysis/idea-opportunity-radar.md` | 案例信號 → 產品化判斷的橋接點 |
| `04-workflows/productization-opportunity-evaluation-test-plan.md` | 案例是否進入產品化的判斷框架 |
