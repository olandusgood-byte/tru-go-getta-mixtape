
-- TGG VISION + GPS safety
select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_one_vision_snapshots','tgg_one_gps_snapshots')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_vision_refresh','tgg_one_vision_state',
    'tgg_one_gps_refresh','tgg_one_gps_state','tgg_one_navigation_completeness'
  )
order by p.proname;

select public.tgg_one_vision_refresh() as vision;
select public.tgg_one_gps_refresh() as gps;
select public.tgg_one_navigation_completeness() as completeness;

-- Expected:
-- VISION uses latest evidence only.
-- GPS never creates/moves routes; read/guide only.
-- VISION/GPS have no production/high-risk authority.
-- 34 active layers.
-- FREIGHT TRAIN sees first, maps second, hunts third.
-- AB-006 / V223 preserved.
