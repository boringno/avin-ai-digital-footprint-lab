# Threads Insights Sync

## Purpose

Sync Threads post metrics (Views, Likes, Replies, Reposts, Quotes, Shares) from the Threads Insights API back to a Notion Content Queue database.

Part of AVIN AI Digital Footprint OS — Threads MVP 1.

---

## Current Status

**Notion read, URL resolver, and Insights fetch test implemented.** Notion writeback not yet implemented.

- `--dry-run`: validates environment variables, no API calls
- `--notion-read-test`: reads Notion Content Queue, prints safe row summaries, no writes
- `--resolve-threads-url URL`: resolves a Threads post URL to its numeric Media ID (read-only, no writes)
- `--fetch-insights-test --post-id ID`: fetches Insights for a single post, prints safe metric summary, no Notion writes

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

## How to Run (Insights Fetch Test)

```bash
python scripts/threads/sync_threads_insights.py --fetch-insights-test --post-id MEDIA_ID
```

**Required env key for this mode:** `THREADS_ACCESS_TOKEN` only.

**What this test does:**
- Calls Threads Insights API for a single post (read-only)
- Requests all 6 metrics: `views`, `likes`, `replies`, `reposts`, `quotes`, `shares`
- Prints which metrics are available and their values
- Prints which metrics are unsupported / API dependent
- Previews Engagement Rate calculation (not written to Notion)

**What this test does NOT do:**
- Does not write anything to Notion
- Does not call any other Threads API endpoint
- Does not print the access token value
- Does not print raw API responses

**Metrics are API dependent.** If a metric is not returned by the API, it is marked as `unsupported or null (API dependent)` — this is not a script error.

**Engagement Rate** (`(likes + replies + reposts + quotes + shares) / views`) is previewed in this mode but will only be written to Notion during the writeback phase. If `views` is 0 or unavailable, Engagement Rate is not calculated.

---

## How to Run (Resolve Threads URL → Media ID)

```bash
python scripts/threads/sync_threads_insights.py --resolve-threads-url "https://www.threads.com/@username/post/SHORTCODE"
```

**Required env key for this mode:** `THREADS_ACCESS_TOKEN` only.

### Why shortcode ≠ Media ID

The shortcode (`DVOMbrOEd6Q`) visible in a Threads URL is **not** the Threads Media ID used by the Insights API. The actual Media ID is a numeric string (e.g. `18034789651234567`) returned by the Threads Graph API.

This mode:
1. Extracts the shortcode from the URL
2. Lists the authenticated user's threads via `GET /me/threads`
3. Matches by `shortcode` field
4. Prints the numeric `id` (= the Media ID to use)

### After resolving

Copy the **Media ID** from the output and paste it into the Notion `Threads Post ID` field. Do **not** use the shortcode as the Post ID.

**What this mode does:**
- Reads the authenticated user's thread list (read-only)
- Matches by shortcode across all paginated results
- Prints Media ID, permalink, timestamp, media type, text preview (80 chars)

**What this mode does NOT do:**
- Does not call the Insights endpoint
- Does not write anything to Notion
- Does not print the access token value
- Does not print raw API responses

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
2. ~~Implement `read_notion_items()`~~ → done
3. ~~Run `--notion-read-test`~~ → done (1 eligible row confirmed)
4. ~~Implement `--resolve-threads-url`~~ → done (shortcode → Media ID)
5. ~~Run `--resolve-threads-url`~~ → done (Media ID: `17935258965186803`)
6. ~~Implement `--fetch-insights-test`~~ → done
7. Run `--fetch-insights-test --post-id 17935258965186803` to confirm metrics
8. Implement `normalize_metrics()` — map API fields to Notion fields
9. Implement `write_metrics_to_notion()` — writeback with failure guard
10. Run live sync with a real test post

---

## Related Docs

- [`04-workflows/threads-mvp-1-no-n8n-local-script-spec.md`](../../04-workflows/threads-mvp-1-no-n8n-local-script-spec.md)
- [`04-workflows/threads-mvp-1-notion-fields-spec.md`](../../04-workflows/threads-mvp-1-notion-fields-spec.md)
- [`04-workflows/threads-mvp-1-manual-test-checklist.md`](../../04-workflows/threads-mvp-1-manual-test-checklist.md)
