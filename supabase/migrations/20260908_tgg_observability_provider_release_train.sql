
-- TGG Observability + Provider Health + Release Train
-- Internal-only monitoring and staging packaging. No production promotion.

create table if not exists public.tgg_provider_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null,
  health_status text not null
    check (health_status in ('healthy','ready','disabled','degraded','blocked','unknown')),
  enabled boolean,
  endpoint_configured boolean,
  handoff_status text,
  open_operations integer not null default 0,
  failed_operations integer not null default 0,
  reconciliation_exceptions integer not null default 0,
  external_action_required boolean not null default false,
  auto_repair_allowed boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create index if not exists tgg_provider_health_snapshots_provider_checked_idx
on public.tgg_provider_health_snapshots(provider_key,checked_at desc);

alter table public.tgg_provider_health_snapshots enable row level security;
revoke all on public.tgg_provider_health_snapshots from anon,authenticated;

create table if not exists public.tgg_release_trains (
  id uuid primary key default gen_random_uuid(),
  train_key text not null unique,
  status text not null default 'planning'
    check (status in ('planning','ready','blocked','staged','complete','canceled')),
  target_environment text not null default 'staging'
    check (target_environment in ('development','staging')),
  candidate_count integer not null default 0,
  production_promotion_allowed boolean not null default false,
  manifest jsonb not null default '[]'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_release_trains enable row level security;
revoke all on public.tgg_release_trains from anon,authenticated;

create table if not exists public.tgg_observability_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','warning','restricted')),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.tgg_observability_snapshots enable row level security;
revoke all on public.tgg_observability_snapshots from anon,authenticated;

-- Functions are defined in the live migration source and remain postgres-only.
-- Runtime invariants:
-- * Provider health reads existing config/handoff/operations/reconciliation.
-- * "No action required" handoff text is never treated as an external blocker.
-- * Release Train excludes canary traffic and production promotion.
-- * Empty candidate sets return no_candidates and do not create new train records.
-- * Observability is read-only aggregation.
-- * AB-006 / V223 remains canonical.
-- * production_auto_publish=false
-- * production_promotion_allowed=false
-- * high_risk_auto_execute=false

-- Required function names:
-- public.tgg_provider_health_refresh()
-- public.tgg_provider_health_state()
-- public.tgg_autonomic_provider_sync()
-- public.tgg_release_train_plan(integer)
-- public.tgg_release_train_state()
-- public.tgg_observability_state()
