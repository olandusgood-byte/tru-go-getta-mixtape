
-- TGG Skip-It + Acceleration safety

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='tgg_one_skip_decisions';

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_one_skip_check','tgg_one_skip_batch','tgg_one_skip_state','tgg_one_completeness')
order by p.proname;

select public.tgg_one_skip_state() as skip_state;
select public.tgg_one_completeness() as one_completeness;
select public.tgg_speed_booster_state() as speed_state;
select public.tgg_speed_booster_layer_plan() as layer_plan;

-- Expected:
-- RLS=true.
-- anon/authenticated cannot execute skip/completeness internals.
-- one_completeness.ok=true and skip_gate_required=true.
-- boosted_batch_size=20, effective batch=20 only when health is clean.
-- hard_max_batch_size=25.
-- production_auto_publish=false.
-- production_promotion_allowed=false.
-- high_risk_auto_execute=false.
-- canonical_boundary=AB-006 / V223.
