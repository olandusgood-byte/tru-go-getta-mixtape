-- TGG Brain goal decomposition engine
-- Stores large game objectives as dependency-ordered safe build steps.

create table if not exists public.tgg_brain_goals (
  id uuid primary key default gen_random_uuid(),
  goal_key text not null unique,
  source_idea_id uuid references public.tgg_game_idea_inbox(id) on delete set null,
  title text not null,
  objective text not null,
  status text not null default 'planning'
    check (status in ('planning','ready','building','testing','complete','approval_required','blocked','canceled')),
  priority_score numeric not null default 50,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  development_only boolean not null default true,
  production_allowed boolean not null default false,
  plan_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.tgg_brain_goal_steps (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.tgg_brain_goals(id) on delete cascade,
  step_key text not null,
  title text not null,
  step_type text not null check (step_type in ('research','design','schema','backend','frontend','integration','qa','playtest','repair','staging','source_control')),
  status text not null default 'queued'
    check (status in ('queued','ready','building','testing','complete','approval_required','blocked','skipped')),
  sequence_no integer not null,
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  acceptance jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  build_task_id uuid references public.tgg_build_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(goal_id,step_key),
  unique(goal_id,sequence_no)
);

create table if not exists public.tgg_brain_goal_dependencies (
  goal_step_id uuid not null references public.tgg_brain_goal_steps(id) on delete cascade,
  depends_on_step_id uuid not null references public.tgg_brain_goal_steps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(goal_step_id,depends_on_step_id),
  check (goal_step_id <> depends_on_step_id)
);

alter table public.tgg_brain_goals enable row level security;
alter table public.tgg_brain_goal_steps enable row level security;
alter table public.tgg_brain_goal_dependencies enable row level security;

revoke all on public.tgg_brain_goals from anon,authenticated;
revoke all on public.tgg_brain_goal_steps from anon,authenticated;
revoke all on public.tgg_brain_goal_dependencies from anon,authenticated;

create or replace function public.tgg_brain_goal_create(
  p_goal_key text,p_title text,p_objective text,
  p_source_idea_id uuid default null,
  p_priority_score numeric default 50,
  p_risk_level text default 'medium',
  p_plan_summary jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if p_risk_level not in ('low','medium','high') then raise exception 'invalid_risk_level'; end if;
  insert into public.tgg_brain_goals(
    goal_key,source_idea_id,title,objective,status,priority_score,risk_level,
    development_only,production_allowed,plan_summary
  )
  values(trim(p_goal_key),p_source_idea_id,trim(p_title),trim(p_objective),'planning',
         greatest(0,least(100,p_priority_score)),p_risk_level,true,false,coalesce(p_plan_summary,'{}'::jsonb))
  on conflict(goal_key) do update
    set source_idea_id=coalesce(excluded.source_idea_id,public.tgg_brain_goals.source_idea_id),
        title=excluded.title,objective=excluded.objective,priority_score=excluded.priority_score,
        risk_level=excluded.risk_level,plan_summary=excluded.plan_summary,updated_at=now()
  returning id into v_id;
  return jsonb_build_object('ok',true,'goal_id',v_id,'goal_key',p_goal_key);
end $$;

create or replace function public.tgg_brain_goal_add_step(
  p_goal_id uuid,p_step_key text,p_title text,p_step_type text,
  p_sequence_no integer,p_risk_level text default 'medium',
  p_acceptance jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if p_step_type not in ('research','design','schema','backend','frontend','integration','qa','playtest','repair','staging','source_control')
  then raise exception 'invalid_step_type'; end if;
  if p_risk_level not in ('low','medium','high') then raise exception 'invalid_risk_level'; end if;

  insert into public.tgg_brain_goal_steps(
    goal_id,step_key,title,step_type,status,sequence_no,risk_level,acceptance
  )
  values(p_goal_id,trim(p_step_key),trim(p_title),p_step_type,'queued',p_sequence_no,p_risk_level,
         coalesce(p_acceptance,'[]'::jsonb))
  on conflict(goal_id,step_key) do update
    set title=excluded.title,step_type=excluded.step_type,sequence_no=excluded.sequence_no,
        risk_level=excluded.risk_level,acceptance=excluded.acceptance,updated_at=now()
  returning id into v_id;

  return jsonb_build_object('ok',true,'step_id',v_id,'step_key',p_step_key);
end $$;

create or replace function public.tgg_brain_goal_add_dependency(
  p_step_id uuid,p_depends_on_step_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
begin
  if p_step_id=p_depends_on_step_id then raise exception 'self_dependency_forbidden'; end if;

  if exists(
    with recursive walk(step_id) as (
      select p_depends_on_step_id
      union
      select d.depends_on_step_id
      from public.tgg_brain_goal_dependencies d
      join walk w on d.goal_step_id=w.step_id
    )
    select 1 from walk where step_id=p_step_id
  ) then
    raise exception 'cyclic_dependency_forbidden';
  end if;

  insert into public.tgg_brain_goal_dependencies(goal_step_id,depends_on_step_id)
  values(p_step_id,p_depends_on_step_id)
  on conflict do nothing;

  return jsonb_build_object('ok',true,'step_id',p_step_id,'depends_on_step_id',p_depends_on_step_id);
end $$;

create or replace function public.tgg_brain_goal_refresh_ready()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_ready integer := 0; v_waiting integer := 0; v_completed_goals integer := 0;
begin
  update public.tgg_brain_goal_steps s
  set status='ready',updated_at=now()
  where s.status='queued'
    and s.risk_level<>'high'
    and not exists(
      select 1
      from public.tgg_brain_goal_dependencies d
      join public.tgg_brain_goal_steps dep on dep.id=d.depends_on_step_id
      where d.goal_step_id=s.id and dep.status<>'complete'
    );
  get diagnostics v_ready = row_count;

  select count(*) into v_waiting from public.tgg_brain_goal_steps s where s.status='queued';

  update public.tgg_brain_goals g
  set status='complete',completed_at=coalesce(completed_at,now()),updated_at=now()
  where g.status not in ('complete','canceled')
    and exists(select 1 from public.tgg_brain_goal_steps s where s.goal_id=g.id)
    and not exists(
      select 1 from public.tgg_brain_goal_steps s
      where s.goal_id=g.id and s.status not in ('complete','skipped')
    );
  get diagnostics v_completed_goals = row_count;

  update public.tgg_brain_goals g
  set status=case
    when exists(select 1 from public.tgg_brain_goal_steps s where s.goal_id=g.id and s.status='approval_required') then 'approval_required'
    when exists(select 1 from public.tgg_brain_goal_steps s where s.goal_id=g.id and s.status in ('building','testing')) then 'building'
    when exists(select 1 from public.tgg_brain_goal_steps s where s.goal_id=g.id and s.status='ready') then 'ready'
    when exists(select 1 from public.tgg_brain_goal_steps s where s.goal_id=g.id and s.status='blocked') then 'blocked'
    else g.status end,
      updated_at=now()
  where g.status not in ('complete','canceled');

  return jsonb_build_object('ok',true,'newly_ready',v_ready,'waiting_on_dependencies',v_waiting,
                            'goals_completed',v_completed_goals);
end $$;

create or replace function public.tgg_brain_goal_next_steps(p_limit integer default 10)
returns jsonb
language sql security definer set search_path=''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'goal_id',g.id,'goal_key',g.goal_key,'goal_title',g.title,'goal_priority',g.priority_score,
      'step_id',s.id,'step_key',s.step_key,'step_title',s.title,'step_type',s.step_type,
      'step_risk',s.risk_level,'acceptance',s.acceptance
    ) order by g.priority_score desc,s.sequence_no
  ),'[]'::jsonb)
  from (
    select s.*
    from public.tgg_brain_goal_steps s
    where s.status='ready' and s.risk_level<>'high'
    order by s.sequence_no
    limit greatest(1,least(25,p_limit))
  ) s
  join public.tgg_brain_goals g on g.id=s.goal_id
  where g.development_only=true
    and g.production_allowed=false
    and g.risk_level<>'high'
$$;

revoke all on function public.tgg_brain_goal_create(text,text,text,uuid,numeric,text,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_brain_goal_add_step(uuid,text,text,text,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_brain_goal_add_dependency(uuid,uuid) from public,anon,authenticated;
revoke all on function public.tgg_brain_goal_refresh_ready() from public,anon,authenticated;
revoke all on function public.tgg_brain_goal_next_steps(integer) from public,anon,authenticated;

grant execute on function public.tgg_brain_goal_create(text,text,text,uuid,numeric,text,jsonb) to postgres;
grant execute on function public.tgg_brain_goal_add_step(uuid,text,text,text,integer,text,jsonb) to postgres;
grant execute on function public.tgg_brain_goal_add_dependency(uuid,uuid) to postgres;
grant execute on function public.tgg_brain_goal_refresh_ready() to postgres;
grant execute on function public.tgg_brain_goal_next_steps(integer) to postgres;
