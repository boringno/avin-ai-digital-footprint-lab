begin;

-- These MVP-era tables are accessed only by the server-side service-role
-- client. Keep PostgREST callers on anon/authenticated from reading or
-- mutating customer, message, webhook, and operational configuration data.
alter table public.legacy_conversations_20260622 enable row level security;
alter table public.customers enable row level security;
alter table public.messages enable row level security;
alter table public.webhook_events enable row level security;
alter table public.faq_entries enable row level security;
alter table public.pricing_campaigns enable row level security;
alter table public.handoff_rules enable row level security;
alter table public.conversation_runtime_state enable row level security;

revoke all on table
  public.legacy_conversations_20260622,
  public.customers,
  public.messages,
  public.webhook_events,
  public.faq_entries,
  public.pricing_campaigns,
  public.handoff_rules,
  public.conversation_runtime_state
from anon, authenticated;

-- Apply a deterministic search path to every currently deployed overload of
-- the functions reported by the Supabase security linter. Resolving by oid
-- avoids assuming a particular overload signature during a phased rollout.
do $$
declare
  target record;
begin
  for target in
    select p.proname, pg_get_function_identity_arguments(p.oid) as identity_arguments
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
  loop
    execute format(
      'alter function public.%I(%s) set search_path = public, pg_temp',
      target.proname,
      target.identity_arguments
    );
  end loop;
end;
$$;

-- The bucket remains public for known schedule-image URLs. The broad SELECT
-- policy is unnecessary for public object delivery and permits bucket-wide
-- listing to database clients.
drop policy if exists "public read schedule assets" on storage.objects;

commit;
