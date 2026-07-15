begin;

alter table public.handoff_tasks
  add column if not exists branch text;

alter table public.handoff_tasks
  drop constraint if exists handoff_tasks_branch_check;

alter table public.handoff_tasks
  add constraint handoff_tasks_branch_check
  check (branch is null or branch in ('高雄館', '台中館', '桃園館', '林口館'));

create index if not exists idx_handoff_tasks_tenant_branch_status_created
  on public.handoff_tasks (tenant_id, branch, status, created_at desc);

create table if not exists public.handoff_digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  branch text not null check (branch in ('高雄館', '台中館', '桃園館', '林口館')),
  digest_key text not null,
  task_count integer not null check (task_count > 0),
  status text not null default 'sending' check (status in ('sending', 'sent')),
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, branch, digest_key)
);

alter table public.handoff_digest_deliveries enable row level security;
revoke all on table public.handoff_digest_deliveries from anon, authenticated;

commit;
