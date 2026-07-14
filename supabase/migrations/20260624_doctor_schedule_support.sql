create table if not exists doctor_schedule (
  id uuid primary key default gen_random_uuid(),
  doctor_name text not null,
  branch text not null default '',
  schedule_date date not null,
  time_slot text not null default '',
  status text not null default 'available',
  source_month text not null,
  notes text not null default '',
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists schedule_publish_status (
  source_month text primary key,
  published boolean not null default false,
  published_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doctor_schedule_lookup on doctor_schedule (source_month, doctor_name, schedule_date);

drop trigger if exists trg_doctor_schedule_updated_at on doctor_schedule;
create trigger trg_doctor_schedule_updated_at
before update on doctor_schedule
for each row execute function set_updated_at();

drop trigger if exists trg_schedule_publish_status_updated_at on schedule_publish_status;
create trigger trg_schedule_publish_status_updated_at
before update on schedule_publish_status
for each row execute function set_updated_at();
