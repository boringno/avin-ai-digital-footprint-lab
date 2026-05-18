# Open Source Vault Workflow｜開源能力治理流程

## 1. 文件目的

這份文件用來定義外部候選項目進入 `open-source-vault` 的標準流程。

目的不是加快導入，而是讓外部 repo、工具、MCP server、agent framework 或 workflow 候選，在進主線前先經過可回顧的治理步驟。

---

## 2. 標準流程

```text
GitHub / External Signal
-> Intake Review
-> Security Checklist
-> MCP Potential Check
-> Test Plan
-> Test Material
-> External Output
-> Comparison Note
-> Decision
-> Localized Final Version
-> Production
-> Published URL 回寫
-> Lifecycle Completed
```

---

## 3. 各步驟說明

### GitHub / External Signal

來源可以是 GitHub repo、paper、tool launch、MCP server、agent discussion、workflow note 或社群討論。

### Intake Review

先確認這個候選：

- 是否真的是有效 signal
- 是否與 AVIN 當前 Stage 2 有關
- 是否有 architecture fit
- 是否值得進一步看

### Security Checklist

先看權限、token、shell、browser、外部服務、license、sandbox 與本地檔案存取風險。

### MCP Potential Check

判斷它是不是有 MCP / Agent tool 潛力，而不是只因為名字有 `MCP` 或 `Agent` 就高估。

### Test Plan

定義最小測試目的、假設、邊界與完成條件。

### Test Material

決定用什麼材料來驗證，而不是無限制地開新範例或新專案。

### External Output

記錄原始輸出、repo 行為或外部工具產物。

### Comparison Note

比較外部候選與 AVIN 當前主線需求的差距、重疊與風險。

### Decision

在這一步做出明確判斷，而不是模糊地保留。

### Localized Final Version

只有值得納入時，才進一步做本地化、精簡化或結構對齊。

### Production

真正進入主線使用、公開輸出或穩定流程。

### Published URL 回寫

若有公開成果，回寫對應 URL。

### Lifecycle Completed

完成後留下 lifecycle log，避免只在聊天或測試過程中留下痕跡。

---

## 4. Decision 選項

- Watch
- Light Test
- Localize
- Merge
- Reject
- Archive

### Watch

先追蹤，不做實作導入。

### Light Test

值得做小型、低風險驗證。

### Localize

有價值，但需要明確本地化，不能原封不動搬進來。

### Merge

已足夠成熟，且與現有系統高度契合，可整合進主線。

### Reject

與定位不合、風險過高、或成本不值得。

### Archive

目前不優先，但保留記錄供未來回看。

---

## 5. 明確限制

- 不是每個 repo 都要導入
- 不是星星很多就導入
- 不是看到 Agent / MCP 就導入
- 不是能跑就等於該接進 OS

真正要先判斷的是：

- architecture fit
- risk level
- workflow relevance
- public documentation value
- 是否值得 AVIN 花時間做 human review

---

## 6. 與 Stage 2 的關係

Stage 2 的重點是：

- public research
- real workflow experiments
- GitHub documentation
- public output

因此 `open-source-vault` workflow 的功能，是幫 AVIN 管理外部能力 intake，不是建立完整的外部能力平台。

---

## 7. 建議使用方式

每當看到一個外部候選，不要直接問：

`能不能裝？`

而要先問：

- 這個候選值不值得放進 `open-source-vault`？
- 它跟哪一層架構有關？
- 它的風險是否值得 current stage 承擔？
- 如果只做 light test，最小驗證是什麼？

這樣才能把 `open-source-vault` 維持在治理層，而不是變成外部工具堆積區。
