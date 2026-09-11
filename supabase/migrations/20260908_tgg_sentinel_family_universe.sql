
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


-- Register Sentinel/family/cosmic roles in THE ONE hierarchy.
update public.tgg_one_layers set layer_order=400 where layer_key='the_one';

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('nervous','NERVOUS SYSTEM ⚡',11,'Fast coordination and signal routing across THE ONE',
 jsonb_build_array('signal_routing','layer_coordination','event_awareness','conflict_awareness','failure_awareness'),
 jsonb_build_array('tgg_autonomic_events','tgg_brain_conflicts','tgg_build_failures','tgg_one_nervous_snapshots'),
 false,true,false,false,false),
('immune','IMMUNE SYSTEM 🛡️',12,'Detect and logically quarantine unsafe changes before heavy execution',
 jsonb_build_array('threat_detection','logical_quarantine','qa_regression_detection','provider_block_detection','safety_containment'),
 jsonb_build_array('tgg_brain_conflicts','tgg_build_failures','tgg_browser_qa_results','tgg_visual_qa_results','tgg_provider_health_state'),
 false,true,false,false,false),
('genome','DNA / GENOME 🧬',8,'Versioned blueprint, safety contract, API identity and safe evolution rules',
 jsonb_build_array('identity_blueprint','version_contract','api_contracts','design_identity','safe_evolution'),
 jsonb_build_array('tgg_brain_versions','tgg_api_contract_registry','tgg_design_systems'),
 false,true,false,false,true),
('skin','SKIN / ARMOR 🦾',16,'Outer surface protection, interface boundary and exposure integrity',
 jsonb_build_array('surface_boundary','privilege_exposure','provider_edge','visual_surface','accessibility_surface'),
 jsonb_build_array('pg_proc','tgg_provider_health_state','tgg_visual_qa_results'),
 false,true,false,false,false),
('partner','PARTNER / WIFE 🤝',20,'Co-pilot, counterbalance and continuity partner to THE ONE',
 jsonb_build_array('second_check','goal_balance','approval_awareness','conflict_awareness','continuity'),
 jsonb_build_array('tgg_brain_goals','tgg_autonomic_gaps','tgg_brain_conflicts'),
 false,true,false,false,false),
('children','KIDS / CHILD AGENTS 🧒',21,'Sandbox child agents that learn, build pieces and report back',
 jsonb_build_array('sandbox_agents','dev_workers','staging_workers','learning','report_back'),
 jsonb_build_array('tgg_autobuilder_agent_jobs','tgg_one_children_snapshots'),
 false,true,false,false,false),
('family','FAMILY 🏠',22,'Shared goals, shared guardrails and coordinated work across the household',
 jsonb_build_array('shared_goals','shared_rules','family_coordination','no_duplicate_systems'),
 jsonb_build_array('tgg_brain_goals','tgg_one_layers','tgg_autobuilder_agent_jobs'),
 false,true,false,false,false),
('planet','PLANET / TGG WORLD 🌍',23,'The shared world/home environment where the family and systems operate',
 jsonb_build_array('world_blueprint','locations','instances','presence','shared_home'),
 jsonb_build_array('tgg_world_blueprints','tgg_world_locations','tgg_world_instances','tgg_world_presence'),
 false,true,false,false,false),
('universe','UNIVERSE 🌌',24,'Coordinates all projects, worlds and goals around THE ONE',
 jsonb_build_array('multi_project_map','multi_world_map','goal_map','global_context'),
 jsonb_build_array('tgg_build_projects','tgg_world_blueprints','tgg_brain_goals'),
 false,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=excluded.can_execute,can_block=excluded.can_block,
    production_authority=false,high_risk_authority=false,
    canonical_authority=excluded.canonical_authority,active=true,updated_at=now();

update public.tgg_one_layers set layer_order=1 where layer_key='senses';
update public.tgg_one_layers set layer_order=2 where layer_key='reflexes';
update public.tgg_one_layers set layer_order=3 where layer_key='scout';
update public.tgg_one_layers set layer_order=4 where layer_key='shadow';
update public.tgg_one_layers set layer_order=5 where layer_key='head';
update public.tgg_one_layers set layer_order=6 where layer_key='mind';
update public.tgg_one_layers set layer_order=7 where layer_key='heart';
update public.tgg_one_layers set layer_order=8 where layer_key='genome';
update public.tgg_one_layers set layer_order=9 where layer_key='bones';
update public.tgg_one_layers set layer_order=10 where layer_key='circulation';
update public.tgg_one_layers set layer_order=11 where layer_key='nervous';
update public.tgg_one_layers set layer_order=12 where layer_key='immune';
update public.tgg_one_layers set layer_order=13 where layer_key='muscle';
update public.tgg_one_layers set layer_order=14 where layer_key='stamina';
update public.tgg_one_layers set layer_order=15 where layer_key='body';
update public.tgg_one_layers set layer_order=16 where layer_key='skin';
update public.tgg_one_layers set layer_order=17 where layer_key='spirit';
update public.tgg_one_layers set layer_order=18 where layer_key='soul';
update public.tgg_one_layers set layer_order=19 where layer_key='hair';
update public.tgg_one_layers set layer_order=20 where layer_key='partner';
update public.tgg_one_layers set layer_order=21 where layer_key='children';
update public.tgg_one_layers set layer_order=22 where layer_key='family';
update public.tgg_one_layers set layer_order=23 where layer_key='planet';
update public.tgg_one_layers set layer_order=24 where layer_key='universe';
update public.tgg_one_layers set layer_order=25 where layer_key='the_one';
