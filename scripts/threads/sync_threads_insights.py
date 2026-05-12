"""
sync_threads_insights.py

Threads MVP 1 - Local Script
Status: Notion read + URL resolver + Insights fetch + Writeback test + Token exchange implemented; Batch sync not yet implemented

Usage:
    python scripts/threads/sync_threads_insights.py --dry-run
    python scripts/threads/sync_threads_insights.py --notion-read-test
    python scripts/threads/sync_threads_insights.py --resolve-threads-url "THREADS_URL"
    python scripts/threads/sync_threads_insights.py --fetch-insights-test --post-id POST_ID
    python scripts/threads/sync_threads_insights.py --writeback-test --post-id POST_ID
    python scripts/threads/sync_threads_insights.py --exchange-long-lived-token

See scripts/threads/README.md for setup instructions.
"""

import os
import re
import sys
import argparse
from datetime import datetime, timezone

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

try:
    from dotenv import load_dotenv
    DOTENV_AVAILABLE = True
except ImportError:
    DOTENV_AVAILABLE = False

REQUIRED_ENV_KEYS = [
    "THREADS_ACCESS_TOKEN",
    "META_APP_SECRET",
    "NOTION_API_KEY",
    "NOTION_DATABASE_ID",
]

NOTION_ENV_KEYS = [
    "NOTION_API_KEY",
    "NOTION_DATABASE_ID",
]

NOTION_API_VERSION = "2022-06-28"
NOTION_API_BASE = "https://api.notion.com/v1"

THREADS_API_BASE = "https://graph.threads.net/v1.0"
THREADS_ENV_KEYS = ["THREADS_ACCESS_TOKEN"]


def load_environment():
    if DOTENV_AVAILABLE:
        load_dotenv()
        print("[env] Loaded .env via python-dotenv")
    else:
        print("[env] python-dotenv not installed — relying on shell environment variables")


def validate_environment(keys=None):
    if keys is None:
        keys = REQUIRED_ENV_KEYS

    missing = [k for k in keys if not os.environ.get(k)]
    present = [k for k in keys if os.environ.get(k)]

    for k in present:
        print(f"[env] {k}: present")
    for k in missing:
        print(f"[env] {k}: MISSING")

    if missing:
        print(f"\n[error] Missing required environment variables: {missing}")
        print("[error] Add them to your local .env file. Never commit .env to git.")
        sys.exit(1)

    print("[env] All required environment variables present")


# ---------------------------------------------------------------------------
# Notion Read
# ---------------------------------------------------------------------------

def _notion_headers():
    """Return Notion API request headers. Never log these."""
    return {
        "Authorization": f"Bearer {os.environ['NOTION_API_KEY']}",
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
    }


def _query_notion_database(database_id, filter_body, start_cursor=None):
    """Single paginated query to Notion database. Returns raw response dict."""
    url = f"{NOTION_API_BASE}/databases/{database_id}/query"
    payload = {"filter": filter_body, "page_size": 100}
    if start_cursor:
        payload["start_cursor"] = start_cursor

    response = requests.post(url, headers=_notion_headers(), json=payload, timeout=30)
    response.raise_for_status()
    return response.json()


def _extract_page_summary(page):
    """
    Extract safe display fields from a Notion page object.
    Never returns raw API response — only title, status, post_id presence.
    """
    props = page.get("properties", {})

    # Title property
    title_prop = props.get("Title", {})
    title_parts = title_prop.get("title", [])
    title = "".join(t.get("plain_text", "") for t in title_parts).strip() or "(untitled)"

    # Status select
    status_prop = props.get("Status", {})
    status = (status_prop.get("select") or {}).get("name", "")

    # Threads Post ID (text)
    post_id_prop = props.get("Threads Post ID", {})
    post_id_parts = post_id_prop.get("rich_text", [])
    post_id_value = "".join(t.get("plain_text", "") for t in post_id_parts).strip()
    has_post_id = bool(post_id_value)

    return {
        "page_id": page.get("id", ""),
        "title": title,
        "status": status,
        "has_threads_post_id": has_post_id,
    }


def read_notion_items():
    """
    Query Notion Content Queue for MVP 1 eligible rows.

    Filters:
      Platform = Threads
      AND (Status = Published OR Status = Insights Synced)
      AND Sync Enabled = true
      AND No Blocking Issue = true

    Returns:
        tuple[list[dict], int]: (eligible_summaries, total_fetched)
    """
    database_id = os.environ["NOTION_DATABASE_ID"]

    filter_body = {
        "and": [
            {"property": "Platform", "select": {"equals": "Threads"}},
            {
                "or": [
                    {"property": "Status", "select": {"equals": "Published"}},
                    {"property": "Status", "select": {"equals": "Insights Synced"}},
                ]
            },
            {"property": "Sync Enabled", "checkbox": {"equals": True}},
            {"property": "No Blocking Issue", "checkbox": {"equals": True}},
        ]
    }

    all_pages = []
    cursor = None

    while True:
        data = _query_notion_database(database_id, filter_body, start_cursor=cursor)
        all_pages.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")

    summaries = [_extract_page_summary(p) for p in all_pages]
    return summaries, len(all_pages)


def validate_threads_post_id(post_id):
    """
    Validate that a Threads Post ID is non-empty and plausibly valid.

    Args:
        post_id (str): The Threads Post ID to validate

    Returns:
        bool: True if valid, False if should be skipped
    """
    if not post_id or not post_id.strip():
        return False
    # Basic sanity: numeric string or alphanumeric, no obvious placeholder
    stripped = post_id.strip()
    if stripped.lower() in ("none", "null", "n/a", "tbd", ""):
        return False
    return True


def fetch_threads_insights(post_id):
    """
    TODO: Call Threads Insights API for the given Post ID.

    Args:
        post_id (str): Valid Threads Post ID

    Returns:
        dict: Raw metrics from API response (Views, Likes, Replies, etc.)

    Raises:
        Exception: On API failure — caller must not overwrite previous metrics
    """
    raise NotImplementedError("fetch_threads_insights() not yet implemented")


def normalize_metrics(raw_metrics):
    """
    TODO: Map raw API response to Notion field names.

    Null metrics (API did not return) stay as None — do not coerce to 0.
    Log which metrics are missing.

    Args:
        raw_metrics (dict): Raw API response metrics

    Returns:
        dict: Normalized metrics keyed by Notion field name
    """
    raise NotImplementedError("normalize_metrics() not yet implemented")


def write_metrics_to_notion(page_id, metrics, sync_status, error_note=None):
    """
    TODO: Write normalized metrics back to a Notion page.

    On failure: do NOT overwrite previous metrics. Set Sync Status = Failed.

    Args:
        page_id (str): Notion page ID
        metrics (dict): Normalized metrics to write
        sync_status (str): One of: Synced / Failed / Skipped / Needs Review
        error_note (str | None): Error message if sync failed, else None

    Returns:
        bool: True on success, False on failure
    """
    raise NotImplementedError("write_metrics_to_notion() not yet implemented")


def create_performance_log_draft(items_processed):
    """
    TODO: Optionally print or write a performance log summary.

    Only aggregated metrics — no PII, no raw API response, no tokens.

    Args:
        items_processed (list[dict]): Summary of processed items

    Returns:
        None
    """
    raise NotImplementedError("create_performance_log_draft() not yet implemented")


# ---------------------------------------------------------------------------
# Threads URL Resolver
# ---------------------------------------------------------------------------

def extract_shortcode_from_url(url):
    """
    Extract shortcode from a Threads post URL.

    Examples:
      https://www.threads.com/@username/post/DVOMbrOEd6Q?xmt=... → DVOMbrOEd6Q
      https://www.threads.net/@username/post/DVOMbrOEd6Q        → DVOMbrOEd6Q

    Returns:
        str | None: shortcode string, or None if not found
    """
    match = re.search(r'/post/([A-Za-z0-9_-]+)', url)
    return match.group(1) if match else None


def _threads_list_media(after_cursor=None):
    """
    Call GET /me/threads to list the authenticated user's thread media objects.
    Returns one page of results. Never logs the access token.

    Returns:
        dict: Raw API response (data list + paging)
    """
    params = {
        "fields": "id,shortcode,permalink,media_type,text,timestamp",
        "access_token": os.environ["THREADS_ACCESS_TOKEN"],
        "limit": 100,
    }
    if after_cursor:
        params["after"] = after_cursor

    response = requests.get(
        f"{THREADS_API_BASE}/me/threads",
        params=params,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def resolve_shortcode_to_media(shortcode):
    """
    Search the authenticated user's threads for a post matching the shortcode.
    Paginates through all available posts.

    Args:
        shortcode (str): The shortcode extracted from the Threads URL

    Returns:
        tuple[dict | None, str | None]: (media_item, error_message)
          - On success: (item_dict, None)
          - On failure: (None, reason_string)
    """
    after = None
    pages_checked = 0

    while True:
        data = _threads_list_media(after_cursor=after)
        items = data.get("data", [])
        pages_checked += 1

        for item in items:
            if item.get("shortcode") == shortcode:
                return item, None

        paging = data.get("paging", {})
        after = paging.get("cursors", {}).get("after")
        if not after or not paging.get("next"):
            break

    return None, (
        f"No thread found with shortcode '{shortcode}' after checking {pages_checked} page(s) of results."
    )


# ---------------------------------------------------------------------------
# Modes
# ---------------------------------------------------------------------------

def run_dry_run():
    print("=" * 50)
    print("Threads MVP 1 - Sync Script (DRY RUN)")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 50)

    print("\n[dry-run] Checking environment variables...")
    validate_environment()

    print("\n[dry-run] mode enabled")
    print("[dry-run] No external API calls will be made")
    print("[dry-run] No Notion reads or writes will be performed")
    print("[dry-run] No metrics will be modified")

    print("\n[dry-run] Next implementation steps:")
    print("  1. Run notion read test: python scripts/threads/sync_threads_insights.py --notion-read-test")
    print("  2. Confirm Notion filters return correct rows")
    print("  3. Implement fetch_threads_insights() — call Threads Insights API")
    print("  4. Implement normalize_metrics() — map API fields to Notion fields")
    print("  5. Implement write_metrics_to_notion() — write back with failure guard")
    print("  6. Run live sync: python scripts/threads/sync_threads_insights.py")

    print("\n[dry-run] Complete. No changes made.")


def run_notion_read_test():
    print("=" * 50)
    print("Threads MVP 1 - Notion Read Test")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 50)

    if not REQUESTS_AVAILABLE:
        print("[error] 'requests' library is not installed.")
        print("[error] Install it: pip install requests")
        sys.exit(1)

    print("\n[notion-read-test] Checking Notion environment variables...")
    validate_environment(keys=NOTION_ENV_KEYS)

    print("\n[notion-read-test] Querying Notion Content Queue...")
    print("[notion-read-test] Filter: Platform=Threads, Status=Published|Insights Synced, Sync Enabled=true, No Blocking Issue=true")
    print("[notion-read-test] Note: Threads Access Token and Meta App Secret are not used in this step.")

    try:
        summaries, total_fetched = read_notion_items()
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "unknown"
        print(f"\n[error] Notion API HTTP error: {status_code}")
        if status_code == 401:
            print("[error] NOTION_API_KEY may be invalid or expired.")
        elif status_code == 404:
            print("[error] NOTION_DATABASE_ID not found, or Integration has no access to this database.")
            print("[error] Ensure the Notion Integration is added to the database (Share > Invite).")
        else:
            print(f"[error] {e}")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("[error] Could not connect to Notion API. Check network connection.")
        sys.exit(1)
    except Exception as e:
        print(f"[error] Unexpected error: {e}")
        sys.exit(1)

    eligible = [s for s in summaries if s["has_threads_post_id"]]
    skipped = [s for s in summaries if not s["has_threads_post_id"]]

    print(f"\n[notion-read-test] Results:")
    print(f"  Total eligible rows fetched : {total_fetched}")
    print(f"  Rows with Threads Post ID   : {len(eligible)}")
    print(f"  Rows missing Threads Post ID: {len(skipped)} (would be skipped)")

    if summaries:
        print("\n[notion-read-test] Row summaries (title | status | has post ID):")
        for s in summaries:
            post_id_flag = "Post ID: YES" if s["has_threads_post_id"] else "Post ID: MISSING"
            print(f"  - {s['title'][:60]:<60} | {s['status']:<20} | {post_id_flag}")
    else:
        print("\n[notion-read-test] No rows matched the filter criteria.")
        print("[notion-read-test] Check that at least one Notion item has:")
        print("  Platform = Threads")
        print("  Status = Published or Insights Synced")
        print("  Sync Enabled = checked")
        print("  No Blocking Issue = checked")

    print("\n[notion-read-test] No Notion writes performed.")
    print("[notion-read-test] No Threads API calls made.")
    print("[notion-read-test] Complete.")


def run_resolve_threads_url(url):
    print("=" * 50)
    print("Threads MVP 1 - Resolve Threads URL")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 50)

    if not REQUESTS_AVAILABLE:
        print("[error] 'requests' library is not installed.")
        print("[error] Install it: pip install requests")
        sys.exit(1)

    # Step 1: extract shortcode
    shortcode = extract_shortcode_from_url(url)
    if not shortcode:
        print(f"\n[error] Could not extract shortcode from URL: {url}")
        print("[error] Expected format: https://www.threads.com/@username/post/SHORTCODE")
        sys.exit(1)
    print(f"\n[resolve] Input URL    : {url}")
    print(f"[resolve] Shortcode    : {shortcode}")
    print("[resolve] Note: shortcode is NOT the Threads Media ID. Resolving...")

    # Step 2: validate token
    print("\n[resolve] Checking THREADS_ACCESS_TOKEN...")
    validate_environment(keys=THREADS_ENV_KEYS)

    # Step 3: search for matching media object
    print("\n[resolve] Searching authenticated user's threads for matching shortcode...")
    print("[resolve] Calling: GET /me/threads (read-only, no writes)")

    try:
        item, error = resolve_shortcode_to_media(shortcode)
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "unknown"
        print(f"\n[error] Threads API HTTP error: {status_code}")
        if status_code == 401:
            print("[error] THREADS_ACCESS_TOKEN may be invalid or expired.")
        elif status_code == 403:
            print("[error] App may lack required permissions (threads_basic scope).")
        elif status_code == 400:
            print("[error] Bad request — check that THREADS_ACCESS_TOKEN is a valid user token.")
        else:
            print(f"[error] {e}")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("[error] Could not connect to Threads API. Check network connection.")
        sys.exit(1)
    except Exception as e:
        print(f"[error] Unexpected error: {e}")
        sys.exit(1)

    # Step 4: output result
    if item:
        media_id   = item.get("id", "")
        permalink  = item.get("permalink", "")
        timestamp  = item.get("timestamp", "")
        media_type = item.get("media_type", "")
        text_raw   = item.get("text", "") or ""
        text_preview = text_raw[:80] + ("..." if len(text_raw) > 80 else "")
        # Safely encode text for Windows consoles that may not support all Unicode
        text_safe = text_preview.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8")

        print("\n[resolve] Match found:")
        print(f"  Media ID    : {media_id}")
        print(f"  Shortcode   : {shortcode}")
        print(f"  Permalink   : {permalink}")
        print(f"  Timestamp   : {timestamp}")
        print(f"  Media Type  : {media_type}")
        print(f"  Text preview: {text_safe}")
        print("\n[resolve] Next step: copy the Media ID above into Notion 'Threads Post ID' field.")
        print("[resolve] Do NOT use the shortcode as the Post ID — use the numeric Media ID.")
    else:
        print(f"\n[resolve] Not found. {error}")
        print("\n[resolve] Possible reasons:")
        print("  1. THREADS_ACCESS_TOKEN belongs to a different Threads account")
        print("  2. App lacks 'threads_basic' permission scope")
        print("  3. Post was deleted or is not accessible via API")
        print("  4. Post is older than the API's pagination limit")
        print("  5. URL domain difference (threads.com vs threads.net) does not affect shortcode extraction")
        print("  6. Threads API does not support direct lookup by shortcode — this script lists all posts and matches")

    print("\n[resolve] No Notion writes performed.")
    print("[resolve] No Insights API calls made.")
    print("[resolve] Complete.")


# ---------------------------------------------------------------------------
# Threads Insights Fetch
# ---------------------------------------------------------------------------

INSIGHTS_METRICS = ["views", "likes", "replies", "reposts", "quotes", "shares"]


def fetch_threads_insights(post_id):
    """
    Call Threads Insights API for the given Media ID.
    Returns normalized metric dict with None for unavailable metrics.
    Never logs access token or raw response.

    Args:
        post_id (str): Numeric Threads Media ID

    Returns:
        tuple[dict, list[str], list[str]]:
          (metrics_dict, available_names, missing_names)
    """
    params = {
        "metric": ",".join(INSIGHTS_METRICS),
        "access_token": os.environ["THREADS_ACCESS_TOKEN"],
    }
    response = requests.get(
        f"{THREADS_API_BASE}/{post_id}/insights",
        params=params,
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()

    metrics = {m: None for m in INSIGHTS_METRICS}
    available = []
    missing = []

    for item in data.get("data", []):
        name = item.get("name")
        if name in metrics:
            vals = item.get("values", [])
            metrics[name] = vals[0].get("value") if vals else None
            if metrics[name] is not None:
                available.append(name)
            else:
                missing.append(name)

    for name in INSIGHTS_METRICS:
        if name not in available and name not in missing:
            missing.append(name)

    return metrics, available, missing


def run_fetch_insights_test(post_id):
    print("=" * 50)
    print("Threads MVP 1 - Insights Fetch Test")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 50)

    if not REQUESTS_AVAILABLE:
        print("[error] 'requests' library is not installed.")
        print("[error] Install it: pip install requests")
        sys.exit(1)

    if not post_id or not post_id.strip():
        print("[error] --post-id is required and must not be empty.")
        sys.exit(1)
    post_id = post_id.strip()

    print(f"\n[insights-test] Post ID : {post_id}")
    print("[insights-test] Checking THREADS_ACCESS_TOKEN...")
    validate_environment(keys=THREADS_ENV_KEYS)

    print(f"\n[insights-test] Calling Threads Insights API (read-only)...")
    print(f"[insights-test] Metrics requested: {', '.join(INSIGHTS_METRICS)}")

    try:
        metrics, available, missing = fetch_threads_insights(post_id)
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "unknown"
        print(f"\n[error] Threads Insights API HTTP error: {status_code}")
        if status_code == 400:
            print("[error] Post ID may be invalid or not accessible by this token.")
        elif status_code == 401:
            print("[error] THREADS_ACCESS_TOKEN is invalid or expired.")
        elif status_code == 403:
            print("[error] Token lacks required permission scope (threads_basic or similar).")
        else:
            print(f"[error] {e}")
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("[error] Could not connect to Threads API. Check network connection.")
        sys.exit(1)
    except Exception as e:
        print(f"[error] Unexpected error: {e}")
        sys.exit(1)

    print(f"\n[insights-test] API status  : success")
    print(f"[insights-test] Available metrics ({len(available)}):")
    for name in INSIGHTS_METRICS:
        if name in available:
            print(f"  {name:<10}: {metrics[name]}")

    if missing:
        print(f"\n[insights-test] Unavailable / API dependent ({len(missing)}):")
        for name in missing:
            print(f"  {name:<10}: unsupported or null (API dependent)")

    # Engagement Rate preview (not written to Notion in this mode)
    views = metrics.get("views")
    if views and views > 0:
        engagements = sum(
            metrics.get(k) or 0
            for k in ["likes", "replies", "reposts", "quotes", "shares"]
        )
        eng_rate = engagements / views
        print(f"\n[insights-test] Engagement Rate preview : {eng_rate:.4f} ({eng_rate*100:.2f}%)")
        print("[insights-test] Note: this value is NOT written to Notion in this mode.")
    else:
        print("\n[insights-test] Engagement Rate: not calculated (views unavailable or zero).")

    print("\n[insights-test] No Notion writes performed.")
    print("[insights-test] Complete.")


# ---------------------------------------------------------------------------
# Notion Writeback
# ---------------------------------------------------------------------------

def _find_notion_row_by_post_id(post_id):
    """
    Query Notion for a row whose 'Threads Post ID' matches post_id exactly.

    Returns:
        tuple[dict | None, str | None]:
          (page_object, error_message)
          error_message is set if 0 or 2+ rows found.
    """
    database_id = os.environ["NOTION_DATABASE_ID"]
    filter_body = {
        "property": "Threads Post ID",
        "rich_text": {"equals": post_id},
    }
    data = _query_notion_database(database_id, filter_body)
    results = data.get("results", [])

    if len(results) == 0:
        return None, f"No Notion row found with Threads Post ID = '{post_id}'"
    if len(results) > 1:
        return None, (
            f"Duplicate rows ({len(results)}) found with Threads Post ID = '{post_id}'. "
            "Manual resolution required — writeback aborted."
        )
    return results[0], None


def normalize_metrics(raw_metrics):
    """
    Map raw API metric dict to Notion field names.
    None values stay as None (API did not return the metric).

    Args:
        raw_metrics (dict): {metric_name: value_or_None}

    Returns:
        dict: Notion-field-keyed metrics
    """
    field_map = {
        "views":   "Views",
        "likes":   "Likes",
        "replies": "Replies",
        "reposts": "Reposts",
        "quotes":  "Quotes",
        "shares":  "Shares",
    }
    normalized = {}
    missing_fields = []
    for api_key, notion_key in field_map.items():
        val = raw_metrics.get(api_key)
        normalized[notion_key] = val
        if val is None:
            missing_fields.append(api_key)
    return normalized, missing_fields


def _compute_engagement_rate(metrics_dict):
    """
    Compute Engagement Rate = (likes + replies + reposts + quotes + shares) / views.
    Returns (rate_float, note_str).
    rate_float is None if views is unavailable or 0.
    """
    views = metrics_dict.get("Views")
    if not views or views == 0:
        return None, "views unavailable or zero — engagement rate not calculated"

    engagement_keys = ["Likes", "Replies", "Reposts", "Quotes", "Shares"]
    null_keys = [k for k in engagement_keys if metrics_dict.get(k) is None]
    engagements = sum(metrics_dict.get(k) or 0 for k in engagement_keys)
    rate = engagements / views

    note = None
    if null_keys:
        note = f"null metrics substituted with 0 for engagement rate: {', '.join(null_keys)}"
    return rate, note


def _build_notion_properties(metrics_dict, eng_rate, sync_status, now_iso,
                              error_note=None, clear_error=False):
    """
    Build the Notion PATCH properties payload.
    Only includes fields with non-None values (does not overwrite with null).
    """
    props = {}

    for notion_key in ["Views", "Likes", "Replies", "Reposts", "Quotes", "Shares"]:
        val = metrics_dict.get(notion_key)
        if val is not None:
            props[notion_key] = {"number": val}

    if eng_rate is not None:
        props["Engagement Rate"] = {"number": round(eng_rate, 6)}

    props["Sync Status"] = {"select": {"name": sync_status}}
    props["Last Sync Attempt At"] = {"date": {"start": now_iso}}

    if sync_status == "Synced":
        props["Data Last Synced At"] = {"date": {"start": now_iso}}

    if clear_error:
        props["Sync Error Note"] = {"rich_text": []}
    elif error_note:
        safe_note = error_note[:500]  # Notion rich_text has length limits
        props["Sync Error Note"] = {"rich_text": [{"type": "text", "text": {"content": safe_note}}]}

    return props


def _patch_notion_page(page_id, properties):
    """
    PATCH a Notion page with the given properties dict.
    Raises on HTTP error. Never logs the API key.
    """
    url = f"{NOTION_API_BASE}/pages/{page_id}"
    response = requests.patch(url, headers=_notion_headers(), json={"properties": properties}, timeout=30)
    response.raise_for_status()
    return response.json()


def write_metrics_to_notion(page_id, metrics_dict, eng_rate, sync_status,
                             now_iso, error_note=None, clear_error=False):
    """
    Write normalized metrics and sync status to a single Notion page.
    On failure guard: caller must NOT call this if insights fetch failed.

    Args:
        page_id (str): Notion page ID
        metrics_dict (dict): Notion-field-keyed metrics (None values are skipped)
        eng_rate (float | None): Engagement rate, or None
        sync_status (str): 'Synced' | 'Failed' | 'Skipped' | 'Needs Review'
        now_iso (str): ISO 8601 timestamp string
        error_note (str | None): Error message for Sync Error Note
        clear_error (bool): If True, clears Sync Error Note

    Returns:
        bool: True on success
    """
    props = _build_notion_properties(
        metrics_dict, eng_rate, sync_status, now_iso,
        error_note=error_note, clear_error=clear_error
    )
    _patch_notion_page(page_id, props)
    return True


def _write_failure_status(page_id, now_iso, error_note):
    """Write only failure fields to Notion — never touches metric columns."""
    props = {
        "Sync Status": {"select": {"name": "Failed"}},
        "Last Sync Attempt At": {"date": {"start": now_iso}},
        "Sync Error Note": {
            "rich_text": [{"type": "text", "text": {"content": error_note[:500]}}]
        },
    }
    _patch_notion_page(page_id, props)


def run_writeback_test(post_id):
    print("=" * 50)
    print("Threads MVP 1 - Notion Writeback Test")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 50)

    if not REQUESTS_AVAILABLE:
        print("[error] 'requests' library is not installed.")
        sys.exit(1)

    if not post_id or not post_id.strip():
        print("[error] --post-id is required.")
        sys.exit(1)
    post_id = post_id.strip()

    now_iso = datetime.now(timezone.utc).isoformat()

    # Step 1: validate env
    print("\n[writeback-test] Checking environment variables...")
    validate_environment(keys=REQUIRED_ENV_KEYS[:1] + NOTION_ENV_KEYS)  # TOKEN + Notion keys

    # Step 2: find Notion row
    print(f"\n[writeback-test] Looking up Notion row for Post ID: {post_id}")
    try:
        page, find_error = _find_notion_row_by_post_id(post_id)
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "unknown"
        print(f"[error] Notion API error while searching: {status_code}")
        sys.exit(1)
    except Exception as e:
        print(f"[error] Unexpected error during Notion lookup: {e}")
        sys.exit(1)

    if find_error:
        print(f"[writeback-test] {find_error}")
        sys.exit(1)

    page_id = page["id"]
    summary = _extract_page_summary(page)
    print(f"[writeback-test] Row found: '{summary['title']}' (Status: {summary['status']})")

    # Step 3: fetch insights (must succeed before any metric writeback)
    print(f"\n[writeback-test] Fetching Threads Insights for Post ID: {post_id}")
    insights_ok = False
    raw_metrics = {}
    insights_error_note = None

    try:
        raw_metrics, available, missing_metrics = fetch_threads_insights(post_id)
        insights_ok = True
        print(f"[writeback-test] Insights fetched: {len(available)} metrics available")
        if missing_metrics:
            print(f"[writeback-test] API dependent (not writing): {', '.join(missing_metrics)}")
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "unknown"
        insights_error_note = f"Threads Insights API error {status_code}"
        print(f"[writeback-test] Insights fetch failed: {insights_error_note}")
    except Exception as e:
        insights_error_note = f"Unexpected error during insights fetch: {type(e).__name__}"
        print(f"[writeback-test] Insights fetch failed: {insights_error_note}")

    # Step 4a: insights failed — write only failure status, preserve existing metrics
    if not insights_ok:
        print(f"\n[writeback-test] Writing failure status to Notion (metrics NOT overwritten)...")
        try:
            _write_failure_status(page_id, now_iso, insights_error_note)
            print(f"[writeback-test] Sync Status = Failed | Sync Error Note updated")
            print(f"[writeback-test] Existing metric values preserved.")
        except Exception as e:
            print(f"[error] Could not write failure status to Notion: {type(e).__name__}")
        sys.exit(1)

    # Step 4b: insights succeeded — normalize and write back
    metrics_dict, null_fields = normalize_metrics(raw_metrics)
    eng_rate, eng_note = _compute_engagement_rate(metrics_dict)

    error_note_parts = []
    if null_fields:
        error_note_parts.append(f"null metrics (API dependent): {', '.join(null_fields)}")
    if eng_note and "not calculated" in eng_note:
        error_note_parts.append(eng_note)
    combined_note = "; ".join(error_note_parts) if error_note_parts else None

    print(f"\n[writeback-test] Writing metrics to Notion...")
    print(f"[writeback-test] Fields to write:")
    for k, v in metrics_dict.items():
        if v is not None:
            print(f"  {k}: {v}")
    if eng_rate is not None:
        print(f"  Engagement Rate: {round(eng_rate, 6)} ({eng_rate*100:.2f}%)")
    print(f"  Sync Status: Synced")
    print(f"  Data Last Synced At: {now_iso}")
    print(f"  Last Sync Attempt At: {now_iso}")
    if combined_note:
        print(f"  Sync Error Note: {combined_note}")
    else:
        print(f"  Sync Error Note: (cleared)")

    try:
        write_metrics_to_notion(
            page_id, metrics_dict, eng_rate,
            sync_status="Synced",
            now_iso=now_iso,
            error_note=combined_note,
            clear_error=(combined_note is None),
        )
        print(f"\n[writeback-test] Notion writeback successful.")
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "unknown"
        print(f"[error] Notion writeback failed: HTTP {status_code}")
        print("[error] Existing metrics preserved (write did not complete).")
        sys.exit(1)
    except Exception as e:
        print(f"[error] Notion writeback failed: {type(e).__name__}")
        sys.exit(1)

    print("[writeback-test] Complete.")


# ---------------------------------------------------------------------------
# Token Exchange
# ---------------------------------------------------------------------------

def _mask_token(token):
    """Return a masked preview: first 6 chars + ... + last 4 chars."""
    if not token or len(token) < 12:
        return "***"
    return f"{token[:6]}...{token[-4:]}"


def run_exchange_long_lived_token():
    print("=" * 50)
    print("Threads MVP 1 - Long-lived Token Exchange")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 50)

    if not REQUESTS_AVAILABLE:
        print("[error] 'requests' library is not installed.")
        sys.exit(1)

    print("\n[token-exchange] Checking required environment variables...")
    validate_environment(keys=["THREADS_ACCESS_TOKEN", "META_APP_SECRET"])

    print("\n[token-exchange] Calling Threads long-lived token exchange endpoint...")
    print("[token-exchange] Endpoint: GET https://graph.threads.net/access_token")
    print("[token-exchange] grant_type: th_exchange_token")

    params = {
        "grant_type": "th_exchange_token",
        "client_secret": os.environ["META_APP_SECRET"],
        "access_token": os.environ["THREADS_ACCESS_TOKEN"],
    }

    try:
        response = requests.get(
            "https://graph.threads.net/access_token",
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response is not None else "unknown"
        print(f"\n[error] Token exchange HTTP error: {status_code}")
        try:
            err = e.response.json().get("error", {})
            print(f"[error] Code    : {err.get('code', 'unknown')}")
            print(f"[error] Type    : {err.get('type', 'unknown')}")
            msg = err.get("message", "")
            if "threads_basic" in msg.lower() or "permission" in msg.lower():
                print("[error] Reason  : App may not have 'threads_basic' permission or is not approved.")
            elif "short" in msg.lower() or "exchange" in msg.lower():
                print("[error] Reason  : Token may already be a long-lived token (not exchangeable again).")
            elif "expired" in msg.lower() or "invalid" in msg.lower():
                print("[error] Reason  : Token is expired or invalid. Obtain a fresh short-lived token.")
            else:
                # Print a truncated safe message without token values
                safe_msg = msg[:200] if msg else "no detail"
                print(f"[error] Message : {safe_msg}")
        except Exception:
            pass
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("[error] Could not connect to Threads API. Check network connection.")
        sys.exit(1)
    except Exception as e:
        print(f"[error] Unexpected error: {type(e).__name__}")
        sys.exit(1)

    new_token = data.get("access_token", "")
    token_type = data.get("token_type", "unknown")
    expires_in = data.get("expires_in")

    if not new_token:
        print("\n[error] Exchange succeeded but response did not contain access_token.")
        sys.exit(1)

    expires_at_str = "unknown"
    if expires_in is not None:
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        expires_at_str = expires_at.strftime("%Y-%m-%d %H:%M:%S UTC")

    print("\n[token-exchange] Exchange successful:")
    print(f"  token_type      : {token_type}")
    print(f"  expires_in      : {expires_in} seconds" + (f" (~{expires_in//86400} days)" if expires_in else ""))
    print(f"  expires_at      : {expires_at_str}")
    print(f"  new token       : present: YES")
    print(f"  new token preview: {_mask_token(new_token)}")

    # Write full token to a local gitignored file (never to stdout)
    token_output_path = ".new_threads_token"
    try:
        with open(token_output_path, "w") as f:
            f.write(f"# Threads long-lived token — generated {datetime.now(timezone.utc).isoformat()}\n")
            f.write(f"# expires_at: {expires_at_str}\n")
            f.write(f"# DO NOT COMMIT THIS FILE\n")
            f.write(f"THREADS_ACCESS_TOKEN={new_token}\n")
        print(f"\n[token-exchange] Full token written to: {token_output_path}")
        print(f"[token-exchange] This file is for local use only. Delete it after updating .env.")
    except Exception as e:
        print(f"\n[warning] Could not write token to file: {type(e).__name__}")
        print("[warning] Token was NOT printed to console. Re-run this command to retry.")

    print("\n[token-exchange] IMPORTANT — Manual action required:")
    print(f"  1. Run:  cat {token_output_path}")
    print(f"     (or open the file) to read the new token.")
    print("  2. Copy the THREADS_ACCESS_TOKEN= value into your local .env file.")
    print("  3. Delete the output file:  del .new_threads_token  (or rm .new_threads_token)")
    print("  4. Do NOT commit .env or .new_threads_token to git.")
    print(f"  5. Record expires_at manually: {expires_at_str}")
    print("  6. Schedule a token refresh before expiry.")
    print("\n[token-exchange] This script did NOT update .env automatically.")
    print("[token-exchange] No Notion writes performed.")
    print("[token-exchange] Complete.")


def main():
    parser = argparse.ArgumentParser(
        description="Threads MVP 1 Insights Sync Script"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate environment only. No API calls or Notion writes.",
    )
    parser.add_argument(
        "--notion-read-test",
        action="store_true",
        help="Read Notion Content Queue and print safe summary. No Threads API calls. No writes.",
    )
    parser.add_argument(
        "--resolve-threads-url",
        metavar="URL",
        help="Resolve a Threads post URL to its Media ID. Read-only. No writes.",
    )
    parser.add_argument(
        "--fetch-insights-test",
        action="store_true",
        help="Fetch Insights for a single post. Read-only. No Notion writes. Requires --post-id.",
    )
    parser.add_argument(
        "--writeback-test",
        action="store_true",
        help="Fetch Insights and write metrics to a single Notion row. Requires --post-id.",
    )
    parser.add_argument(
        "--post-id",
        metavar="MEDIA_ID",
        help="Threads Media ID to use with --fetch-insights-test or --writeback-test.",
    )
    parser.add_argument(
        "--exchange-long-lived-token",
        action="store_true",
        help="Exchange current THREADS_ACCESS_TOKEN for a long-lived token. Writes token to .new_threads_token file.",
    )
    args = parser.parse_args()

    load_environment()

    if args.dry_run:
        run_dry_run()
        return

    if args.notion_read_test:
        run_notion_read_test()
        return

    if args.resolve_threads_url:
        run_resolve_threads_url(args.resolve_threads_url)
        return

    if args.fetch_insights_test:
        if not args.post_id:
            print("[error] --fetch-insights-test requires --post-id MEDIA_ID")
            sys.exit(1)
        run_fetch_insights_test(args.post_id)
        return

    if args.writeback_test:
        if not args.post_id:
            print("[error] --writeback-test requires --post-id MEDIA_ID")
            sys.exit(1)
        run_writeback_test(args.post_id)
        return

    if args.exchange_long_lived_token:
        run_exchange_long_lived_token()
        return

    # Live sync — not yet implemented
    print("[error] Live sync is not yet implemented.")
    print("[info]  Run with --dry-run to validate environment setup.")
    print("[info]  Run with --notion-read-test to verify Notion connectivity.")
    print("[info]  Run with --resolve-threads-url URL to find a post's Media ID.")
    print("[info]  Run with --fetch-insights-test --post-id ID to fetch insights.")
    print("[info]  Run with --writeback-test --post-id ID to write metrics to Notion.")
    print("[info]  Run with --exchange-long-lived-token to get a 60-day token.")
    sys.exit(1)


if __name__ == "__main__":
    main()
