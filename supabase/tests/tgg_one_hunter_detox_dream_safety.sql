
-- TGG HUNTER + DETOX + DREAM safety

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'tgg_one_hunter_snapshots','tgg_one_hunts',
    'tgg_one_detox_snapshots','tgg_one_dream_snapshots'
  )
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_hunter_refresh','tgg_one_hunter_state',
    'tgg_one_detox_refresh','tgg_one_detox_cycle',
    'tgg_one_dream_cycle','tgg_one_dream_state',
    'tgg_one_hunter_detox_completeness'
  )
order by p.proname;

select public.tgg_one_hunter_refresh() as hunter;
select public.tgg_one_detox_cycle() as detox;
select public.tgg_one_hunter_detox_completeness() as completeness;

select jobid,jobname,schedule,command,active
from cron.job
where jobname in ('tgg-autonomic-os-minute-loop','tgg-one-dream-cycle')
order by jobname;

-- Expected:
-- HUNTER does not target review-only/protected findings.
-- HUNTER production/high-risk authority false.
-- DETOX does not delete history/evidence.
-- DREAM does not invent work or auto-apply heuristic changes.
-- 32 total layers, HUNTER after SCOUT, DETOX before MUSCLE, DREAM after SOUL.
-- minute loop runs hunter_detox cycle; dream cadence is periodic.
-- AB-006 / V223 preserved.
