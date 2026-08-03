# Internal Admin Backend v1.1

## Scope

This spec adds the clinic staff backend for LINE AI customer service. The backend is part of the existing `line-ai-live-demo` Next.js app under `/admin`, but the LINE webhook must remain fast and behavior-compatible.

Current production webhook:

- `POST /api/line/webhook`
- `https://line-ai-live-demo.vercel.app/api/line/webhook`

## Non-Negotiables

- Do not degrade `POST /api/line/webhook` response speed.
- Do not change the existing `clinic-config.ts` structure.
- All new business tables include `tenant_id text not null default 'tenant_001'`.
- Store stable English keys in the database. Display labels belong in frontend/admin display maps.
- Status has one source of truth: `conversation_runtime_state`.
- `conversations` must not contain a duplicate `status` column.
- Admin browser code must call server-side `/api/admin/*` endpoints. Do not expose service-role Supabase access to the browser.
- Each work order should be independently testable and shippable.

## Execution Order

1. A1: database schema migration and indexes.
2. B: Supabase Auth, staff bootstrap, middleware, protected admin APIs.
3. A2: webhook dual-write to the new tables.
4. C: `/admin/workbench` human takeover console.
5. D: `/admin/leads` booking lead board.
6. E: handoff notification loop.

Stop after A1 for schema review before implementing B.

## Runtime State Boundary

`conversation_runtime_state` remains the AI state machine source:

- `ai_active`
- `handoff_pending`
- `human_active`
- `ai_paused`
- `closed`

Admin lists and filters join `conversations.line_user_id` to `conversation_runtime_state.line_user_id` when they need the AI reply status.

`conversations` stores business summary fields only:

- tenant
- LINE user id
- display name
- lead stage
- first seen time
- last seen time

Lead stage keys:

- `new_inquiry`
- `interested`
- `booking_intent`
- `handoff_pending`
- `human_followup`
- `closed`

Booking progress belongs in `booking_leads_db.booking_status`, not in `conversations.lead_stage`.

## Work Order A1: Schema

Create or migrate these tables:

- `conversations`
- `conversation_messages`
- `handoff_tasks`
- `booking_leads_db`
- `staff_users`
- `audit_logs`

If a legacy `conversations` table from the MVP migration exists with `customer_id/status`, rename it to `legacy_conversations_20260622` before creating the new admin `conversations` table.

A1 does not backfill existing `conversation_runtime_state` rows into the new `conversations` table. The admin backend starts collecting summary rows from A2 webhook dual-write onward. If the clinic needs historical users visible in the admin console, add a separate audited backfill migration after A2 is stable.

### Idempotency

`conversation_messages` stores both:

- `source_event_id`
- `line_message_id`

Customer inbound messages use `source_event_id` as the primary idempotency key because it matches LINE webhook redelivery semantics better than `message.id`.

Required partial unique index:

```sql
unique (tenant_id, source_event_id) where source_event_id is not null
```

### Booking Status

Store English keys:

- `new`
- `contacted`
- `booked`
- `arrived`
- `won`
- `lost`

Suggested Chinese labels for UI:

- `new`: `新進線`
- `contacted`: `已聯繫`
- `booked`: `已預約`
- `arrived`: `已到店`
- `won`: `成交`
- `lost`: `流失`

Place these labels in a new admin display map file when building UI. Do not edit `clinic-config.ts` for this.

## Work Order B: Auth And Protection

- Use Supabase Auth email/password.
- Add `BOOTSTRAP_OWNER_EMAIL`.
- Add `npm run bootstrap:owner`.
- The bootstrap script upserts a matching authenticated user into `staff_users` with role `owner`.
- Protect `/admin/*` and `/api/admin/*`.
- Move or wrap current control/debug staff endpoints behind admin auth before exposing them as staff tools.
- Bootstrap is intentionally authoritative: rerunning `npm run bootstrap:owner` for `BOOTSTRAP_OWNER_EMAIL` forces that staff user back to `owner`.
- Login rate limiting is required before paid production rollout, but is not part of Work Order B. Decide before Work Order C whether to use platform WAF, Upstash, or a database-backed throttle.
- Admin audit writes are best-effort. Audit failures must be reported to monitoring, but must not turn an already-applied staff action into a 500 response.

## Work Order A2: Webhook Dual-Write

Use Next.js `after()` for post-response writes when available. If the project cannot use `after()`, fall back to awaiting a light `Promise.allSettled` before returning.

Longer-term TODO: move post-webhook writes to a queue when traffic exceeds one Vercel instance or write latency becomes visible.

Webhook dual-write must:

- upsert `conversations`
- insert `conversation_messages`
- create `handoff_tasks` when handoff is triggered
- upsert `booking_leads_db` when enough booking draft data exists
- never throw back into the LINE webhook response path
- report failures to Sentry/monitoring

## Work Order C: Workbench

Route: `/admin/workbench`

Mobile-first layout:

- queue list first
- open handoff tasks at top
- conversation detail timeline
- status badge from `conversation_runtime_state`
- actions: take over, return to AI
- staff message composer
- hardcoded quick replies for v1

Staff sending should:

1. write message record with `send_status='pending'`
2. send LINE push/reply through server API
3. update to `sent` or `failed`
4. show failed messages with a retry action

## Work Order D: Leads

Route: `/admin/leads`

Columns:

- `new`
- `contacted`
- `booked`
- `arrived`
- `won/lost`

Lead cards show:

- display name
- treatments
- branch
- preferred time slots
- phone as `tel:` link
- staff owner
- notes

Manual fields:

- `booking_status`
- `notes`
- `staff_owner`

System updates should not overwrite manual notes.

Google Sheets note for v1:

- Google Sheets `booking_leads.booking_status` is a webhook-time reporting snapshot.
- The operational source of truth for manual booking progress is `booking_leads_db` through `/admin/leads`.
- Updating status, notes, or owner in `/admin/leads` does not yet write back to Google Sheets.
- Add a later follow-up work order for safe single-lead Sheets sync if clinic staff still uses Sheets as an operational tracker.

## Work Order E: Notifications

Use a single `ADMIN_NOTIFY_TARGET` for v1.

When a handoff task opens during business hours, push:

- display name
- handoff reason
- deep link: `/admin/workbench?conversation_id=...`

Off-hours handoffs stay in queue. A future cron can send a next-business-day summary.

Implementation note:

- `ADMIN_NOTIFY_TARGET` can be a LINE user/group/room id that the clinic notification channel can push to.
- If `ADMIN_NOTIFY_TARGET` is missing, the handoff notification is skipped. Operational alerts use `LIVE_DEMO_ALERT_LINE_USER_ID` independently and never act as a handoff-recipient fallback.
- Notification failure is best-effort and must not break webhook post-processing.
- v1 does not send off-hours notifications; staff can review accumulated tasks in `/admin/workbench`.
