# LINE AI 專案協作與智能分工

## 產品目標

官方 LINE 必須先回答客人當下的問題，再自然推進需求理解與預約。不要用新增療程特例、截圖原句 regex 或重貼固定介紹修 bug。

Conversation V2 是替換方向；V1 Router 已凍結。可重用 V1 的核准資料與 proven services，但不得把 V1 的 priority chain 搬進 V2。

詳細架構與資料缺口見 `docs/conversation-v2-parity-replacement-blueprint.md`。

## 不可破壞的邊界

- 價格、院內供應、活動資格／日期、預約 mutation 只由診所核准資料與 deterministic tools 決定。
- 安全、個資、整形外科與真人接手在 LLM 前處理。
- LLM 可理解語意與自然表達，不擁有 clinic facts、state transitions 或 lifecycle。
- 一輪只有一個 winning action，但不得丟失同輪其他待回答問題。
- 未經明確批准，不讀 `.env`、不改 Production env、不 push、不 merge、不部署。
- 保留使用者既有 dirty files；不得順手清理或 reset。

## 智能分工

### LUNA 中（若當前執行環境可用）

- 真實句型蒐集、去識別化、同義變體與文案草稿。
- 按既定 schema 填資料、檢查 emoji／手機可讀性。
- 只依已核准 facts 與 Response Contract 產生客服文字。
- 不設計 state、policy、價格 ownership、安全或 cutover。

若執行環境沒有 LUNA subagent，使用 TERRA 低／中處理同類機械任務；不得假裝已使用 LUNA。

### TERRA 中／高

- 中：盤點、fixture、資料轉換、adapter、報表、機械測試。
- 高：邊界明確的 reducer／provider／resolver／test harness。
- 不自行決定產品語意；遇到跨 state/policy/renderer 衝突要升級。

### SOL 高

- 根因診斷、跨模組接線、hydrate／renderer／facts 整合。
- Response Contract 實作、故障注入、PR 審查與回歸判定。

### SOL 超高

以下狀況必須升級，由 SOL 超高做設計或最後裁決：

1. canonical state／schema／ownership 變更。
2. 多意圖、否定、指代、改口、插問與短答承接的優先序。
3. 價格、院內供應、活動、預約、真人接手、安全邊界。
4. partial-data policy 或官方背景資料的允許範圍。
5. V1/V2 cutover、舊狀態遷移、legacy 刪除。
6. durable inbox/outbox、併發、重送與送達後 commit。
7. 測試期望互相矛盾，或診所需求與硬規則衝突。
8. 同一問題修兩次仍復發，或 Production incident 跨三層以上。
9. canary go/no-go 與全量切換。

## 每個 Conversation V2 變更的驗收

- 以語意家族測試，不只測截圖原句。
- 同時驗 NLU、policy/state、facts hydration、Response Contract、客人可見回覆。
- 新資料必須同時有 provider、resolver、renderer grounding 與 journey；只有載入 memory 不算完成。
- 產出者不得單獨放行自己的高風險變更；至少由另一個 agent 做獨立審查。
- 回報要分清楚：已驗證、條件接受、未驗證，不用「checks 綠」代替 Production 證據。
