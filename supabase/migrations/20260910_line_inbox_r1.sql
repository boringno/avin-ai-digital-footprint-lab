begin;

-- R1 FOUNDATION ONLY. No production webhook caller, dispatcher or R2 writes.
-- Provision this mapping from server-owned channel configuration, never from a webhook.
create table public.line_inbox_channels (
  channel_ref text primary key check (length(btrim(channel_ref)) > 0),
  -- Existing conversation/message identity is tenant scoped: one channel per tenant in R1.
  tenant_id text not null unique check (length(btrim(tenant_id)) > 0),
  destination text not null unique check (length(btrim(destination)) > 0),
  unique (tenant_id, channel_ref)
);

create table public.line_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  channel_ref text not null,
  provider text not null default 'line' check (provider = 'line'),
  provider_event_id text not null check (length(btrim(provider_event_id)) > 0),
  event_type text not null,
  line_message_id text,
  source_type text not null check (source_type in ('user','group','room')),
  source_id text not null,
  provider_timestamp_ms bigint not null check (provider_timestamp_ms > 0),
  admission_sequence bigint generated always as identity,
  input_json jsonb,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  phase text not null default 'received' check (phase in ('received','processing','decision_committed','completed','incident')),
  decision_id uuid not null default gen_random_uuid(),
  decision_committed_at timestamptz,
  committed_effect_at timestamptz,
  claim_generation bigint not null default 0 check (claim_generation >= 0),
  processing_attempt_count integer not null default 0 check (processing_attempt_count >= 0),
  lease_owner uuid,
  lease_expires_at timestamptz,
  customer_message_id uuid,
  receipt_count integer not null default 1 check (receipt_count > 0),
  redelivery_count integer not null default 0 check (redelivery_count >= 0),
  first_received_at timestamptz not null default clock_timestamp(),
  last_received_at timestamptz not null default clock_timestamp(),
  last_error_code text,
  input_retention_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  input_purged_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id,channel_ref) references public.line_inbox_channels(tenant_id,channel_ref),
  unique (tenant_id,channel_ref,provider,provider_event_id),
  unique (tenant_id,id),
  unique (decision_id),
  check ((lease_owner is null) = (lease_expires_at is null)),
  check ((input_json is not null and input_purged_at is null) or
    (input_json is null and input_purged_at is not null and phase = 'completed'))
);
-- Message identity applies only to the original message event, not quote/edit references.
create unique index line_inbox_message_identity on public.line_webhook_inbox
  (tenant_id,channel_ref,line_message_id) where event_type = 'message' and line_message_id is not null;
create index line_inbox_recovery on public.line_webhook_inbox(phase,lease_expires_at)
  where phase in ('received','processing');
create index line_inbox_source_order on public.line_webhook_inbox
  (tenant_id,channel_ref,source_type,source_id,admission_sequence);

create table public.line_conversation_processing_slots (
  tenant_id text not null,
  channel_ref text not null,
  source_type text not null,
  source_id text not null,
  inbox_id uuid,
  generation bigint,
  lease_owner uuid,
  lease_expires_at timestamptz,
  primary key (tenant_id,channel_ref,source_type,source_id),
  foreign key (tenant_id,channel_ref) references public.line_inbox_channels(tenant_id,channel_ref),
  foreign key (tenant_id,inbox_id) references public.line_webhook_inbox(tenant_id,id),
  check ((inbox_id is null and generation is null and lease_owner is null and lease_expires_at is null) or
    (inbox_id is not null and generation is not null and lease_owner is not null and lease_expires_at is not null))
);

-- Retained identity is a tombstone. There is deliberately no DELETE grant or cleanup job.
create function public.line_inbox_immutable_guard() returns trigger language plpgsql
set search_path = pg_catalog, public as $$
begin
  if row(new.id,new.tenant_id,new.channel_ref,new.provider,new.provider_event_id,new.event_type,
    new.line_message_id,new.source_type,new.source_id,new.provider_timestamp_ms,new.admission_sequence,
    new.input_hash,new.decision_id) is distinct from
    row(old.id,old.tenant_id,old.channel_ref,old.provider,old.provider_event_id,old.event_type,
    old.line_message_id,old.source_type,old.source_id,old.provider_timestamp_ms,old.admission_sequence,
    old.input_hash,old.decision_id) then raise exception 'R1_IDENTITY_IMMUTABLE'; end if;
  if new.input_json is distinct from old.input_json and not
    (old.input_json is not null and new.input_json is null and new.phase = 'completed'
      and new.input_purged_at is not null and old.input_retention_at <= clock_timestamp()) then
    raise exception 'R1_INPUT_IMMUTABLE';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger line_inbox_immutable before update on public.line_webhook_inbox
for each row execute function public.line_inbox_immutable_guard();

create function public.line_inbox_admit(p_channel_ref text, p_input jsonb, p_redelivery boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare c public.line_inbox_channels%rowtype; r public.line_webhook_inbox%rowtype; h text;
begin
  select * into strict c from public.line_inbox_channels where channel_ref = p_channel_ref;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or
    p_input->>'schemaVersion' is distinct from '1' or p_input->>'destination' is distinct from c.destination or
    coalesce(p_input->>'eventId','') = '' or coalesce(p_input->>'eventType','') = '' or
    coalesce(p_input#>>'{source,id}','') = '' or coalesce(p_input#>>'{source,type}','') not in ('user','group','room') or
    coalesce(p_input->>'timestamp','') !~ '^[0-9]+$' or octet_length(p_input::text) > 65536 or
    jsonb_typeof(p_input->'schemaVersion') is distinct from 'number' or
    jsonb_typeof(p_input->'timestamp') is distinct from 'number' or
    jsonb_typeof(p_input->'eventId') is distinct from 'string' or
    jsonb_typeof(p_input->'eventType') is distinct from 'string' or
    (p_input ? 'mode' and jsonb_typeof(p_input->'mode') is distinct from 'string') or
    (p_input - array['schemaVersion','destination','eventId','eventType','timestamp','source','message','postback','mode']) <> '{}'::jsonb or
    jsonb_typeof(p_input->'source') is distinct from 'object' or
    ((p_input->'source') - array['type','id','userId']) <> '{}'::jsonb or
    exists (select 1 from jsonb_each(p_input->'source') where jsonb_typeof(value)<>'string') or
    (p_input ? 'message' and (jsonb_typeof(p_input->'message') is distinct from 'object' or
      exists (select 1 from jsonb_each(p_input->'message') where jsonb_typeof(value)<>'string') or
      ((p_input->'message') - array['id','type','text','quotedMessageId']) <> '{}'::jsonb)) or
    (p_input->>'eventType' = 'message' and (coalesce(p_input#>>'{message,id}','')='' or
      coalesce(p_input#>>'{message,type}','')='' or
      (p_input#>>'{message,type}'='text' and jsonb_typeof(p_input#>'{message,text}') is distinct from 'string'))) or
    (p_input->>'eventType' = 'postback' and coalesce(p_input#>>'{postback,data}','') = '') or
    (p_input ? 'postback' and (jsonb_typeof(p_input->'postback') is distinct from 'object' or
      jsonb_typeof(p_input#>'{postback,data}') is distinct from 'string' or
      ((p_input->'postback') - array['data','params']) <> '{}'::jsonb or
      (p_input#>'{postback,params}' is not null and (jsonb_typeof(p_input#>'{postback,params}') is distinct from 'object' or
        exists (select 1 from jsonb_each(p_input#>'{postback,params}') where jsonb_typeof(value)<>'string') or
        ((p_input#>'{postback,params}') - array['date','time','datetime']) <> '{}'::jsonb)))) then
    raise exception 'R1_INVALID_INPUT';
  end if;
  h := encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  -- Assign admission sequence while holding the same slot used by claim. An uncommitted
  -- earlier admission cannot become invisible to a later event's processing claim.
  insert into public.line_conversation_processing_slots(tenant_id,channel_ref,source_type,source_id)
    values(c.tenant_id,c.channel_ref,p_input#>>'{source,type}',p_input#>>'{source,id}') on conflict do nothing;
  perform 1 from public.line_conversation_processing_slots where tenant_id=c.tenant_id
    and channel_ref=c.channel_ref and source_type=p_input#>>'{source,type}' and source_id=p_input#>>'{source,id}' for update;
  insert into public.line_webhook_inbox(tenant_id,channel_ref,provider_event_id,event_type,line_message_id,
    source_type,source_id,provider_timestamp_ms,input_json,input_hash,redelivery_count)
  values(c.tenant_id,c.channel_ref,p_input->>'eventId',p_input->>'eventType',nullif(p_input#>>'{message,id}',''),
    p_input#>>'{source,type}',p_input#>>'{source,id}',(p_input->>'timestamp')::bigint,p_input,h,
    case when p_redelivery then 1 else 0 end)
  on conflict do nothing returning * into r;
  if found then
    return jsonb_build_object('disposition','NEW_EVENT','inboxId',r.id,'tenantId',r.tenant_id,'inputHash',r.input_hash,'decisionId',r.decision_id);
  end if;
  -- Inspect exact identity after ON CONFLICT; never treat arbitrary 23505 as a duplicate.
  select * into r from public.line_webhook_inbox where tenant_id=c.tenant_id and channel_ref=c.channel_ref
    and provider='line' and provider_event_id=p_input->>'eventId' for update;
  if not found then
    update public.line_webhook_inbox set last_error_code='SECONDARY_MESSAGE_IDENTITY',
      phase=case when input_json is null then phase else 'incident' end,lease_owner=null,lease_expires_at=null
      where tenant_id=c.tenant_id and channel_ref=c.channel_ref and event_type='message'
        and line_message_id=p_input#>>'{message,id}';
    return jsonb_build_object('disposition','IDENTITY_CONFLICT','reason','SECONDARY_MESSAGE_IDENTITY');
  end if;
  if r.input_hash <> h then
    update public.line_webhook_inbox set phase=case when input_json is null then phase else 'incident' end,last_error_code='IMMUTABLE_INPUT_CONFLICT',
      lease_owner=null,lease_expires_at=null where id=r.id;
    return jsonb_build_object('disposition','IDENTITY_CONFLICT','reason','IMMUTABLE_INPUT_CONFLICT');
  end if;
  update public.line_webhook_inbox set receipt_count=receipt_count+1,
    redelivery_count=redelivery_count+case when p_redelivery then 1 else 0 end,
    last_received_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('disposition','EXISTING_EVENT','inboxId',r.id,'tenantId',r.tenant_id,'inputHash',r.input_hash,'decisionId',r.decision_id);
end $$;

create function public.line_inbox_claim(p_tenant text,p_inbox uuid,p_hash text,p_owner uuid,p_lease_seconds integer default 30)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.line_webhook_inbox%rowtype; s public.line_conversation_processing_slots%rowtype; expiry timestamptz;
begin
  if p_owner is null or p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 120 then raise exception 'R1_INVALID_LEASE'; end if;
  select * into strict r from public.line_webhook_inbox where tenant_id=p_tenant and id=p_inbox;
  insert into public.line_conversation_processing_slots(tenant_id,channel_ref,source_type,source_id)
    values(r.tenant_id,r.channel_ref,r.source_type,r.source_id) on conflict do nothing;
  -- All RPCs lock slot then inbox.
  select * into strict s from public.line_conversation_processing_slots where tenant_id=r.tenant_id
    and channel_ref=r.channel_ref and source_type=r.source_type and source_id=r.source_id for update;
  select * into strict r from public.line_webhook_inbox where tenant_id=p_tenant and id=p_inbox for update;
  if r.input_hash is distinct from p_hash or r.phase='incident'
    or r.last_error_code in ('IMMUTABLE_INPUT_CONFLICT','SECONDARY_MESSAGE_IDENTITY') then
    return jsonb_build_object('disposition','INCIDENT');
  end if;
  if r.phase='completed' then return jsonb_build_object('disposition','DUPLICATE_COMPLETED'); end if;
  if r.phase='decision_committed' or r.decision_committed_at is not null or r.committed_effect_at is not null then
    return jsonb_build_object('disposition','RECOVERY_REQUIRED','decisionId',r.decision_id);
  end if;
  if r.input_json is null or r.phase not in ('received','processing') then return jsonb_build_object('disposition','INCIDENT'); end if;
  if r.lease_expires_at > clock_timestamp() then return jsonb_build_object('disposition','DUPLICATE_ALREADY_OWNED'); end if;
  if s.inbox_id is not null and s.inbox_id <> r.id then
    -- Expiry does not permit B to skip crashed/unresolved A.
    perform 1 from public.line_webhook_inbox where id=s.inbox_id and phase<>'completed';
    if found then return jsonb_build_object('disposition','CONVERSATION_BUSY'); end if;
  end if;
  perform 1 from public.line_webhook_inbox where tenant_id=r.tenant_id and channel_ref=r.channel_ref
    and source_type=r.source_type and source_id=r.source_id and admission_sequence<r.admission_sequence and phase<>'completed';
  if found then return jsonb_build_object('disposition','CONVERSATION_BUSY'); end if;
  expiry := clock_timestamp()+make_interval(secs=>p_lease_seconds);
  update public.line_webhook_inbox set phase='processing',claim_generation=claim_generation+1,
    processing_attempt_count=processing_attempt_count+1,lease_owner=p_owner,lease_expires_at=expiry
    where id=r.id returning * into r;
  update public.line_conversation_processing_slots set inbox_id=r.id,generation=r.claim_generation,
    lease_owner=p_owner,lease_expires_at=expiry where tenant_id=r.tenant_id and channel_ref=r.channel_ref
    and source_type=r.source_type and source_id=r.source_id;
  return jsonb_build_object('disposition','CLAIM_GRANTED','inboxId',r.id,'generation',r.claim_generation,
    'owner',p_owner,'leaseExpiresAt',expiry,'processingAttempt',r.processing_attempt_count,'decisionId',r.decision_id);
end $$;

-- Internal transaction guard. Future R2/R3 RPCs must call INSIDE the effect transaction.
-- An application-side check followed by another RPC is NOT a fenced commit.
create function public.line_inbox_assert_fence(p_tenant text,p_inbox uuid,p_generation bigint,p_owner uuid)
returns void language plpgsql set search_path = pg_catalog, public as $$
declare r public.line_webhook_inbox%rowtype; s public.line_conversation_processing_slots%rowtype;
begin
  select * into strict r from public.line_webhook_inbox where tenant_id=p_tenant and id=p_inbox;
  select * into strict s from public.line_conversation_processing_slots where tenant_id=r.tenant_id
    and channel_ref=r.channel_ref and source_type=r.source_type and source_id=r.source_id for update;
  select * into strict r from public.line_webhook_inbox where tenant_id=p_tenant and id=p_inbox for update;
  if r.phase <> 'processing' or r.claim_generation is distinct from p_generation or r.lease_owner is distinct from p_owner
    or r.lease_expires_at is null or r.lease_expires_at <= clock_timestamp()
    or s.inbox_id is distinct from r.id or s.generation is distinct from p_generation or s.lease_owner is distinct from p_owner
    or s.lease_expires_at is null or s.lease_expires_at <= clock_timestamp()
    or r.decision_committed_at is not null or r.committed_effect_at is not null then raise exception 'R1_STALE_FENCE'; end if;
end $$;

create function public.line_inbox_renew(p_tenant text,p_inbox uuid,p_generation bigint,p_owner uuid,p_lease_seconds integer default 30)
returns timestamptz language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.line_webhook_inbox%rowtype; expiry timestamptz;
begin
  if p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 120 then raise exception 'R1_INVALID_LEASE'; end if;
  perform public.line_inbox_assert_fence(p_tenant,p_inbox,p_generation,p_owner);
  expiry := clock_timestamp()+make_interval(secs=>p_lease_seconds);
  update public.line_webhook_inbox set lease_expires_at=expiry where id=p_inbox returning * into r;
  update public.line_conversation_processing_slots set lease_expires_at=expiry where tenant_id=r.tenant_id
    and channel_ref=r.channel_ref and source_type=r.source_type and source_id=r.source_id;
  return expiry;
end $$;

create function public.line_inbox_persist_customer(p_tenant text,p_inbox uuid,p_generation bigint,p_owner uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare r public.line_webhook_inbox%rowtype; conv uuid; msg uuid; old_msg public.conversation_messages%rowtype; text_value text;
begin
  perform public.line_inbox_assert_fence(p_tenant,p_inbox,p_generation,p_owner);
  select * into strict r from public.line_webhook_inbox where tenant_id=p_tenant and id=p_inbox;
  if r.source_type <> 'user' or r.event_type <> 'message' or r.input_json#>>'{message,type}' is distinct from 'text' then
    raise exception 'R1_CUSTOMER_PERSIST_UNSUPPORTED'; end if;
  if r.customer_message_id is not null then return r.customer_message_id; end if;
  text_value := r.input_json#>>'{message,text}';
  if text_value is null then raise exception 'R1_CUSTOMER_TEXT_REQUIRED'; end if;
  insert into public.conversations(tenant_id,line_user_id) values(p_tenant,r.source_id)
    on conflict (tenant_id,line_user_id) do nothing;
  select id into strict conv from public.conversations where tenant_id=p_tenant and line_user_id=r.source_id;
  -- Reuse the existing unique source_event_id contract so later Admin sync can dedupe.
  insert into public.conversation_messages(tenant_id,conversation_id,direction,message_type,content,source_event_id,line_message_id,payload_json)
    values(p_tenant,conv,'customer','text',text_value,r.provider_event_id,r.line_message_id,jsonb_build_object('inbox_id',r.id))
    on conflict (tenant_id,source_event_id) where source_event_id is not null do nothing returning id into msg;
  if msg is null then
    select * into strict old_msg from public.conversation_messages where tenant_id=p_tenant and source_event_id=r.provider_event_id;
    if old_msg.conversation_id<>conv or old_msg.direction<>'customer' or old_msg.message_type<>'text'
      or old_msg.content<>text_value or old_msg.line_message_id is distinct from r.line_message_id then
      raise exception 'R1_CUSTOMER_MESSAGE_CONFLICT'; end if;
    msg := old_msg.id;
  end if;
  update public.line_webhook_inbox set customer_message_id=msg where id=r.id;
  return msg;
end $$;

alter table public.line_inbox_channels enable row level security;
alter table public.line_webhook_inbox enable row level security;
alter table public.line_conversation_processing_slots enable row level security;
revoke all on public.line_inbox_channels,public.line_webhook_inbox,public.line_conversation_processing_slots from public,anon,authenticated,service_role;
grant select,insert on public.line_inbox_channels to service_role;
grant select on public.line_webhook_inbox,public.line_conversation_processing_slots to service_role;
-- No browser policies; service-role RPCs are the only ledger write boundary.
revoke all on function public.line_inbox_immutable_guard(),public.line_inbox_assert_fence(text,uuid,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function public.line_inbox_admit(text,jsonb,boolean),public.line_inbox_claim(text,uuid,text,uuid,integer),
  public.line_inbox_renew(text,uuid,bigint,uuid,integer),public.line_inbox_persist_customer(text,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.line_inbox_admit(text,jsonb,boolean),public.line_inbox_claim(text,uuid,text,uuid,integer),
  public.line_inbox_renew(text,uuid,bigint,uuid,integer),public.line_inbox_persist_customer(text,uuid,bigint,uuid) to service_role;
commit;
