-- Read-only production schema check for the 20260727 notification-channel migration.
-- This script reads only catalog metadata. It does not read customer data.

-- Expected objects and columns from 20260727.
select
  to_regclass('public.line_group_sources') is not null as line_group_sources_exists,
  to_regclass('public.handoff_digest_deliveries') is not null as handoff_digest_deliveries_exists,
  to_regclass('public.handoff_notification_recipients') is not null as handoff_notification_recipients_exists;

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('line_group_sources', 'handoff_digest_deliveries', 'handoff_notification_recipients')
order by table_name, ordinal_position;

-- Unique constraints and indexes that 20260727 replaces.
select
  rel.relname as table_name,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname in ('handoff_digest_deliveries', 'handoff_notification_recipients')
  and con.contype = 'u'
order by rel.relname, con.conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('handoff_digest_deliveries', 'handoff_notification_recipients')
order by tablename, indexname;

-- Whether this project has CLI migration history (do not query a missing table).
select to_regclass('supabase_migrations.schema_migrations') as migration_history_table;
