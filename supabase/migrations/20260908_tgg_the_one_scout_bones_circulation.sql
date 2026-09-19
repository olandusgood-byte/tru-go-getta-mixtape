
-- TGG AUTO SEARCH / SCOUT + BONES + CIRCULATION
create table if not exists public.tgg_one_scout_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('clean','findings','warning','restricted')),
  missing_required_pieces integer not null default 0,
  orphan_build_tasks integer not null default 0,
  orphan_spec_requirements integer not null default 0,
  open_codesync_issues integer not null default 0,
  architecture_stale integer not null default 0,
  architecture_missing integer not null default 0,
  open_build_failures integer not null default 0,
  pending_events integer not null default 0,
  provider_degraded integer not null default 0,
  provider_blocked integer not null default 0,
  findings jsonb not null default '[]'::jsonb,
  searched_at timestamptz not null default now()
);

create table if not exists public.tgg_one_bones_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','warning','restricted')),
  active_components integer not null default 0,
  active_required_links integer not null default 0,
  broken_required_links integer not null default 0,
  stale_components integer not null default 0,
  unhealthy_components integer not null default 0,
  canonical_components integer not null default 0,
  structure jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

create table if not exists public.tgg_one_circulation_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','loaded','warning','restricted')),
  new_events integer not null default 0,
  routed_events integer not null default 0,
  provider_inflight integer not null default 0,
  provider_failed integer not null default 0,
  stale_provider_ops integer not null default 0,
  agent_queued integer not null default 0,
  agent_running integer not null default 0,
  stale_agent_jobs integer not null default 0,
  pending_master_changes integer not null default 0,
  flow jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_scout_snapshots enable row level security;
alter table public.tgg_one_bones_snapshots enable row level security;
alter table public.tgg_one_circulation_snapshots enable row level security;
revoke all on public.tgg_one_scout_snapshots from anon,authenticated;
revoke all on public.tgg_one_bones_snapshots from anon,authenticated;
revoke all on public.tgg_one_circulation_snapshots from anon,authenticated;

-- Exact live definitions follow.


revoke all on function public.tgg_one_scout_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_scout_state() from public,anon,authenticated;
revoke all on function public.tgg_one_bones_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_bones_state() from public,anon,authenticated;
revoke all on function public.tgg_one_circulation_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_circulation_state() from public,anon,authenticated;
revoke all on function public.tgg_one_layer_state(text) from public,anon,authenticated;
revoke all on function public.tgg_one_cycle() from public,anon,authenticated;
revoke all on function public.tgg_one_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_scout_refresh() to postgres;
grant execute on function public.tgg_one_scout_state() to postgres;
grant execute on function public.tgg_one_bones_refresh() to postgres;
grant execute on function public.tgg_one_bones_state() to postgres;
grant execute on function public.tgg_one_circulation_refresh() to postgres;
grant execute on function public.tgg_one_circulation_state() to postgres;
grant execute on function public.tgg_one_layer_state(text) to postgres;
grant execute on function public.tgg_one_cycle() to postgres;
grant execute on function public.tgg_one_completeness() to postgres;
