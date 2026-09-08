
-- TGG HUNTER + LIVER/KIDNEYS + DREAM

create table if not exists public.tgg_one_hunter_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('idle','tracking','warning','restricted')),
  candidate_count integer not null default 0,
  safe_candidate_count integer not null default 0,
  review_only_count integer not null default 0,
  target_type text,
  target_key text,
  target_score numeric,
  target jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_hunts (
  id uuid primary key default gen_random_uuid(),
  hunt_key text not null unique,
  target_type text not null,
  target_key text not null,
  status text not null default 'tracking'
    check (status in ('tracking','caught','verified','gated','abandoned')),
  score numeric not null default 0,
  reason jsonb not null default '{}'::jsonb,
  production_allowed boolean not null default false,
  high_risk_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tgg_one_detox_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','loaded','warning','restricted')),
  duplicate_memory_candidates integer not null default 0,
  archived_memory_rows integer not null default 0,
  open_build_failures integer not null default 0,
  stale_idea_claims integer not null default 0,
  stale_agent_jobs integer not null default 0,
  detox jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_dream_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','warning','restricted')),
  reflection jsonb not null default '{}'::jsonb,
  compaction jsonb not null default '{}'::jsonb,
  architecture jsonb not null default '{}'::jsonb,
  lineage jsonb not null default '{}'::jsonb,
  dream jsonb not null default '{}'::jsonb,
  dreamed_at timestamptz not null default now()
);

alter table public.tgg_one_hunter_snapshots enable row level security;
alter table public.tgg_one_hunts enable row level security;
alter table public.tgg_one_detox_snapshots enable row level security;
alter table public.tgg_one_dream_snapshots enable row level security;
revoke all on public.tgg_one_hunter_snapshots from anon,authenticated;
revoke all on public.tgg_one_hunts from anon,authenticated;
revoke all on public.tgg_one_detox_snapshots from anon,authenticated;
revoke all on public.tgg_one_dream_snapshots from anon,authenticated;



revoke all on function public.tgg_one_hunter_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_hunter_state() from public,anon,authenticated;
revoke all on function public.tgg_one_detox_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_detox_state() from public,anon,authenticated;
revoke all on function public.tgg_one_detox_cycle() from public,anon,authenticated;
revoke all on function public.tgg_one_dream_cycle() from public,anon,authenticated;
revoke all on function public.tgg_one_dream_state() from public,anon,authenticated;
revoke all on function public.tgg_one_hunter_detox_completeness() from public,anon,authenticated;
revoke all on function public.tgg_one_hunter_detox_cycle() from public,anon,authenticated;
grant execute on function public.tgg_one_hunter_refresh() to postgres;
grant execute on function public.tgg_one_hunter_state() to postgres;
grant execute on function public.tgg_one_detox_refresh() to postgres;
grant execute on function public.tgg_one_detox_state() to postgres;
grant execute on function public.tgg_one_detox_cycle() to postgres;
grant execute on function public.tgg_one_dream_cycle() to postgres;
grant execute on function public.tgg_one_dream_state() to postgres;
grant execute on function public.tgg_one_hunter_detox_completeness() to postgres;
grant execute on function public.tgg_one_hunter_detox_cycle() to postgres;

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='tgg-autonomic-os-minute-loop'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule(
    'tgg-autonomic-os-minute-loop','* * * * *',
    'select public.tgg_one_hunter_detox_cycle();'
  );

  for v_jobid in select jobid from cron.job where jobname='tgg-one-dream-cycle'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule(
    'tgg-one-dream-cycle','47 */6 * * *',
    'select public.tgg_one_dream_cycle();'
  );
end $$;
