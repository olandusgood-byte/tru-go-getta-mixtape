
-- TGG LUNGS + METABOLISM pressure and resource governor
create table if not exists public.tgg_one_lungs_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','loaded','warning','restricted')),
  queued_jobs integer not null default 0,
  running_jobs integer not null default 0,
  stale_jobs integer not null default 0,
  recent_failures integer not null default 0,
  avg_cycle_seconds numeric not null default 0,
  pressure_score integer not null default 0,
  recommended_batch_size integer not null default 5,
  breathing jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_metabolism_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','loaded','warning','restricted')),
  effective_batch_size integer not null default 5,
  build_budget integer not null default 0,
  qa_reserve integer not null default 0,
  recovery_reserve integer not null default 0,
  evidence_reserve integer not null default 0,
  active_load integer not null default 0,
  budget jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_lungs_snapshots enable row level security;
alter table public.tgg_one_metabolism_snapshots enable row level security;
revoke all on public.tgg_one_lungs_snapshots from anon,authenticated;
revoke all on public.tgg_one_metabolism_snapshots from anon,authenticated;



revoke all on function public.tgg_one_lungs_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_lungs_state() from public,anon,authenticated;
revoke all on function public.tgg_one_metabolism_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_metabolism_state() from public,anon,authenticated;
revoke all on function public.tgg_one_breathing_completeness() from public,anon,authenticated;
revoke all on function public.tgg_one_breathing_cycle() from public,anon,authenticated;
grant execute on function public.tgg_one_lungs_refresh() to postgres;
grant execute on function public.tgg_one_lungs_state() to postgres;
grant execute on function public.tgg_one_metabolism_refresh() to postgres;
grant execute on function public.tgg_one_metabolism_state() to postgres;
grant execute on function public.tgg_one_breathing_completeness() to postgres;
grant execute on function public.tgg_one_breathing_cycle() to postgres;

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='tgg-autonomic-os-minute-loop'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule(
    'tgg-autonomic-os-minute-loop','* * * * *',
    'select public.tgg_one_breathing_cycle();'
  );
end $$;
