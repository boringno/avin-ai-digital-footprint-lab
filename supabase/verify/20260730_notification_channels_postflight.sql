-- Postflight for applying the repaired 20260727 notification-channel migration.
-- This script reads catalog metadata only; it does not read customer messages.

select
  to_regclass('public.line_group_sources') is not null as line_group_sources_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'handoff_notification_recipients'
      and column_name = 'channel'
  ) as recipients_channel_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'handoff_notification_recipients'
      and column_name = 'target'
  ) as recipients_target_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'handoff_digest_deliveries'
      and column_name = 'channel'
  ) as deliveries_channel_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'handoff_digest_deliveries'
      and column_name = 'error_message'
  ) as deliveries_error_message_exists;

-- New uniqueness rules are indexes, while the old rules were constraints.
-- Check both kinds by their column sets instead of generated object names.
with unique_column_sets as (
  select
    rel.relname as table_name,
    idx.indisunique as is_unique,
    array_agg(att.attname::text order by att.attname) as columns
  from pg_index idx
  join pg_class rel on rel.oid = idx.indrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join unnest(idx.indkey) as key_column(attnum) on true
  join pg_attribute att
    on att.attrelid = idx.indrelid
   and att.attnum = key_column.attnum
  where nsp.nspname = 'public'
    and rel.relname in ('handoff_digest_deliveries', 'handoff_notification_recipients')
  group by rel.relname, idx.indexrelid, idx.indisunique
)
select
  exists (
    select 1 from unique_column_sets
    where table_name = 'handoff_notification_recipients'
      and is_unique
      and columns = array['branch', 'channel', 'recipient_scope', 'target', 'tenant_id']::text[]
  ) as recipients_new_unique_index_exists,
  not exists (
    select 1 from unique_column_sets
    where table_name = 'handoff_notification_recipients'
      and is_unique
      and columns = array['branch', 'recipient_email', 'recipient_scope', 'tenant_id']::text[]
  ) as recipients_old_unique_absent,
  exists (
    select 1 from unique_column_sets
    where table_name = 'handoff_digest_deliveries'
      and is_unique
      and columns = array['branch', 'channel', 'digest_key', 'tenant_id']::text[]
  ) as deliveries_new_unique_index_exists,
  not exists (
    select 1 from unique_column_sets
    where table_name = 'handoff_digest_deliveries'
      and is_unique
      and columns = array['branch', 'digest_key', 'tenant_id']::text[]
  ) as deliveries_old_unique_absent;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  coalesce(array_to_string(p.proconfig, ', '), '(not set)') as config
from pg_proc p
join pg_namespace nsp on nsp.oid = p.pronamespace
where nsp.nspname = 'public'
  and p.proname = 'replace_handoff_notification_recipients';
