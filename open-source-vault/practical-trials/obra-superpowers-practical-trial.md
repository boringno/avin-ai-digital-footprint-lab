# obra/superpowers｜Practical Trial Log

## Trial 資訊

- Trial Date：2026-05-19
- Trial Mode：Local Sandbox（專用 throwaway test repo）
- Risk Level：Medium
- 前置文件：`open-source-vault/security-reviews/obra-superpowers-security-checklist.md`
- 不安裝於主 repo、不碰 Notion、不碰 New project 2、不使用真實 token

---

## 標準記錄格式（Practical Trial Lane 規範）

```text
Project Name:        obra/superpowers
Source URL:          https://github.com/obra/superpowers
Trial Date:          2026-05-19
Why It Looks Interesting:
  197,000 stars 的 AI coding agent 工作流方法論框架，支援 Claude Code 官方市場，
  核心流程：設計精化 → 隔離工作區（git branch）→ 任務拆解 → 子 agent 執行 → TDD → Code Review
Architecture Fit:
  Workflow Experiment（最強）、Hermes Agent Track（強）
Risk Level:          Medium（Security Checklist 通過，2026-05-19）
Trial Mode:          Local Sandbox
```

---

## Phase 1：Pre-install 準備（已完成）

### 1.1 Test Repo 建立

| 項目 | 內容 |
|---|---|
| Test Repo 路徑 | `C:\Users\user\Desktop\superpowers-trial` |
| 狀態 | 已建立，git init 完成 |
| Branch | master |
| 初始 commit | `9563ab2 init: throwaway test repo for obra/superpowers practical trial` |
| 隔離確認 | 與 `avin-ai-digital-footprint-lab` 和 `New project 2` 完全隔離 ✓ |
| Remote | 無（純本地 throwaway repo）|

```text
Pre-install git baseline（test repo）：
git status --short → 空白（clean）
git branch → master
git log → 9563ab2 init: throwaway test repo
```

### 1.2 安裝方式確認（WebSearch 研究）

| 項目 | 內容 |
|---|---|
| 安裝指令 | `/plugin install superpowers@claude-plugins-official` |
| 安裝管道 | Anthropic 官方 Claude Code marketplace |
| 相關 repo | `obra/superpowers-marketplace`、`anthropics/claude-plugins-official` |
| 已知問題 | marketplace name collision bug（v4.3.1），有 workaround gist |
| 開發者文件 | `obra/superpowers-developing-for-claude-code` |

**已知問題記錄（Issue #653）**：Claude Code v4.3.1 有 plugin name collision bug，可能導致 plugin not recognized。若安裝後 plugin 無法正常載入，需參考 workaround：  
`https://gist.github.com/gwpl/cd6dcd899ca0acce1b4a1bc486d56a9e`

---

## Phase 2：安裝（待執行）

**AVIN 需手動執行以下步驟：**

1. 在 Claude Code 中輸入以下指令安裝 plugin：
   ```
   /plugin install superpowers@claude-plugins-official
   ```

2. 記錄安裝結果：
   - 成功安裝 → 繼續 Phase 3
   - 出現 name collision bug → 參考 workaround gist，記錄 workaround 步驟

3. 安裝完成後，確認 plugin 可用（輸入 `/` 查看是否出現 superpowers 相關指令）

**安裝結果記錄：**

```text
安裝時間：[待填]
安裝指令：/plugin install superpowers@claude-plugins-official
安裝結果：[成功 / 失敗 / 需 workaround]
Plugin 出現在指令清單：[是 / 否]
備註：[待填]
```

---

## Phase 3：Trial 執行（待執行）

### 3.1 Test Repo Git Baseline（安裝後）

```text
執行時間：[待填]
git status --short：[待填]
git branch -a：[待填]
git log --oneline：[待填]
```

### 3.2 試用任務規劃

以下為本次 Practical Trial 的試用任務（由易到難，每步確認後再進行下一步）：

**Task 1（最小試驗）**：在 test repo 中詢問 superpowers 關於任何一個 skill 的說明，確認 plugin 可回應。

**Task 2（方法論確認）**：請 superpowers 說明它的核心工作流程（設計精化 → 隔離工作區 → 任務拆解 → 執行 → TDD），觀察是否和 Document Only Review 描述一致。

**Task 3（git 操作觀察）**：執行一個簡單的「設計精化」步驟，觀察 superpowers 是否在 test repo 建立 git branch，以及建立了什麼 branch。這是驗證 git scope 是否可控的關鍵步驟。

**停止條件**（遇到以下情況立即停止）：
- Plugin 嘗試操作 `superpowers-trial` 以外的目錄
- Plugin 嘗試連接外部服務
- Plugin 要求任何 token 或 credential
- 任何 git 操作影響超出 test repo

### 3.3 Trial 觀察記錄

```text
Task 1 結果：[待填]
Task 2 結果：[待填]
Task 3 結果：[待填]
  - git branch 建立了什麼：[待填]
  - git scope 是否限於 test repo：[待填]
觀察到的意外行為：[待填]
停止條件是否觸發：[待填]
```

---

## Phase 4：Cleanup（待執行）

### 4.1 Plugin 移除

```text
移除指令：/plugin remove superpowers（或對應的 uninstall 指令）
移除時間：[待填]
移除結果：[待填]
```

### 4.2 Test Repo 清理確認

```text
git status --short（移除後）：[待填]
git branch -a（移除後）：[待填]
殘留狀態確認：[無殘留 / 有殘留（記錄）]
```

### 4.3 全域確認

```text
Claude Code plugin 清單確認 superpowers 已移除：[待填]
```

---

## Phase 5：Trial 結論（待填寫）

```text
What I Tried：[待填]
What Worked：[待填]
What Failed：[待填]
What I Still Don't Understand：[待填]
Workflow Potential：[待填]
Content Potential：[待填]
Decision：
  [ ] Watch
  [ ] Retry Later
  [ ] Document
  [ ] Light Test Again
  [ ] Move to Intake Review
  [ ] Reject
  [ ] Archive
```

---

## Lifecycle Status

- Document Only Review：Completed（2026-05-19）
- Security Checklist：Completed（2026-05-19）
- Practical Trial：**In Progress（Phase 1 完成，Phase 2 待執行）**
