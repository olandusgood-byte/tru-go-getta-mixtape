-- TGG THE MIRROR safety
select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='tgg_one_mirror_snapshots';

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_one_mirror_refresh','tgg_one_mirror_state','tgg_one_mirror_completeness')
order by p.proname;

select public.tgg_one_mirror_refresh() as mirror;
select public.tgg_one_mirror_completeness() as completeness;

select layer_key,display_name,layer_order,production_authority,high_risk_authority,canonical_authority
from public.tgg_one_layers
where active=true
order by layer_order;

-- Expected:
-- production/runtime drift count zero when healthy.
-- intentional new architecture is CHANGED, not drift.
-- MIRROR cannot execute changes or rewrite history.
-- 55 active layers with THE ONE last.
-- no production/high-risk/canonical authority added.
-- AB-006 / V223 preserved.
