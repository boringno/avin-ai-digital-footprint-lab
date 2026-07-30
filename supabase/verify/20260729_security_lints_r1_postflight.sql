with expected(table_name) as (
  values
    ('legacy_conversations_20260622'),
    ('customers'),
    ('messages'),
    ('webhook_events'),
    ('faq_entries'),
    ('pricing_campaigns'),
    ('handoff_rules'),
    ('conversation_runtime_state')
),
table_checks as (
  select 'table' as check_type,
         e.table_name as object_name,
         c.relrowsecurity as rls_enabled,
         has_table_privilege('anon', c.oid, 'select') as anon_select,
         has_table_privilege('authenticated', c.oid, 'select') as authenticated_select
  from expected e
  join pg_class c on c.oid = ('public.' || e.table_name)::regclass
),
function_checks as (
  select 'function' as check_type,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as object_name,
         current_setting('search_path', true) is not null as rls_enabled,
         coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=public, pg_temp%' as anon_select,
         null::boolean as authenticated_select
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (array[
      'set_updated_at',
      'is_admin_login_rate_limited',
      'record_admin_login_failure',
      'create_content_draft',
      'publish_content_version',
      'disable_content_version',
      'publish_schedule_month',
      'disable_schedule_month',
      'replace_handoff_notification_recipients',
      'create_runtime_content_release',
      'activate_runtime_content_release',
      'rollback_runtime_content_release'
    ])
)
select * from table_checks
union all
select * from function_checks
order by check_type, object_name;

select policyname
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'public read schedule assets';
