# 本地端全域專案盤點與人話說明書完成紀錄

## 1. 任務背景

AVIN 在完成 AI Workflow 診斷訪談問題清單後，進一步開始盤點本地端到底做過哪些專案、repo、workflow、內容資產與醫美 / 行銷相關素材。

這次任務的目標不是整理資料夾，而是先建立資產地圖，避免在 `New project`、`New project 2`、巢狀 repo、`open-source-vault` 等高風險路徑中誤操作。

## 2. 本次完成內容

- 新增 `00-meta/local-project-inventory.md`
- 新增 `00-meta/local-project-explained-inventory.md`
- 更新 `docs-index.md`
- 已完成 commit
- 已 push 到遠端 `main`

## 3. 新增文件用途

### local-project-inventory.md

用途：
技術盤點地圖。
記錄本地端專案、repo、branch、remote、dirty / clean 狀態、風險路徑、可收編資產與分類。

### local-project-explained-inventory.md

用途：
人話說明地圖。
把本地端專案翻成 AVIN 自己看得懂的說明，協助理解每個資料夾是什麼、為什麼重要、能否回收、是否高風險、下一步怎麼看待。

## 4. 本次盤點結果摘要

- 疑似專案總數：13
- Git repo 數量：4
- AI / workflow 類數量：7
- 文件 / OS 類數量：3
- 醫美 / 行銷 / 內容類數量：4
- 網站 / public asset 類數量：3
- 狀態不明，需要人工確認數量：3
- 高風險混淆路徑數量：5

## 5. 重要判斷

1. `avin-ai-digital-footprint-lab` 是目前 AVIN 主系統 repo / source of truth。
2. `New project` 是早期 `agent-brain` / AI 大腦 / 多代理實驗父 repo，目前 dirty，不可直接整理。
3. `New project 2` 是與 AVIN repo remote 相關但分岔很大的高風險平行工作副本。
4. `open-source-vault` 與 `vendor-review` 是最有方法論回收價值的外圍資產。
5. 醫美 / 診所 / `clinic-line` 相關資料可能成為未來外部驗證與案例化的重要素材。
6. 所有實體整理、搬移、刪除、合併都必須另開任務，不可從本次盤點直接執行。

## 6. 高風險路徑

- `C:\Users\user\Documents\New project`
- `C:\Users\user\Documents\New project 2`
- `C:\Users\user\Documents\New project\avin-ai-digital-footprint-lab`
- `C:\Users\user\Documents\New project\open-source-vault`
- `C:\Users\user\Documents\New project 2\open-source-vault`

這些路徑名稱相近、repo 邊界複雜、存在 dirty 狀態或 duplicate 資料夾，後續任何操作都需要先確認 source of truth。

## 7. 對 AI Digital Footprint OS 的意義

這次完成後，AI Digital Footprint OS 不只記錄公開輸出與 workflow，也開始納入「本地端資產治理」。
AVIN 可以開始從過去做過的專案中，判斷哪些是主線、哪些是舊資產、哪些可公開、哪些可收編、哪些要暫停或封存。

## 8. 下一步

下一步不是整理資料夾，而是做 Internal Project Radar Scan。

建議順序：

1. 先把 13 個本地端專案放進雷達分類。
2. 逐一判斷：
   - 主幹資產
   - 立即驗證工具
   - 公開內容候選
   - 未來產品化候選
   - 醫美 / 行銷可回收資產
   - 暫停 / 封存 / 不明
   - 高風險不要動
3. 對最高價值項目做 Quick Scorecard。
4. 再決定哪些補 GitHub 文件、哪些回寫 Notion、哪些做公開內容、哪些進外部訪談驗證。

## 9. GitHub 狀態

- `local project inventory` commit:
  `b96294f624d9a9973f878e14df5464b49a5eed7b`
- `docs-index` for `local project inventory` commit:
  `2aa989c15be9550171ad1c3b3c1108bcf5917008`
- `explained local project inventory` commit after rebase:
  `dd58791 docs: add explained local project inventory`
- `docs-index` for explained local inventory commit after rebase:
  `a4a0308f8abde26f1ce2b2096baf7657f2bbe533`
- 遠端 `main` 最新 commit:
  `a4a0308f8abde26f1ce2b2096baf7657f2bbe533`

## 10. 操作限制

這份 project log 只是完成紀錄。
它不代表可以整理、搬移、刪除、合併任何本地端資料夾。
所有實體整理都必須另開任務，並先確認 source of truth、git 狀態、備份策略與敏感檔案風險。
