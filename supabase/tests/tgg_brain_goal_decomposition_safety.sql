-- TGG Brain goal decomposition safety regression.

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_brain_goals','tgg_brain_goal_steps','tgg_brain_goal_dependencies')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_brain_goal_create',
    'tgg_brain_goal_add_step',
    'tgg_brain_goal_add_dependency',
    'tgg_brain_goal_refresh_ready',
    'tgg_brain_goal_next_steps'
  )
order by p.proname;

select
  position('cyclic_dependency_forbidden' in pg_get_functiondef(p.oid)) > 0 as rejects_cycles,
  position('self_dependency_forbidden' in pg_get_functiondef(p.oid)) > 0 as rejects_self_dependency
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_goal_add_dependency';

select
  position('risk_level<>''high''' in replace(pg_get_functiondef(p.oid),' ','')) > 0 as excludes_high_risk_steps
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_goal_refresh_ready';

select
  position('development_only=true' in replace(pg_get_functiondef(p.oid),' ','')) > 0 as requires_development_only,
  position('production_allowed=false' in replace(pg_get_functiondef(p.oid),' ','')) > 0 as blocks_production,
  position('risk_level<>''high''' in replace(pg_get_functiondef(p.oid),' ','')) > 0 as excludes_high_risk_goals
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_goal_next_steps';

-- Expected:
-- only postgres can execute goal mutation/orchestration functions
-- cyclic/self dependencies are rejected
-- high-risk steps do not auto-ready
-- production_allowed=false is required for auto next steps
