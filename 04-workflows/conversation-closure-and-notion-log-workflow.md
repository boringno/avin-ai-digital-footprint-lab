# Conversation Closure and Notion Log Workflow

日期：2026-05-11  

分類：Workflow / Closure / Notion  

狀態：Draft

---

## 1. Purpose

此流程用於以下情境的收斂：

- 對話太長
- 任務完成前
- Codex 關閉前
- 需要交接時

目標不是只做技術紀錄，而是把技術收斂、策略判斷、AVIN 的觀點與下一步，都整理成可交接、可回寫、可延續的 OS 記憶。

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

可使用以下摘要版提示，作為對話收斂與 Notion 日誌回寫的標準起點：

```text
請幫我做一次對話收斂與 Notion 日誌回寫。

請整理：
1. 這一輪完成了什麼
2. 哪些檔案 / 連結 / 輸出已經產生
3. 目前 repo 狀態與 lifecycle 狀態
4. 下一步建議
5. 幫我轉成一版適合 Notion 的 AI工作室日誌

寫法不要只有流水帳，要保留 AVIN 的觀點、策略判斷與為什麼這樣選。
```
