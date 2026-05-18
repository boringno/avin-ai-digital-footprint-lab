# Open Source Vault｜開源能力觀察庫

## 1. open-source-vault 是什麼

`open-source-vault` 是 AVIN AI Digital Footprint OS 中，用來觀察、評估、篩選外部開源能力的輕量治理區。

它的用途不是直接收納所有熱門 repo，而是先幫 AVIN 建立一個可判斷、可比較、可延後決策的中間層，讓外部能力在進入主系統前，先經過結構化 review。

---

## 2. 它不是什麼

它不是：

- 技術收藏夾
- 熱門 repo 清單
- skills 直通車
- 自動導入區
- 產品化模組池
- 安裝指令中心

換句話說，`open-source-vault` 不是為了「多收一些工具」，而是為了「少做錯一些導入」。

---

## 3. 為什麼 AVIN 需要它

AVIN 目前在 Stage 2 的主線，是公開研究、真實 workflow experiment、GitHub 文件化與 public proof-of-work。

在這個階段，會持續看到：

- GitHub repo
- MCP server
- agent framework
- AI coding tool
- AI video workflow
- developer utility
- social discussion 帶出的外部能力候選

如果沒有中間治理層，外部能力很容易直接變成：

- 想先 clone
- 想先安裝
- 想先接進 workflow
- 想先塞進 skills/

這樣會讓 source of truth、權限邊界、風險與架構契合度都變得模糊。

`open-source-vault` 的作用，就是讓 AVIN 先觀察、先判讀、先做 capability extraction，再決定要不要進一步動手。

---

## 4. 它在 AI Digital Footprint OS 的位置

`open-source-vault` 應該被放在：

- AI Trend Intake Layer 後段
- 真正導入主系統之前

建議關係：

```text
AI Trend Signal
-> Intake Review
-> open-source-vault
-> Security Check
-> MCP Potential Check
-> Test Plan
-> Workflow Experiment
-> Decision
-> Localized Final Version / Production / Archive
```

它比較像外部能力的治理與候選區，不是工作主線本身。

---

## 5. 外部 repo 不能直接進 skills/

外部 repo 不應該直接進 `skills/`。

原因很簡單：

- 外部 repo 不一定符合 AVIN 當前架構
- 不一定安全
- 不一定有清楚 input / output
- 不一定適合 agent 呼叫
- 不一定值得長期維護

在進到 `skills/` 或任何主線能力層之前，至少應先經過：

- intake review
- security check
- capability extraction

這樣才不會把「外部能力」誤當成「已經適合 AVIN 系統」。

---

## 6. 與 AI Trend Intake Layer、MCP Potential Check 的關係

### 與 AI Trend Intake Layer 的關係

AI Trend Intake Layer 負責回答：

- 這是不是有效 signal
- 它屬於哪一類 trend
- 跟哪個架構層有關
- 值不值得看

`open-source-vault` 則負責把「值得看」的外部能力放到可治理的候選區。

### 與 MCP Potential Check 的關係

MCP Potential Check 不是 `open-source-vault` 的全部，而是其中一個檢查角度。

它主要回答：

- 這個候選有沒有 MCP / Agent tool 潛力
- 權限與 interface 是否可控
- 是否適合做 light test 或 sandbox 評估

所以順序不是：

`看到 repo -> 直接 MCP 化`

而是：

`看到 repo -> intake review -> security check -> MCP potential check -> decision`

---

## 7. Stage 2 只做輕量治理

目前 Stage 2 不需要把 `open-source-vault` 做成重系統。

現階段只需要：

- 有明確用途
- 有檢查流程
- 有安全邊界
- 有單一候選模板
- 有 decision vocabulary

不需要：

- 自動同步工具庫
- repo ingestion pipeline
- agent 自動導入
- 完整產品化資料模型

這一層的目標，是讓 AVIN 在 public research 階段就先把治理概念寫清楚，而不是提前進入過度基礎建設。

---

## 8. 核心原則

- 不是每個熱門 repo 都值得導入
- 不是每個 MCP 都值得接
- 不是每個 agent framework 都要試
- 外部能力要先判斷 architecture fit 與 risk level
- decision 應該可回寫、可追蹤、可拒絕

`open-source-vault` 的價值，不在收更多，而在判斷更準。
