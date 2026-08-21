# Conversation State V3 與 Response Contract

## 目的

State V3 解決的是「系統知道客人目前在談哪個主題、已回答什麼、下一題實際問了什麼」；Response Contract 解決的是「本輪必須回答什麼、不能重講什麼、允許推進哪一步」。

兩者不負責療程文案，也不讓 LLM 擁有價格、院內品項、預約或真人接手決策。

## 本批次的上線邊界

- `ConversationStateV3`、V2→V3 純函式 migration、版本感知 loader 與 transition helpers 已建立。
- 正式 `conversationV2State` 仍保存 schema 2；新的 `conversationStateEnvelope` 目前只提供 preservation-first serializer，尚未交給 policy／renderer 或 canary 寫入。
- 未知未來版本會以 raw JSON 通過 context hydrate、local/Supabase context CAS 與無關欄位更新；舊 runtime 不得降版覆寫。格式錯誤、缺 registry、tenant／registry 不符都 fail closed，不建立空白 state。
- Facts provider 會提供獨立 `stateRegistryCatalog`。`registryId` 由 builder 依 tenant、`ontologyVersion`、active／archived 的 exact canonical keys 與明列的 approved fact／controlled answer keys 重算驗證；provider 不接受任意 supplied ID。它不使用包含價格、活動與 availability 的 `snapshotId`。
- V2/V3 解析必須注入同一 facts snapshot 建立的 registry；State 層不得引用全域診所設定或猜測 key。
- 每個 policy／renderer plan 都有必填 `responseContract`，但目前一律為 `{ mode: "off" }`。
- Contract 不進 prompt、不進 renderer guard，因此本批次不改任何客人可見回覆。
- `sendReplyPayloads` 已有最小資料面的 post-2xx delivery hook；只有 LINE Reply API 真正接受、且未被真人 ownership guard 抑制時才觸發。即使 2xx response body 無法讀取，也不得重用一次性 reply token。Production 尚未註冊 V3 commit callback。

## State V3 ownership

| 欄位 | Owner | 意義 |
|---|---|---|
| `activeSubjectKey` | Dialogue policy | 目前主要療程、比較組合或困擾主詞 |
| `subjects[].knowledge` | State reducer | 各主詞的結構化已知資料；不是生成文字 |
| `subjects[].answeredAspects` | Delivery commit | LINE 成功送出後，renderer 回報實際完成的面向 |
| `pendingQuestion` | Delivery commit | 客人實際收到、等待回答的問題語意；只存 contract-derived key 與 canonical option value，不存 rendered prose／label |
| `customerGoal` / `stage` | Dialogue policy | 客人目前要了解、比較、決定、預約或接手，以及流程階段 |
| `processedDeliveryIds` / `processedResponseTurnIds` | Delivery commit | 在 64 筆 replay window 內，防止同一送達 receipt 或同一來源 turn 重複寫入 |

既有 V2 `knowledge` 在過渡期仍是 active projection；V3 `subjects` 才是未來的 subject-scoped 長期記憶。正式切換前，reducer 必須完成雙向一致性，不能讓兩者變成互相競爭的真相來源。

## Response Contract ownership

| 欄位 | 唯一 Owner | 其他層只能做什麼 |
|---|---|---|
| `mustAnswer` | Policy | Facts provider 提供核准證據；renderer 完成表達 |
| `mustNotRepeat` | State + Policy | Renderer 可另做文字重複 guard，但不能刪除語意限制 |
| `nextStep` | Policy | Renderer 只把指定下一步說得自然 |
| `ctaPolicy` | Policy | LLM 不能自行開始預約、強推 CTA 或轉真人 |

`ResponseContractAttachment` 使用明確的 `off / shadow / enforce`，避免 optional contract 被漏接。Shadow 或 enforce 必須另行批准。

## Delivery-side commit

```text
Policy 建立契約
  → Facts hydration
  → Renderer 產生文字並回報實際完成面向
  → Output guard
  → LINE 成功送出
  → 才 commit answeredAspects / pendingQuestion
```

Policy、hydrate 或模型開始生成時都不能先標記「已回答」。若 timeout、guard 拒絕、fallback 或 LINE 送出失敗，State 不得假裝客人已收到答案。

目前的 hook 只代表「LINE Reply API 以 2xx 接受」，不是客人已讀。callback 只收到不含客人原文、reply token 或 LINE response body 的 delivery identity。hook 失敗只告警，不可重送已成功的 LINE 回覆。

既有 webhook dedupe 會在送 LINE 前登記，且 Vercel local fallback 並非 durable；network `status=0` 也無法證明 LINE 未接受。這兩個既有邊界在 durable inbox/outbox 與 crash reconciliation 完成前，會阻擋 Production route 註冊 V3 delivery callback，不能用「best effort」掩飾。

## Subject transition invariant

- 同主詞的價格／館別等短暫插問：保留原 pending question。
- 明確換療程／換困擾：取消舊主詞的 pending question，但保留舊 subject memory。
- 沒有提出新問題的 delivery 預設保留 pending question；只有 reducer 明確標記 `clear`，或新問題成功送達取代它時，才能清除。
- 新主詞不繼承舊主詞的 answered aspects。
- Migration 不根據 `lastIntent` 猜目標，不創造療程、價格、預約或 handoff。
- 姓名、電話只留在既有 booking draft；`dialogueProgress` 只接受 tenant/content-version registry 內、且類別相符的 canonical keys。
- key 必須是 exact canonical value：不可為空白、不可含前後空白、不可跨類別；catalog 不會 trim 後接受。已下架 key 可列在 archived catalog 作為可稽核的歷史資料，但不會自動進入 State V3 的 active allowlist，也不會自動承接舊 `registryId`。active→archived 後，舊 state 必須維持 `registry_mismatch` fail-closed，直到明確實作並註冊 compatibility／migration。
- receipt migration 後仍可在 bounded replay window 內去重；同一來源 turn 即使換 delivery ID 也不能重複提交。

## 正式接線前的必要工作

1. 將已存在的 tenant-aware registry scope 接到 live V3 loader；遇到 `future`／`needs_ontology`／`invalid` 不可執行 V3 policy mutation。
2. Policy 產生 shadow contract，State 提供 subject-scoped `mustNotRepeat`。
3. Renderer 回報結構化 completed aspects 與實際 next step，建立不含客人原文的 delivery commit candidate。
4. 建立 durable inbox/outbox、送達結果的 `accepted / rejected / unknown` 狀態與 crash reconciliation；完成前不在 Production route 註冊 V3 delivery callback。
5. 接上最小 delivery commit candidate 與 post-2xx V3 CAS，再以測試帳號整段對話 canary，比對答題率、重複率、CTA 正確率與延遲。
6. Canary 過門檻後，才決定 Response Contract enforce／V3 cutover。

在第 1、3、4 項完成前，V3 delivery commit 不得接入 canary；目前骨架不保存模型最終問句或選項 label，避免姓名、電話與預約資料被複製進 dialogue state。
