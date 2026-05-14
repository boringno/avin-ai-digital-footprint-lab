# Local Project Inventory｜本地端全域專案盤點

## 1. 文件目的

這份文件用來記錄 AVIN 本地端目前有哪些專案、repo、workflow、內容資產、醫美 / 行銷資產與高風險混淆路徑。

它不是整理資料夾指令，也不是清理計畫，而是資產地圖與後續雷達分類依據。

---

## 2. 掃描範圍

本次掃描範圍包含：

- `C:\Users\user\Documents` 第一層資料夾
- `C:\Users\user\Documents` 第二層資料夾
- `C:\Users\user\Documents\New project`
- `C:\Users\user\Documents\New project\avin-ai-digital-footprint-lab`
- `C:\Users\user\Documents\New project 2`
- `C:\Users\user\Documents\New project\open-source-vault`
- `C:\Users\user\Documents\New project 2\open-source-vault`
- `C:\Users\user\Documents\New project\vendor-review`
- `C:\Users\user\Documents\New project\mcp-servers\brand-os`
- `C:\Users\user\Documents\Claude\Projects\AI應用落地師`
- `C:\Users\user\Documents\Codex\2026-05-08\ai-ai`

---

## 3. 專案總覽

- 疑似專案總數：13
- Git repo 數量：4
- AI / workflow 類數量：7
- 文件 / OS 類數量：3
- 醫美 / 行銷 / 內容類數量：4
- 網站 / public asset 類數量：3
- 狀態不明，需要人工確認數量：3
- 高風險混淆路徑數量：5

---

## 4. 本地端專案清單

| Project / Folder | Path | Type | Git Repo | Remote | Branch | Status | Related to AI Digital Footprint OS? | Notes |
|---|---|---|---|---|---|---|---|---|
| `New project` | `C:\Users\user\Documents\New project` | `AI / Workflow` | Yes | `https://github.com/boringno/agent-brain.git` | `master` | Dirty | Indirect | `agent-brain` 主框架 repo；內含 `framework / instances / apps`，且把 `avin-ai-digital-footprint-lab/` 視為 untracked。 |
| `apps/coaching-mvp-web` | `C:\Users\user\Documents\New project\apps\coaching-mvp-web` | `AI / Workflow` | Via parent | Via parent | Via parent | Dirty via parent | Indirect | Creator-first Web 產品層，屬於 `Companion OS / coaching-mvp` 子系統。 |
| `instances/jason-os` | `C:\Users\user\Documents\New project\instances\jason-os` | `AI / Workflow` | Via parent | Via parent | Via parent | Dirty via parent | Indirect | 包含 `coaching-mvp`、`personal-site`、clinic-line 等架構與 handoff 資產。 |
| `framework` | `C:\Users\user\Documents\New project\framework` | `AI / Workflow` | Via parent | Via parent | Via parent | Dirty via parent | Indirect | 多代理 framework、skills、governance 主體。 |
| `avin-ai-digital-footprint-lab` | `C:\Users\user\Documents\New project\avin-ai-digital-footprint-lab` | `Notion / Docs` | Yes | `https://github.com/boringno/avin-ai-digital-footprint-lab.git` | `main` | Clean | Yes, Main System | AVIN 主系統 repo。 |
| `open-source-vault` | `C:\Users\user\Documents\New project\open-source-vault` | `Open Source / Skill` | No | N/A | N/A | N/A | Supporting | 外部 repo / skill 評估倉，含安全報告、creative-assets。 |
| `vendor-review` | `C:\Users\user\Documents\New project\vendor-review` | `Open Source / Skill` | Via parent | Via parent | Via parent | Dirty via parent | Supporting | 外部工具、starter、skills 與安全審查資料。 |
| `brand-os` | `C:\Users\user\Documents\New project\mcp-servers\brand-os` | `Automation` | No separate repo seen | N/A | N/A | N/A | Possible | 本地 MCP server / brand workflow 實驗。 |
| `boringno` | `C:\Users\user\Documents\New project\boringno` | `Website / Public Asset` | Yes | `https://github.com/boringno/boringno.git` | `main` | Clean | Related | GitHub profile / public presence repo。 |
| `New project 2` | `C:\Users\user\Documents\New project 2` | `Notion / Docs` | Yes | `https://github.com/boringno/avin-ai-digital-footprint-lab.git` | `main` | Dirty | Related but risky | 看起來是另一份 AVIN repo 工作副本，且與遠端分岔很大。 |
| `New project 2/open-source-vault` | `C:\Users\user\Documents\New project 2\open-source-vault` | `Open Source / Skill` | No | N/A | N/A | N/A | Duplicate | 與 `New project` 下同名；目前不是 source of truth。 |
| `AI應用落地師` | `C:\Users\user\Documents\Claude\Projects\AI應用落地師` | `Experiment` | No repo seen | N/A | N/A | N/A | Possibly | 有 `.env / test_lmstudio.py / vault/README.md`，像獨立 AI 實驗。 |
| `ai-ai` | `C:\Users\user\Documents\Codex\2026-05-08\ai-ai` | `Unknown` | Unknown | N/A | N/A | N/A | Unclear | 目前只確認資料夾存在，需人工確認。 |

---

## 5. Git repo 狀態表

### 1. `C:\Users\user\Documents\New project`

- Remote：`https://github.com/boringno/agent-brain.git`
- Branch：`master`
- Status：Dirty
- Ahead / Behind：`0 0`
- 最近 commit 摘要：
  - `61a573b docs: add creative assets structure and carousel brief templates`
  - `81b04e2 docs: add avin digital footprint intake review`
  - `31b3fd3 docs: add capability extraction skill`
- 是否建議保留：是
- 混淆風險：高

特別標註：

- `New project` 是 `agent-brain` repo
- 目前工作樹 Dirty
- 且把 `avin-ai-digital-footprint-lab` 與 `boringno` 視為 untracked

### 2. `C:\Users\user\Documents\New project\avin-ai-digital-footprint-lab`

- Remote：`https://github.com/boringno/avin-ai-digital-footprint-lab.git`
- Branch：`main`
- Status：AVIN 主系統 repo
- Ahead / Behind：掃描當下為同步狀態
- 最近 commit 摘要：
  - `802da47 docs: add workflow diagnosis intake completion log`
  - `beeebdc docs: update docs index`
  - `f55c61c docs: update docs index for workflow diagnosis intake`
- 是否建議保留：是
- 混淆風險：中

特別標註：

- 這是 AVIN 主系統 repo
- 後續與 AI Digital Footprint OS 相關的正式文件，應優先以此 repo 為 source of truth

### 3. `C:\Users\user\Documents\New project 2`

- Remote：`https://github.com/boringno/avin-ai-digital-footprint-lab.git`
- Branch：`main`
- Status：Dirty
- Ahead / Behind：與遠端分岔很大
- 最近 commit 摘要：
  - `969c53b docs: add business idea risk review test set`
  - `273e8de docs: add Taiwan Clinic Compliance MCP Lab workflow planning set`
  - `830dd20 docs: update docs index`
- 是否建議保留：暫不建議直接延用
- 混淆風險：極高

特別標註：

- `New project 2` 與 `avin-ai-digital-footprint-lab` 指向同一 remote
- 但目前分岔很大，且工作樹 Dirty
- 後續不能當成安全工作副本直接使用

### 4. `C:\Users\user\Documents\New project\boringno`

- Remote：`https://github.com/boringno/boringno.git`
- Branch：`main`
- Status：Clean
- Ahead / Behind：`0 0`
- 最近 commit 摘要：
  - `2b8b3b4 docs: add GitHub profile README`
- 是否建議保留：是
- 混淆風險：低

特別標註：

- `boringno` 是 GitHub profile / public presence repo
- 工作樹乾淨
- 可視為對外 public asset 的獨立承載層

---

## 6. 非 Git 但重要的專案

### `C:\Users\user\Documents\New project\open-source-vault`

- 可能內容：開源專案收藏、初步安全檢查、creative assets、skills-index、workflow 與 security reports
- 為什麼重要：是外部 repo / skill intake 與安全過濾的支撐系統
- 是否建議納入 OS：是
- 是否建議之後文件化：是

### `C:\Users\user\Documents\New project 2\open-source-vault`

- 可能內容：同名 duplicate 工作資料夾，含未整理中的資產與輸出
- 為什麼重要：可能混入尚未歸檔的外部 skill / creative asset 素材
- 是否建議納入 OS：否，先不要
- 是否建議之後文件化：先人工確認 source of truth 後再決定

### `C:\Users\user\Documents\Claude\Projects\AI應用落地師`

- 可能內容：本地 AI 實驗、LM Studio 測試、vault 類型文件
- 為什麼重要：可能是 AVIN 早期 AI 落地與工作法嘗試的獨立分支
- 是否建議納入 OS：可部分收編
- 是否建議之後文件化：是

### `C:\Users\user\Documents\New project\mcp-servers\brand-os`

- 可能內容：本地 MCP server / brand workflow 實驗，含 `package.json / src / dist`
- 為什麼重要：可能成為未來 automation / brand workflow 元件
- 是否建議納入 OS：可觀察
- 是否建議之後文件化：是

### `C:\Users\user\Documents\診所廣告收集.pptx`

- 可能內容：診所廣告 / 醫美行銷素材蒐集
- 為什麼重要：直接對應 AVIN 的醫美 / 診所內容背景
- 是否建議納入 OS：是
- 是否建議之後文件化：是

---

## 7. 可收編進 AI Digital Footprint OS 的資產

### A. 已經是 OS 主線

- `avin-ai-digital-footprint-lab`
- `Idea Opportunity Radar`
- `AI Workflow 診斷訪談問題清單`
- `collect-ai-signals`
- `notion-to-github-issues`
- `threads insights sync`
- `docs-index generator`
- `docs/llms.txt`

### B. 可補進 OS 的 workflow

- `open-source-vault`
- `vendor-review`
- `brand-os`
- `idea_radar.py`
- `ingest_notion.py`

### C. 可變成公開內容

- `GitHub Profile README` 草稿
- `LinkedIn Profile 更新包`
- `AI Tool Status Radar carousel`
- `llms.txt / AI-readable website`
- `Threads API insights sync` 經驗

### D. 可變成案例 / project log

- `AI Workflow 診斷訪談問題清單`
- `open-source-vault intake / security` 流程
- `external-skill-evaluation-workflow`
- `threads-mvp-1`
- `website consulting entry` 與 `hero CTA`

### E. 未來產品化候選

- `Clinic / 診所內容 AI workflow`
- `Workflow diagnosis + case building` 流程
- `AI signal radar`
- `Notion → GitHub issues`
- `Threads performance feedback loop`

### F. 暫時不要動

- `New project 2`
- `New project 2/open-source-vault`
- `Codex/2026-05-08/ai-ai`
- `tmp_pdf_extract`
- `node_modules / dist / build / raw exports`

---

## 8. 醫美 / 行銷 / 內容資產盤點

本次盤點到的高相關資產包括：

- `C:\Users\user\Documents\診所廣告收集.pptx`
- `db/clinic_line_schema.sql`
- `clinic-line-ai-service-architecture.md`
- `New project 2` 中的 clinic / Taiwan legal / MCP commit 痕跡
- `AI Tool Status Radar` 輪播
- `LinkedIn / Threads / GitHub Profile / website` public asset 文檔

可回收方向初判：

- 醫美 AI Workflow 案例
  - 可由 clinic-line 架構與診所素材切入
- 診所內容系統
  - 可由 schema、內容流與對話流整理成系統圖
- 內容企劃 SOP
  - 可由 `notion-to-linkedin`、`weekly-ai-signal-to-public-content-workflow` 延伸
- 短影音 AI workflow
  - 可由 `AI Tool Status Radar carousel` 與 related creative assets 切入
- Meta 廣告素材 workflow
  - 可從 `vendor-review` 與醫美素材兩邊找可組裝流程
- Clinic Content AI Workflow Kit
  - 有潛力，但目前仍偏草稿 / 架構階段

---

## 9. 高風險混淆路徑

- `C:\Users\user\Documents\New project`
- `C:\Users\user\Documents\New project 2`
- `C:\Users\user\Documents\New project\avin-ai-digital-footprint-lab`
- `C:\Users\user\Documents\New project\open-source-vault`
- `C:\Users\user\Documents\New project 2\open-source-vault`

說明：

- `New project` 是 `agent-brain` repo，但內含 AVIN repo 與 `boringno` repo
- `New project 2` 與 AVIN repo 指向同一 remote，但分岔很大
- 兩個 `open-source-vault` 目前 source of truth 未確認
- 後續任何整理 / 搬移 / 刪除，都必須另開任務並先人工確認

---

## 10. 初步雷達分類

### A. 主幹資產

- `avin-ai-digital-footprint-lab`
- `Idea Opportunity Radar`
- `AI Workflow 診斷訪談問題清單`
- `boringno`

### B. 立即驗證工具

- `collect-ai-signals`
- `notion-to-github-issues`
- `threads insights sync`
- `docs-index generator`

### C. 公開內容候選

- `GitHub Profile README` 草稿
- `LinkedIn Profile 更新包`
- `AI Tool Status Radar`
- `llms.txt / AI-readable footprint`
- `Threads Insights Sync` 經驗

### D. 未來產品化候選

- `workflow diagnosis system`
- `clinic content workflow`
- `AI signal radar`
- `external skill evaluation flow`
- `clinic compliance / MCP` 類流程

### E. 醫美 / 行銷可回收資產

- `診所廣告收集.pptx`
- `clinic_line_schema.sql`
- `clinic-line-ai-service-architecture.md`
- `AI Tool Status Radar` 輪播與文案

### F. 暫停 / 封存 / 不明

- `Claude/Projects/AI應用落地師`
- `Codex/2026-05-08/ai-ai`
- `New project 2/open-source-vault`
- `tmp_pdf_extract`

### G. 高風險，不要動

- `New project`
- `New project 2`
- 巢狀 `avin-ai-digital-footprint-lab`
- 兩個同名 `open-source-vault`

---

## 11. 建議下一步

1. 優先把這份 `local-project-inventory.md` 納入 GitHub
2. 下一步建立 `Notion Radar Database`
3. 不要立刻整理資料夾
4. 先人工確認 `New project 2` 是否保留
5. 先人工確認兩個 `open-source-vault` 的 source of truth
6. 針對最高價值資產做 `Internal Project Radar Scan`
7. 再決定哪些變成公開內容、哪些補 GitHub 文件、哪些封存

---

## 12. 操作限制

這份盤點文件不代表可以直接整理、搬移、刪除、合併任何本地端資料夾。

所有實體檔案操作都必須另開任務，並先確認 source of truth、git 狀態與備份策略。
