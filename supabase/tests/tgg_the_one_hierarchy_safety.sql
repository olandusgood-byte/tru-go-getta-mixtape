
-- TGG THE ONE hierarchy safety

select layer_key,display_name,layer_order,can_execute,can_block,
       production_authority,high_risk_authority,canonical_authority,active
from public.tgg_one_layers
order by layer_order;

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_one_layers','tgg_one_cycles')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_one_layer_state','tgg_one_state','tgg_one_cycle','tgg_one_latest')
order by p.proname;

select public.tgg_one_state() as one_state;

select jobid,jobname,schedule,command,active
from cron.job
where jobname='tgg-autonomic-os-minute-loop';

select public.tgg_autonomic_completeness() as completeness;

-- Expected:
-- seven active layers in order: shadow, head, mind, body, spirit, soul, the_one.
-- no layer has production_authority=true or high_risk_authority=true.
-- RLS=true on both tables.
-- authenticated/anon cannot execute THE ONE internal functions.
-- one_state canonical_boundary=AB-006 and canonical_source_version=V223.
-- production_auto_publish=false, production_promotion_allowed=false, high_risk_auto_execute=false.
-- minute-loop command = select public.tgg_one_cycle();
-- completeness.ok=true and one_hierarchy_required=true.
