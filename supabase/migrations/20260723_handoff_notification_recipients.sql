begin;

create table if not exists public.handoff_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  branch text not null check (branch in ('高雄館', '台中館', '桃園館', '林口館')),
  recipient_scope text not null check (recipient_scope in ('clinic', 'platform')),
  recipient_email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, branch, recipient_scope, recipient_email)
);

create index if not exists idx_handoff_notification_recipients_active
  on public.handoff_notification_recipients (tenant_id, branch, recipient_scope)
  where is_active = true;

drop trigger if exists trg_handoff_notification_recipients_updated_at on public.handoff_notification_recipients;
create trigger trg_handoff_notification_recipients_updated_at before update on public.handoff_notification_recipients
for each row execute function public.set_updated_at();

alter table public.handoff_notification_recipients enable row level security;
revoke all on table public.handoff_notification_recipients from anon, authenticated;

create or replace function public.replace_handoff_notification_recipients(
  p_tenant_id text,
  p_branch text,
  p_scope text,
  p_emails text[]
) returns void
language plpgsql
as $$
declare
  v_email text;
  v_recipient_limit integer;
begin
  if p_branch not in ('高雄館', '台中館', '桃園館', '林口館') then
    raise exception 'Invalid branch';
  end if;
  if p_scope not in ('clinic', 'platform') then
    raise exception 'Invalid recipient scope';
  end if;
  v_recipient_limit := case when p_scope = 'clinic' then 3 else 10 end;
  if coalesce(array_length(p_emails, 1), 0) > v_recipient_limit then
    raise exception 'Recipient limit exceeded';
  end if;

  update public.handoff_notification_recipients
  set is_active = false
  where tenant_id = p_tenant_id
    and branch = p_branch
    and recipient_scope = p_scope;

  foreach v_email in array coalesce(p_emails, array[]::text[])
  loop
    insert into public.handoff_notification_recipients (tenant_id, branch, recipient_scope, recipient_email, is_active)
    values (p_tenant_id, p_branch, p_scope, lower(trim(v_email)), true)
    on conflict (tenant_id, branch, recipient_scope, recipient_email)
    do update set is_active = true, updated_at = now();
  end loop;
end;
$$;

revoke all on function public.replace_handoff_notification_recipients(text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.replace_handoff_notification_recipients(text, text, text, text[]) to service_role;

commit;
