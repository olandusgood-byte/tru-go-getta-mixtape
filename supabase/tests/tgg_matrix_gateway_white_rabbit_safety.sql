
-- TGG Matrix Gateway / White Rabbit safety

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_matrix_gateway_sessions','tgg_matrix_gateway_health_snapshots')
order by c.relname;

select p.proname,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_matrix_gateway_enter','tgg_matrix_gateway_next',
    'tgg_matrix_gateway_exit','tgg_matrix_gateway_state'
  )
order by p.proname;

select public.tgg_matrix_gateway_health_refresh() as health;
select public.tgg_one_matrix_total_completeness() as completeness;

select layer_key,display_name,layer_order,production_authority,high_risk_authority
from public.tgg_one_layers
where active=true
order by layer_order;

select jobid,jobname,schedule,command,active
from cron.job
where jobname='tgg-autonomic-os-minute-loop';

-- Expected:
-- gateway sessions RLS=true.
-- authenticated=true and anon=false for user gateway functions.
-- health routes entry/rabbit/exit all true.
-- matrix gateway has no production/high-risk authority.
-- 26 total layers, THE ONE last.
-- minute loop calls tgg_one_matrix_cycle().
-- AB-006 / V223 preserved.
