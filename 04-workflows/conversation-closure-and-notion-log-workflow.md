# Conversation Closure and Notion Log Workflow

Date: 2026-05-11
Type: Workflow / Closure / Notion
Status: Draft

---

## 1. Purpose

This workflow is used to close and compress work when:

- 對話太長，需要中途收斂
- 任務尚未完成，但已經完成一個明確階段
- Codex 關閉前需要留下可接續的紀錄
- 需要交接給其他 AI 或之後的自己

這份流程的目的不是只做摘要，而是把工作進度、判斷脈絡、下一步與記憶回寫一起整理好，讓 AVIN AI Digital Footprint OS 可以持續累積而不是每次重來。

---

## 2. Closure Types

- 中繼收斂
- 最終結案收斂

---

## 3. When to Use Intermediate Closure

- 對話框太長
- 已完成明確階段
- 任務尚未完全結案
- 下一步已明確
- 需要其他 AI 接手

---

## 4. When to Use Final Closure

- 發布完成
- URL 回寫
- Notion / GitHub 狀態更新
- lifecycle completed

---

## 5. Required Outputs

- 給 AVIN / 社群看的建構日誌
- 給其他 AI 接手看的摘要
- 專案設定更新建議
- OS 文件更新建議

---

## 6. Notion Writing Guidelines

- 類型：🤖 AI工作室
- 心情：😊 很好 或 🙂 還不錯
- 日期：今天
- 備注：簡短說明

---

## 7. Voice Guidelines

- 不只寫做了什麼
- 要寫 AVIN 的觀點
- 要寫策略判斷
- 要寫為什麼這樣選
- 要保留 AVIN 這個人的成分

---

## 8. Codex / ChatGPT Division

- Codex 負責技術收斂
- ChatGPT 負責策略與人味收斂
- Notion / GitHub 是共同記憶層

---

## 9. Standard Prompt

以下是目前可重用的「對話收斂與 Notion 日誌回寫」提示詞摘要版：

```text
請根據目前這輪工作的進度，做一次對話收斂與 Notion 日誌回寫準備。

請整理：
1. 這一輪完成了哪些明確成果
2. 還有哪些未完成 / 待確認 / 待發布事項
3. repo / GitHub / lifecycle 還缺哪些回寫
4. 下一步最合理的接續動作
5. 一段可寫進 Notion 的 AI工作室日誌

請不要只列事情，要保留 AVIN 的觀點、判斷與為什麼這樣做。
```
