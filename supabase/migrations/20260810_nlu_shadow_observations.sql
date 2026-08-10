begin;

create table if not exists public.nlu_shadow_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  message_id uuid not null references public.conversation_messages(id) on delete cascade,
  prompt_version text not null,
  model text not null,
  nlu_frame jsonb,
  deterministic_decision jsonb not null default '{}'::jsonb,
  divergence_categories text[] not null default '{}'::text[],
  confidence numeric,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  tokens_in integer not null default 0 check (tokens_in >= 0),
  tokens_out integer not null default 0 check (tokens_out >= 0),
  error_code text,
  review_status text not null default 'pending' check (review_status in ('pending', 'confirmed', 'dismissed')),
  expected_frame jsonb,
  reviewed_by uuid references public.staff_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  retention_expiry timestamptz not null default (now() + interval '180 days'),
  constraint nlu_shadow_observations_message_prompt_unique unique (tenant_id, message_id, prompt_version)
);

create index if not exists idx_nlu_shadow_observations_review
  on public.nlu_shadow_observations (tenant_id, created_at desc)
  where cardinality(divergence_categories) > 0;

create index if not exists idx_nlu_shadow_observations_retention
  on public.nlu_shadow_observations (retention_expiry);

alter table public.nlu_shadow_observations enable row level security;
revoke all on table public.nlu_shadow_observations from anon, authenticated;

comment on table public.nlu_shadow_observations is
  'Internal shadow-only NLU diagnostics. Stores message_id references, never a duplicate of customer message text. Rows expire with the 180-day conversation retention policy.';

commit;
