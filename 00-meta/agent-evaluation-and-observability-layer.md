# Agent Evaluation and Observability Layer｜Agent 評估與觀測層

## 1. 文件目的

這份文件用來補上 AI Digital Footprint OS 中，與 `Hermes Agent Track` 相關的 `Evaluation / Observability / Governance` 架構概念。

重點不是讓 agent 直接接管系統，而是先定義：

- agent 做了什麼要怎麼被看見
- agent 產生的輸出怎麼被審核
- agent 哪些事情不能直接做
- agent 與 AVIN Manual OS 的分工邊界是什麼

---

## 2. 為什麼 Agent 不只要能跑，還要能被觀測

一個 agent 能跑，不代表它值得被信任。

對 AVIN 目前的 OS 來說，更重要的是：

- 它做了什麼
- 它用到哪些工具
- 它碰了哪些檔案
- 它做出的輸出是否可接受
- 風險點在哪裡
- 最後是否值得升級成正式流程

如果沒有 observability，agent 很容易變成：

- 有輸出，但沒有脈絡
- 有結果，但不知道怎麼產生
- 有改動，但無法 review
- 有效率，但沒有 governance

所以第一階段的重點不是 agent autonomy，而是 agent traceability。

---

## 3. 這層跟 Hermes Agent Track 的關係

Hermes Agent Track 是未來的自主探索支線，不是 AVIN 主系統本身。

它的角色比較像：

- 探索者
- 候選輸入整理者
- import proposal 產生器
- 低風險試驗支線

Agent Evaluation and Observability Layer 則是 Hermes Agent Track 的邊界與觀測層，確保 Hermes 的輸出不會直接污染 Manual OS 的 source of truth。

---

## 4. Manual OS 與 Hermes Agent Track 的分工

### Manual OS = AVIN 手控主系統

由 AVIN 直接控制的主線系統，負責：

- 週回顧
- workflow judgment
- GitHub 文件
- Notion writeback
- 公開輸出
- productization judgment

### Hermes Agent Track = 自主探索支線

用來處理：

- 候選 trend / repo / tool 的低風險觀察
- agent-style intake
- import proposal
- activity log
- review-ready output

### Mac mini M4 = Hermes Agent Home Base

若未來 Hermes 長時間運行，Mac mini M4 可作為其固定執行與觀測基地。

### Windows 筆電 = AVIN Manual Command Cockpit

Windows 筆電仍然是 AVIN 的手控中樞，用來審核、判斷、接手、拒絕或升級 agent 輸出。

---

## 5. Agent Activity Log 應記錄什麼

每一次 agent 執行至少應留下：

- task
- input
- tools used
- files touched
- output
- risk notes
- human review
- final decision

建議最小格式：

```text
Task:
Input:
Tools used:
Files touched:
Output:
Risk notes:
Human review:
Final decision:
```

---

## 6. Agent Review Decisions

- Accept
- Edit
- Retry
- Reject
- Archive
- Promote to Manual OS

### Accept

輸出可接受，但仍停留在 agent 支線。

### Edit

方向有用，但需要 AVIN 手動修正。

### Retry

問題主要出在 prompt、scope 或 input，不是整體方向錯誤。

### Reject

結果不可信、風險過高、或與主線定位不合。

### Archive

暫時不採用，但保留紀錄以供未來回看。

### Promote to Manual OS

只有在 AVIN human review 後，才可升級到主系統流程或正式文件。

---

## 7. 不允許 Agent 直接做的事

- 改核心 Notion 資料庫
- 直接 push main
- 刪檔
- 搬移資料夾
- 使用高權限 token
- 自動發布社群內容

補充原則：

- Agent 不應直接改變主線 source of truth
- Agent 不應直接觸發公開發布
- Agent 不應持有超過任務所需的權限

---

## 8. 第一階段只做什麼

- 讀取指定資料
- 產生 Agent Project
- 提出 Import Proposal
- 等待 AVIN Review

也就是說，第一階段的 agent 任務是：

先觀察、先整理、先提案、先等待 review。

不是直接導入，不是直接整合，也不是直接接手主線。

---

## 9. 與 AI Digital Footprint OS 的關係

這一層不屬於 public content layer，也不等於 productization layer。

它比較接近：

- governance layer
- review layer
- traceability layer

它的存在，是為了讓未來 agent 能成為可控支線，而不是不可審查的黑箱。

---

## 10. 對 AVIN 當前階段的意義

在 Stage 2，AVIN 還是以公開研究、真實 workflow experiments、GitHub 文件化與公開 proof-of-work 為主。

因此這份文件的作用不是推動「全面 agent 化」，而是先把之後可能出現的 agent 支線邊界寫清楚。

這樣未來如果 Hermes Agent Track 要開始讀資料、寫 proposal、做候選整理，就不會和 Manual OS 混線。
