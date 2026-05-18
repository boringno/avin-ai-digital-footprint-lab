# Open Source Vault Security Checklist｜開源能力安全檢查表

## 1. 文件目的

這份文件用來提供 `open-source-vault` 的最小安全檢查規則。

它不是完整安全審計，而是讓 AVIN 在面對外部候選項目時，先用一致的問題去判斷：

- 能不能碰
- 能碰到哪一層
- 只能看文件，還是可以做 light test
- 是否應直接停在高風險區

---

## 2. 核心檢查問題

### 權限與憑證

- 是否需要 API key？
- 是否需要 GitHub token？
- 是否涉及 credential / token / CI/CD？
- 是否可能接觸 Notion / GitHub / local repo？

### 本地與執行能力

- 是否會讀寫 local files？
- 是否會執行 shell command？
- 是否涉及 code execution？
- 是否需要 package install？

### 外部連線與自動化

- 是否會連外部服務？
- 是否會存取瀏覽器？
- 是否涉及 browser automation？

### 治理與可控性

- 是否有 unclear license？
- 是否有近期維護？
- 是否適合 sandbox？
- 是否可以只讀模式測試？

---

## 3. 建議記錄格式

```text
Project:
URL:
API key needed:
GitHub token needed:
Touches local files:
Runs shell commands:
External service access:
Browser access:
Package install needed:
License clarity:
Recent maintenance:
Touches Notion / GitHub / local repo:
Sandbox fit:
Read-only test possible:
Credential / token / CI/CD involvement:
Browser automation involved:
Code execution involved:
Risk level:
Notes:
```

---

## 4. Risk Level

- Low
- Medium
- High
- Critical

### Low

風險較低，可進入 intake review。

典型條件：

- 可只讀觀察
- 權限需求低
- 不需要敏感 token
- interface 清楚
- 文件成熟

### Medium

可做 light test，但需限制權限。

典型條件：

- 需要局部權限
- 可能涉及本地執行或有限外部連線
- 可 sandbox
- human review 後可做低風險測試

### High

只做文件研究，不做 local run。

典型條件：

- 需要高權限 token
- 涉及廣泛 local file access
- 執行方式不透明
- 需要安裝不明 package
- 可能直接影響 repo、Notion 或瀏覽器環境

### Critical

先不碰。

典型條件：

- 權限範圍不明
- 會接觸敏感 credential / CI / production target
- 存在明顯供應鏈風險
- license 不清楚且文件嚴重不足
- 自動化行為不可控

---

## 5. 建議規則

- `Critical`：先不碰
- `High`：只做文件研究，不做 local run
- `Medium`：可做 light test，但需限制權限
- `Low`：可進入 intake review

---

## 6. 補充判斷原則

### API key / Token

只要外部候選需要高權限 key 或 token，就不應直接進入測試主線。

### Local file / Shell / Code execution

若候選會讀寫本地檔案、跑 shell 或執行任意程式碼，需優先看 scope 是否可限制。

### Browser automation

瀏覽器能力不是小風險。只要涉及 browser automation，就應額外看：

- 它會操作哪些頁面
- 是否可能讀取登入狀態
- 是否需要人工確認

### Package install

Stage 2 不應因為單一候選就急著安裝一串依賴。先確認文件研究是否已足夠，再決定是否有必要進一步測。

### License / Maintenance

license 不清楚或維護停滯，代表即使功能有趣，也不該被輕易視為主線候選。

---

## 7. 與 open-source-vault 的關係

這份 checklist 不是要阻止 AVIN 看外部能力，而是讓外部能力先經過風險分層。

目標不是保守到什麼都不做，而是避免把高風險候選誤當成低成本試驗。

---

## 8. Stage 2 的安全邊界

在 Stage 2，AVIN 的核心仍是：

- 公開研究
- workflow experiment
- GitHub 文件化
- human review

因此安全檢查應偏向：

- 先讀
- 先判斷
- 先限制
- 再決定要不要測

而不是因為工具新、MCP 熱或 agent 話題高，就直接進本地執行。
