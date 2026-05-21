# Case Candidate Index｜案例候選索引（探索期）

## 文件定位

這是探索期的案例候選索引，不是成熟案例庫。

AVIN 目前處於工作流研究與系統建立的早期階段。
這份文件記錄的是：哪些工作成果「可能」在未來成為正式案例或服務素材。

「候選」的意思是：有足夠的記錄可以被轉化，但目前尚未完成轉化，也尚未經過外部驗證。

最後更新：2026-05-21

---

## 候選記錄格式

每個候選記錄：
- 目前狀態（實驗階段）
- 定性（exploration evidence / workflow experiment / content candidate 等）
- 可公開程度
- 可轉內容的潛力
- 可轉服務素材的潛力
- 是否已有外部驗證
- 仍缺什麼證據
- 下一步觀察方式

---

## 第一批案例候選

### 候選 1｜obra/superpowers Localize

**定性：** Methodology adoption experiment / exploration evidence

**現況：**
- Workflow experiment completed（2026-05-19）
- 方法論引入（Rule 12 + Task Spec Format）localize completed
- 完整 lifecycle 記錄存在（open-source-vault 內部文件）

**不宣稱：**
- 不是商業成功案例
- 不是已被外部採用的方法論
- 不是市場驗證的服務交付物

**可公開程度：** 中高（技術細節可公開，需要整理成外部可讀語氣）

**可轉內容潛力：** 高
- 適合主題：「我如何把開源工具的方法論引入個人 AI OS」
- 平台建議：GitHub Article / LinkedIn 長文
- 目前缺：對外可讀版本（內部評估文件 → 外部受眾語氣改寫）

**可轉服務素材潛力：** 中（未來）
- 展示能力方向：系統化評估工具、引入外部方法論的能力
- 尚缺：客戶場景佐證

**外部驗證：** 無

**仍缺什麼：**
- 外部讀者的回饋或引用
- 有人實際採用此方法論的記錄

**下一步觀察：**
1. 撰寫對外可讀版本（content candidate 轉化）
2. 發布後觀察是否有回饋

**相關文件：**
- `open-source-vault/practical-trials/obra-superpowers-manual-methodology-trial.md`
- `00-meta/os-trigger-rules-and-command-library.md`（Rule 12 + Section H）
- `04-workflows/templates/agent-task-spec-template.md`

---

### 候選 2｜rohitg00/agentmemory Security Review

**定性：** AI tool risk judgment content candidate

**現況：**
- Security checklist completed（2026-05-19）
- Risk Level：Medium-High
- Decision：Watch（不進入 Practical Trial，目前）
- 8 維度分析，5 項阻礙條件記錄

**不宣稱：**
- 不是採用案例
- 不是工具的正式安全評測（僅基於公開文件分析）
- 不代表工具本身有安全漏洞，只代表目前未達到 AVIN 的安全試用門檻

**可公開程度：** 中（評估框架與結論可公開，需去掉過多內部細節）

**可轉內容潛力：** 高
- 適合主題：「我為什麼不試這個 AI Memory 工具（含評估過程）」
- 平台建議：Threads + LinkedIn AI Signal 系列
- 目前缺：對外版改寫（內部報告語氣 → 讀者導向文章語氣）

**可轉服務素材潛力：** 中（未來）
- 展示能力方向：有系統的 AI 工具安全評估能力
- 尚缺：在客戶選工具場景中如何應用此框架的說明

**外部驗證：** 無

**仍缺什麼：**
- 外部讀者回饋（此評估對他人是否有參考價值）
- 方法論被引用或複用的記錄

**下一步觀察：**
1. 把 Security Checklist 框架整理成外部可讀文章
2. 發布後觀察是否有人詢問「如何評估其他工具」

**相關文件：**
- `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist.md`
- `open-source-vault/security-reviews/rohitg00-agentmemory-security-checklist-prep.md`

---

### 候選 3｜Threads MVP 1 / Meta Publishing Feedback Loop

**定性：** Workflow automation case candidate

**現況：**
- MVP 1 lifecycle completed（2026-05-12）
- 手動發布 + 自動 insights sync
- 完整 SOP、Notion 整合記錄、lifecycle 文件存在

**不宣稱：**
- 不是完整自動化產品
- 不是可直接商業化的工具
- 不是已有規模效益或使用者數量的系統

**可公開程度：** 高（技術細節清楚，SOP 可公開）

**可轉內容潛力：** 高
- 適合主題：「AI 數位足跡自動化：我的 MVP 1 怎麼做」
- 平台建議：Threads 系列 / LinkedIn
- 目前缺：整理成外部讀者可理解的版本（去掉 AVIN 專屬語境）

**可轉服務素材潛力：** 中低（目前偏個人工具，複用場景不明確）

**外部驗證：** 弱
- Threads 有發布，但無法確認外部是否理解或採用此架構

**仍缺什麼：**
- 外部讀者的互動回饋（此工作流對他人是否有參考價值）
- MVP 2 的進展（才能說明迭代可行性）

**下一步觀察：**
1. 把 MVP 1 整理成 Threads 系列貼文
2. 觀察回饋信號，決定是否推進 MVP 2

**相關文件：**
- `04-workflows/threads-mvp-1-*.md`（4 個相關文件）
- `04-workflows/meta-publishing-feedback-loop.md`

---

### 候選 4｜OS Control Panel

**定性：** System management layer candidate

**現況：**
- Static dashboard built（2026-05-18）
- UI/UX 架構、雙語切換、導覽結構完成
- Lifecycle completed

**不宣稱：**
- 不是成熟產品
- 不是可對外部署的系統
- 不是有實際使用者的工具

**可公開程度：** 中（視覺可公開，但主要是個人 OS 管理工具）

**可轉內容潛力：** 中
- 適合主題：「我的 AI OS 管理層長什麼樣子」
- 平台建議：IG / LinkedIn（截圖展示）
- 目前缺：外部讀者能理解的說明框架（OS Control Panel 是什麼、解決什麼問題）

**可轉服務素材潛力：** 低（目前高度個人化，不易複用）

**外部驗證：** 無

**仍缺什麼：**
- 外部讀者能理解的說明角度
- 有人對個人 AI OS 設計表達興趣的信號

**下一步觀察：**
1. 先發布 Threads/IG 截圖，觀察反應
2. 若有回饋，再考慮是否整理成外部可用的框架

**相關文件：**
- `00-project-log/2026-05-18-os-control-panel-*.md`（多份完成記錄）

---

## 候選轉化優先序

| 候選 | 轉內容優先 | 轉服務素材 | 建議下一步 |
|---|---|---|---|
| obra/superpowers Localize | **高** | 中（未來）| 撰寫外部可讀文章 |
| agentmemory Security Review | **高** | 中（未來）| 撰寫 AI Signal 評估文章 |
| Threads MVP 1 | **高** | 中低 | 整理成 Threads 系列貼文 |
| OS Control Panel | 中 | 低 | 先觀察，不急著轉化 |

---

## 轉化前需要的決策

在任何候選正式轉化為「案例」或「服務素材」之前，需確認：

1. **外部可讀版本**：內部文件 → 外部讀者可理解的語氣改寫完成
2. **不誤導的說法**：不把 workflow experiment 說成 commercial case
3. **AVIN 的位置說明**：誠實標注「這是我自己的學習記錄，不是完整商業交付」
4. **外部回饋收集**：發布後觀察反應，再決定是否進一步推進

---

## 關聯文件

| 文件 | 關係 |
|---|---|
| `00-meta/public-identity-layer.md` | 身份草案，與案例候選互相支撐 |
| `02-analysis/idea-opportunity-radar.md` | 案例信號 → 產品化判斷的橋接點 |
| `04-case-studies/threads-engine-2-to-digital-footprint-3.md` | 既有案例參考格式 |
| `03-offers/ai-workflow-consulting-and-case-building-strategy.md` | 服務素材轉化的策略文件 |
