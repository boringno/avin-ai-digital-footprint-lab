# Internal Project Radar Scan｜本地端專案內部雷達掃描

## 1. 文件目的

這份文件不是資料夾整理計畫，也不是清理指令。

它的用途是把 `local-project-inventory.md` 與 `local-project-explained-inventory.md` 的結果，進一步轉成一份可判讀、可排序、可決定下一步的內部雷達掃描。

重點不是問「哪些資料夾要不要刪」，而是先回答：

- 哪些是 AVIN 目前的主線資產
- 哪些是可以立即拿來驗證的工具或 workflow
- 哪些適合變成公開內容
- 哪些可能進入未來產品化候選
- 哪些屬於醫美 / 行銷可回收資產
- 哪些應暫停觀察
- 哪些屬於高風險，不要動

---

## 2. 使用方式

這份雷達掃描的用途是幫 AVIN 做內部判讀，不是幫 AVIN 立刻開新專案。

建議閱讀順序：

1. 先看各專案被分到哪一類。
2. 再看每個項目的判讀理由。
3. 最後看 Quick Scorecard，決定下一步是：
   - 補文件
   - 做只讀深掃
   - 回填 Notion Radar
   - 轉成公開內容
   - 進外部訪談驗證
   - 暫停不動

---

## 3. 掃描基準

本次雷達掃描以目前已完成的兩份基礎文件為依據：

- `00-meta/local-project-inventory.md`
- `00-meta/local-project-explained-inventory.md`

判讀原則：

- 先看 source of truth
- 先看是否仍活著
- 先看是否可回收
- 先看是否有公開價值
- 先看是否有 workflow / SOP / template / case study 潛力
- 先看是否存在高風險 repo 邊界或 duplicate 問題

---

## 4. 雷達分類定義

### A. 主幹資產

目前已經是 AVIN 主線的一部分，後續文件、決策、對外表述應優先依附這條主線。

### B. 立即驗證工具

不一定是主品牌資產，但已經有足夠清楚的 workflow 或功能，可以拿來做內部驗證、案例整理或方法論沉澱。

### C. 公開內容候選

適合轉成 GitHub 文件、LinkedIn、Threads、網站區塊、案例文章或公開 proof-of-work 的項目。

### D. 未來產品化候選

不是現在就賣，而是已經有明確問題、可複用流程或資產形式，未來可能進入 Productization Layer 評估。

### E. 醫美 / 行銷可回收資產

與 AVIN 過去醫美、內容、投放、診所營運或品牌經驗有關，未來可能回收成案例、workflow、SOP 或外部訪談主題。

### F. 暫停 / 封存 / 不明

目前用途不夠清楚，或暫時沒有投入必要。可以觀察，但不應立刻整理或整合。

### G. 高風險，不要動

存在 repo 邊界混亂、dirty 狀態、duplicate、平行工作副本或 source of truth 不清的問題。現階段只適合盤點，不適合動手整理。

---

## 5. 專案雷達總表

| Project / Folder | 目前分類 | 與 AI Digital Footprint OS 的關係 | 初步判讀 | 下一步 |
|---|---|---|---|---|
| `avin-ai-digital-footprint-lab` | A. 主幹資產 | 主系統 repo / source of truth | 已是正式主線 | 持續作為所有正式文件入口 |
| `boringno` | C. 公開內容候選 | 公開身份與 proof-of-work 輸出層 | 不是 workflow 核心，但很重要 | 與 LinkedIn / Website 一起管理 |
| `open-source-vault` | B / D | 外部 repo / skill intake 治理資產 | 方法論價值高 | 之後做只讀深掃與分層整理 |
| `vendor-review` | B / D | 外部工具、skill、dashboard 評估層 | 可回收成工具評估方法論 | 先挑高價值項目做二次盤點 |
| `framework` | D | 舊 AI 系統治理概念 | 可回收成 governance 方法論 | 之後只讀深掃 skills / governance 結構 |
| `instances/jason-os` | D / E | 舊 OS / clinic-line / personal-site instance | 參考價值高 | 做一次只讀深掃 |
| `apps/coaching-mvp-web` | D | creator-first / coaching MVP 子題 | 可作為產品化想法參考 | 暫不併入主線 |
| `brand-os` | B / F | MCP / brand workflow 實驗 | 有 automation 潛力 | 保持觀察，先不升格 |
| `New project` | G | 舊父 repo / agent-brain 工作區 | 很多可回收資產，但 repo 風險高 | 不直接整理，只做結構判讀 |
| `New project 2` | G | 高風險平行工作副本 | 可能有重要歷史，但現在很危險 | 單開任務做只讀差異盤點 |
| `New project 2/open-source-vault` | G / F | duplicate 倉 | source of truth 未確認 | 暫停，不動 |
| `Claude/Projects/AI應用落地師` | F / D | 早期 AI 落地 / LM Studio 實驗 | 可能有舊概念可回收 | 人工確認後再做只讀觀察 |
| `Codex/2026-05-08/ai-ai` | F | 狀態不明 | 目前資訊不足 | 保持 Unknown，不操作 |

---

## 6. A. 主幹資產

### 1. avin-ai-digital-footprint-lab

判讀：

- 這是目前 AVIN 的主系統 repo。
- 它已經不是「某個單一專案」，而是 AI Digital Footprint OS 的主線承載層。
- 目前已收納公開輸出、workflow 文件、offer 文件、llms.txt、project log、meta 文件與盤點文件。

為什麼是主幹：

- source of truth 清楚
- Git 邊界清楚
- 已有 public-facing 與 internal-facing 文件結構
- 已有持續 commit / push 記錄

下一步：

- 所有正式盤點、策略、案例、workflow、productization 判讀優先寫回這裡
- 後續 Internal Project Radar 的結果也以這裡為主資料層

---

## 7. B. 立即驗證工具

### 1. open-source-vault

判讀：

- 這不是單純素材倉，而是外部 repo / skill intake 與檢查流程的支撐層。
- 它對 AVIN 的價值不只是「收藏工具」，而是形成外部能力導入的方法論。

可驗證點：

- repo / skill intake SOP
- security review 流程
- creative asset / reference asset 管理方式

下一步：

- 後續做一次只讀深掃
- 拆出哪些部分已可變成 workflow 文件或公開方法論

### 2. vendor-review

判讀：

- 這是外部工具、starter、dashboard、skill、marketing vendor 的評估資料層。
- 不是最終產品，但很適合回收成「怎麼評估工具」的方法論。

可驗證點：

- AI tool evaluation checklist
- external skill adoption 流程
- 工具導入前的判讀框架

下一步：

- 篩出 5 個最高價值評估樣本
- 看哪些能進入 GitHub 文件或 case note

### 3. brand-os

判讀：

- 目前較像 MCP / automation / brand workflow 實驗。
- 有技術實作痕跡，但還不是主線。

可驗證點：

- 是否真的是可獨立描述的 brand workflow
- 是否值得轉成 OS 內的 automation reference

下一步：

- 維持實驗狀態
- 後續只讀查看 `package.json / src` 的結構和意圖

---

## 8. C. 公開內容候選

### 1. boringno

判讀：

- 這是 AVIN 對外的 GitHub profile / public presence repo。
- 它不是 workflow 系統本身，但對身份敘事與 proof-of-work 很重要。

公開價值：

- 可以和 LinkedIn / 個人網站 / GitHub profile README 一起形成外部入口
- 可以承接 AVIN 的定位與公開案例

下一步：

- 讓 `boringno`、LinkedIn、Website 的定位持續一致

### 2. AI Tool Status Radar

判讀：

- 這組資產已經具備公開內容化條件。
- 不只是內容輸出，也可反向驗證 AVIN 的 AI Workflow Explorer 定位。

下一步：

- 可整理成公開系列主題
- 也可作為未來 clinic / creator workflow 的內容展示形式

### 3. llms.txt / AI-readable website / GitHub 文件脈絡

判讀：

- 這是 AVIN 很明確的 public-facing proof-of-work。
- 已具備被整理成方法論或案例文章的價值。

下一步：

- 作為「AI-readable footprint」類公開輸出候選

---

## 9. D. 未來產品化候選

### 1. framework

判讀：

- 這裡比較像早期的 AI 系統治理底層。
- 不應直接搬進 AVIN 主線，但很適合回收成 governance 方法論。

產品化可能：

- OS governance 原則
- skill governance
- capability intake 判讀框架

### 2. instances/jason-os

判讀：

- 可能保留了個人網站、clinic-line、coaching-mvp、handoff 等多種 use case 痕跡。
- 它不是現在的 source of truth，但很可能藏有未來高價值資產。

產品化可能：

- clinic content workflow
- personal-site / proof-of-work workflow
- use-case layer 的設計模式

### 3. apps/coaching-mvp-web

判讀：

- 這較像 creator-first / coaching 方向的子產品。
- 目前可作為產品化思路參考，但不適合硬拉回 AVIN 主線。

產品化可能：

- 陪跑型 workflow 產品
- creator workflow 系統
- use-case driven MVP 結構

---

## 10. E. 醫美 / 行銷可回收資產

目前值得特別留意的可回收方向：

- `診所廣告收集.pptx`
- `db/clinic_line_schema.sql`
- `clinic-line-ai-service-architecture.md`
- `New project 2` 裡與 clinic / Taiwan legal / MCP 有關的 commit 痕跡
- `AI Tool Status Radar` 輪播
- LinkedIn / Threads / GitHub Profile / Website public asset 文檔

初步判讀：

- 這些資產可能不是現在最穩定的 repo 資產，但它們很有機會變成未來外部驗證素材。
- 尤其是「醫美 / 診所內容 workflow」這條線，很可能是 AVIN 最具差異化的真實背景優勢之一。

可回收方向：

- 醫美 AI Workflow 案例
- 診所內容系統
- 內容企劃 SOP
- 短影音 AI workflow
- Meta 廣告素材 workflow
- Clinic Content AI Workflow Kit

下一步：

- 不急著做產品包裝
- 先盤點有哪些素材是真實可讀、可拆流程、可做案例的

---

## 11. F. 暫停 / 封存 / 不明

### 1. Claude/Projects/AI應用落地師

判讀：

- 看起來是早期 AI 落地與 LM Studio 類實驗。
- 可能有概念價值，但現在資訊不足。

下一步：

- 之後可只讀觀察
- 不直接納入主線

### 2. Codex/2026-05-08/ai-ai

判讀：

- 目前仍屬 Unknown。
- 不適合做任何操作推論。

下一步：

- 保持不動
- 等人工確認

---

## 12. G. 高風險，不要動

### 1. New project

原因：

- 是 `agent-brain` 父 repo
- 目前 dirty
- 還把 `avin-ai-digital-footprint-lab` 與 `boringno` 視為 untracked
- repo 邊界容易誤操作

### 2. New project 2

原因：

- 與 AVIN repo 相關，但分岔很大
- 目前 dirty
- 可能有有價值的歷史，也可能是混亂工作副本

### 3. New project 2/open-source-vault

原因：

- 與 `open-source-vault` 同名 duplicate
- source of truth 未確認

### 4. 巢狀 avin-ai-digital-footprint-lab

原因：

- 路徑上在 `New project` 之下，容易讓人誤以為應在 parent repo 操作 git
- 實際上它有自己的獨立 git 邊界

結論：

- 這一組不是不能研究，而是不能直接整理
- 後續任何搬移、刪除、合併、改名，都必須另開任務

---

## 13. Quick Scorecard

評分說明：

- `Problem / Importance`：這個項目對 AVIN 現在的價值是否明確
- `Reuse Potential`：是否可變成 SOP / template / workflow / case study
- `Strategic Fit`：是否符合 AI Digital Footprint OS 主線
- `Operational Clarity`：source of truth、repo 邊界、結構是否清楚
- `Near-term Value`：是否值得近期投入只讀深掃、文件化或公開化

分數僅供排序，不代表產品化保證。

| Item | Problem / Importance | Reuse Potential | Strategic Fit | Operational Clarity | Near-term Value | Total /25 | 初步判讀 |
|---|---:|---:|---:|---:|---:|---:|---|
| `avin-ai-digital-footprint-lab` | 5 | 5 | 5 | 5 | 5 | 25 | 主線核心 |
| `open-source-vault` | 4 | 5 | 4 | 3 | 4 | 20 | 高價值方法論資產 |
| `vendor-review` | 4 | 4 | 4 | 3 | 4 | 19 | 值得深掃 |
| `boringno` | 4 | 3 | 4 | 5 | 4 | 20 | 公開資產重要入口 |
| `instances/jason-os` | 4 | 4 | 4 | 2 | 4 | 18 | 值得探索 |
| `framework` | 3 | 4 | 4 | 2 | 3 | 16 | 可回收治理方法論 |
| `apps/coaching-mvp-web` | 3 | 3 | 3 | 2 | 3 | 14 | 先觀察 |
| `brand-os` | 3 | 3 | 3 | 3 | 2 | 14 | 保留實驗狀態 |
| `Claude/Projects/AI應用落地師` | 2 | 3 | 2 | 2 | 2 | 11 | 暫緩 |
| `New project` | 4 | 4 | 3 | 1 | 2 | 14 | 有價值但高風險 |
| `New project 2` | 4 | 3 | 2 | 1 | 1 | 11 | 高風險平行副本 |
| `New project 2/open-source-vault` | 2 | 2 | 1 | 1 | 1 | 7 | 暫不投入 |
| `Codex/2026-05-08/ai-ai` | 1 | 1 | 1 | 1 | 1 | 5 | Unknown |

判讀方式：

- `20-25`：High Priority Internal Asset
- `15-19`：Worth Deep Read
- `10-14`：Observe / Hold
- `低於 10`：暫不投入

---

## 14. 目前最值得先處理的前 5 項

1. `avin-ai-digital-footprint-lab`
   - 原因：主線，不需再證明重要性

2. `open-source-vault`
   - 原因：最有機會長出 AI Workflow Explorer 的外部能力導入方法論

3. `vendor-review`
   - 原因：最接近工具評估、skill adoption、公開內容與方法論回收的中介層

4. `instances/jason-os`
   - 原因：可能藏有 clinic-line、personal-site、coaching-mvp 等高價值舊資產

5. `boringno`
   - 原因：是 AVIN 對外 public presence 的重要承接層

---

## 15. 下一步

下一步不是整理資料夾，而是把這份 Internal Project Radar Scan 當成後續決策入口。

建議順序：

1. 先把這份文件與兩份盤點地圖一起保留在 `00-meta`
2. 從前 5 項開始做只讀深掃
3. 把值得持續追蹤的項目回填到 Notion Radar Database
4. 對高價值項目補 Quick Scorecard 與 Evidence
5. 再決定哪些：
   - 補 GitHub 文件
   - 做 project log
   - 轉成公開內容
   - 進入外部訪談驗證
   - 進 Productization Layer 判讀

---

## 16. 操作限制

這份文件只是一份內部雷達掃描。

它不代表可以直接整理、搬移、刪除、合併、改名任何本地端資料夾。

所有實體檔案操作都必須另開任務，並先確認：

- source of truth
- git 狀態
- repo 邊界
- 備份策略
- 敏感檔案風險

在沒有完成這些確認前，這份文件只用來判讀，不用來直接操作。
