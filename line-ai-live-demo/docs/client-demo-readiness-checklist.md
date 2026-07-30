# Client Demo Readiness Checklist

## Current Stage

Current stage is closer to `0.3 / 0.4 external demo` than `1.0`.

The app can already:

- receive real LINE webhook events
- reply with FAQ / guided booking / pregnancy caution / pricing fallback
- write audit logs
- optionally sync conversation records to Google Sheets

The app is **not yet** a full clinic operations system.

## Demo Goal

For the partner company demo, the target is:

- the bot should feel like an after-hours clinic客服
- it should solve the first layer of questions instead of forwarding everything
- it should collect useful follow-up data for human staff
- it should not hallucinate prices, schedules, or medical judgments

## Must-Have Before External Demo

### 1. Google Sheets Logging Connected

Status: code ready, environment setup still needed.

Pass condition:

- `GOOGLE_SHEETS_*` env vars are filled
- `/api/health` shows `google_sheets_status = configured`
- one test message creates rows in:
  - `raw_messages`
  - `handoff_queue`
  - `conversation_summary`
  - `marketing_dashboard_source`

Owner:

- user side: Google Cloud + spreadsheet sharing
- app side: already implemented

### 2. FAQ Coverage Expanded

Status: partially done, still too shallow for partner demo.

Minimum target:

- at least 20 to 30 high-frequency clinic questions
- cover:
  - payment
  - first visit / return visit
  - basic treatment intros
  - pre-appointment questions
  - after-hours intake guidance

Pass condition:

- common questions no longer fall into generic fallback too often

### 3. Pregnancy / Breastfeeding Rules Table

Status: router can now answer a safe first layer, but rules are still category-based.

Needed upgrade:

- one structured table per treatment:
  - `treatment_name`
  - `pregnant_status`
  - `trying_to_conceive_status`
  - `breastfeeding_status`
  - `guidance_reply`
  - `doctor_review_required`

Pass condition:

- partner can test specific treatments such as `ONDA PRO`, `Q+音波`, `探索皮秒`, `肉毒`
- bot gives a controlled answer plus doctor-evaluation disclaimer

### 4. Booking Intake Flow Verified

Status: router can now collect booking intent.

Pass condition:

- for booking messages, bot asks for:
  - treatment
  - branch
  - three available time slots
  - whether first visit
- data lands in Google Sheets
- next-day human staff can continue without rereading the whole chat

### 5. Demo Script Prepared

Status: add and use the script in `docs/client-demo-test-script.md`.

Pass condition:

- internal team runs all demo cases once before external use

### 6. Live Environment Stability Check

Pass condition:

- Vercel production webhook URL is used
- LINE webhook verification passes
- auto-response conflicts are disabled
- `/api/health` returns `ok: true`
- one live test round succeeds end-to-end

## Nice-to-Have Before Demo

### 7. Treatment Redirect Logic Refined

When the clinic does not offer a requested treatment, the bot should:

- say the clinic does not currently provide it
- suggest nearby offered treatments
- keep the tone helpful instead of abrupt refusal

### 8. Doctor Schedule Upload Path Defined

Even if full schedule query is not ready, define:

- where staff uploads next-month doctor schedule
- what the bot says if schedule is not published yet

### 9. Demo Data Cleanup

Remove or review noisy treatment names in generated drafts before exposing them to partners.

## Demo Risks

Highest current risks:

1. too many treatment questions still lack polished answers
2. Google Sheets may not be configured yet
3. pregnancy answers are not yet fine-grained enough per treatment
4. doctor schedule is still mostly fallback behavior

## Recommended Build Order

1. finish Google Sheets setup
2. expand FAQ to top 20 to 30 questions
3. build `pregnancy_rules` seed/table
4. verify booking intake and handoff queue flow
5. run demo script once on the live LINE account

## Demo Ready Definition

This demo is ready for partner testing when:

- Google Sheets logging works
- top FAQ coverage is acceptable
- pregnancy questions have structured safe answers
- booking intake can collect usable follow-up details
- the live LINE account passes the demo script once end-to-end
