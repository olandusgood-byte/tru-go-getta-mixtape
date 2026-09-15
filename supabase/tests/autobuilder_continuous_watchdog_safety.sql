-- TGG Auto Builder continuous watchdog safety contract.
-- Read-only regression checks; no production mutation.

-- 1) Controller should exist and remain bounded.
select id, enabled, mode, max_batch_size, status
from public.tgg_autobuilder_controller
where id=1;

-- 2) Auto-claim function must exclude production, high-risk, and historical-only work.
select
  position('target_environment' in pg_get_functiondef(p.oid)) > 0 as checks_target_environment,
  position('production' in pg_get_functiondef(p.oid)) > 0 as blocks_production,
  position('risk_level <> ''high''' in pg_get_functiondef(p.oid)) > 0 as blocks_high_risk,
  position('historical_only' in pg_get_functiondef(p.oid)) > 0 as checks_historical_only,
  position('auto_builder_claim_allowed' in pg_get_functiondef(p.oid)) > 0 as checks_claim_permission
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='tgg_build_claim_ready_batch';

-- 3) Detect-state must expose explicit safety flags and V223 boundary.
select public.tgg_autobuilder_detect_state() as autobuilder_state;

-- Expected invariant in returned JSON:
--   production_auto_claim_blocked = true
--   high_risk_auto_claim_blocked = true
--   historical_noncanonical_excluded = true
--   canonical_boundary = "AB-006"
--   canonical_source_version = "V223"

-- 4) Watchdog must be postgres-only.
select
  has_function_privilege('postgres','public.tgg_autobuilder_watchdog()','EXECUTE') as postgres_can_execute,
  has_function_privilege('authenticated','public.tgg_autobuilder_watchdog()','EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon','public.tgg_autobuilder_watchdog()','EXECUTE') as anon_can_execute;

-- Expected:
--   postgres_can_execute = true
--   authenticated_can_execute = false
--   anon_can_execute = false

-- 5) Continuous watchdog cron must exist once and be active.
select count(*) as active_watchdog_jobs
from cron.job
where jobname='tgg-autobuilder-continuous-watchdog'
  and active=true;

-- Expected:
--   active_watchdog_jobs = 1

-- 6) No existing production release may be eligible for automatic claiming.
select count(*) as production_auto_claim_candidates
from public.tgg_build_tasks t
join public.tgg_build_milestones m on m.id=t.milestone_id
join public.tgg_build_releases r on r.id=m.release_id
where t.status='ready'
  and r.target_environment='production'
  and t.risk_level<>'high'
  and coalesce((r.metadata->>'auto_builder_claim_allowed')::boolean,true)=true;

-- Expected:
--   production_auto_claim_candidates = 0
