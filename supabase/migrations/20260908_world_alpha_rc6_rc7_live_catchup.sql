-- TGG World Alpha live-only catch-up: RC6 + RC7
-- Source: verified live Supabase state on 2026-09-08.
-- Purpose: capture current schema in source control without altering production.
-- Safety: no rights transfer, no real money, virtual rewards only.

create table if not exists public.tgg_world_studio_sessions (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_character_id uuid not null references public.world_characters(id) on delete cascade,
  location_id uuid not null references public.tgg_world_locations(id) on delete restrict,
  instance_id uuid references public.tgg_world_instances(id) on delete set null,
  studio_project_id uuid references public.tgg_studio_projects(id) on delete set null,
  session_status text not null default 'active' check (session_status in ('active','paused','ended')),
  voice_context text not null default 'studio' check (voice_context='studio'),
  reconnect_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.tgg_world_studio_session_members (
  session_id uuid not null references public.tgg_world_studio_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  session_role text not null default 'guest' check (session_role in ('host','artist','producer','engineer','guest')),
  voice_enabled boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  primary key(session_id,user_id)
);

create table if not exists public.tgg_world_open_mic_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.tgg_world_locations(id) on delete cascade,
  instance_id uuid references public.tgg_world_instances(id) on delete set null,
  event_status text not null default 'open' check (event_status in ('open','performing','closed')),
  current_performance uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_world_open_mic_queue (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.tgg_world_open_mic_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  queue_position integer not null,
  queue_status text not null default 'waiting' check (queue_status in ('waiting','performing','done','left')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,queue_position),
  unique(event_id,user_id)
);

create table if not exists public.tgg_world_open_mic_performances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.tgg_world_open_mic_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  linked_studio_project_id uuid references public.tgg_studio_projects(id) on delete set null,
  performance_status text not null default 'live' check (performance_status in ('live','complete','canceled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  reward_applied boolean not null default false,
  reward_detail jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='tgg_world_open_mic_events_current_performance_fkey'
      and conrelid='public.tgg_world_open_mic_events'::regclass
  ) then
    alter table public.tgg_world_open_mic_events
      add constraint tgg_world_open_mic_events_current_performance_fkey
      foreign key(current_performance)
      references public.tgg_world_open_mic_performances(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.tgg_world_open_mic_reactions (
  performance_id uuid not null references public.tgg_world_open_mic_performances(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('fire','clap','heart','star')),
  created_at timestamptz not null default now(),
  primary key(performance_id,user_id)
);

alter table public.tgg_world_studio_sessions enable row level security;
alter table public.tgg_world_studio_session_members enable row level security;
alter table public.tgg_world_open_mic_events enable row level security;
alter table public.tgg_world_open_mic_queue enable row level security;
alter table public.tgg_world_open_mic_performances enable row level security;
alter table public.tgg_world_open_mic_reactions enable row level security;

revoke insert,update,delete on public.tgg_world_studio_sessions from anon,authenticated;
revoke insert,update,delete on public.tgg_world_studio_session_members from anon,authenticated;
revoke insert,update,delete on public.tgg_world_open_mic_events from anon,authenticated;
revoke insert,update,delete on public.tgg_world_open_mic_queue from anon,authenticated;
revoke insert,update,delete on public.tgg_world_open_mic_performances from anon,authenticated;
revoke insert,update,delete on public.tgg_world_open_mic_reactions from anon,authenticated;

grant select on public.tgg_world_studio_sessions,
public.tgg_world_studio_session_members,
public.tgg_world_open_mic_events,
public.tgg_world_open_mic_queue,
public.tgg_world_open_mic_performances,
public.tgg_world_open_mic_reactions
to authenticated;

drop policy if exists tgg_world_studio_sessions_read on public.tgg_world_studio_sessions;
create policy tgg_world_studio_sessions_read on public.tgg_world_studio_sessions
for select to authenticated
using (
  host_user_id=(select auth.uid())
  or exists(
    select 1 from public.tgg_world_studio_session_members m
    where m.session_id=tgg_world_studio_sessions.id
      and m.user_id=(select auth.uid())
      and m.left_at is null
  )
);

drop policy if exists tgg_world_studio_members_read on public.tgg_world_studio_session_members;
create policy tgg_world_studio_members_read on public.tgg_world_studio_session_members
for select to authenticated
using (
  user_id=(select auth.uid())
  or exists(
    select 1 from public.tgg_world_studio_sessions s
    where s.id=tgg_world_studio_session_members.session_id
      and s.host_user_id=(select auth.uid())
  )
);

drop policy if exists tgg_world_open_mic_events_read on public.tgg_world_open_mic_events;
create policy tgg_world_open_mic_events_read on public.tgg_world_open_mic_events
for select to authenticated using (true);

drop policy if exists tgg_world_open_mic_queue_read on public.tgg_world_open_mic_queue;
create policy tgg_world_open_mic_queue_read on public.tgg_world_open_mic_queue
for select to authenticated using (true);

drop policy if exists tgg_world_open_mic_performances_read on public.tgg_world_open_mic_performances;
create policy tgg_world_open_mic_performances_read on public.tgg_world_open_mic_performances
for select to authenticated using (true);

drop policy if exists tgg_world_open_mic_reactions_read on public.tgg_world_open_mic_reactions;
create policy tgg_world_open_mic_reactions_read on public.tgg_world_open_mic_reactions
for select to authenticated using (true);

create or replace function public.tgg_world_studio_open(p_studio_project_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_loc public.tgg_world_locations%rowtype;
  v_presence public.tgg_world_presence%rowtype;
  v_session public.tgg_world_studio_sessions%rowtype;
  v_bridge boolean := false;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_char from public.world_characters
  where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;

  select * into v_loc from public.tgg_world_locations
  where location_key='basement-sound' and enabled=true limit 1;
  if not found then raise exception 'basement_sound_unavailable'; end if;

  if v_char.current_location_id is distinct from v_loc.id then
    raise exception 'basement_sound_location_required';
  end if;

  select * into v_presence from public.tgg_world_presence where user_id=v_uid limit 1;

  if p_studio_project_id is not null then
    if not exists(
      select 1 from public.tgg_studio_projects p
      where p.id=p_studio_project_id and p.user_id=v_uid
    ) and not exists(
      select 1 from public.tgg_studio_project_members m
      where m.project_id=p_studio_project_id
        and m.user_id=v_uid
        and m.left_at is null
    ) then
      raise exception 'studio_project_access_denied';
    end if;
    v_bridge:=true;
  end if;

  insert into public.tgg_world_studio_sessions(
    host_user_id,host_character_id,location_id,instance_id,studio_project_id,
    session_status,voice_context,reconnect_key,metadata
  )
  values(
    v_uid,v_char.id,v_loc.id,v_presence.instance_id,p_studio_project_id,
    'active','studio',gen_random_uuid()::text,
    jsonb_build_object('rights_transfer',false,'real_money',false)
  )
  returning * into v_session;

  insert into public.tgg_world_studio_session_members(
    session_id,user_id,character_id,session_role,voice_enabled
  )
  values(v_session.id,v_uid,v_char.id,'host',true);

  return jsonb_build_object(
    'ok',true,'session_id',v_session.id,'creator_os_bridge',v_bridge,
    'voice_context','studio','rights_transfer',false,'real_money',false
  );
end $$;

create or replace function public.tgg_world_studio_join(
  p_session_id uuid,
  p_role text default 'guest'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_session public.tgg_world_studio_sessions%rowtype;
  v_existing_role text;
  v_role text := lower(trim(coalesce(p_role,'guest')));
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_role not in ('artist','producer','engineer','guest') then raise exception 'invalid_studio_role'; end if;

  select * into v_char from public.world_characters
  where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;

  select * into v_session from public.tgg_world_studio_sessions
  where id=p_session_id and session_status in ('active','paused');
  if not found then raise exception 'studio_session_not_found'; end if;

  if v_char.current_location_id is distinct from v_session.location_id then
    raise exception 'same_location_required';
  end if;

  select session_role into v_existing_role
  from public.tgg_world_studio_session_members
  where session_id=p_session_id and user_id=v_uid;

  insert into public.tgg_world_studio_session_members(
    session_id,user_id,character_id,session_role,voice_enabled,left_at,last_seen_at
  )
  values(
    p_session_id,v_uid,v_char.id,
    case when v_existing_role='host' then 'host' else v_role end,
    true,null,now()
  )
  on conflict(session_id,user_id) do update
    set character_id=excluded.character_id,
        session_role=case
          when tgg_world_studio_session_members.session_role='host' then 'host'
          else excluded.session_role
        end,
        voice_enabled=true,
        left_at=null,
        last_seen_at=now();

  return jsonb_build_object(
    'ok',true,'session_id',p_session_id,
    'role',(select session_role from public.tgg_world_studio_session_members where session_id=p_session_id and user_id=v_uid),
    'voice_context','studio','reconnected',v_existing_role is not null,
    'rights_transfer',false,'real_money',false
  );
end $$;

create or replace function public.tgg_world_studio_bundle(p_session_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
begin
  return jsonb_build_object(
    'session',(select to_jsonb(s) from public.tgg_world_studio_sessions s where s.id=p_session_id),
    'members',coalesce(
      (select jsonb_agg(to_jsonb(m) order by m.joined_at)
       from public.tgg_world_studio_session_members m
       where m.session_id=p_session_id and m.left_at is null),
      '[]'::jsonb
    ),
    'creator_os_project',(
      select jsonb_build_object('id',p.id,'title',p.title,'project_type',p.project_type,'status',p.status,'revision',p.revision)
      from public.tgg_world_studio_sessions s
      join public.tgg_studio_projects p on p.id=s.studio_project_id
      where s.id=p_session_id
    ),
    'rights_transfer',false,
    'real_money',false
  );
end $$;

create or replace function public.tgg_world_open_mic_join_queue()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_char public.world_characters%rowtype;
  v_loc public.tgg_world_locations%rowtype;
  v_presence public.tgg_world_presence%rowtype;
  v_event public.tgg_world_open_mic_events%rowtype;
  v_pos integer;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_char from public.world_characters
  where user_id=v_uid and character_status='active' limit 1;
  if not found then raise exception 'active_character_required'; end if;

  select * into v_loc from public.tgg_world_locations
  where location_key='corner-stage' and enabled=true limit 1;
  if not found then raise exception 'corner_stage_unavailable'; end if;

  if v_char.current_location_id is distinct from v_loc.id then
    raise exception 'corner_stage_location_required';
  end if;

  select * into v_presence from public.tgg_world_presence where user_id=v_uid limit 1;

  select * into v_event
  from public.tgg_world_open_mic_events
  where location_id=v_loc.id
    and instance_id is not distinct from v_presence.instance_id
    and event_status in ('open','performing')
  order by created_at desc
  limit 1;

  if not found then
    insert into public.tgg_world_open_mic_events(location_id,instance_id,event_status)
    values(v_loc.id,v_presence.instance_id,'open')
    returning * into v_event;
  end if;

  if exists(
    select 1 from public.tgg_world_open_mic_queue
    where event_id=v_event.id and user_id=v_uid and queue_status in ('waiting','performing')
  ) then
    select queue_position into v_pos
    from public.tgg_world_open_mic_queue
    where event_id=v_event.id and user_id=v_uid
    limit 1;
  else
    select coalesce(max(queue_position),0)+1 into v_pos
    from public.tgg_world_open_mic_queue
    where event_id=v_event.id;

    insert into public.tgg_world_open_mic_queue(
      event_id,user_id,character_id,queue_position,queue_status
    )
    values(v_event.id,v_uid,v_char.id,v_pos,'waiting');
  end if;

  return jsonb_build_object(
    'ok',true,'event_id',v_event.id,'queue_position',v_pos,
    'virtual_reward_only',true,'real_money',false
  );
end $$;

create or replace function public.tgg_world_open_mic_start_next(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_presence public.tgg_world_presence%rowtype;
  v_event public.tgg_world_open_mic_events%rowtype;
  v_queue public.tgg_world_open_mic_queue%rowtype;
  v_perf public.tgg_world_open_mic_performances%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_event from public.tgg_world_open_mic_events
  where id=p_event_id for update;
  if not found then raise exception 'open_mic_event_not_found'; end if;

  select * into v_presence from public.tgg_world_presence where user_id=v_uid limit 1;
  if v_presence.location_id is distinct from v_event.location_id then
    raise exception 'event_location_required';
  end if;

  if exists(
    select 1 from public.tgg_world_open_mic_performances
    where event_id=p_event_id and performance_status='live'
  ) then
    raise exception 'performance_already_live';
  end if;

  select * into v_queue
  from public.tgg_world_open_mic_queue
  where event_id=p_event_id and queue_status='waiting'
  order by queue_position
  limit 1
  for update;

  if not found then raise exception 'queue_empty'; end if;

  insert into public.tgg_world_open_mic_performances(
    event_id,user_id,character_id,performance_status
  )
  values(v_event.id,v_queue.user_id,v_queue.character_id,'live')
  returning * into v_perf;

  update public.tgg_world_open_mic_queue
  set queue_status='performing',updated_at=now()
  where id=v_queue.id;

  update public.tgg_world_open_mic_events
  set event_status='performing',current_performance=v_perf.id,updated_at=now()
  where id=v_event.id;

  return jsonb_build_object(
    'ok',true,'event_id',v_event.id,'performance_id',v_perf.id,
    'performer_user_id',v_perf.user_id,'virtual_reward_only',true,'real_money',false
  );
end $$;

create or replace function public.tgg_world_open_mic_react(
  p_performance_id uuid,
  p_reaction text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_reaction text := lower(trim(coalesce(p_reaction,'')));
  v_perf public.tgg_world_open_mic_performances%rowtype;
  v_event public.tgg_world_open_mic_events%rowtype;
  v_presence public.tgg_world_presence%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_reaction not in ('fire','clap','heart','star') then raise exception 'invalid_reaction'; end if;

  select * into v_perf from public.tgg_world_open_mic_performances
  where id=p_performance_id and performance_status='live';
  if not found then raise exception 'performance_not_live'; end if;

  select * into v_event from public.tgg_world_open_mic_events where id=v_perf.event_id;
  select * into v_presence from public.tgg_world_presence where user_id=v_uid limit 1;

  if v_presence.location_id is distinct from v_event.location_id then
    raise exception 'audience_location_required';
  end if;

  insert into public.tgg_world_open_mic_reactions(performance_id,user_id,reaction)
  values(p_performance_id,v_uid,v_reaction)
  on conflict(performance_id,user_id) do update
    set reaction=excluded.reaction,created_at=now();

  return jsonb_build_object('ok',true,'performance_id',p_performance_id,'reaction',v_reaction);
end $$;

create or replace function public.tgg_world_open_mic_finish(p_performance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_perf public.tgg_world_open_mic_performances%rowtype;
  v_reactions integer;
  v_xp integer;
  v_buzz integer;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select * into v_perf
  from public.tgg_world_open_mic_performances
  where id=p_performance_id
  for update;

  if not found then raise exception 'performance_not_found'; end if;
  if v_perf.user_id<>v_uid then raise exception 'performer_only'; end if;

  if v_perf.performance_status='complete' then
    return jsonb_build_object(
      'ok',true,'already_complete',true,'performance_id',v_perf.id,
      'xp',coalesce((v_perf.reward_detail->>'xp')::integer,0),
      'buzz',coalesce((v_perf.reward_detail->>'buzz')::integer,0),
      'real_money',false,'rights_effect',false
    );
  end if;

  if v_perf.performance_status<>'live' then raise exception 'performance_not_live'; end if;

  select count(*) into v_reactions
  from public.tgg_world_open_mic_reactions
  where performance_id=v_perf.id;

  v_xp := 25 + least(v_reactions,10)*2;
  v_buzz := 5 + least(v_reactions,10);

  insert into public.world_character_stats(character_id,stat_key,stat_value,updated_at)
  values(v_perf.character_id,'xp',v_xp,now())
  on conflict(character_id,stat_key) do update
  set stat_value=world_character_stats.stat_value+excluded.stat_value,updated_at=now();

  insert into public.world_character_stats(character_id,stat_key,stat_value,updated_at)
  values(v_perf.character_id,'buzz',v_buzz,now())
  on conflict(character_id,stat_key) do update
  set stat_value=world_character_stats.stat_value+excluded.stat_value,updated_at=now();

  update public.tgg_world_open_mic_performances
  set performance_status='complete',
      ended_at=now(),
      reward_applied=true,
      reward_detail=jsonb_build_object(
        'type','virtual_progression','xp',v_xp,'buzz',v_buzz,
        'real_money',false,'rights_effect',false
      )
  where id=v_perf.id;

  update public.tgg_world_open_mic_queue
  set queue_status='done',updated_at=now()
  where event_id=v_perf.event_id and user_id=v_uid and queue_status='performing';

  update public.tgg_world_open_mic_events
  set event_status='open',current_performance=null,updated_at=now()
  where id=v_perf.event_id;

  return jsonb_build_object(
    'ok',true,'already_complete',false,'performance_id',v_perf.id,
    'xp',v_xp,'buzz',v_buzz,'real_money',false,'rights_effect',false
  );
end $$;

revoke all on function public.tgg_world_studio_open(uuid) from public,anon;
revoke all on function public.tgg_world_studio_join(uuid,text) from public,anon;
revoke all on function public.tgg_world_studio_bundle(uuid) from public,anon;
revoke all on function public.tgg_world_open_mic_join_queue() from public,anon;
revoke all on function public.tgg_world_open_mic_start_next(uuid) from public,anon;
revoke all on function public.tgg_world_open_mic_react(uuid,text) from public,anon;
revoke all on function public.tgg_world_open_mic_finish(uuid) from public,anon;

grant execute on function public.tgg_world_studio_open(uuid) to authenticated;
grant execute on function public.tgg_world_studio_join(uuid,text) to authenticated;
grant execute on function public.tgg_world_studio_bundle(uuid) to authenticated;
grant execute on function public.tgg_world_open_mic_join_queue() to authenticated;
grant execute on function public.tgg_world_open_mic_start_next(uuid) to authenticated;
grant execute on function public.tgg_world_open_mic_react(uuid,text) to authenticated;
grant execute on function public.tgg_world_open_mic_finish(uuid) to authenticated;
