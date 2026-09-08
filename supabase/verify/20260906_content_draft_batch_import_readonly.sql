-- Read-only catalog check for the atomic content-draft batch importer.
-- This reads schema metadata only; it does not read clinic or customer content.

select to_regclass('public.content_draft_import_batches') as batch_receipt_table;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'content_draft_import_batches'
order by ordinal_position;

select
  routine_name,
  data_type,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'create_content_draft_batch';

select
  has_table_privilege('service_role', 'public.content_draft_import_batches', 'select') as service_role_can_read_receipts,
  has_table_privilege('service_role', 'public.content_draft_import_batches', 'insert') as service_role_can_create_receipts,
  has_function_privilege(
    'service_role',
    'public.create_content_draft_batch(text,text,text,uuid,jsonb)',
    'execute'
  ) as service_role_can_execute_batch,
  not has_function_privilege(
    'authenticated',
    'public.create_content_draft_batch(text,text,text,uuid,jsonb)',
    'execute'
  ) as authenticated_cannot_execute_batch;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.content_draft_import_batches'::regclass
order by conname;

select to_regclass('supabase_migrations.schema_migrations') as migration_history_table;
