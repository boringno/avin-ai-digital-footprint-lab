begin;

alter table public.doctor_schedule
  add column if not exists tenant_id text not null default 'tenant_001';

alter table public.schedule_publish_status
  add column if not exists tenant_id text not null default 'tenant_001';

alter table public.schedule_publish_status
  drop constraint if exists schedule_publish_status_pkey;

alter table public.schedule_publish_status
  add primary key (tenant_id, source_month);

create table if not exists public.schedule_month_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  source_month text not null check (source_month ~ '^[0-9]{4}-[0-9]{2}$'),
  version_no integer not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'disabled')),
  change_reason text not null,
  created_by uuid references public.staff_users(id) on delete set null,
  published_by uuid references public.staff_users(id) on delete set null,
  published_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_month, version_no)
);

alter table public.doctor_schedule
  add column if not exists version_id uuid references public.schedule_month_versions(id) on delete cascade;

alter table public.schedule_publish_status
  add column if not exists published_version_id uuid references public.schedule_month_versions(id) on delete set null;

create table if not exists public.schedule_month_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  version_id uuid not null references public.schedule_month_versions(id) on delete cascade,
  branch text not null check (branch in ('高雄館', '台中館', '桃園館', '林口館')),
  original_path text not null,
  preview_path text not null,
  original_content_url text not null,
  preview_image_url text not null,
  original_bytes integer not null check (original_bytes > 0 and original_bytes <= 10485760),
  preview_bytes integer not null check (preview_bytes > 0 and preview_bytes <= 1048576),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  created_at timestamptz not null default now(),
  unique (version_id, branch)
);

create index if not exists idx_doctor_schedule_runtime_month
  on public.doctor_schedule (tenant_id, source_month, version_id, doctor_name, schedule_date);
create index if not exists idx_schedule_month_versions_lookup
  on public.schedule_month_versions (tenant_id, source_month, status, version_no desc);
create unique index if not exists idx_schedule_month_versions_one_published
  on public.schedule_month_versions (tenant_id, source_month) where status = 'published';

drop trigger if exists trg_schedule_month_versions_updated_at on public.schedule_month_versions;
create trigger trg_schedule_month_versions_updated_at
before update on public.schedule_month_versions
for each row execute function public.set_updated_at();

create or replace function public.publish_schedule_month(
  p_tenant_id text,
  p_version_id uuid,
  p_publisher_id uuid
) returns void
language plpgsql
as $$
declare
  v_source_month text;
  v_asset_count integer;
  v_branch_count integer;
  v_row_count integer;
  v_schedule_branch_count integer;
begin
  select source_month into v_source_month
  from public.schedule_month_versions
  where id = p_version_id and tenant_id = p_tenant_id and status = 'draft'
  for update;

  if v_source_month is null then
    raise exception 'schedule month draft not found';
  end if;

  select count(*), count(distinct branch) into v_asset_count, v_branch_count
  from public.schedule_month_assets
  where version_id = p_version_id and tenant_id = p_tenant_id;

  if v_asset_count <> 4 or v_branch_count <> 4 then
    raise exception 'all four branch schedule images are required';
  end if;

  select count(*), count(distinct branch) into v_row_count, v_schedule_branch_count
  from public.doctor_schedule
  where tenant_id = p_tenant_id and version_id = p_version_id and source_month = v_source_month;

  if v_row_count = 0 or v_schedule_branch_count <> 4 then
    raise exception 'schedule CSV rows for all four branches are required';
  end if;

  update public.schedule_month_versions
  set status = 'disabled', disabled_at = now()
  where tenant_id = p_tenant_id and source_month = v_source_month and status = 'published';

  update public.schedule_month_versions
  set status = 'published', published_at = now(), published_by = p_publisher_id
  where id = p_version_id and tenant_id = p_tenant_id and status = 'draft';

  insert into public.schedule_publish_status (tenant_id, source_month, published, published_at, published_version_id, notes)
  values (p_tenant_id, v_source_month, true, now(), p_version_id, '')
  on conflict (tenant_id, source_month) do update
  set published = true, published_at = excluded.published_at, published_version_id = excluded.published_version_id;
end;
$$;

create or replace function public.disable_schedule_month(
  p_tenant_id text,
  p_version_id uuid,
  p_publisher_id uuid
) returns void
language plpgsql
as $$
declare
  v_source_month text;
begin
  select source_month into v_source_month
  from public.schedule_month_versions
  where id = p_version_id and tenant_id = p_tenant_id and status in ('draft', 'published')
  for update;

  if v_source_month is null then
    raise exception 'schedule month version cannot be disabled';
  end if;

  update public.schedule_month_versions
  set status = 'disabled', disabled_at = now()
  where id = p_version_id and tenant_id = p_tenant_id;

  update public.schedule_publish_status
  set published = false, published_version_id = null
  where tenant_id = p_tenant_id and source_month = v_source_month and published_version_id = p_version_id;
end;
$$;

alter table public.schedule_month_versions enable row level security;
alter table public.schedule_month_assets enable row level security;
alter table public.doctor_schedule enable row level security;
alter table public.schedule_publish_status enable row level security;
revoke all on table public.schedule_month_versions, public.schedule_month_assets, public.doctor_schedule, public.schedule_publish_status from anon, authenticated;
revoke all on function public.publish_schedule_month(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.disable_schedule_month(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_schedule_month(text, uuid, uuid) to service_role;
grant execute on function public.disable_schedule_month(text, uuid, uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('schedule-assets', 'schedule-assets', true, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read schedule assets" on storage.objects;
create policy "public read schedule assets"
on storage.objects for select
using (bucket_id = 'schedule-assets');

commit;
