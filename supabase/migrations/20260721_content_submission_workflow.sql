begin;

alter table public.content_items
  add column if not exists display_name text;

update public.content_items
set display_name = content_key
where display_name is null or btrim(display_name) = '';

alter table public.content_items
  alter column display_name set not null;

alter table public.content_versions
  add column if not exists review_note text;

alter table public.content_versions
  drop constraint if exists content_versions_status_check;
alter table public.content_versions
  add constraint content_versions_status_check
  check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'published', 'disabled', 'expired'));

create table if not exists public.content_submission_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  display_name text not null,
  submission_note text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'in_review', 'needs_changes', 'approved', 'rejected')),
  submitted_by uuid not null references public.staff_users(id) on delete restrict,
  reviewed_by uuid references public.staff_users(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_submission_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  submission_id uuid not null references public.content_submission_requests(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  created_at timestamptz not null default now(),
  unique (submission_id, storage_path)
);

create index if not exists idx_content_submission_requests_tenant_status_created
  on public.content_submission_requests (tenant_id, status, created_at desc);
create index if not exists idx_content_submission_attachments_tenant_submission
  on public.content_submission_attachments (tenant_id, submission_id);

drop trigger if exists trg_content_submission_requests_updated_at on public.content_submission_requests;
create trigger trg_content_submission_requests_updated_at
before update on public.content_submission_requests
for each row execute function public.set_updated_at();

create or replace function public.create_content_draft(
  p_tenant_id text,
  p_content_type text,
  p_content_key text,
  p_display_name text,
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
  where tenant_id = p_tenant_id and content_type = p_content_type and content_key = p_content_key
  for update;

  if v_item_id is null then
    insert into public.content_items (tenant_id, content_type, content_key, display_name)
    values (p_tenant_id, p_content_type, p_content_key, p_display_name)
    returning id into v_item_id;
  else
    update public.content_items
    set display_name = p_display_name
    where id = v_item_id and tenant_id = p_tenant_id;
  end if;

  select coalesce(max(version_no), 0) + 1 into v_next_version
  from public.content_versions where item_id = v_item_id;

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

  if v_item_id is null then raise exception 'content version not found'; end if;
  if v_status <> 'approved' then raise exception 'only engineering-approved content can be published'; end if;

  perform 1 from public.content_items where id = v_item_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'content item not found'; end if;

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

alter table public.content_submission_requests enable row level security;
alter table public.content_submission_attachments enable row level security;
revoke all on table public.content_submission_requests, public.content_submission_attachments from anon, authenticated;
revoke all on function public.create_content_draft(text, text, text, text, jsonb, text, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.create_content_draft(text, text, text, text, jsonb, text, uuid, timestamptz, timestamptz) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-submissions', 'content-submissions', false, 10485760,
  array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

commit;
