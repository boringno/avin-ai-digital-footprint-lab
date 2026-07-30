begin;

alter table public.staff_users
  add column if not exists last_login_at timestamptz;

commit;
