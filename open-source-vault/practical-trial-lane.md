# Practical Trial Lane｜開源工具安全試用通道

## 1. 文件目的

AVIN 不是 AI / 軟體本科出身，因此很多開源工具不能只靠讀 README 或程式碼片段就判斷價值。

有些工具必須真的安裝一次、打開一次、操作一次、跑一次 demo，才會知道：

- 它到底在解決什麼問題
- 它的介面與 workflow 長什麼樣子
- 它是否能接到 AI Digital Footprint OS
- 它是否有公開內容角度
- 它是否值得進一步文件化、本地化或後續實測

`Practical Trial Lane` 的目的，不是降低安全標準，而是建立一條可控、可停損、可回顧的安全試用通道。

---

## 2. Practical Trial Lane 是什麼

`Practical Trial Lane` 是 `open-source-vault` 中的安全試用流程，用來處理那些：

- 看起來有潛力
- 風險可控
- 但需要實際操作才知道價值

的開源工具。

它存在的原因，是因為有些候選如果只停在文件研究，AVIN 仍然很難真正理解：

- 真正使用門檻
- 真正操作感
- 真正 workflow friction
- 真正是否值得接進後續研究與內容輸出

---

## 3. 它不是什麼

`Practical Trial Lane` 不是：

- 看到熱門 repo 就直接安裝
- 把外部 repo 直接放進 `skills/`
- 跳過 `security-checklist`
- 允許工具碰主 repo / token / Notion / GitHub 權限
- 產品化
- 正式導入

換句話說，它是「安全試用通道」，不是「快速導入通道」。

---

## 4. 什麼情況可以進 Practical Trial

只有符合以下條件，才適合進入 `Practical Trial Lane`：

- README 清楚
- License 可辨識
- 不要求高權限 token
- 不要求直接改 local repo
- 不要求存取 Notion / GitHub 寫入權限
- 可用 demo / local sandbox / sample data 測試
- 能在 30–90 分鐘內完成初步體驗

而且它至少要和 AVIN OS 的一層有關，例如：

- AI Trend Research
- Workflow Experiment
- Hermes Agent Track
- open-source-vault
- Content Pipeline
- Website / llms.txt
- Low-cost Short Video Output

如果一個工具既不容易安全試，也和目前 OS 主線無關，那它就不該占用 Practical Trial Lane 的時間。

---

## 5. 什麼情況不能直接試

以下情況不應直接進 Practical Trial：

- 要求 GitHub token 且權限不明
- 要求 Notion / Google / browser 高權限
- 會自動修改大量檔案
- 會執行不明 shell script
- install script 不透明
- 需要 sudo / admin 權限但理由不清
- 涉及 credential / CI/CD / secrets
- 涉及 malware / offensive security / stealth / scraping 風險
- 文件太少，無法判斷用途
- License 不明
- 需要接真實客戶資料

這類候選應回退到：

- `Document Only`
- intake review
- security research
- archive / reject

而不是硬進 local trial。

---

## 6. 建議測試環境

- 優先使用 demo / hosted preview
- 優先使用 sample data
- 優先使用 isolated folder
- 不在主 repo 內安裝
- 不使用真實 token
- 不連正式 Notion / GitHub
- 不給寫入權限
- 不碰 `New project` / `New project 2` / parent repo
- 需要本地安裝時，先建立單獨 test folder
- 高風險工具只做 `Document Only`

補充原則：

- 能看 hosted preview，就不要先 install
- 能跑 sample data，就不要先接真實資料
- 能在隔離資料夾看懂，就不要碰主工作樹

---

## 7. Practical Trial 記錄格式

```text
Project Name:
Source URL:
Trial Date:
Why It Looks Interesting:
Architecture Fit:
Risk Level:
Trial Mode:
  - Demo Only
  - Local Sandbox
  - Sample Data
  - Document Only
What I Tried:
What Worked:
What Failed:
What I Still Don’t Understand:
Workflow Potential:
Content Potential:
Decision:
  - Watch
  - Retry Later
  - Document
  - Light Test Again
  - Move to Intake Review
  - Reject
  - Archive
```

這份記錄的目的，是讓每次 practical trial 都留下：

- 試了什麼
- 哪裡真的有價值
- 哪裡還沒看懂
- 最後決策是什麼

避免 trial 結束後只剩一句「有玩過」。

---

## 8. 停止條件

遇到以下情況，應立刻停止：

- 要求不明 token
- 安裝過程要求 sudo / admin 且理由不清
- 嘗試改主 repo
- 嘗試讀取敏感目錄
- 嘗試連接未知外部服務
- README 與實際行為不一致
- 安裝步驟超出 90 分鐘仍無法理解
- 風險高於目前收益

停止不是失敗，而是治理流程的一部分。

如果已出現明顯風險訊號，繼續硬試只會讓 trial lane 失去邊界。

---

## 9. Trial Mode 建議

### Demo Only

只看 hosted demo、產品畫面、官方影片或公開範例。

適合：

- 還不確定值不值得本地試
- 想先理解 UI / UX / workflow
- 權限需求不明

### Local Sandbox

在隔離資料夾做本地試用，不碰主 repo、不碰真實資料。

適合：

- README 足夠清楚
- 風險低到中
- 可在短時間內完成初步體驗

### Sample Data

使用官方 sample 或自建無敏感資料的範例測試。

適合：

- 需要看完整 input / output
- 需要理解功能邊界
- 不能直接拿真實工作素材進去

### Document Only

只做文件研究，不做安裝與執行。

適合：

- high / critical risk
- 權限要求不清
- 文件不足
- 與當前收益不成比例

---

## 10. 與既有文件關係

### 與 `open-source-vault/workflow.md`

`workflow.md` 定義整體治理節奏。  
`Practical Trial Lane` 是其中可能出現的一條安全試用支線，用來處理需要「實際操作」才能判讀的候選。

### 與 `open-source-vault/security-checklist.md`

進 Practical Trial 前，應先經過 `security-checklist`。  
沒有過基本安全分層，就不應直接進試用。

### 與 `open-source-vault/mcp-potential-checklist.md`

MCP Potential Check 比較偏 interface、sandbox、agent-safe callable。  
Practical Trial Lane 比較偏「實際操作後，這個工具到底值不值得更深入理解」。

### 與 `open-source-vault/project-template.md`

Practical Trial 的觀察結果，可以回填到 `project-template`，形成更完整的候選記錄。

### 與 `00-meta/ai-trend-intake-and-architecture-fit.md`

AI Trend Intake Layer 負責回答：

- 這是不是有效 signal
- 它和哪個架構層有關
- 是否值得看

Practical Trial Lane 則處理：

- 已經值得看，但還需要實際操作才能理解價值的候選

### 與 `04-workflows/ai-trend-to-workflow-experiment.md`

若某次 practical trial 發現工具確實有 workflow 意義，下一步就可以升級成正式的 workflow experiment。

所以順序通常是：

`Trend Intake -> Security Check -> Practical Trial -> Workflow Experiment`

---

## 11. 對 AVIN 的意義

這份文件的重點不是鼓勵更多安裝，而是讓 AVIN 能在不是 AI / 軟體本科背景的前提下，保留一條「可理解工具真實樣貌」的安全路徑。

不是只靠讀 README 猜它值不值得，
也不是直接把外部工具搬進主系統，
而是在風險可控的前提下，給自己一條能實際理解工具的 Practical Trial Lane。
