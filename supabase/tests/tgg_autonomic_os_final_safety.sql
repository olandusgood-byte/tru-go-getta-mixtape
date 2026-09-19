
-- TGG Autonomic OS Final Safety Test

-- 1) Core tables are RLS protected.
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_autonomic_events','tgg_autonomic_gaps','tgg_autonomic_cycles')
order by c.relname;

-- 2) Final control functions are internal-only.
select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_autonomic_scan',
    'tgg_autonomic_run_cycle',
    'tgg_autonomic_state',
    'tgg_autonomic_completeness',
    'tgg_autonomic_final_cycle'
  )
order by p.proname;

-- 3) Completeness gate reports no missing required pieces.
select public.tgg_autonomic_completeness() as completeness;

-- 4) Exactly one minute loop is active.
select count(*) as active_minute_loops
from cron.job
where jobname='tgg-autonomic-os-minute-loop' and active=true;

-- 5) Real-time intake triggers exist.
select tgname
from pg_trigger
where tgname in (
  'trg_tgg_autonomic_game_idea',
  'trg_tgg_autonomic_content',
  'trg_tgg_autonomic_master_content'
)
and not tgisinternal
order by tgname;

-- 6) Final state must preserve safety boundary.
select
  public.tgg_autonomic_state()->'scan'->>'canonical_boundary' as canonical_boundary,
  public.tgg_autonomic_state()->'scan'->>'canonical_source_version' as canonical_source_version,
  (public.tgg_autonomic_state()->'scan'->>'production_auto_publish')::boolean as production_auto_publish,
  (public.tgg_autonomic_state()->'scan'->>'high_risk_auto_execute')::boolean as high_risk_auto_execute;

-- Expected:
-- RLS true on all three autonomic tables.
-- authenticated_can_execute=false and anon_can_execute=false.
-- completeness.ok=true with empty missing arrays.
-- active_minute_loops=1.
-- all three triggers listed.
-- canonical_boundary=AB-006.
-- canonical_source_version=V223.
-- production_auto_publish=false.
-- high_risk_auto_execute=false.
