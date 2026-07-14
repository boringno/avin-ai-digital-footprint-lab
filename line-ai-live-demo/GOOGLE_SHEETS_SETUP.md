# Google Sheets Setup

## Required Env Vars

Add these to `.env.local` and Vercel project env when ready:

```env
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SHEETS_PRIVATE_KEY=
```

## Private Key Format

Use the full service account private key in one line, with `\n` for line breaks.

## Spreadsheet Sharing

Share the target spreadsheet with the service account email as `Editor`.

## Auto-created Tabs

The app will create and maintain these sheets automatically:

- `raw_messages`
- `handoff_queue`
- `conversation_summary`
- `marketing_dashboard_source`

## Data Use

- `raw_messages`: every customer / assistant message row
- `handoff_queue`: only cases that need human follow-up
- `conversation_summary`: one row per LINE user for quick handoff
- `marketing_dashboard_source`: source rows for filters / pivot tables
