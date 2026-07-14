begin;

create extension if not exists "pgcrypto";

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  content_type text not null check (content_type in ('faq', 'campaign', 'treatment_copy', 'handoff_rule')),
  content_key text not null,
  current_version_id uuid,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_items_tenant_type_key_unique unique (tenant_id, content_type, content_key)
);

create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  item_id uuid not null references public.content_items(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  payload_json jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'disabled', 'expired')),
  start_at timestamptz,
  end_at timestamptz,
  change_reason text not null,
  edited_by uuid not null references public.staff_users(id) on delete restrict,
  reviewed_by uuid references public.staff_users(id) on delete set null,
  published_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_versions_item_version_unique unique (item_id, version_no),
  constraint content_versions_time_range_check check (end_at is null or start_at is null or end_at > start_at)
);

alter table public.content_items
  drop constraint if exists content_items_current_version_id_fkey;
alter table public.content_items
  add constraint content_items_current_version_id_fkey
  foreign key (current_version_id) references public.content_versions(id) on delete set null;

create unique index if not exists idx_content_versions_one_published_per_item
  on public.content_versions (item_id)
  where status = 'published';
create index if not exists idx_content_items_tenant_type_archived
  on public.content_items (tenant_id, content_type, is_archived, updated_at desc);
create index if not exists idx_content_versions_tenant_item_version
  on public.content_versions (tenant_id, item_id, version_no desc);

drop trigger if exists trg_content_items_updated_at on public.content_items;
create trigger trg_content_items_updated_at before update on public.content_items
for each row execute function public.set_updated_at();
drop trigger if exists trg_content_versions_updated_at on public.content_versions;
create trigger trg_content_versions_updated_at before update on public.content_versions
for each row execute function public.set_updated_at();

-- Draft creation and publishing use database functions so version numbers and
-- the single published version invariant remain atomic under concurrent admins.
create or replace function public.create_content_draft(
  p_tenant_id text,
  p_content_type text,
  p_content_key text,
  p_payload_json jsonb,
  p_change_reason text,
  p_editor_id uuid,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null
) returns uuid
language plpgsql
as $$
declare
  v_item_id uuid;
  v_next_version integer;
  v_version_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_tenant_id || ':' || p_content_type || ':' || p_content_key));

  select id into v_item_id
  from public.content_items
  where tenant_id = p_tenant_id
    and content_type = p_content_type
    and content_key = p_content_key
  for update;

  if v_item_id is null then
    insert into public.content_items (tenant_id, content_type, content_key)
    values (p_tenant_id, p_content_type, p_content_key)
    returning id into v_item_id;
  end if;

  select coalesce(max(version_no), 0) + 1 into v_next_version
  from public.content_versions
  where item_id = v_item_id;

  insert into public.content_versions (
    tenant_id, item_id, version_no, payload_json, change_reason, edited_by, start_at, end_at
  ) values (
    p_tenant_id, v_item_id, v_next_version, p_payload_json, p_change_reason, p_editor_id, p_start_at, p_end_at
  ) returning id into v_version_id;

  return v_version_id;
end;
$$;

create or replace function public.publish_content_version(
  p_tenant_id text,
  p_version_id uuid,
  p_reviewer_id uuid
) returns void
language plpgsql
as $$
declare
  v_item_id uuid;
  v_status text;
begin
  select item_id, status into v_item_id, v_status
  from public.content_versions
  where id = p_version_id and tenant_id = p_tenant_id
  for update;

  if v_item_id is null then
    raise exception 'content version not found';
  end if;
  if v_status <> 'in_review' then
    raise exception 'only in-review content can be published';
  end if;

  perform 1 from public.content_items where id = v_item_id and tenant_id = p_tenant_id for update;
  if not found then
    raise exception 'content item not found';
  end if;

  update public.content_versions
  set status = 'disabled', disabled_at = now()
  where item_id = v_item_id and status = 'published';

  update public.content_versions
  set status = 'published', reviewed_by = p_reviewer_id, published_at = now()
  where id = p_version_id and tenant_id = p_tenant_id;

  update public.content_items
  set current_version_id = p_version_id, is_archived = false
  where id = v_item_id and tenant_id = p_tenant_id;
end;
$$;

create or replace function public.disable_content_version(
  p_tenant_id text,
  p_version_id uuid,
  p_reviewer_id uuid
) returns void
language plpgsql
as $$
declare
  v_item_id uuid;
begin
  select item_id into v_item_id
  from public.content_versions
  where id = p_version_id and tenant_id = p_tenant_id
  for update;

  if v_item_id is null then
    raise exception 'content version not found';
  end if;

  update public.content_versions
  set status = 'disabled', reviewed_by = p_reviewer_id, disabled_at = now()
  where id = p_version_id and tenant_id = p_tenant_id and status in ('draft', 'in_review', 'published');

  if not found then
    raise exception 'content version cannot be disabled';
  end if;

  update public.content_items
  set current_version_id = null
  where id = v_item_id and current_version_id = p_version_id;
end;
$$;

alter table public.content_items enable row level security;
alter table public.content_versions enable row level security;
revoke all on table public.content_items, public.content_versions from anon, authenticated;
revoke all on function public.create_content_draft(text, text, text, jsonb, text, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.publish_content_version(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.disable_content_version(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_content_draft(text, text, text, jsonb, text, uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.publish_content_version(text, uuid, uuid) to service_role;
grant execute on function public.disable_content_version(text, uuid, uuid) to service_role;

commit;
