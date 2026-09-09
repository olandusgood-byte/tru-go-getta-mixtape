-- TGG CHOICE / FREE WILL + EMERGENCY EXIT

insert into public.tgg_brain_guardrails(
  guardrail_key,category,rule,severity,action,active,immutable,source_ref
) values (
  'guardrail:user-transition-consent','risk',
  '{"user_facing_transition_requires_explicit_choice":true,"default_choice_granted":false,"backend_safe_work_may_continue_without_user_transition":true,"no_forced_portal":true,"no_forced_elevator":true,"no_forced_persona":true}'::jsonb,
  'critical','block',true,true,'CHOICE / FREE WILL boundary'
)
on conflict(guardrail_key) do update
set rule=excluded.rule,severity='critical',action='block',active=true,immutable=true,
    source_ref=excluded.source_ref,updated_at=now();

create table if not exists public.tgg_one_choices (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  choice_key text not null,
  granted boolean not null default false,
  scope text not null default 'user_transition',
  metadata jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id,choice_key)
);
create table if not exists public.tgg_one_choice_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('healthy','waiting','warning','restricted')),
  active_choices integer not null default 0,
  granted_choices integer not null default 0,
  denied_choices integer not null default 0,
  choice jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_exit_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('ready','warning','restricted')),
  matrix_exit_ready boolean not null default false,
  lewis_exit_ready boolean not null default false,
  creator_os_route_ready boolean not null default false,
  exit_state jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_choices enable row level security;
alter table public.tgg_one_choice_snapshots enable row level security;
alter table public.tgg_one_exit_snapshots enable row level security;

drop policy if exists "choice_select_own" on public.tgg_one_choices;
create policy "choice_select_own" on public.tgg_one_choices for select to authenticated
using ((select auth.uid())=owner_user_id);
drop policy if exists "choice_insert_own" on public.tgg_one_choices;
create policy "choice_insert_own" on public.tgg_one_choices for insert to authenticated
with check ((select auth.uid())=owner_user_id);
drop policy if exists "choice_update_own" on public.tgg_one_choices;
create policy "choice_update_own" on public.tgg_one_choices for update to authenticated
using ((select auth.uid())=owner_user_id)
with check ((select auth.uid())=owner_user_id);

revoke all on public.tgg_one_choices from anon;
revoke delete on public.tgg_one_choices from authenticated;
grant select,insert,update on public.tgg_one_choices to authenticated;
revoke all on public.tgg_one_choice_snapshots from anon,authenticated;
revoke all on public.tgg_one_exit_snapshots from anon,authenticated;



revoke all on function public.tgg_one_choice_set(text,boolean,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_one_choice_state(text) from public,anon,authenticated;
revoke all on function public.tgg_one_transition_allowed(text) from public,anon,authenticated;
revoke all on function public.tgg_one_choice_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_choice_health_state() from public,anon,authenticated;
revoke all on function public.tgg_one_exit_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_exit_state() from public,anon,authenticated;
revoke all on function public.tgg_one_choice_exit_completeness() from public,anon,authenticated;

grant execute on function public.tgg_one_choice_set(text,boolean,jsonb) to authenticated;
grant execute on function public.tgg_one_choice_state(text) to authenticated;
grant execute on function public.tgg_one_transition_allowed(text) to authenticated;
grant execute on function public.tgg_one_choice_refresh() to postgres;
grant execute on function public.tgg_one_choice_health_state() to postgres;
grant execute on function public.tgg_one_exit_refresh() to postgres;
grant execute on function public.tgg_one_exit_state() to postgres;
grant execute on function public.tgg_one_choice_exit_completeness() to postgres;

update public.tgg_one_layers set layer_order=4000+layer_order where active=true;

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('choice','CHOICE / FREE WILL 🗝️',42,'Owner-scoped explicit choice boundary for user-facing transitions; default is not granted',
 '["explicit_choice","consent_boundary","no_forced_transition","owner_scoped"]'::jsonb,
 '["tgg_one_choices","tgg_one_choice_state","tgg_one_transition_allowed","tgg_brain_guardrails"]'::jsonb,false,true,false,false,false),
('exit','EMERGENCY EXIT / RETURN 🚪',47,'Safe return path from Matrix/Lewis journeys back to Creator OS when the user chooses out',
 '["safe_return","matrix_exit","lewis_exit","creator_os_return","no_forced_exit"]'::jsonb,
 '["tgg_matrix_gateway_exit","tgg_lewis_portal_exit","tgg_site_routes","tgg_one_exit_snapshots"]'::jsonb,false,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,responsibility=excluded.responsibility,
    source_systems=excluded.source_systems,can_execute=false,can_block=true,
    production_authority=false,high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

-- final 54-layer order
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
update public.tgg_one_layers set layer_order=42 where layer_key='choice';
update public.tgg_one_layers set layer_order=43 where layer_key='mask';
update public.tgg_one_layers set layer_order=44 where layer_key='veil';
update public.tgg_one_layers set layer_order=45 where layer_key='matrix_gateway';
update public.tgg_one_layers set layer_order=46 where layer_key='elevator';
update public.tgg_one_layers set layer_order=47 where layer_key='exit';
update public.tgg_one_layers set layer_order=48 where layer_key='lewis_portal';
update public.tgg_one_layers set layer_order=49 where layer_key='chester';
update public.tgg_one_layers set layer_order=50 where layer_key='journey4';
update public.tgg_one_layers set layer_order=51 where layer_key='planet';
update public.tgg_one_layers set layer_order=52 where layer_key='universe';
update public.tgg_one_layers set layer_order=53 where layer_key='dimensions';
update public.tgg_one_layers set layer_order=54 where layer_key='the_one';
