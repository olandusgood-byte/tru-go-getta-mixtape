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
