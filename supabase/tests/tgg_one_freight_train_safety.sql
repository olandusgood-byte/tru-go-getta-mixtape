
-- TGG FREIGHT TRAIN safety

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname='tgg_one_freight_train_snapshots';

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_freight_train_refresh',
    'tgg_one_freight_train_state',
    'tgg_one_freight_train_cycle'
  )
order by p.proname;

select public.tgg_one_freight_train_refresh() as train;
select jobid,jobname,schedule,command,active
from cron.job
where jobname='tgg-autonomic-os-minute-loop';

-- Expected:
-- RLS=true.
-- internal functions postgres-only.
-- train heartbeat every minute.
-- continuous_clear=true.
-- manual_restart_required=false.
-- effective batch <= lungs recommendation <= speed booster <=25.
-- production/high-risk/approval gates preserved.
-- AB-006 / V223 preserved.
