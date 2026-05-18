# MCP Potential Checklist｜MCP 潛力檢查表

## 1. 文件目的

這份文件用來定義 `open-source-vault` 中的 `MCP Potential Check`。

目的不是把每個 repo 都往 MCP 化推，而是判斷某個工具、repo 或能力，是否有機會變成安全、可控、可重複使用的 MCP / Agent tool 候選。

---

## 2. MCP Potential Check 在 open-source-vault 的位置

`open-source-vault` 應該被視為觀察區、候選區、比對區，而不是直接導入區。

MCP Potential Check 放在這裡，是為了讓 AVIN 在面對外部 repo 或工具時，先回答：

- 這個東西是不是值得看
- 值得看到哪一層
- 它有沒有 MCP / Agent tool 形態的潛力
- 它的權限與風險是否可控

這份檢查表是 open-source-vault 的前置判讀層。

---

## 3. 檢查問題

### 是否有 CLI？

如果沒有 CLI，是否仍有清楚的可呼叫介面。

### 是否有 API？

如果沒有 API，是否至少有清楚的本地 command interface。

### 是否能本地執行？

本地可執行性會影響 sandbox、repeatability 與安全邊界。

### 是否有清楚 input / output？

如果 input / output 不清楚，就不適合作為 agent 可調用工具。

### 是否需要 API key？

需要的話，是否能做權限隔離與最小權限管理。

### 是否會讀寫 local files？

如果會，需要先判斷 scope 能否限制。

### 是否會連外部服務？

如果會，需明確知道目的地、資料流與潛在成本。

### 是否有權限範圍限制？

沒有清楚權限邊界的工具，不適合直接放進 agent flow。

### 是否有清楚 license？

license 不清楚，先不要進一步整合。

### 是否有活躍維護？

若已停止維護，風險與後續成本會升高。

### 是否有測試？

沒有測試不代表不能看，但代表可信度與維護成本較差。

### 是否能 sandbox？

如果不能被 sandbox，代表導入門檻與風險都更高。

### 是否能被 Agent 安全呼叫？

這是最後一關。不是「能跑」就等於「適合 agent 呼叫」。

---

## 4. 建議評估格式

```text
Repo / Tool:
URL:
Primary function:
CLI:
API:
Local execution:
Input / output clarity:
Credential need:
Local file access:
External service access:
Permission boundary:
License:
Maintenance status:
Tests:
Sandbox potential:
Agent-safe callable:
Decision:
Notes:
```

---

## 5. Decision

- Not MCP Fit
- Watch
- Light Test
- Candidate
- Reject for Security Risk

### Not MCP Fit

這個東西可能有研究價值，但不適合作為 MCP / Agent tool 方向。

### Watch

值得觀察，但還不應投入測試成本。

### Light Test

可先做低風險驗證，確認 interface 與風險邊界。

### Candidate

初步看起來有潛力，可以進一步進測試計畫或 import proposal。

### Reject for Security Risk

安全、權限、供應鏈、license 或文件成熟度不合理，先拒絕。

---

## 6. 與既有 External Skill Evaluation Rule 對齊

MCP Potential Check 不應跳過 AVIN 已有的外部能力判讀流程。

應對齊以下節奏：

```text
Test Plan
-> Test Material
-> External Output
-> Comparison Note
-> Decision
-> Localized Final Version
-> Production
-> Published URL 回寫
-> Lifecycle Completed
```

差別在於：

- `External Skill Evaluation Rule` 比較偏輸出品質、本地化與 adopt / localize / merge / reject
- `MCP Potential Check` 比較偏 interface、risk、sandbox、agent-safe callable 與治理邊界

兩者應互相補強，而不是互相取代。

---

## 7. 不要把 MCP 當成 default destination

不是每個 repo 都該變成 MCP。

以下情況應特別保守：

- 只適合人手操作，不適合程序化呼叫
- 需要高權限 token
- 會大範圍讀寫本地檔案
- 文件不完整、license 不明或維護不穩
- 沒有可重複的 input / output

AVIN 的標準不是「能不能接」，而是「接了之後是否更安全、更可控、更可觀測」。

---

## 8. 對 Stage 2 的意義

這份文件支持的是：

- 觀察新工具
- 評估 MCP / agent 潛力
- 不急著導入
- 先建立判讀與風險框架

它本身不是產品化工作，也不是導入新基礎設施的指令。

它只是讓 AVIN 在 public research 階段，就先累積一套對外部能力 intake 的判斷方法。
