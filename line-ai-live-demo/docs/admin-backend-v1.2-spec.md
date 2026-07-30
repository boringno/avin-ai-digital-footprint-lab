# Admin Backend v1.2 規格 — 訊息分類、月報彙總、AI 建議、內容版本管理

> 狀態：規劃定稿（尚未實作）。初稿 2026-07-13；同日依使用者 10 點定案修訂（r2）。
> 前置：v1.1 全部工單（A1→B→A2→C→D→E）已完成並通過審查。
> 本文件只做規劃，不含任何程式碼變更。

## 修訂紀錄（r2 定案）

1. 新表共 **8 張**（初稿誤計 7 張）。
2. 工單順序改為 **R0 分類基礎 → R1 彙總 → R2 月報頁 → V1 版本管理後台 → S1 AI 建議 → V2 runtime 灰度 → R3 易用性改版 → R4 Sheets 收尾**（分類是月報/FAQ miss/療程活動分析的共同依賴，必須最先）。
3. Vercel 採 **Hobby** 方案：cron 設計為單一每日 job，不假設 Pro 功能。
4. 20260622 舊表（faq_entries / pricing_campaigns / handoff_rules / customers / messages / webhook_events）**保留 legacy read-only，不 rename 不刪除**；V1 穩定後人工確認無用途再處置。
5. LLM 二次分類 **MVP 關閉**：先用 rule mapping ＋ other/unclassified 統計；other 占比持續偏高時才另案提出（需人工核准）。
6. 資料保留定案：原始對話、姓名、電話、預約明細 **180 天**；去識別化 daily/monthly metrics **至少 13 個月**。retention 與匿名化排程納入資料規格（見 2.4）。
7. Google Sheets 定位為**可選匯出**，非營運真相來源、非本階段依賴；R4 延後，等月報頁成熟再決定是否保留匯出。
8. analyst 僅可看**去識別化月報與統計**，不可看電話、完整對話、原始預約線索；現況 analyst 可看 /admin/leads 標記為**待修正權限缺口**（於 R2 修正）。
9. 月報 **MVP 不顯示客人原話**；未來需要案例時，須去識別化且經 owner 審核後才可呈現。
10. V2 切換順序：**FAQ 先（低風險，觀察一週）→ 療程介紹其次 → 活動與價格最後**（時效與報價風險最高）。
11. **Non-Negotiable：internal usage（例如 `ai_model`、`ai_tokens_*`、OpenAI 成本）僅供系統維運與內部稽核，不得出現在任何客戶可見頁面、匯出或報表。**

---

## 1. 目前程式現況與缺口

### 1.1 現況（與本次規劃相關的部分）

| 面向 | 現況 | 位置 |
|---|---|---|
| 決策/意圖紀錄 | 每則客人訊息已存 `intent`（matchedKey 或 decisionType）與 `payload_json`（decision_type / matched_key / matched_type / reply_status / used_ai_reply_generator） | `conversation_messages`；寫入於 admin-webhook-sync.ts |
| DecisionType | 9 種：clinic_info_reply / treatment_intro_reply / booking_intake_reply / medical_guidance_reply / pricing_auto_reply / doctor_schedule_auto_reply / handoff_pending / faq_auto_reply / fallback_reply | router.ts:26-35 |
| LLM 使用 | 只在 fallback_reply 且允許時呼叫 1 次（Claude 或 OpenAI）；其餘 8 種 decision 為純規則、0 次 LLM | line-webhook.ts:308-321 |
| FAQ / 活動資料來源 | CSV seed（approved_faq_seed.csv 等 4 檔）→ 讀不到時 fallback 到 embedded-seed-data.ts；**不經過 DB** | seed-loader.ts |
| 療程 / 館別 / 困擾 | 寫死在 clinic-config.ts（17 療程含 aliases、6 館別、6 困擾映射） | clinic-config.ts |
| 活動時效 | PricingCampaign 已有 start_date / end_date / asset_urls / campaign_aliases，過期自動失效 | seed-loader.ts:35-48、router.ts:238-247 |
| 彙總報表 | 只有 Google Sheets `daily_aggregate` 分頁（6 欄），webhook 觸發即時累加；無月報 | google-sheets-log.ts |
| 排程基礎設施 | **完全沒有**：無 vercel.json、無 cron、無定期 job | — |
| audit | audit_logs 表 + writeAdminAuditLog（best-effort、含 before/after），涵蓋 control / staff-message / leads update / team | admin-audit.ts |
| 權限 | requireAdminStaff（不帶 role）＋ 每個 page/API 各自呼叫 canUseWorkbench / canViewLeads / canEditLeads / canViewTeam / canManageTeam | admin-auth.ts |
| RLS | 全表 enable RLS + revoke anon/authenticated，無 policy；一律 service role 經 `/api/admin/*` 存取 | 20260710 migration |
| tenant | 全表有 tenant_id（default 'tenant_001'），應用層硬編單租戶 | admin-webhook-sync.ts:7 |

### 1.2 缺口（v1.2 要補的）

1. **無任何日/月彙總機制**——Sheets daily_aggregate 只有 6 個數字，且掛在 webhook 即時路徑上；月報所需的 20+ 指標無處可算。
2. **無 cron**——所有彙總、FAQ miss 掃描、建議產出、retention 清理都需要排程基礎設施，這是四個模組共同的前置工程。
3. **無 token/model 紀錄**——conversation_messages 沒存 LLM model 與 token 用量，成本追蹤缺原料（低優先，加欄位很便宜，併入 R1）。
4. **intent 是技術字串不是業務分類**——`intent` 存的是 matchedKey（如 `treatment_intro:onda_pro`）或 decisionType，報表需要一層「可稽核的業務分類對照」。**這是 R0 最先做的原因：月報、FAQ miss、療程/活動分析都依賴它。**
5. **FAQ/活動內容無版本、無審核流**——CSV seed 檔沒有草稿/審核/發布狀態、沒有修改人紀錄；20260622 的 `faq_entries` / `pricing_campaigns` / `handoff_rules` 三張 DB 舊表雖有 approval_status 欄位，但程式碼完全不讀它們，屬閒置遺產（定案：保留 legacy read-only，暫不處置）。
6. **原始資料無 retention 執行機制**——runtime_state 有 retention_expiry 欄位但沒有任何排程真的去清；conversation_messages / booking_leads_db 的個資完全沒有保留期設計（定案 180 天，見 2.4）。
7. **首次回覆時間 / 真人等待時間可算但沒人算**——conversation_messages 時間戳 + handoff_tasks created_at/resolved_at 原料齊全。
8. **後台首頁不是「現在要處理什麼」**——workbench 是佇列但缺「AI 已整理重點、建議下一步」；易用性原則（本文第 8 節）要求重排資訊優先序。
9. **【待修正權限缺口】analyst 現況可看 /admin/leads**（canViewLeads 含 analyst，admin-auth.ts:114-116），能看到客人姓名與電話——與定案「analyst 僅可看去識別化月報與統計」不符。在 R2 專屬報表頁完成前，此為已知缺口；**R2 工單內將 analyst 從 canViewLeads 移除**，改導向報表頁。

### 1.3 針對 G 節的檢查結論

- **`conversations` + `conversation_runtime_state` 邊界適合報表嗎？** 適合，但報表**只應讀 `conversations` / `conversation_messages` / `handoff_tasks` / `booking_leads_db`**（業務鏡像層），不應碰 runtime_state（AI 狀態機內部）。
- **`booking_leads_db` 足以當預約漏斗來源嗎？** 足以：booking_status 六階段（new→contacted→booked→arrived→won/lost）就是漏斗；缺「狀態變更時間」——漏斗轉換耗時靠 audit_logs 的 before/after 回推，MVP 在彙總 job 裡從 audit_logs 抽，不加欄位。
- **audit_logs 足以追蹤內容發布嗎？** 足以追蹤「人工操作」（有 before/after/actor），但不足以當版本管理——沒有版本號、變更原因、審核人欄位。版本管理用專門的 content 表（第 2 節），audit_logs 繼續當操作流水帳。
- **Google Sheets 定位（定案）**：**可選匯出工具**，不是營運真相來源，也不是本階段依賴。現有同步照常運作但功能凍結；v1.2 所有新報表只做在 DB + 後台頁。R4（daily_aggregate 停寫與匯出去留）延後到月報頁成熟後再決定，不在近期主線。
- **成本與限制**（定案：Vercel Hobby）：
  - Supabase free：500MB DB / 每月 5GB egress。conversation_messages 是最大成長源；180 天 retention（2.4）同時是個資與容量的解法。cron 彙總用單一批次查詢，不逐列迴圈。
  - Vercel Hobby：**cron 每日最多 2 個 job、觸發時間不保證精確、function 上限 60s**。本規格全部彙總/清理收斂進**單一每日 job**，內部分步驟、可分段重入、冪等。
  - OpenAI/Claude：現況每客訊最多 1 次 LLM 呼叫（fallback 才用）；LLM 二次分類 MVP 關閉（定案），本階段 LLM 成本結構不變。
- **多租戶擴展**：四個模組所有新表一律帶 `tenant_id` + 複合索引 + 與現有表相同的 RLS 姿勢。彙總/清理 job 以 tenant 為迴圈單位設計（函式簽名收 tenantId 參數）。未來多租戶只需：租戶註冊表、config 從單一 clinic-config 變成 per-tenant content（模組 4 的 DB 化方向）——不需重寫這四個模組。

---

## 2. v1.2 資料架構

### 2.1 新增資料表（8 張）

所有表共同規範：`tenant_id text not null default 'tenant_001'`、`created_at`/`updated_at` + set_updated_at trigger、enable RLS + revoke anon/authenticated（無 policy，service role only）、索引一律以 `(tenant_id, ...)` 開頭。

清單：① intent_catalog ② message_intent_labels ③ daily_metrics ④ monthly_metrics ⑤ faq_miss_candidates ⑥ ai_suggestions ⑦ content_items ⑧ content_versions。①②⑤ 屬 R0 migration；③④⑥ 屬 R1 migration；⑦⑧ 屬 V1 migration。

#### ① `intent_catalog` — 意圖分類對照表（R0；分類可稽核的基礎）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| intent_key | text not null | 業務分類 key（taxonomy，見 3-模組2） |
| display_label | text not null | 中文顯示名（例：「價格詢問」） |
| match_rules | jsonb not null default '[]' | 規則清單：decision_type / matched_type / matched_key prefix / 關鍵字 |
| sort_order | int default 0 | 報表排序 |
| is_active | boolean default true | |
- UNIQUE (tenant_id, intent_key)。
- 分類執行順序：matched_key 精確 → matched_key prefix → decision_type fallback；每則訊息的分類結果記錄命中哪條規則，**全程可稽核**。

#### ② `message_intent_labels` — 訊息分類結果（R0；一訊息一列）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | bigint identity pk | |
| tenant_id | text | |
| message_id | uuid fk→conversation_messages on delete cascade | |
| intent_key | text not null | 對應 intent_catalog；規則分不出時為 `unclassified` |
| label_source | text not null check in ('rule','manual') | 定案：MVP 無 'llm' 來源；若未來啟用 LLM 分類，屆時再以 migration 擴充 CHECK |
| matched_rule | jsonb | 命中的規則內容快照 |
| labeled_at | timestamptz default now() | |
- UNIQUE (tenant_id, message_id)；索引 (tenant_id, intent_key, labeled_at desc)。
- 不寫回 conversation_messages 的原因：分類會隨 taxonomy 修訂重跑，獨立表可整批重算而不動原始訊息。
- on delete cascade：原始訊息因 retention 刪除時，分類列一併刪除（統計已固化在 daily_metrics，不受影響）。

#### ③ `daily_metrics` — 每日彙總（R1；寬表，去識別化）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | bigint identity pk | |
| tenant_id | text | |
| metric_date | date not null | Asia/Taipei 當地日 |
| new_conversations | int default 0 | 當日 first_seen 的 conversations |
| active_users | int default 0 | 當日有 inbound 的不重複 line_user |
| inbound_messages | int default 0 | |
| ai_replies | int default 0 | direction='ai' |
| ai_handled_conversations | int default 0 | 當日對話中無 handoff 且無 staff 訊息者 |
| handoff_created | int default 0 | |
| handoff_reason_json | jsonb default '{}' | reason→count |
| staff_messages | int default 0 | |
| night_inbound | int default 0 | 非服務時間 inbound（沿用 human-support.ts 的服務時間定義） |
| fallback_replies | int default 0 | decision_type='fallback_reply' |
| faq_hits | int default 0 | faq_auto_reply |
| faq_miss | int default 0 | 見模組 2 定義 |
| unclassified_count | int default 0 | intent_key='unclassified' 訊息數（監控 other 占比，決定是否另案提 LLM 分類） |
| intent_distribution_json | jsonb default '{}' | intent_key→count |
| branch_distribution_json | jsonb default '{}' | 館別→詢問數 |
| treatment_distribution_json | jsonb default '{}' | 療程→詢問數 |
| leads_new / leads_contacted / leads_booked / leads_arrived / leads_won / leads_lost | int×6 | 當日狀態變更數（source：audit_logs + webhook 建立） |
| first_reply_p50_ms / first_reply_p90_ms | int | 客訊→首個 ai/staff 回覆 |
| handoff_wait_p50_ms / handoff_wait_p90_ms | int | handoff created→首個 staff 訊息或 taken |
| computed_at | timestamptz | 彙總完成時間 |
- UNIQUE (tenant_id, metric_date)。**冪等：重跑同一天 = upsert 整列覆寫。**
- 本表不含任何個資（無姓名、電話、原話、line_user_id），可長期保留（≥13 個月，見 2.4）。

#### ④ `monthly_metrics` — 每月彙總（R1）
- 欄位與 daily_metrics 同構（metric_month text 'YYYY-MM' 取代 metric_date），另加 `prev_month_delta_json jsonb`（與上月比較差值快取）。
- UNIQUE (tenant_id, metric_month)。由 daily_metrics 加總產生，不掃原始表。去識別化，保留 ≥13 個月（實務上永久）。

#### ⑤ `faq_miss_candidates` — 待審核 FAQ 候選（R0 建表；掃描在 R1 cron）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| miss_type | text check in ('no_approved_answer','repeated_after_answer') | 兩種 miss 定義（模組 2） |
| question_text | text not null | 客人問題，**寫入前去識別化**：遮罩電話/LINE ID/姓名樣式字串 |
| occurrence_count | int default 1 | 相似問題聚合次數 |
| sample_message_ids | jsonb default '[]' | 證據訊息 id（≤10 筆；原訊息過 retention 刪除後此清單容許懸空，僅供在期限內回查） |
| suggested_answer | text | AI 草擬（僅供人審，絕不自動上線） |
| status | text default 'pending' check in ('pending','accepted','rejected','merged') | |
| reviewed_by | uuid fk→staff_users | |
| reviewed_at | timestamptz | |
| first_seen_at / last_seen_at | timestamptz | |
- 索引 (tenant_id, status, occurrence_count desc)。
- 檢視權限限 owner/manager（內容為客人問題文字，analyst 不可見；見權限矩陣）。

#### ⑥ `ai_suggestions` — AI 優化建議（R1 建表；產生器在 S1）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| suggestion_type | text check in ('new_faq','fix_treatment_whitelist','fill_branch_info','adjust_campaign_alias','improve_booking_script','other') | |
| title | text not null | 一句話（中文白話） |
| body | text not null | 建議內容全文 |
| evidence_json | jsonb not null default '{}' | 統計證據：期間、樣本訊息 id、命中次數 |
| risk_level | text default 'low' check in ('low','medium','high') | |
| status | text default 'proposed' check in ('proposed','under_review','approved','rejected','published') | |
| source_period | text | 'YYYY-MM' 或 'YYYY-Www' |
| reviewed_by / published_by | uuid fk→staff_users ×2 | |
| reviewed_at / published_at | timestamptz ×2 | |
| result_content_version_id | uuid | 若核准後轉成內容版本，回連 content_versions |
- 狀態機：proposed → under_review → approved/rejected；approved →（人工執行發布）→ published。**沒有任何自動轉移到 published 的路徑。**

#### ⑦ `content_items` — 內容主檔（V1）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| content_type | text check in ('faq','campaign','treatment_copy','handoff_rule') | MVP 只用 faq/campaign；後兩者為 1.1 預留 |
| content_key | text not null | 穩定識別（如 faq slug、campaign 名） |
| current_version_id | uuid | 指向目前生效版本（可 null=未發布） |
| is_archived | boolean default false | |
- UNIQUE (tenant_id, content_type, content_key)。

#### ⑧ `content_versions` — 不可變版本列（V1；一次修改 = 一列新版本）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| tenant_id | text | |
| item_id | uuid fk→content_items | |
| version_no | int not null | 每 item 遞增 |
| payload_json | jsonb not null | 內容本體（依 content_type 各自 schema：faq={question_pattern,answer_text,topic}；campaign={treatment_name,campaign_name,price_text,branch_scope,aliases,asset_urls[],fallback_message}） |
| status | text default 'draft' check in ('draft','in_review','published','disabled','expired') | |
| start_at / end_at | timestamptz | 活動必填；FAQ 可 null=永久 |
| change_reason | text not null | 變更原因（必填） |
| edited_by | uuid fk→staff_users not null | |
| reviewed_by | uuid fk→staff_users | |
| published_at / disabled_at | timestamptz | |
- UNIQUE (item_id, version_no)；partial unique index `(item_id) where status='published'` 硬保證同 item 單一 published 版本。
- **生效規則（runtime 讀取契約）**：`status='published'` 且 `now() between coalesce(start_at,-∞) and coalesce(end_at,+∞)` 且 item 未 archived。expired 由每日 job 標記（顯示用；runtime 查詢本身帶時間條件，不依賴標記）。
- 發布新版時前一版自動轉 disabled，同一交易內完成。
- 素材（asset_urls）放 payload_json 隨版本走：換圖 = 出新版本，滿足素材版本與有效期管理。

### 2.2 既有表的欄位擴充（R1）

`conversation_messages` 加 3 欄（nullable，不影響既有寫入）：
- `ai_model text`（該則 ai 回覆實際用的 model id；規則回覆為 null）
- `ai_tokens_in int` / `ai_tokens_out int`
寫入點：line-webhook.ts 拿到 LLM 回應時已知 usage，經 admin-webhook-sync 傳入。成本報表原料。

### 2.3 legacy 表處置（定案：本階段不動）

- `faq_entries` / `pricing_campaigns` / `handoff_rules` / `customers` / `messages` / `webhook_events`（20260622）：**保留原名、視為 legacy read-only**，程式維持不讀取即可。不 rename、不刪除。
- 處置時點：V1 新內容後台穩定運行、且人工確認實際資料庫中這些表無其他用途後，另開清理工單。
- 20260709 migration 為空跑（與 20260705 重複建表被 IF NOT EXISTS 跳過），屬歷史事實，不動它，此處註記避免未來誤讀。

### 2.4 資料保留與匿名化（定案落地設計）

**保留政策**

| 資料 | 期限 | 到期動作 |
|---|---|---|
| conversation_messages（原始對話，含 content/payload_json） | 180 天（以 created_at 計） | **刪除整列**（message_intent_labels 隨 cascade 刪除） |
| conversation_runtime_state | 180 天（既有 retention_expiry 欄位） | 依既有 soft-delete 設計標記 is_soft_deleted；補上真正執行的排程（現況缺） |
| conversations.display_name | 最後活動（last_seen_at）滿 180 天 | **匿名化**：display_name 置 null；列保留（供 metrics 歷史對數） |
| booking_leads_db 的 customer_name / phone / notes / preferred_time_slots | updated_at 滿 180 天且 booking_status ∈ {won,lost,arrived} 或無任何更新 | **匿名化**：個資欄位置 null，booking_status 與時間戳保留（漏斗歷史不失真） |
| handoff_tasks / audit_logs | 保留（無直接個資；audit before/after 內含個資的列於 180 天匿名化 jsonb 中的已知個資鍵） |
| faq_miss_candidates.question_text | 寫入時即去識別化，不受 180 天限制 | — |
| daily_metrics / monthly_metrics（去識別化） | **≥13 個月**（實務上永久，量極小） | — |

**執行機制**：每日 cron（R1 建立的單一 job）最後一個步驟 `retention-sweep`：
1. 批次刪除 conversation_messages 過期列（每批 ≤1000，帶 tenant_id，剩餘量大時下次續跑——遷就 Vercel 60s）。
2. 匿名化 conversations / booking_leads_db / audit_logs 過期列。
3. 清 runtime_state 過期列（依 retention_expiry）。
4. 每次 sweep 寫一筆 audit_logs（action='retention.sweep'，after 存各表處理筆數）——刪除行為本身可稽核。

**推論**：月報的 13 個月比較完全依賴 metrics 表（原始訊息只剩 180 天），因此**彙總必須先行、不可事後補算超過 180 天的歷史**——這也是 R0/R1 排最前的另一個理由。

---

## 3. 四個模組的 MVP

### 模組 2（先行）：訊息分類與 FAQ miss 統計 —— 工單 R0＋R1 cron＋R2 呈現

- **目標與使用者**：manager 了解客人在問什麼、哪些問題系統接不住；產出月報維度分布與模組 3 的原料。**所有下游分析（月報、FAQ miss、療程/活動分布）都依賴本模組，故最先做。**
- **MVP 範圍**：intent_catalog（seed 一版 taxonomy）＋ intent-classify 純函式庫＋歷史回填腳本（R0）；每日增量分類與 miss 掃描（R1 cron 步驟）；報表呈現與候選清單頁（R2）。
- **Intent taxonomy（初版 seed，後台可調 match_rules——維護權限 owner/maintainer）**：
  `branch_info`（館別/地址/營業時間）、`pricing`（價格）、`campaign`（活動）、`treatment`（療程詢問）、`booking_new` / `booking_modify` / `booking_cancel`（預約三分）、`post_treatment`（術後）、`pregnancy_nursing`（孕哺）、`complaint`（客訴）、`human_request`（指名真人）、`schedule`（醫師班表）、`off_topic`（離題）、`unclassified`（規則分不出）。
- **分類機制（定案：MVP 純規則，LLM 關閉）**：
  1. 由既有 `payload_json.decision_type / matched_type / matched_key` 映射（例：pricing_auto_reply→pricing；matched_key prefix `treatment_intro:`→treatment；booking followup context→booking_modify）。預估 >85% 訊息可分類，label_source='rule'，存命中規則快照。
  2. 規則分不出的（多為 fallback/generic）標 `unclassified`，daily_metrics 有 `unclassified_count` 專欄監控占比。
  3. **LLM 二次分類不在 MVP**：若 unclassified 占比持續偏高（參考門檻：連續兩週 >20%），另案提出 LLM 分類方案，需人工核准後才實作。
  4. 後台可人工改標（label_source='manual'，寫 audit）。
- **FAQ miss 兩種定義**：
  - `no_approved_answer`：decision_type='fallback_reply' 或 matched_type='generic_fallback' 的客訊——客人問了、系統沒有核准答案。
  - `repeated_after_answer`：同一對話 30 分鐘內，同 intent_key 的客訊出現 ≥2 次且中間夾著 ai 回覆——AI 答了但客人仍追問。
  - 每日 cron 掃描，以正規化字串比對＋包含關係聚合（MVP 不做 embedding），question_text **寫入前去識別化**（遮罩電話/LINE ID/姓名樣式）。
- **候選清單頁**（R2 交付）：pending 依 occurrence_count 排序；owner/manager 可 accept（→轉成 content_items 的 faq **草稿**，接模組 4 流程）/ reject / merge。**accept 只產生草稿，絕不直接上線回答客人。** analyst 不可見此頁（含客人問題文字）。
- **延後**：LLM 分類（另案）、embedding 相似度聚合、多標籤、對話級主題分析、客訴情緒分級。

### 模組 1：月報頁與每日/月度彙總 —— 工單 R1＋R2

- **目標與使用者**：owner/manager 看經營成效；客服看今日待辦。兩種視角**分開呈現**。
- **MVP 範圍**：
  - 每日彙總 cron（daily_metrics）＋每月彙總（monthly_metrics，每日順手更新當月列）。
  - `/admin/reports` 頁：「主管摘要」（C 節全部指標＋上月比較箭頭）與「今日概況」（客服視角）兩分頁。
  - CSV 匯出按鈕（monthly_metrics 一鍵下載）。
- **彙總產生方式（定案：Vercel Hobby，單一每日 job）**：
  - Vercel Cron 每日 02:30 Asia/Taipei 觸發 `/api/cron/daily-rollup`（CRON_SECRET 驗證），依序執行五個步驟：
    ① 增量分類（前一日訊息 → message_intent_labels）
    ② daily_metrics 計算「昨天」（台北日界）並 upsert；重算當月 monthly_metrics
    ③ FAQ miss 掃描 → faq_miss_candidates
    ④ content_versions 過期標記（V1 上線後生效）
    ⑤ retention-sweep（2.4）
  - 每步驟獨立 try/catch＋reportOperationalError，單步失敗不中斷後續步驟；整體冪等，可帶 `?date=YYYY-MM-DD` 手動重跑（owner/maintainer 限定的後台「重算」按鈕）。
  - **時區**：日界一律 Asia/Taipei（沿用 human-support.ts 的 Intl 模式），SQL 端 `created_at at time zone 'Asia/Taipei'`。
- **C 節指標對照**：新進對話數＝conversations.first_seen；有效詢問人數＝active_users；AI 自動處理率＝ai_handled/新進對話；真人接手率＋原因分布＝handoff_tasks(reason)；預約漏斗＝booking_leads_db+audit_logs；館別/療程/活動分布＝message_intent_labels×payload_json.matched_key；首次回覆/接手等待＝時間戳差 p50/p90；夜間進線＝night_inbound；FAQ 命中/fallback/未解決＝decision_type 統計＋faq_miss；常見客人問題＝**僅聚合統計與分類排行，不顯示原話**（定案 9）；上月比較＝monthly_metrics.prev_month_delta_json。
- **即時 vs 批次**：訊息/意圖原料/lead 寫入維持現況即時（after()）；一切聚合只在 cron。**月報頁只讀彙總表，絕不現場掃 conversation_messages。**
- **延後**：自訂日期區間、圖表視覺化（MVP 數字＋簡單條狀）、跨月趨勢線、成本儀表板、匯出 PDF。

### 模組 3：AI 優化建議工作流 —— 工單 S1

- **目標與使用者**：owner/manager 每週/月收到「系統該補什麼」的建議清單，逐條審核。
- **MVP 範圍**：併入每日 cron（週一執行週建議；每月 1 日執行月建議），建議產生器讀 daily_metrics + faq_miss_candidates + intent 分布，產出 ai_suggestions；`/admin/suggestions` 清單頁（通過/退回＋意見）。
- **建議產生器（兩層）**：
  1. **規則型建議（不用 LLM）**：faq_miss occurrence≥N → new_faq；treatment-like unsupported handoff 次數高 → fix_treatment_whitelist；某館別 branch_info 被問但 clinic-config 該欄 TODO → fill_branch_info；活動詢問落在 alias 未涵蓋詞 → adjust_campaign_alias；booking_intake 中途流失率高 → improve_booking_script。
  2. **LLM 潤稿（預設關，env 開關）**：只把規則型建議的 title/body 改寫成白話＋草擬 FAQ 答案初稿，不新增建議項目。
- **鐵則落地**：狀態機無自動 published 路徑；published 只能由 owner/manager 在模組 4 完成內容發布後回填（result_content_version_id 連結）；AI 不可寫任何 content_versions 的 published 列；每條建議保留 evidence_json、risk_level、reviewed_by、published_by、時間戳。
- **每期建議數上限**（如 10 條）防雜訊疲勞。
- **延後**：建議成效追蹤、自動 A/B、話術品質評分。

### 模組 4：FAQ／活動版本管理 —— 工單 V1＋V2

- **目標與使用者**：manager 維護內容不再改 CSV/找工程師；所有正式內容有審核與版本。
- **MVP 範圍**：content_items/content_versions（V1 migration）＋ `/admin/content` 管理頁（清單、編輯出新版、送審、審核發布、停用、版本歷史）＋ runtime 讀取層改造與灰度切換（V2）。**MVP 只涵蓋 faq 與 campaign**；treatment_copy 與 handoff_rule 列入 1.1。
- **狀態流**：draft →（編輯者送審）→ in_review →（owner/manager 核准）→ published →（手動停用）→ disabled；或到期自動 expired。活動必填 start_at/end_at，任何時刻可手動 disabled。
- **過渡期 config + DB 共存策略（不破壞 clinic-config.ts）**：
  1. **讀取三層**：DB published 內容（開關開啟且有資料）→ CSV seed → embedded fallback。以 content_type 為粒度：`CONTENT_SOURCE_FAQ=db|csv`、`CONTENT_SOURCE_CAMPAIGN=db|csv`，預設 csv。
  2. **clinic-config.ts 完全不動**：療程/館別/困擾仍在 TS。
  3. **一次性匯入**：現行 CSV seed 匯入 content_items（status=published、version_no=1、change_reason='initial import'），核對筆數後才切 env。
  4. **快取**：內容讀取層 60s in-memory cache（serverless 實例級），發布後最多 ~2 分鐘生效延遲，可接受。
- **V2 切換順序（定案 10）**：
  1. **FAQ 先切**（低風險：無時效、無報價），觀察一週；
  2. **療程介紹其次**——註：療程文案目前在 clinic-config.ts，其 DB 化屬 1.1 的 treatment_copy 範圍；屆時按此順位執行；
  3. **活動與價格最後切**（時效與報價風險最高），切換前逐筆人工核對價格文字與起迄日。
  - 任何階段回滾＝env 改回 csv，立即生效不用部署。
- **素材管理**：asset_urls 在 payload_json 隨版本走；素材本體仍放外部 URL（現況如此），上傳/託管列入 2.0。
- **延後**：treatment_copy/handoff_rule 版本化（1.1）、素材上傳、diff 檢視、定時發布、多語系。

---

## 4. 權限矩陣

| 能力 | owner | manager | agent | analyst | maintainer |
|---|---|---|---|---|---|
| 月報「主管摘要」（去識別化） | ✅ | ✅ | ❌ | ✅（唯讀） | ✅ |
| 月報「今日概況」 | ✅ | ✅ | ✅ | ✅（僅去識別化計數，無客人名） | ✅ |
| 重算彙總（手動觸發） | ✅ | ❌ | ❌ | ❌ | ✅ |
| 問題分類統計（聚合） | ✅ | ✅ | ❌ | ✅ | ✅ |
| FAQ miss 候選清單（含客人問題文字） | ✅ | ✅ | ❌ | **❌** | ❌ |
| FAQ miss 審核（accept/reject/merge） | ✅ | ✅ | ❌ | ❌ | ❌ |
| 人工改訊息分類標籤 | ✅ | ✅ | ❌ | ❌ | ❌ |
| AI 建議（看） | ✅ | ✅ | ❌ | ✅（僅標題與統計，不含樣本訊息） | ✅ |
| AI 建議審核（通過/退回） | ✅ | ✅ | ❌ | ❌ | ❌ |
| 內容管理（看清單/版本歷史） | ✅ | ✅ | ❌ | ❌ | ✅ |
| 內容編輯（出新版草稿、送審） | ✅ | ✅ | ❌ | ❌ | ❌ |
| 內容審核發布 / 停用 | ✅ | ✅ | ❌ | ❌ | ❌ |
| intent_catalog 規則維護 | ✅ | ❌ | ❌ | ❌ | ✅ |
| （既有）workbench 接手/回覆 | ✅ | ✅ | ✅ | ❌ | ✅ |
| （既有）leads 看/改 | ✅/✅ | ✅/✅ | ✅/✅ | **❌/❌（定案 8）** | ✅/✅ |

- **analyst 定案**：僅可看去識別化月報與統計；不可看電話、完整對話、原始預約線索、客人問題原文。
- **【待修正缺口】**現況 canViewLeads 含 analyst（admin-auth.ts:114-116），analyst 可看 /admin/leads 的姓名電話——**R2 工單修正**：analyst 從 canViewLeads 移除，登入後導向 /admin/reports。
- 實作沿用現有模式：admin-auth.ts 加 `canViewReports / canViewExecutiveReport / canReviewContent / canEditContent / canManageIntentCatalog / canTriggerRollup / canReviewFaqMiss` 純函式，每個 page/API 各自呼叫。

---

## 5. 工單拆分與依賴順序（定案）

```
R0 訊息分類基礎與 intent catalog        ←（一切分析的共同依賴，最先）
 └→ R1 每日／每月彙總（cron + metrics + retention-sweep）
     └→ R2 月報頁（含 FAQ miss 候選清單頁、analyst 權限缺口修正）
         └→ V1 FAQ／活動版本管理後台
             ├→ S1 AI 優化建議工作流（需 R0/R1 資料累積 1–2 週）
             └→ V2 runtime 灰度切換（FAQ → 療程介紹(1.1) → 活動價格）
                 └→ R3 工作台易用性改版（可視人力提前，與 V1/S1 平行）
                     └→ R4 Sheets 收尾（延後：月報頁成熟後再決定，不在近期主線）
```

執行順序：**R0 → R1 → R2 → V1 → S1 → V2 → R3 → R4**。

---

## 6. 各工單：影響檔案、風險、回滾、驗收

### R0 訊息分類基礎與 intent catalog
- **範圍**：migration（intent_catalog、message_intent_labels、faq_miss_candidates 三張表＋taxonomy seed 資料）；`src/lib/intent-classify.ts`（純函式：訊息 metadata → intent_key＋命中規則，零 I/O 可單測）；`scripts/backfill-intent-labels.ts`（歷史訊息回填，分批、冪等、可續跑）；`scripts/validate-intent-classify.ts`（分類正確性驗證，加入 npm scripts）。
- **不含**：cron（R1）、報表 UI（R2）、LLM（另案）。本工單交付後系統行為對客人**零改變**（純新增衍生資料層）。
- **影響檔案**：新 migration；新 lib＋2 個 scripts；package.json（scripts）；不動 webhook/router/admin 頁面。
- **風險**：taxonomy 映射錯導致下游全部失真；回填腳本掃大表超時。
- **緩解/回滾**：分類是衍生資料——修規則後 truncate message_intent_labels 整批重算即可，原始訊息不動；回填分批（每批 ≤1000）＋游標續跑。回滾＝不跑回填、表留空，對既有功能零影響。
- **驗收**：`npm run validate:intent-classify` 通過（含每個 decision_type / matched_key prefix 的代表案例）；抽 50 則歷史訊息人工核對 rule 分類正確率 ≥90%；unclassified 占比首次量測並記錄基線；回填腳本中斷後重跑不產生重複列（UNIQUE 約束驗證）；npm run check/build 全過。

### R1 每日／每月彙總
- **範圍**：migration（daily_metrics、monthly_metrics、ai_suggestions 三張表＋conversation_messages 加 ai_model/ai_tokens 3 欄）；新 `vercel.json`（單一 cron，02:30 Asia/Taipei 對應 UTC 18:30）；`app/api/cron/daily-rollup/route.ts`（CRON_SECRET 驗證）；`src/lib/metrics-rollup.ts`（五步驟：分類→彙總→miss 掃描→expired 標記→retention-sweep）；`.env.example`（CRON_SECRET）。
- **風險**：60s 超時；時區日界算錯；cron 未觸發無人發現；retention 誤刪。
- **緩解/回滾**：彙總限單日範圍＋批次查詢；日界單元測試；每步驟獨立 try/catch＋reportOperationalError；月報頁顯示「資料截至」時間戳；retention-sweep 先以 dry-run 模式上線一週（只記數不刪），人工核對後才開真刪。回滾＝移除 vercel.json cron 條目；新表不影響既有功能。
- **驗收**：手動觸發 `?date=昨天` 兩次結果一致（冪等）；夜間訊息落在正確台北日；無 CRON_SECRET 回 401；dry-run 週報表與預期一致後才啟用刪除；npm 全套驗證過。

### R2 月報頁（含 analyst 缺口修正）
- **影響檔案**：新 `app/admin/reports/page.tsx`＋`ReportsClient.tsx`；新 `app/api/admin/reports/route.ts`；新 `app/admin/faq-candidates/` 頁＋API；`src/lib/admin-auth.ts`（新增 canViewReports 等；**canViewLeads 移除 analyst**）；`app/admin/leads/page.tsx`（analyst 導向 reports）；workbench 導覽連結。
- **風險**：兩種受眾混成一頁；誤查原始表；analyst 權限改動影響現有 analyst 使用者。
- **回滾**：頁面下架；權限函式 git revert。
- **驗收**：agent 只見「今日概況」；analyst 登入直達 reports、打 /admin/leads 與 /api/admin/leads 均被擋（403/redirect）；頁面只查彙總表（code review）；月報無任何客人原話；手機 375px 可讀；C 節每指標有對應欄位。

### V1 內容版本管理後台
- **影響檔案**：migration（content_items/content_versions）；新 `app/admin/content/` 頁面組；新 `app/api/admin/content/*`；admin-auth.ts（canEditContent/canReviewContent）；admin-audit.ts 呼叫端。
- **風險**：雙 published；審核流被繞過。
- **緩解**：發布走單一交易；partial unique index `(item_id) where status='published'` 硬保證。
- **回滾**：runtime 尚未讀 DB（V2 才切），純後台功能，下架即回滾。
- **驗收**：同 item 兩次發布 DB 僅一列 published；每個狀態轉換有 audit；活動 end_at=昨天後 runtime 契約查詢查不到。

### S1 AI 優化建議工作流
- **影響檔案**：`metrics-rollup.ts`（週/月建議步驟）；新 `src/lib/suggestion-generator.ts`；新 `app/admin/suggestions/`＋API。
- **風險**：建議雜訊疲勞；LLM 草稿被誤當正式內容。
- **緩解**：每期上限 10 條；UI 標「AI 草稿，未生效」。
- **回滾**：關產生器步驟，表保留。
- **驗收**：全鏈路：miss 累積→建議產生→審核通過→/admin/content 建草稿→發布→ai_suggestions.status=published 且 result_content_version_id 回連；code review 確認無自動發布路徑。

### V2 runtime 灰度切換＋匯入
- **影響檔案**：`src/lib/seed-loader.ts`（三層讀取）；新 `src/lib/content-runtime.ts`（60s cache）；新 `scripts/import-seed-to-content.ts`；`live-demo-config.ts`＋`.env.example`（CONTENT_SOURCE_FAQ / CONTENT_SOURCE_CAMPAIGN）。
- **風險**：**最高風險工單**——動到客人實際收到的回覆。
- **緩解（定案順序）**：FAQ 先切、觀察一週 → 療程介紹（1.1 treatment_copy 就緒後）→ 活動價格最後、切換前逐筆人工核對報價與起迄日。preview 環境先全套 validate；env 開關預設 csv。
- **回滾**：env 改回 csv，立即生效。
- **驗收**：db/csv 兩模式 validate:router、validate:sample 結果一致；發布新 FAQ 後 ~2 分鐘內 webhook 採用；關閉活動後不再回覆該活動。

### R3 工作台易用性改版
- **影響檔案**：`WorkbenchClient.tsx`、`admin-workbench-data.ts`（卡片摘要欄位）、話術快選（`src/lib/quick-replies.ts` 或併入 content 管理）。
- **風險**：改壞既有接手流程。
- **回滾**：UI 層 git revert。
- **驗收**：第 8.6 節 U1–U8。

### R4 Sheets 收尾（延後，不在近期主線）
- **定位**：Google Sheets 為可選匯出；等月報頁成熟（建議上線滿一個月）後，再決定 daily_aggregate 停寫與匯出功能去留。屆時需與營運確認無人依賴該分頁。
- **回滾**：開關恢復。

---

## 7. 決策紀錄與尚待確認事項

### 已定案（2026-07-13，見文件頭修訂紀錄）
Vercel Hobby 單一每日 cron／legacy 表保留不動／LLM 分類 MVP 關閉／retention 180 天＋metrics 13 個月／Sheets 可選匯出＋R4 延後／analyst 去識別化限定＋現況標記缺口／月報不顯示原話／V2 切換順序 FAQ→療程→活動價格／工單順序 R0 起頭。

### 尚待確認（不擋 R0 開工）
1. **legacy 表最終處置時點**：V1 穩定後由使用者人工確認 Supabase 中六張舊表無其他用途，再開清理工單。
2. **Sheets 匯出去留**：R4 時點再議。
3. **R3 話術快選的內容來源**：由誰提供第一版常用話術（建議：營運端給 10 句，經 owner 審核後 seed）。
4. **unclassified 門檻**：「連續兩週 >20%」觸發 LLM 分類提案的門檻值可在 R2 看到實際數據後再校準。
5. **retention dry-run 核可**：R1 的 retention-sweep 先 dry-run 一週，開真刪前需使用者看過 dry-run 報數並核可。

---

## 8. 第一線易用性設計（最高優先原則）

### 8.0 通則（所有 v1.2 頁面適用）

- 手機優先：375px 寬為設計基準；單欄卡片流；主要按鈕 ≥44px 高。
- 全中文白話：禁止出現 tenant / intent / runtime state / JSON / fallback 等詞。對照表：handoff_pending→「等真人接手」、human_active→「真人服務中」、ai_active→「AI 回覆中」、fallback→「AI 沒把握的回答」、intent→「問題類型」、unclassified→「還沒分類」。
- 錯誤訊息一律「發生了什麼＋下一步」：「訊息送出失敗，請按重新送出」「資料載入失敗，請下拉重新整理」。禁止顯示 API error / failed / 錯誤碼。
- 空狀態必有文案：「目前沒有待處理對話 🎉」「本月還沒有資料，明天早上會出現第一批統計」。
- 客服永遠不需要理解 AI 狀態機：按鈕只有「接手回覆」「查看對話」「標記已聯繫」「確認預約」「交回 AI」。

### 8.1 第一線客服的主要操作流程

**流程 A：接住一個轉真人（最高頻）**
1. 收到 LINE 通知（或開著 workbench）→ 2. 首頁最上面就是等最久的待接手卡 → 3. 卡上直接看到：客人名、等了多久、最後一句話、AI 整理的重點（想做什麼療程/哪個館/有無留電話）、建議下一步 → 4. 按「接手回覆」→ 5. 同一頁下方出現對話紀錄＋輸入框＋常用話術快選 → 6. 選一句話術（可改字）→ 送出 → 7. 談完按「交回 AI」或「確認預約」。
目標：3→6 步在 30 秒內完成。

**流程 B：跟進預約線索**
1. 首頁「今日要聯繫」區塊（或 /admin/leads）→ 2. 卡上看到：客人名、電話（tel: 直撥）、想做療程、館別、想要時段、目前狀態 → 3. 打完電話按「標記已聯繫」→ 4. 約成了按「確認預約」。
目標：一筆狀態更新 20 秒內。

**流程 C：主管每月看報（低頻）**
/admin/reports「主管摘要」→ 五個大數字＋漏斗＋接手原因，再往下才是明細。

### 8.2 每個頁面的資訊優先順序

**workbench（首頁）**：① 待接手案件（等最久在最上）→ ② 我正在服務中的對話 → ③ 今日要聯繫的 leads 摘要（前 3 筆＋「查看全部」）→ ④ 其他（今日數字一行帶過）。**不放**任何統計圖表。
**待接手卡片內**：客人名 > 等待時間（超過 10 分鐘變紅） > 最後一句話 > AI 重點摘要 > 兩顆按鈕（接手回覆／查看對話）。
**leads 卡片內**：客人名＋電話 > 療程＋館別＋時段 > 狀態 > 下一步按鈕 > （摺疊）備註與歷史。
**reports 主管摘要**：本月五大數字（新對話、AI 自理率、接手率、新預約、成交）＋上月箭頭 > 預約漏斗 > 接手原因 > 館別/療程分布 > FAQ miss 統計（僅次數與分類，無原話）。
**reports 今日概況（客服）**：待接手數＋待聯繫數（可點跳轉） > 今日新對話 > 我今天處理的件數。

### 8.3 手機版 wireframe 文字稿

```
┌─ 客服工作台 ────────────── [☰] ┐
│ 🔴 等待接手（2）                  │
│ ┌──────────────────────┐ │
│ │ 王小姐．等了 12 分鐘 ⚠         │ │
│ │ 「所以到底多少錢？」           │ │
│ │ 🤖 重點：問皮秒價格，高雄館，   │ │
│ │    已留手機末四碼 5566        │ │
│ │ 建議：回覆活動價並約時段        │ │
│ │ [ 接手回覆 ]  [ 查看對話 ]     │ │
│ └──────────────────────┘ │
│ ┌ 陳先生．等了 3 分鐘 … ────┐   │
│                              │
│ 🟡 我服務中（1）                 │
│ ┌ 林太太．真人服務中             │
│ │ [ 繼續回覆 ] [ 交回 AI ]       │
│                              │
│ 📞 今日要聯繫（3）→ 查看全部      │
│ ┌ 張小姐｜皮秒｜高雄｜📞 撥打     │
│ │ [ 標記已聯繫 ] [ 確認預約 ]     │
│                              │
│ 今日：新對話 18．AI 已自動回 15   │
└──────────────────────────┘

┌─ 接手後（同頁展開）─────────┐
│ ← 返回｜王小姐（真人服務中）      │
│ ┌ 對話紀錄（最近 20 則，上滑更多）│
│ │ 客：皮秒到底多少錢            │
│ │ AI：目前有夏日活動…           │
│ ├ 📋 預約重點（AI 已整理）        │
│ │ 療程：皮秒｜館別：高雄          │
│ │ 時段：想約週六下午｜電話：已留   │
│ ├ 💬 常用話術（點了可改字再送）    │
│ │ [您好我是真人客服][活動說明]…   │
│ │ ┌輸入訊息____________┐[送出] │
│ │ [ 確認預約 ] [ 交回 AI ]       │
└──────────────────────────┘

┌─ 月報（主管摘要 | 今日概況）────┐
│ 7月成效  ──────── 資料到 7/12   │
│ 新對話 412 ↑12%   AI自理 78% ↑3 │
│ 真人接手 22% ↓    新預約 36 ↑9  │
│ 成交 11 ↑2                     │
│ ▸ 預約漏斗  新36→聯繫28→約好19  │
│            →到店14→成交11      │
│ ▸ 接手原因：術後異常9、指名真人7… │
│ ▸ 熱門療程：皮秒、電音波、音波    │
│ ▸ AI 接不住的問題（分類統計）     │
│   價格類 14 次｜術後類 9 次 →補FAQ│
└──────────────────────────┘
```

### 8.4 預設隱藏在「更多資訊」的內容

- 對話的技術欄位：decision/matched key、送達狀態明細、message id——只在「更多資訊」給 maintainer 排查用。
- leads 卡：建立時間、來源對話連結、audit 歷史、staff_owner 指派紀錄。
- 待接手卡：完整對話（預設只給最後一句＋摘要，按「查看對話」才展開）。
- 月報：p50/p90 毫秒值換算成「通常 X 分鐘內」白話，原始數值收進「詳細數據」。
- 任何 jsonb 原文、tenant_id、版本號——第一線永遠不顯示。

### 8.5 新人 10 分鐘上手說明（交付物：docs/staff-quickstart.md，隨 R3 出）

1.（1 分）用店家給你的帳號密碼登入 → 看到工作台首頁。
2.（2 分）認識三個區塊：紅色＝客人在等真人、黃色＝你正在服務、電話＝今天要打的。
3.（3 分）演練一次接手：點「接手回覆」→ 挑一句話術 → 改成自己的語氣 → 送出。記住：你接手後 AI 就不會插話。
4.（2 分）演練 leads：打電話 → 「標記已聯繫」；約成 → 「確認預約」。
5.（1 分）談完怎麼收尾：「交回 AI」讓機器人繼續值班。
6.（1 分）出錯怎麼辦：訊息旁出現紅字就按「重新送出」；畫面怪就下拉重新整理；再不行找主管。

### 8.6 可量測的易用性驗收標準（R3 驗收用）

| # | 標準 | 量測方式 |
|---|---|---|
| U1 | 新客服（未受訓，只讀 quickstart）1 分鐘內找到待接手案件 | 實測 3 人計時 |
| U2 | 從看到卡片到送出第一句回覆 ≤30 秒 | 實測（含話術快選路徑） |
| U3 | 更新一筆預約線索狀態 ≤20 秒 | 實測 |
| U4 | 手機 375px 下完成 U1–U3 全程不需橫向捲動、不需縮放 | 裝置實測 |
| U5 | 首頁載入 ≤3 秒（4G） | Lighthouse/實測 |
| U6 | 全站零技術名詞外洩 | 文案盤點 checklist |
| U7 | 所有失敗路徑都有中文下一步指引 | 錯誤注入測試逐條過 |
| U8 | 空狀態全覆蓋（無待接手/無 leads/無報表資料） | 空資料環境走查 |

---

## 附註

- 本文件為規劃定稿，未修改任何程式碼；migration / API / 頁面命名為建議值，開工單時可再調整。
- 與 v1.1 spec 的 Non-Negotiables 全部繼續有效：tenant_id、runtime_state 唯一真相、瀏覽器不直連 Supabase、webhook 回應速度不可劣化、audit/dual-write best-effort。
