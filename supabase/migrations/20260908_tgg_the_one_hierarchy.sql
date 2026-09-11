-- TGG THE ONE hierarchy

create table if not exists public.tgg_one_layers (
  layer_key text primary key,
  display_name text not null,
  layer_order integer not null unique,
  purpose text not null,
  responsibility jsonb not null default '[]'::jsonb,
  source_systems jsonb not null default '[]'::jsonb,
  can_execute boolean not null default false,
  can_block boolean not null default true,
  production_authority boolean not null default false,
  high_risk_authority boolean not null default false,
  canonical_authority boolean not null default false,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_one_cycles (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','complete','warning','restricted','failed')),
  preflight jsonb not null default '{}'::jsonb,
  execution jsonb not null default '{}'::jsonb,
  postflight jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tgg_one_layers enable row level security;
alter table public.tgg_one_cycles enable row level security;
revoke all on public.tgg_one_layers from anon,authenticated;
revoke all on public.tgg_one_cycles from anon,authenticated;

insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('shadow','SHADOW',1,'Hidden detection and preflight awareness',
 jsonb_build_array('detect_missing_pieces','detect_drift','detect_failures','detect_conflicts','detect_provider_degradation','detect_source_sync_drift'),
 jsonb_build_array('tgg_autonomic_gaps','tgg_autonomic_completeness','tgg_brain_architecture_latest','tgg_brain_conflict_state','tgg_provider_health_state'),
 false,true,false,false,false),
('head','HEAD',2,'Governance and boundaries',
 jsonb_build_array('guardrails','approval_gates','risk_boundary','canonical_boundary','production_boundary'),
 jsonb_build_array('tgg_brain_guardrails','tgg_brain_conflict_state','tgg_brain_latest_scorecard','AB-006','V223'),
 false,true,false,false,true),
('mind','MIND',3,'Reasoning, understanding and planning',
 jsonb_build_array('context','specs','requirements','prediction','uncertainty','critical_path','simulation'),
 jsonb_build_array('tgg_brain_state','tgg_brain_specs','tgg_brain_predict_change_set','tgg_brain_next_critical_unlocks','tgg_brain_simulations'),
 false,true,false,false,false),
('body','BODY',4,'Execution, repair, build, QA and staging',
 jsonb_build_array('build','repair','qa','sandbox','staging','evidence','source_sync'),
 jsonb_build_array('tgg_autobuilder_watchdog','tgg_build_tasks','tgg_brain_trials','tgg_release_train_state'),
 true,true,false,false,false),
('spirit','SPIRIT / SPRITE',5,'Live pulse, motion, signals and adaptation',
 jsonb_build_array('events','provider_pulse','speed','routing','live_health','release_flow'),
 jsonb_build_array('tgg_autonomic_events','tgg_provider_health_state','tgg_speed_booster_state','tgg_observability_state'),
 false,true,false,false,false),
('soul','SOUL',6,'Identity, continuity, memory and canonical intent',
 jsonb_build_array('memory','decisions','architecture_identity','lessons','mission_continuity'),
 jsonb_build_array('tgg_brain_memory','tgg_brain_decisions','tgg_brain_architecture_latest','TGG-BRAIN-1.0','AB-006','V223'),
 false,true,false,false,true),
('the_one','THE ONE',7,'Unified orchestration across every layer',
 jsonb_build_array('consensus','repair_first','build_second','verify_third','sync_learn_repeat'),
 jsonb_build_array('tgg_autonomic_final_cycle','tgg_observability_state','tgg_autonomic_completeness'),
 true,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,layer_order=excluded.layer_order,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=excluded.can_execute,can_block=excluded.can_block,
    production_authority=excluded.production_authority,high_risk_authority=excluded.high_risk_authority,
    canonical_authority=excluded.canonical_authority,active=true,updated_at=now();



revoke all on function public.tgg_one_layer_state(text) from public,anon,authenticated;
revoke all on function public.tgg_one_state() from public,anon,authenticated;
revoke all on function public.tgg_one_cycle() from public,anon,authenticated;
revoke all on function public.tgg_one_latest() from public,anon,authenticated;
revoke all on function public.tgg_autonomic_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_layer_state(text) to postgres;
grant execute on function public.tgg_one_state() to postgres;
grant execute on function public.tgg_one_cycle() to postgres;
grant execute on function public.tgg_one_latest() to postgres;
grant execute on function public.tgg_autonomic_completeness() to postgres;

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='tgg-autonomic-os-minute-loop'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule('tgg-autonomic-os-minute-loop','* * * * *','select public.tgg_one_cycle();');
end $$;
