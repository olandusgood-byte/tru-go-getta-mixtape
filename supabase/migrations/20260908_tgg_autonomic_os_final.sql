
-- TGG Autonomic OS Final
-- Final real-time intake + completeness-first control plane.
-- Keeps production/high-risk/canonical boundaries approval-gated.

create table if not exists public.tgg_autonomic_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  source_table text not null,
  source_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new'
    check (status in ('new','routed','processed','blocked','ignored')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.tgg_autonomic_gaps (
  id uuid primary key default gen_random_uuid(),
  gap_key text not null unique,
  gap_type text not null
    check (gap_type in ('safety','architecture','conflict','trace','build_failure','missing_spec','missing_qa','source_sync','new_idea','new_content','human_action','approval_gate')),
  severity text not null default 'medium'
    check (severity in ('low','medium','high','critical')),
  source_ref text,
  auto_fix_allowed boolean not null default false,
  status text not null default 'open'
    check (status in ('open','repairing','resolved','approval_required','external_required','ignored')),
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.tgg_autonomic_cycles (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','complete','restricted','blocked','failed')),
  speed_state jsonb not null default '{}'::jsonb,
  scan jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb
);

alter table public.tgg_autonomic_events enable row level security;
alter table public.tgg_autonomic_gaps enable row level security;
alter table public.tgg_autonomic_cycles enable row level security;
revoke all on public.tgg_autonomic_events from anon,authenticated;
revoke all on public.tgg_autonomic_gaps from anon,authenticated;
revoke all on public.tgg_autonomic_cycles from anon,authenticated;

create or replace function private.tgg_autonomic_capture_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.tgg_autonomic_events(
    event_key,source_table,source_id,event_type,payload,status
  )
  values(
    'evt:'||tg_table_name||':'||new.id::text,
    tg_table_name,
    new.id,
    tg_table_name||':insert',
    to_jsonb(new),
    'new'
  )
  on conflict(event_key) do nothing;
  return new;
end $$;

revoke all on function private.tgg_autonomic_capture_event() from public,anon,authenticated;
grant execute on function private.tgg_autonomic_capture_event() to postgres;

drop trigger if exists trg_tgg_autonomic_game_idea on public.tgg_game_idea_inbox;
create trigger trg_tgg_autonomic_game_idea
after insert on public.tgg_game_idea_inbox
for each row execute function private.tgg_autonomic_capture_event();

drop trigger if exists trg_tgg_autonomic_content on public.content_items;
create trigger trg_tgg_autonomic_content
after insert on public.content_items
for each row execute function private.tgg_autonomic_capture_event();

drop trigger if exists trg_tgg_autonomic_master_content on public.tgg_master_content;
create trigger trg_tgg_autonomic_master_content
after insert on public.tgg_master_content
for each row execute function private.tgg_autonomic_capture_event();

create or replace function public.tgg_autonomic_completeness()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_required_functions text[] := array[
    'tgg_brain_state','tgg_brain_reflect','tgg_brain_next_actions',
    'tgg_brain_goal_next_steps','tgg_brain_next_buildable_steps',
    'tgg_brain_simulate_goal','tgg_brain_trial_prepare','tgg_brain_trial_ready_for_staging',
    'tgg_brain_latest_scorecard','tgg_brain_checkpoint_create','tgg_brain_auto_recover_if_unsafe',
    'tgg_brain_architecture_scan','tgg_brain_lineage_refresh','tgg_brain_predict_change_set',
    'tgg_brain_prediction_accuracy','tgg_brain_execution_trace_state','tgg_brain_conflict_state',
    'tgg_brain_memory_hygiene_state','tgg_brain_spec_state','tgg_brain_spec_coverage',
    'tgg_brain_next_critical_unlocks','tgg_speed_booster_state','tgg_speed_booster_layer_plan',
    'tgg_autobuilder_watchdog','tgg_autonomic_scan','tgg_autonomic_run_cycle','tgg_autonomic_state'
  ];
  v_required_tables text[] := array[
    'tgg_brain_memory','tgg_brain_decisions','tgg_brain_priorities',
    'tgg_brain_learning_events','tgg_brain_goals','tgg_brain_goal_steps',
    'tgg_brain_goal_dependencies','tgg_brain_simulations','tgg_brain_trials',
    'tgg_brain_trial_checks','tgg_brain_versions','tgg_brain_evaluations',
    'tgg_brain_checkpoints','tgg_brain_components','tgg_brain_component_links',
    'tgg_brain_lineage_evidence','tgg_brain_change_predictions',
    'tgg_brain_prediction_calibrations','tgg_brain_execution_traces',
    'tgg_brain_guardrails','tgg_brain_conflicts','tgg_brain_specs',
    'tgg_brain_spec_requirements','tgg_speed_booster_config','tgg_speed_booster_layers',
    'tgg_autonomic_events','tgg_autonomic_gaps','tgg_autonomic_cycles'
  ];
  v_missing_functions jsonb;
  v_missing_tables jsonb;
  v_missing_crons jsonb;
  v_missing_triggers jsonb;
  v_ok boolean;
begin
  select coalesce(jsonb_agg(x order by x),'[]'::jsonb)
  into v_missing_functions
  from unnest(v_required_functions) x
  where not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=x
  );

  select coalesce(jsonb_agg(x order by x),'[]'::jsonb)
  into v_missing_tables
  from unnest(v_required_tables) x
  where to_regclass('public.'||x) is null;

  with required(jobname) as (
    values
      ('tgg-autonomic-os-minute-loop'),
      ('tgg-autobuilder-continuous-watchdog'),
      ('tgg-brain-architecture-refresh'),
      ('tgg-brain-periodic-evaluation')
  )
  select coalesce(jsonb_agg(r.jobname order by r.jobname),'[]'::jsonb)
  into v_missing_crons
  from required r
  where not exists(
    select 1 from cron.job j where j.jobname=r.jobname and j.active=true
  );

  with required(trigger_name) as (
    values
      ('trg_tgg_autonomic_game_idea'),
      ('trg_tgg_autonomic_content'),
      ('trg_tgg_autonomic_master_content')
  )
  select coalesce(jsonb_agg(r.trigger_name order by r.trigger_name),'[]'::jsonb)
  into v_missing_triggers
  from required r
  where not exists(
    select 1 from pg_trigger t
    where t.tgname=r.trigger_name and not t.tgisinternal
  );

  v_ok :=
    jsonb_array_length(v_missing_functions)=0
    and jsonb_array_length(v_missing_tables)=0
    and jsonb_array_length(v_missing_crons)=0
    and jsonb_array_length(v_missing_triggers)=0;

  return jsonb_build_object(
    'ok',v_ok,
    'required_function_count',cardinality(v_required_functions),
    'required_table_count',cardinality(v_required_tables),
    'missing_functions',v_missing_functions,
    'missing_tables',v_missing_tables,
    'missing_crons',v_missing_crons,
    'missing_triggers',v_missing_triggers,
    'canonical_boundary','AB-006',
    'canonical_source_version','V223',
    'production_auto_publish',false,
    'high_risk_auto_execute',false
  );
end $$;

create or replace function public.tgg_autonomic_final_cycle()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_complete jsonb;
  v_result jsonb;
begin
  v_complete := public.tgg_autonomic_completeness();

  if coalesce((v_complete->>'ok')::boolean,false) is not true then
    insert into public.tgg_autonomic_gaps(
      gap_key,gap_type,severity,source_ref,auto_fix_allowed,status,details,last_seen_at
    )
    values(
      'gap:autonomic-completeness','architecture','critical',
      'tgg_autonomic_completeness',true,'open',v_complete,now()
    )
    on conflict(gap_key) do update
    set status='open',severity='critical',auto_fix_allowed=true,
        details=excluded.details,last_seen_at=now(),resolved_at=null;

    return jsonb_build_object(
      'status','restricted',
      'reason','missing_required_system_piece',
      'completeness',v_complete,
      'new_builds_allowed',false,
      'safe_repair_first',true,
      'canonical_boundary','AB-006',
      'canonical_source_version','V223'
    );
  end if;

  update public.tgg_autonomic_gaps
  set status='resolved',resolved_at=now(),last_seen_at=now()
  where gap_key='gap:autonomic-completeness' and status<>'resolved';

  v_result := public.tgg_autonomic_run_cycle();

  return jsonb_build_object(
    'status',coalesce(v_result->>'status','complete'),
    'completeness',v_complete,
    'cycle',v_result,
    'new_builds_allowed',true,
    'missing_piece_scan_first',true,
    'canonical_boundary','AB-006',
    'canonical_source_version','V223'
  );
end $$;

revoke all on function public.tgg_autonomic_completeness() from public,anon,authenticated;
revoke all on function public.tgg_autonomic_final_cycle() from public,anon,authenticated;
grant execute on function public.tgg_autonomic_completeness() to postgres;
grant execute on function public.tgg_autonomic_final_cycle() to postgres;

do $$
declare v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname='tgg-autonomic-os-minute-loop'
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  perform cron.schedule(
    'tgg-autonomic-os-minute-loop',
    '* * * * *',
    'select public.tgg_autonomic_final_cycle();'
  );
end $$;
