-- TGG Brain sandbox trial safety contract.

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_brain_trials','tgg_brain_trial_checks')
order by c.relname;

select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_brain_trial_prepare',
    'tgg_brain_trial_start',
    'tgg_brain_trial_record_check',
    'tgg_brain_trial_finalize',
    'tgg_brain_trial_ready_for_staging'
  )
order by p.proname;

select
  position('production_touched' in pg_get_functiondef(p.oid)) > 0 as tracks_production_touch,
  position('high_risk_requires_approval' in pg_get_functiondef(p.oid)) > 0 as blocks_high_risk,
  position('sandbox_trial_requires_development_only_goal' in pg_get_functiondef(p.oid)) > 0 as requires_dev_only
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_trial_prepare';

select
  position('safe_for_staging' in pg_get_functiondef(p.oid)) > 0 as has_safe_verdict,
  position('repair_and_retry' in pg_get_functiondef(p.oid)) > 0 as has_repair_verdict,
  position('do_not_advance' in pg_get_functiondef(p.oid)) > 0 as has_block_verdict
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_brain_trial_finalize';
