begin;

-- Runtime releases are immutable snapshots of approved FAQ/campaign content.
-- The LINE router keeps the seed data as a safety baseline and only overlays
-- entries from the selected release.
create table if not exists public.runtime_content_releases (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  release_name text not null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'active', 'rolled_back', 'archived')),
  rollout_percentage integer not null default 0 check (rollout_percentage between 0 and 100),
  created_by uuid not null references public.staff_users(id) on delete restrict,
  activated_by uuid references public.staff_users(id) on delete set null,
  activated_at timestamptz,
  rollback_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint runtime_content_releases_tenant_name_unique unique (tenant_id, release_name)
);

create table if not exists public.runtime_content_release_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  release_id uuid not null references public.runtime_content_releases(id) on delete cascade,
  content_version_id uuid not null references public.content_versions(id) on delete restrict,
  content_type text not null check (content_type in ('faq', 'campaign')),
  content_key text not null,
  payload_json jsonb not null,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  constraint runtime_content_release_entries_release_version_unique unique (release_id, content_version_id)
);

create table if not exists public.runtime_content_release_settings (
  tenant_id text primary key default 'tenant_001',
  active_release_id uuid references public.runtime_content_releases(id) on delete set null,
  fallback_release_id uuid references public.runtime_content_releases(id) on delete set null,
  updated_by uuid references public.staff_users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.runtime_release_regression_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  case_key text not null,
  customer_message text not null,
  expected_decision_type text not null,
  expected_reply_contains text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint runtime_release_regression_cases_tenant_key_unique unique (tenant_id, case_key)
);

create index if not exists idx_runtime_content_releases_tenant_status
  on public.runtime_content_releases (tenant_id, status, created_at desc);
create index if not exists idx_runtime_content_release_entries_release
  on public.runtime_content_release_entries (release_id, content_type, content_key);
create index if not exists idx_runtime_release_regression_cases_active
  on public.runtime_release_regression_cases (tenant_id, is_active, case_key);

drop trigger if exists trg_runtime_content_releases_updated_at on public.runtime_content_releases;
create trigger trg_runtime_content_releases_updated_at before update on public.runtime_content_releases
for each row execute function public.set_updated_at();
drop trigger if exists trg_runtime_content_release_settings_updated_at on public.runtime_content_release_settings;
create trigger trg_runtime_content_release_settings_updated_at before update on public.runtime_content_release_settings
for each row execute function public.set_updated_at();
drop trigger if exists trg_runtime_release_regression_cases_updated_at on public.runtime_release_regression_cases;
create trigger trg_runtime_release_regression_cases_updated_at before update on public.runtime_release_regression_cases
for each row execute function public.set_updated_at();

-- Snapshot only versions that have already passed the existing review/publish flow.
create or replace function public.create_runtime_content_release(
  p_tenant_id text,
  p_release_name text,
  p_created_by uuid
) returns uuid
language plpgsql
as $$
declare
  v_release_id uuid;
  v_entry_count integer;
begin
  insert into public.runtime_content_releases (tenant_id, release_name, created_by)
  values (p_tenant_id, trim(p_release_name), p_created_by)
  returning id into v_release_id;

  insert into public.runtime_content_release_entries (
    tenant_id, release_id, content_version_id, content_type, content_key, payload_json, start_at, end_at
  )
  select v.tenant_id, v_release_id, v.id, i.content_type, i.content_key, v.payload_json, v.start_at, v.end_at
  from public.content_versions v
  join public.content_items i on i.id = v.item_id
  where v.tenant_id = p_tenant_id
    and i.tenant_id = p_tenant_id
    and i.content_type in ('faq', 'campaign')
    and v.status = 'published';

  get diagnostics v_entry_count = row_count;
  if v_entry_count = 0 then
    delete from public.runtime_content_releases where id = v_release_id;
    raise exception 'no published FAQ or campaign content is available for a runtime release';
  end if;

  update public.runtime_content_releases set status = 'ready' where id = v_release_id;
  return v_release_id;
end;
$$;

-- Selecting a release is atomic. A rollback simply clears active_release_id,
-- immediately returning all callers to the seed baseline.
create or replace function public.activate_runtime_content_release(
  p_tenant_id text,
  p_release_id uuid,
  p_rollout_percentage integer,
  p_activated_by uuid
) returns void
language plpgsql
as $$
begin
  if p_rollout_percentage < 1 or p_rollout_percentage > 100 then
    raise exception 'rollout percentage must be between 1 and 100';
  end if;

  perform 1 from public.runtime_content_releases
  where id = p_release_id and tenant_id = p_tenant_id and status in ('ready', 'active')
  for update;
  if not found then
    raise exception 'runtime release is not ready';
  end if;

  insert into public.runtime_content_release_settings (tenant_id, active_release_id, fallback_release_id, updated_by)
  values (p_tenant_id, p_release_id, null, p_activated_by)
  on conflict (tenant_id) do update
  set fallback_release_id = public.runtime_content_release_settings.active_release_id,
      active_release_id = excluded.active_release_id,
      updated_by = excluded.updated_by,
      updated_at = now();

  update public.runtime_content_releases
  set status = 'rolled_back', rollout_percentage = 0
  where tenant_id = p_tenant_id and status = 'active' and id <> p_release_id;

  update public.runtime_content_releases
  set status = 'active', rollout_percentage = p_rollout_percentage, activated_by = p_activated_by, activated_at = now(), rollback_reason = null
  where id = p_release_id and tenant_id = p_tenant_id;
end;
$$;

create or replace function public.rollback_runtime_content_release(
  p_tenant_id text,
  p_activated_by uuid,
  p_reason text default null
) returns void
language plpgsql
as $$
declare
  v_active_release_id uuid;
begin
  select active_release_id into v_active_release_id
  from public.runtime_content_release_settings
  where tenant_id = p_tenant_id
  for update;

  update public.runtime_content_release_settings
  set fallback_release_id = active_release_id, active_release_id = null, updated_by = p_activated_by, updated_at = now()
  where tenant_id = p_tenant_id;

  if v_active_release_id is not null then
    update public.runtime_content_releases
    set status = 'rolled_back', rollout_percentage = 0, rollback_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = v_active_release_id and tenant_id = p_tenant_id;
  end if;
end;
$$;

alter table public.runtime_content_releases enable row level security;
alter table public.runtime_content_release_entries enable row level security;
alter table public.runtime_content_release_settings enable row level security;
alter table public.runtime_release_regression_cases enable row level security;
revoke all on table public.runtime_content_releases, public.runtime_content_release_entries, public.runtime_content_release_settings, public.runtime_release_regression_cases from anon, authenticated;
revoke all on function public.create_runtime_content_release(text, text, uuid) from public, anon, authenticated;
revoke all on function public.activate_runtime_content_release(text, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.rollback_runtime_content_release(text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_runtime_content_release(text, text, uuid) to service_role;
grant execute on function public.activate_runtime_content_release(text, uuid, integer, uuid) to service_role;
grant execute on function public.rollback_runtime_content_release(text, uuid, text) to service_role;

-- These cases protect the safety-routing contracts when a content release is
-- tested. Clinics may add business-specific cases later, but these cannot be
-- replaced by a content payload.
insert into public.runtime_release_regression_cases (
  tenant_id, case_key, customer_message, expected_decision_type, expected_reply_contains
) values
  ('tenant_001', 'safety-pregnancy-booking', '我懷孕了想預約肉毒', 'medical_guidance_reply', '懷孕'),
  ('tenant_001', 'safety-post-treatment', '術後紅腫又疼痛怎麼辦', 'handoff_pending', '真人客服'),
  ('tenant_001', 'safety-human-request', '我想找真人客服', 'handoff_pending', '真人客服'),
  ('tenant_001', 'booking-intake', '我想預約肉毒', 'booking_intake_reply', '館別'),
  ('tenant_001', 'clinic-address', '高雄館地址在哪裡', 'clinic_info_reply', '高雄')
on conflict (tenant_id, case_key) do update
set customer_message = excluded.customer_message,
    expected_decision_type = excluded.expected_decision_type,
    expected_reply_contains = excluded.expected_reply_contains,
    updated_at = now();

commit;
