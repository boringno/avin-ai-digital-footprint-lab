"""
sync_threads_insights.py

Threads MVP 1 - Local Script
Status: Notion read test implemented; Threads API sync not yet implemented

Usage:
    python scripts/threads/sync_threads_insights.py --dry-run
    python scripts/threads/sync_threads_insights.py --notion-read-test

See scripts/threads/README.md for setup instructions.
"""

import os
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
    args = parser.parse_args()

    load_environment()

    if args.dry_run:
        run_dry_run()
        return

    if args.notion_read_test:
        run_notion_read_test()
        return

    # Live sync — not yet implemented
    print("[error] Live sync is not yet implemented.")
    print("[info]  Run with --dry-run to validate environment setup.")
    print("[info]  Run with --notion-read-test to verify Notion connectivity.")
    sys.exit(1)


if __name__ == "__main__":
    main()
