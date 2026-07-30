begin;

create extension if not exists "pgcrypto";

alter table public.conversation_messages
  add column if not exists ai_model text,
  add column if not exists ai_tokens_in integer,
  add column if not exists ai_tokens_out integer;

create table if not exists public.daily_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  metric_date date not null,
  new_conversations integer not null default 0 check (new_conversations >= 0),
  active_users integer not null default 0 check (active_users >= 0),
  inbound_messages integer not null default 0 check (inbound_messages >= 0),
  ai_replies integer not null default 0 check (ai_replies >= 0),
  staff_messages integer not null default 0 check (staff_messages >= 0),
  handoff_created integer not null default 0 check (handoff_created >= 0),
  night_inbound integer not null default 0 check (night_inbound >= 0),
  fallback_replies integer not null default 0 check (fallback_replies >= 0),
  faq_hits integer not null default 0 check (faq_hits >= 0),
  faq_miss integer not null default 0 check (faq_miss >= 0),
  unclassified_count integer not null default 0 check (unclassified_count >= 0),
  llm_requests integer not null default 0 check (llm_requests >= 0),
  ai_tokens_in bigint not null default 0 check (ai_tokens_in >= 0),
  ai_tokens_out bigint not null default 0 check (ai_tokens_out >= 0),
  intent_distribution_json jsonb not null default '{}'::jsonb,
  handoff_reason_json jsonb not null default '{}'::jsonb,
  branch_distribution_json jsonb not null default '{}'::jsonb,
  treatment_distribution_json jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_metrics_tenant_date_unique unique (tenant_id, metric_date)
);

create table if not exists public.monthly_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  metric_month text not null check (metric_month ~ '^\\d{4}-\\d{2}$'),
  metrics_json jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_metrics_tenant_month_unique unique (tenant_id, metric_month)
);

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  suggestion_type text not null,
  title text not null,
  body text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  source_period_start date,
  source_period_end date,
  status text not null default 'proposed',
  reviewed_by uuid references public.staff_users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_suggestions_type_check check (suggestion_type in ('faq', 'routing', 'content', 'handoff', 'reporting')),
  constraint ai_suggestions_status_check check (status in ('proposed', 'approved', 'rejected', 'published', 'archived'))
);

-- Internal idempotency support. It never stores a raw customer question.
create table if not exists public.faq_miss_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  classifier_version text not null default 'v1',
  message_id uuid not null references public.conversation_messages(id) on delete cascade,
  candidate_type text not null default 'no_approved_answer',
  question_hash text not null,
  question_redacted text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint faq_miss_observations_type_check check (candidate_type in ('no_approved_answer', 'repeated_question')),
  constraint faq_miss_observations_unique unique (tenant_id, classifier_version, message_id, candidate_type)
);

create index if not exists idx_daily_metrics_tenant_date on public.daily_metrics (tenant_id, metric_date desc);
create index if not exists idx_monthly_metrics_tenant_month on public.monthly_metrics (tenant_id, metric_month desc);
create index if not exists idx_ai_suggestions_tenant_status_created on public.ai_suggestions (tenant_id, status, created_at desc);
create index if not exists idx_faq_miss_observations_tenant_hash
  on public.faq_miss_observations (tenant_id, classifier_version, candidate_type, question_hash);

drop trigger if exists trg_daily_metrics_updated_at on public.daily_metrics;
create trigger trg_daily_metrics_updated_at before update on public.daily_metrics
for each row execute function public.set_updated_at();
drop trigger if exists trg_monthly_metrics_updated_at on public.monthly_metrics;
create trigger trg_monthly_metrics_updated_at before update on public.monthly_metrics
for each row execute function public.set_updated_at();
drop trigger if exists trg_ai_suggestions_updated_at on public.ai_suggestions;
create trigger trg_ai_suggestions_updated_at before update on public.ai_suggestions
for each row execute function public.set_updated_at();

alter table public.daily_metrics enable row level security;
alter table public.monthly_metrics enable row level security;
alter table public.ai_suggestions enable row level security;
alter table public.faq_miss_observations enable row level security;
revoke all on table public.daily_metrics, public.monthly_metrics, public.ai_suggestions, public.faq_miss_observations from anon, authenticated;

commit;
