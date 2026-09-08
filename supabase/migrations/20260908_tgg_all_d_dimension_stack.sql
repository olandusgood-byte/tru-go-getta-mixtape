-- TGG ALL-D / N-DIMENSION STACK

alter table public.tgg_one_dimension_snapshots
  drop constraint if exists tgg_one_dimension_snapshots_dimension_key_check;

alter table public.tgg_one_dimension_snapshots
  add constraint tgg_one_dimension_snapshots_dimension_key_check
  check (
    dimension_key='d'
    or (
      dimension_key ~ '^[1-9][0-9]?d$'
      and regexp_replace(dimension_key,'d$','')::integer between 1 and 64
    )
  );

create table if not exists public.tgg_one_dimension_registry (
  dimension_no integer primary key check(dimension_no between 0 and 64),
  dimension_key text not null unique,
  display_name text not null,
  meaning text not null,
  source_systems jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  frequency_model boolean not null default false,
  production_authority boolean not null default false,
  high_risk_authority boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tgg_one_dimension_registry enable row level security;
revoke all on public.tgg_one_dimension_registry from anon,authenticated;

insert into public.tgg_one_dimension_registry(
  dimension_no,dimension_key,display_name,meaning,source_systems
) values
(0,'d','D / 0D · DATA POINT','Raw current system state','["tgg_one_layers","tgg_site_routes","tgg_world_locations"]'::jsonb),
(1,'1d','1D / DIRECTION ➡️','Next safe direction or hold position','["tgg_one_gps_state","tgg_one_hunter_state","tgg_one_freight_train_state"]'::jsonb),
(2,'2d','2D / PLANE 🗺️','Interface, route and layout plane','["tgg_site_routes","tgg_one_vision_state"]'::jsonb),
(3,'3d','3D / WORLD 🌍','Spatial TGG World locations, instances and presence','["tgg_world_locations","tgg_world_instances","tgg_world_presence"]'::jsonb),
(4,'4d','4D / TIME-MEMORY 🕰️','Continuity through memory, decisions and time','["tgg_brain_memory","tgg_brain_decisions","tgg_brain_memory_hygiene_state"]'::jsonb),
(5,'5d','5D / LOVE-EMPATHY ❤️','Creator, user and collaboration value for already-safe work','["tgg_creator_action_queue","tgg_collaboration_requests","tgg_creator_growth_activity"]'::jsonb),
(6,'6d','6D / SCENARIOS 🎭','Alternative safe future scenarios and simulations','["tgg_brain_simulations","tgg_brain_change_predictions"]'::jsonb),
(7,'7d','7D / PERSPECTIVES 👥','Multi-agent and stakeholder viewpoints without overriding safety','["tgg_autobuilder_agent_jobs","tgg_one_children_state","tgg_one_partner_state","tgg_one_family_state"]'::jsonb),
(8,'8d','8D / ECOSYSTEM 🌐','Cross-system project, provider, world and creator ecosystem state','["tgg_build_projects","tgg_provider_health_state","tgg_one_planet_state","tgg_one_universe_state"]'::jsonb),
(9,'9d','9D / GOVERNANCE ⚖️','Guardrails, approvals, conflicts, canonical boundaries and policy','["tgg_brain_guardrails","tgg_brain_conflicts","tgg_brain_latest_scorecard","tgg_veil_health_state"]'::jsonb),
(10,'10d','10D / UNIFIED SIMULATION 🧠🌌','Unified read-only model of system, journey and universe before action','["tgg_one_magic_portal_completeness","tgg_one_journey4_state","tgg_one_freight_train_state","tgg_one_universe_state"]'::jsonb)
on conflict(dimension_no) do update
set dimension_key=excluded.dimension_key,display_name=excluded.display_name,
    meaning=excluded.meaning,source_systems=excluded.source_systems,
    active=true,frequency_model=false,production_authority=false,
    high_risk_authority=false,updated_at=now();

insert into public.tgg_one_dimension_registry(
  dimension_no,dimension_key,display_name,meaning,source_systems,
  active,frequency_model,production_authority,high_risk_authority
)
select gs,gs::text||'d',gs::text||'D / EXTENSIBLE DIMENSION',
       'Reserved multidimensional context slot; no invented semantics until real evidence sources are defined',
       '[]'::jsonb,true,false,false,false
from generate_series(11,64) gs
on conflict(dimension_no) do update
set dimension_key=excluded.dimension_key,display_name=excluded.display_name,
    meaning=excluded.meaning,source_systems=excluded.source_systems,
    active=true,frequency_model=false,production_authority=false,
    high_risk_authority=false,updated_at=now();



revoke all on function public.tgg_one_dimension_nd_refresh(integer) from public,anon,authenticated;
revoke all on function public.tgg_one_dimension_all_refresh(integer) from public,anon,authenticated;
revoke all on function public.tgg_one_dimension_registry_state() from public,anon,authenticated;
revoke all on function public.tgg_one_all_d_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_dimension_nd_refresh(integer) to postgres;
grant execute on function public.tgg_one_dimension_all_refresh(integer) to postgres;
grant execute on function public.tgg_one_dimension_registry_state() to postgres;
grant execute on function public.tgg_one_all_d_completeness() to postgres;

update public.tgg_one_layers set layer_order=1200 where layer_key='the_one';
insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values(
  'dimensions','ALL-D / N-DIMENSION STACK ∞',39,
  'Grounded multidimensional context stack from D/0D through 64D with no frequency model',
  '["0d_raw_state","1d_direction","2d_interface","3d_world","4d_time_memory","5d_empathy_value","6d_scenarios","7d_perspectives","8d_ecosystem","9d_governance","10d_unified_simulation","11d_to_64d_reserved_evidence_slots"]'::jsonb,
  '["tgg_one_dimension_registry","tgg_one_dimension_snapshots","tgg_one_dimension_nd_refresh","tgg_one_dimension_all_refresh"]'::jsonb,
  false,true,false,false,false
)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();
update public.tgg_one_layers set layer_order=40 where layer_key='the_one';
