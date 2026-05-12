# Threads Insights Sync

## Purpose

Sync Threads post metrics (Views, Likes, Replies, Reposts, Quotes, Shares) from the Threads Insights API back to a Notion Content Queue database.

Part of AVIN AI Digital Footprint OS — Threads MVP 1.

---

## Current Status

**All test modes + token exchange implemented.** Batch sync not yet implemented.

- `--dry-run`: validates environment variables, no API calls
- `--notion-read-test`: reads Notion Content Queue, prints safe row summaries, no writes
- `--resolve-threads-url URL`: resolves a Threads post URL to its numeric Media ID (read-only)
- `--fetch-insights-test --post-id ID`: fetches Insights for a single post, prints safe metric summary, no Notion writes
- `--writeback-test --post-id ID`: fetches Insights and writes metrics to a single Notion row
- `--exchange-long-lived-token`: exchanges short-lived token for a 60-day long-lived token

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

## How to Exchange a Short-lived Token for a Long-lived Token

```bash
python scripts/threads/sync_threads_insights.py --exchange-long-lived-token
```

**Required env keys:** `THREADS_ACCESS_TOKEN` (short-lived), `META_APP_SECRET`.

**What this mode does:**
1. Calls `GET https://graph.threads.net/access_token` with `grant_type=th_exchange_token`
2. Prints a safe summary: token type, `expires_in`, `expires_at` UTC, and masked token preview (first 6 + last 4 chars only)
3. Writes the full new token to a local file `.new_threads_token` (gitignored)
4. Instructs AVIN to read the file, copy the token into `.env`, then delete the file

**What this mode does NOT do:**
- Does not print the full token to stdout
- Does not update `.env` automatically
- Does not write to Notion
- Does not call Insights endpoint

**Long-lived token still expires.** The token is valid for approximately 60 days (`expires_in ≈ 5184000` seconds). You must manually track the expiry date and refresh before it expires.

**After exchanging — manual steps:**

```bash
# 1. Read the new token (Windows)
type .new_threads_token

# 2. Copy the THREADS_ACCESS_TOKEN= value into your local .env
# 3. Delete the file
del .new_threads_token

# 4. Verify the new token works
python scripts/threads/sync_threads_insights.py --fetch-insights-test --post-id YOUR_POST_ID
```

**Token refresh (future step):** Long-lived tokens can be refreshed before expiry by calling `GET https://graph.threads.net/refresh_access_token` with `grant_type=th_refresh_token`. A `--refresh-token` mode will be added when needed.

---

## How to Run (Notion Writeback Test)

```bash
python scripts/threads/sync_threads_insights.py --writeback-test --post-id MEDIA_ID
```

**Required env keys:** `THREADS_ACCESS_TOKEN`, `NOTION_API_KEY`, `NOTION_DATABASE_ID`.

**Only use this with a known test row.** This mode writes real data to Notion.

**What this mode does:**
1. Finds the Notion row whose `Threads Post ID` = the given Media ID
2. Fetches Threads Insights (views, likes, replies, reposts, quotes, shares)
3. Writes metrics back to that row
4. Updates: `Sync Status = Synced`, `Data Last Synced At`, `Last Sync Attempt At`, `Sync Error Note`
5. Calculates and writes `Engagement Rate` if `Views > 0`

**Failure behavior:**
- If insights fetch fails: writes `Sync Status = Failed` + `Sync Error Note` only — **existing metric values are never overwritten**
- If row is not found: aborts without any write
- If duplicate rows found (same Post ID): aborts without any write — manual resolution required

**Safety notes:**
- Does not write to any row other than the one matching the given Post ID
- Does not publish or modify any Threads post
- Does not print token values or raw API responses
- Metrics with null API values are skipped (not written as 0)

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
4. ~~Implement `--resolve-threads-url`~~ → done
5. ~~Run `--resolve-threads-url`~~ → done (Media ID: `17935258965186803`)
6. ~~Implement `--fetch-insights-test`~~ → done (all 6 metrics available, ER = 1.21%)
7. ~~Implement `--writeback-test`~~ → done
8. Run `--writeback-test --post-id 17935258965186803` to confirm full write
9. Verify Notion row shows correct metrics after writeback
10. Implement batch sync (live sync for all eligible rows)

---

## Related Docs

- [`04-workflows/threads-mvp-1-no-n8n-local-script-spec.md`](../../04-workflows/threads-mvp-1-no-n8n-local-script-spec.md)
- [`04-workflows/threads-mvp-1-notion-fields-spec.md`](../../04-workflows/threads-mvp-1-notion-fields-spec.md)
- [`04-workflows/threads-mvp-1-manual-test-checklist.md`](../../04-workflows/threads-mvp-1-manual-test-checklist.md)
