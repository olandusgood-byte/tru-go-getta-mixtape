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


-- Brain checkpoint recovery safety
select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_brain_checkpoint_create',
    'tgg_brain_checkpoint_preview_restore',
    'tgg_brain_checkpoint_restore',
    'tgg_brain_auto_recover_if_unsafe'
  )
order by p.proname;

select public.tgg_brain_checkpoint_preview_restore('TGG-BRAIN-1.0-BASELINE') as baseline_restore_preview;

select
  position('safety_contract_mismatch_restore_blocked' in pg_get_functiondef(p.oid)) > 0 as blocks_safety_contract_mismatch,
  position('production_touched' in pg_get_functiondef(p.oid)) > 0 as exposes_production_touched_flag,
  position('false' in lower(pg_get_functiondef(p.oid))) > 0 as production_touched_false_present
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_checkpoint_restore';

-- Expected:
-- authenticated_can_execute = false
-- anon_can_execute = false
-- restore_allowed = true only when safety contracts match
-- safety_contract_changed = false
-- production_touched = false


-- Brain architecture graph safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_brain_components','tgg_brain_component_links')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_component_impact','tgg_brain_component_find')
order by p.proname;

select
  position('production_affected' in pg_get_functiondef(p.oid)) > 0 as reports_production_impact,
  position('high_risk_affected' in pg_get_functiondef(p.oid)) > 0 as reports_high_risk_impact
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_component_impact';

-- Expected:
-- authenticated_can_execute = false
-- anon_can_execute = false
-- reports_production_impact = true
-- reports_high_risk_impact = true


-- Architecture + lineage safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'tgg_brain_components',
    'tgg_brain_component_links',
    'tgg_brain_lineage_evidence',
    'tgg_brain_architecture_scans'
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
    'tgg_brain_architecture_refresh',
    'tgg_brain_lineage_refresh',
    'tgg_brain_architecture_scan',
    'tgg_brain_architecture_latest'
  )
order by p.proname;

select
  count(*) filter(where active=true) as active_lineage,
  min(confidence) filter(where active=true) as min_confidence,
  max(confidence) filter(where active=true) as max_confidence
from public.tgg_brain_lineage_evidence;

select public.tgg_brain_architecture_latest() as architecture_state;

select
  position('auto_retire_manual_components' in pg_get_functiondef(p.oid)) > 0 as declares_manual_retire_guard,
  position('false' in lower(pg_get_functiondef(p.oid))) > 0 as manual_retire_false_present
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_architecture_refresh';

select count(*) as active_architecture_refresh_jobs
from cron.job
where jobname='tgg-brain-architecture-refresh' and active=true;

-- Expected:
-- authenticated_can_execute = false
-- anon_can_execute = false
-- confidence remains between 1 and 100
-- stale_components = 0 and missing_since_previous = 0 for healthy state
-- canonical_boundary = AB-006
-- canonical_source_version = V223
-- production_auto_publish = false
-- high_risk_auto_execute = false
-- active_architecture_refresh_jobs = 1


-- Change prediction safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='tgg_brain_change_predictions';

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_predict_change_set','tgg_brain_prediction_latest')
order by p.proname;

select public.tgg_brain_predict_change_set('system:creator-os',null,null,2) as canonical_prediction;

select
  position('v_approval:=v_prod or v_high or v_canonical' in replace(pg_get_functiondef(p.oid),' ','')) > 0 as approval_guard_present,
  position('predicted_tests' in pg_get_functiondef(p.oid)) > 0 as predicts_tests,
  position('lineage_based' in pg_get_functiondef(p.oid)) > 0 as lineage_based
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_predict_change_set';

-- Expected:
-- authenticated_can_execute = false
-- anon_can_execute = false
-- Creator OS prediction approval_required = true
-- canonical_affected = true
-- high_risk_affected = true
-- production_affected = false for the current curated Creator OS graph


-- Prediction calibration safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname='tgg_brain_prediction_calibrations';

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_calibrate_prediction','tgg_brain_prediction_accuracy')
order by p.proname;

select
  count(*) as calibration_rows,
  count(*) filter(where calibration_score<0 or calibration_score>100) as invalid_calibration_scores,
  count(*) filter(where component_precision<0 or component_precision>100) as invalid_precision_scores,
  count(*) filter(where component_recall<0 or component_recall>100) as invalid_recall_scores,
  count(*) filter(where test_coverage_match<0 or test_coverage_match>100) as invalid_test_match_scores
from public.tgg_brain_prediction_calibrations;

select
  position('insufficient_evidence' in pg_get_functiondef(p.oid)) > 0 as has_insufficient_evidence_guard,
  position('v_actual_count=0 and v_actual_test_count=0' in replace(pg_get_functiondef(p.oid),' ','')) > 0
    as empty_actuals_do_not_fake_accuracy
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_calibrate_prediction';

-- Expected:
-- RLS = true
-- authenticated_can_execute = false
-- anon_can_execute = false
-- all score invalid counts = 0
-- empty actual evidence => insufficient_evidence


-- Execution evidence-chain safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='tgg_brain_execution_traces';

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_execution_trace_record','tgg_brain_execution_trace_state')
order by p.proname;

select public.tgg_brain_execution_trace_state() as trace_state;

select
  position('production_touched' in pg_get_functiondef(p.oid)) > 0 as checks_production_touched,
  position('high_risk_executed' in pg_get_functiondef(p.oid)) > 0 as checks_high_risk_execution,
  position('canonical_boundary_preserved' in pg_get_functiondef(p.oid)) > 0 as checks_boundary,
  position('trace_status' in pg_get_functiondef(p.oid)) > 0 as emits_trace_status
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_execution_trace_record';

-- Expected:
-- authenticated_can_execute = false
-- anon_can_execute = false
-- production_touched = 0
-- high_risk_executed = 0
-- boundary_violations = 0


-- Uncertainty gate safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='tgg_brain_uncertainty_checks';

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_uncertainty_gate';

select
  position('approval_required' in pg_get_functiondef(p.oid)) > 0 as has_approval_action,
  position('research_required' in pg_get_functiondef(p.oid)) > 0 as has_research_action,
  position('narrow_scope' in pg_get_functiondef(p.oid)) > 0 as has_narrow_scope_action,
  position('expanded_qa' in pg_get_functiondef(p.oid)) > 0 as has_expanded_qa_action,
  position('production_auto_publish' in pg_get_functiondef(p.oid)) > 0 as preserves_production_guard,
  position('high_risk_auto_execute' in pg_get_functiondef(p.oid)) > 0 as preserves_high_risk_guard
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_uncertainty_gate';

-- Expected:
-- authenticated_can_execute = false
-- anon_can_execute = false
-- high-risk/canonical components resolve to approval_required
-- uncertainty never weakens production/high-risk boundaries


-- Structured guardrail + conflict safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_brain_guardrails','tgg_brain_conflicts')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_guardrail_check','tgg_brain_conflict_state')
order by p.proname;

select
  count(*) as active_guardrails,
  count(*) filter(where immutable=true) as immutable_guardrails,
  count(*) filter(where guardrail_key='guardrail:no-auto-production-publish') as production_publish_guard,
  count(*) filter(where guardrail_key='guardrail:no-high-risk-auto-execute') as high_risk_guard,
  count(*) filter(where guardrail_key='guardrail:preserve-ab006-v223') as canonical_guard
from public.tgg_brain_guardrails
where active=true;

select public.tgg_brain_guardrail_check(
  'action',
  'ci:safe-staging-probe',
  jsonb_build_object(
    'production_auto_publish',false,
    'production_promotion',false,
    'high_risk_auto_execute',false,
    'canonical_boundary_change',false,
    'destructive',false,
    'real_money_or_payment_action',false,
    'rights_legal_action',false,
    'secret_credential_action',false
  )
) as safe_guardrail_probe;

update public.tgg_brain_conflicts
set status='resolved',resolved_at=now()
where subject_key='ci:safe-staging-probe' and status='open';

select public.tgg_brain_conflict_state() as conflict_state;

-- Expected:
-- RLS enabled on both tables
-- authenticated_can_execute = false
-- anon_can_execute = false
-- active_guardrails = immutable_guardrails = 8
-- production/high-risk/canonical guard counts = 1 each
-- safe_guardrail_probe.allow_autonomous_execution = true
-- open_conflicts = 0 in healthy baseline


-- Memory hygiene + compaction safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='tgg_brain_memory_archive';

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_memory_compact','tgg_brain_memory_hygiene_state')
order by p.proname;

select public.tgg_brain_memory_hygiene_state() as memory_hygiene;

select
  position("memory_type in ('lesson','qa')" in lower(pg_get_functiondef(p.oid))) > 0 as only_lesson_qa_compacted,
  position('destructive_delete_performed' in pg_get_functiondef(p.oid)) > 0 as destructive_delete_flag_present,
  position('false' in lower(pg_get_functiondef(p.oid))) > 0 as destructive_delete_false_present
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_memory_compact';

-- Expected:
-- RLS enabled on archive table
-- authenticated_can_execute = false
-- anon_can_execute = false
-- exact_duplicate_candidates = 0 after healthy compaction
-- compaction targets lesson/qa only
-- destructive_delete_performed = false


-- Targeted recall + context-pack safety
select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_recall','tgg_brain_context_pack')
order by p.proname;

select public.tgg_brain_context_pack('Creator OS production boundary',6) as context_pack;

select
  count(*) filter(where active=false) as inactive_memories,
  count(*) filter(where active=true) as active_memories
from public.tgg_brain_memory;

select
  position('where m.active=true' in lower(pg_get_functiondef(p.oid))) > 0 as recall_filters_inactive
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_recall';

-- Expected:
-- authenticated_can_execute = false
-- anon_can_execute = false
-- context_pack canonical_boundary = AB-006
-- context_pack canonical_source_version = V223
-- production_auto_publish = false
-- high_risk_auto_execute = false
-- active_guardrails includes production/high-risk/canonical rules
-- recall_filters_inactive = true


-- Structured specification compiler safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_brain_specs','tgg_brain_spec_requirements','tgg_brain_spec_scope')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_brain_spec_create',
    'tgg_brain_spec_add_requirement',
    'tgg_brain_spec_add_scope',
    'tgg_brain_spec_validate',
    'tgg_brain_spec_state'
  )
order by p.proname;

select public.tgg_brain_spec_state() as spec_state;

select
  position('missing_acceptance' in pg_get_functiondef(p.oid))>0 as validates_acceptance,
  position('missing_owner_domain' in pg_get_functiondef(p.oid))>0 as validates_owner,
  position('production_allowed=false' in replace(lower(pg_get_functiondef(p.oid)),' ',''))>0 as requires_nonproduction
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_spec_validate';

-- Expected:
-- RLS enabled on all spec tables
-- authenticated_can_execute=false and anon_can_execute=false
-- production_allowed remains 0 for auto-created specs
-- spec validation requires MUST acceptance + owner domain
-- high-risk / approval-required in-scope items prevent ready state


-- Requirements traceability safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='tgg_brain_requirement_links';

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_requirement_link','tgg_brain_spec_coverage','tgg_brain_spec_mark_complete')
order by p.proname;

select
  position('spec_coverage_incomplete' in pg_get_functiondef(p.oid))>0 as blocks_incomplete_coverage,
  position('tgg_brain_spec_coverage' in pg_get_functiondef(p.oid))>0 as checks_coverage_before_complete
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_spec_mark_complete';

-- Expected:
-- RLS enabled on requirement links
-- authenticated/anon cannot execute internal traceability functions
-- spec completion explicitly blocks incomplete MUST coverage
-- coverage requires implementation + tests + verified execution trace


-- Critical-path planning safety
select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_brain_critical_path','tgg_brain_next_critical_unlocks')
order by p.proname;

select
  position('risk_level=''high''' in replace(lower(pg_get_functiondef(p.oid)),' ',''))>0 as excludes_high_risk,
  position('approval_required' in lower(pg_get_functiondef(p.oid)))>0 as excludes_approval_required,
  position('blocked' in lower(pg_get_functiondef(p.oid)))>0 as excludes_blocked,
  position('dependency_count<>complete_dependencies' in replace(lower(pg_get_functiondef(p.oid)),' ',''))>0
    as requires_dependencies_complete
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_critical_path';

-- Expected:
-- authenticated/anon cannot execute critical-path controls
-- high-risk, approval-required, blocked, and incomplete-dependency steps are not autonomous candidates


-- Safe Speed Booster safety
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_speed_booster_config','tgg_speed_booster_layers')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_speed_booster_state',
    'tgg_speed_booster_effective_batch_size',
    'tgg_speed_booster_layer_plan'
  )
order by p.proname;

select
  enabled,mode,normal_batch_size,boosted_batch_size,hard_max_batch_size,
  require_safety_score,require_clean_architecture,
  require_zero_critical_conflicts,require_clean_execution_trace
from public.tgg_speed_booster_config
where id=1;

select public.tgg_speed_booster_state() as speed_state;
select public.tgg_speed_booster_layer_plan() as speed_layers;

select count(*) as active_watchdog_jobs
from cron.job
where jobname='tgg-autobuilder-continuous-watchdog'
  and active=true
  and schedule='*/5 * * * *';

-- Expected:
-- authenticated_can_execute = false
-- anon_can_execute = false
-- normal_batch_size = 5
-- boosted_batch_size = 15
-- hard_max_batch_size <= 25
-- require_safety_score = 100
-- production_auto_publish = false
-- high_risk_auto_execute = false
-- canonical_boundary = AB-006
-- canonical_source_version = V223
-- active_watchdog_jobs = 1
