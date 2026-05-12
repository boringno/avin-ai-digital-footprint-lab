# Threads Insights Sync

## Purpose

Sync Threads post metrics (Views, Likes, Replies, Reposts, Quotes, Shares) from the Threads Insights API back to a Notion Content Queue database.

Part of AVIN AI Digital Footprint OS — Threads MVP 1.

---

## Current Status

**Skeleton only.** No external API calls are implemented yet.

The script validates environment variables and supports `--dry-run` mode. All sync functions are stubs (`NotImplementedError`).

---

## How to Run (Dry Run)

```bash
python scripts/threads/sync_threads_insights.py --dry-run
```

Dry run will:
- Load `.env` (if `python-dotenv` is installed) or read from shell environment
- Check all required environment variable names are present (not values)
- Print next implementation steps
- Make no API calls and no Notion writes

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

## Dependencies (not yet installed)

Required when moving beyond skeleton:

- `python-dotenv` — load `.env` file
- `notion-client` — Notion API
- `requests` — Threads API HTTP calls

Install when ready:

```bash
pip install python-dotenv notion-client requests
```

Do not install until live sync implementation begins.

---

## Next Implementation Steps

1. Pass Manual Test Checklist (`04-workflows/threads-mvp-1-manual-test-checklist.md`)
2. Implement `read_notion_items()` — connect Notion, apply MVP 1 filters
3. Implement `validate_threads_post_id()` — Post ID format check
4. Implement `fetch_threads_insights()` — Threads Insights API call
5. Implement `normalize_metrics()` — map API fields to Notion fields
6. Implement `write_metrics_to_notion()` — writeback with failure guard
7. Run live sync with a real test post

---

## Related Docs

- [`04-workflows/threads-mvp-1-no-n8n-local-script-spec.md`](../../04-workflows/threads-mvp-1-no-n8n-local-script-spec.md)
- [`04-workflows/threads-mvp-1-notion-fields-spec.md`](../../04-workflows/threads-mvp-1-notion-fields-spec.md)
- [`04-workflows/threads-mvp-1-manual-test-checklist.md`](../../04-workflows/threads-mvp-1-manual-test-checklist.md)
