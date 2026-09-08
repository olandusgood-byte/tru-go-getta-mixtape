
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


-- Register HUNTER, DETOX, DREAM and lock the 32-layer order.
update public.tgg_one_layers set layer_order=804 where layer_key='shadow';
update public.tgg_one_layers set layer_order=805 where layer_key='head';
update public.tgg_one_layers set layer_order=806 where layer_key='mind';
update public.tgg_one_layers set layer_order=807 where layer_key='heart';
update public.tgg_one_layers set layer_order=808 where layer_key='genome';
update public.tgg_one_layers set layer_order=809 where layer_key='bones';
update public.tgg_one_layers set layer_order=810 where layer_key='circulation';
update public.tgg_one_layers set layer_order=811 where layer_key='nervous';
update public.tgg_one_layers set layer_order=812 where layer_key='immune';
update public.tgg_one_layers set layer_order=813 where layer_key='lungs';
update public.tgg_one_layers set layer_order=814 where layer_key='metabolism';
update public.tgg_one_layers set layer_order=815 where layer_key='muscle';
update public.tgg_one_layers set layer_order=816 where layer_key='stamina';
update public.tgg_one_layers set layer_order=817 where layer_key='body';
update public.tgg_one_layers set layer_order=818 where layer_key='skin';
update public.tgg_one_layers set layer_order=819 where layer_key='spirit';
update public.tgg_one_layers set layer_order=820 where layer_key='soul';
update public.tgg_one_layers set layer_order=821 where layer_key='hair';
update public.tgg_one_layers set layer_order=822 where layer_key='partner';
update public.tgg_one_layers set layer_order=823 where layer_key='children';
update public.tgg_one_layers set layer_order=824 where layer_key='family';
update public.tgg_one_layers set layer_order=825 where layer_key='veil';
update public.tgg_one_layers set layer_order=826 where layer_key='matrix_gateway';
update public.tgg_one_layers set layer_order=827 where layer_key='planet';
update public.tgg_one_layers set layer_order=828 where layer_key='universe';
update public.tgg_one_layers set layer_order=829 where layer_key='the_one';

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('hunter','HUNTER 🏹',4,
 'Select and track the highest-value already-safe target until caught, verified or gated',
 jsonb_build_array('target_selection','critical_path_pursuit','skip_checked_targets','no_protected_prey','track_until_verified'),
 jsonb_build_array('tgg_one_scout_state','tgg_brain_next_actions','tgg_brain_next_critical_unlocks','tgg_build_tasks','tgg_one_skip_check'),
 false,true,false,false,false),
('detox','LIVER / KIDNEYS 🧪',16,
 'Non-destructive detox, hygiene, stale residue detection and exact-duplicate memory archival',
 jsonb_build_array('memory_hygiene','stale_claim_detection','stale_agent_detection','failure_residue','non_destructive_cleanup'),
 jsonb_build_array('tgg_brain_memory_hygiene_state','tgg_brain_memory_compact','tgg_build_failures','tgg_game_idea_inbox','tgg_autobuilder_agent_jobs'),
 false,true,false,false,false),
('dream','SLEEP / DREAM 🌙',23,
 'Periodic reflection, memory consolidation, architecture refresh and lineage learning',
 jsonb_build_array('reflection','memory_consolidation','architecture_refresh','lineage_refresh','no_invented_work'),
 jsonb_build_array('tgg_brain_reflect','tgg_brain_memory_compact','tgg_brain_architecture_scan','tgg_brain_lineage_refresh'),
 false,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

update public.tgg_one_layers set layer_order=5 where layer_key='shadow';
update public.tgg_one_layers set layer_order=6 where layer_key='head';
update public.tgg_one_layers set layer_order=7 where layer_key='mind';
update public.tgg_one_layers set layer_order=8 where layer_key='heart';
update public.tgg_one_layers set layer_order=9 where layer_key='genome';
update public.tgg_one_layers set layer_order=10 where layer_key='bones';
update public.tgg_one_layers set layer_order=11 where layer_key='circulation';
update public.tgg_one_layers set layer_order=12 where layer_key='nervous';
update public.tgg_one_layers set layer_order=13 where layer_key='immune';
update public.tgg_one_layers set layer_order=14 where layer_key='lungs';
update public.tgg_one_layers set layer_order=15 where layer_key='metabolism';
update public.tgg_one_layers set layer_order=17 where layer_key='muscle';
update public.tgg_one_layers set layer_order=18 where layer_key='stamina';
update public.tgg_one_layers set layer_order=19 where layer_key='body';
update public.tgg_one_layers set layer_order=20 where layer_key='skin';
update public.tgg_one_layers set layer_order=21 where layer_key='spirit';
update public.tgg_one_layers set layer_order=22 where layer_key='soul';
update public.tgg_one_layers set layer_order=24 where layer_key='hair';
update public.tgg_one_layers set layer_order=25 where layer_key='partner';
update public.tgg_one_layers set layer_order=26 where layer_key='children';
update public.tgg_one_layers set layer_order=27 where layer_key='family';
update public.tgg_one_layers set layer_order=28 where layer_key='veil';
update public.tgg_one_layers set layer_order=29 where layer_key='matrix_gateway';
update public.tgg_one_layers set layer_order=30 where layer_key='planet';
update public.tgg_one_layers set layer_order=31 where layer_key='universe';
update public.tgg_one_layers set layer_order=32 where layer_key='the_one';
