# R1 Reporting Notes

R1 is a reporting-only layer. It does not alter router decisions, customer replies, or approved content.

The existing AI identity disclosure behavior is outside R1 scope: the first-contact greeting and AI footer remain governed by the prior customer-facing policy, not this reporting work.

- `daily_metrics` and `monthly_metrics` contain aggregated counts only.
- FAQ miss candidates store a SHA-256 hash plus a redacted preview. Raw customer questions are not copied into reporting tables.
- `faq_miss_observations` is an internal idempotency table. It prevents a rerun of the daily job from inflating candidate counts.
- The Vercel cron runs at 17:00 UTC, which is 01:00 Asia/Taipei. It rolls up the previous Taipei calendar day.
- Set `CRON_SECRET` in Vercel before deploying. Vercel sends it as `Authorization: Bearer <CRON_SECRET>`.
- Run a safe local check with `npm run reporting:daily -- --dry-run --date=YYYY-MM-DD` after applying the R0 and R1 migrations.
