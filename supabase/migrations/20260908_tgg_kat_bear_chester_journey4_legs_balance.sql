-- TGG KAT + BEAR + CHESTER + JOURNEY 4 + LEGS + BALANCE

create table if not exists public.tgg_one_kat_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('curious','idle','warning','restricted')),
  scout_findings integer not null default 0,
  safe_scout_findings integer not null default 0,
  active_routes integer not null default 0,
  enabled_locations integer not null default 0,
  unfinished_goals integer not null default 0,
  curiosity jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_bear_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('strong','watch','warning','restricted')),
  safety_score numeric not null default 0,
  immune_status text not null default 'healthy',
  bones_status text not null default 'healthy',
  skin_status text not null default 'healthy',
  critical_conflicts integer not null default 0,
  provider_blocked integer not null default 0,
  guard_score integer not null default 0,
  guardian jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_chester_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('guiding','idle','warning','restricted')),
  matrix_ready boolean not null default false,
  lewis_ready boolean not null default false,
  veil_ready boolean not null default false,
  route_count integer not null default 0,
  guide jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_journey4_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('ready','running','complete','waiting','restricted')),
  stage_no integer not null default 1 check(stage_no between 1 and 4),
  stage_key text not null,
  safe_ready integer not null default 0,
  active_jobs integer not null default 0,
  blocker_count integer not null default 0,
  journey jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_legs_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('moving','ready','idle','restricted')),
  safe_ready integer not null default 0,
  active_jobs integer not null default 0,
  gps_ready_steps integer not null default 0,
  journey_stage integer not null default 1,
  stride_size integer not null default 5,
  locomotion jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('stable','watch','warning','restricted')),
  pressure_score integer not null default 0,
  curse_score integer not null default 0,
  bear_guard_score integer not null default 0,
  qa_findings integer not null default 0,
  active_jobs integer not null default 0,
  balance_score integer not null default 0,
  recommended_stride integer not null default 5,
  equilibrium jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_kat_snapshots enable row level security;
alter table public.tgg_one_bear_snapshots enable row level security;
alter table public.tgg_one_chester_snapshots enable row level security;
alter table public.tgg_one_journey4_snapshots enable row level security;
alter table public.tgg_one_legs_snapshots enable row level security;
alter table public.tgg_one_balance_snapshots enable row level security;

revoke all on public.tgg_one_kat_snapshots from anon,authenticated;
revoke all on public.tgg_one_bear_snapshots from anon,authenticated;
revoke all on public.tgg_one_chester_snapshots from anon,authenticated;
revoke all on public.tgg_one_journey4_snapshots from anon,authenticated;
revoke all on public.tgg_one_legs_snapshots from anon,authenticated;
revoke all on public.tgg_one_balance_snapshots from anon,authenticated;



revoke all on function public.tgg_one_kat_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_kat_state() from public,anon,authenticated;
revoke all on function public.tgg_one_bear_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_bear_state() from public,anon,authenticated;
revoke all on function public.tgg_one_chester_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_chester_state() from public,anon,authenticated;
revoke all on function public.tgg_one_journey4_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_journey4_state() from public,anon,authenticated;
revoke all on function public.tgg_one_legs_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_legs_state() from public,anon,authenticated;
revoke all on function public.tgg_one_balance_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_balance_state() from public,anon,authenticated;
revoke all on function public.tgg_one_journey_motion_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_kat_refresh() to postgres;
grant execute on function public.tgg_one_kat_state() to postgres;
grant execute on function public.tgg_one_bear_refresh() to postgres;
grant execute on function public.tgg_one_bear_state() to postgres;
grant execute on function public.tgg_one_chester_refresh() to postgres;
grant execute on function public.tgg_one_chester_state() to postgres;
grant execute on function public.tgg_one_journey4_refresh() to postgres;
grant execute on function public.tgg_one_journey4_state() to postgres;
grant execute on function public.tgg_one_legs_refresh() to postgres;
grant execute on function public.tgg_one_legs_state() to postgres;
grant execute on function public.tgg_one_balance_refresh() to postgres;
grant execute on function public.tgg_one_balance_state() to postgres;
grant execute on function public.tgg_one_journey_motion_completeness() to postgres;

update public.tgg_one_layers set layer_order=2000+layer_order where active=true;

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('kat','KAT / CURIOSITY 🐈',6,'Safe curiosity that searches for unexplored but already-allowed paths without creating work',
 '["safe_curiosity","unexplored_path_awareness","no_fake_work","review_only_not_actionable"]'::jsonb,
 '["tgg_one_scout_state","tgg_one_gps_state","tgg_site_routes","tgg_world_locations"]'::jsonb,false,true,false,false,false),
('bear','BEAR / GUARDIAN 🐻',20,'Heavy stability guardian that reinforces safety before movement and execution',
 '["heavy_guard","stability_shield","protect_body_family_portals_planet","no_head_override"]'::jsonb,
 '["tgg_one_immune_state","tgg_one_bones_state","tgg_one_skin_state","tgg_brain_conflict_state","tgg_provider_health_state"]'::jsonb,false,true,false,false,false),
('legs','LEGS / FEET 🦿',26,'Safe forward motion along the current approved GPS and Journey path',
 '["forward_motion","safe_stride","journey_movement","no_auto_user_movement"]'::jsonb,
 '["tgg_one_freight_train_state","tgg_one_gps_state","tgg_one_journey4_state","tgg_one_lungs_state"]'::jsonb,false,true,false,false,false),
('balance','BALANCE / EQUILIBRIUM ⚖️',27,'Stability and braking control before HANDS and BODY execute movement',
 '["stability","braking","fall_prevention","stride_throttle"]'::jsonb,
 '["tgg_one_lungs_state","tgg_one_curse_state","tgg_one_bear_state","tgg_one_vision_state","tgg_one_freight_train_state"]'::jsonb,false,true,false,false,false),
('chester','CHESTER / GRIN GUIDE 😼',41,'Original grinning portal guide that offers route hints without moving the user',
 '["portal_hints","matrix_ready","lewis_ready","veil_ready","no_character_copy"]'::jsonb,
 '["tgg_matrix_gateway_health_state","tgg_lewis_portal_health_state","tgg_veil_health_state","tgg_site_routes"]'::jsonb,false,true,false,false,false),
('journey4','JOURNEY 4 🚀',42,'Four-stage autonomous journey: discover, prepare, traverse, verify and return',
 '["discover","prepare","traverse","verify_return","automatic_next_stage"]'::jsonb,
 '["tgg_one_journey4_state","tgg_one_freight_train_state","tgg_one_vision_state","tgg_one_gps_state","tgg_one_hunter_state","tgg_one_hands_state"]'::jsonb,false,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

-- Final order is validated by safety test; THE ONE remains last.
