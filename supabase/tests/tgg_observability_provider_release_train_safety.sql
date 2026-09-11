
-- TGG Provider Health + Release Train + Observability Safety

-- RLS on all new internal tables.
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'tgg_provider_health_snapshots',
    'tgg_release_trains',
    'tgg_observability_snapshots'
  )
order by c.relname;

-- Internal-only function execution.
select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_provider_health_refresh',
    'tgg_provider_health_state',
    'tgg_autonomic_provider_sync',
    'tgg_release_train_plan',
    'tgg_release_train_state',
    'tgg_observability_state'
  )
order by p.proname;

-- Provider health must never perform production changes.
select
  (public.tgg_provider_health_refresh()->>'production_change_performed')::boolean as provider_production_change;

-- Release train must exclude canary/production promotion.
select public.tgg_release_train_plan(15) as release_train_probe;

-- Unified state must preserve final boundary.
select
  public.tgg_observability_state()->>'status' as observability_status,
  public.tgg_observability_state()->>'canonical_boundary' as canonical_boundary,
  public.tgg_observability_state()->>'canonical_source_version' as canonical_source_version,
  (public.tgg_observability_state()->>'production_auto_publish')::boolean as production_auto_publish,
  (public.tgg_observability_state()->>'production_promotion_allowed')::boolean as production_promotion_allowed,
  (public.tgg_observability_state()->>'high_risk_auto_execute')::boolean as high_risk_auto_execute;

-- Final completeness includes provider/observability/release components.
select public.tgg_autonomic_completeness() as completeness;

-- Expected:
-- RLS=true.
-- anon/authenticated cannot execute internal functions.
-- provider_production_change=false.
-- release train no_candidates or safe staging-only manifest.
-- production_auto_publish=false.
-- production_promotion_allowed=false.
-- high_risk_auto_execute=false.
-- canonical_boundary=AB-006.
-- canonical_source_version=V223.
-- completeness.ok=true.
