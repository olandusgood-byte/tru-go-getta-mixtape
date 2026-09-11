-- TGG GUARDED MOTION PACK: JACK + ANIMAL + ORACLE + CHICKEN + ELEVATOR + MASK

insert into public.tgg_brain_guardrails(
  guardrail_key,category,rule,severity,action,active,immutable,source_ref
) values
(
  'guardrail:no-hexes','risk',
  '{"field":"hex_curse_sabotage_or_supernatural_action","forbidden_value":true,"interpretation":"hex/curse language is metaphor-only for regressions, debt, bad patterns, or safety warnings"}'::jsonb,
  'critical','block',true,true,'User explicit NO HEXES rule'
),
(
  'guardrail:no-forcing-evil','risk',
  '{"forbid_coercion":true,"forbid_harmful_forced_actions":true,"forbid_sabotage":true,"forbid_forced_identity_or_persona":true,"forbid_consent_bypass":true,"forbid_using_evil_language_as_authority":true,"allow_safe_metaphor_only":true}'::jsonb,
  'critical','block',true,true,'User explicit NO FORCING EVIL rule'
)
on conflict(guardrail_key) do update
set rule=excluded.rule,severity='critical',action='block',
    active=true,immutable=true,source_ref=excluded.source_ref,updated_at=now();

create table if not exists public.tgg_one_jack_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('idle','watching','verified','gated','restricted')),
  target_type text,target_key text,target_status text,
  evidence_count integer not null default 0,
  review_only boolean not null default false,
  watch jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_animal_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('calm','alert','retreat','restricted')),
  instinct_score integer not null default 0,
  instinct jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_chicken_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('cross','wait','reroute','restricted')),
  confidence_score integer not null default 0,
  decision jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_oracle_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('clear','uncertain','warning','restricted')),
  prediction_count integer not null default 0,
  avg_confidence numeric not null default 0,
  avg_risk numeric not null default 0,
  calibration_count integer not null default 0,
  avg_calibration numeric not null default 0,
  forecast jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_elevator_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('ready','moving','idle','restricted')),
  current_level text not null default 'creator_os',
  target_level text,target_authorized boolean not null default false,
  path_clear boolean not null default false,
  elevator jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_mask_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('healthy','warning','restricted')),
  artists_rls boolean not null default false,
  profiles_rls boolean not null default false,
  safe_public_fields integer not null default 0,
  forbidden_private_fields integer not null default 0,
  mask jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_jack_snapshots enable row level security;
alter table public.tgg_one_animal_snapshots enable row level security;
alter table public.tgg_one_chicken_snapshots enable row level security;
alter table public.tgg_one_oracle_snapshots enable row level security;
alter table public.tgg_one_elevator_snapshots enable row level security;
alter table public.tgg_one_mask_snapshots enable row level security;

revoke all on public.tgg_one_jack_snapshots from anon,authenticated;
revoke all on public.tgg_one_animal_snapshots from anon,authenticated;
revoke all on public.tgg_one_chicken_snapshots from anon,authenticated;
revoke all on public.tgg_one_oracle_snapshots from anon,authenticated;
revoke all on public.tgg_one_elevator_snapshots from anon,authenticated;
revoke all on public.tgg_one_mask_snapshots from anon,authenticated;



revoke all on function public.tgg_one_jack_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_jack_state() from public,anon,authenticated;
revoke all on function public.tgg_one_animal_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_animal_state() from public,anon,authenticated;
revoke all on function public.tgg_one_oracle_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_oracle_state() from public,anon,authenticated;
revoke all on function public.tgg_one_chicken_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_chicken_state() from public,anon,authenticated;
revoke all on function public.tgg_one_elevator_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_elevator_state() from public,anon,authenticated;
revoke all on function public.tgg_one_mask_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_mask_state() from public,anon,authenticated;
revoke all on function public.tgg_one_guarded_motion_completeness() from public,anon,authenticated;

grant execute on function public.tgg_one_jack_refresh() to postgres;
grant execute on function public.tgg_one_jack_state() to postgres;
grant execute on function public.tgg_one_animal_refresh() to postgres;
grant execute on function public.tgg_one_animal_state() to postgres;
grant execute on function public.tgg_one_oracle_refresh() to postgres;
grant execute on function public.tgg_one_oracle_state() to postgres;
grant execute on function public.tgg_one_chicken_refresh() to postgres;
grant execute on function public.tgg_one_chicken_state() to postgres;
grant execute on function public.tgg_one_elevator_refresh() to postgres;
grant execute on function public.tgg_one_elevator_state() to postgres;
grant execute on function public.tgg_one_mask_refresh() to postgres;
grant execute on function public.tgg_one_mask_state() to postgres;
grant execute on function public.tgg_one_guarded_motion_completeness() to postgres;

update public.tgg_one_layers set layer_order=3000+layer_order where active=true;
insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('animal','THE ANIMAL 🐾',5,'Evidence-based instinct, adaptation and retreat when signals materially worsen',
 '["instinct","adaptation","retreat","no_attack_authority","no_invented_danger"]'::jsonb,
 '["tgg_one_vision_state","tgg_one_ears_state","tgg_one_curse_state","tgg_one_bear_state","tgg_one_lungs_state"]'::jsonb,false,true,false,false,false),
('jack','ONE EYE JACK 👁️♠️',10,'Single-target deep watcher for one unresolved target until verified or gated',
 '["single_target_watch","evidence_focus","review_only_gate","no_execute_authority"]'::jsonb,
 '["tgg_one_hunter_state","tgg_one_scout_state","tgg_one_jack_snapshots"]'::jsonb,false,true,false,false,false),
('oracle','THE ORACLE 🔮',14,'Probabilistic forecast and uncertainty from simulations, predictions and calibration',
 '["forecast","uncertainty","calibration","no_prophecy","no_certainty_claim"]'::jsonb,
 '["tgg_brain_change_predictions","tgg_brain_prediction_calibrations","tgg_brain_simulations"]'::jsonb,false,true,false,false,false),
('chicken','THE CHICKEN 🐔',31,'Caution gate that waits or reroutes when evidence, balance or forecast confidence is weak',
 '["caution","wait","reroute","no_blind_crossing","oracle_consulted"]'::jsonb,
 '["tgg_one_jack_state","tgg_one_balance_state","tgg_one_oracle_state","tgg_one_freight_train_state"]'::jsonb,false,true,false,false,false),
('mask','THE MASK 🎭',42,'Identity and presentation boundary that exposes approved public identity without impersonation or private leakage',
 '["presentation_boundary","safe_public_identity","no_impersonation","no_secret_reveal","no_auth_bypass"]'::jsonb,
 '["artists","profiles","tgg_one_mask_snapshots"]'::jsonb,false,true,false,false,false),
('elevator','THE ELEVATOR 🛗',45,'Authorized level transition between system states after caution and veil checks',
 '["level_transition","veil_required","chicken_caution","no_auto_user_movement"]'::jsonb,
 '["tgg_one_journey4_state","tgg_one_chicken_state","tgg_veil_health_state"]'::jsonb,false,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

-- exact 52-layer ordering
update public.tgg_one_layers set layer_order=1 where layer_key='senses';
update public.tgg_one_layers set layer_order=2 where layer_key='vision';
update public.tgg_one_layers set layer_order=3 where layer_key='ears';
update public.tgg_one_layers set layer_order=4 where layer_key='reflexes';
update public.tgg_one_layers set layer_order=5 where layer_key='animal';
update public.tgg_one_layers set layer_order=6 where layer_key='scout';
update public.tgg_one_layers set layer_order=7 where layer_key='kat';
update public.tgg_one_layers set layer_order=8 where layer_key='gps';
update public.tgg_one_layers set layer_order=9 where layer_key='hunter';
update public.tgg_one_layers set layer_order=10 where layer_key='jack';
update public.tgg_one_layers set layer_order=11 where layer_key='shadow';
update public.tgg_one_layers set layer_order=12 where layer_key='head';
update public.tgg_one_layers set layer_order=13 where layer_key='mind';
update public.tgg_one_layers set layer_order=14 where layer_key='oracle';
update public.tgg_one_layers set layer_order=15 where layer_key='heart';
update public.tgg_one_layers set layer_order=16 where layer_key='magic';
update public.tgg_one_layers set layer_order=17 where layer_key='genome';
update public.tgg_one_layers set layer_order=18 where layer_key='bones';
update public.tgg_one_layers set layer_order=19 where layer_key='circulation';
update public.tgg_one_layers set layer_order=20 where layer_key='nervous';
update public.tgg_one_layers set layer_order=21 where layer_key='curse';
update public.tgg_one_layers set layer_order=22 where layer_key='immune';
update public.tgg_one_layers set layer_order=23 where layer_key='bear';
update public.tgg_one_layers set layer_order=24 where layer_key='lungs';
update public.tgg_one_layers set layer_order=25 where layer_key='metabolism';
update public.tgg_one_layers set layer_order=26 where layer_key='detox';
update public.tgg_one_layers set layer_order=27 where layer_key='muscle';
update public.tgg_one_layers set layer_order=28 where layer_key='stamina';
update public.tgg_one_layers set layer_order=29 where layer_key='legs';
update public.tgg_one_layers set layer_order=30 where layer_key='balance';
update public.tgg_one_layers set layer_order=31 where layer_key='chicken';
update public.tgg_one_layers set layer_order=32 where layer_key='hands';
update public.tgg_one_layers set layer_order=33 where layer_key='body';
update public.tgg_one_layers set layer_order=34 where layer_key='skin';
update public.tgg_one_layers set layer_order=35 where layer_key='spirit';
update public.tgg_one_layers set layer_order=36 where layer_key='soul';
update public.tgg_one_layers set layer_order=37 where layer_key='dream';
update public.tgg_one_layers set layer_order=38 where layer_key='hair';
update public.tgg_one_layers set layer_order=39 where layer_key='partner';
update public.tgg_one_layers set layer_order=40 where layer_key='children';
update public.tgg_one_layers set layer_order=41 where layer_key='family';
update public.tgg_one_layers set layer_order=42 where layer_key='mask';
update public.tgg_one_layers set layer_order=43 where layer_key='veil';
update public.tgg_one_layers set layer_order=44 where layer_key='matrix_gateway';
update public.tgg_one_layers set layer_order=45 where layer_key='elevator';
update public.tgg_one_layers set layer_order=46 where layer_key='lewis_portal';
update public.tgg_one_layers set layer_order=47 where layer_key='chester';
update public.tgg_one_layers set layer_order=48 where layer_key='journey4';
update public.tgg_one_layers set layer_order=49 where layer_key='planet';
update public.tgg_one_layers set layer_order=50 where layer_key='universe';
update public.tgg_one_layers set layer_order=51 where layer_key='dimensions';
update public.tgg_one_layers set layer_order=52 where layer_key='the_one';
