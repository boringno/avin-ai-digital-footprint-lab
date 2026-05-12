# Threads MVP 1 Lifecycle Completed

## 1. Summary
Threads MVP 1 has successfully transitioned from a conceptual workflow to a verified feedback loop. The system now supports manual publishing with automated data recovery, connecting Threads API metrics directly to a Notion interpretation layer.

## 2. Scope
### Included in MVP 1:
- Manual publishing workflow.
- Threads URL to numeric Media ID resolution.
- Threads Insights data fetching (6 core metrics).
- Single-row Notion writeback validation.
- Long-lived token exchange (60-day validity).
- Formal documentation of the Content Format Experiment Library.

### Explicitly Excluded:
- Automated publishing.
- Batch synchronization.
- Scheduled synchronization via GitHub Actions.
- Automated token refresh.
- Instagram or LinkedIn publishing integrations.

## 3. Notion Infrastructure
**Public Output Queue:** [Notion Database](https://www.notion.so/d82461312bcb4c3981730814c52c3e04)
- **Database ID:** `d82461312bcb4c3981730814c52c3e04`
- **Data Source ID:** `6bd9113e-3cc2-4f1c-9a21-ce3590dc6ca5`

The database is structured into two distinct functional layers:
1.  **Sync/Metrics Layer:** Automated fields for Threads API data.
2.  **Experiment/Interpretation Layer:** Manual fields for content categorization and performance analysis.

## 4. Test Row
- **Title:** `Threads MVP 1 Test Post`
- **Threads URL:** `https://www.threads.com/@hakusada/post/DVOMbrOEd6Q`
- **Threads Media ID:** `17935258965186803`

## 5. Threads API Validation
- **URL Resolver:** Successfully converted shortcode `DVOMbrOEd6Q` to Media ID.
- **Insights Fetch:** Verified retrieval of all 6 metrics.
- **Token Exchange:** Successfully upgraded to a long-lived token.
- **Token Expiry:** `2026-07-11 09:48:55 UTC`.
*Note: Tokens and secrets are stored exclusively in local .env and are never committed or printed.*

## 6. Metrics Captured
Last successful Writeback Test results for Media ID `17935258965186803`:
- **Views:** 2,971,256
- **Likes:** 17,773
- **Replies:** 4,677
- **Reposts:** 1,676
- **Quotes:** 86
- **Shares:** 11,643
- **Engagement Rate:** ~1.21%
- **Sync Status:** `Synced`
- **Data Last Synced At:** `2026-05-12T10:17:18.718203+00:00`
- **Last Sync Attempt At:** `2026-05-12T10:17:18.718203+00:00`
- **Sync Error Note:** `cleared`

## 7. Writeback Result
- Successfully targeted the unique row matching the Post ID.
- Verified all 6 metrics were correctly written to Notion.
- Confirmed that protected fields (Title, Platform, Category) remained unchanged.
- Zero leakage of tokens or raw API responses in logs.
- Workspace remained clean with only untracked `open-source-vault/`.

## 8. Content Format Experiment Layer
- **New Document:** `04-workflows/content-format-experiment-library.md`
- **Primary Commit:** `3cc73922771f7cf5e08204c4c0909646cb7f3486`
- **Automation Commit:** `4dc2d74` (Bot index update)

This layer ensures that viral outliers do not dictate future strategy without human interpretation. It formalizes categories like *Knowledge*, *Tool Test*, and *Hot Take* while enforcing a "Format Confidence" scale.

## 9. Key Design Decision
AVIN's strategic direction:
- High performance is often a "Perfect Storm" of timing, topic, and platform distribution.
- One-off success does not equal a repeatable formula.
- Content must be treated as a versioned experiment.
- Different categories (Opinion vs. Case Study) require unique structural hooks.

## 10. Completed Commits
- `39be361` — docs: add threads mvp1 manual test checklist
- `bf7c07d` — chore: add threads insights sync script skeleton
- `5d4c13c` — feat: add threads url resolver mode
- `f81de95` — feat: add threads insights fetch test
- `e565e6e` — feat: add threads long-lived token exchange mode
- `3cc7392` — docs: add content format experiment library
- `4dc2d74` — docs-index bot update for Content Format Experiment Library

## 11. Current Security State
- `.env` is properly gitignored and never committed.
- `.new_threads_token` temporary file has been deleted.
- `open-source-vault/` remains untracked and excluded from source control.
- `docs-index.md` is strictly managed by automation.
- No secrets or tokens are present in any repository documentation.

## 12. Remaining Work
1.  **Refresh Long-lived Token Mode:** Implement `--refresh-long-lived-token` to extend validity before the 60-day expiry.
2.  **Batch Notion Sync:** Scale from single-post to multiple-post synchronization with duplicate detection.
3.  **Scheduled Sync:** Integrate GitHub Actions for automated background syncing (Post-security review).
4.  **IG/LinkedIn Expansion:** Adapt the workflow logic for additional platforms.
5.  **Experiment Iteration:** Consistent application of Hypothesis and Interpretation fields for every new post.

## 13. Acceptance Criteria
- [x] Threads MVP 1 single-row lifecycle completed.
- [x] Metrics successfully written back to Notion.
- [x] Long-lived token verified and expiration tracked.
- [x] Content interpretation layer documented and committed.
- [x] Zero secrets committed to source control.
- [x] `open-source-vault` remains untracked.

## 14. Final Status
**Threads MVP 1 is now completed as a manual-publish, auto-insights, human-interpreted feedback loop.**

**Disclaimer:** This is not yet an auto-publishing system or a scheduled batch sync. It is a verified MVP loop for single-post insight collection and interpretation.
