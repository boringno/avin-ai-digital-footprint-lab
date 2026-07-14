begin;

create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'customer_id'
  ) then
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'legacy_conversations_20260622'
    ) then
      alter table public.conversations rename to legacy_conversations_20260622;
    else
      raise exception 'Legacy conversations table already exists and public.conversations still has the old MVP schema. Resolve the duplicate legacy table before applying admin backend A1.';
    end if;
  end if;
end
$$;

alter table if exists conversation_runtime_state
  add column if not exists tenant_id text not null default 'tenant_001';

create index if not exists idx_conversation_runtime_state_tenant_line_user
  on conversation_runtime_state (tenant_id, line_user_id);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  line_user_id text not null,
  display_name text,
  lead_stage text not null default 'new_inquiry',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_lead_stage_check check (
    lead_stage in (
      'new_inquiry',
      'interested',
      'booking_intent',
      'handoff_pending',
      'human_followup',
      'closed'
    )
  ),
  constraint conversations_tenant_line_user_unique unique (tenant_id, line_user_id)
);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null,
  message_type text not null default 'text',
  content text not null default '',
  intent text,
  source_event_id text,
  line_message_id text,
  send_status text not null default 'sent',
  send_error text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint conversation_messages_direction_check check (
    direction in ('customer', 'ai', 'staff', 'system')
  ),
  constraint conversation_messages_message_type_check check (
    message_type in ('text', 'image', 'flex', 'template', 'postback', 'unknown')
  ),
  constraint conversation_messages_send_status_check check (
    send_status in ('pending', 'sent', 'failed', 'skipped')
  )
);

create unique index if not exists idx_conversation_messages_source_event_unique
  on conversation_messages (tenant_id, source_event_id)
  where source_event_id is not null;

create table if not exists staff_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  auth_user_id uuid not null unique,
  display_name text not null,
  role text not null default 'agent',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_users_role_check check (
    role in ('owner', 'manager', 'agent', 'maintainer')
  )
);

create table if not exists handoff_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  conversation_id uuid not null references conversations(id) on delete cascade,
  reason text not null default 'unknown',
  status text not null default 'open',
  assigned_to uuid references staff_users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint handoff_tasks_status_check check (
    status in ('open', 'taken', 'resolved')
  )
);

create table if not exists booking_leads_db (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  conversation_id uuid not null references conversations(id) on delete cascade,
  booking_status text not null default 'new',
  interested_treatments jsonb not null default '[]'::jsonb,
  preferred_branch text,
  preferred_time_slots jsonb not null default '[]'::jsonb,
  customer_name text,
  phone text,
  staff_owner uuid references staff_users(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_leads_db_booking_status_check check (
    booking_status in ('new', 'contacted', 'booked', 'arrived', 'won', 'lost')
  ),
  constraint booking_leads_db_conversation_unique unique (tenant_id, conversation_id)
);

create table if not exists audit_logs (
  id bigint primary key generated always as identity,
  tenant_id text not null default 'tenant_001',
  actor_staff_id uuid references staff_users(id) on delete set null,
  action text not null,
  target_table text not null,
  target_id text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_tenant_last_seen
  on conversations (tenant_id, last_seen_at desc);

create index if not exists idx_conversations_tenant_lead_stage
  on conversations (tenant_id, lead_stage, last_seen_at desc);

create index if not exists idx_conversation_messages_conversation_created
  on conversation_messages (conversation_id, created_at);

create index if not exists idx_conversation_messages_tenant_created
  on conversation_messages (tenant_id, created_at desc);

create index if not exists idx_conversation_messages_line_message
  on conversation_messages (tenant_id, line_message_id)
  where line_message_id is not null;

create index if not exists idx_handoff_tasks_tenant_status_created
  on handoff_tasks (tenant_id, status, created_at desc);

create index if not exists idx_handoff_tasks_conversation
  on handoff_tasks (conversation_id, created_at desc);

create index if not exists idx_booking_leads_db_tenant_status_updated
  on booking_leads_db (tenant_id, booking_status, updated_at desc);

create index if not exists idx_booking_leads_db_tenant_branch
  on booking_leads_db (tenant_id, preferred_branch);

create index if not exists idx_staff_users_tenant_active_role
  on staff_users (tenant_id, is_active, role);

create index if not exists idx_audit_logs_tenant_created
  on audit_logs (tenant_id, created_at desc);

drop trigger if exists trg_conversations_updated_at on conversations;
create trigger trg_conversations_updated_at
before update on conversations
for each row execute function set_updated_at();

drop trigger if exists trg_staff_users_updated_at on staff_users;
create trigger trg_staff_users_updated_at
before update on staff_users
for each row execute function set_updated_at();

drop trigger if exists trg_handoff_tasks_updated_at on handoff_tasks;
create trigger trg_handoff_tasks_updated_at
before update on handoff_tasks
for each row execute function set_updated_at();

drop trigger if exists trg_booking_leads_db_updated_at on booking_leads_db;
create trigger trg_booking_leads_db_updated_at
before update on booking_leads_db
for each row execute function set_updated_at();

alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table handoff_tasks enable row level security;
alter table booking_leads_db enable row level security;
alter table staff_users enable row level security;
alter table audit_logs enable row level security;

revoke all on table conversations from anon;
revoke all on table conversation_messages from anon;
revoke all on table handoff_tasks from anon;
revoke all on table booking_leads_db from anon;
revoke all on table staff_users from anon;
revoke all on table audit_logs from anon;

revoke all on table conversations from authenticated;
revoke all on table conversation_messages from authenticated;
revoke all on table handoff_tasks from authenticated;
revoke all on table booking_leads_db from authenticated;
revoke all on table staff_users from authenticated;
revoke all on table audit_logs from authenticated;

commit;
