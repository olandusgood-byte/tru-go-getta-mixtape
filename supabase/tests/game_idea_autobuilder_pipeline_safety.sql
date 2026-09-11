-- TGG self-building game idea pipeline safety contract.

-- Idea inbox exists and RLS is enabled.
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='tgg_game_idea_inbox';

-- Authenticated users can submit/read only their own ideas; direct updates/deletes stay closed.
select
  has_table_privilege('authenticated','public.tgg_game_idea_inbox','SELECT') as can_select,
  has_table_privilege('authenticated','public.tgg_game_idea_inbox','INSERT') as can_insert,
  has_table_privilege('authenticated','public.tgg_game_idea_inbox','UPDATE') as can_update,
  has_table_privilege('authenticated','public.tgg_game_idea_inbox','DELETE') as can_delete;

-- Public submission is client-scoped; internal claim/heartbeat/recovery/state are postgres-only.
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
  has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_game_idea_submit',
    'tgg_game_idea_claim_batch',
    'tgg_game_idea_heartbeat',
    'tgg_game_idea_recover_stale',
    'tgg_game_idea_pipeline_state'
  )
order by p.proname;

-- Self-heal columns must exist.
select column_name,is_nullable,column_default
from information_schema.columns
where table_schema='public'
  and table_name='tgg_game_idea_inbox'
  and column_name in ('retry_count','max_retries','claimed_at','last_heartbeat_at')
order by column_name;

-- Pipeline advertises the safety boundary.
select public.tgg_game_idea_pipeline_state() as pipeline_state;

-- Stale recovery is internal-only and bounded by max_retries.
select
  position('retry_count < max_retries' in pg_get_functiondef(p.oid)) > 0 as has_retry_guard,
  position('retry_count >= max_retries' in pg_get_functiondef(p.oid)) > 0 as has_retry_exhaustion_guard,
  position('last_heartbeat_at' in pg_get_functiondef(p.oid)) > 0 as uses_worker_heartbeat,
  position('auto_recovered_stale_worker' in pg_get_functiondef(p.oid)) > 0 as records_recovery
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_game_idea_recover_stale';

-- Watchdog must call stale recovery before each build cycle.
select
  position('tgg_game_idea_recover_stale' in pg_get_functiondef(p.oid)) > 0 as watchdog_runs_idea_recovery,
  position('production_auto_claim_blocked' in pg_get_functiondef(p.oid)) > 0 as keeps_production_guard,
  position('high_risk_auto_claim_blocked' in pg_get_functiondef(p.oid)) > 0 as keeps_high_risk_guard
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_autobuilder_watchdog';

-- Expected invariants:
-- production_auto_publish = false
-- high_risk_auto_execute = false
-- authenticated/anon cannot execute claim, heartbeat, recovery, or pipeline-state functions
-- retry_count never automatically exceeds max_retries; exhausted work becomes blocked
