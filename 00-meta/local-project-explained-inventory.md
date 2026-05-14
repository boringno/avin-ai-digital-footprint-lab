# Local Project Explained Inventory｜本地端專案人話說明書

## 1. 文件目的

這份文件是把本地端技術盤點翻成 AVIN 能理解的專案說明。

它不是整理資料夾指令，也不是清理計畫，而是協助 AVIN 看懂自己目前做過哪些東西、哪些還活著、哪些可回收、哪些不要動。

---

## 2. 如何閱讀這份文件

每個專案都會用以下格式判讀：

- 這是什麼
- 當初可能在做什麼
- 跟 AI Digital Footprint OS 的關係
- 目前狀態
- 可回收價值
- 風險
- 下一步建議

如果內容還不夠確定，會直接標註：

- `推測`
- `需要人工確認`

---

## 3. 一句話總覽

AVIN 本地端目前不是只有一個 repo，而是至少有三層資產：

1. 現在的主系統：
   `avin-ai-digital-footprint-lab`

2. 舊系統 / 早期實驗：
   `New project`、`framework`、`instances/jason-os`、`apps/coaching-mvp-web`

3. 可回收素材與外圍資產：
   `open-source-vault`、`vendor-review`、`brand-os`、`boringno`、`診所廣告收集`、`AI應用落地師`、`New project 2`

---

## 4. 專案逐一說明

### 1. New project

- 這是什麼  
  這是 `agent-brain` 的父 repo。

- 當初可能在做什麼  
  看起來像早期 AI 大腦 / 多代理 / OS 實驗室，裡面放的是比較底層的 framework、instances、apps 與治理規則。

- 跟 AI Digital Footprint OS 的關係  
  它不是現在 AVIN 的主系統，但很多觀念、方法論與相鄰實驗都從這裡長出來。

- 目前狀態  
  Dirty，而且把 `avin-ai-digital-footprint-lab` 與 `boringno` 視為 untracked。

- 可回收價值  
  高。尤其是架構方法、skills 治理、handoff 與系統設計思路。

- 風險  
  高風險，不要直接整理。

- 下一步建議  
  先把它視為「舊大腦 / 父 repo」，之後若要碰，只能做專門的只讀盤點，不要在一般任務裡順手整理。

### 2. apps/coaching-mvp-web

- 這是什麼  
  看起來是 creator-first / coaching MVP 的 Web product。

- 當初可能在做什麼  
  可能和陪跑、教練、顧問型產品化、內容工作流產品驗證有關。

- 跟 AI Digital Footprint OS 的關係  
  不是 AVIN 現在的主線 repo，但和 workflow 產品化、陪跑服務、外部驗證方向有關。

- 目前狀態  
  依附在 `New project` parent repo 底下，不是獨立安全工作區。

- 可回收價值  
  中高。可以回收成未來產品化想法、介面結構、creator-first 驗證邏輯。

- 風險  
  不適合直接納入 AVIN 主線，因為目前上下文還黏在舊系統裡。

- 下一步建議  
  之後可以做一次只讀回顧，抽出值得保留的方法或頁面流程，但不建議現在直接搬進主線。

### 3. instances/jason-os

- 這是什麼  
  看起來是 `Companion OS / coaching-mvp / personal-site / clinic-line` 的 instance。

- 當初可能在做什麼  
  很可能是把 AI OS 概念往不同產品、不同角色、不同 use case 展開的實驗層。

- 跟 AI Digital Footprint OS 的關係  
  對 AVIN 現在的 AI Digital Footprint OS 有參考價值，尤其是架構、handoff、product boundary 與 clinic-line 類素材。

- 目前狀態  
  還在 `New project` 這個大 repo 裡，不能當成乾淨的獨立專案看。

- 可回收價值  
  高。尤其是個人網站、診所服務、舊的 OS 思考方式。

- 風險  
  容易誤以為是現在主線，實際上更像舊系統實驗層。

- 下一步建議  
  建議之後做一次只讀深掃，重點看：
  `personal-site`、`clinic-line`、`coaching-mvp`、handoff / decision 資產。

### 4. framework

- 這是什麼  
  多代理 framework、skills、governance 主體。

- 當初可能在做什麼  
  可能是 AVIN 早期 AI 系統治理概念，用來規範 agent 怎麼協作、怎麼讀寫、怎麼做 skill routing。

- 跟 AI Digital Footprint OS 的關係  
  它不是 AVIN 對外內容系統，但可以回收成 OS governance / skill governance 的方法論。

- 目前狀態  
  還在 `New project` 內，屬於 parent framework，而不是現在主系統 repo。

- 可回收價值  
  高，偏方法論與系統治理層。

- 風險  
  如果太早搬動，容易把不同時期的架構邏輯混在一起。

- 下一步建議  
  不急著移動檔案。先做概念與方法論級別的回收。

### 5. avin-ai-digital-footprint-lab

- 這是什麼  
  目前 AVIN 主系統 repo。

- 當初可能在做什麼  
  把 AVIN 的 AI workflow、公開內容、GitHub 文件、網站、llms.txt、project logs、offer docs 全部收斂成公開可追蹤的 lab。

- 跟 AI Digital Footprint OS 的關係  
  這就是 AI Digital Footprint OS 目前最清楚、最正式的 source of truth。

- 目前狀態  
  目前是主線，且後續工作已經以這裡為正式落檔位置。

- 可回收價值  
  最高。因為它本身就是主系統。

- 風險  
  風險不在內容本身，而在於容易和 `New project` / `New project 2` 混淆。

- 下一步建議  
  後續所有正式文件優先進這裡。其他資料夾只能視為來源、旁證或待回收資產。

### 6. open-source-vault

- 這是什麼  
  外部 repo / skill 評估倉。

- 當初可能在做什麼  
  把值得追蹤的開源 repo、skill、creative assets、security review 與 intake 流程收進一個本地倉。

- 跟 AI Digital Footprint OS 的關係  
  它不是對外公開主線，但它代表的是外部能力導入治理流程。

- 目前狀態  
  目前是 supporting asset，不是主系統 repo。

- 可回收價值  
  很高。尤其是對 AVIN 這種 AI Workflow Explorer 來說，這一套外部能力 intake 方法，本身就是可輸出的 know-how。

- 風險  
  現在有兩個同名版本，source of truth 未確認。

- 下一步建議  
  先把它當成方法論資產，不急著整理目錄。之後先確認哪一份才是主版本。

### 7. vendor-review

- 這是什麼  
  外部工具 / skill / dashboard / marketing skill 評估資料。

- 當初可能在做什麼  
  可能是在不同工具、starter、skills、vendors 之間做安全檢查、適配評估與 adoption review。

- 跟 AI Digital Footprint OS 的關係  
  它可以變成工具評估、外部 skill 導入、公開內容素材與方法論來源。

- 目前狀態  
  目前依附 `New project` parent repo，不是獨立整理好的系統。

- 可回收價值  
  很高，偏方法論與工具評估層。

- 風險  
  內容很多，若沒先分類就直接整併，容易變成混亂素材池。

- 下一步建議  
  之後要判斷哪些值得收編成正式文檔，哪些只保留作參考。

### 8. brand-os

- 這是什麼  
  看起來是本地 MCP server / brand OS 實驗。

- 當初可能在做什麼  
  可能和品牌 workflow、自動化、MCP 工具、品牌上下文管理相關。

- 跟 AI Digital Footprint OS 的關係  
  和 AVIN 主線不是同一層，但可能是未來 automation / brand workflow 的一個組件。

- 目前狀態  
  先列為實驗，不當主線。

- 可回收價值  
  中。重點不在現成產品，而在它可能代表的 workflow 能力。

- 風險  
  有 `package.json / src / dist / node_modules`，但目前缺少足夠上下文，不能直接判斷成熟度。

- 下一步建議  
  暫時當實驗看待。之後如果要深入，先做只讀技術盤點。

### 9. boringno

- 這是什麼  
  GitHub profile / public presence repo。

- 當初可能在做什麼  
  用來對外展示 AVIN 的身份、proof-of-work 與公開入口。

- 跟 AI Digital Footprint OS 的關係  
  它不是 workflow 系統本身，而是公開資產層。

- 目前狀態  
  應該和 LinkedIn / 個人網站定位一致，屬於 public presence。

- 可回收價值  
  高，但屬於展示層，不是核心運作層。

- 風險  
  容易被誤認成主 repo，但其實更像 public identity repo。

- 下一步建議  
  應和 LinkedIn / 個人網站一起看，保持定位一致，而不是單獨亂改。

### 10. New project 2

- 這是什麼  
  看起來是 `avin-ai-digital-footprint-lab` 的另一份工作副本。

- 當初可能在做什麼  
  可能是某段時間拿來平行工作、臨時測試、或保存另一批未整理改動的副本。

- 跟 AI Digital Footprint OS 的關係  
  有關，但不是現在安全可用的主線。

- 目前狀態  
  與遠端分岔很大，而且 Dirty。

- 可回收價值  
  可能有重要歷史 commit，也可能只是混亂狀態；現在不能直接下結論。

- 風險  
  極高風險，不可直接整理、刪除、合併。

- 下一步建議  
  之後要做專門的只讀差異盤點，先理解它到底保留了什麼，再決定是否保留或封存。

### 11. New project 2/open-source-vault

- 這是什麼  
  `open-source-vault` 的同名 duplicate。

- 當初可能在做什麼  
  可能是平行工作時順手帶過去的另一份工作資料夾，也可能包含未整理的素材。

- 跟 AI Digital Footprint OS 的關係  
  有可能是 supporting asset，但 source of truth 未確認。

- 目前狀態  
  暫時不要動。

- 可回收價值  
  可能有，但現在無法判定主副版本。

- 風險  
  高，因為兩份同名路徑容易誤用。

- 下一步建議  
  等 `New project 2` 本體盤點完成後再判斷。

### 12. Claude/Projects/AI應用落地師

- 這是什麼  
  看起來是早期 AI 落地 / LM Studio / 本地 vault 實驗。

- 當初可能在做什麼  
  可能是在測試本地 AI 工作法、本地模型、AI 落地顧問型思路，或某種早期的知識管理方式。

- 跟 AI Digital Footprint OS 的關係  
  不是現在主線，但可能有舊概念可回收。

- 目前狀態  
  需要人工確認內容。

- 可回收價值  
  中，偏舊觀念與早期實驗脈絡。

- 風險  
  如果未看內容就直接納入，容易把過時概念帶回現在主線。

- 下一步建議  
  不應直接納入主線，但值得只讀觀察。

### 13. Codex/2026-05-08/ai-ai

- 這是什麼  
  目前狀態不明。

- 當初可能在做什麼  
  推測可能是 Codex 暫存 / 實驗資料夾，但目前沒有足夠上下文。

- 跟 AI Digital Footprint OS 的關係  
  目前看不出直接關係。

- 目前狀態  
  先列 `Unknown`。

- 可回收價值  
  未知。

- 風險  
  如果它只是工具暫存或半成品，亂動可能反而製造混淆。

- 下一步建議  
  不做任何操作，等人工確認。

---

## 5. 目前最重要的判斷

1. AVIN 目前真正的主 repo 是 `avin-ai-digital-footprint-lab`
2. `New project` 是舊大腦 / 父 repo，不是現在主系統
3. `New project 2` 是最高風險平行工作副本
4. `open-source-vault / vendor-review` 是最有方法論回收價值的外圍資產
5. 醫美 / 診所 / clinic-line 相關資料可能是未來外部驗證與案例化的重要素材

---

## 6. 下一步分類

### A. 目前主線

- `avin-ai-digital-footprint-lab`

### B. 公開資產

- `boringno`
- `website / llms.txt / LinkedIn / GitHub profile` 相關脈絡

### C. 可回收方法論

- `open-source-vault`
- `vendor-review`
- `framework`

### D. 舊系統 / 可回收舊資產

- `New project`
- `apps/coaching-mvp-web`
- `instances/jason-os`
- `Claude/Projects/AI應用落地師`

### E. 醫美 / 行銷可回收資產

- `診所廣告收集.pptx`
- `clinic-line schema / architecture`
- `AI Tool Status Radar carousel`
- `Meta / marketing vendor-review` 相關資料

### F. 高風險不要動

- `New project 2`
- `New project 2/open-source-vault`
- `New project` parent repo 的 Dirty 狀態
- 巢狀 `avin-ai-digital-footprint-lab`
- 兩個 `open-source-vault`

### G. Unknown

- `Codex/2026-05-08/ai-ai`

---

## 7. AVIN 看這份文件時的使用方式

之後 AVIN 想知道「我以前做過什麼」時，先看這份。

想知道技術狀態，才看 `local-project-inventory.md`。

想決定是否產品化，才進 `Internal Project Radar Scan`。

想真的整理檔案，必須另開任務，不可從這份文件直接操作。

---

## 8. 操作限制

這份文件只是一份理解用說明書。

它不代表可以移動、刪除、合併、改名、清理任何本地端資料夾。

所有實體整理都必須另開任務，並先確認 source of truth、git 狀態、備份策略與敏感檔案風險。
