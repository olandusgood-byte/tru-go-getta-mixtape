-- TGG THE MIRROR
create table if not exists public.tgg_one_mirror_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('clear','changed','warning','restricted')),
  production_drift_count integer not null default 0,
  runtime_failed_checks integer not null default 0,
  architecture_missing integer not null default 0,
  architecture_stale integer not null default 0,
  architecture_new integer not null default 0,
  intentional_change boolean not null default false,
  reflection jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
alter table public.tgg_one_mirror_snapshots enable row level security;
revoke all on public.tgg_one_mirror_snapshots from anon,authenticated;



revoke all on function public.tgg_one_mirror_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_mirror_state() from public,anon,authenticated;
revoke all on function public.tgg_one_mirror_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_mirror_refresh() to postgres;
grant execute on function public.tgg_one_mirror_state() to postgres;
grant execute on function public.tgg_one_mirror_completeness() to postgres;

update public.tgg_one_layers set layer_order=5000+layer_order where active=true;
insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values(
  'mirror','THE MIRROR 🪞',54,
  'Self-reflection layer comparing intended architecture, live runtime and evidence for drift or contradiction',
  '["truth_comparison","drift_detection","intentional_change_recognition","no_history_rewrite"]'::jsonb,
  '["tgg_brain_architecture_latest","tgg_get_production_drift","tgg_runtime_drift_guard","tgg_build_verify_task_evidence"]'::jsonb,
  false,true,false,false,false
)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

update public.tgg_one_layers set layer_order=55 where layer_key='the_one';
