# obra/superpowers Manual Methodology Trial

## 執行資訊

- Trial Date：2026-05-19
- Trial Mode：Manual Methodology Simulation（Document-Only Execution）
- 原因：Plugin install route blocked（`/plugin isn't available in this environment`）
- 不安裝 plugin、不 clone、不接 MCP、不啟動 Hermes
- Test Repo：`C:\Users\user\Desktop\superpowers-trial`（隔離，無 remote）
- 主 Repo：`C:\Users\user\Documents\New project\avin-ai-digital-footprint-lab`

---

## 1. Plugin Install Route 為何 Blocked

在此 Claude Code 環境中執行 `/plugin install superpowers@claude-plugins-official` 時，回應：

```
/plugin isn't available in this environment.
```

Claude Code 的 `/plugin` 指令不在當前環境的 available slash commands 中。此路線 blocked，改走 Manual Methodology Trial 替代路線，不找 workaround，直接從方法論層面進行分析。

---

## 2. superpowers 方法論核心摘要（來源：公開 GitHub 文件）

obra/superpowers 的核心工作流共 6 個步驟，以 design-before-code 為核心原則：

### Step 1 — Design Refinement（設計精化）
在任何實作開始前，取得使用者對設計的明確核准。不允許在未確認需求前開始建立 branch 或寫任何東西。

### Step 2 — Git Worktree 隔離（使用 `using-git-worktrees` skill）
設計核准後，在新 branch 建立隔離工作區。Branch 名稱格式：`task/` 前綴 + 簡短描述。執行 project setup，驗證 clean test baseline。**實作前必須完成此隔離。**

### Step 3 — Writing Plans（寫執行計畫）
將任務拆成 2–5 分鐘粒度的子任務。每個子任務必須有：
- 精確檔案路徑
- 完整程式碼內容
- 可驗證的完成條件（verification step）

### Step 4 — Subagent-Driven Development（子 agent 驅動執行）
計畫核准後，每個子任務派遣一個新鮮 subagent 執行，並在完成後進行兩階段審查：
1. **Spec compliance check**：輸出是否符合原始設計規格？
2. **Quality check**：程式碼或輸出品質是否達標？

### Step 5 — TDD（RED-GREEN-REFACTOR）
在實作期間強制執行 TDD 循環：先寫失敗測試 → 確認失敗 → 寫最小量程式碼讓測試通過 → 確認通過 → commit → refactor。測試前寫的程式碼一律刪除。

### Step 6 — Finishing a Development Branch（收尾）
所有任務完成後，驗證測試，向使用者提示選項（merge / PR / keep / discard），清理 worktree。

**核心設計原則：**
- Design before code（設計核准 → 隔離工作區 → 計畫 → 執行 → TDD → 收尾，嚴格順序）
- 人工核准是 gate，不是可選步驟
- Agent 不得跳過任何步驟自行推進

---

## 3. Test Task 執行摘要（Test Repo 內部）

**測試任務**：以 superpowers 工作流模擬「撰寫 AVIN OS 一段 README 描述」

**模擬結果**：
- Step 1（設計精化）→ 可執行，直接對應 AVIN Review Gate ✓
- Step 2（Worktree 隔離）→ 可執行，但對 doc 任務 overhead 偏高
- Step 3（寫計畫）→ 可執行，Verification step 格式有價值 ✓
- Step 4（兩階段審查）→ 可執行，Spec compliance + Quality check 格式值得借用 ✓
- Step 5（TDD）→ **不適用**，無法對文件/內容任務應用 RED-GREEN-REFACTOR
- Step 6（收尾決策）→ 可執行，merge/keep/discard 決策模式值得借用 ✓

**Test Repo Commit**：`7e9eaff trial: obra/superpowers manual methodology simulation completed`（無 remote，不 push）

---

## 4. 與 AVIN OS 現有機制的重疊分析

| superpowers 機制 | AVIN OS 現有對應 | 重疊程度 |
|---|---|---|
| Design Refinement（設計核准 gate）| Review Gate（隱性原則）| 高（概念相同，但 AVIN 未明確命名）|
| Subagent routing | Tool Routing（ChatGPT→Codex→Claude Code）| 中（結構相似，但 AVIN 是 human-mediated）|
| Task spec format | Command Library（口令觸發）| 中（都有「明確觸發條件」，但粒度不同）|
| Stop conditions | Forbidden lists（各 Rule 的禁止事項）| 高（設計哲學完全重疊）|
| Branch isolation | Practical Trial Lane 隔離原則 | 高（相同安全思路）|
| Two-stage review | Write Documentation Mode 隱性流程 | 低（AVIN 無明確兩階段命名）|

---

## 5. Localize 建議

### 可 Localize 的部分（4 項）

**1. Task Spec Format**（任務規格格式）
superpowers 的「檔案路徑 + 完整輸出 + 驗證條件」格式，可直接轉為 AVIN 指派 Codex/Claude Code 任務時的標準格式：
```
File: [目標文件路徑]
Output: [完整預期輸出摘要]
Verification: [如何確認完成]
```
→ 建議加入 OS Trigger Rules 的「任務交辦規格」部分

**2. Two-Stage Review Gate**（兩階段審查）
「Spec compliance → Quality check」的審查順序：
- 第一階段：這份輸出是否符合原始指定範圍？
- 第二階段：這份輸出的品質是否達標？
→ 建議明確加入 Write Documentation Mode 的輸出審查步驟

**3. Design Approval Checkpoint（Rule 12 候選）**
superpowers 的 design-before-code 可以形式化為 AVIN OS 的 Rule 12：
```
Rule 12 — Design Approval Gate
在任何文件建立或流程執行前，agent 必須先提交任務設計摘要，
等待 AVIN 明確核准後才能開始執行。
```
→ 現有 Review Gate 是隱性原則，可以升格為明確 Rule

**4. Finish-Task Decision（任務收尾決策）**
「commit to main / keep for review / discard」的明確決策點：
→ 可加入任務完成時的標準 checklist

### 不建議採用的部分（4 項）

**1. TDD（RED-GREEN-REFACTOR）**
完全針對可執行程式碼設計，AVIN 的核心輸出是文件/內容，無法套用「寫失敗測試」的概念。

**2. Git Worktree per task**
每個任務建立獨立 worktree 的 overhead，對 AVIN 目前的文件工作流不合理。AVIN 的任務通常是「建立一個 md 檔」，不是「在隔離環境執行一段程式碼」。

**3. Automated Subagent Loops**
superpowers 的 subagent-driven-development 假設有可以自主迭代的 agent 層。AVIN 的 Hermes 目前只在 proposal layer，不在 execution layer，無法支援這個模式。

**4. 2–5 Minute Task Granularity**
這個粒度適合軟體工程任務（寫一個 function）。AVIN 的文件任務粒度通常是「建立一份完整文件」，與這個粒度不相符。

---

## 6. Trial 決定

- **Decision**：Document / Localize selected elements
- **Risk**：無安裝，無執行，無 side effects
- **Overall Assessment**：obra/superpowers 作為方法論框架，其設計哲學（design gate、task spec、two-stage review）對 AVIN OS 有實際參考價值。TDD 和 worktree 是 coding-specific，不適用。

---

## Lifecycle Status

- Document Only Review：Completed（2026-05-19）
- Security Checklist：Completed（2026-05-19）
- Practical Trial Phase 1：Completed（test repo 建立，install route blocked）
- Practical Trial Phase 2（Manual Methodology Trial）：**Completed（2026-05-19）**
- Workflow Experiment：Pending（若決定 Localize Rule 12 / Task Spec Format）
