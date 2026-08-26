begin;

-- Customer replies must not rebuild the active price release with three
-- independent REST reads. Persist the immutable release manifest beside the
-- active pointer so every serverless instance can recover the exact same
-- approved snapshot with one durable read.
alter table public.runtime_content_release_settings
  add column if not exists active_snapshot_json jsonb,
  add column if not exists active_snapshot_hash text;

create or replace function public.build_runtime_content_release_snapshot(
  p_tenant_id text,
  p_release_id uuid,
  p_rollout_percentage integer
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'release_id', r.id,
    'rollout_percentage', p_rollout_percentage,
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'content_key', e.content_key,
          'content_type', e.content_type,
          'payload_json', e.payload_json,
          'start_at', e.start_at,
          'end_at', e.end_at
        )
        order by e.content_type, e.content_key, e.id
      )
      from public.runtime_content_release_entries e
      where e.tenant_id = p_tenant_id
        and e.release_id = p_release_id
    ), '[]'::jsonb)
  )
  from public.runtime_content_releases r
  where r.id = p_release_id
    and r.tenant_id = p_tenant_id
    and r.status in ('ready', 'active');
$$;

-- Backfill the release already serving Production before enforcing the new
-- activation contract. A malformed historical pointer remains fail-closed.
with snapshots as (
  select
    s.tenant_id,
    public.build_runtime_content_release_snapshot(
      s.tenant_id,
      s.active_release_id,
      r.rollout_percentage
    ) as value
  from public.runtime_content_release_settings s
  join public.runtime_content_releases r
    on r.id = s.active_release_id
   and r.tenant_id = s.tenant_id
  where s.active_snapshot_json is null
)
update public.runtime_content_release_settings target
set active_snapshot_json = snapshots.value,
    active_snapshot_hash = md5(snapshots.value::text)
from snapshots
where target.tenant_id = snapshots.tenant_id
  and snapshots.value is not null;

alter table public.runtime_content_release_settings
  drop constraint if exists runtime_content_release_settings_active_snapshot_check;
alter table public.runtime_content_release_settings
  add constraint runtime_content_release_settings_active_snapshot_check
  check (
    (active_release_id is null and active_snapshot_json is null and active_snapshot_hash is null)
    or
    ((
      active_release_id is not null
      and active_snapshot_json is not null
      and active_snapshot_hash = md5(active_snapshot_json::text)
      and active_snapshot_json ->> 'release_id' = active_release_id::text
      and active_snapshot_json ->> 'schema_version' = '1'
      and jsonb_typeof(active_snapshot_json -> 'entries') = 'array'
    ) is true)
  ) not valid;

-- The new columns are introduced in this transaction, so every legitimate
-- active pointer must be backfilled before the consumer can be deployed. Make
-- migration success itself the release gate instead of accepting a deployment
-- that is safe but cannot quote any price.
alter table public.runtime_content_release_settings
  validate constraint runtime_content_release_settings_active_snapshot_check;

create or replace function public.activate_runtime_content_release(
  p_tenant_id text,
  p_release_id uuid,
  p_rollout_percentage integer,
  p_activated_by uuid
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
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

  v_snapshot := public.build_runtime_content_release_snapshot(
    p_tenant_id,
    p_release_id,
    p_rollout_percentage
  );
  if v_snapshot is null then
    raise exception 'runtime release snapshot could not be built';
  end if;

  insert into public.runtime_content_release_settings (
    tenant_id,
    active_release_id,
    active_snapshot_json,
    active_snapshot_hash,
    fallback_release_id,
    updated_by
  ) values (
    p_tenant_id,
    p_release_id,
    v_snapshot,
    md5(v_snapshot::text),
    null,
    p_activated_by
  )
  on conflict (tenant_id) do update
  set fallback_release_id = public.runtime_content_release_settings.active_release_id,
      active_release_id = excluded.active_release_id,
      active_snapshot_json = excluded.active_snapshot_json,
      active_snapshot_hash = excluded.active_snapshot_hash,
      updated_by = excluded.updated_by,
      updated_at = now();

  update public.runtime_content_releases
  set status = 'rolled_back', rollout_percentage = 0
  where tenant_id = p_tenant_id and status = 'active' and id <> p_release_id;

  update public.runtime_content_releases
  set status = 'active',
      rollout_percentage = p_rollout_percentage,
      activated_by = p_activated_by,
      activated_at = now(),
      rollback_reason = null
  where id = p_release_id and tenant_id = p_tenant_id;
end;
$$;

create or replace function public.rollback_runtime_content_release(
  p_tenant_id text,
  p_activated_by uuid,
  p_reason text default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_active_release_id uuid;
begin
  select active_release_id into v_active_release_id
  from public.runtime_content_release_settings
  where tenant_id = p_tenant_id
  for update;

  update public.runtime_content_release_settings
  set fallback_release_id = active_release_id,
      active_release_id = null,
      active_snapshot_json = null,
      active_snapshot_hash = null,
      updated_by = p_activated_by,
      updated_at = now()
  where tenant_id = p_tenant_id;

  if v_active_release_id is not null then
    update public.runtime_content_releases
    set status = 'rolled_back',
        rollout_percentage = 0,
        rollback_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = v_active_release_id and tenant_id = p_tenant_id;
  end if;
end;
$$;

revoke all on function public.build_runtime_content_release_snapshot(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.activate_runtime_content_release(text, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.rollback_runtime_content_release(text, uuid, text) from public, anon, authenticated;
grant execute on function public.build_runtime_content_release_snapshot(text, uuid, integer) to service_role;
grant execute on function public.activate_runtime_content_release(text, uuid, integer, uuid) to service_role;
grant execute on function public.rollback_runtime_content_release(text, uuid, text) to service_role;

commit;
