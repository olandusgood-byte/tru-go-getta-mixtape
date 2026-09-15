
-- TGG THE VEIL + Matrix authorization seal
create table if not exists public.tgg_veil_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','warning','restricted')),
  entry_access_ok boolean not null default false,
  rabbit_access_ok boolean not null default false,
  exit_access_ok boolean not null default false,
  matrix_rls_ok boolean not null default false,
  session_owner_policies_ok boolean not null default false,
  secret_boundary_ok boolean not null default false,
  veil jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
alter table public.tgg_veil_health_snapshots enable row level security;
revoke all on public.tgg_veil_health_snapshots from anon,authenticated;

drop policy if exists "matrix_gateway_insert_own" on public.tgg_matrix_gateway_sessions;
create policy "matrix_gateway_insert_own"
on public.tgg_matrix_gateway_sessions
for insert to authenticated
with check ((select auth.uid())=owner_user_id);

drop policy if exists "matrix_gateway_update_own" on public.tgg_matrix_gateway_sessions;
create policy "matrix_gateway_update_own"
on public.tgg_matrix_gateway_sessions
for update to authenticated
using ((select auth.uid())=owner_user_id)
with check ((select auth.uid())=owner_user_id);

grant insert,update on public.tgg_matrix_gateway_sessions to authenticated;



revoke all on function public.tgg_veil_route_decision(text) from public,anon,authenticated;
revoke all on function public.tgg_veil_health_refresh() from public,anon,authenticated;
revoke all on function public.tgg_veil_health_state() from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_enter() from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_next(uuid) from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_exit(uuid) from public,anon,authenticated;
revoke all on function public.tgg_one_veiled_matrix_completeness() from public,anon,authenticated;
revoke all on function public.tgg_one_veiled_matrix_cycle() from public,anon,authenticated;

grant execute on function public.tgg_veil_route_decision(text) to authenticated;
grant execute on function public.tgg_matrix_gateway_enter() to authenticated;
grant execute on function public.tgg_matrix_gateway_next(uuid) to authenticated;
grant execute on function public.tgg_matrix_gateway_exit(uuid) to authenticated;
grant execute on function public.tgg_veil_health_refresh() to postgres;
grant execute on function public.tgg_veil_health_state() to postgres;
grant execute on function public.tgg_one_veiled_matrix_completeness() to postgres;
grant execute on function public.tgg_one_veiled_matrix_cycle() to postgres;

update public.tgg_one_layers set layer_order=601 where layer_key='matrix_gateway';
update public.tgg_one_layers set layer_order=602 where layer_key='planet';
update public.tgg_one_layers set layer_order=603 where layer_key='universe';
update public.tgg_one_layers set layer_order=604 where layer_key='the_one';

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values(
  'veil','THE VEIL 👰',23,
  'Privacy, visibility, masking and authorization boundary before crossing into the Matrix',
  jsonb_build_array('route_visibility','role_access','session_ownership','secret_masking','public_private_boundary','authorized_reveal'),
  jsonb_build_array('tgg_site_routes','profiles','artists','tgg_matrix_gateway_sessions','tgg_veil_route_decision','tgg_veil_health_state'),
  false,true,false,false,false
)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

update public.tgg_one_layers set layer_order=24 where layer_key='matrix_gateway';
update public.tgg_one_layers set layer_order=25 where layer_key='planet';
update public.tgg_one_layers set layer_order=26 where layer_key='universe';
update public.tgg_one_layers set layer_order=27 where layer_key='the_one';

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='tgg-autonomic-os-minute-loop'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule(
    'tgg-autonomic-os-minute-loop','* * * * *',
    'select public.tgg_one_veiled_matrix_cycle();'
  );
end $$;
