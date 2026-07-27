begin;

alter table if exists public.handoff_notification_recipients
  add column if not exists channel text,
  add column if not exists target text;

alter table if exists public.handoff_notification_recipients
  alter column recipient_email drop not null;

update public.handoff_notification_recipients
set
  channel = coalesce(channel, 'email'),
  target = coalesce(nullif(target, ''), recipient_email),
  recipient_email = coalesce(recipient_email, target)
where channel is null
   or target is null
   or target = '';

alter table public.handoff_notification_recipients
  alter column channel set default 'email',
  alter column channel set not null,
  alter column target set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'handoff_notification_recipients_channel_check'
  ) then
    alter table public.handoff_notification_recipients
      add constraint handoff_notification_recipients_channel_check
      check (channel in ('email', 'line_group'));
  end if;
end;
$$;

drop index if exists handoff_notification_recipients_tenant_id_branch_recipient_scope_recipient_email_key;

create unique index if not exists handoff_notification_recipients_tenant_branch_scope_channel_target_key
  on public.handoff_notification_recipients (tenant_id, branch, recipient_scope, channel, target);

create index if not exists idx_handoff_notification_recipients_branch_channel_active
  on public.handoff_notification_recipients (tenant_id, branch, recipient_scope, channel)
  where is_active = true;

create table if not exists public.line_group_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  group_id text not null,
  group_name text,
  last_event_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists line_group_sources_tenant_group_id_key
  on public.line_group_sources (tenant_id, group_id);

create index if not exists line_group_sources_tenant_last_seen_at_idx
  on public.line_group_sources (tenant_id, last_seen_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'line_group_sources_group_id_not_blank'
  ) then
    alter table public.line_group_sources
      add constraint line_group_sources_group_id_not_blank
      check (btrim(group_id) <> '');
  end if;
end;
$$;

drop trigger if exists trg_line_group_sources_updated_at on public.line_group_sources;
create trigger trg_line_group_sources_updated_at before update on public.line_group_sources
for each row execute function public.set_updated_at();

alter table public.line_group_sources enable row level security;
revoke all on table public.line_group_sources from anon, authenticated;

alter table if exists public.handoff_digest_deliveries
  add column if not exists channel text,
  add column if not exists error_message text;

update public.handoff_digest_deliveries
set channel = coalesce(channel, 'email')
where channel is null;

alter table public.handoff_digest_deliveries
  alter column channel set default 'email',
  alter column channel set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'handoff_digest_deliveries_channel_check'
  ) then
    alter table public.handoff_digest_deliveries
      add constraint handoff_digest_deliveries_channel_check
      check (channel in ('email', 'line_group'));
  end if;
end;
$$;

drop index if exists handoff_digest_deliveries_tenant_id_branch_digest_key_key;

create unique index if not exists handoff_digest_deliveries_tenant_branch_channel_digest_key_key
  on public.handoff_digest_deliveries (tenant_id, branch, channel, digest_key);

create index if not exists handoff_digest_deliveries_tenant_branch_channel_status_idx
  on public.handoff_digest_deliveries (tenant_id, branch, channel, status);

drop function if exists public.replace_handoff_notification_recipients(text, text, text, text[]);

create or replace function public.replace_handoff_notification_recipients(
  p_tenant_id text,
  p_branch text,
  p_scope text,
  p_channel text,
  p_targets text[]
) returns void
language plpgsql
as $$
declare
  v_limit integer;
  v_target text;
  v_targets text[] := coalesce(p_targets, array[]::text[]);
begin
  if p_branch not in ('高雄館', '台中館', '桃園館', '林口館') then
    raise exception 'Invalid branch';
  end if;

  if p_scope not in ('clinic', 'platform') then
    raise exception 'Invalid recipient scope';
  end if;

  if p_channel not in ('email', 'line_group') then
    raise exception 'Invalid notification channel';
  end if;

  v_limit := case
    when p_channel = 'line_group' then 1
    when p_scope = 'clinic' then 3
    else 10
  end;

  if coalesce(array_length(v_targets, 1), 0) > v_limit then
    raise exception 'Recipient limit exceeded';
  end if;

  update public.handoff_notification_recipients
  set is_active = false
  where tenant_id = p_tenant_id
    and branch = p_branch
    and recipient_scope = p_scope
    and channel = p_channel;

  foreach v_target in array v_targets
  loop
    v_target := trim(v_target);
    if v_target = '' then
      continue;
    end if;

    insert into public.handoff_notification_recipients (
      tenant_id,
      branch,
      recipient_scope,
      channel,
      target,
      recipient_email,
      is_active
    )
    values (
      p_tenant_id,
      p_branch,
      p_scope,
      p_channel,
      case when p_channel = 'email' then lower(v_target) else v_target end,
      case when p_channel = 'email' then lower(v_target) else null end,
      true
    )
    on conflict (tenant_id, branch, recipient_scope, channel, target)
    do update set
      is_active = true,
      recipient_email = excluded.recipient_email,
      updated_at = now();
  end loop;
end;
$$;

revoke all on function public.replace_handoff_notification_recipients(text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.replace_handoff_notification_recipients(text, text, text, text, text[]) to service_role;

commit;
