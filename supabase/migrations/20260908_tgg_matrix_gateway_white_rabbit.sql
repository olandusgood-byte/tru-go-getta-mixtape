
-- TGG Matrix Gateway / White Rabbit
create table if not exists public.tgg_matrix_gateway_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'outside'
    check (state in ('outside','following_rabbit','inside','exiting','exited')),
  current_route_key text,
  entry_route_key text not null default 'artist_world',
  exit_route_key text not null default 'artist_creator_os',
  rabbit_step integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  entered_at timestamptz,
  exited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_matrix_gateway_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','warning','restricted')),
  entry_route_ok boolean not null default false,
  rabbit_route_ok boolean not null default false,
  exit_route_ok boolean not null default false,
  active_sessions integer not null default 0,
  gateway jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_matrix_gateway_sessions enable row level security;
alter table public.tgg_matrix_gateway_health_snapshots enable row level security;

drop policy if exists "matrix_gateway_select_own" on public.tgg_matrix_gateway_sessions;
create policy "matrix_gateway_select_own"
on public.tgg_matrix_gateway_sessions
for select to authenticated
using ((select auth.uid())=owner_user_id);

revoke insert,update,delete on public.tgg_matrix_gateway_sessions from anon,authenticated;
grant select on public.tgg_matrix_gateway_sessions to authenticated;
revoke all on public.tgg_matrix_gateway_health_snapshots from anon,authenticated;



revoke all on function public.tgg_matrix_gateway_enter() from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_next(uuid) from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_exit(uuid) from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_state() from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_health_refresh() from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_health_state() from public,anon,authenticated;
revoke all on function public.tgg_one_matrix_total_completeness() from public,anon,authenticated;
revoke all on function public.tgg_one_matrix_cycle() from public,anon,authenticated;

grant execute on function public.tgg_matrix_gateway_enter() to authenticated;
grant execute on function public.tgg_matrix_gateway_next(uuid) to authenticated;
grant execute on function public.tgg_matrix_gateway_exit(uuid) to authenticated;
grant execute on function public.tgg_matrix_gateway_state() to authenticated;
grant execute on function public.tgg_matrix_gateway_health_refresh() to postgres;
grant execute on function public.tgg_matrix_gateway_health_state() to postgres;
grant execute on function public.tgg_one_matrix_total_completeness() to postgres;
grant execute on function public.tgg_one_matrix_cycle() to postgres;

update public.tgg_one_layers set layer_order=501 where layer_key='planet';
update public.tgg_one_layers set layer_order=502 where layer_key='universe';
update public.tgg_one_layers set layer_order=503 where layer_key='the_one';

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values(
  'matrix_gateway','MATRIX GATEWAY / WHITE RABBIT 🐇',23,
  'Authenticated enter/exit gateway between Creator OS and TGG World',
  jsonb_build_array('authenticated_entry','white_rabbit_path','world_transition','safe_exit','wake_up_route','session_state'),
  jsonb_build_array('tgg_matrix_gateway_sessions','tgg_site_routes','artist_world','artist_games_tv','artist_creator_os'),
  false,true,false,false,false
)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

update public.tgg_one_layers set layer_order=24 where layer_key='planet';
update public.tgg_one_layers set layer_order=25 where layer_key='universe';
update public.tgg_one_layers set layer_order=26 where layer_key='the_one';

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='tgg-autonomic-os-minute-loop'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule(
    'tgg-autonomic-os-minute-loop','* * * * *',
    'select public.tgg_one_matrix_cycle();'
  );
end $$;
