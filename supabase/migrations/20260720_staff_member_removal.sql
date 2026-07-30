begin;

alter table public.staff_users
  add column if not exists removed_at timestamptz;

create index if not exists idx_staff_users_tenant_removed_created
  on public.staff_users (tenant_id, removed_at, created_at desc);

commit;
