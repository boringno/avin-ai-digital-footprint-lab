# LINE AI Live Demo App

## Purpose

This subproject is the runnable Next.js webhook MVP for the clinic LINE live demo.

## Commands

```powershell
npm install
npm run dev
npm run check
npm run validate:conversation-guard
npm run validate:google-sheets
npm run validate:router
npm run validate:sample
```

## Routes

- `GET /api/health`
- `POST /api/line/webhook`
- `GET /api/debug/recent`
- `GET /api/conversations/control?user_id=...`
- `POST /api/conversations/control`
- `POST /api/conversations/staff-message`

## Env

Copy `.env.example` to `.env.local` and fill:

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `AI_PROVIDER` (`anthropic` or `openai`)
- `CLAUDE_API_ENABLED`
- `CLAUDE_HUMANIZER_ENABLED`
- `ANTHROPIC_API_KEY`
- `CLAUDE_MODEL`
- `CLAUDE_MAX_TOKENS`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_MAX_TOKENS`
- `GOOGLE_SHEETS_ENABLED`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `LIVE_DEMO_SEND_REPLY`
- `LIVE_DEMO_SKIP_SIGNATURE_VERIFY`
- `LIVE_DEMO_INCLUDE_PENDING`
- `LIVE_DEMO_SEED_DIR`
- `LIVE_DEMO_LOG_DIR`
- `LIVE_DEMO_DEBUG_TOKEN`

## Vercel

- Deploy from `C:\Users\user\Documents\New project 2\line-ai-live-demo`
- Keep seed CSV files in `./data/live-demo-seed`
- Vercel runtime logs default to `/tmp/line-ai-live-demo`
- File-based audit log and dedupe are demo-grade only on Vercel, not production persistence
- Claude API is optional and only used for fallback-style general questions
- Conversation state is file-based in `runtime-logs/conversation-states`
- Human takeover guard blocks AI replies for `human_active`, `ai_paused`, and `closed`
- Google Sheets logging is optional and appends to `raw_messages`, `handoff_queue`, `conversation_summary`, and `marketing_dashboard_source`

## Pricing Policy

- Normal pricing is still handled by human staff
- AI may answer pricing only for explicit campaign / experience-price rows with valid `start_date` and `end_date`
- See [docs/pricing-campaigns-spec.md](C:/Users/user/Documents/New%20project%202/line-ai-live-demo/docs/pricing-campaigns-spec.md:1)
- Partner fill-in template: [pricing_campaigns_partner_template.csv](C:/Users/user/Documents/New%20project%202/line-ai-live-demo/data/live-demo-seed/pricing_campaigns_partner_template.csv:1)

## Demo Docs

- Readiness checklist: [client-demo-readiness-checklist.md](C:/Users/user/Documents/New%20project%202/line-ai-live-demo/docs/client-demo-readiness-checklist.md:1)
- Live demo test script: [client-demo-test-script.md](C:/Users/user/Documents/New%20project%202/line-ai-live-demo/docs/client-demo-test-script.md:1)
