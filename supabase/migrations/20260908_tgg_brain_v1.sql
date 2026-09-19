-- TGG Brain 1.0
-- Persistent orchestration memory, decisions, priorities, and unified brain state
-- for the self-building TGG World video game.
-- Production/high-risk boundaries remain explicit and approval-gated.

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

alter table public.tgg_brain_memory enable row level security;
alter table public.tgg_brain_decisions enable row level security;
alter table public.tgg_brain_priorities enable row level security;

revoke all on public.tgg_brain_memory from anon,authenticated;
revoke all on public.tgg_brain_decisions from anon,authenticated;
revoke all on public.tgg_brain_priorities from anon,authenticated;

create or replace function public.tgg_brain_remember(
  p_memory_key text,
  p_memory_type text,
  p_title text,
  p_content jsonb default '{}'::jsonb,
  p_importance integer default 50,
  p_source_ref text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if p_memory_type not in ('system','idea','decision','lesson','constraint','architecture','qa','dependency') then
    raise exception 'invalid_memory_type';
  end if;

  insert into public.tgg_brain_memory(memory_key,memory_type,title,content,importance,source_ref)
  values(trim(p_memory_key),p_memory_type,trim(p_title),coalesce(p_content,'{}'::jsonb),greatest(0,least(100,p_importance)),p_source_ref)
  on conflict(memory_key) do update
    set memory_type=excluded.memory_type,
        title=excluded.title,
        content=excluded.content,
        importance=excluded.importance,
        source_ref=coalesce(excluded.source_ref,public.tgg_brain_memory.source_ref),
        active=true,
        updated_at=now()
  returning id into v_id;

  return jsonb_build_object('ok',true,'memory_id',v_id,'memory_key',p_memory_key);
end $$;

create or replace function public.tgg_brain_decide(
  p_decision_key text,
  p_subject text,
  p_decision text,
  p_rationale jsonb default '{}'::jsonb,
  p_constraints jsonb default '[]'::jsonb,
  p_reversible boolean default true
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  insert into public.tgg_brain_decisions(decision_key,subject,decision,rationale,constraints,reversible)
  values(trim(p_decision_key),trim(p_subject),trim(p_decision),coalesce(p_rationale,'{}'::jsonb),coalesce(p_constraints,'[]'::jsonb),coalesce(p_reversible,true))
  on conflict(decision_key) do update
    set subject=excluded.subject,
        decision=excluded.decision,
        rationale=excluded.rationale,
        constraints=excluded.constraints,
        reversible=excluded.reversible,
        status='active',
        superseded_by=null,
        updated_at=now()
  returning id into v_id;

  return jsonb_build_object('ok',true,'decision_id',v_id,'decision_key',p_decision_key);
end $$;

create or replace function public.tgg_brain_set_priority(
  p_item_type text,
  p_item_key text,
  p_impact integer,
  p_urgency integer,
  p_dependency_readiness integer,
  p_confidence integer,
  p_risk_penalty integer default 0,
  p_reason jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_score numeric;
begin
  insert into public.tgg_brain_priorities(item_type,item_key,impact,urgency,dependency_readiness,confidence,risk_penalty,reason)
  values(
    p_item_type,trim(p_item_key),
    greatest(0,least(100,p_impact)),
    greatest(0,least(100,p_urgency)),
    greatest(0,least(100,p_dependency_readiness)),
    greatest(0,least(100,p_confidence)),
    greatest(0,least(100,p_risk_penalty)),
    coalesce(p_reason,'{}'::jsonb)
  )
  on conflict(item_type,item_key) do update
    set impact=excluded.impact,
        urgency=excluded.urgency,
        dependency_readiness=excluded.dependency_readiness,
        confidence=excluded.confidence,
        risk_penalty=excluded.risk_penalty,
        reason=excluded.reason,
        updated_at=now();

  select score into v_score
  from public.tgg_brain_priorities
  where item_type=p_item_type and item_key=trim(p_item_key);

  return jsonb_build_object('ok',true,'item_type',p_item_type,'item_key',p_item_key,'score',v_score);
end $$;

create or replace function public.tgg_brain_state()
returns jsonb
language plpgsql
security definer
set search_path=''
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
        select jsonb_build_object(
          'item_type',item_type,'item_key',item_key,'score',score,'reason',reason
        ) as x
        from public.tgg_brain_priorities
        order by score desc,updated_at desc
        limit 10
      ) q
    ),'[]'::jsonb),
    'game_ideas',v_idea,
    'builder',v_build,
    'dependencies',coalesce(v_dependency,'{}'::jsonb),
    'production_auto_publish',false,
    'high_risk_auto_execute',false,
    'canonical_boundary','AB-006',
    'canonical_source_version','V223'
  );
end $$;

revoke all on function public.tgg_brain_remember(text,text,text,jsonb,integer,text) from public,anon,authenticated;
revoke all on function public.tgg_brain_decide(text,text,text,jsonb,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.tgg_brain_set_priority(text,text,integer,integer,integer,integer,integer,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_brain_state() from public,anon,authenticated;

grant execute on function public.tgg_brain_remember(text,text,text,jsonb,integer,text) to postgres;
grant execute on function public.tgg_brain_decide(text,text,text,jsonb,jsonb,boolean) to postgres;
grant execute on function public.tgg_brain_set_priority(text,text,integer,integer,integer,integer,integer,jsonb) to postgres;
grant execute on function public.tgg_brain_state() to postgres;

select public.tgg_brain_remember(
  'system:self-building-video-game',
  'architecture',
  'Self-building TGG World video game',
  jsonb_build_object(
    'pipeline',jsonb_build_array('idea','dedupe','plan','build','repair','qa','playtest','stage','source_control'),
    'auto_repair',true,
    'stale_recovery',true,
    'production_auto_publish',false
  ),
  100,
  'tgg_game_idea_inbox'
);

select public.tgg_brain_decide(
  'decision:production-boundary',
  'Production automation',
  'Development and staging may build automatically; production/high-risk changes require explicit approval.',
  jsonb_build_object('reason','protect canonical production and irreversible actions'),
  jsonb_build_array('AB-006 V223 canonical boundary','no automatic production promotion','no automatic high-risk actions'),
  false
);

select public.tgg_brain_set_priority(
  'idea',
  'self-building-video-game',
  100,95,100,100,0,
  jsonb_build_object('reason','core orchestration brain for all future TGG World ideas')
);
