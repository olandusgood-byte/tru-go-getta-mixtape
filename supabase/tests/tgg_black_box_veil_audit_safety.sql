-- TGG BLACK BOX + VEIL AUDIT safety

select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_veil_audit_ledger','tgg_one_black_box_snapshots')
order by c.relname;

select p.proname,p.prosecdef,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_veil_route_decision_audited',
    'tgg_one_black_box_refresh','tgg_one_black_box_state',
    'tgg_veil_audit_state','tgg_one_recorded_freight_train_cycle',
    'tgg_one_recorded_completeness'
  )
order by p.proname;

select public.tgg_one_black_box_refresh() as black_box;
select public.tgg_veil_audit_state() as veil_audit;
select public.tgg_one_recorded_completeness() as completeness;

select jobid,jobname,schedule,command,active
from cron.job
where jobname='tgg-autonomic-os-minute-loop';

select layer_key,display_name,layer_order,production_authority,high_risk_authority,canonical_authority
from public.tgg_one_layers
where active=true
order by layer_order;

-- Expected:
-- audit and black-box tables are RLS-on and not client-readable.
-- audited VEIL function is authenticated-only.
-- portal transitions remain authenticated/owner-scoped.
-- BLACK BOX records metadata summaries only: no secrets/message bodies/provider payloads.
-- recorded minute loop calls tgg_one_recorded_freight_train_cycle().
-- 57 active layers; MIRROR before THE ONE.
-- no production/high-risk/canonical authority added.
-- AB-006 / V223 preserved.
