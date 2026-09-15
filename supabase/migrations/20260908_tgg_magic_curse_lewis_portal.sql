
-- TGG MAGIC + CURSE BREAKER + LEWIS PORTAL

create table if not exists public.tgg_one_magic_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('charged','ready','dormant','restricted')),
  safety_score numeric not null default 0,
  pressure_score integer not null default 0,
  effective_batch_size integer not null default 5,
  qa_clean boolean not null default false,
  conflicts_clean boolean not null default false,
  synergy_score integer not null default 0,
  magic jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

create table if not exists public.tgg_one_curse_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('clear','watch','cursed','restricted')),
  qa_regressions integer not null default 0,
  open_failures integer not null default 0,
  critical_conflicts integer not null default 0,
  stale_work integer not null default 0,
  provider_blocked integer not null default 0,
  curse_score integer not null default 0,
  curse jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

create table if not exists public.tgg_lewis_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  portal_style text not null check(portal_style in ('rabbit_hole','wardrobe_gate')),
  state text not null default 'outside'
    check(state in ('outside','crossing','inside','returning','exited')),
  current_route_key text,
  step_no integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  entered_at timestamptz,
  exited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_lewis_portal_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('healthy','warning','restricted')),
  rabbit_hole_ready boolean not null default false,
  wardrobe_gate_ready boolean not null default false,
  entry_route_ok boolean not null default false,
  waypoint_route_ok boolean not null default false,
  exit_route_ok boolean not null default false,
  active_sessions integer not null default 0,
  portal jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_magic_snapshots enable row level security;
alter table public.tgg_one_curse_snapshots enable row level security;
alter table public.tgg_lewis_portal_sessions enable row level security;
alter table public.tgg_lewis_portal_health_snapshots enable row level security;

revoke all on public.tgg_one_magic_snapshots from anon,authenticated;
revoke all on public.tgg_one_curse_snapshots from anon,authenticated;
revoke all on public.tgg_lewis_portal_health_snapshots from anon,authenticated;

drop policy if exists "lewis_portal_select_own" on public.tgg_lewis_portal_sessions;
create policy "lewis_portal_select_own"
on public.tgg_lewis_portal_sessions for select to authenticated
using ((select auth.uid())=owner_user_id);

drop policy if exists "lewis_portal_insert_own" on public.tgg_lewis_portal_sessions;
create policy "lewis_portal_insert_own"
on public.tgg_lewis_portal_sessions for insert to authenticated
with check ((select auth.uid())=owner_user_id);

drop policy if exists "lewis_portal_update_own" on public.tgg_lewis_portal_sessions;
create policy "lewis_portal_update_own"
on public.tgg_lewis_portal_sessions for update to authenticated
using ((select auth.uid())=owner_user_id)
with check ((select auth.uid())=owner_user_id);

revoke all on public.tgg_lewis_portal_sessions from anon;
revoke delete on public.tgg_lewis_portal_sessions from authenticated;
grant select,insert,update on public.tgg_lewis_portal_sessions to authenticated;



revoke all on function public.tgg_one_magic_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_magic_state() from public,anon,authenticated;
revoke all on function public.tgg_one_curse_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_curse_state() from public,anon,authenticated;
revoke all on function public.tgg_lewis_portal_health_refresh() from public,anon,authenticated;
revoke all on function public.tgg_lewis_portal_health_state() from public,anon,authenticated;
revoke all on function public.tgg_lewis_portal_enter(text) from public,anon,authenticated;
revoke all on function public.tgg_lewis_portal_next(uuid) from public,anon,authenticated;
revoke all on function public.tgg_lewis_portal_exit(uuid) from public,anon,authenticated;
revoke all on function public.tgg_lewis_portal_state() from public,anon,authenticated;
revoke all on function public.tgg_one_magic_portal_completeness() from public,anon,authenticated;

grant execute on function public.tgg_one_magic_refresh() to postgres;
grant execute on function public.tgg_one_magic_state() to postgres;
grant execute on function public.tgg_one_curse_refresh() to postgres;
grant execute on function public.tgg_one_curse_state() to postgres;
grant execute on function public.tgg_lewis_portal_health_refresh() to postgres;
grant execute on function public.tgg_lewis_portal_health_state() to postgres;
grant execute on function public.tgg_lewis_portal_enter(text) to authenticated;
grant execute on function public.tgg_lewis_portal_next(uuid) to authenticated;
grant execute on function public.tgg_lewis_portal_exit(uuid) to authenticated;
grant execute on function public.tgg_lewis_portal_state() to authenticated;
grant execute on function public.tgg_one_magic_portal_completeness() to postgres;

-- Register new layers and lock the 39-layer order.
update public.tgg_one_layers set layer_order=1100+layer_order where layer_order>=12;

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('magic','MAGIC / SYNERGY ✨',12,
 'Verified positive synergy and boost readiness derived from real safety, QA, pressure and conflict evidence',
 jsonb_build_array('safe_synergy','boost_readiness','positive_system_alignment','no_supernatural_claim'),
 jsonb_build_array('tgg_brain_latest_scorecard','tgg_one_vision_state','tgg_one_lungs_state','tgg_speed_booster_state','tgg_brain_conflict_state'),
 false,true,false,false,false),
('curse','CURSE BREAKER ☠️🧿',17,
 'Detect regressions, debt, stale work and harmful patterns before they spread',
 jsonb_build_array('regression_detection','debt_watch','stale_work_watch','provider_block_watch','repair_before_spread'),
 jsonb_build_array('tgg_one_vision_state','tgg_one_detox_state','tgg_one_immune_state','tgg_provider_health_state'),
 false,true,false,false,false),
('lewis_portal','LEWIS PORTAL 🚪🐇',36,
 'Authenticated alternate portal-fantasy gateway with Rabbit Hole and Wardrobe Gate styles',
 jsonb_build_array('rabbit_hole_style','wardrobe_gate_style','authenticated_transition','veil_authorization','shared_route_spine'),
 jsonb_build_array('tgg_lewis_portal_sessions','tgg_lewis_portal_health_state','tgg_veil_route_decision','tgg_site_routes'),
 false,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

update public.tgg_one_layers set layer_order=13 where layer_key='genome';
update public.tgg_one_layers set layer_order=14 where layer_key='bones';
update public.tgg_one_layers set layer_order=15 where layer_key='circulation';
update public.tgg_one_layers set layer_order=16 where layer_key='nervous';
update public.tgg_one_layers set layer_order=18 where layer_key='immune';
update public.tgg_one_layers set layer_order=19 where layer_key='lungs';
update public.tgg_one_layers set layer_order=20 where layer_key='metabolism';
update public.tgg_one_layers set layer_order=21 where layer_key='detox';
update public.tgg_one_layers set layer_order=22 where layer_key='muscle';
update public.tgg_one_layers set layer_order=23 where layer_key='stamina';
update public.tgg_one_layers set layer_order=24 where layer_key='hands';
update public.tgg_one_layers set layer_order=25 where layer_key='body';
update public.tgg_one_layers set layer_order=26 where layer_key='skin';
update public.tgg_one_layers set layer_order=27 where layer_key='spirit';
update public.tgg_one_layers set layer_order=28 where layer_key='soul';
update public.tgg_one_layers set layer_order=29 where layer_key='dream';
update public.tgg_one_layers set layer_order=30 where layer_key='hair';
update public.tgg_one_layers set layer_order=31 where layer_key='partner';
update public.tgg_one_layers set layer_order=32 where layer_key='children';
update public.tgg_one_layers set layer_order=33 where layer_key='family';
update public.tgg_one_layers set layer_order=34 where layer_key='veil';
update public.tgg_one_layers set layer_order=35 where layer_key='matrix_gateway';
update public.tgg_one_layers set layer_order=37 where layer_key='planet';
update public.tgg_one_layers set layer_order=38 where layer_key='universe';
update public.tgg_one_layers set layer_order=39 where layer_key='the_one';
