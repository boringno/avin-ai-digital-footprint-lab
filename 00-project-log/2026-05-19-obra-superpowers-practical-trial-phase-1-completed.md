# obra/superpowers Practical Trial Phase 1 完成紀錄 | 2026-05-19

## 1. 任務背景

AVIN 使用口令「啟動 Practical Trial：obra/superpowers」觸發此任務。

Phase 1 的範圍：建立隔離 test repo、確認安裝方式、建立 trial log 文件框架。
不安裝 plugin、不進入 Phase 2、不操作 New project 2、不修改 test repo。

Claude Code 以 Write Documentation Mode 執行。

## 2. Phase 1 已完成事項

| 項目 | 狀態 | 說明 |
|---|---|---|
| Test repo 建立 | ✓ 完成 | `C:\Users\user\Desktop\superpowers-trial`，純本地 throwaway repo |
| Test repo git init | ✓ 完成 | master branch，init commit `9563ab2` |
| Test repo 隔離確認 | ✓ 確認 | 無 remote，與主 repo 完全隔離 |
| 安裝方式確認 | ✓ 完成 | `/plugin install superpowers@claude-plugins-official`（Anthropic 官方市場）|
| 已知 bug 記錄 | ✓ 完成 | v4.3.1 marketplace name collision bug，workaround gist 已記錄 |
| Trial Log 建立 | ✓ 完成 | `open-source-vault/practical-trials/obra-superpowers-practical-trial.md` |
| Project card 更新 | ✓ 完成 | Lifecycle Status → Practical Trial In Progress |
| docs-index 更新 | ✓ 完成 | 兩個條目（00-project-log 區段 + open-source-vault 區段）|
| Commit & Push | ✓ 完成 | `f356dfc docs: obra/superpowers practical trial started, phase 1 completed` |

## 3. Test Repo 狀態（Phase 1 完成後確認）

| 項目 | 狀態 |
|---|---|
| 路徑 | `C:\Users\user\Desktop\superpowers-trial` |
| Branch | master |
| git status | 空白（clean）|
| git remote | 無（純本地）|
| Commits | `9563ab2 init: throwaway test repo for obra/superpowers practical trial`（唯一）|
| Plugin 安裝 | 未執行 |

## 4. Plugin Install 尚未開始

Phase 2 的安裝指令已確認但尚未執行：

```
/plugin install superpowers@claude-plugins-official
```

在 AVIN 明確觸發「繼續 Phase 2」之前，不執行任何安裝動作。

## 5. 實際 Trial Log 路徑

```
open-source-vault/practical-trials/obra-superpowers-practical-trial.md
```

Trial Log 已包含 Phase 1–5 的完整記錄框架，Phase 2–5 各區塊填入「待執行」，等待 Phase 2 install 開始後逐步填寫。

## 6. 為什麼不改名 Trial Log

本次任務確認：不重新命名 `obra-superpowers-practical-trial.md`。

理由：
- 該檔案已建立、已 commit、已 push，docs-index 兩個條目均已指向此路徑
- 重新命名需要移除舊檔、建新檔、更新 docs-index 所有引用，成本高但效益低
- 檔名 `obra-superpowers-practical-trial.md` 語意清楚，不影響可讀性
- 若未來 Trial 完成後有需要，可在完成紀錄中統一說明命名邏輯

## 7. 下一步：Phase 2 Install Test

Phase 2 等待 AVIN 觸發，步驟如下：

1. 在 Claude Code 中輸入：
   ```
   /plugin install superpowers@claude-plugins-official
   ```
2. 確認安裝結果（成功 / 失敗 / 需要 workaround）
3. 確認 plugin 出現在指令清單（輸入 `/` 查看）
4. 回報結果，接著進入 Task 1（test repo 中的最小試驗）

安裝注意事項：
- 若出現 name collision bug（v4.3.1），參考 workaround：
  `https://gist.github.com/gwpl/cd6dcd899ca0acce1b4a1bc486d56a9e`
- 安裝後立即記錄 test repo 的 `git status` 和 `git branch -a`（Phase 3.1 baseline）

## 8. 禁止事項

- 沒有安裝任何套件
- 沒有 clone repo
- 沒有執行任何程式碼
- 沒有接 API / MCP
- 沒有操作 Notion
- 沒有操作 New project 2
- 沒有修改 test repo
- 沒有進入 Phase 2
- 沒有使用 git add .

## 9. Git Status Snapshot

```text
Phase 1 完成後 commit：
f356dfc docs: obra/superpowers practical trial started, phase 1 completed

新增文件：
A  open-source-vault/practical-trials/obra-superpowers-practical-trial.md

修改文件：
M  open-source-vault/projects/obra-superpowers.md
M  docs-index.md

Phase 1 Completion Log commit（本次）：
A  00-project-log/2026-05-19-obra-superpowers-practical-trial-phase-1-completed.md
M  docs-index.md

Commit message: docs: add obra superpowers practical trial phase 1 log
```
