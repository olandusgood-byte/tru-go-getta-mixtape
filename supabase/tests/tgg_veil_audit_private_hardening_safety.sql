-- TGG VEIL AUDIT private hardening safety

select n.nspname,p.proname,p.prosecdef,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_veil_route_decision_audited','tgg_veil_audit_state')
order by p.proname;

select has_schema_privilege('authenticated','private','USAGE') as auth_private_usage;

select
  has_table_privilege('authenticated','private.tgg_veil_audit_ledger','INSERT') as auth_insert,
  has_table_privilege('authenticated','private.tgg_veil_audit_ledger','SELECT') as auth_select,
  has_table_privilege('authenticated','private.tgg_veil_audit_ledger','UPDATE') as auth_update,
  has_table_privilege('authenticated','private.tgg_veil_audit_ledger','DELETE') as auth_delete;

select public.tgg_veil_audit_state() as audit_state;
select public.tgg_one_recorded_completeness() as completeness;

-- Expected:
-- audited VEIL wrapper is SECURITY INVOKER.
-- authenticated may call wrapper and insert through private ledger path.
-- authenticated cannot select/update/delete private ledger.
-- anon cannot execute audited wrapper.
-- client-readable=false and stores_secrets=false.
-- recorded completeness remains true.
-- AB-006 / V223 preserved.
