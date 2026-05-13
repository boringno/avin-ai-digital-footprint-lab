# Productization Opportunity Evaluation Test Plan
# 產品化機會評估測試計畫

## 1. Purpose｜目的

這份文件用來定義 AVIN 的 AI Digital Footprint OS 中，Productization Layer 的輕量評估方式。

Productization Layer 不是銷售管線。  
它是一個判斷層，用來評估一個已完成的 workflow 是否具備可複用資產潛力。

English definition:

> Productization Layer is not a sales pipeline.  
> It is a judgment layer for evaluating whether a completed workflow has reusable asset potential.

這一層的目的不是立刻賣產品、賣 Agent、賣自動化服務或賣腳本。

它的目的，是幫 AVIN 更冷靜地判斷：

> 哪些 workflow 只是一次性的實驗紀錄？  
> 哪些 workflow 可能值得被整理成可複用資產？

---

## 2. Why This Layer Exists｜為什麼需要這一層

AVIN 正在建立 AI Digital Footprint OS。

這個 OS 的核心不是介紹 AI 工具，而是把每天做 AI workflow、工具實測、內容實驗、社群發布、數據回收、人工判讀、GitHub 文件化、個人網站展示的過程，變成可以長期累積的公開資產。

隨著 workflow 越來越多，一定會有些東西開始出現可複用潛力，例如：

- Notion Template
- SOP
- Checklist
- Mini Workflow Kit
- Script
- Case Study
- Setup Guide
- Content Format Library
- Lightweight Implementation Kit

但不是每個完成的 workflow 都應該變成產品。

一個 workflow 不應該因為以下原因就被產品化：

- 技術上完成了
- 已經發成公開內容
- 有一個人表示好奇
- 貼文按讚數不錯
- 主題看起來很有市場
- 好像可以包成 Agent
- 好像可以自動化

Productization Layer 存在的原因，就是要避免太早把 workflow 推進產品化。

它幫 AVIN 問一個更保守、更重要的問題：

> 這個 workflow 真的具備可複用資產潛力嗎？

---

## 3. Relationship to AI Digital Footprint OS｜與 OS 五層架構的關係

AI Digital Footprint OS 目前有五層：

1. Work Layer｜工作層  
   每天做 AI workflow、工具實測、內容實驗。

2. Documentation Layer｜文件層  
   Notion 記錄、GitHub 文件化、Lifecycle Log、結構化筆記。

3. Public Output Layer｜公開輸出層  
   Threads、LinkedIn、Instagram、個人網站與其他公開內容。

4. Feedback Layer｜回饋層  
   API 數據回收、Notion 回寫、人工判讀與內容格式分析。

5. Productization Layer｜產品化判斷層  
   判斷完成的 workflow 是否具備可複用資產潛力。

Productization Layer 是第五層。

它不是取代前四層，也不是跳過前四層。

正確順序是：

Work  
→ Documentation  
→ Public Output  
→ Feedback  
→ Productization Judgment

不是：

Workflow completed  
→ Sell immediately

中文理解：

先做事。  
再記錄。  
再公開。  
再看回饋。  
最後才判斷是否值得產品化。

---

## 4. External Frameworks Reviewed｜外部框架檢視

這次檢視了幾個常見的產品與商業判斷框架。

目標不是整套採用。

目標是萃取其中適合 AVIN 的輕量欄位，並保留 AI Workflow Explorer 的定位。

---

### 4.1 Opportunity Solution Tree

適合參考的地方：

- 幫助區分機會與解法
- 避免一開始就 solution-first
- 先釐清問題空間，再思考解法

目前不適合完整採用的原因：

- 對目前階段來說太重
- AVIN 目前不需要完整產品探索系統
- 目前需要的是 judgment layer，不是完整 product discovery system

在地化採用：

- 保留 Opportunity Statement
- 避免從 workflow 直接跳到 product

---

### 4.2 Jobs To Be Done

適合參考的地方：

- 釐清使用者真正想完成的任務
- 區分「好奇」和「真需求」
- 幫助判斷這個 workflow 對誰有用

目前不適合完整採用的原因：

- 現階段還不需要完整 JTBD 訪談
- AVIN 還在收集公開訊號
- 大部分 workflow 還處於探索階段

在地化採用：

- 保留 Primary Job
- 問一句：這個資產幫誰完成什麼任務？

---

### 4.3 Lean Canvas

適合參考的地方：

- 協助思考問題、受眾、解法、優勢與通路
- 可以用來判斷一個點子是否具備商業結構

目前不適合完整採用的原因：

- 會太快把 workflow 推進產品或創業模式
- 容易過早討論定價、通路、收益
- AVIN 現階段重點是公開資產累積，不是立即產品上市

在地化採用：

- 保留 Unfair Advantage
- 保留 Strategic Fit
- 暫時不建立完整 Lean Canvas

---

### 4.4 Assumption / Hypothesis Testing

適合參考的地方：

- 找出最大風險假設
- 避免過度自信
- 區分證據與猜測

目前不適合完整採用的原因：

- 不是每個 workflow 都需要正式實驗設計
- 評估流程要保持輕量
- 現階段最大的風險是 overbuilding，不是 under-testing

在地化採用：

- 保留 Riskiest Assumption
- 定義 Validation Status
- 採用保守驗證規則

---

### 4.5 Product Idea Research & Scoring

適合參考的地方：

- 幫助比較多個產品化候選
- 避免只靠情緒或興奮感決策
- 建立可重複的判斷方式

目前不適合完整採用的原因：

- 欄位太多會變成營運負擔
- AVIN 現在不需要完整 product backlog
- 評分應該輔助判斷，不應該變成新的 dashboard 壓力

在地化採用：

- 採用 Quick Scorecard
- 只保留五個評分維度
- 保持候選評估簡單

---

## 5. Localized Framework for AVIN｜AVIN 在地化框架

這套框架要保持輕量。

每一個產品化候選，只需要最低限度的判斷欄位。

---

### 5.1 Opportunity Statement｜機會描述

簡短描述這個 workflow 背後的機會。

範例：

> 許多創作者和個人工作者會持續發布內容，但缺少一套能把內容成效資料回收到工作系統的方法。

---

### 5.2 Primary Job｜主要任務

這個 workflow 幫使用者完成什麼任務？

範例：

> 幫助個人創作者不用手動逐平台查看，也能把內容成效資料整理回自己的工作系統。

---

### 5.3 Unfair Advantage｜不公平優勢

AVIN 為什麼特別適合建立、解釋或文件化這個 workflow？

可能來源：

- 實際完成 workflow
- 正在公開建構
- 有內容策略背景
- 有短影音經驗
- 有 Meta 投放與數據優化經驗
- 有 Notion / GitHub 文件化實作
- 有 AI workflow 實驗經驗
- 能把技術流程轉成一般人看得懂的內容

---

### 5.4 Riskiest Assumption｜最大風險假設

這個 workflow 如果要變成可複用資產，最需要被驗證的假設是什麼？

範例：

> 其他創作者真的在意自動化內容成效回收，且願意使用、測試或付費取得一套可複用版本。

---

### 5.5 Validation Status｜驗證狀態

目前候選的驗證階段。

選項：

- Unvalidated｜尚未驗證
- Signal Detected｜已偵測到訊號
- Validated｜已驗證
- Invalidated｜已否定

---

### 5.6 Quick Score｜快速評分

使用五個維度進行 1 到 5 分評估。

總分：/25

---

### 5.7 Strategic Fit｜策略契合度

這個候選是否強化 AVIN 的長期定位：

AI Workflow Explorer / AI Operations Strategist

---

## 6. Productization Candidate Queue｜產品化候選池

未來可以建立 Productization Candidate Queue。

但它應該是 judgment board，不是 sales list。

它的用途是追蹤：

- 哪些完成的 workflow 可能具備可複用潛力
- 哪些候選已經出現 early interest signals
- 哪些候選應該保持 Raw
- 哪些候選未來可能進入 Refinable
- 哪些候選應該封存

Candidate Queue 不代表要賣。

放進 Candidate Queue 不代表：

- 一定要變產品
- 一定要變 Agent
- 一定要上架
- 一定要收費
- 一定要自動化

Candidate Queue 只是暫存區。

Scorecard 才是判斷工具。

---

## 7. Productization Quick Scorecard｜產品化快速評分表

每個候選使用五個維度評分。

每個維度 1 到 5 分。

總分：/25

---

### 7.1 Problem Severity｜問題嚴重度

這個問題有多痛、多急、多重要？

1 = 問題不明確  
2 = 輕微不便  
3 = 真實存在，但不急  
4 = 強烈且重複出現的問題  
5 = 急迫、昂貴或高度痛苦的問題

---

### 7.2 Unfair Advantage｜不公平優勢

AVIN 是否特別適合做這件事？

1 = 沒有明顯優勢  
2 = 有一些熟悉度  
3 = 有中度經驗  
4 = 有強烈脈絡優勢  
5 = 高度貼合 AVIN 的實作經驗、技能與公開定位

---

### 7.3 Execution Feasibility｜執行可行性

這個 workflow 是否能被包裝成可複用資產？

1 = 不清楚或太複雜  
2 = 可以，但很重  
3 = 可行，但需要整理  
4 = 明確可行  
5 = 容易包裝，也容易維護

---

### 7.4 Strategic Fit｜策略契合度

這個候選是否支持 AVIN 的 AI Workflow Explorer 定位？

1 = 偏離定位  
2 = 契合度弱  
3 = 可以接受  
4 = 契合度高  
5 = 核心定位高度契合

---

### 7.5 Validation Signal｜驗證訊號

目前外部是否出現真實興趣或需求？

1 = 沒有訊號  
2 = 微弱好奇  
3 = 重複興趣  
4 = 明確需求  
5 = 強需求或願意付費

---

## 8. Score Interpretation｜分數解讀

### 20-25

狀態：Refinable｜可精煉

代表：

這個候選有強烈潛力，值得整理成更清楚的可複用資產。

可能下一步：

- 整理 reusable kit 大綱
- 寫公開案例研究
- 建立輕量模板
- 測試手動版本
- 尋找 beta users
- 準備 offer hypothesis

---

### 15-19

狀態：Raw｜保持原料狀態

代表：

這個候選有潛力，但還需要更多訊號。

可能下一步：

- 繼續文件化
- 繼續公開說明
- 收集問題
- 觀察是否有重複痛點
- 避免太早銷售

---

### 10-14

狀態：Low Priority｜低優先

代表：

這個候選可能有趣，但現在不應該佔用焦點。

可能下一步：

- 保留作為參考
- 之後再回頭看
- 不主動包裝

---

### Below 10

狀態：Archive or Remove｜封存或移除

代表：

這個候選目前不夠對位，或不值得留在 active queue。

可能下一步：

- 封存
- 從 active review 移除
- 必要時保留成歷史紀錄

---

## 9. Conservative Upgrade Rule｜保守升級規則

一個候選只有在同時符合以下條件時，才可以從 Raw 進入 Refinable：

1. Validation Status = Signal Detected 或更高
2. Quick Score ≥ 20

這條規則用來避免 premature productization。

不要因為以下原因就升級候選：

- 一個人問了
- 一篇貼文表現不錯
- 技術上很酷
- 自己很興奮
- 好像可以變 Agent

Likes are not validation.  
Virality is not purchase intent.  
Curiosity is not demand.

中文理解：

按讚不是驗證。  
爆紅不是購買意圖。  
好奇不是需求。

---

## 10. Validation Status｜驗證狀態

### 10.1 Unvalidated｜尚未驗證

尚未出現有意義的外部訊號。

代表：

- 沒有人明確詢問
- 沒有重複痛點
- 沒有人要求模板、SOP、kit 或協助
- 沒有願意使用或付費的證據

大部分完成的 workflow 都應該先從這裡開始。

---

### 10.2 Signal Detected｜已偵測到訊號

已經出現早期訊號，表示這個 workflow 可能對其他人有用。

Interest signals 可能包括：

- 有人留言問怎麼做
- 有人私訊想要設定方式
- 有人問是否有模板
- 有人問 AVIN 能不能協助設定
- 有人清楚描述相同問題
- 不同平台重複出現同類問題
- 有人願意測試 MVP、kit、template 或 workflow

Signal Detected 不代表可以開始賣。

它只代表這個候選值得更密切觀察。

---

### 10.3 Validated｜已驗證

出現更強的證據，代表這個 workflow 具備可複用或商業潛力。

可能訊號：

- 多個人問同一件事
- 有人願意測試 workflow kit
- 有人實際使用 prototype
- 有人明確表示願意付費
- 有人實際付款
- 可重複的受眾輪廓變清楚
- 可交付形式變清楚

---

### 10.4 Invalidated｜已否定

證據顯示這個 workflow 目前不適合產品化。

可能原因：

- 大家只是好奇，但不行動
- 設定流程對目標受眾太難
- 支援成本太高
- 問題不夠痛
- 受眾不清楚
- 可複用形式太弱
- 不符合 AVIN 的定位

Invalidated 不代表這個 workflow 沒價值。

它只代表：

> 現在不要產品化。

---

## 11. Interest Signals｜興趣訊號

Interest Signals 可以包含：

- 公開留言問 workflow 怎麼做
- 私訊詢問模板或設定方式
- 不同人重複提出類似問題
- 有人問能不能使用同一套系統
- 有人想要 checklist、SOP 或 Notion template
- 有人問 AVIN 是否能協助實作
- 有人明確表示願意付費
- 有人願意測試 beta version
- Threads、LinkedIn、IG 或私訊中重複出現同類痛點

Weak signals 包含：

- 按讚
- 沒有脈絡的收藏
- 泛泛稱讚
- 單次好奇
- views
- impressions
- 單篇高成效貼文

重要原則：

High engagement does not equal validation.

一篇貼文可能因為有趣而表現好，不代表大家真的想要底層 workflow。

---

## 12. Test Case｜Threads API 自動成效回收

### 12.1 Workflow Summary｜工作流摘要

Threads MVP 1 完成了一個 public output loop，核心是自動化內容成效資料回收。

已完成項目包含：

- Threads URL Resolver
- Media ID handling
- Threads Insights API
- automated Notion writeback
- long-lived token exchange
- content format interpretation
- Threads / LinkedIn / Instagram 公開發布
- website project card update
- public output completion log

這一輪的正確策略主軸是：

> 我先完成了 Threads API 自動成效回收。

不是：

> 我提供自動化代操服務。  
> 我開始賣 Threads Agent。  
> 我找到爆款公式。

這是一個 AI Digital Footprint OS 內部的 documented workflow experiment。

---

### 12.2 Opportunity Statement｜機會描述

許多創作者、個人工作者和 solo builder 會跨平台發布內容，但缺少一套能把內容成效資料回收到工作系統的方法。

多數人仍然需要手動逐平台查看數據。

這會讓「發布」和「學習」中間斷掉。

Threads API 自動成效回收，未來可能成為一種可複用 workflow，幫助創作者建立內容回饋閉環，而不是只是不斷發文。

---

### 12.3 Primary Job｜主要任務

幫助創作者或個人工作者，把內容成效資料回收到結構化工作系統中，讓他們能長期回顧、比較和學習公開輸出的效果。

---

### 12.4 Unfair Advantage｜不公平優勢

AVIN 在這個 workflow 上有明顯優勢，因為它位在以下能力的交會處：

- 短影音內容策略
- 社群平台發布
- 數據回顧
- Meta 投放與成效優化背景
- Notion workflow design
- GitHub 文件化
- AI workflow 實驗
- building in public
- 把技術流程轉成創作者看得懂的內容

這不是抽象工具評論。

這是 AVIN 實際做過、記錄過、發布過、回收過的 workflow。

---

### 12.5 Riskiest Assumption｜最大風險假設

最大風險假設是：

> 其他創作者真的在意自動化內容成效回收，並願意採用、測試或付費取得一個可複用版本。

目前這個 workflow 技術上很強，策略上也高度對位。

但外部驗證訊號仍然不足。

---

### 12.6 Quick Scorecard｜快速評分

| Dimension｜維度 | Score｜分數 | Notes｜說明 |
|---|---:|---|
| Problem Severity｜問題嚴重度 | 4/5 | 創作者和內容工作者確實會遇到數據分散問題，但急迫程度因人而異。 |
| Unfair Advantage｜不公平優勢 | 5/5 | 高度符合 AVIN 的內容、數據、AI workflow 與公開文件化背景。 |
| Execution Feasibility｜執行可行性 | 4/5 | 可整理成 SOP、checklist、Notion template、script 或 mini workflow kit，但 API 權限與設定複雜度需考量。 |
| Strategic Fit｜策略契合度 | 5/5 | 直接支持 AI Workflow Explorer 與 AI Digital Footprint OS 定位。 |
| Validation Signal｜驗證訊號 | 1-2/5 | 已有公開輸出，但外部 interest signals 仍早期或不足。 |

Total Score｜總分：

19-20 / 25

---

### 12.7 Current Judgment｜目前判斷

Status｜狀態：

Raw

中文判斷：

高潛力，但需要等待更多 Interest Signals。

目前不應該直接進入 Refinable。

原因：

這個 workflow 內部強度高，但產品化需要外部證據。

正確下一步不是銷售。

正確下一步是繼續文件化、公開說明與收集訊號。

---

### 12.8 Possible Future Product Types｜未來可能產品形式

如果未來出現更強訊號，可能的可複用資產形式包含：

- Script
- Notion Template
- SOP
- Checklist
- Mini Workflow Kit
- Case Study
- Setup Guide
- Content Feedback Loop Template
- Creator Analytics Review Kit

---

### 12.9 What Not To Do For This Case｜這個案例現在不要做什麼

不要：

- 直接賣 Agent
- 直接賣 Script
- 立刻做付費產品
- 包裝成自動化代操服務
- 把按讚當成需求
- 把單篇貼文表現當成產品驗證
- 在需求更清楚前過度建 Notion 系統

---

## 13. Decision Rules｜決策規則

一個完成的 workflow 不應該直接變成產品，除非它具備：

1. 明確問題  
2. 具體受眾  
3. 可觀察的興趣訊號  
4. 可複用交付形式  
5. 可承受的支援風險  
6. 與 AVIN 的 AI Workflow Explorer 定位高度一致  

一個 workflow 可以成為產品化候選，當它：

- 解決重複出現的問題
- 可以被清楚解釋
- 具備可複用結構
- 有外部對象表達明確興趣
- 交付形式不會太重
- 能強化 AI Digital Footprint OS

一個 workflow 應該先保持 documentation 狀態，當它：

- 主要價值是 proof of work
- 支持定位，但還沒有需求訊號
- 太複雜，不適合包裝
- 需要過高客製化支援
- 尚未有清楚受眾

---

## 14. What Not To Do｜不要做什麼

不要把每個 workflow 都變成 Agent。

不要把每個完成的 workflow 都變成付費產品。

不要在一篇公開輸出後就急著賣。

不要把爆紅當成 validation。

不要只看按讚數。

不要建立過重的商業分析流程。

不要現在做完整 Notion 自動化。

不要讓 Productization Layer 變成壓力來源。

不要讓 productization 取代 documentation。

不要讓產品化把 AVIN 的定位寫歪成：

- AI master
- AI tool reseller
- automation operator
- generic consultant
- medical aesthetics-only marketer
- 爆款公式販賣者

Productization Layer 應該支持 AVIN 的定位：

AI Workflow Explorer / AI Operations Strategist

---

## 15. Final Recommendation｜最終建議

### Adopt｜採用

Quick Scorecard

原因：

它輕量、可重複、實用。

它可以幫 AVIN 比較產品化候選，而不需要建立過重的 product management system。

---

### Localize｜在地化

採用以下框架的部分欄位：

- Opportunity Solution Tree
- Jobs To Be Done
- Lean Canvas
- Assumption / Hypothesis Testing
- Product Idea Research & Scoring

在地化欄位：

- Opportunity Statement
- Primary Job
- Unfair Advantage
- Riskiest Assumption
- Validation Status
- Quick Score
- Strategic Fit

---

### Reject For Now｜目前拒絕

目前不採用：

- 完整 Opportunity Solution Tree
- 完整 Jobs To Be Done process
- 完整 Lean Canvas
- 完整 product management workflow
- 完整 Notion automation
- direct agent sales pipeline
- immediate product launch process

---

### Next Step｜下一步

先寫這份 OS 文件。

不要現在改 Notion。

不要現在建立完整 Productization Candidate Queue 自動化。

不要現在承諾銷售任何產品。

下一個務實步驟是新增這個檔案：

04-workflows/productization-opportunity-evaluation-test-plan.md

Suggested commit message:

docs: add productization opportunity evaluation test plan
