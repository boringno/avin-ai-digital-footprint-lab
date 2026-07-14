begin;

create extension if not exists "pgcrypto";

create table if not exists public.intent_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  classifier_version text not null default 'v1',
  intent_key text not null,
  display_name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intent_catalog_key_check check (
    intent_key in (
      'branch_info', 'pricing', 'campaign', 'treatment',
      'booking_new', 'booking_modify', 'booking_cancel',
      'post_treatment', 'pregnancy_nursing', 'complaint',
      'human_request', 'schedule', 'off_topic', 'unclassified'
    )
  ),
  constraint intent_catalog_version_key_unique unique (tenant_id, classifier_version, intent_key)
);

create table if not exists public.message_intent_labels (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  message_id uuid not null references public.conversation_messages(id) on delete cascade,
  classifier_version text not null default 'v1',
  intent_key text not null,
  label_source text not null default 'rule',
  rule_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_intent_labels_source_check check (label_source in ('rule', 'manual')),
  constraint message_intent_labels_key_check check (
    intent_key in (
      'branch_info', 'pricing', 'campaign', 'treatment',
      'booking_new', 'booking_modify', 'booking_cancel',
      'post_treatment', 'pregnancy_nursing', 'complaint',
      'human_request', 'schedule', 'off_topic', 'unclassified'
    )
  ),
  constraint message_intent_labels_message_version_unique unique (tenant_id, message_id, classifier_version)
);

create table if not exists public.faq_miss_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  classifier_version text not null default 'v1',
  source_message_id uuid references public.conversation_messages(id) on delete set null,
  candidate_type text not null,
  status text not null default 'open',
  intent_key text not null default 'unclassified',
  question_hash text not null,
  question_redacted text,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_by uuid references public.staff_users(id) on delete set null,
  reviewed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faq_miss_candidates_type_check check (candidate_type in ('no_approved_answer', 'repeated_question')),
  constraint faq_miss_candidates_status_check check (status in ('open', 'reviewed', 'dismissed', 'promoted')),
  constraint faq_miss_candidates_key_check check (
    intent_key in (
      'branch_info', 'pricing', 'campaign', 'treatment',
      'booking_new', 'booking_modify', 'booking_cancel',
      'post_treatment', 'pregnancy_nursing', 'complaint',
      'human_request', 'schedule', 'off_topic', 'unclassified'
    )
  ),
  constraint faq_miss_candidates_hash_unique unique (tenant_id, classifier_version, candidate_type, question_hash)
);

create index if not exists idx_message_intent_labels_tenant_intent_created
  on public.message_intent_labels (tenant_id, classifier_version, intent_key, created_at desc);
create index if not exists idx_message_intent_labels_message
  on public.message_intent_labels (message_id, classifier_version);
create index if not exists idx_faq_miss_candidates_tenant_status_seen
  on public.faq_miss_candidates (tenant_id, status, last_seen_at desc);

drop trigger if exists trg_intent_catalog_updated_at on public.intent_catalog;
create trigger trg_intent_catalog_updated_at before update on public.intent_catalog
for each row execute function public.set_updated_at();
drop trigger if exists trg_message_intent_labels_updated_at on public.message_intent_labels;
create trigger trg_message_intent_labels_updated_at before update on public.message_intent_labels
for each row execute function public.set_updated_at();
drop trigger if exists trg_faq_miss_candidates_updated_at on public.faq_miss_candidates;
create trigger trg_faq_miss_candidates_updated_at before update on public.faq_miss_candidates
for each row execute function public.set_updated_at();

alter table public.intent_catalog enable row level security;
alter table public.message_intent_labels enable row level security;
alter table public.faq_miss_candidates enable row level security;
revoke all on table public.intent_catalog from anon, authenticated;
revoke all on table public.message_intent_labels from anon, authenticated;
revoke all on table public.faq_miss_candidates from anon, authenticated;

insert into public.intent_catalog (tenant_id, classifier_version, intent_key, display_name, description)
values
  ('tenant_001', 'v1', 'branch_info', 'Branch information', 'Locations, addresses, hours, payments, and first visit information.'),
  ('tenant_001', 'v1', 'pricing', 'Pricing', 'Price and quote requests.'),
  ('tenant_001', 'v1', 'campaign', 'Campaign', 'Current promotions and campaign information.'),
  ('tenant_001', 'v1', 'treatment', 'Treatment', 'Approved treatment introduction and concern mapping.'),
  ('tenant_001', 'v1', 'booking_new', 'New booking', 'New consultation or booking request.'),
  ('tenant_001', 'v1', 'booking_modify', 'Booking change', 'Change of branch, time, or treatment.'),
  ('tenant_001', 'v1', 'booking_cancel', 'Booking cancellation', 'Cancellation of an existing booking.'),
  ('tenant_001', 'v1', 'post_treatment', 'Post treatment', 'Aftercare or abnormal reaction question.'),
  ('tenant_001', 'v1', 'pregnancy_nursing', 'Pregnancy or nursing', 'Pregnancy, nursing, or trying-to-conceive question.'),
  ('tenant_001', 'v1', 'complaint', 'Complaint', 'Complaint or outcome guarantee request.'),
  ('tenant_001', 'v1', 'human_request', 'Human support', 'Request for a human or personalized assessment.'),
  ('tenant_001', 'v1', 'schedule', 'Schedule', 'Doctor schedule request.'),
  ('tenant_001', 'v1', 'off_topic', 'Off topic', 'Message outside clinic customer support.'),
  ('tenant_001', 'v1', 'unclassified', 'Unclassified', 'No deterministic rule matched.')
on conflict (tenant_id, classifier_version, intent_key) do update
set display_name = excluded.display_name,
    description = excluded.description,
    is_active = true,
    updated_at = now();

commit;
