
-- TGG EARS + HANDS safety
select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_one_ears_snapshots','tgg_one_hands_snapshots')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_ears_refresh','tgg_one_ears_state',
    'tgg_one_hands_refresh','tgg_one_hands_state',
    'tgg_one_sensory_action_completeness'
  )
order by p.proname;

select public.tgg_one_ears_refresh() as ears;
select public.tgg_one_hands_refresh() as hands;
select public.tgg_one_sensory_action_completeness() as completeness;

-- Expected:
-- EARS reads counts/status only, never message bodies/provider payloads.
-- HANDS does not execute arbitrary RPCs and requires existing guarded actions.
-- 36 active layers.
-- Freight Train sequence includes see -> hear -> map -> hunt -> controlled hands -> body.
-- No production/high-risk/canonical authority added.
-- AB-006 / V223 preserved.
