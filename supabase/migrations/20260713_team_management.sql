begin;

alter table public.staff_users
  add column if not exists email text,
  add column if not exists invited_at timestamptz,
  add column if not exists last_invited_at timestamptz;

alter table public.staff_users
  drop constraint if exists staff_users_role_check;

alter table public.staff_users
  add constraint staff_users_role_check check (
    role in ('owner', 'manager', 'agent', 'analyst', 'maintainer')
  );

create unique index if not exists idx_staff_users_tenant_email_unique
  on public.staff_users (tenant_id, lower(email))
  where email is not null;

create index if not exists idx_staff_users_tenant_created
  on public.staff_users (tenant_id, created_at desc);

commit;
