# AI Trend to Workflow Experiment｜AI 趨勢到工作流實驗

## 1. 工作流目的

這份文件用來定義：當 AVIN 看到一則 AI trend signal 時，如何把它轉成一個小型、可控制、可回顧的 workflow experiment，而不是直接陷入漫無目的的安裝、試玩或追風。

---

## 2. 適用情境

- 看到新的 AI tool、repo、paper、workflow 或 agent pattern
- 想確認它是否真的會改變某個工作流
- 想在 1 到 2 小時內做出一個最小驗證
- 想把結果回寫成 GitHub note、workflow doc 或公開內容
- 想先驗證是否值得進 open-source-vault、Hermes Agent Track 或 Productization Layer

---

## 3. 不適用情境

- 只有話題熱度，沒有清楚功能或使用場景
- 需要高權限 token、危險本地存取或不明 package 才能開始
- 只想蒐藏，不打算驗證
- 沒有明確假設，也沒有可回顧的輸出格式
- 與 AVIN 現階段 Stage 2 主線無關

---

## 4. Input

- AI signal
- source URL
- short summary
- why it matters
- possible AVIN use case

建議最小輸入格式：

```text
Signal:
Source URL:
Short summary:
Why it matters:
Possible AVIN use case:
```

---

## 5. Review questions

- 這個趨勢是真的改變 workflow，還是只是新包裝？
- 是否能在 1–2 小時內做 light test？
- 是否需要 API key / local install / token？
- 是否有公開內容角度？
- 是否跟 Hermes Agent Track 或 Manual OS 有關？

補充追問：

- 它改變的是 input / output、速度、可重複性，還是只是 UI 新鮮感？
- 如果不做這個測試，AVIN 會錯過什麼？
- 如果做了，最小可交付結果是什麼？

---

## 6. Output types

- Watch note
- GitHub note
- Workflow test plan
- LinkedIn / Threads draft
- open-source-vault candidate
- Reject / archive note

同一則 signal 不一定要產生所有 output。

重點是讓每次 experiment 都有可回收的成果，而不是只留在聊天或腦中。

---

## 7. Minimal experiment format

### Hypothesis

這個 signal 可能改變哪一段 workflow，或能不能解決哪個 friction point。

### Test material

要測什麼素材、哪個 repo、哪段內容、哪個 use case。

### Steps

用最少步驟完成最小驗證，避免變成開新專案。

### Result

觀察到什麼實際輸出、限制、問題或驚喜。

### Human review

AVIN 要判斷結果是否真的有價值，而不是只看工具有沒有跑起來。

### Decision

Watch / Test More / Document / Integrate / Reject / Archive

### Next action

是否回寫 GitHub、Notion、content draft、open-source-vault 或 Hermes Agent Track。

---

## 8. Recommended experiment flow

```text
AI signal
-> intake summary
-> review questions
-> decide minimal experiment scope
-> run light test or workflow test
-> capture result
-> human review
-> decision
-> writeback
```

---

## 9. Completion condition

- 文件完成
- URL 回寫
- 狀態更新
- lifecycle completed

換句話說，experiment 不以「有試過」為完成，而以「有留下可追蹤記錄」為完成。

---

## 10. 與 AVIN Stage 2 的關係

這個 workflow 支持的是：

`Public Research & Real Workflow Experiments`

它的目的不是快速導入所有新工具，而是讓 AVIN 將 AI trend 研究，轉成可驗證的小實驗、GitHub 證據層與公開輸出素材。

---

## 11. 與 Manual OS / Hermes Agent Track 的關係

### Manual OS

由 AVIN 手動決定要不要測、測到哪一層、是否公開、是否回寫。

### Hermes Agent Track

未來可以作為支線探索者，幫忙整理來源、生成 intake summary、提出 import proposal 或做低風險觀察。

但在第一階段，不應該讓 agent 自動把 trend 直接導入主系統。

---

## 12. 建議避免

- 看見熱門 repo 就直接 clone
- 測試沒有假設
- 只記錄工具名稱，不記錄 workflow 意義
- 把每個 trend 都寫成大專案
- 還沒 human review 就直接做公開結論

這份 workflow 的核心，是讓 AVIN 維持探索速度，同時保留架構感與可回顧性。
