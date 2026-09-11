
-- TGG MUSCLE + Race safety

select layer_key,display_name,layer_order,can_execute,can_block,
       production_authority,high_risk_authority,canonical_authority,active
from public.tgg_one_layers
where active=true
order by layer_order;

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_one_muscle_snapshots','tgg_one_muscle_workloads')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_muscle_refresh','tgg_one_muscle_state','tgg_one_muscle_plan','tgg_one_completeness'
  )
order by p.proname;

select public.tgg_one_muscle_refresh() as muscle_probe;
select public.tgg_one_muscle_plan('CI Muscle Race',20) as race_probe;
select public.tgg_one_completeness() as one_completeness;

-- Expected:
-- exact order includes muscle at #6 before body.
-- RLS=true.
-- anon/authenticated cannot execute MUSCLE internals.
-- muscle production_allowed=false and high_risk_allowed=false.
-- race no_work or staging-only safe manifest.
-- effective batch <=25.
-- one_completeness.ok=true with 11 required layers.
-- AB-006 / V223 preserved.
