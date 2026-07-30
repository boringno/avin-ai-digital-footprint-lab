create table if not exists conversation_runtime_state (
  line_user_id text primary key,
  booking_draft_json jsonb not null default '{}'::jsonb,
  context_json jsonb not null default '{}'::jsonb,
  state_json jsonb not null default '{}'::jsonb,
  is_soft_deleted boolean not null default false,
  soft_deleted_at timestamptz,
  retention_expiry timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_conversation_runtime_state_retention
  on conversation_runtime_state (retention_expiry);

create index if not exists idx_conversation_runtime_state_soft_delete
  on conversation_runtime_state (is_soft_deleted, soft_deleted_at);

drop trigger if exists trg_conversation_runtime_state_updated_at on conversation_runtime_state;
create trigger trg_conversation_runtime_state_updated_at
before update on conversation_runtime_state
for each row execute function set_updated_at();
