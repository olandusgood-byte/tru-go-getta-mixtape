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

-- Public submission is security-invoker; internal claiming is postgres-only.
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
  has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_game_idea_submit','tgg_game_idea_claim_batch','tgg_game_idea_pipeline_state')
order by p.proname;

-- Pipeline must advertise the production/high-risk boundary.
select public.tgg_game_idea_pipeline_state() as pipeline_state;

-- Expected invariants:
-- production_auto_publish = false
-- high_risk_auto_execute = false
