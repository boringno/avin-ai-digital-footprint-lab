with expected(table_name) as (
  values
    ('legacy_conversations_20260622'),
    ('customers'),
    ('messages'),
    ('webhook_events'),
    ('faq_entries'),
    ('pricing_campaigns'),
    ('handoff_rules'),
    ('conversation_runtime_state')
)
select e.table_name,
       c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'select') as anon_select,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_select,
       count(p.policyname) as policy_count
from expected e
join pg_class c on c.oid = ('public.' || e.table_name)::regclass
left join pg_policies p on p.schemaname = 'public' and p.tablename = e.table_name
group by e.table_name, c.oid, c.relrowsecurity
order by e.table_name;
