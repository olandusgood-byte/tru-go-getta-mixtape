-- TGG Brain 1.0 safety + reflection regression contract.

-- Internal brain tables must exist with RLS enabled.
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_brain_memory','tgg_brain_decisions','tgg_brain_priorities','tgg_brain_learning_events')
order by c.relname;

-- Authenticated/anon must not have direct table access.
select table_name,
       has_table_privilege('authenticated','public.'||table_name,'SELECT') as auth_select,
       has_table_privilege('authenticated','public.'||table_name,'INSERT') as auth_insert,
       has_table_privilege('anon','public.'||table_name,'SELECT') as anon_select
from (values
 ('tgg_brain_memory'),
 ('tgg_brain_decisions'),
 ('tgg_brain_priorities'),
 ('tgg_brain_learning_events')
) x(table_name);

-- Brain control functions remain internal-only.
select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_brain_remember',
    'tgg_brain_decide',
    'tgg_brain_set_priority',
    'tgg_brain_state',
    'tgg_brain_reflect',
    'tgg_brain_next_actions'
  )
order by p.proname;

-- Reflection must dedupe source events and promote lessons into durable memory.
select
  position('on conflict do nothing' in lower(pg_get_functiondef(p.oid))) > 0 as dedupes_learning_events,
  position('incorporated_into_memory' in pg_get_functiondef(p.oid)) > 0 as tracks_memory_promotion,
  position('tgg_brain_memory' in pg_get_functiondef(p.oid)) > 0 as writes_brain_memory
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_reflect';

-- Next actions must exclude high-risk and production tasks.
select
  position('risk_level<>''high''' in replace(pg_get_functiondef(p.oid),' ','')) > 0 as blocks_high_risk,
  position('target_environment' in pg_get_functiondef(p.oid)) > 0 as checks_environment,
  position('<>''production''' in replace(pg_get_functiondef(p.oid),' ','')) > 0 as blocks_production
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_next_actions';

-- Brain state must preserve canonical and production boundaries.
select public.tgg_brain_state() as brain_state;

-- Expected:
-- brain_version = TGG-BRAIN-1.0
-- production_auto_publish = false
-- high_risk_auto_execute = false
-- canonical_boundary = AB-006
-- canonical_source_version = V223


-- Versioned self-evaluation safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_brain_versions','tgg_brain_evaluations','tgg_brain_heuristic_adjustments')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_brain_evaluate',
    'tgg_brain_propose_adjustments',
    'tgg_brain_latest_scorecard',
    'tgg_brain_periodic_evaluation'
  )
order by p.proname;

-- Proposals must never auto-apply.
select
  position('auto_apply' in pg_get_functiondef(p.oid)) > 0 as exposes_auto_apply_flag,
  position('false' in lower(pg_get_functiondef(p.oid))) > 0 as auto_apply_false_present
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_propose_adjustments';

-- Safety contract remains immutable in the active brain version.
select version_key,safety_contract
from public.tgg_brain_versions
where status='active'
order by version_no desc
limit 1;

-- Periodic scorecard cron must exist once and be active.
select count(*) as active_scorecard_jobs
from cron.job
where jobname='tgg-brain-periodic-evaluation' and active=true;

-- Expected:
-- authenticated_can_execute = false for internal evaluation controls
-- anon_can_execute = false
-- auto_apply = false
-- production_auto_publish = false
-- high_risk_auto_execute = false
-- canonical_boundary = AB-006
-- canonical_source_version = V223
-- active_scorecard_jobs = 1
