
-- TGG THE VEIL + Matrix authorization safety

-- RLS and owner policies.
select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_matrix_gateway_sessions','tgg_veil_health_snapshots')
order by c.relname;

select policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public'
  and tablename='tgg_matrix_gateway_sessions'
  and policyname in (
    'matrix_gateway_select_own',
    'matrix_gateway_insert_own',
    'matrix_gateway_update_own'
  )
order by policyname;

-- Auth surface.
select p.proname,
       p.prosecdef,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_veil_route_decision',
    'tgg_matrix_gateway_enter',
    'tgg_matrix_gateway_next',
    'tgg_matrix_gateway_exit'
  )
order by p.proname;

-- Health/completeness.
select public.tgg_veil_health_refresh() as veil_health;
select public.tgg_one_veiled_matrix_completeness() as completeness;

-- Layer order.
select layer_key,display_name,layer_order,production_authority,high_risk_authority
from public.tgg_one_layers
where active=true
order by layer_order;

-- Minute loop.
select jobid,jobname,schedule,command,active
from cron.job
where jobname='tgg-autonomic-os-minute-loop';

-- Expected:
-- matrix session + veil tables RLS=true.
-- select/insert/update session policies are owner-scoped.
-- authenticated can execute route decision + enter/next/exit; anon cannot.
-- veil health is healthy.
-- artist Matrix routes are protected by artist/admin decision.
-- 27 active total layers, veil before matrix_gateway.
-- minute loop calls tgg_one_veiled_matrix_cycle().
-- production/high-risk authority remains false.
-- AB-006 / V223 preserved.
