begin;

-- Monthly schedules now publish from the four branch images only. Existing
-- doctor_schedule rows remain available for a future structured-query upgrade.
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

revoke all on function public.publish_schedule_month(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_schedule_month(text, uuid, uuid) to service_role;

commit;
