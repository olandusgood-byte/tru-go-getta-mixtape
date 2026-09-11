-- TGG self-building video game idea pipeline
-- Captures the verified live Game Idea Inbox + Auto Builder integration.
-- New ideas are deduped, tracked, claimed by an internal worker, and handed to
-- development/staging automation. Production/high-risk actions remain approval-gated.

create table if not exists public.tgg_game_idea_inbox (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.tgg_build_projects(id) on delete set null,
  idea_title text,
  idea_text text not null,
  idea_hash text not null,
  source text not null default 'chat',
  status text not null default 'new'
    check (status in ('new','planning','queued','building','testing','staged','complete','approval_required','blocked','canceled')),
  duplicate_count integer not null default 0,
  release_id uuid references public.tgg_build_releases(id) on delete set null,
  plan jsonb not null default '{}'::jsonb,
  build_summary jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(owner_user_id,idea_hash)
);

alter table public.tgg_game_idea_inbox
  add column if not exists retry_count integer not null default 0,
  add column if not exists max_retries integer not null default 3,
  add column if not exists claimed_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz;

create index if not exists tgg_game_idea_inbox_status_idx
  on public.tgg_game_idea_inbox(status,created_at);

alter table public.tgg_game_idea_inbox enable row level security;

drop policy if exists tgg_game_idea_read_own on public.tgg_game_idea_inbox;
create policy tgg_game_idea_read_own
on public.tgg_game_idea_inbox
for select to authenticated
using ((select auth.uid())=owner_user_id);

drop policy if exists tgg_game_idea_insert_own on public.tgg_game_idea_inbox;
create policy tgg_game_idea_insert_own
on public.tgg_game_idea_inbox
for insert to authenticated
with check ((select auth.uid())=owner_user_id);

grant select,insert on public.tgg_game_idea_inbox to authenticated;
revoke update,delete on public.tgg_game_idea_inbox from anon,authenticated;

create or replace function public.tgg_game_idea_submit(
  p_idea text,
  p_title text default null,
  p_source text default 'chat',
  p_project_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_text text := regexp_replace(trim(coalesce(p_idea,'')),'[[:space:]]+',' ','g');
  v_hash text;
  v_row public.tgg_game_idea_inbox%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if length(v_text)<3 then raise exception 'idea_required'; end if;
  if length(v_text)>20000 then raise exception 'idea_too_long'; end if;

  v_hash := md5(lower(v_text));

  insert into public.tgg_game_idea_inbox(
    owner_user_id,project_id,idea_title,idea_text,idea_hash,source,status
  )
  values(
    v_uid,p_project_id,nullif(trim(p_title),''),v_text,v_hash,
    coalesce(nullif(trim(p_source),''),'chat'),'new'
  )
  on conflict(owner_user_id,idea_hash) do update
    set duplicate_count=public.tgg_game_idea_inbox.duplicate_count+1,
        last_seen_at=now(),
        updated_at=now()
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,'idea_id',v_row.id,'status',v_row.status,
    'duplicate_count',v_row.duplicate_count,'release_id',v_row.release_id
  );
end $$;

revoke all on function public.tgg_game_idea_submit(text,text,text,uuid) from public,anon;
grant execute on function public.tgg_game_idea_submit(text,text,text,uuid) to authenticated;

create or replace function public.tgg_game_idea_claim_batch(
  p_worker text,
  p_limit integer default 3
) returns table(
  idea_id uuid,
  owner_user_id uuid,
  project_id uuid,
  idea_title text,
  idea_text text,
  source text
)
language plpgsql
security invoker
set search_path=''
as $$
begin
  if p_worker is null or length(trim(p_worker))=0 then raise exception 'worker_required'; end if;
  if p_limit<1 or p_limit>10 then raise exception 'invalid_limit'; end if;

  return query
  with picked as (
    select i.id
    from public.tgg_game_idea_inbox i
    where i.status='new'
      and i.retry_count <= i.max_retries
    order by i.created_at
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.tgg_game_idea_inbox i
    set status='planning',
        claimed_at=now(),
        last_heartbeat_at=now(),
        build_summary=coalesce(i.build_summary,'{}'::jsonb) ||
          jsonb_build_object('claimed_by',p_worker,'claimed_at',now()),
        updated_at=now()
    from picked
    where i.id=picked.id
    returning i.*
  )
  select c.id,c.owner_user_id,c.project_id,c.idea_title,c.idea_text,c.source
  from claimed c
  order by c.created_at;
end $$;

revoke all on function public.tgg_game_idea_claim_batch(text,integer) from public,anon,authenticated;
grant execute on function public.tgg_game_idea_claim_batch(text,integer) to postgres;

create or replace function public.tgg_game_idea_heartbeat(
  p_idea_id uuid,
  p_status text default null,
  p_summary jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare v_status text;
begin
  if current_user <> 'postgres' then raise exception 'internal_worker_only'; end if;
  if p_status is not null and p_status not in
    ('planning','queued','building','testing','staged','complete','approval_required','blocked','canceled')
  then raise exception 'invalid_status'; end if;

  update public.tgg_game_idea_inbox
  set status=coalesce(p_status,status),
      last_heartbeat_at=now(),
      updated_at=now(),
      build_summary=coalesce(build_summary,'{}'::jsonb) || coalesce(p_summary,'{}'::jsonb),
      completed_at=case when coalesce(p_status,status)='complete' then coalesce(completed_at,now()) else completed_at end
  where id=p_idea_id
  returning status into v_status;

  if not found then raise exception 'idea_not_found'; end if;

  return jsonb_build_object('ok',true,'idea_id',p_idea_id,'status',v_status,'heartbeat_at',now());
end $$;

revoke all on function public.tgg_game_idea_heartbeat(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.tgg_game_idea_heartbeat(uuid,text,jsonb) to postgres;

create or replace function public.tgg_game_idea_recover_stale(
  p_stale_after interval default interval '2 hours'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_requeued integer := 0;
  v_blocked integer := 0;
begin
  with stale as (
    select id
    from public.tgg_game_idea_inbox
    where status in ('planning','queued','building','testing')
      and coalesce(last_heartbeat_at,claimed_at,updated_at) < now()-p_stale_after
      and retry_count < max_retries
    for update skip locked
  )
  update public.tgg_game_idea_inbox i
  set status='new',
      retry_count=i.retry_count+1,
      claimed_at=null,
      last_heartbeat_at=null,
      last_error='auto_recovered_stale_worker',
      build_summary=coalesce(i.build_summary,'{}'::jsonb) ||
        jsonb_build_object('auto_recovered_at',now(),'reason','stale_worker'),
      updated_at=now()
  from stale
  where i.id=stale.id;
  get diagnostics v_requeued = row_count;

  with exhausted as (
    select id
    from public.tgg_game_idea_inbox
    where status in ('planning','queued','building','testing')
      and coalesce(last_heartbeat_at,claimed_at,updated_at) < now()-p_stale_after
      and retry_count >= max_retries
    for update skip locked
  )
  update public.tgg_game_idea_inbox i
  set status='blocked',
      last_error='auto_recovery_retries_exhausted',
      build_summary=coalesce(i.build_summary,'{}'::jsonb) ||
        jsonb_build_object('auto_blocked_at',now(),'reason','retry_limit_reached'),
      updated_at=now()
  from exhausted
  where i.id=exhausted.id;
  get diagnostics v_blocked = row_count;

  return jsonb_build_object(
    'ok',true,'requeued',v_requeued,
    'blocked_after_retry_limit',v_blocked,'stale_after',p_stale_after::text
  );
end $$;

revoke all on function public.tgg_game_idea_recover_stale(interval) from public,anon,authenticated;
grant execute on function public.tgg_game_idea_recover_stale(interval) to postgres;

create or replace function public.tgg_game_idea_pipeline_state()
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'new',count(*) filter(where status='new'),
    'planning',count(*) filter(where status='planning'),
    'queued',count(*) filter(where status='queued'),
    'building',count(*) filter(where status='building'),
    'testing',count(*) filter(where status='testing'),
    'staged',count(*) filter(where status='staged'),
    'approval_required',count(*) filter(where status='approval_required'),
    'blocked',count(*) filter(where status='blocked'),
    'complete',count(*) filter(where status='complete'),
    'production_auto_publish',false,
    'high_risk_auto_execute',false
  )
  from public.tgg_game_idea_inbox
$$;

revoke all on function public.tgg_game_idea_pipeline_state() from public,anon,authenticated;
grant execute on function public.tgg_game_idea_pipeline_state() to postgres;

create or replace function public.tgg_autobuilder_watchdog()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ctrl public.tgg_autobuilder_controller%rowtype;
  v_codesync jsonb;
  v_migration jsonb;
  v_detect jsonb;
  v_cycle jsonb;
  v_ideas jsonb;
  v_idea_recovery jsonb;
  v_open_failures integer;
  v_stale_jobs integer;
begin
  v_codesync := private.tgg_codesync_tick();
  v_migration := private.tgg_refresh_migration_hygiene_runtime_inventory();
  v_idea_recovery := public.tgg_game_idea_recover_stale(interval '2 hours');
  v_detect := public.tgg_autobuilder_detect_state();
  v_ideas := public.tgg_game_idea_pipeline_state();

  select count(*) into v_open_failures
  from public.tgg_build_failures
  where status in ('open','repairing','blocked');

  select count(*) into v_stale_jobs
  from public.tgg_theme_deploy_jobs
  where status in ('claimed','processing')
    and claimed_at < now()-interval '10 minutes';

  select * into v_ctrl from public.tgg_autobuilder_controller where id=1;

  if v_ctrl.enabled then
    v_cycle := public.tgg_autobuilder_run_cycle();
  else
    v_cycle := jsonb_build_object('status','paused','reason','controller_disabled');
  end if;

  return jsonb_build_object(
    'ok',true,'checked_at',now(),
    'game_idea_recovery',v_idea_recovery,'game_ideas',v_ideas,
    'codesync',v_codesync,'migration_hygiene',v_migration,
    'detected',v_detect,'cycle',v_cycle,
    'open_build_failures',v_open_failures,'stale_theme_jobs',v_stale_jobs,
    'production_auto_claim_blocked',true,
    'high_risk_auto_claim_blocked',true,
    'production_promotion_requires_explicit_approval',true
  );
end $$;

revoke all on function public.tgg_autobuilder_watchdog() from public,anon,authenticated;
grant execute on function public.tgg_autobuilder_watchdog() to postgres;
