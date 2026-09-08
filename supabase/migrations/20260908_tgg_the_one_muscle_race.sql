
-- TGG MUSCLE + Start-to-Finish Race
create table if not exists public.tgg_one_muscle_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','loaded','warning','restricted')),
  effective_batch_size integer not null default 5,
  hard_ceiling integer not null default 25,
  ready_tasks integer not null default 0,
  building_tasks integer not null default 0,
  testing_tasks integer not null default 0,
  blocked_tasks integer not null default 0,
  approval_tasks integer not null default 0,
  finished_tasks integer not null default 0,
  skipped_recent integer not null default 0,
  race_state jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

create table if not exists public.tgg_one_muscle_workloads (
  id uuid primary key default gen_random_uuid(),
  workload_key text not null unique,
  title text not null,
  status text not null default 'planned'
    check (status in ('planned','running','complete','skipped','blocked','canceled')),
  load_class text not null default 'medium'
    check (load_class in ('light','medium','heavy','xheavy')),
  batch_size integer not null check (batch_size between 1 and 25),
  wave_count integer not null default 1,
  source_type text not null default 'build_tasks',
  manifest jsonb not null default '[]'::jsonb,
  race jsonb not null default '{}'::jsonb,
  production_allowed boolean not null default false,
  high_risk_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

alter table public.tgg_one_muscle_snapshots enable row level security;
alter table public.tgg_one_muscle_workloads enable row level security;
revoke all on public.tgg_one_muscle_snapshots from anon,authenticated;
revoke all on public.tgg_one_muscle_workloads from anon,authenticated;

update public.tgg_one_layers set layer_order=97 where layer_key='body';
update public.tgg_one_layers set layer_order=96 where layer_key='spirit';
update public.tgg_one_layers set layer_order=95 where layer_key='soul';
update public.tgg_one_layers set layer_order=94 where layer_key='hair';
update public.tgg_one_layers set layer_order=93 where layer_key='the_one';

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
)
values(
  'muscle','MUSCLE 💪',6,
  'Heavy-load batching, workload balancing, race coordination and throughput force',
  jsonb_build_array('bulk_pack','batch_balance','wave_split','heavy_loads','design_sweeps','repair_waves','qa_waves','source_sync_loads','race_progress'),
  jsonb_build_array('tgg_speed_booster_state','tgg_one_skip_state','tgg_build_tasks','tgg_autobuilder_agent_jobs','tgg_one_muscle_workloads'),
  true,true,false,false,false
)
on conflict(layer_key) do update
set display_name=excluded.display_name,layer_order=excluded.layer_order,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=true,can_block=true,production_authority=false,high_risk_authority=false,
    canonical_authority=false,active=true,updated_at=now();

update public.tgg_one_layers set layer_order=7 where layer_key='body';
update public.tgg_one_layers set layer_order=8 where layer_key='spirit';
update public.tgg_one_layers set layer_order=9 where layer_key='soul';
update public.tgg_one_layers set layer_order=10 where layer_key='hair';
update public.tgg_one_layers set layer_order=11 where layer_key='the_one';



revoke all on function public.tgg_one_muscle_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_muscle_state() from public,anon,authenticated;
revoke all on function public.tgg_one_muscle_plan(text,integer) from public,anon,authenticated;
revoke all on function public.tgg_one_layer_state(text) from public,anon,authenticated;
revoke all on function public.tgg_one_cycle() from public,anon,authenticated;
revoke all on function public.tgg_one_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_muscle_refresh() to postgres;
grant execute on function public.tgg_one_muscle_state() to postgres;
grant execute on function public.tgg_one_muscle_plan(text,integer) to postgres;
grant execute on function public.tgg_one_layer_state(text) to postgres;
grant execute on function public.tgg_one_cycle() to postgres;
grant execute on function public.tgg_one_completeness() to postgres;
