create extension if not exists "pgcrypto";

create table if not exists faq_entries (
  id uuid primary key default gen_random_uuid(),
  question_pattern text not null,
  answer_text text not null,
  topic text not null default 'general',
  is_active boolean not null default false,
  approval_status text not null default 'pending_review',
  reviewed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pricing_campaigns (
  id uuid primary key default gen_random_uuid(),
  treatment_name text not null,
  branch_scope text not null default '',
  campaign_name text not null default '',
  price_text text not null default '',
  start_date date,
  end_date date,
  is_active boolean not null default false,
  approval_status text not null default 'pending_review',
  fallback_message text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists handoff_rules (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null,
  pattern text not null,
  handoff_message text not null,
  priority text not null default 'medium',
  is_active boolean not null default false,
  approval_status text not null default 'pending_review',
  reviewed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  status text not null default 'open',
  last_intent text not null default 'unknown',
  handoff_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null,
  content text not null,
  decision_type text not null default 'unclassified',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_faq_entries_active on faq_entries (is_active, approval_status);
create index if not exists idx_pricing_campaigns_active_dates on pricing_campaigns (is_active, start_date, end_date);
create index if not exists idx_handoff_rules_active on handoff_rules (is_active, approval_status, trigger_type);
create index if not exists idx_conversations_customer_id on conversations (customer_id);
create index if not exists idx_messages_conversation_id on messages (conversation_id, created_at desc);
create index if not exists idx_webhook_events_provider_event_id on webhook_events (provider_event_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_faq_entries_updated_at on faq_entries;
create trigger trg_faq_entries_updated_at
before update on faq_entries
for each row execute function set_updated_at();

drop trigger if exists trg_pricing_campaigns_updated_at on pricing_campaigns;
create trigger trg_pricing_campaigns_updated_at
before update on pricing_campaigns
for each row execute function set_updated_at();

drop trigger if exists trg_handoff_rules_updated_at on handoff_rules;
create trigger trg_handoff_rules_updated_at
before update on handoff_rules
for each row execute function set_updated_at();

drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at
before update on customers
for each row execute function set_updated_at();

drop trigger if exists trg_conversations_updated_at on conversations;
create trigger trg_conversations_updated_at
before update on conversations
for each row execute function set_updated_at();
