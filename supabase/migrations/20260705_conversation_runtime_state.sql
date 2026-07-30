create table if not exists conversation_runtime_state (
  line_user_id text primary key,
  context_json jsonb not null default '{}'::jsonb,
  state_json jsonb not null default '{}'::jsonb,
  booking_draft_json jsonb not null default '{}'::jsonb,
  retention_expiry timestamptz not null default (now() + interval '180 days'),
  is_soft_deleted boolean not null default false,
  soft_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_runtime_state_retention_expiry
  on conversation_runtime_state (retention_expiry);

create index if not exists idx_conversation_runtime_state_soft_delete
  on conversation_runtime_state (is_soft_deleted, soft_deleted_at);

drop trigger if exists trg_conversation_runtime_state_updated_at on conversation_runtime_state;
create trigger trg_conversation_runtime_state_updated_at
before update on conversation_runtime_state
for each row execute function set_updated_at();

alter table conversation_runtime_state enable row level security;

revoke all on table conversation_runtime_state from anon;
revoke all on table conversation_runtime_state from authenticated;
