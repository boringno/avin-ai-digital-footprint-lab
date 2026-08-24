begin;

create or replace function public.admin_reset_canary_customer_state(
  p_tenant_id text,
  p_line_user_id text,
  p_actor_staff_id uuid,
  p_expected_runtime_updated_at timestamptz,
  p_fresh_state jsonb,
  p_fresh_context jsonb,
  p_fresh_booking_draft jsonb,
  p_reset_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_lead_reset boolean := false;
  v_conversation_id uuid;
  v_handoff_tasks_resolved integer := 0;
  v_previous_booking_status text;
  v_previous_lead_stage text;
  v_previous_lifecycle_status text;
  v_runtime_updated_at timestamptz;
  v_summary jsonb;
begin
  if coalesce(trim(p_tenant_id), '') = '' or coalesce(trim(p_line_user_id), '') = '' then
    raise exception 'tenant_id and line_user_id are required' using errcode = '22023';
  end if;

  select id, lead_stage
    into v_conversation_id, v_previous_lead_stage
    from public.conversations
   where tenant_id = p_tenant_id
     and line_user_id = p_line_user_id
   for update;
  if v_conversation_id is null then
    raise exception 'customer conversation was not found' using errcode = 'P0002';
  end if;

  select updated_at, state_json ->> 'status'
    into v_runtime_updated_at, v_previous_lifecycle_status
    from public.conversation_runtime_state
   where tenant_id = p_tenant_id
     and line_user_id = p_line_user_id
   for update;

  if found then
    if p_expected_runtime_updated_at is null or v_runtime_updated_at <> p_expected_runtime_updated_at then
      raise exception 'conversation changed while it was being reset' using errcode = '40001';
    end if;

    update public.conversation_runtime_state
       set booking_draft_json = p_fresh_booking_draft,
           context_json = p_fresh_context,
           is_soft_deleted = false,
           retention_expiry = p_reset_at + interval '180 days',
           soft_deleted_at = null,
           state_json = p_fresh_state
     where tenant_id = p_tenant_id
       and line_user_id = p_line_user_id;
  else
    if p_expected_runtime_updated_at is not null then
      raise exception 'conversation runtime state disappeared during reset' using errcode = '40001';
    end if;

    insert into public.conversation_runtime_state (
      booking_draft_json,
      context_json,
      is_soft_deleted,
      line_user_id,
      retention_expiry,
      soft_deleted_at,
      state_json,
      tenant_id
    ) values (
      p_fresh_booking_draft,
      p_fresh_context,
      false,
      p_line_user_id,
      p_reset_at + interval '180 days',
      null,
      p_fresh_state,
      p_tenant_id
    );
  end if;

  select booking_status
    into v_previous_booking_status
    from public.booking_leads_db
   where tenant_id = p_tenant_id
     and conversation_id = v_conversation_id
   for update;
  if found and v_previous_booking_status in ('new', 'contacted') then
    delete from public.booking_leads_db
     where tenant_id = p_tenant_id
       and conversation_id = v_conversation_id
       and booking_status in ('new', 'contacted');
    v_booking_lead_reset := true;
  end if;

  update public.handoff_tasks
     set resolved_at = p_reset_at,
         status = 'resolved'
   where tenant_id = p_tenant_id
     and conversation_id = v_conversation_id
     and status in ('open', 'taken');
  get diagnostics v_handoff_tasks_resolved = row_count;

  update public.conversations
     set lead_stage = 'new_inquiry'
   where tenant_id = p_tenant_id
     and id = v_conversation_id;

  v_summary := jsonb_build_object(
    'bookingLeadReset', v_booking_lead_reset,
    'conversationId', v_conversation_id,
    'handoffTasksResolved', v_handoff_tasks_resolved,
    'previousBookingStatus', v_previous_booking_status,
    'previousLeadStage', v_previous_lead_stage,
    'previousLifecycleStatus', v_previous_lifecycle_status,
    'runtimeReset', true
  );

  insert into public.audit_logs (
    action,
    actor_staff_id,
    after,
    before,
    target_id,
    target_table,
    tenant_id
  ) values (
    'conversation.reset_customer',
    p_actor_staff_id,
    v_summary,
    jsonb_build_object(
      'booking_status', v_previous_booking_status,
      'lead_stage', v_previous_lead_stage,
      'lifecycle_status', v_previous_lifecycle_status
    ),
    p_line_user_id,
    'conversation_runtime_state',
    p_tenant_id
  );

  return v_summary;
end;
$$;

revoke all on function public.admin_reset_canary_customer_state(
  text, text, uuid, timestamptz, jsonb, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.admin_reset_canary_customer_state(
  text, text, uuid, timestamptz, jsonb, jsonb, jsonb, timestamptz
) to service_role;

commit;
