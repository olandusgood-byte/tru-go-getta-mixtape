
-- TGG LUNGS + METABOLISM safety

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_one_lungs_snapshots','tgg_one_metabolism_snapshots')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_lungs_refresh','tgg_one_lungs_state',
    'tgg_one_metabolism_refresh','tgg_one_metabolism_state',
    'tgg_one_breathing_completeness'
  )
order by p.proname;

select public.tgg_one_lungs_refresh() as lungs_probe;
select public.tgg_one_metabolism_refresh() as metabolism_probe;
select public.tgg_one_breathing_completeness() as completeness;

select layer_key,display_name,layer_order
from public.tgg_one_layers
where active=true
order by layer_order;

select jobid,jobname,schedule,command,active
from cron.job
where jobname='tgg-autonomic-os-minute-loop';

-- Expected:
-- RLS=true.
-- anon/authenticated cannot execute internal lungs/metabolism functions.
-- lungs recommended_batch_size <= speed booster effective batch and <=25.
-- metabolism reserves QA, recovery and evidence; none may be zero.
-- lungs/metabolism cannot raise hard ceiling or bypass safety.
-- completeness.ok=true with 29 active layers.
-- minute loop calls tgg_one_breathing_cycle().
-- AB-006 / V223 preserved.
