-- TGG BLACK BOX + VEIL AUDIT LEDGER

create table if not exists public.tgg_veil_audit_ledger (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  route_key text not null,
  allowed boolean not null,
  access_level text,
  reason text not null,
  source text not null default 'veil',
  metadata jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now()
);

create table if not exists public.tgg_one_black_box_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('clear','warning','restricted')),
  train_status text,
  safe_ready integer not null default 0,
  active_jobs integer not null default 0,
  blocked_tasks integer not null default 0,
  approval_tasks integer not null default 0,
  trace_total integer not null default 0,
  trace_warnings integer not null default 0,
  trace_blocked integer not null default 0,
  boundary_violations integer not null default 0,
  production_touched integer not null default 0,
  high_risk_executed integer not null default 0,
  recorder jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

alter table public.tgg_veil_audit_ledger enable row level security;
alter table public.tgg_one_black_box_snapshots enable row level security;
revoke all on public.tgg_veil_audit_ledger from anon,authenticated;
revoke all on public.tgg_one_black_box_snapshots from anon,authenticated;



revoke all on function public.tgg_veil_route_decision_audited(text) from public,anon,authenticated;
revoke all on function public.tgg_one_black_box_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_black_box_state() from public,anon,authenticated;
revoke all on function public.tgg_veil_audit_state() from public,anon,authenticated;
revoke all on function public.tgg_one_recorded_freight_train_cycle() from public,anon,authenticated;
revoke all on function public.tgg_one_recorded_completeness() from public,anon,authenticated;
grant execute on function public.tgg_veil_route_decision_audited(text) to authenticated;
grant execute on function public.tgg_one_black_box_refresh() to postgres;
grant execute on function public.tgg_one_black_box_state() to postgres;
grant execute on function public.tgg_veil_audit_state() to postgres;
grant execute on function public.tgg_one_recorded_freight_train_cycle() to postgres;
grant execute on function public.tgg_one_recorded_completeness() to postgres;

revoke all on function public.tgg_matrix_gateway_enter() from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_next(uuid) from public,anon,authenticated;
revoke all on function public.tgg_matrix_gateway_exit(uuid) from public,anon,authenticated;
revoke all on function public.tgg_lewis_portal_enter(text) from public,anon,authenticated;
revoke all on function public.tgg_lewis_portal_next(uuid) from public,anon,authenticated;
revoke all on function public.tgg_lewis_portal_exit(uuid) from public,anon,authenticated;
grant execute on function public.tgg_matrix_gateway_enter() to authenticated;
grant execute on function public.tgg_matrix_gateway_next(uuid) to authenticated;
grant execute on function public.tgg_matrix_gateway_exit(uuid) to authenticated;
grant execute on function public.tgg_lewis_portal_enter(text) to authenticated;
grant execute on function public.tgg_lewis_portal_next(uuid) to authenticated;
grant execute on function public.tgg_lewis_portal_exit(uuid) to authenticated;

update public.tgg_one_layers set layer_order=6000+layer_order where active=true;
insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('veil_audit','VEIL AUDIT LEDGER 👰📜',54,
 'Privacy-safe durable record of authenticated VEIL allow/deny decisions',
 '["route_decision_audit","allow_deny_reason","no_secret_storage","no_client_read"]'::jsonb,
 '["tgg_veil_audit_ledger","tgg_veil_route_decision_audited"]'::jsonb,
 false,true,false,false,false),
('black_box','BLACK BOX / FLIGHT RECORDER 📼',55,
 'Durable run-level record of Freight Train state, execution trace and boundary safety',
 '["run_record","trace_summary","boundary_watch","no_history_rewrite"]'::jsonb,
 '["tgg_one_black_box_snapshots","tgg_brain_execution_trace_state","tgg_one_freight_train_state","tgg_one_mirror_state"]'::jsonb,
 false,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

update public.tgg_one_layers set layer_order=56 where layer_key='mirror';
update public.tgg_one_layers set layer_order=57 where layer_key='the_one';
