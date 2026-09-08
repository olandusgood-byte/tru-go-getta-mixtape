-- TGG Brain sandbox trial gate
-- Internal development/staging validation only. No production traffic or promotion.

create table if not exists public.tgg_brain_trials (
  id uuid primary key default gen_random_uuid(),
  trial_key text not null unique,
  goal_id uuid references public.tgg_brain_goals(id) on delete cascade,
  step_id uuid references public.tgg_brain_goal_steps(id) on delete cascade,
  status text not null default 'prepared'
    check (status in ('prepared','running','passed','failed','blocked','canceled')),
  environment text not null default 'sandbox'
    check (environment in ('sandbox','staging_preview')),
  source_ref text,
  artifact_ref text,
  baseline jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  verdict text,
  production_touched boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_brain_trial_checks (
  id uuid primary key default gen_random_uuid(),
  trial_id uuid not null references public.tgg_brain_trials(id) on delete cascade,
  check_key text not null,
  check_type text not null
    check (check_type in ('schema','security','unit','integration','browser','visual','playtest','performance','regression','dependency')),
  status text not null check (status in ('pass','fail','warning','blocked')),
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  evidence jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  unique(trial_id,check_key)
);

alter table public.tgg_brain_trials enable row level security;
alter table public.tgg_brain_trial_checks enable row level security;
revoke all on public.tgg_brain_trials from anon,authenticated;
revoke all on public.tgg_brain_trial_checks from anon,authenticated;

-- Live functions are already deployed; this migration captures their contracts.
-- All control functions remain postgres-only and security-invoker.
