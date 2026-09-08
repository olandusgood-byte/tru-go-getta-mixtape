-- TGG Brain 1.0 + autonomous reflection loop
-- Captures verified live orchestration state as of 2026-09-08.
-- Internal-only brain controls; no production/high-risk auto execution.

create table if not exists public.tgg_brain_memory (
  id uuid primary key default gen_random_uuid(),
  memory_key text not null unique,
  memory_type text not null check (memory_type in ('system','idea','decision','lesson','constraint','architecture','qa','dependency')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  importance integer not null default 50 check (importance between 0 and 100),
  active boolean not null default true,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_brain_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_key text not null unique,
  subject text not null,
  decision text not null,
  rationale jsonb not null default '{}'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  reversible boolean not null default true,
  status text not null default 'active' check (status in ('active','superseded','retired')),
  superseded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_brain_priorities (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('idea','task','release','repair','migration','qa')),
  item_key text not null,
  impact integer not null default 50 check (impact between 0 and 100),
  urgency integer not null default 50 check (urgency between 0 and 100),
  dependency_readiness integer not null default 50 check (dependency_readiness between 0 and 100),
  confidence integer not null default 50 check (confidence between 0 and 100),
  risk_penalty integer not null default 0 check (risk_penalty between 0 and 100),
  score numeric generated always as (
    (impact*0.35)+(urgency*0.25)+(dependency_readiness*0.20)+(confidence*0.20)-risk_penalty
  ) stored,
  reason jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(item_type,item_key)
);

create table if not exists public.tgg_brain_learning_events (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('task','failure','browser_qa','visual_qa','playtest','idea_recovery','system')),
  source_key text not null,
  event_type text not null,
  outcome text not null check (outcome in ('success','failure','blocked','recovered','warning')),
  lesson_key text not null,
  lesson jsonb not null default '{}'::jsonb,
  incorporated_into_memory boolean not null default false,
  created_at timestamptz not null default now(),
  unique(source_type,source_key,event_type)
);

alter table public.tgg_brain_memory enable row level security;
alter table public.tgg_brain_decisions enable row level security;
alter table public.tgg_brain_priorities enable row level security;
alter table public.tgg_brain_learning_events enable row level security;

revoke all on public.tgg_brain_memory from anon,authenticated;
revoke all on public.tgg_brain_decisions from anon,authenticated;
revoke all on public.tgg_brain_priorities from anon,authenticated;
revoke all on public.tgg_brain_learning_events from anon,authenticated;

create or replace function public.tgg_brain_remember(
  p_memory_key text,p_memory_type text,p_title text,
  p_content jsonb default '{}'::jsonb,
  p_importance integer default 50,
  p_source_ref text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if p_memory_type not in ('system','idea','decision','lesson','constraint','architecture','qa','dependency') then
    raise exception 'invalid_memory_type';
  end if;
  insert into public.tgg_brain_memory(memory_key,memory_type,title,content,importance,source_ref)
  values(trim(p_memory_key),p_memory_type,trim(p_title),coalesce(p_content,'{}'::jsonb),
         greatest(0,least(100,p_importance)),p_source_ref)
  on conflict(memory_key) do update
    set memory_type=excluded.memory_type,title=excluded.title,content=excluded.content,
        importance=excluded.importance,source_ref=coalesce(excluded.source_ref,public.tgg_brain_memory.source_ref),
        active=true,updated_at=now()
  returning id into v_id;
  return jsonb_build_object('ok',true,'memory_id',v_id,'memory_key',p_memory_key);
end $$;

create or replace function public.tgg_brain_decide(
  p_decision_key text,p_subject text,p_decision text,
  p_rationale jsonb default '{}'::jsonb,
  p_constraints jsonb default '[]'::jsonb,
  p_reversible boolean default true
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  insert into public.tgg_brain_decisions(decision_key,subject,decision,rationale,constraints,reversible)
  values(trim(p_decision_key),trim(p_subject),trim(p_decision),
         coalesce(p_rationale,'{}'::jsonb),coalesce(p_constraints,'[]'::jsonb),coalesce(p_reversible,true))
  on conflict(decision_key) do update
    set subject=excluded.subject,decision=excluded.decision,rationale=excluded.rationale,
        constraints=excluded.constraints,reversible=excluded.reversible,
        status='active',superseded_by=null,updated_at=now()
  returning id into v_id;
  return jsonb_build_object('ok',true,'decision_id',v_id,'decision_key',p_decision_key);
end $$;

create or replace function public.tgg_brain_set_priority(
  p_item_type text,p_item_key text,p_impact integer,p_urgency integer,
  p_dependency_readiness integer,p_confidence integer,
  p_risk_penalty integer default 0,p_reason jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_score numeric;
begin
  insert into public.tgg_brain_priorities(item_type,item_key,impact,urgency,dependency_readiness,confidence,risk_penalty,reason)
  values(p_item_type,trim(p_item_key),
         greatest(0,least(100,p_impact)),greatest(0,least(100,p_urgency)),
         greatest(0,least(100,p_dependency_readiness)),greatest(0,least(100,p_confidence)),
         greatest(0,least(100,p_risk_penalty)),coalesce(p_reason,'{}'::jsonb))
  on conflict(item_type,item_key) do update
    set impact=excluded.impact,urgency=excluded.urgency,
        dependency_readiness=excluded.dependency_readiness,confidence=excluded.confidence,
        risk_penalty=excluded.risk_penalty,reason=excluded.reason,updated_at=now();

  select score into v_score from public.tgg_brain_priorities
  where item_type=p_item_type and item_key=trim(p_item_key);

  return jsonb_build_object('ok',true,'item_type',p_item_type,'item_key',p_item_key,'score',v_score);
end $$;

create or replace function public.tgg_brain_state()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_idea jsonb;
  v_build jsonb;
  v_dependency jsonb;
begin
  v_idea := public.tgg_game_idea_pipeline_state();
  v_build := public.tgg_autobuilder_detect_state();
  v_dependency := private.tgg_latest_operational_dependency_state();

  return jsonb_build_object(
    'brain_version','TGG-BRAIN-1.0',
    'memory_count',(select count(*) from public.tgg_brain_memory where active=true),
    'active_decisions',(select count(*) from public.tgg_brain_decisions where status='active'),
    'top_priorities',coalesce((
      select jsonb_agg(x)
      from (
        select jsonb_build_object('item_type',item_type,'item_key',item_key,'score',score,'reason',reason) as x
        from public.tgg_brain_priorities
        order by score desc,updated_at desc
        limit 10
      ) q
    ),'[]'::jsonb),
    'game_ideas',v_idea,'builder',v_build,'dependencies',coalesce(v_dependency,'{}'::jsonb),
    'production_auto_publish',false,'high_risk_auto_execute',false,
    'canonical_boundary','AB-006','canonical_source_version','V223'
  );
end $$;

create or replace function public.tgg_brain_reflect()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_tasks integer := 0; v_failures integer := 0; v_browser integer := 0;
  v_visual integer := 0; v_playtests integer := 0; v_recoveries integer := 0; v_memories integer := 0;
begin
  with ins as (
    insert into public.tgg_brain_learning_events(source_type,source_key,event_type,outcome,lesson_key,lesson)
    select 'task',t.id::text,'task_complete','success','lesson:task:'||t.id::text,
      jsonb_build_object('task_key',t.task_key,'title',t.title,'task_type',t.task_type,
        'risk_level',t.risk_level,'result',t.last_result,
        'lesson','Reuse verified completed work; do not rebuild unless live evidence shows regression.')
    from public.tgg_build_tasks t where t.status='complete'
    on conflict do nothing returning 1
  ) select count(*) into v_tasks from ins;

  with ins as (
    insert into public.tgg_brain_learning_events(source_type,source_key,event_type,outcome,lesson_key,lesson)
    select 'failure',f.id::text,'build_failure',
      case when f.status='resolved' then 'recovered' else 'failure' end,
      'lesson:failure:'||f.id::text,
      jsonb_build_object('failure_key',f.failure_key,'category',f.category,'severity',f.severity,
        'status',f.status,'message',f.message,'detail',f.detail,
        'lesson',case when f.status='resolved'
          then 'Preserve the resolution evidence and prefer the superseding verified path.'
          else 'Avoid repeating this failure path until its root cause is addressed.' end)
    from public.tgg_build_failures f
    on conflict do nothing returning 1
  ) select count(*) into v_failures from ins;

  with ins as (
    insert into public.tgg_brain_learning_events(source_type,source_key,event_type,outcome,lesson_key,lesson)
    select 'browser_qa',q.id::text,'browser_qa',case when q.status='passed' then 'success' else 'warning' end,
      'lesson:browser_qa:'||q.id::text,
      jsonb_build_object('route_key',q.route_key,'viewport_key',q.viewport_key,'status',q.status,
        'console_error_count',q.console_error_count,'network_error_count',q.network_error_count,
        'stuck_loading',q.stuck_loading,'duplicate_shell',q.duplicate_shell,
        'overlap_count',q.overlap_count,'clipped_text_count',q.clipped_text_count,
        'findings',q.findings,
        'lesson','Keep exact QA evidence attached to the surface and reuse passing layout patterns.')
    from public.tgg_browser_qa_results q
    on conflict do nothing returning 1
  ) select count(*) into v_browser from ins;

  with ins as (
    insert into public.tgg_brain_learning_events(source_type,source_key,event_type,outcome,lesson_key,lesson)
    select 'visual_qa',q.id::text,'visual_qa',case when q.status='passed' then 'success' else 'warning' end,
      'lesson:visual_qa:'||q.id::text,
      jsonb_build_object('viewport_key',q.viewport_key,'status',q.status,'overlap_count',q.overlap_count,
        'clipped_text_count',q.clipped_text_count,'duplicate_shell_count',q.duplicate_shell_count,
        'stuck_loading_count',q.stuck_loading_count,'accessibility_findings',q.accessibility_findings,
        'findings',q.findings,
        'lesson','Prefer layouts that have already passed overlap, clipping, shell-duplication, and loading checks.')
    from public.tgg_visual_qa_results q
    on conflict do nothing returning 1
  ) select count(*) into v_visual from ins;

  with ins as (
    insert into public.tgg_brain_learning_events(source_type,source_key,event_type,outcome,lesson_key,lesson)
    select 'playtest',r.id::text,'playtest_run',
      case when r.status='passed' then 'success' when r.status='blocked' then 'blocked' else 'warning' end,
      'lesson:playtest:'||r.id::text,
      jsonb_build_object('environment',r.environment,'status',r.status,'executor',r.executor,'summary',r.summary,
        'lesson','Use passed journeys as regression contracts; blocked journeys remain gates, not failures to fake around.')
    from public.tgg_playtest_runs r
    on conflict do nothing returning 1
  ) select count(*) into v_playtests from ins;

  with ins as (
    insert into public.tgg_brain_learning_events(source_type,source_key,event_type,outcome,lesson_key,lesson)
    select 'idea_recovery',i.id::text,'idea_recovery',
      case when i.last_error='auto_recovered_stale_worker' then 'recovered'
           when i.last_error='auto_recovery_retries_exhausted' then 'blocked' else 'warning' end,
      'lesson:idea_recovery:'||i.id::text,
      jsonb_build_object('idea_title',i.idea_title,'status',i.status,'retry_count',i.retry_count,
        'max_retries',i.max_retries,'last_error',i.last_error,
        'lesson','Use heartbeats for active work; requeue abandoned work; stop after bounded retries instead of looping forever.')
    from public.tgg_game_idea_inbox i
    where i.last_error in ('auto_recovered_stale_worker','auto_recovery_retries_exhausted')
    on conflict do nothing returning 1
  ) select count(*) into v_recoveries from ins;

  with pending as (
    select e.id,e.lesson_key,e.source_type,e.outcome,e.lesson
    from public.tgg_brain_learning_events e
    where e.incorporated_into_memory=false
    order by e.created_at
    limit 500
  ),
  upserted as (
    insert into public.tgg_brain_memory(memory_key,memory_type,title,content,importance,source_ref)
    select p.lesson_key,'lesson','Learned from '||p.source_type||' · '||p.outcome,p.lesson,
      case p.outcome when 'failure' then 90 when 'blocked' then 90 when 'recovered' then 85
                     when 'warning' then 75 else 60 end,
      p.source_type||':'||p.id::text
    from pending p
    on conflict(memory_key) do update
      set content=excluded.content,importance=excluded.importance,active=true,updated_at=now()
    returning memory_key
  ) select count(*) into v_memories from upserted;

  update public.tgg_brain_learning_events e
  set incorporated_into_memory=true
  where e.incorporated_into_memory=false
    and exists(select 1 from public.tgg_brain_memory m where m.memory_key=e.lesson_key);

  return jsonb_build_object(
    'ok',true,'new_task_lessons',v_tasks,'new_failure_lessons',v_failures,
    'new_browser_qa_lessons',v_browser,'new_visual_qa_lessons',v_visual,
    'new_playtest_lessons',v_playtests,'new_recovery_lessons',v_recoveries,
    'memories_written',v_memories,
    'total_learning_events',(select count(*) from public.tgg_brain_learning_events),
    'active_brain_memories',(select count(*) from public.tgg_brain_memory where active=true)
  );
end $$;

create or replace function public.tgg_brain_next_actions(p_limit integer default 10)
returns jsonb
language sql security definer set search_path=''
as $$
  with candidates as (
    select 'idea'::text as item_type,i.id::text as item_key,
      coalesce(i.idea_title,left(i.idea_text,80)) as title,
      case i.status when 'new' then 100 when 'planning' then 90 when 'building' then 85
                    when 'testing' then 80 when 'blocked' then 20 else 10 end::numeric as base_score,
      jsonb_build_object('status',i.status,'retry_count',i.retry_count,'max_retries',i.max_retries) as detail
    from public.tgg_game_idea_inbox i
    where i.status not in ('complete','canceled','approval_required')

    union all

    select 'task',t.task_key,t.title,
      case t.status when 'ready' then 100 when 'building' then 90 when 'testing' then 80
                    when 'repairing' then 95 when 'blocked' then 25 else 50 end::numeric,
      jsonb_build_object('status',t.status,'risk_level',t.risk_level,'task_type',t.task_type)
    from public.tgg_build_tasks t
    join public.tgg_build_milestones m on m.id=t.milestone_id
    join public.tgg_build_releases r on r.id=m.release_id
    where t.status not in ('complete','skipped')
      and t.risk_level<>'high'
      and coalesce(r.target_environment,'staging')<>'production'
      and coalesce((r.metadata->>'auto_builder_claim_allowed')::boolean,true)=true
  ),
  ranked as (
    select c.*,coalesce(p.score,c.base_score) as final_score
    from candidates c
    left join public.tgg_brain_priorities p
      on p.item_type=c.item_type and p.item_key=c.item_key
    order by coalesce(p.score,c.base_score) desc
    limit greatest(1,least(25,p_limit))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_type',item_type,'item_key',item_key,'title',title,'score',final_score,'detail',detail
  ) order by final_score desc),'[]'::jsonb)
  from ranked
$$;

revoke all on function public.tgg_brain_remember(text,text,text,jsonb,integer,text) from public,anon,authenticated;
revoke all on function public.tgg_brain_decide(text,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.tgg_brain_set_priority(text,text,integer,integer,integer,integer,integer,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_brain_state() from public,anon,authenticated;
revoke all on function public.tgg_brain_reflect() from public,anon,authenticated;
revoke all on function public.tgg_brain_next_actions(integer) from public,anon,authenticated;

grant execute on function public.tgg_brain_remember(text,text,text,jsonb,integer,text) to postgres;
grant execute on function public.tgg_brain_decide(text,text,text,jsonb,jsonb,boolean) to postgres;
grant execute on function public.tgg_brain_set_priority(text,text,integer,integer,integer,integer,integer,jsonb) to postgres;
grant execute on function public.tgg_brain_state() to postgres;
grant execute on function public.tgg_brain_reflect() to postgres;
grant execute on function public.tgg_brain_next_actions(integer) to postgres;

-- Watchdog integration: reflect before choosing next actions.
create or replace function public.tgg_autobuilder_watchdog()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_ctrl public.tgg_autobuilder_controller%rowtype;
  v_codesync jsonb; v_migration jsonb; v_reflection jsonb; v_detect jsonb;
  v_cycle jsonb; v_ideas jsonb; v_idea_recovery jsonb; v_next_actions jsonb;
  v_open_failures integer; v_stale_jobs integer;
begin
  v_codesync := private.tgg_codesync_tick();
  v_migration := private.tgg_refresh_migration_hygiene_runtime_inventory();
  v_idea_recovery := public.tgg_game_idea_recover_stale(interval '2 hours');
  v_reflection := public.tgg_brain_reflect();
  v_detect := public.tgg_autobuilder_detect_state();
  v_ideas := public.tgg_game_idea_pipeline_state();
  v_next_actions := public.tgg_brain_next_actions(10);

  select count(*) into v_open_failures
  from public.tgg_build_failures where status in ('open','repairing','blocked');

  select count(*) into v_stale_jobs
  from public.tgg_theme_deploy_jobs
  where status in ('claimed','processing') and claimed_at < now()-interval '10 minutes';

  select * into v_ctrl from public.tgg_autobuilder_controller where id=1;

  if v_ctrl.enabled then v_cycle := public.tgg_autobuilder_run_cycle();
  else v_cycle := jsonb_build_object('status','paused','reason','controller_disabled');
  end if;

  return jsonb_build_object(
    'ok',true,'checked_at',now(),'reflection',v_reflection,'next_actions',v_next_actions,
    'game_idea_recovery',v_idea_recovery,'game_ideas',v_ideas,'codesync',v_codesync,
    'migration_hygiene',v_migration,'detected',v_detect,'cycle',v_cycle,
    'open_build_failures',v_open_failures,'stale_theme_jobs',v_stale_jobs,
    'production_auto_claim_blocked',true,'high_risk_auto_claim_blocked',true,
    'production_promotion_requires_explicit_approval',true
  );
end $$;

revoke all on function public.tgg_autobuilder_watchdog() from public,anon,authenticated;
grant execute on function public.tgg_autobuilder_watchdog() to postgres;


-- TGG Brain versioned self-evaluation
create table if not exists public.tgg_brain_versions (
  id uuid primary key default gen_random_uuid(),
  version_key text not null unique,
  version_no integer not null unique,
  label text not null,
  status text not null default 'active' check (status in ('active','superseded','retired')),
  heuristics jsonb not null default '{}'::jsonb,
  safety_contract jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  superseded_at timestamptz
);

create table if not exists public.tgg_brain_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_key text not null unique,
  brain_version_id uuid not null references public.tgg_brain_versions(id) on delete restrict,
  window_start timestamptz not null,
  window_end timestamptz not null,
  completed_tasks integer not null default 0,
  failed_tasks integer not null default 0,
  recovered_failures integer not null default 0,
  qa_total integer not null default 0,
  qa_passed integer not null default 0,
  playtests_total integer not null default 0,
  playtests_passed integer not null default 0,
  stale_recoveries integer not null default 0,
  duplicate_preventions integer not null default 0,
  production_drift_count integer not null default 0,
  high_risk_auto_executions integer not null default 0,
  completion_score numeric not null default 0,
  qa_score numeric not null default 0,
  resilience_score numeric not null default 0,
  safety_score numeric not null default 0,
  overall_score numeric not null default 0,
  recommendation text not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tgg_brain_heuristic_adjustments (
  id uuid primary key default gen_random_uuid(),
  brain_version_id uuid not null references public.tgg_brain_versions(id) on delete cascade,
  evaluation_id uuid not null references public.tgg_brain_evaluations(id) on delete cascade,
  heuristic_key text not null,
  old_value jsonb,
  proposed_value jsonb not null,
  reason jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','superseded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(evaluation_id,heuristic_key)
);

alter table public.tgg_brain_versions enable row level security;
alter table public.tgg_brain_evaluations enable row level security;
alter table public.tgg_brain_heuristic_adjustments enable row level security;

revoke all on public.tgg_brain_versions from anon,authenticated;
revoke all on public.tgg_brain_evaluations from anon,authenticated;
revoke all on public.tgg_brain_heuristic_adjustments from anon,authenticated;

insert into public.tgg_brain_versions(
  version_key,version_no,label,status,heuristics,safety_contract
)
values(
  'TGG-BRAIN-1.0',1,'TGG Brain 1.0','active',
  jsonb_build_object(
    'priority_weights',jsonb_build_object('impact',0.35,'urgency',0.25,'dependency_readiness',0.20,'confidence',0.20),
    'max_idea_retries',3,
    'sandbox_required_before_staging',true,
    'reflection_enabled',true,
    'goal_decomposition_enabled',true,
    'simulation_enabled',true
  ),
  jsonb_build_object(
    'production_auto_publish',false,
    'high_risk_auto_execute',false,
    'canonical_boundary','AB-006',
    'canonical_source_version','V223'
  )
)
on conflict(version_key) do update
set label=excluded.label,
    heuristics=excluded.heuristics,
    safety_contract=excluded.safety_contract,
    status='active';

create or replace function public.tgg_brain_evaluate(
  p_window interval default interval '24 hours'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_version public.tgg_brain_versions%rowtype;
  v_start timestamptz := now()-p_window; v_end timestamptz := now();
  v_completed integer := 0; v_failed integer := 0; v_recovered integer := 0;
  v_qa_total integer := 0; v_qa_passed integer := 0; v_play_total integer := 0; v_play_passed integer := 0;
  v_stale integer := 0; v_dupes integer := 0; v_prod_drift integer := 0; v_highrisk integer := 0;
  v_completion numeric := 100; v_qa numeric := 100; v_resilience numeric := 100; v_safety numeric := 100;
  v_overall numeric := 100; v_rec text := 'hold_current_heuristics'; v_key text; v_id uuid;
begin
  select * into v_version from public.tgg_brain_versions where status='active' order by version_no desc limit 1;
  if not found then raise exception 'active_brain_version_required'; end if;

  select count(*) into v_completed from public.tgg_build_tasks
  where status='complete' and coalesce(completed_at,updated_at,created_at)>=v_start;

  select count(*) filter(where status<>'resolved'),count(*) filter(where status='resolved')
  into v_failed,v_recovered from public.tgg_build_failures
  where coalesce(resolved_at,first_seen_at)>=v_start;

  select
    (select count(*) from public.tgg_browser_qa_results where checked_at>=v_start)
    +(select count(*) from public.tgg_visual_qa_results where checked_at>=v_start),
    (select count(*) from public.tgg_browser_qa_results where checked_at>=v_start and status='passed')
    +(select count(*) from public.tgg_visual_qa_results where checked_at>=v_start and status='passed')
  into v_qa_total,v_qa_passed;

  select count(*),count(*) filter(where status='passed') into v_play_total,v_play_passed
  from public.tgg_playtest_runs where coalesce(finished_at,started_at)>=v_start;

  select count(*) into v_stale from public.tgg_game_idea_inbox
  where updated_at>=v_start and last_error='auto_recovered_stale_worker';

  select coalesce(sum(duplicate_count),0) into v_dupes from public.tgg_game_idea_inbox where updated_at>=v_start;

  select count(*) into v_prod_drift from public.tgg_operational_audit_log
  where occurred_at>=v_start
    and (payload->>'production_state_changed'='true' or payload->>'production_touched'='true');

  select count(*) into v_highrisk from public.tgg_build_tasks
  where updated_at>=v_start and risk_level='high'
    and status in ('building','testing','complete')
    and coalesce(locked_by,'') ilike '%auto%';

  if (v_completed+v_failed)>0 then
    v_completion := round((v_completed::numeric/(v_completed+v_failed))*100,2);
  end if;
  if v_qa_total>0 then v_qa := round((v_qa_passed::numeric/v_qa_total)*100,2); end if;

  v_resilience := greatest(0,least(100,100-least(v_failed*8,40)+least(v_recovered*4,20)-least(v_stale*3,15)));
  v_safety := greatest(0,least(100,100-least(v_prod_drift*50,100)-least(v_highrisk*50,100)));
  v_overall := round(v_completion*0.30+v_qa*0.25+v_resilience*0.20+v_safety*0.25,2);

  if v_safety<100 then v_rec:='freeze_heuristic_changes_and_review_safety';
  elsif v_overall<70 then v_rec:='tighten_qa_and_reduce_batch_size';
  elsif v_qa<85 then v_rec:='increase_qa_depth';
  elsif v_completion<85 then v_rec:='improve_dependency_planning';
  elsif v_resilience<85 then v_rec:='improve_retry_and_repair_strategy';
  else v_rec:='hold_current_heuristics'; end if;

  v_key := 'eval:'||v_version.version_key||':'||replace(gen_random_uuid()::text,'-','');

  insert into public.tgg_brain_evaluations(
    evaluation_key,brain_version_id,window_start,window_end,completed_tasks,failed_tasks,recovered_failures,
    qa_total,qa_passed,playtests_total,playtests_passed,stale_recoveries,duplicate_preventions,
    production_drift_count,high_risk_auto_executions,completion_score,qa_score,resilience_score,safety_score,
    overall_score,recommendation,metrics
  ) values(
    v_key,v_version.id,v_start,v_end,v_completed,v_failed,v_recovered,v_qa_total,v_qa_passed,
    v_play_total,v_play_passed,v_stale,v_dupes,v_prod_drift,v_highrisk,
    v_completion,v_qa,v_resilience,v_safety,v_overall,v_rec,
    jsonb_build_object('window',p_window::text,'brain_version',v_version.version_key,'duplicate_preventions',v_dupes)
  ) returning id into v_id;

  return jsonb_build_object(
    'ok',true,'evaluation_id',v_id,'brain_version',v_version.version_key,
    'completion_score',v_completion,'qa_score',v_qa,'resilience_score',v_resilience,
    'safety_score',v_safety,'overall_score',v_overall,'recommendation',v_rec
  );
end $$;

create or replace function public.tgg_brain_propose_adjustments(p_evaluation_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_eval public.tgg_brain_evaluations%rowtype; v_version public.tgg_brain_versions%rowtype; v_count integer := 0;
begin
  select * into v_eval from public.tgg_brain_evaluations where id=p_evaluation_id;
  if not found then raise exception 'evaluation_not_found'; end if;
  select * into v_version from public.tgg_brain_versions where id=v_eval.brain_version_id;
  if not found then raise exception 'brain_version_not_found'; end if;

  if v_eval.safety_score<100 then
    insert into public.tgg_brain_heuristic_adjustments(brain_version_id,evaluation_id,heuristic_key,old_value,proposed_value,reason)
    values(v_version.id,v_eval.id,'autonomy_mode',to_jsonb('normal'::text),to_jsonb('restricted'::text),
      jsonb_build_object('reason','safety_score_below_100','score',v_eval.safety_score)) on conflict do nothing;
  elsif v_eval.qa_score<85 then
    insert into public.tgg_brain_heuristic_adjustments(brain_version_id,evaluation_id,heuristic_key,old_value,proposed_value,reason)
    values(v_version.id,v_eval.id,'qa_depth',to_jsonb('standard'::text),to_jsonb('expanded'::text),
      jsonb_build_object('reason','qa_score_below_85','score',v_eval.qa_score)) on conflict do nothing;
  elsif v_eval.completion_score<85 then
    insert into public.tgg_brain_heuristic_adjustments(brain_version_id,evaluation_id,heuristic_key,old_value,proposed_value,reason)
    values(v_version.id,v_eval.id,'planning_mode',to_jsonb('normal'::text),to_jsonb('dependency_first'::text),
      jsonb_build_object('reason','completion_score_below_85','score',v_eval.completion_score)) on conflict do nothing;
  elsif v_eval.resilience_score<85 then
    insert into public.tgg_brain_heuristic_adjustments(brain_version_id,evaluation_id,heuristic_key,old_value,proposed_value,reason)
    values(v_version.id,v_eval.id,'repair_mode',to_jsonb('standard'::text),to_jsonb('conservative'::text),
      jsonb_build_object('reason','resilience_score_below_85','score',v_eval.resilience_score)) on conflict do nothing;
  end if;

  select count(*) into v_count from public.tgg_brain_heuristic_adjustments
  where evaluation_id=p_evaluation_id and status='proposed';

  return jsonb_build_object('ok',true,'evaluation_id',p_evaluation_id,'proposals',v_count,'auto_apply',false);
end $$;

create or replace function public.tgg_brain_latest_scorecard()
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'evaluation_id',e.id,'brain_version',v.version_key,'window_start',e.window_start,'window_end',e.window_end,
    'completion_score',e.completion_score,'qa_score',e.qa_score,'resilience_score',e.resilience_score,
    'safety_score',e.safety_score,'overall_score',e.overall_score,'recommendation',e.recommendation,
    'proposed_adjustments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'heuristic_key',a.heuristic_key,'proposed_value',a.proposed_value,'reason',a.reason,'status',a.status
      ) order by a.created_at)
      from public.tgg_brain_heuristic_adjustments a where a.evaluation_id=e.id
    ),'[]'::jsonb),
    'safety_contract',v.safety_contract
  )
  from public.tgg_brain_evaluations e
  join public.tgg_brain_versions v on v.id=e.brain_version_id
  order by e.created_at desc limit 1
$$;

create or replace function public.tgg_brain_periodic_evaluation()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_eval jsonb; v_props jsonb;
begin
  v_eval := public.tgg_brain_evaluate(interval '24 hours');
  v_props := public.tgg_brain_propose_adjustments((v_eval->>'evaluation_id')::uuid);
  return jsonb_build_object('ok',true,'evaluation',v_eval,'proposals',v_props,'auto_apply',false);
end $$;

revoke all on function public.tgg_brain_evaluate(interval) from public,anon,authenticated;
revoke all on function public.tgg_brain_propose_adjustments(uuid) from public,anon,authenticated;
revoke all on function public.tgg_brain_latest_scorecard() from public,anon,authenticated;
revoke all on function public.tgg_brain_periodic_evaluation() from public,anon,authenticated;

grant execute on function public.tgg_brain_evaluate(interval) to postgres;
grant execute on function public.tgg_brain_propose_adjustments(uuid) to postgres;
grant execute on function public.tgg_brain_latest_scorecard() to postgres;
grant execute on function public.tgg_brain_periodic_evaluation() to postgres;

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='tgg-brain-periodic-evaluation'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule('tgg-brain-periodic-evaluation','17 */6 * * *','select public.tgg_brain_periodic_evaluation();');
end $$;


-- TGG Brain checkpoint + heuristic rollback
create table if not exists public.tgg_brain_checkpoints (
  id uuid primary key default gen_random_uuid(),
  checkpoint_key text not null unique,
  brain_version_id uuid not null references public.tgg_brain_versions(id) on delete restrict,
  label text not null,
  heuristics jsonb not null,
  safety_contract jsonb not null,
  scorecard jsonb not null default '{}'::jsonb,
  source_evaluation_id uuid references public.tgg_brain_evaluations(id) on delete set null,
  state text not null default 'ready' check (state in ('ready','superseded','restored','retired')),
  created_at timestamptz not null default now(),
  restored_at timestamptz
);

alter table public.tgg_brain_checkpoints enable row level security;
revoke all on public.tgg_brain_checkpoints from anon,authenticated;

create or replace function public.tgg_brain_checkpoint_create(p_checkpoint_key text,p_label text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_version public.tgg_brain_versions%rowtype; v_score jsonb; v_eval_id uuid; v_id uuid;
begin
  select * into v_version from public.tgg_brain_versions where status='active' order by version_no desc limit 1;
  if not found then raise exception 'active_brain_version_required'; end if;

  v_score := public.tgg_brain_latest_scorecard();
  v_eval_id := nullif(v_score->>'evaluation_id','')::uuid;

  insert into public.tgg_brain_checkpoints(
    checkpoint_key,brain_version_id,label,heuristics,safety_contract,scorecard,source_evaluation_id,state
  )
  values(trim(p_checkpoint_key),v_version.id,trim(p_label),v_version.heuristics,v_version.safety_contract,
         coalesce(v_score,'{}'::jsonb),v_eval_id,'ready')
  on conflict(checkpoint_key) do update
    set label=excluded.label,heuristics=excluded.heuristics,safety_contract=excluded.safety_contract,
        scorecard=excluded.scorecard,source_evaluation_id=excluded.source_evaluation_id,state='ready'
  returning id into v_id;

  return jsonb_build_object('ok',true,'checkpoint_id',v_id,'checkpoint_key',p_checkpoint_key,
    'brain_version',v_version.version_key,'safety_contract',v_version.safety_contract);
end $$;

create or replace function public.tgg_brain_checkpoint_preview_restore(p_checkpoint_key text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_cp public.tgg_brain_checkpoints%rowtype; v_active public.tgg_brain_versions%rowtype;
begin
  select * into v_cp from public.tgg_brain_checkpoints
  where checkpoint_key=p_checkpoint_key and state in ('ready','restored');
  if not found then raise exception 'checkpoint_not_found'; end if;

  select * into v_active from public.tgg_brain_versions where status='active' order by version_no desc limit 1;

  return jsonb_build_object(
    'checkpoint_key',v_cp.checkpoint_key,'current_version',v_active.version_key,
    'heuristics_change',v_active.heuristics is distinct from v_cp.heuristics,
    'safety_contract_change',v_active.safety_contract is distinct from v_cp.safety_contract,
    'checkpoint_scorecard',v_cp.scorecard,
    'restore_allowed',v_active.safety_contract=v_cp.safety_contract,
    'requires_manual_restore',true
  );
end $$;

create or replace function public.tgg_brain_checkpoint_restore(p_checkpoint_key text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_cp public.tgg_brain_checkpoints%rowtype; v_active public.tgg_brain_versions%rowtype;
begin
  if current_user <> 'postgres' then raise exception 'internal_worker_only'; end if;

  select * into v_cp from public.tgg_brain_checkpoints
  where checkpoint_key=p_checkpoint_key and state in ('ready','restored');
  if not found then raise exception 'checkpoint_not_found'; end if;

  select * into v_active from public.tgg_brain_versions where status='active' order by version_no desc limit 1;

  if v_active.safety_contract is distinct from v_cp.safety_contract then
    raise exception 'safety_contract_mismatch_restore_blocked';
  end if;

  update public.tgg_brain_versions set heuristics=v_cp.heuristics where id=v_active.id;
  update public.tgg_brain_checkpoints set state='restored',restored_at=now() where id=v_cp.id;

  return jsonb_build_object('ok',true,'checkpoint_key',p_checkpoint_key,
    'restored_heuristics',true,'safety_contract_changed',false,'production_touched',false);
end $$;

create or replace function public.tgg_brain_auto_recover_if_unsafe(
  p_checkpoint_key text default 'TGG-BRAIN-1.0-BASELINE'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_score jsonb; v_safety numeric; v_preview jsonb; v_restore jsonb;
begin
  v_score := public.tgg_brain_latest_scorecard();
  if v_score is null then
    return jsonb_build_object('ok',true,'action','none','reason','no_scorecard');
  end if;

  v_safety := coalesce((v_score->>'safety_score')::numeric,100);
  if v_safety>=100 then
    return jsonb_build_object('ok',true,'action','none','reason','safety_healthy','safety_score',v_safety);
  end if;

  v_preview := public.tgg_brain_checkpoint_preview_restore(p_checkpoint_key);
  if coalesce((v_preview->>'restore_allowed')::boolean,false) is not true then
    return jsonb_build_object('ok',false,'action','blocked','reason','checkpoint_safety_contract_mismatch',
      'safety_score',v_safety,'preview',v_preview);
  end if;

  v_restore := public.tgg_brain_checkpoint_restore(p_checkpoint_key);
  return jsonb_build_object('ok',true,'action','heuristics_restored','reason','safety_score_below_100',
    'safety_score',v_safety,'restore',v_restore,'safety_contract_changed',false,'production_touched',false);
end $$;

revoke all on function public.tgg_brain_checkpoint_create(text,text) from public,anon,authenticated;
revoke all on function public.tgg_brain_checkpoint_preview_restore(text) from public,anon,authenticated;
revoke all on function public.tgg_brain_checkpoint_restore(text) from public,anon,authenticated;
revoke all on function public.tgg_brain_auto_recover_if_unsafe(text) from public,anon,authenticated;

grant execute on function public.tgg_brain_checkpoint_create(text,text) to postgres;
grant execute on function public.tgg_brain_checkpoint_preview_restore(text) to postgres;
grant execute on function public.tgg_brain_checkpoint_restore(text) to postgres;
grant execute on function public.tgg_brain_auto_recover_if_unsafe(text) to postgres;

select public.tgg_brain_checkpoint_create('TGG-BRAIN-1.0-BASELINE','TGG Brain 1.0 verified baseline');


-- TGG Brain architecture graph
create table if not exists public.tgg_brain_components (
  id uuid primary key default gen_random_uuid(),
  component_key text not null unique,
  component_type text not null
    check (component_type in ('database_table','database_function','edge_function','page','api','worker','cron','ui_module','game_system','integration','repository_path')),
  name text not null,
  environment text not null default 'shared'
    check (environment in ('shared','development','staging','production')),
  source_ref text,
  canonical boolean not null default false,
  active boolean not null default true,
  risk_level text not null default 'medium'
    check (risk_level in ('low','medium','high')),
  owner_domain text,
  capabilities jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  health_status text not null default 'unknown'
    check (health_status in ('unknown','healthy','warning','degraded','blocked','retired')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_brain_component_links (
  id uuid primary key default gen_random_uuid(),
  from_component_id uuid not null references public.tgg_brain_components(id) on delete cascade,
  to_component_id uuid not null references public.tgg_brain_components(id) on delete cascade,
  relationship text not null
    check (relationship in ('depends_on','reads','writes','calls','renders','routes_to','authenticates_via','deploys_to','tests','monitors','backs_up','syncs_with','extends')),
  strength integer not null default 50 check (strength between 1 and 100),
  required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(from_component_id,to_component_id,relationship),
  check (from_component_id <> to_component_id)
);

alter table public.tgg_brain_components enable row level security;
alter table public.tgg_brain_component_links enable row level security;
revoke all on public.tgg_brain_components from anon,authenticated;
revoke all on public.tgg_brain_component_links from anon,authenticated;

create or replace function public.tgg_brain_component_impact(p_component_key text,p_depth integer default 2)
returns jsonb
language sql security definer set search_path=''
as $$
  with recursive seed as (
    select id,component_key,component_type,name,environment,risk_level,canonical,0 as depth
    from public.tgg_brain_components
    where component_key=p_component_key and active=true
  ),
  walk as (
    select * from seed
    union
    select c.id,c.component_key,c.component_type,c.name,c.environment,c.risk_level,c.canonical,w.depth+1
    from walk w
    join public.tgg_brain_component_links l on l.to_component_id=w.id
    join public.tgg_brain_components c on c.id=l.from_component_id and c.active=true
    where w.depth < greatest(0,least(5,p_depth))
  )
  select jsonb_build_object(
    'component_key',p_component_key,
    'affected_count',(select count(distinct id) from walk)-1,
    'production_affected',exists(select 1 from walk where depth>0 and environment='production'),
    'high_risk_affected',exists(select 1 from walk where depth>0 and risk_level='high')
  )
$$;

create or replace function public.tgg_brain_component_find(p_query text,p_limit integer default 20)
returns jsonb
language sql security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'component_key',component_key,'component_type',component_type,'name',name,
    'environment',environment,'risk_level',risk_level,'canonical',canonical,
    'owner_domain',owner_domain,'capabilities',capabilities,'source_ref',source_ref,'health_status',health_status
  ) order by canonical desc,name),'[]'::jsonb)
  from (
    select *
    from public.tgg_brain_components
    where active=true and (
      component_key ilike '%'||trim(p_query)||'%'
      or name ilike '%'||trim(p_query)||'%'
      or coalesce(owner_domain,'') ilike '%'||trim(p_query)||'%'
      or capabilities::text ilike '%'||trim(p_query)||'%'
    )
    limit greatest(1,least(50,p_limit))
  ) q
$$;

revoke all on function public.tgg_brain_component_impact(text,integer) from public,anon,authenticated;
revoke all on function public.tgg_brain_component_find(text,integer) from public,anon,authenticated;
grant execute on function public.tgg_brain_component_impact(text,integer) to postgres;
grant execute on function public.tgg_brain_component_find(text,integer) to postgres;


-- TGG Brain architecture graph + lineage
create table if not exists public.tgg_brain_components (
  id uuid primary key default gen_random_uuid(),
  component_key text not null unique,
  component_type text not null
    check (component_type in ('database_table','database_function','edge_function','page','api','worker','cron','ui_module','game_system','integration','repository_path')),
  name text not null,
  environment text not null default 'shared'
    check (environment in ('shared','development','staging','production')),
  source_ref text,
  canonical boolean not null default false,
  active boolean not null default true,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  owner_domain text,
  capabilities jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  health_status text not null default 'unknown'
    check (health_status in ('unknown','healthy','warning','degraded','blocked','retired')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_brain_component_links (
  id uuid primary key default gen_random_uuid(),
  from_component_id uuid not null references public.tgg_brain_components(id) on delete cascade,
  to_component_id uuid not null references public.tgg_brain_components(id) on delete cascade,
  relationship text not null
    check (relationship in ('depends_on','reads','writes','calls','renders','routes_to','authenticates_via','deploys_to','tests','monitors','backs_up','syncs_with','extends')),
  strength integer not null default 50 check (strength between 1 and 100),
  required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(from_component_id,to_component_id,relationship),
  check (from_component_id<>to_component_id)
);

create table if not exists public.tgg_brain_lineage_evidence (
  id uuid primary key default gen_random_uuid(),
  from_component_id uuid not null references public.tgg_brain_components(id) on delete cascade,
  to_component_id uuid not null references public.tgg_brain_components(id) on delete cascade,
  relationship text not null check (relationship in ('depends_on','reads','writes','calls')),
  evidence_type text not null check (evidence_type in ('foreign_key','function_sql')),
  evidence_ref text not null,
  confidence integer not null default 100 check (confidence between 1 and 100),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  unique(from_component_id,to_component_id,relationship,evidence_type,evidence_ref)
);

create table if not exists public.tgg_brain_architecture_scans (
  id uuid primary key default gen_random_uuid(),
  scan_key text not null unique,
  scanned_at timestamptz not null default now(),
  active_components integer not null default 0,
  active_tables integer not null default 0,
  active_functions integer not null default 0,
  stale_components integer not null default 0,
  new_since_previous integer not null default 0,
  missing_since_previous integer not null default 0,
  drift_status text not null default 'clean' check (drift_status in ('clean','changed','warning')),
  summary jsonb not null default '{}'::jsonb
);

alter table public.tgg_brain_components enable row level security;
alter table public.tgg_brain_component_links enable row level security;
alter table public.tgg_brain_lineage_evidence enable row level security;
alter table public.tgg_brain_architecture_scans enable row level security;

revoke all on public.tgg_brain_components from anon,authenticated;
revoke all on public.tgg_brain_component_links from anon,authenticated;
revoke all on public.tgg_brain_lineage_evidence from anon,authenticated;
revoke all on public.tgg_brain_architecture_scans from anon,authenticated;

create or replace function public.tgg_brain_architecture_refresh()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_tables integer:=0; v_functions integer:=0; v_verified integer:=0; v_now timestamptz:=now();
begin
  with src as (
    select 'dbtable:'||c.table_name component_key,c.table_name name,
      case when c.table_name like 'tgg_world_%' then 'game'
           when c.table_name like 'tgg_brain_%' then 'brain'
           when c.table_name like 'tgg_build_%' or c.table_name like 'tgg_autobuilder_%' then 'build'
           when c.table_name like 'tgg_creator_%' then 'creator_platform' else 'platform' end owner_domain,
      case when c.table_name like 'tgg_build_%' or c.table_name like 'tgg_autobuilder_%' then 'high' else 'medium' end risk_level
    from information_schema.tables c
    where c.table_schema='public'
      and (c.table_name like 'tgg_world_%' or c.table_name like 'tgg_brain_%'
        or c.table_name like 'tgg_build_%' or c.table_name like 'tgg_autobuilder_%'
        or c.table_name like 'tgg_creator_%')
  ), upserted as (
    insert into public.tgg_brain_components(
      component_key,component_type,name,environment,source_ref,canonical,active,risk_level,owner_domain,
      capabilities,constraints,metadata,health_status,last_verified_at,updated_at
    )
    select component_key,'database_table',name,'shared','table:public.'||name,false,true,risk_level,owner_domain,
      jsonb_build_array('database_storage'),jsonb_build_array('internal_component'),
      jsonb_build_object('auto_discovered',true,'schema','public'),'healthy',v_now,v_now
    from src
    on conflict(component_key) do update set
      component_type='database_table',name=excluded.name,source_ref=excluded.source_ref,active=true,
      risk_level=excluded.risk_level,owner_domain=excluded.owner_domain,
      metadata=public.tgg_brain_components.metadata||excluded.metadata,
      health_status='healthy',last_verified_at=v_now,updated_at=v_now
    returning 1
  ) select count(*) into v_tables from upserted;

  with src as (
    select 'dbfn:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' component_key,
      p.proname name,n.nspname schema_name,p.prosecdef security_definer,
      case when p.proname like 'tgg_world_%' then 'game'
           when p.proname like 'tgg_brain_%' then 'brain'
           when p.proname like 'tgg_build_%' or p.proname like 'tgg_autobuilder_%' then 'build'
           when p.proname like 'tgg_creator_%' then 'creator_platform' else 'platform' end owner_domain,
      case when p.prosecdef or p.proname like 'tgg_build_%' or p.proname like 'tgg_autobuilder_%' then 'high' else 'medium' end risk_level
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private')
      and (p.proname like 'tgg_world_%' or p.proname like 'tgg_brain_%'
        or p.proname like 'tgg_build_%' or p.proname like 'tgg_autobuilder_%'
        or p.proname like 'tgg_creator_%')
  ), upserted as (
    insert into public.tgg_brain_components(
      component_key,component_type,name,environment,source_ref,canonical,active,risk_level,owner_domain,
      capabilities,constraints,metadata,health_status,last_verified_at,updated_at
    )
    select component_key,'database_function',name,'shared','function:'||schema_name||'.'||name,false,true,
      risk_level,owner_domain,jsonb_build_array('database_rpc'),
      case when security_definer then jsonb_build_array('security_definer','internal_review_required')
           else jsonb_build_array('internal_component') end,
      jsonb_build_object('auto_discovered',true,'schema',schema_name,'security_definer',security_definer),
      'healthy',v_now,v_now
    from src
    on conflict(component_key) do update set
      component_type='database_function',name=excluded.name,source_ref=excluded.source_ref,active=true,
      risk_level=excluded.risk_level,owner_domain=excluded.owner_domain,constraints=excluded.constraints,
      metadata=public.tgg_brain_components.metadata||excluded.metadata,
      health_status='healthy',last_verified_at=v_now,updated_at=v_now
    returning 1
  ) select count(*) into v_functions from upserted;

  update public.tgg_brain_components c
  set health_status='warning',active=false,updated_at=v_now,
      metadata=c.metadata||jsonb_build_object('stale_detected_at',v_now)
  where coalesce((c.metadata->>'auto_discovered')::boolean,false)=true
    and c.component_type in ('database_table','database_function')
    and c.last_verified_at<v_now
    and not exists(
      select 1 from information_schema.tables t
      where c.component_type='database_table'
        and c.component_key='dbtable:'||t.table_name and t.table_schema='public'
    )
    and not exists(
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where c.component_type='database_function'
        and c.component_key='dbfn:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
        and n.nspname in ('public','private')
    );

  select count(*) into v_verified from public.tgg_brain_components where active=true and last_verified_at=v_now;

  return jsonb_build_object('ok',true,'refreshed_at',v_now,'tables_seen',v_tables,
    'functions_seen',v_functions,'components_verified',v_verified,'auto_retire_manual_components',false);
end $$;

create or replace function public.tgg_brain_lineage_refresh()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_now timestamptz:=now(); v_fk integer:=0; v_reads integer:=0; v_writes integer:=0; v_links integer:=0;
begin
  update public.tgg_brain_lineage_evidence set active=false where evidence_type in ('foreign_key','function_sql');

  with fk as (
    select c_from.id from_id,c_to.id to_id,con.oid::text evidence_ref
    from pg_constraint con
    join pg_class src on src.oid=con.conrelid
    join pg_namespace srcn on srcn.oid=src.relnamespace
    join pg_class dst on dst.oid=con.confrelid
    join pg_namespace dstn on dstn.oid=dst.relnamespace
    join public.tgg_brain_components c_from on c_from.component_key='dbtable:'||src.relname and c_from.active=true
    join public.tgg_brain_components c_to on c_to.component_key='dbtable:'||dst.relname and c_to.active=true
    where con.contype='f' and srcn.nspname='public' and dstn.nspname='public'
      and src.relname like 'tgg_%' and dst.relname like 'tgg_%'
  ), u as (
    insert into public.tgg_brain_lineage_evidence(
      from_component_id,to_component_id,relationship,evidence_type,evidence_ref,confidence,first_seen_at,last_seen_at,active
    )
    select from_id,to_id,'depends_on','foreign_key',evidence_ref,100,v_now,v_now,true from fk
    on conflict(from_component_id,to_component_id,relationship,evidence_type,evidence_ref) do update
      set confidence=excluded.confidence,last_seen_at=v_now,active=true
    returning 1
  ) select count(*) into v_fk from u;

  with defs as (
    select c_fn.id fn_id,lower(pg_get_functiondef(p.oid)) def,p.oid::text fn_oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join public.tgg_brain_components c_fn
      on c_fn.component_key='dbfn:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
      and c_fn.active=true
    where n.nspname in ('public','private') and p.proname like 'tgg_%'
  ), refs as (
    select d.fn_id,c_tbl.id tbl_id,d.fn_oid||':read:'||c_tbl.component_key evidence_ref
    from defs d join public.tgg_brain_components c_tbl
      on c_tbl.component_type='database_table' and c_tbl.active=true and c_tbl.component_key like 'dbtable:tgg_%'
    where d.def like '%from public.'||replace(c_tbl.component_key,'dbtable:','')||'%'
       or d.def like '%join public.'||replace(c_tbl.component_key,'dbtable:','')||'%'
  ), u as (
    insert into public.tgg_brain_lineage_evidence(
      from_component_id,to_component_id,relationship,evidence_type,evidence_ref,confidence,first_seen_at,last_seen_at,active
    )
    select fn_id,tbl_id,'reads','function_sql',evidence_ref,95,v_now,v_now,true from refs
    on conflict(from_component_id,to_component_id,relationship,evidence_type,evidence_ref) do update
      set confidence=excluded.confidence,last_seen_at=v_now,active=true
    returning 1
  ) select count(*) into v_reads from u;

  with defs as (
    select c_fn.id fn_id,lower(pg_get_functiondef(p.oid)) def,p.oid::text fn_oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join public.tgg_brain_components c_fn
      on c_fn.component_key='dbfn:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
      and c_fn.active=true
    where n.nspname in ('public','private') and p.proname like 'tgg_%'
  ), refs as (
    select d.fn_id,c_tbl.id tbl_id,d.fn_oid||':write:'||c_tbl.component_key evidence_ref
    from defs d join public.tgg_brain_components c_tbl
      on c_tbl.component_type='database_table' and c_tbl.active=true and c_tbl.component_key like 'dbtable:tgg_%'
    where d.def like '%insert into public.'||replace(c_tbl.component_key,'dbtable:','')||'%'
       or d.def like '%update public.'||replace(c_tbl.component_key,'dbtable:','')||'%'
       or d.def like '%delete from public.'||replace(c_tbl.component_key,'dbtable:','')||'%'
  ), u as (
    insert into public.tgg_brain_lineage_evidence(
      from_component_id,to_component_id,relationship,evidence_type,evidence_ref,confidence,first_seen_at,last_seen_at,active
    )
    select fn_id,tbl_id,'writes','function_sql',evidence_ref,98,v_now,v_now,true from refs
    on conflict(from_component_id,to_component_id,relationship,evidence_type,evidence_ref) do update
      set confidence=excluded.confidence,last_seen_at=v_now,active=true
    returning 1
  ) select count(*) into v_writes from u;

  with grouped as (
    select from_component_id,to_component_id,relationship,max(confidence) strength,
      jsonb_agg(jsonb_build_object('evidence_type',evidence_type,'evidence_ref',evidence_ref,'confidence',confidence)
        order by confidence desc,evidence_ref) evidence
    from public.tgg_brain_lineage_evidence where active=true
    group by from_component_id,to_component_id,relationship
  ), u as (
    insert into public.tgg_brain_component_links(from_component_id,to_component_id,relationship,strength,required,metadata)
    select from_component_id,to_component_id,relationship,strength,true,
      jsonb_build_object('auto_discovered',true,'evidence',evidence)
    from grouped
    on conflict(from_component_id,to_component_id,relationship) do update
      set strength=greatest(public.tgg_brain_component_links.strength,excluded.strength),
          metadata=public.tgg_brain_component_links.metadata||excluded.metadata
    returning 1
  ) select count(*) into v_links from u;

  return jsonb_build_object('ok',true,'refreshed_at',v_now,'foreign_key_dependencies',v_fk,
    'function_reads',v_reads,'function_writes',v_writes,'links_materialized',v_links,
    'confidence_policy','foreign_keys=100, writes=98, reads=95');
end $$;

create or replace function public.tgg_brain_architecture_scan()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_refresh jsonb; v_lineage jsonb; v_now timestamptz:=now();
  v_active integer:=0; v_tables integer:=0; v_functions integer:=0; v_stale integer:=0;
  v_prev public.tgg_brain_architecture_scans%rowtype; v_new integer:=0; v_missing integer:=0;
  v_status text:='clean'; v_key text; v_id uuid;
begin
  v_refresh:=public.tgg_brain_architecture_refresh();
  v_lineage:=public.tgg_brain_lineage_refresh();

  select count(*) filter(where active=true),
         count(*) filter(where active=true and component_type='database_table'),
         count(*) filter(where active=true and component_type='database_function'),
         count(*) filter(where active=false and coalesce((metadata->>'auto_discovered')::boolean,false)=true)
  into v_active,v_tables,v_functions,v_stale
  from public.tgg_brain_components;

  select * into v_prev from public.tgg_brain_architecture_scans order by scanned_at desc limit 1;
  if found then
    v_new:=greatest(v_active-v_prev.active_components,0);
    v_missing:=greatest(v_prev.active_components-v_active,0);
  end if;

  if v_missing>0 or v_stale>0 then v_status:='warning';
  elsif v_new>0 then v_status:='changed';
  else v_status:='clean'; end if;

  v_key:='archscan:'||replace(gen_random_uuid()::text,'-','');

  insert into public.tgg_brain_architecture_scans(
    scan_key,scanned_at,active_components,active_tables,active_functions,stale_components,
    new_since_previous,missing_since_previous,drift_status,summary
  )
  values(v_key,v_now,v_active,v_tables,v_functions,v_stale,v_new,v_missing,v_status,
    jsonb_build_object('refresh',v_refresh,'lineage',v_lineage,
      'production_auto_publish',false,'high_risk_auto_execute',false,
      'canonical_boundary','AB-006','canonical_source_version','V223'))
  returning id into v_id;

  return jsonb_build_object('ok',true,'scan_id',v_id,'drift_status',v_status,'active_components',v_active,
    'active_tables',v_tables,'active_functions',v_functions,'stale_components',v_stale,
    'new_since_previous',v_new,'missing_since_previous',v_missing,'lineage',v_lineage);
end $$;

create or replace function public.tgg_brain_architecture_latest()
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'scan_id',id,'scanned_at',scanned_at,'active_components',active_components,
    'active_tables',active_tables,'active_functions',active_functions,'stale_components',stale_components,
    'new_since_previous',new_since_previous,'missing_since_previous',missing_since_previous,
    'drift_status',drift_status,'summary',summary
  )
  from public.tgg_brain_architecture_scans order by scanned_at desc limit 1
$$;

revoke all on function public.tgg_brain_architecture_refresh() from public,anon,authenticated;
revoke all on function public.tgg_brain_lineage_refresh() from public,anon,authenticated;
revoke all on function public.tgg_brain_architecture_scan() from public,anon,authenticated;
revoke all on function public.tgg_brain_architecture_latest() from public,anon,authenticated;

grant execute on function public.tgg_brain_architecture_refresh() to postgres;
grant execute on function public.tgg_brain_lineage_refresh() to postgres;
grant execute on function public.tgg_brain_architecture_scan() to postgres;
grant execute on function public.tgg_brain_architecture_latest() to postgres;

do $$
declare v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='tgg-brain-architecture-refresh'
  loop perform cron.unschedule(v_jobid); end loop;
  perform cron.schedule('tgg-brain-architecture-refresh','7 * * * *','select public.tgg_brain_architecture_scan();');
end $$;


-- TGG Brain lineage-based change prediction
create table if not exists public.tgg_brain_change_predictions (
  id uuid primary key default gen_random_uuid(),
  prediction_key text not null unique,
  goal_id uuid references public.tgg_brain_goals(id) on delete cascade,
  step_id uuid references public.tgg_brain_goal_steps(id) on delete cascade,
  source_component_key text not null,
  predicted_edits jsonb not null default '[]'::jsonb,
  predicted_tests jsonb not null default '[]'::jsonb,
  predicted_risk integer not null default 0 check (predicted_risk between 0 and 100),
  production_affected boolean not null default false,
  high_risk_affected boolean not null default false,
  canonical_affected boolean not null default false,
  approval_required boolean not null default false,
  confidence integer not null default 0 check (confidence between 0 and 100),
  rationale jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_brain_change_predictions enable row level security;
revoke all on public.tgg_brain_change_predictions from anon,authenticated;

create or replace function public.tgg_brain_predict_change_set(
  p_source_component_key text,
  p_goal_id uuid default null,
  p_step_id uuid default null,
  p_depth integer default 2
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_source public.tgg_brain_components%rowtype;
  v_prediction_key text;
  v_edits jsonb:='[]'::jsonb; v_tests jsonb:='[]'::jsonb;
  v_prod boolean:=false; v_high boolean:=false; v_canonical boolean:=false;
  v_risk integer:=0; v_confidence integer:=90; v_approval boolean:=false; v_id uuid;
begin
  select * into v_source from public.tgg_brain_components
  where component_key=p_source_component_key and active=true;
  if not found then raise exception 'source_component_not_found'; end if;

  with recursive walk as (
    select c.id,c.component_key,c.component_type,c.name,c.environment,c.risk_level,c.canonical,
      0 depth,100::integer path_confidence
    from public.tgg_brain_components c where c.id=v_source.id

    union all

    select c.id,c.component_key,c.component_type,c.name,c.environment,c.risk_level,c.canonical,
      w.depth+1,least(w.path_confidence,l.strength)
    from walk w
    join public.tgg_brain_component_links l on l.to_component_id=w.id
    join public.tgg_brain_components c on c.id=l.from_component_id and c.active=true
    where w.depth<greatest(0,least(4,p_depth))
  ),
  distinct_walk as (
    select distinct on(id)
      id,component_key,component_type,name,environment,risk_level,canonical,depth,path_confidence
    from walk
    order by id,depth,path_confidence desc
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'component_key',component_key,'component_type',component_type,'name',name,'depth',depth,
      'confidence',path_confidence,'environment',environment,'risk_level',risk_level,'canonical',canonical
    ) order by depth,component_key),'[]'::jsonb),
    exists(select 1 from distinct_walk where environment='production'),
    exists(select 1 from distinct_walk where risk_level='high'),
    exists(select 1 from distinct_walk where canonical=true)
  into v_edits,v_prod,v_high,v_canonical
  from distinct_walk;

  with affected as (
    select * from jsonb_to_recordset(v_edits)
      as x(component_key text,component_type text,name text,depth integer,confidence integer,
           environment text,risk_level text,canonical boolean)
  ),
  tests as (
    select distinct test_type
    from affected a
    cross join lateral (
      values
        (case when a.component_type='database_table' then 'schema' end),
        (case when a.component_type='database_function' then 'integration' end),
        (case when a.component_type in ('page','ui_module') then 'browser' end),
        (case when a.component_type in ('page','ui_module') then 'visual' end),
        (case when a.component_type='game_system' then 'playtest' end),
        ('regression')
    ) t(test_type)
    where test_type is not null
  )
  select coalesce(jsonb_agg(test_type order by test_type),'[]'::jsonb) into v_tests from tests;

  v_risk:=least(100,
    (case when v_prod then 45 else 0 end)
    +(case when v_high then 35 else 0 end)
    +(case when v_canonical then 25 else 0 end)
    +(case v_source.risk_level when 'high' then 30 when 'medium' then 10 else 0 end)
  );

  v_approval:=v_prod or v_high or v_canonical or v_source.risk_level='high';

  select coalesce(min((x->>'confidence')::integer),90) into v_confidence
  from jsonb_array_elements(v_edits) x;

  v_prediction_key:='changepred:'||coalesce(p_step_id::text,p_goal_id::text,p_source_component_key)
    ||':'||md5(p_source_component_key||coalesce(p_step_id::text,'')||coalesce(p_goal_id::text,''));

  insert into public.tgg_brain_change_predictions(
    prediction_key,goal_id,step_id,source_component_key,predicted_edits,predicted_tests,
    predicted_risk,production_affected,high_risk_affected,canonical_affected,
    approval_required,confidence,rationale
  )
  values(v_prediction_key,p_goal_id,p_step_id,p_source_component_key,v_edits,v_tests,
    v_risk,v_prod,v_high,v_canonical,v_approval,v_confidence,
    jsonb_build_object('depth',greatest(0,least(4,p_depth)),'source_risk',v_source.risk_level,
      'source_environment',v_source.environment,'lineage_based',true))
  on conflict(prediction_key) do update set
    predicted_edits=excluded.predicted_edits,predicted_tests=excluded.predicted_tests,
    predicted_risk=excluded.predicted_risk,production_affected=excluded.production_affected,
    high_risk_affected=excluded.high_risk_affected,canonical_affected=excluded.canonical_affected,
    approval_required=excluded.approval_required,confidence=excluded.confidence,
    rationale=excluded.rationale,updated_at=now()
  returning id into v_id;

  return jsonb_build_object('ok',true,'prediction_id',v_id,'source_component_key',p_source_component_key,
    'predicted_edits',v_edits,'predicted_tests',v_tests,'predicted_risk',v_risk,
    'production_affected',v_prod,'high_risk_affected',v_high,'canonical_affected',v_canonical,
    'approval_required',v_approval,'confidence',v_confidence);
end $$;

create or replace function public.tgg_brain_prediction_latest(p_source_component_key text)
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'prediction_id',id,'source_component_key',source_component_key,'predicted_edits',predicted_edits,
    'predicted_tests',predicted_tests,'predicted_risk',predicted_risk,
    'production_affected',production_affected,'high_risk_affected',high_risk_affected,
    'canonical_affected',canonical_affected,'approval_required',approval_required,
    'confidence',confidence,'rationale',rationale,'updated_at',updated_at
  )
  from public.tgg_brain_change_predictions
  where source_component_key=p_source_component_key
  order by updated_at desc limit 1
$$;

revoke all on function public.tgg_brain_predict_change_set(text,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.tgg_brain_prediction_latest(text) from public,anon,authenticated;
grant execute on function public.tgg_brain_predict_change_set(text,uuid,uuid,integer) to postgres;
grant execute on function public.tgg_brain_prediction_latest(text) to postgres;


-- TGG Brain prediction calibration
create table if not exists public.tgg_brain_prediction_calibrations (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.tgg_brain_change_predictions(id) on delete cascade,
  trial_id uuid references public.tgg_brain_trials(id) on delete set null,
  predicted_component_count integer not null default 0,
  actual_component_count integer not null default 0,
  matched_component_count integer not null default 0,
  missed_component_count integer not null default 0,
  overpredicted_component_count integer not null default 0,
  predicted_test_count integer not null default 0,
  actual_test_count integer not null default 0,
  matched_test_count integer not null default 0,
  component_precision numeric not null default 0,
  component_recall numeric not null default 0,
  test_coverage_match numeric not null default 0,
  calibration_score numeric not null default 0,
  status text not null default 'complete'
    check (status in ('complete','warning','insufficient_evidence')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(prediction_id,trial_id)
);

alter table public.tgg_brain_prediction_calibrations enable row level security;
revoke all on public.tgg_brain_prediction_calibrations from anon,authenticated;

create or replace function public.tgg_brain_calibrate_prediction(
  p_prediction_id uuid,
  p_trial_id uuid default null,
  p_actual_component_keys jsonb default '[]'::jsonb,
  p_actual_test_types jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_pred public.tgg_brain_change_predictions%rowtype;
  v_pred_components text[]; v_actual_components text[];
  v_pred_tests text[]; v_actual_tests text[];
  v_pred_count integer:=0; v_actual_count integer:=0; v_match integer:=0;
  v_missed integer:=0; v_over integer:=0; v_pred_test_count integer:=0;
  v_actual_test_count integer:=0; v_test_match integer:=0;
  v_precision numeric:=100; v_recall numeric:=100; v_test_match_score numeric:=100;
  v_score numeric:=100; v_status text:='complete'; v_id uuid;
begin
  select * into v_pred from public.tgg_brain_change_predictions where id=p_prediction_id;
  if not found then raise exception 'prediction_not_found'; end if;

  select coalesce(array_agg(distinct x->>'component_key'),array[]::text[])
  into v_pred_components
  from jsonb_array_elements(v_pred.predicted_edits) x
  where x ? 'component_key';

  select coalesce(array_agg(distinct value),array[]::text[])
  into v_actual_components
  from jsonb_array_elements_text(coalesce(p_actual_component_keys,'[]'::jsonb));

  select coalesce(array_agg(distinct value),array[]::text[])
  into v_pred_tests
  from jsonb_array_elements_text(v_pred.predicted_tests);

  select coalesce(array_agg(distinct value),array[]::text[])
  into v_actual_tests
  from jsonb_array_elements_text(coalesce(p_actual_test_types,'[]'::jsonb));

  v_pred_count:=cardinality(v_pred_components);
  v_actual_count:=cardinality(v_actual_components);
  v_pred_test_count:=cardinality(v_pred_tests);
  v_actual_test_count:=cardinality(v_actual_tests);

  select count(*) into v_match from unnest(v_pred_components) p where p=any(v_actual_components);
  v_missed:=greatest(v_actual_count-v_match,0);
  v_over:=greatest(v_pred_count-v_match,0);

  select count(*) into v_test_match from unnest(v_pred_tests) p where p=any(v_actual_tests);

  if v_pred_count>0 then v_precision:=round((v_match::numeric/v_pred_count)*100,2); end if;
  if v_actual_count>0 then v_recall:=round((v_match::numeric/v_actual_count)*100,2); end if;
  if v_pred_test_count>0 then v_test_match_score:=round((v_test_match::numeric/v_pred_test_count)*100,2); end if;

  if v_actual_count=0 and v_actual_test_count=0 then
    v_status:='insufficient_evidence'; v_score:=0;
  else
    v_score:=round(v_precision*0.35+v_recall*0.40+v_test_match_score*0.25,2);
    if v_score<80 then v_status:='warning'; end if;
  end if;

  insert into public.tgg_brain_prediction_calibrations(
    prediction_id,trial_id,predicted_component_count,actual_component_count,matched_component_count,
    missed_component_count,overpredicted_component_count,predicted_test_count,actual_test_count,
    matched_test_count,component_precision,component_recall,test_coverage_match,
    calibration_score,status,summary
  )
  values(
    p_prediction_id,p_trial_id,v_pred_count,v_actual_count,v_match,v_missed,v_over,
    v_pred_test_count,v_actual_test_count,v_test_match,v_precision,v_recall,v_test_match_score,
    v_score,v_status,
    jsonb_build_object(
      'source_component_key',v_pred.source_component_key,
      'predicted_risk',v_pred.predicted_risk,
      'approval_required',v_pred.approval_required,
      'actual_component_keys',coalesce(p_actual_component_keys,'[]'::jsonb),
      'actual_test_types',coalesce(p_actual_test_types,'[]'::jsonb)
    )
  )
  on conflict(prediction_id,trial_id) do update
  set predicted_component_count=excluded.predicted_component_count,
      actual_component_count=excluded.actual_component_count,
      matched_component_count=excluded.matched_component_count,
      missed_component_count=excluded.missed_component_count,
      overpredicted_component_count=excluded.overpredicted_component_count,
      predicted_test_count=excluded.predicted_test_count,
      actual_test_count=excluded.actual_test_count,
      matched_test_count=excluded.matched_test_count,
      component_precision=excluded.component_precision,
      component_recall=excluded.component_recall,
      test_coverage_match=excluded.test_coverage_match,
      calibration_score=excluded.calibration_score,
      status=excluded.status,
      summary=excluded.summary,
      created_at=now()
  returning id into v_id;

  return jsonb_build_object(
    'ok',true,'calibration_id',v_id,'status',v_status,
    'component_precision',v_precision,'component_recall',v_recall,
    'test_coverage_match',v_test_match_score,'calibration_score',v_score,
    'missed_components',v_missed,'overpredicted_components',v_over
  );
end $$;

create or replace function public.tgg_brain_prediction_accuracy()
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'calibrations',count(*),
    'usable_calibrations',count(*) filter(where status<>'insufficient_evidence'),
    'average_component_precision',coalesce(round(avg(component_precision) filter(where status<>'insufficient_evidence'),2),0),
    'average_component_recall',coalesce(round(avg(component_recall) filter(where status<>'insufficient_evidence'),2),0),
    'average_test_coverage_match',coalesce(round(avg(test_coverage_match) filter(where status<>'insufficient_evidence'),2),0),
    'average_calibration_score',coalesce(round(avg(calibration_score) filter(where status<>'insufficient_evidence'),2),0),
    'warning_count',count(*) filter(where status='warning')
  )
  from public.tgg_brain_prediction_calibrations
$$;

revoke all on function public.tgg_brain_calibrate_prediction(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_brain_prediction_accuracy() from public,anon,authenticated;
grant execute on function public.tgg_brain_calibrate_prediction(uuid,uuid,jsonb,jsonb) to postgres;
grant execute on function public.tgg_brain_prediction_accuracy() to postgres;


-- TGG Brain execution evidence chain
create table if not exists public.tgg_brain_execution_traces (
  id uuid primary key default gen_random_uuid(),
  trace_key text not null unique,
  goal_id uuid references public.tgg_brain_goals(id) on delete set null,
  step_id uuid references public.tgg_brain_goal_steps(id) on delete set null,
  prediction_id uuid references public.tgg_brain_change_predictions(id) on delete set null,
  build_task_id uuid references public.tgg_build_tasks(id) on delete set null,
  trial_id uuid references public.tgg_brain_trials(id) on delete set null,
  calibration_id uuid references public.tgg_brain_prediction_calibrations(id) on delete set null,
  source_control jsonb not null default '{}'::jsonb,
  actual_components jsonb not null default '[]'::jsonb,
  actual_tests jsonb not null default '[]'::jsonb,
  acceptance_evidence jsonb not null default '[]'::jsonb,
  plan_match boolean not null default false,
  prediction_match boolean not null default false,
  trial_passed boolean not null default false,
  acceptance_passed boolean not null default false,
  production_touched boolean not null default false,
  high_risk_executed boolean not null default false,
  canonical_boundary_preserved boolean not null default true,
  trace_status text not null default 'incomplete'
    check (trace_status in ('incomplete','verified','warning','blocked')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_brain_execution_traces enable row level security;
revoke all on public.tgg_brain_execution_traces from anon,authenticated;

create or replace function public.tgg_brain_execution_trace_state()
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'total',count(*),
    'verified',count(*) filter(where trace_status='verified'),
    'warnings',count(*) filter(where trace_status='warning'),
    'blocked',count(*) filter(where trace_status='blocked'),
    'incomplete',count(*) filter(where trace_status='incomplete'),
    'production_touched',count(*) filter(where production_touched=true),
    'high_risk_executed',count(*) filter(where high_risk_executed=true),
    'boundary_violations',count(*) filter(where canonical_boundary_preserved=false)
  )
  from public.tgg_brain_execution_traces
$$;

revoke all on function public.tgg_brain_execution_trace_state() from public,anon,authenticated;
grant execute on function public.tgg_brain_execution_trace_state() to postgres;


create or replace function public.tgg_brain_execution_trace_record(
  p_trace_key text,
  p_goal_id uuid default null,
  p_step_id uuid default null,
  p_prediction_id uuid default null,
  p_build_task_id uuid default null,
  p_trial_id uuid default null,
  p_calibration_id uuid default null,
  p_source_control jsonb default '{}'::jsonb,
  p_actual_components jsonb default '[]'::jsonb,
  p_actual_tests jsonb default '[]'::jsonb,
  p_acceptance_evidence jsonb default '[]'::jsonb,
  p_production_touched boolean default false,
  p_high_risk_executed boolean default false
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_step public.tgg_brain_goal_steps%rowtype;
  v_pred public.tgg_brain_change_predictions%rowtype;
  v_trial public.tgg_brain_trials%rowtype;
  v_plan_match boolean:=false; v_prediction_match boolean:=false;
  v_trial_passed boolean:=false; v_acceptance_passed boolean:=false;
  v_boundary boolean:=true; v_status text:='incomplete'; v_id uuid;
  v_pred_components text[]; v_actual_components text[];
  v_pred_tests text[]; v_actual_tests text[];
  v_acceptance_count integer:=0; v_acceptance_pass_count integer:=0;
begin
  if p_step_id is not null then
    select * into v_step from public.tgg_brain_goal_steps where id=p_step_id;
  end if;
  if p_prediction_id is not null then
    select * into v_pred from public.tgg_brain_change_predictions where id=p_prediction_id;
  end if;
  if p_trial_id is not null then
    select * into v_trial from public.tgg_brain_trials where id=p_trial_id;
  end if;

  v_plan_match:=p_step_id is not null and v_step.id is not null and (p_goal_id is null or v_step.goal_id=p_goal_id);

  if v_pred.id is not null then
    select coalesce(array_agg(distinct x->>'component_key'),array[]::text[])
    into v_pred_components
    from jsonb_array_elements(v_pred.predicted_edits) x where x ? 'component_key';

    select coalesce(array_agg(distinct value),array[]::text[])
    into v_actual_components
    from jsonb_array_elements_text(coalesce(p_actual_components,'[]'::jsonb));

    select coalesce(array_agg(distinct value),array[]::text[])
    into v_pred_tests
    from jsonb_array_elements_text(v_pred.predicted_tests);

    select coalesce(array_agg(distinct value),array[]::text[])
    into v_actual_tests
    from jsonb_array_elements_text(coalesce(p_actual_tests,'[]'::jsonb));

    v_prediction_match:=
      (cardinality(v_pred_components)=0 or v_pred_components <@ v_actual_components)
      and (cardinality(v_pred_tests)=0 or v_pred_tests <@ v_actual_tests);
  end if;

  v_trial_passed:=v_trial.id is not null and v_trial.status='passed'
    and v_trial.verdict in ('safe_for_staging','advance_with_expanded_qa')
    and v_trial.production_touched=false;

  select count(*),count(*) filter(where coalesce((x->>'passed')::boolean,false)=true)
  into v_acceptance_count,v_acceptance_pass_count
  from jsonb_array_elements(coalesce(p_acceptance_evidence,'[]'::jsonb)) x;

  if v_step.id is not null and jsonb_array_length(coalesce(v_step.acceptance,'[]'::jsonb))=0 then
    v_acceptance_passed:=true;
  elsif v_acceptance_count>0 and v_acceptance_count=v_acceptance_pass_count then
    v_acceptance_passed:=true;
  end if;

  v_boundary:=coalesce(p_production_touched,false)=false
    and coalesce(p_high_risk_executed,false)=false
    and coalesce(v_pred.canonical_affected,false)=false;

  if coalesce(p_production_touched,false) or coalesce(p_high_risk_executed,false) then
    v_status:='blocked';
  elsif v_plan_match and v_prediction_match and v_trial_passed and v_acceptance_passed and v_boundary then
    v_status:='verified';
  elsif v_trial.id is not null and v_trial.status in ('failed','blocked') then
    v_status:='blocked';
  elsif v_plan_match or v_trial.id is not null or v_pred.id is not null then
    v_status:='warning';
  else
    v_status:='incomplete';
  end if;

  insert into public.tgg_brain_execution_traces(
    trace_key,goal_id,step_id,prediction_id,build_task_id,trial_id,calibration_id,
    source_control,actual_components,actual_tests,acceptance_evidence,
    plan_match,prediction_match,trial_passed,acceptance_passed,
    production_touched,high_risk_executed,canonical_boundary_preserved,
    trace_status,summary,updated_at
  )
  values(
    trim(p_trace_key),p_goal_id,p_step_id,p_prediction_id,p_build_task_id,p_trial_id,p_calibration_id,
    coalesce(p_source_control,'{}'::jsonb),coalesce(p_actual_components,'[]'::jsonb),
    coalesce(p_actual_tests,'[]'::jsonb),coalesce(p_acceptance_evidence,'[]'::jsonb),
    v_plan_match,v_prediction_match,v_trial_passed,v_acceptance_passed,
    coalesce(p_production_touched,false),coalesce(p_high_risk_executed,false),v_boundary,
    v_status,
    jsonb_build_object('brain_version','TGG-BRAIN-1.0','canonical_boundary','AB-006',
      'canonical_source_version','V223',
      'predicted_component_count',coalesce(cardinality(v_pred_components),0),
      'actual_component_count',coalesce(cardinality(v_actual_components),0),
      'predicted_test_count',coalesce(cardinality(v_pred_tests),0),
      'actual_test_count',coalesce(cardinality(v_actual_tests),0)),
    now()
  )
  on conflict(trace_key) do update
  set goal_id=excluded.goal_id,step_id=excluded.step_id,prediction_id=excluded.prediction_id,
      build_task_id=excluded.build_task_id,trial_id=excluded.trial_id,calibration_id=excluded.calibration_id,
      source_control=excluded.source_control,actual_components=excluded.actual_components,
      actual_tests=excluded.actual_tests,acceptance_evidence=excluded.acceptance_evidence,
      plan_match=excluded.plan_match,prediction_match=excluded.prediction_match,
      trial_passed=excluded.trial_passed,acceptance_passed=excluded.acceptance_passed,
      production_touched=excluded.production_touched,high_risk_executed=excluded.high_risk_executed,
      canonical_boundary_preserved=excluded.canonical_boundary_preserved,
      trace_status=excluded.trace_status,summary=excluded.summary,updated_at=now()
  returning id into v_id;

  return jsonb_build_object(
    'ok',true,'trace_id',v_id,'trace_key',p_trace_key,'trace_status',v_status,
    'plan_match',v_plan_match,'prediction_match',v_prediction_match,'trial_passed',v_trial_passed,
    'acceptance_passed',v_acceptance_passed,'canonical_boundary_preserved',v_boundary,
    'production_touched',coalesce(p_production_touched,false),
    'high_risk_executed',coalesce(p_high_risk_executed,false)
  );
end $$;

revoke all on function public.tgg_brain_execution_trace_record(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean,boolean) from public,anon,authenticated;
grant execute on function public.tgg_brain_execution_trace_record(text,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean,boolean) to postgres;


-- TGG Brain uncertainty gate
create table if not exists public.tgg_brain_uncertainty_checks (
  id uuid primary key default gen_random_uuid(),
  check_key text not null unique,
  source_component_key text not null,
  prediction_id uuid references public.tgg_brain_change_predictions(id) on delete set null,
  step_id uuid references public.tgg_brain_goal_steps(id) on delete set null,
  architecture_score integer not null default 0 check (architecture_score between 0 and 100),
  lineage_score integer not null default 0 check (lineage_score between 0 and 100),
  prediction_score integer not null default 0 check (prediction_score between 0 and 100),
  calibration_score integer not null default 0 check (calibration_score between 0 and 100),
  simulation_score integer not null default 0 check (simulation_score between 0 and 100),
  evidence_quality integer not null default 0 check (evidence_quality between 0 and 100),
  action text not null check (action in ('proceed','expanded_qa','narrow_scope','research_required','approval_required')),
  blockers jsonb not null default '[]'::jsonb,
  rationale jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_brain_uncertainty_checks enable row level security;
revoke all on public.tgg_brain_uncertainty_checks from anon,authenticated;

create or replace function public.tgg_brain_uncertainty_gate(
  p_source_component_key text,p_prediction_id uuid default null,p_step_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_arch jsonb; v_pred public.tgg_brain_change_predictions%rowtype;
  v_sim public.tgg_brain_simulations%rowtype; v_component public.tgg_brain_components%rowtype;
  v_lineage_count integer:=0; v_arch_score integer:=100; v_lineage_score integer:=0;
  v_pred_score integer:=50; v_cal_score integer:=50; v_sim_score integer:=50;
  v_quality integer:=0; v_action text:='proceed'; v_blockers jsonb:='[]'::jsonb;
  v_accuracy jsonb; v_usable integer:=0; v_key text; v_id uuid;
begin
  select * into v_component from public.tgg_brain_components
  where component_key=p_source_component_key and active=true;
  if not found then raise exception 'source_component_not_found'; end if;

  v_arch:=public.tgg_brain_architecture_latest();
  if v_arch is null then
    v_arch_score:=20; v_blockers:=v_blockers||jsonb_build_array('architecture_state_missing');
  elsif coalesce(v_arch->>'drift_status','warning')='warning'
     or coalesce((v_arch->>'stale_components')::integer,0)>0
     or coalesce((v_arch->>'missing_since_previous')::integer,0)>0 then
    v_arch_score:=40; v_blockers:=v_blockers||jsonb_build_array('architecture_not_clean');
  elsif coalesce(v_arch->>'drift_status','clean')='changed' then v_arch_score:=85;
  else v_arch_score:=100; end if;

  select count(*) into v_lineage_count
  from public.tgg_brain_lineage_evidence e
  join public.tgg_brain_components c1 on c1.id=e.from_component_id
  join public.tgg_brain_components c2 on c2.id=e.to_component_id
  where e.active=true
    and (c1.component_key=p_source_component_key or c2.component_key=p_source_component_key);

  v_lineage_score:=least(100,20+v_lineage_count*10);

  if p_prediction_id is not null then
    select * into v_pred from public.tgg_brain_change_predictions where id=p_prediction_id;
    if found then
      v_pred_score:=v_pred.confidence;
      if v_pred.approval_required then v_blockers:=v_blockers||jsonb_build_array('prediction_requires_approval'); end if;
      if v_pred.production_affected then v_blockers:=v_blockers||jsonb_build_array('production_affected'); end if;
      if v_pred.high_risk_affected then v_blockers:=v_blockers||jsonb_build_array('high_risk_affected'); end if;
      if v_pred.canonical_affected then v_blockers:=v_blockers||jsonb_build_array('canonical_affected'); end if;
    else
      v_pred_score:=20; v_blockers:=v_blockers||jsonb_build_array('prediction_missing');
    end if;
  else v_pred_score:=35; end if;

  v_accuracy:=public.tgg_brain_prediction_accuracy();
  v_usable:=coalesce((v_accuracy->>'usable_calibrations')::integer,0);
  if v_usable=0 then v_cal_score:=50;
  else v_cal_score:=least(100,greatest(0,round((v_accuracy->>'average_calibration_score')::numeric)::integer)); end if;

  if p_step_id is not null then
    select * into v_sim from public.tgg_brain_simulations
    where step_id=p_step_id order by updated_at desc limit 1;
    if found then
      v_sim_score:=v_sim.confidence;
      if v_sim.status='blocked' then v_blockers:=v_blockers||jsonb_build_array('simulation_blocked'); end if;
    else
      v_sim_score:=30; v_blockers:=v_blockers||jsonb_build_array('simulation_missing');
    end if;
  end if;

  v_quality:=round(v_arch_score*0.25+v_lineage_score*0.20+v_pred_score*0.25+v_cal_score*0.15+v_sim_score*0.15)::integer;

  if v_component.risk_level='high' or v_component.canonical or coalesce(v_pred.approval_required,false) then
    v_action:='approval_required';
  elsif v_arch_score<60 or v_quality<55 then v_action:='research_required';
  elsif v_quality<70 then v_action:='narrow_scope';
  elsif v_quality<85 then v_action:='expanded_qa';
  else v_action:='proceed'; end if;

  v_key:='uncertainty:'||p_source_component_key||':'||coalesce(p_prediction_id::text,'none')||':'||coalesce(p_step_id::text,'none');

  insert into public.tgg_brain_uncertainty_checks(
    check_key,source_component_key,prediction_id,step_id,
    architecture_score,lineage_score,prediction_score,calibration_score,simulation_score,
    evidence_quality,action,blockers,rationale
  )
  values(v_key,p_source_component_key,p_prediction_id,p_step_id,
    v_arch_score,v_lineage_score,v_pred_score,v_cal_score,v_sim_score,
    v_quality,v_action,v_blockers,
    jsonb_build_object('lineage_evidence_count',v_lineage_count,
      'usable_prediction_calibrations',v_usable,'component_risk_level',v_component.risk_level,
      'component_canonical',v_component.canonical,'production_auto_publish',false,'high_risk_auto_execute',false))
  on conflict(check_key) do update
  set architecture_score=excluded.architecture_score,lineage_score=excluded.lineage_score,
      prediction_score=excluded.prediction_score,calibration_score=excluded.calibration_score,
      simulation_score=excluded.simulation_score,evidence_quality=excluded.evidence_quality,
      action=excluded.action,blockers=excluded.blockers,rationale=excluded.rationale,updated_at=now()
  returning id into v_id;

  return jsonb_build_object('ok',true,'check_id',v_id,'source_component_key',p_source_component_key,
    'evidence_quality',v_quality,'action',v_action,
    'scores',jsonb_build_object('architecture',v_arch_score,'lineage',v_lineage_score,
      'prediction',v_pred_score,'calibration',v_cal_score,'simulation',v_sim_score),
    'blockers',v_blockers);
end $$;

revoke all on function public.tgg_brain_uncertainty_gate(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.tgg_brain_uncertainty_gate(text,uuid,uuid) to postgres;


-- TGG Brain structured guardrails + conflict detection
create table if not exists public.tgg_brain_guardrails (
  id uuid primary key default gen_random_uuid(),
  guardrail_key text not null unique,
  category text not null
    check (category in ('production','risk','canonical','destructive','payments','rights','secrets')),
  rule jsonb not null,
  severity text not null default 'high' check (severity in ('medium','high','critical')),
  action text not null default 'approval_required'
    check (action in ('block','approval_required','restricted_mode')),
  active boolean not null default true,
  immutable boolean not null default true,
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_brain_conflicts (
  id uuid primary key default gen_random_uuid(),
  conflict_key text not null unique,
  guardrail_id uuid not null references public.tgg_brain_guardrails(id) on delete restrict,
  subject_type text not null
    check (subject_type in ('idea','goal','step','prediction','action','decision','system')),
  subject_key text not null,
  proposed_action jsonb not null default '{}'::jsonb,
  severity text not null check (severity in ('medium','high','critical')),
  required_action text not null
    check (required_action in ('block','approval_required','restricted_mode')),
  status text not null default 'open'
    check (status in ('open','resolved','accepted_exception','superseded')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.tgg_brain_guardrails enable row level security;
alter table public.tgg_brain_conflicts enable row level security;
revoke all on public.tgg_brain_guardrails from anon,authenticated;
revoke all on public.tgg_brain_conflicts from anon,authenticated;

insert into public.tgg_brain_guardrails(guardrail_key,category,rule,severity,action,immutable,source_ref)
values
('guardrail:no-auto-production-publish','production',jsonb_build_object('field','production_auto_publish','forbidden_value',true),'critical','block',true,'TGG-BRAIN-1.0 safety contract'),
('guardrail:no-auto-production-promotion','production',jsonb_build_object('field','production_promotion','forbidden_value',true),'critical','approval_required',true,'AB-006 V223 boundary'),
('guardrail:no-high-risk-auto-execute','risk',jsonb_build_object('field','high_risk_auto_execute','forbidden_value',true),'critical','block',true,'TGG-BRAIN-1.0 safety contract'),
('guardrail:preserve-ab006-v223','canonical',jsonb_build_object('field','canonical_boundary_change','forbidden_value',true),'critical','block',true,'AB-006 V223 canonical handoff'),
('guardrail:no-destructive-auto','destructive',jsonb_build_object('field','destructive','forbidden_value',true),'critical','approval_required',true,'TGG safe autonomy policy'),
('guardrail:payments-approval','payments',jsonb_build_object('field','real_money_or_payment_action','forbidden_value',true),'high','approval_required',true,'TGG safe autonomy policy'),
('guardrail:rights-legal-approval','rights',jsonb_build_object('field','rights_legal_action','forbidden_value',true),'high','approval_required',true,'TGG safe autonomy policy'),
('guardrail:secret-credential-approval','secrets',jsonb_build_object('field','secret_credential_action','forbidden_value',true),'critical','approval_required',true,'TGG safe autonomy policy')
on conflict(guardrail_key) do update
set rule=excluded.rule,severity=excluded.severity,action=excluded.action,
    active=true,immutable=true,source_ref=excluded.source_ref,updated_at=now();

create or replace function public.tgg_brain_guardrail_check(
  p_subject_type text,p_subject_key text,p_action jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  r record; v_field text; v_forbidden jsonb; v_actual jsonb;
  v_conflicts jsonb:='[]'::jsonb; v_count integer:=0; v_key text;
begin
  if p_subject_type not in ('idea','goal','step','prediction','action','decision','system') then
    raise exception 'invalid_subject_type';
  end if;

  for r in
    select * from public.tgg_brain_guardrails where active=true
    order by case severity when 'critical' then 1 when 'high' then 2 else 3 end,guardrail_key
  loop
    v_field:=r.rule->>'field';
    v_forbidden:=r.rule->'forbidden_value';
    v_actual:=coalesce(p_action,'{}'::jsonb)->v_field;

    if v_actual is not null and v_actual=v_forbidden then
      v_key:='conflict:'||md5(p_subject_type||':'||p_subject_key||':'||r.guardrail_key||':'||coalesce(p_action,'{}'::jsonb)::text);

      insert into public.tgg_brain_conflicts(
        conflict_key,guardrail_id,subject_type,subject_key,proposed_action,severity,required_action,status,evidence
      )
      values(
        v_key,r.id,p_subject_type,p_subject_key,coalesce(p_action,'{}'::jsonb),r.severity,r.action,'open',
        jsonb_build_object('guardrail_key',r.guardrail_key,'field',v_field,'forbidden_value',v_forbidden,
          'actual_value',v_actual,'source_ref',r.source_ref)
      )
      on conflict(conflict_key) do update set status='open',evidence=excluded.evidence;

      v_conflicts:=v_conflicts||jsonb_build_array(jsonb_build_object(
        'guardrail_key',r.guardrail_key,'category',r.category,'severity',r.severity,
        'required_action',r.action,'field',v_field));
      v_count:=v_count+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',v_count=0,'subject_type',p_subject_type,'subject_key',p_subject_key,
    'conflict_count',v_count,'conflicts',v_conflicts,'allow_autonomous_execution',v_count=0
  );
end $$;

create or replace function public.tgg_brain_conflict_state()
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'active_guardrails',(select count(*) from public.tgg_brain_guardrails where active=true),
    'open_conflicts',count(*) filter(where c.status='open'),
    'critical_open',count(*) filter(where c.status='open' and c.severity='critical'),
    'high_open',count(*) filter(where c.status='open' and c.severity='high'),
    'approval_required_open',count(*) filter(where c.status='open' and c.required_action='approval_required'),
    'blocked_open',count(*) filter(where c.status='open' and c.required_action='block')
  )
  from public.tgg_brain_conflicts c
$$;

revoke all on function public.tgg_brain_guardrail_check(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_brain_conflict_state() from public,anon,authenticated;
grant execute on function public.tgg_brain_guardrail_check(text,text,jsonb) to postgres;
grant execute on function public.tgg_brain_conflict_state() to postgres;


-- TGG Brain non-destructive memory compaction
create table if not exists public.tgg_brain_memory_archive (
  id uuid primary key default gen_random_uuid(),
  original_memory_id uuid not null,
  memory_key text not null,
  memory_type text not null,
  title text not null,
  content jsonb not null,
  importance integer not null,
  source_ref text,
  archive_reason text not null check (archive_reason in ('exact_duplicate','manual_retire','superseded')),
  retained_memory_id uuid,
  archived_at timestamptz not null default now(),
  unique(original_memory_id,archive_reason)
);

alter table public.tgg_brain_memory_archive enable row level security;
revoke all on public.tgg_brain_memory_archive from anon,authenticated;

create or replace function public.tgg_brain_memory_compact()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_archived integer:=0; v_before integer:=0; v_after integer:=0;
begin
  select count(*) into v_before from public.tgg_brain_memory where active=true;

  with ranked as (
    select m.*,
      row_number() over(
        partition by m.memory_type,md5(m.content::text)
        order by m.importance desc,m.updated_at desc,m.id
      ) rn,
      first_value(m.id) over(
        partition by m.memory_type,md5(m.content::text)
        order by m.importance desc,m.updated_at desc,m.id
      ) keep_id
    from public.tgg_brain_memory m
    where m.active=true and m.memory_type in ('lesson','qa')
  ), losers as (
    select * from ranked where rn>1
  ), archived as (
    insert into public.tgg_brain_memory_archive(
      original_memory_id,memory_key,memory_type,title,content,importance,source_ref,
      archive_reason,retained_memory_id
    )
    select id,memory_key,memory_type,title,content,importance,source_ref,'exact_duplicate',keep_id
    from losers
    on conflict(original_memory_id,archive_reason) do nothing
    returning original_memory_id
  ), deactivated as (
    update public.tgg_brain_memory m
    set active=false,updated_at=now()
    where m.id in (select original_memory_id from archived)
    returning 1
  )
  select count(*) into v_archived from deactivated;

  select count(*) into v_after from public.tgg_brain_memory where active=true;

  return jsonb_build_object(
    'ok',true,'active_before',v_before,'archived_exact_duplicates',v_archived,'active_after',v_after,
    'protected_types',jsonb_build_array('system','decision','constraint','architecture','dependency','idea'),
    'destructive_delete_performed',false
  );
end $$;

create or replace function public.tgg_brain_memory_hygiene_state()
returns jsonb
language sql security definer set search_path=''
as $$
  with dupes as (
    select count(*) groups,coalesce(sum(n-1),0) candidates
    from (
      select memory_type,md5(content::text),count(*) n
      from public.tgg_brain_memory
      where active=true and memory_type in ('lesson','qa')
      group by memory_type,md5(content::text)
      having count(*)>1
    ) q
  )
  select jsonb_build_object(
    'active_memories',(select count(*) from public.tgg_brain_memory where active=true),
    'archived_memories',(select count(*) from public.tgg_brain_memory_archive),
    'exact_duplicate_groups',dupes.groups,
    'exact_duplicate_candidates',dupes.candidates,
    'protected_active_memories',(
      select count(*) from public.tgg_brain_memory
      where active=true and memory_type in ('system','decision','constraint','architecture','dependency','idea')
    )
  )
  from dupes
$$;

revoke all on function public.tgg_brain_memory_compact() from public,anon,authenticated;
revoke all on function public.tgg_brain_memory_hygiene_state() from public,anon,authenticated;
grant execute on function public.tgg_brain_memory_compact() to postgres;
grant execute on function public.tgg_brain_memory_hygiene_state() to postgres;


-- TGG Brain targeted recall + focused context packs
create or replace function public.tgg_brain_recall(
  p_query text,p_limit integer default 12
) returns jsonb
language sql security definer set search_path=''
as $$
  with tokens as (
    select distinct tok
    from regexp_split_to_table(lower(trim(coalesce(p_query,''))), E'[^a-z0-9_:-]+') tok
    where length(tok)>=3
  ), scored as (
    select m.*,
      (m.importance::numeric*0.45
       + case m.memory_type
           when 'constraint' then 30 when 'system' then 25 when 'architecture' then 22
           when 'decision' then 20 when 'dependency' then 15 when 'qa' then 10
           when 'lesson' then 8 else 5 end
       + case when lower(m.title) like '%'||lower(trim(p_query))||'%' and trim(p_query)<>'' then 35 else 0 end
       + case when lower(m.content::text) like '%'||lower(trim(p_query))||'%' and trim(p_query)<>'' then 20 else 0 end
       + (select coalesce(count(*),0)*6 from tokens t
          where lower(m.title) like '%'||t.tok||'%'
             or lower(m.content::text) like '%'||t.tok||'%'
             or lower(coalesce(m.source_ref,'')) like '%'||t.tok||'%')
      ) relevance_score
    from public.tgg_brain_memory m
    where m.active=true
  ), ranked as (
    select * from scored
    where relevance_score>0
    order by relevance_score desc,importance desc,updated_at desc
    limit greatest(1,least(30,p_limit))
  )
  select jsonb_build_object(
    'query',p_query,
    'active_memory_count',(select count(*) from public.tgg_brain_memory where active=true),
    'returned_count',(select count(*) from ranked),
    'memories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'memory_key',memory_key,'memory_type',memory_type,'title',title,'importance',importance,
        'relevance_score',round(relevance_score,2),'content',content,'source_ref',source_ref
      ) order by relevance_score desc,importance desc)
      from ranked
    ),'[]'::jsonb)
  )
$$;

create or replace function public.tgg_brain_context_pack(
  p_query text,p_memory_limit integer default 10
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_memory jsonb; v_components jsonb; v_decisions jsonb; v_guardrails jsonb;
begin
  v_memory:=public.tgg_brain_recall(p_query,p_memory_limit);

  with tokens as (
    select distinct tok
    from regexp_split_to_table(lower(trim(coalesce(p_query,''))), E'[^a-z0-9_:-]+') tok
    where length(tok)>=3
  ), scored as (
    select c.*,
      (case when lower(c.name)=lower(trim(p_query)) then 60 else 0 end
       +case when lower(c.name) like '%'||lower(trim(p_query))||'%' and trim(p_query)<>'' then 40 else 0 end
       +case when c.canonical then 20 else 0 end
       +(select coalesce(count(*),0)*12 from tokens t
         where lower(c.name) like '%'||t.tok||'%'
            or lower(c.component_key) like '%'||t.tok||'%'
            or lower(coalesce(c.owner_domain,'')) like '%'||t.tok||'%'
            or lower(c.capabilities::text) like '%'||t.tok||'%')
      ) relevance_score
    from public.tgg_brain_components c where c.active=true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'component_key',component_key,'component_type',component_type,'name',name,
    'environment',environment,'risk_level',risk_level,'canonical',canonical,
    'owner_domain',owner_domain,'capabilities',capabilities,'source_ref',source_ref,
    'health_status',health_status,'relevance_score',relevance_score
  ) order by relevance_score desc,canonical desc,name),'[]'::jsonb)
  into v_components
  from (select * from scored where relevance_score>0
        order by relevance_score desc,canonical desc,name limit 10) q;

  with tokens as (
    select distinct tok
    from regexp_split_to_table(lower(trim(coalesce(p_query,''))), E'[^a-z0-9_:-]+') tok
    where length(tok)>=3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'decision_key',d.decision_key,'subject',d.subject,'decision',d.decision,
    'constraints',d.constraints,'reversible',d.reversible
  ) order by d.updated_at desc),'[]'::jsonb)
  into v_decisions
  from public.tgg_brain_decisions d
  where d.status='active'
    and (p_query='' or exists(
      select 1 from tokens t
      where lower(d.subject) like '%'||t.tok||'%'
         or lower(d.decision) like '%'||t.tok||'%'
         or lower(d.constraints::text) like '%'||t.tok||'%'
    ));

  select coalesce(jsonb_agg(jsonb_build_object(
    'guardrail_key',guardrail_key,'category',category,'severity',severity,'action',action,'rule',rule
  ) order by case severity when 'critical' then 1 when 'high' then 2 else 3 end,guardrail_key),'[]'::jsonb)
  into v_guardrails
  from public.tgg_brain_guardrails where active=true;

  return jsonb_build_object(
    'query',p_query,'memory',v_memory,'matching_components',v_components,
    'matching_decisions',v_decisions,'active_guardrails',v_guardrails,
    'canonical_boundary','AB-006','canonical_source_version','V223',
    'production_auto_publish',false,'high_risk_auto_execute',false
  );
end $$;

revoke all on function public.tgg_brain_recall(text,integer) from public,anon,authenticated;
revoke all on function public.tgg_brain_context_pack(text,integer) from public,anon,authenticated;
grant execute on function public.tgg_brain_recall(text,integer) to postgres;
grant execute on function public.tgg_brain_context_pack(text,integer) to postgres;


-- TGG Brain structured specification compiler
create table if not exists public.tgg_brain_specs (
  id uuid primary key default gen_random_uuid(),
  spec_key text not null unique,
  idea_id uuid references public.tgg_game_idea_inbox(id) on delete set null,
  goal_id uuid references public.tgg_brain_goals(id) on delete set null,
  title text not null,
  objective text not null,
  summary jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','ready','blocked','superseded','complete')),
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  development_only boolean not null default true,
  production_allowed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_brain_spec_requirements (
  id uuid primary key default gen_random_uuid(),
  spec_id uuid not null references public.tgg_brain_specs(id) on delete cascade,
  requirement_key text not null,
  requirement_type text not null check (requirement_type in ('functional','nonfunctional','security','performance','ux','data','integration','qa')),
  priority text not null default 'must' check (priority in ('must','should','could')),
  statement text not null,
  acceptance jsonb not null default '[]'::jsonb,
  owner_domain text,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  scope_status text not null default 'in_scope' check (scope_status in ('in_scope','out_of_scope','approval_required')),
  source_ref text,
  status text not null default 'planned' check (status in ('planned','implemented','verified','blocked','skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(spec_id,requirement_key)
);

create table if not exists public.tgg_brain_spec_scope (
  id uuid primary key default gen_random_uuid(),
  spec_id uuid not null references public.tgg_brain_specs(id) on delete cascade,
  scope_key text not null,
  scope_type text not null check (scope_type in ('in_scope','out_of_scope','constraint','assumption')),
  description text not null,
  immutable boolean not null default false,
  created_at timestamptz not null default now(),
  unique(spec_id,scope_key)
);

alter table public.tgg_brain_specs enable row level security;
alter table public.tgg_brain_spec_requirements enable row level security;
alter table public.tgg_brain_spec_scope enable row level security;
revoke all on public.tgg_brain_specs from anon,authenticated;
revoke all on public.tgg_brain_spec_requirements from anon,authenticated;
revoke all on public.tgg_brain_spec_scope from anon,authenticated;

create or replace function public.tgg_brain_spec_create(
  p_spec_key text,p_title text,p_objective text,p_idea_id uuid default null,p_goal_id uuid default null,
  p_risk_level text default 'medium',p_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if p_risk_level not in ('low','medium','high') then raise exception 'invalid_risk_level'; end if;
  insert into public.tgg_brain_specs(
    spec_key,idea_id,goal_id,title,objective,summary,status,risk_level,development_only,production_allowed
  ) values(
    trim(p_spec_key),p_idea_id,p_goal_id,trim(p_title),trim(p_objective),coalesce(p_summary,'{}'::jsonb),
    'draft',p_risk_level,true,false
  )
  on conflict(spec_key) do update set
    idea_id=coalesce(excluded.idea_id,public.tgg_brain_specs.idea_id),
    goal_id=coalesce(excluded.goal_id,public.tgg_brain_specs.goal_id),
    title=excluded.title,objective=excluded.objective,summary=excluded.summary,
    risk_level=excluded.risk_level,development_only=true,production_allowed=false,updated_at=now()
  returning id into v_id;
  return jsonb_build_object('ok',true,'spec_id',v_id,'spec_key',p_spec_key);
end $$;

create or replace function public.tgg_brain_spec_add_requirement(
  p_spec_id uuid,p_requirement_key text,p_requirement_type text,p_priority text,p_statement text,
  p_acceptance jsonb,p_owner_domain text default null,p_risk_level text default 'medium',
  p_scope_status text default 'in_scope',p_source_ref text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if p_requirement_type not in ('functional','nonfunctional','security','performance','ux','data','integration','qa') then
    raise exception 'invalid_requirement_type';
  end if;
  if p_priority not in ('must','should','could') then raise exception 'invalid_priority'; end if;
  if p_risk_level not in ('low','medium','high') then raise exception 'invalid_risk_level'; end if;
  if p_scope_status not in ('in_scope','out_of_scope','approval_required') then raise exception 'invalid_scope_status'; end if;

  insert into public.tgg_brain_spec_requirements(
    spec_id,requirement_key,requirement_type,priority,statement,acceptance,owner_domain,
    risk_level,scope_status,source_ref,status
  ) values(
    p_spec_id,trim(p_requirement_key),p_requirement_type,p_priority,trim(p_statement),
    coalesce(p_acceptance,'[]'::jsonb),p_owner_domain,p_risk_level,p_scope_status,p_source_ref,'planned'
  )
  on conflict(spec_id,requirement_key) do update set
    requirement_type=excluded.requirement_type,priority=excluded.priority,statement=excluded.statement,
    acceptance=excluded.acceptance,owner_domain=excluded.owner_domain,risk_level=excluded.risk_level,
    scope_status=excluded.scope_status,source_ref=excluded.source_ref,updated_at=now()
  returning id into v_id;
  return jsonb_build_object('ok',true,'requirement_id',v_id,'requirement_key',p_requirement_key);
end $$;

create or replace function public.tgg_brain_spec_add_scope(
  p_spec_id uuid,p_scope_key text,p_scope_type text,p_description text,p_immutable boolean default false
) returns jsonb
language plpgsql security definer set search_path=''
as $$
begin
  if p_scope_type not in ('in_scope','out_of_scope','constraint','assumption') then raise exception 'invalid_scope_type'; end if;
  insert into public.tgg_brain_spec_scope(spec_id,scope_key,scope_type,description,immutable)
  values(p_spec_id,trim(p_scope_key),p_scope_type,trim(p_description),coalesce(p_immutable,false))
  on conflict(spec_id,scope_key) do update set
    scope_type=excluded.scope_type,description=excluded.description,immutable=excluded.immutable;
  return jsonb_build_object('ok',true,'scope_key',p_scope_key);
end $$;

create or replace function public.tgg_brain_spec_validate(p_spec_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_spec public.tgg_brain_specs%rowtype;
  v_must integer:=0; v_missing_acceptance integer:=0; v_missing_owner integer:=0;
  v_high integer:=0; v_approval integer:=0; v_scope integer:=0;
  v_ready boolean:=false; v_status text:='draft';
begin
  select * into v_spec from public.tgg_brain_specs where id=p_spec_id;
  if not found then raise exception 'spec_not_found'; end if;

  select
    count(*) filter(where priority='must' and scope_status='in_scope'),
    count(*) filter(where priority='must' and scope_status='in_scope' and jsonb_array_length(coalesce(acceptance,'[]'::jsonb))=0),
    count(*) filter(where priority='must' and scope_status='in_scope' and nullif(trim(coalesce(owner_domain,'')),'') is null),
    count(*) filter(where risk_level='high' and scope_status='in_scope'),
    count(*) filter(where scope_status='approval_required')
  into v_must,v_missing_acceptance,v_missing_owner,v_high,v_approval
  from public.tgg_brain_spec_requirements where spec_id=p_spec_id;

  select count(*) into v_scope from public.tgg_brain_spec_scope where spec_id=p_spec_id;

  v_ready:=v_must>0 and v_missing_acceptance=0 and v_missing_owner=0 and v_high=0 and v_approval=0
    and v_scope>0 and v_spec.development_only=true and v_spec.production_allowed=false;

  if v_high>0 or v_approval>0 then v_status:='blocked';
  elsif v_ready then v_status:='ready';
  else v_status:='draft'; end if;

  update public.tgg_brain_specs set status=v_status,updated_at=now(),
    summary=coalesce(summary,'{}'::jsonb)||jsonb_build_object('validation',jsonb_build_object(
      'must_requirements',v_must,'missing_acceptance',v_missing_acceptance,'missing_owner_domain',v_missing_owner,
      'high_risk_in_scope',v_high,'approval_required',v_approval,'scope_items',v_scope,'ready',v_ready,'validated_at',now()
    ))
  where id=p_spec_id;

  return jsonb_build_object('ok',true,'spec_id',p_spec_id,'status',v_status,'ready',v_ready,
    'must_requirements',v_must,'missing_acceptance',v_missing_acceptance,'missing_owner_domain',v_missing_owner,
    'high_risk_in_scope',v_high,'approval_required',v_approval,'scope_items',v_scope);
end $$;

create or replace function public.tgg_brain_spec_state()
returns jsonb
language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'total',count(*),'draft',count(*) filter(where status='draft'),'ready',count(*) filter(where status='ready'),
    'blocked',count(*) filter(where status='blocked'),'complete',count(*) filter(where status='complete'),
    'production_allowed',count(*) filter(where production_allowed=true),
    'high_risk_specs',count(*) filter(where risk_level='high')
  )
  from public.tgg_brain_specs
$$;

revoke all on function public.tgg_brain_spec_create(text,text,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_brain_spec_add_requirement(uuid,text,text,text,text,jsonb,text,text,text,text) from public,anon,authenticated;
revoke all on function public.tgg_brain_spec_add_scope(uuid,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.tgg_brain_spec_validate(uuid) from public,anon,authenticated;
revoke all on function public.tgg_brain_spec_state() from public,anon,authenticated;
grant execute on function public.tgg_brain_spec_create(text,text,text,uuid,uuid,text,jsonb) to postgres;
grant execute on function public.tgg_brain_spec_add_requirement(uuid,text,text,text,text,jsonb,text,text,text,text) to postgres;
grant execute on function public.tgg_brain_spec_add_scope(uuid,text,text,text,boolean) to postgres;
grant execute on function public.tgg_brain_spec_validate(uuid) to postgres;
grant execute on function public.tgg_brain_spec_state() to postgres;


-- TGG Brain requirements traceability matrix
create table if not exists public.tgg_brain_requirement_links (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.tgg_brain_spec_requirements(id) on delete cascade,
  goal_step_id uuid references public.tgg_brain_goal_steps(id) on delete set null,
  build_task_id uuid references public.tgg_build_tasks(id) on delete set null,
  execution_trace_id uuid references public.tgg_brain_execution_traces(id) on delete set null,
  link_type text not null check (link_type in ('implements','tests','verifies','depends_on')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(requirement_id,goal_step_id,build_task_id,execution_trace_id,link_type)
);

alter table public.tgg_brain_requirement_links enable row level security;
revoke all on public.tgg_brain_requirement_links from anon,authenticated;

create or replace function public.tgg_brain_requirement_link(
  p_requirement_id uuid,p_link_type text,p_goal_step_id uuid default null,p_build_task_id uuid default null,
  p_execution_trace_id uuid default null,p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if p_link_type not in ('implements','tests','verifies','depends_on') then raise exception 'invalid_link_type'; end if;
  if p_goal_step_id is null and p_build_task_id is null and p_execution_trace_id is null then
    raise exception 'at_least_one_link_target_required';
  end if;

  insert into public.tgg_brain_requirement_links(
    requirement_id,goal_step_id,build_task_id,execution_trace_id,link_type,evidence
  ) values(
    p_requirement_id,p_goal_step_id,p_build_task_id,p_execution_trace_id,p_link_type,coalesce(p_evidence,'{}'::jsonb)
  )
  on conflict(requirement_id,goal_step_id,build_task_id,execution_trace_id,link_type) do update
  set evidence=excluded.evidence
  returning id into v_id;

  return jsonb_build_object('ok',true,'requirement_link_id',v_id,'link_type',p_link_type);
end $$;

create or replace function public.tgg_brain_spec_coverage(p_spec_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_must integer:=0; v_impl integer:=0; v_test integer:=0; v_verify integer:=0;
  v_uncovered jsonb:='[]'::jsonb; v_complete boolean:=false;
begin
  select count(*) into v_must
  from public.tgg_brain_spec_requirements
  where spec_id=p_spec_id and priority='must' and scope_status='in_scope';

  select count(*) into v_impl
  from public.tgg_brain_spec_requirements r
  where r.spec_id=p_spec_id and r.priority='must' and r.scope_status='in_scope'
    and exists(
      select 1 from public.tgg_brain_requirement_links l
      where l.requirement_id=r.id and l.link_type='implements'
        and (l.goal_step_id is not null or l.build_task_id is not null)
    );

  select count(*) into v_test
  from public.tgg_brain_spec_requirements r
  where r.spec_id=p_spec_id and r.priority='must' and r.scope_status='in_scope'
    and exists(select 1 from public.tgg_brain_requirement_links l where l.requirement_id=r.id and l.link_type='tests');

  select count(*) into v_verify
  from public.tgg_brain_spec_requirements r
  where r.spec_id=p_spec_id and r.priority='must' and r.scope_status='in_scope'
    and exists(
      select 1 from public.tgg_brain_requirement_links l
      join public.tgg_brain_execution_traces t on t.id=l.execution_trace_id
      where l.requirement_id=r.id and l.link_type='verifies' and t.trace_status='verified'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'requirement_id',r.id,'requirement_key',r.requirement_key,'statement',r.statement,
    'implemented',exists(select 1 from public.tgg_brain_requirement_links l where l.requirement_id=r.id and l.link_type='implements'),
    'tested',exists(select 1 from public.tgg_brain_requirement_links l where l.requirement_id=r.id and l.link_type='tests'),
    'verified',exists(
      select 1 from public.tgg_brain_requirement_links l
      join public.tgg_brain_execution_traces t on t.id=l.execution_trace_id
      where l.requirement_id=r.id and l.link_type='verifies' and t.trace_status='verified'
    )
  ) order by r.requirement_key),'[]'::jsonb)
  into v_uncovered
  from public.tgg_brain_spec_requirements r
  where r.spec_id=p_spec_id and r.priority='must' and r.scope_status='in_scope'
    and not (
      exists(select 1 from public.tgg_brain_requirement_links l where l.requirement_id=r.id and l.link_type='implements')
      and exists(select 1 from public.tgg_brain_requirement_links l where l.requirement_id=r.id and l.link_type='tests')
      and exists(
        select 1 from public.tgg_brain_requirement_links l
        join public.tgg_brain_execution_traces t on t.id=l.execution_trace_id
        where l.requirement_id=r.id and l.link_type='verifies' and t.trace_status='verified'
      )
    );

  v_complete:=v_must>0 and v_impl=v_must and v_test=v_must and v_verify=v_must;

  return jsonb_build_object(
    'ok',true,'spec_id',p_spec_id,'must_requirements',v_must,'implemented',v_impl,'tested',v_test,
    'verified',v_verify,'coverage_complete',v_complete,'uncovered_requirements',v_uncovered
  );
end $$;

create or replace function public.tgg_brain_spec_mark_complete(p_spec_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_validation jsonb; v_coverage jsonb;
begin
  v_validation:=public.tgg_brain_spec_validate(p_spec_id);
  v_coverage:=public.tgg_brain_spec_coverage(p_spec_id);

  if coalesce((v_validation->>'ready')::boolean,false) is not true then raise exception 'spec_not_ready'; end if;
  if coalesce((v_coverage->>'coverage_complete')::boolean,false) is not true then raise exception 'spec_coverage_incomplete'; end if;

  update public.tgg_brain_specs set status='complete',updated_at=now() where id=p_spec_id;

  return jsonb_build_object('ok',true,'spec_id',p_spec_id,'status','complete','validation',v_validation,'coverage',v_coverage);
end $$;

revoke all on function public.tgg_brain_requirement_link(uuid,text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_brain_spec_coverage(uuid) from public,anon,authenticated;
revoke all on function public.tgg_brain_spec_mark_complete(uuid) from public,anon,authenticated;
grant execute on function public.tgg_brain_requirement_link(uuid,text,uuid,uuid,uuid,jsonb) to postgres;
grant execute on function public.tgg_brain_spec_coverage(uuid) to postgres;
grant execute on function public.tgg_brain_spec_mark_complete(uuid) to postgres;


-- TGG Brain critical-path planning
create or replace function public.tgg_brain_critical_path(p_goal_id uuid,p_limit integer default 20)
returns jsonb
language sql security definer set search_path=''
as $$
with recursive edges as (
  select s.id step_id,d.goal_step_id dependent_id
  from public.tgg_brain_goal_steps s
  join public.tgg_brain_goal_dependencies d on d.depends_on_step_id=s.id
  where s.goal_id=p_goal_id
),
closure as (
  select e.step_id,e.dependent_id,1 depth from edges e
  union all
  select c.step_id,e.dependent_id,c.depth+1
  from closure c join edges e on e.step_id=c.dependent_id
  where c.depth<50
),
unlock_counts as (
  select step_id,count(distinct dependent_id) downstream_unlocks
  from closure group by step_id
),
dep_state as (
  select s.id,count(d.depends_on_step_id) dependency_count,
         count(d.depends_on_step_id) filter(where dep.status='complete') complete_dependencies
  from public.tgg_brain_goal_steps s
  left join public.tgg_brain_goal_dependencies d on d.goal_step_id=s.id
  left join public.tgg_brain_goal_steps dep on dep.id=d.depends_on_step_id
  where s.goal_id=p_goal_id
  group by s.id
),
ranked as (
  select s.id,s.step_key,s.title,s.step_type,s.status,s.sequence_no,s.risk_level,s.acceptance,
         coalesce(u.downstream_unlocks,0) downstream_unlocks,
         ds.dependency_count,ds.complete_dependencies,
         (ds.dependency_count=ds.complete_dependencies) dependencies_satisfied,
         case
           when s.risk_level='high' then false
           when s.status in ('complete','skipped','approval_required','blocked') then false
           when ds.dependency_count<>ds.complete_dependencies then false
           else true
         end autonomous_candidate,
         (
           coalesce(u.downstream_unlocks,0)*20
           + case s.status when 'ready' then 30 when 'queued' then 20 when 'repairing' then 25 else 10 end
           + greatest(0,20-s.sequence_no)
           - case s.risk_level when 'medium' then 10 else 0 end
         )::numeric unlock_score
  from public.tgg_brain_goal_steps s
  join dep_state ds on ds.id=s.id
  left join unlock_counts u on u.step_id=s.id
  where s.goal_id=p_goal_id and s.status not in ('complete','skipped')
)
select jsonb_build_object(
  'goal_id',p_goal_id,
  'critical_path',coalesce((
    select jsonb_agg(jsonb_build_object(
      'step_id',id,'step_key',step_key,'title',title,'step_type',step_type,'status',status,
      'sequence_no',sequence_no,'risk_level',risk_level,'downstream_unlocks',downstream_unlocks,
      'dependency_count',dependency_count,'complete_dependencies',complete_dependencies,
      'dependencies_satisfied',dependencies_satisfied,'autonomous_candidate',autonomous_candidate,
      'unlock_score',unlock_score,'acceptance',acceptance
    ) order by unlock_score desc,sequence_no)
    from (select * from ranked order by unlock_score desc,sequence_no limit greatest(1,least(50,p_limit))) q
  ),'[]'::jsonb),
  'next_safe_unlock',(
    select jsonb_build_object(
      'step_id',id,'step_key',step_key,'title',title,'unlock_score',unlock_score,'downstream_unlocks',downstream_unlocks
    )
    from ranked where autonomous_candidate=true
    order by unlock_score desc,sequence_no limit 1
  ),
  'blocked_or_approval_count',(
    select count(*) from ranked where status in ('blocked','approval_required') or risk_level='high'
  ),
  'safe_ready_count',(select count(*) from ranked where autonomous_candidate=true)
)
$$;

create or replace function public.tgg_brain_next_critical_unlocks(p_limit integer default 10)
returns jsonb
language sql security definer set search_path=''
as $$
with goals as (
  select id,goal_key,title,priority_score
  from public.tgg_brain_goals
  where status not in ('complete','canceled')
    and development_only=true and production_allowed=false and risk_level<>'high'
),
candidates as (
  select g.id goal_id,g.goal_key,g.title goal_title,g.priority_score,
         s.id step_id,s.step_key,s.title step_title,s.step_type,s.sequence_no,s.risk_level,
         coalesce(u.downstream_unlocks,0) downstream_unlocks,
         (
           g.priority_score+coalesce(u.downstream_unlocks,0)*20+greatest(0,20-s.sequence_no)
           -case s.risk_level when 'medium' then 10 else 0 end
         )::numeric score
  from goals g
  join public.tgg_brain_goal_steps s on s.goal_id=g.id
  left join (
    with recursive e as (
      select d.depends_on_step_id step_id,d.goal_step_id dependent_id
      from public.tgg_brain_goal_dependencies d
    ),
    c as (
      select step_id,dependent_id,1 depth from e
      union all
      select c.step_id,e.dependent_id,c.depth+1
      from c join e on e.step_id=c.dependent_id
      where c.depth<50
    )
    select step_id,count(distinct dependent_id) downstream_unlocks from c group by step_id
  ) u on u.step_id=s.id
  where s.status in ('queued','ready','repairing','testing')
    and s.risk_level<>'high'
    and not exists(
      select 1 from public.tgg_brain_goal_dependencies d
      join public.tgg_brain_goal_steps dep on dep.id=d.depends_on_step_id
      where d.goal_step_id=s.id and dep.status<>'complete'
    )
)
select coalesce(jsonb_agg(jsonb_build_object(
  'goal_id',goal_id,'goal_key',goal_key,'goal_title',goal_title,'step_id',step_id,
  'step_key',step_key,'step_title',step_title,'step_type',step_type,'risk_level',risk_level,
  'downstream_unlocks',downstream_unlocks,'score',score
) order by score desc),'[]'::jsonb)
from (select * from candidates order by score desc limit greatest(1,least(25,p_limit))) q
$$;

revoke all on function public.tgg_brain_critical_path(uuid,integer) from public,anon,authenticated;
revoke all on function public.tgg_brain_next_critical_unlocks(integer) from public,anon,authenticated;
grant execute on function public.tgg_brain_critical_path(uuid,integer) to postgres;
grant execute on function public.tgg_brain_next_critical_unlocks(integer) to postgres;
