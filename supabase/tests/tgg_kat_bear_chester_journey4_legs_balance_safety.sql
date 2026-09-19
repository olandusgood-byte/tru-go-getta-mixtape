-- TGG KAT + BEAR + CHESTER + JOURNEY 4 + LEGS + BALANCE safety

select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'tgg_one_kat_snapshots','tgg_one_bear_snapshots','tgg_one_chester_snapshots',
    'tgg_one_journey4_snapshots','tgg_one_legs_snapshots','tgg_one_balance_snapshots'
  )
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_kat_refresh','tgg_one_bear_refresh','tgg_one_chester_refresh',
    'tgg_one_journey4_refresh','tgg_one_legs_refresh','tgg_one_balance_refresh',
    'tgg_one_journey_motion_completeness'
  )
order by p.proname;

select public.tgg_one_kat_refresh() as kat;
select public.tgg_one_bear_refresh() as bear;
select public.tgg_one_chester_refresh() as chester;
select public.tgg_one_journey4_refresh() as journey4;
select public.tgg_one_legs_refresh() as legs;
select public.tgg_one_balance_refresh() as balance;
select public.tgg_one_journey_motion_completeness() as completeness;

select layer_key,display_name,layer_order,production_authority,high_risk_authority
from public.tgg_one_layers
where active=true
order by layer_order;

-- Expected:
-- 46 active layers with THE ONE last.
-- KAT cannot create work.
-- BEAR cannot override HEAD or execute.
-- CHESTER hints only and does not move users.
-- JOURNEY 4 advances only from real state.
-- LEGS only follow approved GPS/Journey paths; no user auto-movement.
-- BALANCE can throttle down but cannot raise ceilings.
-- no production/high-risk/canonical authority added.
-- NO-FREQ rule remains false through ALL-D.
-- AB-006 / V223 preserved.
