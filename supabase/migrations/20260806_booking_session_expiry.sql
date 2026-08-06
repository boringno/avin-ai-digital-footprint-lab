begin;

-- This is the confirmed appointment time entered by staff, not a customer's
-- free-text preferred time slot. It is used only to reset the next AI booking
-- intake after the appointment has passed; it never marks arrival or no-show.
alter table public.booking_leads_db
  add column if not exists appointment_at timestamptz;

create index if not exists idx_booking_leads_db_tenant_appointment_at
  on public.booking_leads_db (tenant_id, appointment_at)
  where appointment_at is not null;

commit;
