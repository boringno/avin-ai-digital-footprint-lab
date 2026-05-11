# External Carousel Skill Test Plan

日期：2026-05-11  

分類：Workflow / Skill Test Plan  

狀態：Draft

---

## 1. Title

External Carousel Skill Test Plan

---

## 2. Purpose

- 不閉門造車
- 先用外部 Skill 跑一次真實內容
- 評估 `social-media-carousel` / `content-repurposing` 等外部 Skill 是否值得導入或融合

---

## 3. Test Material

- 主題：你的 AI 工具今天正常嗎？
- 內容：Gawk Dev / AI coding stack status radar
- 形式：10 張 IG 輪播文案
- 核心觀點：當 AI 變成工作流的一部分，它就不只是工具，而是基礎設施；基礎設施需要被監控

---

## 4. Primary External Skill to Test

- `social-media-carousel`

測試原因：

- 專門處理多頁 carousel
- 支援 IG / LinkedIn 等平台
- 有 hook slide / text hierarchy / swipe psychology
- 有平台尺寸與視覺輸出概念

---

## 5. Secondary External Skill to Observe

- OpenClaudia `content-repurposing` / `linkedin-content`

測試原因：

- 適合跨平台轉譯
- 可觀察同一母內容如何拆成 LinkedIn / Threads / IG / GitHub Note

---

## 6. Local Baseline

- Threads 內容生產引擎 2.0
- Skill B：輪播貼文架構師
- Skill C：語氣風險官
- 這次不是取代，而是拿來當比較基準

---

## 7. Test Workflow

### Step 1: Use Gawk Dev carousel copy as input

以 AVIN 已完成的 Gawk Dev 輪播文案作為唯一測試素材，避免測試同時混入新題目變數。

### Step 2: Run social-media-carousel

使用外部 `social-media-carousel` Skill 產出一版輪播結構與文案安排。

### Step 3: Save external output

保留外部 Skill 的完整輸出，方便後續逐頁比較。

### Step 4: Compare with AVIN original 10-slide version

將外部版本與 AVIN 原本的 10 張輪播版本逐頁對照，判斷 hook、結構、節奏與觀點差異。

### Step 5: Run local Skill C style / risk review

用本地 Skill C 的語氣與風險檢查方式，看外部版本是否偏 generic、失去 AVIN 視角，或過度模板化。

### Step 6: Decide whether to adopt, localize, merge, or reject

測試結論只做四選一：

- adopt
- localize
- merge
- reject

### Step 7: Document findings

把測試結果寫成比較紀錄，不只保留結論，也保留原因與可重複使用的觀察。

### Step 8: If useful, create AVIN-localized carousel skill later

如果外部 Skill 的部分做法有效，再考慮下一輪建立 AVIN-localized carousel skill，而不是現在就先融合。

---

## 8. Evaluation Criteria

- Hook strength
- Slide clarity
- Swipe flow
- Visual brief quality
- Mobile readability
- CTA clarity
- AVIN voice retention
- AI Workflow Explorer positioning
- Not too generic
- Can connect back to Notion / GitHub lifecycle

---

## 9. Output to Produce

- External carousel output
- Comparison note
- Decision note
- Possible localized Skill update

---

## 10. What This Test Avoids

- 不先合成超級 Skill
- 不直接整包導入
- 不因為是開源就盲目採用
- 不只看文案漂亮，要看能不能接回 AVIN OS
