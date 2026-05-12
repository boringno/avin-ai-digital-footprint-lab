# Threads Insights Sync

## Purpose

Sync Threads post metrics (Views, Likes, Replies, Reposts, Quotes, Shares) from the Threads Insights API back to a Notion Content Queue database.

Part of AVIN AI Digital Footprint OS — Threads MVP 1.

---

## Current Status

**Notion read test implemented.** Threads Insights API sync not yet implemented.

- `--dry-run`: validates environment variables, no API calls
- `--notion-read-test`: reads Notion Content Queue, prints safe row summaries, no Threads API calls, no writes
- All Threads sync functions remain stubs (`NotImplementedError`)

---

## How to Run (Dry Run)

```bash
python scripts/threads/sync_threads_insights.py --dry-run
```

Dry run will:
- Load `.env` (if `python-dotenv` is installed) or read from shell environment
- Check all required environment variable names are present (values are never printed)
- Print next implementation steps
- Make no API calls and no Notion writes

---

## How to Run (Notion Read Test)

```bash
python scripts/threads/sync_threads_insights.py --notion-read-test
```

**Required env keys for this mode:** `NOTION_API_KEY`, `NOTION_DATABASE_ID` only.
`THREADS_ACCESS_TOKEN` and `META_APP_SECRET` are not used in this step.

**What this test does:**
- Reads the Notion Content Queue database
- Filters rows matching: `Platform = Threads`, `Status = Published or Insights Synced`, `Sync Enabled = true`, `No Blocking Issue = true`
- Prints a safe summary: total rows, eligible count, skipped count
- Per eligible row: title (truncated to 60 chars), status, whether Threads Post ID exists

**What this test does NOT do:**
- Does not call the Threads Insights API
- Does not write anything back to Notion
- Does not print API keys or token values
- Does not print raw API responses
- Does not modify any data

**Safety notes for this mode:**
- The `NOTION_API_KEY` value is used in request headers and is never printed
- If you see a 404 error, confirm the Notion Integration has been shared with the database (Notion UI: Share → Invite)
- Only row titles, statuses, and Post ID presence are shown in output

---

## Required Environment Variables

Add the following keys to your local `.env` file. **Never commit `.env` to git.**

```
THREADS_ACCESS_TOKEN=
META_APP_SECRET=
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

> `.env` is already listed in `.gitignore`. Do not remove it.

---

## Security Notes

- Never print token values in logs or console output
- Never commit `.env` or any file containing token values
- Never store tokens in Notion fields
- Only aggregated metrics are written to Notion — no raw API responses, no PII
- Run `git check-ignore .env` to confirm `.env` is excluded before any `git add`

---

## Dependencies

Currently installed (no action needed):
- `python-dotenv` — loads `.env` file
- `requests` — used for Notion REST API calls (already available)

Not yet needed:
- `notion-client` — not required; Notion API is called directly via `requests`

Still needed for Threads API sync (install when ready):
```bash
pip install requests python-dotenv
```
(both already available in this environment)

---

## Next Implementation Steps

1. ~~Pass Manual Test Checklist~~ → in progress
2. ~~Implement `read_notion_items()`~~ → done (Notion REST API via `requests`)
3. Run `--notion-read-test` with real `.env` to confirm filter returns correct rows
4. Implement `fetch_threads_insights()` — Threads Insights API call
5. Implement `normalize_metrics()` — map API fields to Notion fields
6. Implement `write_metrics_to_notion()` — writeback with failure guard
7. Run live sync with a real test post

---

## Related Docs

- [`04-workflows/threads-mvp-1-no-n8n-local-script-spec.md`](../../04-workflows/threads-mvp-1-no-n8n-local-script-spec.md)
- [`04-workflows/threads-mvp-1-notion-fields-spec.md`](../../04-workflows/threads-mvp-1-notion-fields-spec.md)
- [`04-workflows/threads-mvp-1-manual-test-checklist.md`](../../04-workflows/threads-mvp-1-manual-test-checklist.md)
