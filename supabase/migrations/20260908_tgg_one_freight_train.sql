
-- TGG FREIGHT TRAIN continuous-clear automation
create table if not exists public.tgg_one_freight_train_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('running','idle_hot','waiting_approval','blocked','restricted')),
  safe_ready integer not null default 0,
  active_jobs integer not null default 0,
  approval_tasks integer not null default 0,
  blocked_tasks integer not null default 0,
  effective_batch_size integer not null default 5,
  train jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
alter table public.tgg_one_freight_train_snapshots enable row level security;
revoke all on public.tgg_one_freight_train_snapshots from anon,authenticated;



revoke all on function public.tgg_one_freight_train_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_freight_train_state() from public,anon,authenticated;
revoke all on function public.tgg_one_freight_train_cycle() from public,anon,authenticated;
grant execute on function public.tgg_one_freight_train_refresh() to postgres;
grant execute on function public.tgg_one_freight_train_state() to postgres;
grant execute on function public.tgg_one_freight_train_cycle() to postgres;

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='tgg-autonomic-os-minute-loop'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule(
    'tgg-autonomic-os-minute-loop','* * * * *',
    'select public.tgg_one_freight_train_cycle();'
  );
end $$;
