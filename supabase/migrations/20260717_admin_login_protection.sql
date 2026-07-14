begin;

create extension if not exists "pgcrypto";

create table if not exists public.admin_login_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'tenant_001',
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_failed_at timestamptz,
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_login_attempts_tenant_key_unique unique (tenant_id, key_hash)
);

create index if not exists idx_admin_login_attempts_tenant_blocked
  on public.admin_login_attempts (tenant_id, blocked_until);

drop trigger if exists trg_admin_login_attempts_updated_at on public.admin_login_attempts;
create trigger trg_admin_login_attempts_updated_at before update on public.admin_login_attempts
for each row execute function public.set_updated_at();

create or replace function public.is_admin_login_rate_limited(
  p_tenant_id text,
  p_key_hashes text[]
) returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_login_attempts
    where tenant_id = p_tenant_id
      and key_hash = any(p_key_hashes)
      and blocked_until is not null
      and blocked_until > now()
  );
$$;

create or replace function public.record_admin_login_failure(
  p_tenant_id text,
  p_key_hashes text[],
  p_window_seconds integer,
  p_max_failures integer,
  p_block_seconds integer
) returns boolean
language plpgsql
as $$
declare
  v_key_hash text;
  v_attempt public.admin_login_attempts%rowtype;
  v_failure_count integer;
  v_blocked boolean := false;
begin
  foreach v_key_hash in array p_key_hashes loop
    if v_key_hash is null or v_key_hash = '' then
      continue;
    end if;

    insert into public.admin_login_attempts (tenant_id, key_hash)
    values (p_tenant_id, v_key_hash)
    on conflict (tenant_id, key_hash) do nothing;

    select * into v_attempt
    from public.admin_login_attempts
    where tenant_id = p_tenant_id and key_hash = v_key_hash
    for update;

    v_failure_count := case
      when v_attempt.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
      else v_attempt.failure_count + 1
    end;

    update public.admin_login_attempts
    set window_started_at = case when v_failure_count = 1 then now() else v_attempt.window_started_at end,
        failure_count = v_failure_count,
        last_failed_at = now(),
        blocked_until = case
          when v_failure_count >= p_max_failures then now() + make_interval(secs => p_block_seconds)
          else v_attempt.blocked_until
        end
    where id = v_attempt.id;

    v_blocked := v_blocked or v_failure_count >= p_max_failures;
  end loop;

  return v_blocked;
end;
$$;

alter table public.admin_login_attempts enable row level security;
revoke all on table public.admin_login_attempts from anon, authenticated;
revoke all on function public.is_admin_login_rate_limited(text, text[]) from public, anon, authenticated;
revoke all on function public.record_admin_login_failure(text, text[], integer, integer, integer) from public, anon, authenticated;
grant execute on function public.is_admin_login_rate_limited(text, text[]) to service_role;
grant execute on function public.record_admin_login_failure(text, text[], integer, integer, integer) to service_role;

commit;
