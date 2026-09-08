-- TGG Brain 1.0 safety and orchestration contract.

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_brain_memory','tgg_brain_decisions','tgg_brain_priorities')
order by c.relname;

select
  has_table_privilege('authenticated','public.tgg_brain_memory','SELECT') as auth_memory_select,
  has_table_privilege('authenticated','public.tgg_brain_decisions','SELECT') as auth_decision_select,
  has_table_privilege('authenticated','public.tgg_brain_priorities','SELECT') as auth_priority_select;

-- Expected: all false; brain tables are internal orchestration state.

select
  p.proname,
  has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_remember','tgg_brain_decide','tgg_brain_set_priority','tgg_brain_state')
order by p.proname;

-- Expected: postgres=true, authenticated=false, anon=false.

select public.tgg_brain_state() as brain_state;

-- Expected safety invariants in JSON:
-- brain_version = TGG-BRAIN-1.0
-- production_auto_publish = false
-- high_risk_auto_execute = false
-- canonical_boundary = AB-006
-- canonical_source_version = V223

select
  position('production_auto_publish' in pg_get_functiondef(p.oid)) > 0 as has_production_guard,
  position('high_risk_auto_execute' in pg_get_functiondef(p.oid)) > 0 as has_high_risk_guard,
  position('canonical_boundary' in pg_get_functiondef(p.oid)) > 0 as has_canonical_boundary,
  position('tgg_game_idea_pipeline_state' in pg_get_functiondef(p.oid)) > 0 as reads_game_ideas,
  position('tgg_autobuilder_detect_state' in pg_get_functiondef(p.oid)) > 0 as reads_builder_state,
  position('tgg_latest_operational_dependency_state' in pg_get_functiondef(p.oid)) > 0 as reads_dependencies
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_state';

select memory_key,memory_type,importance,active
from public.tgg_brain_memory
where memory_key='system:self-building-video-game';

select decision_key,status,reversible
from public.tgg_brain_decisions
where decision_key='decision:production-boundary';

select item_type,item_key,score
from public.tgg_brain_priorities
where item_type='idea' and item_key='self-building-video-game';
