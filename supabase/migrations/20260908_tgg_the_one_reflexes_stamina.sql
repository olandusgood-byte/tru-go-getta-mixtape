
-- TGG REFLEXES + STAMINA expansion
create table if not exists public.tgg_one_stamina_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','loaded','warning','restricted')),
  retryable_tasks integer not null default 0,
  exhausted_tasks integer not null default 0,
  stale_game_ideas integer not null default 0,
  recent_recoveries integer not null default 0,
  open_failures integer not null default 0,
  endurance jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

create table if not exists public.tgg_one_reflex_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','alert','restricted')),
  new_events integer not null default 0,
  open_build_failures integer not null default 0,
  current_qa_warnings integer not null default 0,
  provider_degraded integer not null default 0,
  provider_blocked integer not null default 0,
  reaction jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_stamina_snapshots enable row level security;
alter table public.tgg_one_reflex_snapshots enable row level security;
revoke all on public.tgg_one_stamina_snapshots from anon,authenticated;
revoke all on public.tgg_one_reflex_snapshots from anon,authenticated;

update public.tgg_one_layers set layer_order=90+layer_order where layer_key not in ('senses');

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('reflexes','REFLEXES ⚡',2,
 'Fast safe reaction to fresh events, failures, QA regressions and provider changes',
 jsonb_build_array('detect_fast','route_fast','flag_fast','trigger_safe_watchdog','never_bypass_head'),
 jsonb_build_array('tgg_autonomic_events','tgg_build_failures','tgg_browser_qa_results','tgg_visual_qa_results','tgg_provider_health_state'),
 false,true,false,false,false),
('stamina','STAMINA 🏃',8,
 'Long-run endurance, retry budgets, stale recovery, checkpoints and multi-wave continuation',
 jsonb_build_array('retry_budget','wave_continuation','stale_recovery','checkpointing','long_run_health'),
 jsonb_build_array('tgg_build_tasks','tgg_game_idea_recover_stale','tgg_autobuilder_watchdog','tgg_operational_recovery_checkpoints'),
 false,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,responsibility=excluded.responsibility,
    source_systems=excluded.source_systems,can_execute=excluded.can_execute,can_block=excluded.can_block,
    production_authority=false,high_risk_authority=false,canonical_authority=false,
    active=true,updated_at=now();

update public.tgg_one_layers set layer_order=3 where layer_key='shadow';
update public.tgg_one_layers set layer_order=4 where layer_key='head';
update public.tgg_one_layers set layer_order=5 where layer_key='mind';
update public.tgg_one_layers set layer_order=6 where layer_key='heart';
update public.tgg_one_layers set layer_order=7 where layer_key='muscle';
update public.tgg_one_layers set layer_order=9 where layer_key='body';
update public.tgg_one_layers set layer_order=10 where layer_key='spirit';
update public.tgg_one_layers set layer_order=11 where layer_key='soul';
update public.tgg_one_layers set layer_order=12 where layer_key='hair';
update public.tgg_one_layers set layer_order=13 where layer_key='the_one';



revoke all on function public.tgg_one_stamina_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_stamina_state() from public,anon,authenticated;
revoke all on function public.tgg_one_reflex_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_reflex_state() from public,anon,authenticated;
revoke all on function public.tgg_one_layer_state(text) from public,anon,authenticated;
revoke all on function public.tgg_one_cycle() from public,anon,authenticated;
revoke all on function public.tgg_one_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_stamina_refresh() to postgres;
grant execute on function public.tgg_one_stamina_state() to postgres;
grant execute on function public.tgg_one_reflex_refresh() to postgres;
grant execute on function public.tgg_one_reflex_state() to postgres;
grant execute on function public.tgg_one_layer_state(text) to postgres;
grant execute on function public.tgg_one_cycle() to postgres;
grant execute on function public.tgg_one_completeness() to postgres;
