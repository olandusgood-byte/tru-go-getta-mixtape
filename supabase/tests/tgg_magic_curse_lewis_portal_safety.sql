
-- TGG MAGIC + CURSE BREAKER + LEWIS PORTAL safety

select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'tgg_one_magic_snapshots','tgg_one_curse_snapshots',
    'tgg_lewis_portal_sessions','tgg_lewis_portal_health_snapshots'
  )
order by c.relname;

select p.proname,p.prosecdef,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_magic_refresh','tgg_one_magic_state',
    'tgg_one_curse_refresh','tgg_one_curse_state',
    'tgg_lewis_portal_enter','tgg_lewis_portal_next',
    'tgg_lewis_portal_exit','tgg_lewis_portal_state',
    'tgg_lewis_portal_health_refresh','tgg_one_magic_portal_completeness'
  )
order by p.proname;

select policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public' and tablename='tgg_lewis_portal_sessions'
order by policyname;

select public.tgg_one_magic_refresh() as magic;
select public.tgg_one_curse_refresh() as curse;
select public.tgg_lewis_portal_health_refresh() as lewis_portal;
select public.tgg_one_magic_portal_completeness() as completeness;

select layer_key,display_name,layer_order,production_authority,high_risk_authority
from public.tgg_one_layers
where active=true
order by layer_order;

-- Expected:
-- 39 active layers.
-- MAGIC is evidence-derived only, cannot raise ceiling/bypass HEAD.
-- CURSE is regression/debt detection only, no destructive actions.
-- Lewis sessions are owner-scoped authenticated only.
-- anon cannot execute Lewis portal user functions.
-- Rabbit Hole and Wardrobe Gate reuse existing route spine; no duplicate world.
-- production/high-risk/canonical authority unchanged.
-- AB-006 / V223 preserved.
