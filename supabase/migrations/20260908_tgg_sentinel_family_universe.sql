
-- TGG Sentinel organism + family universe expansion.
-- Internal-only. No production/high-risk/canonical authority added.

create table if not exists public.tgg_one_nervous_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','busy','warning','restricted')),
  fresh_events integer not null default 0,
  routed_events integer not null default 0,
  unprocessed_events integer not null default 0,
  open_conflicts integer not null default 0,
  open_build_failures integer not null default 0,
  signal_load integer not null default 0,
  coordination jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_immune_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','alert','restricted')),
  critical_conflicts integer not null default 0,
  blocked_conflicts integer not null default 0,
  high_open_failures integer not null default 0,
  current_qa_regressions integer not null default 0,
  provider_blocked integer not null default 0,
  quarantine_candidates integer not null default 0,
  immunity jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_genome_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','warning','restricted')),
  active_brain_versions integer not null default 0,
  api_contracts integer not null default 0,
  active_design_systems integer not null default 0,
  safety_contract_ok boolean not null default false,
  canonical_identity_ok boolean not null default false,
  genome jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_skin_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','warning','restricted')),
  unsafe_one_function_exposures integer not null default 0,
  provider_blocked integer not null default 0,
  current_visual_regressions integer not null default 0,
  current_accessibility_findings integer not null default 0,
  armor jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_partner_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','waiting','warning','restricted')),
  open_goals integer not null default 0,
  approval_gates integer not null default 0,
  conflict_count integer not null default 0,
  balance jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_children_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','busy','warning','restricted')),
  queued_children integer not null default 0,
  running_children integer not null default 0,
  finished_children integer not null default 0,
  failed_children integer not null default 0,
  sandbox_only boolean not null default true,
  child_state jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_family_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','busy','warning','restricted')),
  active_family_roles integer not null default 0,
  open_shared_goals integer not null default 0,
  child_agents_active integer not null default 0,
  family_state jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_planet_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','busy','warning','restricted')),
  active_blueprints integer not null default 0,
  enabled_locations integer not null default 0,
  active_instances integer not null default 0,
  active_presence integer not null default 0,
  planet_state jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_universe_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','busy','warning','restricted')),
  active_projects integer not null default 0,
  active_goals integer not null default 0,
  active_world_blueprints integer not null default 0,
  universe_state jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_nervous_snapshots enable row level security;
alter table public.tgg_one_immune_snapshots enable row level security;
alter table public.tgg_one_genome_snapshots enable row level security;
alter table public.tgg_one_skin_snapshots enable row level security;
alter table public.tgg_one_partner_snapshots enable row level security;
alter table public.tgg_one_children_snapshots enable row level security;
alter table public.tgg_one_family_snapshots enable row level security;
alter table public.tgg_one_planet_snapshots enable row level security;
alter table public.tgg_one_universe_snapshots enable row level security;

revoke all on public.tgg_one_nervous_snapshots from anon,authenticated;
revoke all on public.tgg_one_immune_snapshots from anon,authenticated;
revoke all on public.tgg_one_genome_snapshots from anon,authenticated;
revoke all on public.tgg_one_skin_snapshots from anon,authenticated;
revoke all on public.tgg_one_partner_snapshots from anon,authenticated;
revoke all on public.tgg_one_children_snapshots from anon,authenticated;
revoke all on public.tgg_one_family_snapshots from anon,authenticated;
revoke all on public.tgg_one_planet_snapshots from anon,authenticated;
revoke all on public.tgg_one_universe_snapshots from anon,authenticated;



do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='tgg-autonomic-os-minute-loop'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule(
    'tgg-autonomic-os-minute-loop','* * * * *',
    'select public.tgg_one_family_universe_cycle();'
  );
end $$;
