
-- TGG Sentinel Family Universe safety

select layer_key,display_name,layer_order,production_authority,high_risk_authority,canonical_authority,active
from public.tgg_one_layers
where active=true
order by layer_order;

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'tgg_one_nervous_snapshots','tgg_one_immune_snapshots',
    'tgg_one_genome_snapshots','tgg_one_skin_snapshots',
    'tgg_one_partner_snapshots','tgg_one_children_snapshots',
    'tgg_one_family_snapshots','tgg_one_planet_snapshots','tgg_one_universe_snapshots'
  )
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_partner_refresh','tgg_one_children_refresh','tgg_one_family_refresh',
    'tgg_one_planet_refresh','tgg_one_universe_refresh',
    'tgg_one_total_completeness','tgg_one_family_universe_cycle'
  )
order by p.proname;

select public.tgg_one_children_refresh() as children_probe;
select public.tgg_one_planet_refresh() as planet_probe;
select public.tgg_one_universe_refresh() as universe_probe;
select public.tgg_one_total_completeness() as total_completeness;

select jobid,jobname,schedule,command,active
from cron.job
where jobname='tgg-autonomic-os-minute-loop';

-- Expected:
-- 25 active layers, THE ONE last.
-- partner/children/family/planet/universe have no production/high-risk authority.
-- children sandbox_only=true.
-- planet recognizes passed blueprint as active.
-- total_completeness.ok=true.
-- minute loop calls tgg_one_family_universe_cycle().
-- AB-006 / V223 preserved.
