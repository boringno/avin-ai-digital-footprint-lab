begin;

create index if not exists idx_conversation_runtime_state_tenant_soft_delete_retention
  on conversation_runtime_state (tenant_id, is_soft_deleted, retention_expiry);

commit;
