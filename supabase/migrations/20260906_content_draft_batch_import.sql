begin;

create table if not exists public.content_draft_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  import_key text not null,
  request_hash text not null,
  source_label text not null,
  row_count integer not null check (row_count > 0 and row_count <= 100),
  status text not null default 'completed' check (status in ('completed')),
  results_json jsonb not null,
  created_by uuid not null references public.staff_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint content_draft_import_batches_tenant_key_unique unique (tenant_id, import_key),
  constraint content_draft_import_batches_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint content_draft_import_batches_results_check check (jsonb_typeof(results_json) = 'array')
);

create index if not exists idx_content_draft_import_batches_tenant_created
  on public.content_draft_import_batches (tenant_id, created_at desc);

alter table public.content_draft_import_batches enable row level security;
revoke all on table public.content_draft_import_batches from public, anon, authenticated;
grant select, insert on table public.content_draft_import_batches to service_role;

create or replace function public.create_content_draft_batch(
  p_tenant_id text,
  p_import_key text,
  p_source_label text,
  p_editor_id uuid,
  p_drafts jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_canonical_drafts jsonb;
  v_draft jsonb;
  v_existing public.content_draft_import_batches%rowtype;
  v_expected_latest integer;
  v_item_id uuid;
  v_latest_version integer;
  v_request_hash text;
  v_results jsonb := '[]'::jsonb;
  v_row_count integer;
  v_unique_count integer;
  v_version_id uuid;
  v_version_ids jsonb;
begin
  if p_tenant_id is null or btrim(p_tenant_id) = '' then
    raise exception using errcode = '22023', message = 'batch_tenant_required';
  end if;
  if p_import_key is null or p_import_key !~ '^[a-z0-9][a-z0-9_-]{1,119}$' then
    raise exception using errcode = '22023', message = 'batch_import_key_invalid';
  end if;
  if p_source_label is null or btrim(p_source_label) = '' or length(p_source_label) > 200 then
    raise exception using errcode = '22023', message = 'batch_source_label_invalid';
  end if;

  perform 1
  from public.staff_users
  where id = p_editor_id
    and tenant_id = p_tenant_id
    and is_active = true
    and role in ('owner', 'manager', 'maintainer')
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'batch_editor_not_authorized';
  end if;

  if p_drafts is null or jsonb_typeof(p_drafts) <> 'array' then
    raise exception using errcode = '22023', message = 'batch_drafts_must_be_array';
  end if;
  v_row_count := jsonb_array_length(p_drafts);
  if v_row_count < 1 or v_row_count > 100 then
    raise exception using errcode = '22023', message = 'batch_row_count_out_of_range';
  end if;

  select jsonb_agg(entry order by entry->>'content_type', entry->>'content_key')
  into v_canonical_drafts
  from jsonb_array_elements(p_drafts) as drafts(entry);

  if exists (
    select 1
    from jsonb_array_elements(v_canonical_drafts) as drafts(entry)
    where jsonb_typeof(entry) <> 'object'
      or entry->>'content_type' not in ('faq', 'campaign')
      or coalesce(entry->>'content_key', '') !~ '^[a-z0-9][a-z0-9_-]{1,79}$'
      or btrim(coalesce(entry->>'display_name', '')) = ''
      or btrim(coalesce(entry->>'change_reason', '')) = ''
      or jsonb_typeof(entry->'payload_json') <> 'object'
      or entry ?| array['status', 'reviewed_by', 'published_at', 'current_version_id', 'is_archived']
      or (entry->'payload_json') ?| array['status', 'reviewed_by', 'published_at', 'current_version_id', 'is_archived']
      or (
        entry ? 'expected_latest_version_no'
        and jsonb_typeof(entry->'expected_latest_version_no') not in ('number', 'null')
      )
      or (
        entry->>'expected_latest_version_no' is not null
        and entry->>'expected_latest_version_no' !~ '^[0-9]+$'
      )
  ) then
    raise exception using errcode = '22023', message = 'batch_draft_invalid';
  end if;

  select count(*)
  into v_unique_count
  from (
    select distinct entry->>'content_type' as content_type, entry->>'content_key' as content_key
    from jsonb_array_elements(v_canonical_drafts) as drafts(entry)
  ) unique_drafts;
  if v_unique_count <> v_row_count then
    raise exception using errcode = '22023', message = 'batch_duplicate_content_key';
  end if;

  -- Optimistic version expectations protect the first write but are not part
  -- of batch identity. After a successful import those versions naturally
  -- advance; excluding this field keeps an exact retry idempotent.
  select encode(digest(convert_to(
    jsonb_agg(entry - 'expected_latest_version_no' order by entry->>'content_type', entry->>'content_key')::text,
    'UTF8'
  ), 'sha256'), 'hex')
  into v_request_hash
  from jsonb_array_elements(v_canonical_drafts) as drafts(entry);
  perform pg_advisory_xact_lock(hashtext(p_tenant_id || ':content-draft-import:' || p_import_key));

  select * into v_existing
  from public.content_draft_import_batches
  where tenant_id = p_tenant_id and import_key = p_import_key;

  if found then
    if v_existing.request_hash <> v_request_hash
      or v_existing.row_count <> v_row_count
      or btrim(v_existing.source_label) <> btrim(p_source_label)
    then
      raise exception using errcode = '23505', message = 'batch_import_key_conflict';
    end if;
    select coalesce(jsonb_agg(entry->>'version_id'), '[]'::jsonb)
    into v_version_ids
    from jsonb_array_elements(v_existing.results_json) as results(entry);
    return jsonb_build_object(
      'batch_id', v_existing.id,
      'replayed', true,
      'request_hash', v_existing.request_hash,
      'row_count', v_existing.row_count,
      'version_ids', v_version_ids
    );
  end if;

  -- Acquire item locks in canonical order before checking optimistic version
  -- expectations. This prevents a concurrent single-draft request from
  -- appearing between preflight and the batch inserts.
  for v_draft in
    select entry from jsonb_array_elements(v_canonical_drafts) as drafts(entry)
  loop
    perform pg_advisory_xact_lock(hashtext(
      p_tenant_id || ':' || (v_draft->>'content_type') || ':' || (v_draft->>'content_key')
    ));
  end loop;

  for v_draft in
    select entry from jsonb_array_elements(v_canonical_drafts) as drafts(entry)
  loop
    v_item_id := null;
    v_latest_version := null;
    v_expected_latest := case
      when v_draft->>'expected_latest_version_no' is null then null
      else (v_draft->>'expected_latest_version_no')::integer
    end;

    select item.id, coalesce(max(version.version_no), 0)
    into v_item_id, v_latest_version
    from public.content_items item
    left join public.content_versions version on version.item_id = item.id
    where item.tenant_id = p_tenant_id
      and item.content_type = v_draft->>'content_type'
      and item.content_key = v_draft->>'content_key'
    group by item.id;

    if v_expected_latest is null and v_item_id is not null then
      raise exception using errcode = '23505', message = 'batch_content_key_conflict';
    end if;
    if v_expected_latest is not null and (v_item_id is null or v_latest_version <> v_expected_latest) then
      raise exception using errcode = '40001', message = 'batch_content_version_conflict';
    end if;
  end loop;

  v_batch_id := gen_random_uuid();
  for v_draft in
    select entry from jsonb_array_elements(v_canonical_drafts) as drafts(entry)
  loop
    v_version_id := public.create_content_draft(
      p_tenant_id,
      v_draft->>'content_type',
      v_draft->>'content_key',
      v_draft->>'display_name',
      v_draft->'payload_json',
      v_draft->>'change_reason',
      p_editor_id,
      (v_draft->>'start_at')::timestamptz,
      (v_draft->>'end_at')::timestamptz
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'content_key', v_draft->>'content_key',
      'content_type', v_draft->>'content_type',
      'display_name', v_draft->>'display_name',
      'version_id', v_version_id
    ));
  end loop;

  insert into public.content_draft_import_batches (
    id, tenant_id, import_key, request_hash, source_label, row_count, status,
    results_json, created_by
  ) values (
    v_batch_id, p_tenant_id, p_import_key, v_request_hash, btrim(p_source_label),
    v_row_count, 'completed', v_results, p_editor_id
  );

  insert into public.audit_logs (
    tenant_id, actor_staff_id, action, target_table, target_id, before, after
  )
  select
    p_tenant_id,
    p_editor_id,
    'content_version.draft_created',
    'content_versions',
    result->>'version_id',
    null,
    jsonb_build_object(
      'batch_id', v_batch_id,
      'content_key', result->>'content_key',
      'content_type', result->>'content_type',
      'display_name', result->>'display_name',
      'import_key', p_import_key
    )
  from jsonb_array_elements(v_results) as results(result);

  insert into public.audit_logs (
    tenant_id, actor_staff_id, action, target_table, target_id, before, after
  ) values (
    p_tenant_id,
    p_editor_id,
    'content_version.batch_draft_created',
    'content_draft_import_batches',
    v_batch_id::text,
    null,
    jsonb_build_object(
      'import_key', p_import_key,
      'request_hash', v_request_hash,
      'row_count', v_row_count,
      'source_label', btrim(p_source_label)
    )
  );

  select coalesce(jsonb_agg(entry->>'version_id'), '[]'::jsonb)
  into v_version_ids
  from jsonb_array_elements(v_results) as results(entry);

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'replayed', false,
    'request_hash', v_request_hash,
    'row_count', v_row_count,
    'version_ids', v_version_ids
  );
end;
$$;

revoke all on function public.create_content_draft_batch(text, text, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_content_draft_batch(text, text, text, uuid, jsonb)
  to service_role;

commit;
