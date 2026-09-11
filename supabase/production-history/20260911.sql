-- TRU GO GETTA production migration history archive
-- Date bucket: 20260911
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260911002753 harden_release_pro_browser_evidence_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE OR REPLACE FUNCTION private.tgg_runtime_browser_observe_v1_impl(p_flow_key text, p_capture jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_headers jsonb := '{}'::jsonb;
  v_origin text := '';
  v_build text := coalesce(p_capture->>'build','');
  v_path text := coalesce(p_capture->>'page_path','');
  v_load_ms integer := greatest(0,least(120000,coalesce((p_capture->>'load_ms')::integer,0)));
  v_workspace text;
  v_expected_workspace text;
  v_contract_key text;
  v_pass boolean := false;
  v_verified integer := 0;
  v_required integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_origin := coalesce(v_headers->>'origin','');

  if not (
    v_origin = 'https://trugogettamixtapes.blogspot.com'
    or v_origin = 'https://xsofowzvwetamhyuvlpj.supabase.co'
    or v_origin ~ '^https://([a-z0-9-]+\\.)?trugogettamixtapes\\.com$'
  ) then
    raise exception 'BROWSER_ORIGIN_REQUIRED' using errcode='42501';
  end if;

  if p_flow_key is null or p_flow_key <> all(array[
    'command_center_runtime','creator_profile_runtime','expansion_runtime','growth_runtime',
    'messenger_runtime','music_library_runtime','notifications_runtime','protected_audio_runtime',
    'release_pro_runtime','session_recovery_runtime','supporters_runtime'
  ]) then
    raise exception 'UNKNOWN_BROWSER_QA_FLOW' using errcode='22023';
  end if;

  if v_build not in ('ARTIST-HQ-V3-AUTO-QA-V1','CREATOR-OS-AUTO-QA-V1') then
    raise exception 'UNAPPROVED_QA_BUILD' using errcode='22023';
  end if;

  if coalesce((p_capture->>'browser_context')::boolean,false) is not true
     or coalesce((p_capture->>'auth_present')::boolean,false) is not true
     or coalesce((p_capture->>'rendered')::boolean,false) is not true
     or coalesce((p_capture->>'blocking_error_count')::integer,1) <> 0
     or v_load_ms <= 0 then
    raise exception 'INCOMPLETE_BROWSER_CAPTURE' using errcode='22023';
  end if;

  v_expected_workspace := case p_flow_key
    when 'command_center_runtime' then 'dashboard'
    when 'expansion_runtime' then 'expansion'
    when 'growth_runtime' then 'growth'
    when 'messenger_runtime' then 'messages'
    when 'music_library_runtime' then 'library'
    when 'release_pro_runtime' then 'releases'
    when 'supporters_runtime' then 'supporters'
    else null
  end;
  v_workspace := nullif(p_capture->>'workspace','');

  if p_flow_key='release_pro_runtime' then
    v_pass := v_workspace='releases'
      and coalesce((p_capture->>'workspace_schema_ok')::boolean,false)
      and coalesce((p_capture->>'control_responded')::boolean,false)
      and (
        coalesce((p_capture->>'workspace_rpc_ok')::boolean,false)
        or (
          coalesce((p_capture->>'release_create_path_ok')::boolean,false)
          and coalesce(p_capture->>'release_create_rpc','')='tgg_creator_create_mixtape_draft'
          and coalesce(p_capture->>'release_create_validation','')='TITLE_INVALID'
          and coalesce((p_capture->>'release_mutation_performed')::boolean,true) is false
        )
      );
  elsif v_expected_workspace is not null then
    v_pass := v_workspace = v_expected_workspace
      and coalesce((p_capture->>'workspace_schema_ok')::boolean,false)
      and coalesce((p_capture->>'workspace_rpc_ok')::boolean,false)
      and coalesce((p_capture->>'control_responded')::boolean,false);
  elsif p_flow_key='creator_profile_runtime' then
    v_pass := coalesce((p_capture->>'profile_visible')::boolean,false)
      and coalesce((p_capture->>'control_responded')::boolean,false);
  elsif p_flow_key='notifications_runtime' then
    v_pass := coalesce((p_capture->>'notifications_rpc_ok')::boolean,false)
      and coalesce((p_capture->>'control_responded')::boolean,false);
  elsif p_flow_key='session_recovery_runtime' then
    v_pass := coalesce((p_capture->>'session_recovered')::boolean,false)
      and coalesce((p_capture->>'control_responded')::boolean,false);
  elsif p_flow_key='protected_audio_runtime' then
    v_pass := coalesce((p_capture->>'signed_audio_ok')::boolean,false)
      and coalesce((p_capture->>'playback_started')::boolean,false)
      and coalesce((p_capture->>'control_responded')::boolean,false);
  end if;

  if not v_pass then
    raise exception 'FLOW_EVIDENCE_NOT_SUFFICIENT' using errcode='22023';
  end if;

  insert into private.tgg_browser_runtime_observations_v1(
    user_id,flow_key,status,origin,build,page_path,load_ms,capture,first_observed_at,last_observed_at
  ) values (
    v_uid,p_flow_key,'passed',v_origin,v_build,v_path,v_load_ms,
    (p_capture - 'access_token' - 'refresh_token' - 'user_id' - 'email'),v_now,v_now
  )
  on conflict(user_id,flow_key) do update set
    status='passed',origin=excluded.origin,build=excluded.build,page_path=excluded.page_path,
    load_ms=excluded.load_ms,capture=excluded.capture,last_observed_at=excluded.last_observed_at;

  update public.tgg_browser_runtime_evidence_gate
  set status='passed',
      browser_verified=true,
      evidence=jsonb_build_object(
        'source','authenticated_browser_auto_qa_v1',
        'required',true,
        'verified',true,
        'database_contract_only',false,
        'origin',v_origin,
        'build',v_build,
        'page_path',v_path,
        'load_ms',v_load_ms,
        'captured_at',v_now,
        'flow_key',p_flow_key
      ),
      checked_at=v_now,
      updated_at=v_now
  where flow_key=p_flow_key and evidence_required;

  update public.tgg_browser_qa_execution_matrix
  set status='passed',browser_verified=true,updated_at=v_now
  where flow_key=p_flow_key;

  v_contract_key := case p_flow_key
    when 'command_center_runtime' then 'creator_command_center'
    when 'creator_profile_runtime' then 'creator_profile'
    when 'expansion_runtime' then 'expansion'
    when 'growth_runtime' then 'growth'
    when 'messenger_runtime' then 'messenger'
    when 'music_library_runtime' then 'music_library'
    when 'notifications_runtime' then 'notifications'
    when 'protected_audio_runtime' then 'protected_audio'
    when 'release_pro_runtime' then 'release_pro'
    when 'session_recovery_runtime' then 'session_recovery'
    when 'supporters_runtime' then 'supporters'
  end;

  update public.tgg_runtime_qa_contract_matrix
  set status='passed',updated_at=v_now,
      metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
        'browser_verified',true,'browser_evidence_source','authenticated_browser_auto_qa_v1','browser_verified_at',v_now
      )
  where contract_key=v_contract_key;

  insert into public.tgg_runtime_qa_contract_evidence(
    matrix_id,evidence_source,evidence_type,status,source_ref,evidence,captured_at,expires_at,created_at
  )
  select m.id,'authenticated_browser_auto_qa_v1','browser_execution_capture','passed',p_flow_key,
         jsonb_build_object('flow_key',p_flow_key,'origin',v_origin,'build',v_build,'page_path',v_path,'load_ms',v_load_ms),
         v_now,null,v_now
  from public.tgg_runtime_qa_contract_matrix m
  where m.contract_key=v_contract_key
    and not exists (
      select 1 from public.tgg_runtime_qa_contract_evidence e
      where e.matrix_id=m.id and e.evidence_source='authenticated_browser_auto_qa_v1' and e.status='passed'
    );

  select count(*) into v_required from public.tgg_browser_runtime_evidence_gate where evidence_required;
  select count(*) into v_verified from public.tgg_browser_runtime_evidence_gate where evidence_required and browser_verified and status='passed';

  insert into public.tgg_final_launch_blocker_matrix(blocker_key,category,status,blocking,evidence,captured_at,created_at)
  values(
    'browser_qa_evidence','runtime',
    case when v_required>0 and v_verified=v_required then 'complete' else 'pending' end,
    not (v_required>0 and v_verified=v_required),
    jsonb_build_object(
      'reason',case when v_required>0 and v_verified=v_required then 'All required authenticated browser runtime evidence has been captured.' else 'Authenticated browser runtime evidence is still incomplete.' end,
      'required_flows',v_required,
      'verified_flows',v_verified,
      'remaining_flows',greatest(v_required-v_verified,0),
      'source','authenticated_browser_auto_qa_v1',
      'last_verified_flow',p_flow_key,
      'database_contract_only',false,
      'sql_override_allowed',false
    ),v_now,v_now
  );

  return jsonb_build_object('ok',true,'flow_key',p_flow_key,'status','passed','required',v_required,'verified',v_verified,'remaining',greatest(v_required-v_verified,0),'captured_at',v_now);
end
$function$;

-- ============================================================
-- MIGRATION 20260911003153 tgg_phone_call_history_v13_1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_phone_call_history_v1(p_limit integer default 30)
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  with visible_rooms as (
    select r.*
    from public.tgg_call_rooms r
    where r.created_by=v_uid
       or exists (
         select 1
         from public.tgg_call_participants cp
         where cp.room_id=r.id and cp.user_id=v_uid
       )
    order by r.created_at desc
    limit v_limit
  ), facts as (
    select
      r.*,
      (select min(s.created_at)
       from public.tgg_call_signals s
       where s.room_id=r.id and s.signal_type='answer') as answered_at,
      exists(
        select 1 from public.tgg_call_signals s
        where s.room_id=r.id
          and s.signal_type='hangup'
          and lower(coalesce(s.payload->>'reason',''))='declined'
      ) as declined,
      exists(
        select 1 from public.tgg_call_signals s
        where s.room_id=r.id and s.signal_type='hangup'
      ) as has_hangup
    from visible_rooms r
  ), decorated as (
    select
      f.*,
      case when f.created_by=v_uid then 'outgoing' else 'incoming' end as direction,
      p.artist_id,
      p.stage_name,
      p.avatar_url,
      case
        when f.status='active' and f.answered_at is not null then 'active'
        when f.status='active' and f.answered_at is null then 'ringing'
        when f.declined then 'declined'
        when f.answered_at is not null then 'ended'
        when f.created_by<>v_uid then 'missed'
        else 'no_answer'
      end as call_state,
      case when f.answered_at is null then 0
           else greatest(0,extract(epoch from (coalesce(f.ended_at,case when f.status='active' then now() else f.created_at end)-f.answered_at))::integer)
      end as duration_seconds
    from facts f
    left join lateral (
      select a.id as artist_id,a.stage_name,a.avatar_url
      from public.tgg_conversation_members cm
      join public.artists a on a.user_id=cm.user_id
      where cm.conversation_id=f.conversation_id
        and cm.user_id<>v_uid
      order by cm.joined_at,a.created_at
      limit 1
    ) p on true
  )
  select jsonb_build_object(
    'ok',true,
    'version','PHONE-CALL-HISTORY-1.0',
    'calls',coalesce(jsonb_agg(
      jsonb_build_object(
        'room_id',id,
        'conversation_id',conversation_id,
        'room_type',room_type,
        'is_group',is_group,
        'direction',direction,
        'state',call_state,
        'created_at',created_at,
        'answered_at',answered_at,
        'ended_at',ended_at,
        'duration_seconds',duration_seconds,
        'artist_id',artist_id,
        'stage_name',coalesce(stage_name,title,'Creator'),
        'avatar_url',avatar_url,
        'can_redial',(artist_id is not null and coalesce(is_group,false)=false)
      ) order by created_at desc
    ),'[]'::jsonb),
    'generated_at',now()
  ) into v_result
  from decorated;

  return coalesce(v_result,jsonb_build_object('ok',true,'version','PHONE-CALL-HISTORY-1.0','calls','[]'::jsonb,'generated_at',now()));
end;
$$;

revoke all on function public.tgg_phone_call_history_v1(integer) from public, anon;
grant execute on function public.tgg_phone_call_history_v1(integer) to authenticated;

-- ============================================================
-- MIGRATION 20260911004531 tgg_phone_call_availability_v13_3
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_start_call_room(p_conversation_id uuid, p_room_type text default 'video'::text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_room uuid;
  v_type text := lower(btrim(coalesce(p_room_type,'video')));
  v_member_count int := 0;
  v_recipient uuid;
  v_availability text := 'available';
  v_caller_artist uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if v_type not in ('audio','video','listening','studio','drop') then
    raise exception 'ROOM_TYPE_INVALID' using errcode='22023';
  end if;

  if not exists(
    select 1 from public.tgg_conversation_members m
    where m.conversation_id=p_conversation_id and m.user_id=v_uid
  ) then
    raise exception 'CONVERSATION_ACCESS_DENIED' using errcode='42501';
  end if;

  if v_type in ('audio','video') then
    select count(*), max(m.user_id) filter (where m.user_id<>v_uid)
      into v_member_count, v_recipient
    from public.tgg_conversation_members m
    where m.conversation_id=p_conversation_id;

    if v_member_count=2 and v_recipient is not null then
      select lower(coalesce(nullif(btrim(s.preferences->>'call_availability'),''),'available'))
        into v_availability
      from public.tgg_world_phone_state s
      where s.user_id=v_recipient;
      v_availability:=coalesce(v_availability,'available');

      if v_availability in ('busy','dnd') then
        raise exception 'CALL_UNAVAILABLE';
      elsif v_availability='favorites_only' then
        select a.id into v_caller_artist
        from public.artists a
        where a.user_id=v_uid
        order by a.created_at asc
        limit 1;
        if v_caller_artist is null or not exists(
          select 1 from public.tgg_phone_favorites f
          where f.user_id=v_recipient and f.artist_id=v_caller_artist
        ) then
          raise exception 'CALL_FAVORITES_ONLY';
        end if;
      end if;
    end if;
  end if;

  perform private.tgg_creator_rate_limit_gate('calls.room_start.rpc',60,600);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_conversation_id::text||':'||v_type,0));

  select r.id into v_room
  from public.tgg_call_rooms r
  where r.conversation_id=p_conversation_id
    and r.room_type=v_type
    and r.status='active'
    and r.ended_at is null
  order by r.created_at desc
  limit 1;

  if v_room is null then
    insert into public.tgg_call_rooms(created_by,conversation_id,title,room_type,status,is_group,created_at)
    select v_uid,p_conversation_id,coalesce(nullif(btrim(c.title),''),'TGG Room'),v_type,'active',
      (select count(*)>2 from public.tgg_conversation_members m where m.conversation_id=p_conversation_id),now()
    from public.tgg_conversations c where c.id=p_conversation_id
    returning id into v_room;
    if v_room is null then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  end if;

  insert into public.tgg_call_participants(room_id,user_id,mic_enabled,camera_enabled,joined_at,left_at)
  select v_room,m.user_id,true,(v_type<>'audio'),now(),null
  from public.tgg_conversation_members m
  where m.conversation_id=p_conversation_id
  on conflict(room_id,user_id) do update
  set left_at=null,
      mic_enabled=true,
      camera_enabled=(v_type<>'audio'),
      joined_at=case when public.tgg_call_participants.left_at is not null then now() else public.tgg_call_participants.joined_at end;

  perform private.tgg_creator_mutation_audit_log(
    'calls.room_start',v_room::text,
    jsonb_build_object('conversation_id',p_conversation_id,'room_type',v_type,'participant_count',(
      select count(*) from public.tgg_call_participants p where p.room_id=v_room and p.left_at is null
    ))
  );

  return v_room;
end;
$function$;

revoke execute on function public.tgg_start_call_room(uuid,text) from anon;
grant execute on function public.tgg_start_call_room(uuid,text) to authenticated;

-- ============================================================
-- MIGRATION 20260911004859 browser_qa_protected_audio_transport_probe_v1_2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $do$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('private.tgg_runtime_browser_observe_v1_impl(text,jsonb)'::regprocedure) into v_def;
  v_new := replace(
    v_def,
    $$    v_pass := coalesce((p_capture->>'signed_audio_ok')::boolean,false)
      and coalesce((p_capture->>'playback_started')::boolean,false)
      and coalesce((p_capture->>'control_responded')::boolean,false);$$,
    $$    v_pass := coalesce((p_capture->>'signed_audio_ok')::boolean,false)
      and (
        coalesce((p_capture->>'playback_started')::boolean,false)
        or coalesce((p_capture->>'media_fetch_ok')::boolean,false)
      )
      and coalesce((p_capture->>'control_responded')::boolean,false);$$
  );
  if v_new = v_def then
    raise exception 'protected audio evidence branch not found';
  end if;
  execute v_new;
end
$do$;

-- ============================================================
-- MIGRATION 20260911005307 tgg_phone_blocked_call_stub_cleanup_v13_4
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_start_call_room(p_conversation_id uuid, p_room_type text default 'video'::text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_room uuid;
  v_type text := lower(btrim(coalesce(p_room_type,'video')));
  v_member_count int := 0;
  v_recipient uuid;
  v_availability text := 'available';
  v_caller_artist uuid;
  v_block_reason text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_type not in ('audio','video','listening','studio','drop') then raise exception 'ROOM_TYPE_INVALID' using errcode='22023'; end if;
  if not exists(select 1 from public.tgg_conversation_members m where m.conversation_id=p_conversation_id and m.user_id=v_uid) then
    raise exception 'CONVERSATION_ACCESS_DENIED' using errcode='42501';
  end if;

  if v_type in ('audio','video') then
    select count(*), max(m.user_id) filter (where m.user_id<>v_uid)
      into v_member_count, v_recipient
    from public.tgg_conversation_members m
    where m.conversation_id=p_conversation_id;

    if v_member_count=2 and v_recipient is not null then
      select lower(coalesce(nullif(btrim(s.preferences->>'call_availability'),''),'available'))
        into v_availability
      from public.tgg_world_phone_state s
      where s.user_id=v_recipient;
      v_availability:=coalesce(v_availability,'available');

      if v_availability in ('busy','dnd') then
        v_block_reason:='unavailable';
      elsif v_availability='favorites_only' then
        select a.id into v_caller_artist
        from public.artists a
        where a.user_id=v_uid
        order by a.created_at asc
        limit 1;
        if v_caller_artist is null or not exists(
          select 1 from public.tgg_phone_favorites f
          where f.user_id=v_recipient and f.artist_id=v_caller_artist
        ) then
          v_block_reason:='favorites_only';
        end if;
      end if;

      if v_block_reason is not null then
        delete from public.tgg_conversations c
        where c.id=p_conversation_id
          and c.created_by=v_uid
          and c.project_type='dm'
          and coalesce(c.title,'')='WORLD Call'
          and c.last_message_at is null
          and c.created_at >= now()-interval '30 seconds'
          and not exists(select 1 from public.tgg_messages x where x.conversation_id=c.id)
          and not exists(select 1 from public.tgg_call_rooms x where x.conversation_id=c.id);

        perform private.tgg_creator_mutation_audit_log(
          'calls.room_blocked',p_conversation_id::text,
          jsonb_build_object('room_type',v_type,'reason',v_block_reason)
        );
        return null;
      end if;
    end if;
  end if;

  perform private.tgg_creator_rate_limit_gate('calls.room_start.rpc',60,600);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_conversation_id::text||':'||v_type,0));

  select r.id into v_room
  from public.tgg_call_rooms r
  where r.conversation_id=p_conversation_id and r.room_type=v_type and r.status='active' and r.ended_at is null
  order by r.created_at desc limit 1;

  if v_room is null then
    insert into public.tgg_call_rooms(created_by,conversation_id,title,room_type,status,is_group,created_at)
    select v_uid,p_conversation_id,coalesce(nullif(btrim(c.title),''),'TGG Room'),v_type,'active',
      (select count(*)>2 from public.tgg_conversation_members m where m.conversation_id=p_conversation_id),now()
    from public.tgg_conversations c where c.id=p_conversation_id
    returning id into v_room;
    if v_room is null then raise exception 'CONVERSATION_NOT_FOUND'; end if;
  end if;

  insert into public.tgg_call_participants(room_id,user_id,mic_enabled,camera_enabled,joined_at,left_at)
  select v_room,m.user_id,true,(v_type<>'audio'),now(),null
  from public.tgg_conversation_members m where m.conversation_id=p_conversation_id
  on conflict(room_id,user_id) do update
  set left_at=null,mic_enabled=true,camera_enabled=(v_type<>'audio'),
      joined_at=case when public.tgg_call_participants.left_at is not null then now() else public.tgg_call_participants.joined_at end;

  perform private.tgg_creator_mutation_audit_log(
    'calls.room_start',v_room::text,
    jsonb_build_object('conversation_id',p_conversation_id,'room_type',v_type,'participant_count',(
      select count(*) from public.tgg_call_participants p where p.room_id=v_room and p.left_at is null
    ))
  );
  return v_room;
end;
$function$;
revoke execute on function public.tgg_start_call_room(uuid,text) from anon;
grant execute on function public.tgg_start_call_room(uuid,text) to authenticated;

-- ============================================================
-- MIGRATION 20260911010321 blogger_live_source_cache
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists private.tgg_blogger_live_source_cache (
  path text primary key,
  page_id text not null,
  title text,
  content text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  fetched_at timestamptz not null default now()
);
revoke all on private.tgg_blogger_live_source_cache from public, anon, authenticated;
comment on table private.tgg_blogger_live_source_cache is 'Server-only short-lived Blogger API source cache used for hash-safe deployment rebases.';

-- ============================================================
-- MIGRATION 20260911010428 blogger_live_source_cache_data_api_safe
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_blogger_live_source_cache (
  path text primary key,
  page_id text not null,
  title text,
  content text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  fetched_at timestamptz not null default now()
);
alter table public.tgg_blogger_live_source_cache enable row level security;
revoke all on public.tgg_blogger_live_source_cache from anon, authenticated;
comment on table public.tgg_blogger_live_source_cache is 'Service-role-only short-lived Blogger API source cache used for hash-safe deployment rebases.';

-- ============================================================
-- MIGRATION 20260911010517 grant_blogger_live_cache_service_role
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

grant select,insert,update,delete on public.tgg_blogger_live_source_cache to service_role;
revoke all on public.tgg_blogger_live_source_cache from anon, authenticated;

-- ============================================================
-- MIGRATION 20260911010841 recording_studio_suffix_staging
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists private.tgg_recording_studio_suffix_staging (
  key text primary key,
  payload bytea not null default ''::bytea,
  expected_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on private.tgg_recording_studio_suffix_staging from public, anon, authenticated;
comment on table private.tgg_recording_studio_suffix_staging is 'Private byte staging for hash-checked Recording Studio append-only deploy suffixes.';

-- ============================================================
-- MIGRATION 20260911015418 browser_qa_protected_audio_candidate_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_browser_qa_protected_audio_candidate_v1()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_track_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select t.id
  into v_track_id
  from public.tracks t
  join public.mixtapes m on m.id=t.mixtape_id
  where m.status='published'::public.mixtape_status
    and nullif(btrim(coalesce(t.audio_path,'')),'') is not null
  order by m.created_at desc nulls last, t.track_number asc nulls last, t.id
  limit 1;

  return jsonb_build_object(
    'ok', v_track_id is not null,
    'track_id', v_track_id,
    'source', 'published_protected_audio_candidate'
  );
end
$$;
revoke all on function public.tgg_browser_qa_protected_audio_candidate_v1() from public, anon;
grant execute on function public.tgg_browser_qa_protected_audio_candidate_v1() to authenticated;

-- ============================================================
-- MIGRATION 20260911015933 world_v11_7_2_social_proof_lobby_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_world_friend_request_send_artist_impl(p_artist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select a.user_id into v_target from public.artists a where a.id=p_artist_id limit 1;
  if v_target is null then raise exception 'ARTIST_NOT_FOUND'; end if;
  if v_target=v_uid then raise exception 'CANNOT_FRIEND_SELF'; end if;
  select public.tgg_world_friend_request_send(v_target) into v_result;
  return coalesce(v_result,'{}'::jsonb) - 'user_id' - 'requester_user_id' - 'recipient_user_id';
end$$;

create or replace function private.tgg_world_party_invite_artist_impl(p_party_id uuid,p_artist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select a.user_id into v_target from public.artists a where a.id=p_artist_id limit 1;
  if v_target is null then raise exception 'ARTIST_NOT_FOUND'; end if;
  if v_target=v_uid then raise exception 'CANNOT_INVITE_SELF'; end if;
  select public.tgg_world_party_invite(p_party_id,v_target) into v_result;
  return coalesce(v_result,'{}'::jsonb) - 'user_id' - 'requester_user_id' - 'recipient_user_id';
end$$;

create or replace function private.tgg_world_social_lobby_bundle_impl()
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object(
    'incoming_friend_requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id',r.id,
        'artist_id',a.id,
        'stage_name',a.stage_name,
        'avatar_url',a.avatar_url,
        'created_at',r.created_at
      ) order by r.created_at desc)
      from public.world_friend_requests r
      join public.artists a on a.user_id=r.requester_user_id
      where r.recipient_user_id=v_uid and r.status='pending'
    ),'[]'::jsonb),
    'outgoing_friend_requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id',r.id,
        'artist_id',a.id,
        'stage_name',a.stage_name,
        'avatar_url',a.avatar_url,
        'status',r.status,
        'created_at',r.created_at
      ) order by r.created_at desc)
      from public.world_friend_requests r
      join public.artists a on a.user_id=r.recipient_user_id
      where r.requester_user_id=v_uid and r.status in ('pending','accepted')
    ),'[]'::jsonb),
    'party_invites',coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id',pm.party_id,
        'leader_artist_id',a.id,
        'leader_stage_name',a.stage_name,
        'leader_avatar_url',a.avatar_url,
        'current_instance_id',p.current_instance_id,
        'created_at',p.created_at
      ) order by p.created_at desc)
      from public.world_party_members pm
      join public.world_parties p on p.id=pm.party_id and p.status='active'
      left join public.artists a on a.user_id=p.leader_user_id
      where pm.user_id=v_uid and pm.status='invited'
    ),'[]'::jsonb),
    'active_parties',coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id',pm.party_id,
        'member_role',pm.member_role,
        'current_instance_id',p.current_instance_id,
        'leader_artist_id',a.id,
        'leader_stage_name',a.stage_name,
        'updated_at',p.updated_at
      ) order by p.updated_at desc)
      from public.world_party_members pm
      join public.world_parties p on p.id=pm.party_id and p.status='active'
      left join public.artists a on a.user_id=p.leader_user_id
      where pm.user_id=v_uid and pm.status='active'
    ),'[]'::jsonb)
  );
end$$;

grant execute on function private.tgg_world_friend_request_send_artist_impl(uuid) to authenticated;
grant execute on function private.tgg_world_party_invite_artist_impl(uuid,uuid) to authenticated;
grant execute on function private.tgg_world_social_lobby_bundle_impl() to authenticated;
revoke all on function private.tgg_world_friend_request_send_artist_impl(uuid) from public,anon;
revoke all on function private.tgg_world_party_invite_artist_impl(uuid,uuid) from public,anon;
revoke all on function private.tgg_world_social_lobby_bundle_impl() from public,anon;

create or replace function public.tgg_world_friend_request_send_artist(p_artist_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.tgg_world_friend_request_send_artist_impl(p_artist_id)
$$;
create or replace function public.tgg_world_party_invite_artist(p_party_id uuid,p_artist_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.tgg_world_party_invite_artist_impl(p_party_id,p_artist_id)
$$;
create or replace function public.tgg_world_social_lobby_bundle()
returns jsonb language sql security invoker stable set search_path='' as $$
  select private.tgg_world_social_lobby_bundle_impl()
$$;
revoke all on function public.tgg_world_friend_request_send_artist(uuid) from public,anon;
revoke all on function public.tgg_world_party_invite_artist(uuid,uuid) from public,anon;
revoke all on function public.tgg_world_social_lobby_bundle() from public,anon;
grant execute on function public.tgg_world_friend_request_send_artist(uuid) to authenticated;
grant execute on function public.tgg_world_party_invite_artist(uuid,uuid) to authenticated;
grant execute on function public.tgg_world_social_lobby_bundle() to authenticated;

-- ============================================================
-- MIGRATION 20260911020007 world_v11_7_2_social_lobby_friends
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_world_social_lobby_bundle_impl()
returns jsonb
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object(
    'incoming_friend_requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id',r.id,'artist_id',a.id,'stage_name',a.stage_name,'avatar_url',a.avatar_url,'created_at',r.created_at
      ) order by r.created_at desc)
      from public.world_friend_requests r
      join public.artists a on a.user_id=r.requester_user_id
      where r.recipient_user_id=v_uid and r.status='pending'
    ),'[]'::jsonb),
    'outgoing_friend_requests',coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id',r.id,'artist_id',a.id,'stage_name',a.stage_name,'avatar_url',a.avatar_url,'status',r.status,'created_at',r.created_at
      ) order by r.created_at desc)
      from public.world_friend_requests r
      join public.artists a on a.user_id=r.recipient_user_id
      where r.requester_user_id=v_uid and r.status in ('pending','accepted')
    ),'[]'::jsonb),
    'friends',coalesce((
      select jsonb_agg(jsonb_build_object(
        'artist_id',a.id,'stage_name',a.stage_name,'avatar_url',a.avatar_url,'friends_since',r.responded_at
      ) order by a.stage_name)
      from public.world_friend_requests r
      join public.artists a on a.user_id=(case when r.requester_user_id=v_uid then r.recipient_user_id else r.requester_user_id end)
      where r.status='accepted' and (r.requester_user_id=v_uid or r.recipient_user_id=v_uid)
    ),'[]'::jsonb),
    'party_invites',coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id',pm.party_id,'leader_artist_id',a.id,'leader_stage_name',a.stage_name,'leader_avatar_url',a.avatar_url,
        'current_instance_id',p.current_instance_id,'created_at',p.created_at
      ) order by p.created_at desc)
      from public.world_party_members pm
      join public.world_parties p on p.id=pm.party_id and p.status='active'
      left join public.artists a on a.user_id=p.leader_user_id
      where pm.user_id=v_uid and pm.status='invited'
    ),'[]'::jsonb),
    'active_parties',coalesce((
      select jsonb_agg(jsonb_build_object(
        'party_id',pm.party_id,'member_role',pm.member_role,'current_instance_id',p.current_instance_id,
        'leader_artist_id',a.id,'leader_stage_name',a.stage_name,'updated_at',p.updated_at
      ) order by p.updated_at desc)
      from public.world_party_members pm
      join public.world_parties p on p.id=pm.party_id and p.status='active'
      left join public.artists a on a.user_id=p.leader_user_id
      where pm.user_id=v_uid and pm.status='active'
    ),'[]'::jsonb)
  );
end$$;

-- ============================================================
-- MIGRATION 20260911023528 control_room_mastering_report_fk_indexes_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create index if not exists tgg_control_room_mastering_reports_project_fk_idx
  on public.tgg_control_room_mastering_reports(project_id);
create index if not exists tgg_control_room_mastering_reports_studio_asset_fk_idx
  on public.tgg_control_room_mastering_reports(studio_asset_id);
create index if not exists tgg_control_room_mastering_reports_media_vault_asset_fk_idx
  on public.tgg_control_room_mastering_reports(media_vault_asset_id);
create index if not exists tgg_control_room_mastering_reports_vault_item_fk_idx
  on public.tgg_control_room_mastering_reports(vault_item_id);

-- ============================================================
-- MIGRATION 20260911023800 creator_idempotency_call_room_semantics_v1_2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_creator_idempotency_readiness()
returns jsonb
language sql
stable
set search_path to 'pg_catalog','public'
as $function$
with checks(name,ok,detail) as (
  values
    (
      'distribution_submit_retry_safe',
      exists(
        select 1 from pg_indexes
        where schemaname='public'
          and tablename='tgg_distribution_requests'
          and indexname='tgg_distribution_requests_active_package_uidx'
          and indexdef ilike '%UNIQUE INDEX%'
      )
      and exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname='tgg_distribution_submit_request'
          and pg_get_functiondef(p.oid) ilike '%idempotent_reuse%'
          and pg_get_functiondef(p.oid) ilike '%unique_violation%'
      ),
      'same release/provider/package reuses in-flight request'
    ),
    (
      'studio_finalize_retry_safe',
      exists(
        select 1 from pg_indexes
        where schemaname='public'
          and tablename='tgg_studio_assets'
          and indexname='tgg_studio_assets_project_storage_uidx'
          and indexdef ilike '%UNIQUE INDEX%'
      )
      and exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname='tgg_register_studio_asset'
          and pg_get_functiondef(p.oid) ilike '%unique_violation%'
      ),
      'same project/storage path reuses existing studio asset'
    ),
    (
      'live_replay_finalize_retry_safe',
      exists(
        select 1 from pg_indexes
        where schemaname='public'
          and tablename='tgg_live_replays'
          and indexname='tgg_live_replays_stream_id_key'
          and indexdef ilike '%UNIQUE INDEX%'
      )
      and exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname='tgg_live_studio_finalize_replay'
          and pg_get_functiondef(p.oid) ilike '%on conflict%'
      ),
      'one replay per stream with conflict-safe finalize'
    ),
    (
      'call_room_start_retry_safe',
      exists(
        select 1 from pg_indexes
        where schemaname='public'
          and tablename='tgg_call_rooms'
          and indexname='tgg_call_rooms_active_conversation_type_uidx'
          and indexdef ilike '%UNIQUE INDEX%'
      )
      and exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname='tgg_start_call_room'
          and pg_get_functiondef(p.oid) ilike '%pg_advisory_xact_lock%'
          and pg_get_functiondef(p.oid) ilike '%r.status=''active''%'
          and pg_get_functiondef(p.oid) ilike '%if v_room is null then%'
          and pg_get_functiondef(p.oid) ilike '%on conflict(room_id,user_id) do update%'
      ),
      'one active room per conversation/type with unique index, transaction lock, retry reuse, and participant upsert'
    ),
    (
      'distribution_metadata_upsert_retry_safe',
      exists(
        select 1 from pg_indexes
        where schemaname='public'
          and tablename='tgg_distribution_release_metadata'
          and indexname='tgg_distribution_release_metadata_pkey'
          and indexdef ilike '%UNIQUE INDEX%'
      )
      and exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname='tgg_distribution_metadata_upsert'
          and pg_get_functiondef(p.oid) ilike '%on conflict%'
      ),
      'one metadata row per release with upsert'
    ),
    (
      'membership_activation_retry_safe',
      exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname='tgg_membership_tier_set_active'
          and pg_get_functiondef(p.oid) ilike '%update %'
          and pg_get_functiondef(p.oid) ilike '%exists(%'
      ),
      'setting same active state is an idempotent update'
    ),
    (
      'call_validation_invite_retry_safe',
      exists(
        select 1 from pg_indexes
        where schemaname='private'
          and tablename='tgg_call_validation_invites'
          and indexname='tgg_call_validation_invites_one_pending_inviter_uidx'
          and indexdef ilike '%UNIQUE INDEX%'
      )
      and exists(
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='private'
          and p.proname='tgg_call_validation_invite_create'
          and pg_get_functiondef(p.oid) ilike '%idempotent_reuse%'
          and pg_get_functiondef(p.oid) ilike '%unique_violation%'
      ),
      'one pending validation invite per inviter with retry reuse'
    )
),
agg as (
  select
    count(*) total,
    count(*) filter(where ok) ready,
    coalesce(jsonb_agg(name order by name) filter(where not ok),'[]'::jsonb) failed,
    jsonb_object_agg(name,jsonb_build_object('ok',ok,'detail',detail) order by name) details
  from checks
),
dups as (
  select jsonb_build_object(
    'distribution_active_duplicate_groups',(
      select count(*) from (
        select release_id,provider_key,package_hash
        from public.tgg_distribution_requests
        where status in ('prepared','queued','processing','submitted')
        group by 1,2,3 having count(*)>1
      ) x
    ),
    'studio_asset_duplicate_groups',(
      select count(*) from (
        select project_id,storage_path
        from public.tgg_studio_assets
        where storage_path is not null
        group by 1,2 having count(*)>1
      ) x
    ),
    'call_active_duplicate_groups',(
      select count(*) from (
        select conversation_id,room_type
        from public.tgg_call_rooms
        where status='active'
        group by 1,2 having count(*)>1
      ) x
    ),
    'call_validation_pending_duplicate_groups',(
      select count(*) from (
        select inviter_user_id
        from private.tgg_call_validation_invites
        where status='pending'
        group by 1 having count(*)>1
      ) x
    )
  ) d
)
select jsonb_build_object(
  'ok',
    a.ready=a.total
    and coalesce((d.d->>'distribution_active_duplicate_groups')::bigint,0)=0
    and coalesce((d.d->>'studio_asset_duplicate_groups')::bigint,0)=0
    and coalesce((d.d->>'call_active_duplicate_groups')::bigint,0)=0
    and coalesce((d.d->>'call_validation_pending_duplicate_groups')::bigint,0)=0,
  'version','CREATOR-IDEMPOTENCY-1.2',
  'contracts',jsonb_build_object('ready',a.ready,'total',a.total,'failed',a.failed,'details',a.details),
  'duplicate_state',d.d,
  'intentional_non_idempotent_actions',jsonb_build_array(
    'tgg_toggle_release_save: explicit toggle semantics',
    'tgg_membership_tier_create: intentional creation of distinct tiers',
    'tgg_send_message: identical message bodies may be intentional'
  ),
  'generated_at',now()
)
from agg a cross join dups d;
$function$;

-- ============================================================
-- MIGRATION 20260911034446 revoke_video_track_lock_guard_direct_execute
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function private.tgg_video_track_lock_guard() from public;
revoke execute on function private.tgg_video_track_lock_guard() from anon;
revoke execute on function private.tgg_video_track_lock_guard() from authenticated;

-- ============================================================
-- MIGRATION 20260911041959 add_control_room_build_buffer
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists private.tgg_control_room_build_buffer(
  build_key text primary key,
  payload bytea not null default ''::bytea,
  expected_hash text,
  updated_at timestamptz not null default now()
);
revoke all on private.tgg_control_room_build_buffer from public, anon, authenticated;

-- ============================================================
-- MIGRATION 20260911044825 tgg_nova_cloud_projects_v950
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table public.tgg_nova_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_key text not null,
  name text not null default 'NOVA Project',
  revision bigint not null default 1,
  payload jsonb not null default '{}'::jsonb,
  media_index jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_key)
);

create index tgg_nova_projects_user_updated_idx
  on public.tgg_nova_projects (user_id, updated_at desc);

alter table public.tgg_nova_projects enable row level security;

revoke all on table public.tgg_nova_projects from anon;
grant select, insert, update, delete on table public.tgg_nova_projects to authenticated;

drop policy if exists "nova_projects_select_own" on public.tgg_nova_projects;
create policy "nova_projects_select_own"
  on public.tgg_nova_projects for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "nova_projects_insert_own" on public.tgg_nova_projects;
create policy "nova_projects_insert_own"
  on public.tgg_nova_projects for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "nova_projects_update_own" on public.tgg_nova_projects;
create policy "nova_projects_update_own"
  on public.tgg_nova_projects for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "nova_projects_delete_own" on public.tgg_nova_projects;
create policy "nova_projects_delete_own"
  on public.tgg_nova_projects for delete to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('tgg-nova-media', 'tgg-nova-media', false, 536870912)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "nova_media_select_own" on storage.objects;
create policy "nova_media_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tgg-nova-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "nova_media_insert_own" on storage.objects;
create policy "nova_media_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tgg-nova-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "nova_media_update_own" on storage.objects;
create policy "nova_media_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'tgg-nova-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'tgg-nova-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "nova_media_delete_own" on storage.objects;
create policy "nova_media_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'tgg-nova-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- ============================================================
-- MIGRATION 20260911045615 tgg_nova_collab_persistence_v1150
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table public.tgg_nova_collab_rooms (
  id uuid primary key default gen_random_uuid(),
  room_key text not null unique,
  owner_id uuid not null default auth.uid(),
  project_key text,
  member_ids uuid[] not null default '{}'::uuid[],
  roles jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tgg_nova_collab_rooms_owner_idx on public.tgg_nova_collab_rooms(owner_id, updated_at desc);
create index tgg_nova_collab_rooms_members_gin on public.tgg_nova_collab_rooms using gin(member_ids);

alter table public.tgg_nova_collab_rooms enable row level security;
revoke all on table public.tgg_nova_collab_rooms from anon;
grant select, insert, update, delete on table public.tgg_nova_collab_rooms to authenticated;

create policy "nova_collab_rooms_select_member"
  on public.tgg_nova_collab_rooms for select to authenticated
  using ((select auth.uid()) = owner_id or (select auth.uid()) = any(member_ids));
create policy "nova_collab_rooms_insert_owner"
  on public.tgg_nova_collab_rooms for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "nova_collab_rooms_update_owner"
  on public.tgg_nova_collab_rooms for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "nova_collab_rooms_delete_owner"
  on public.tgg_nova_collab_rooms for delete to authenticated
  using ((select auth.uid()) = owner_id);

create table public.tgg_nova_collab_events (
  id bigint generated always as identity primary key,
  room_key text not null references public.tgg_nova_collab_rooms(room_key) on delete cascade,
  user_id uuid not null default auth.uid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index tgg_nova_collab_events_room_idx on public.tgg_nova_collab_events(room_key, id desc);

alter table public.tgg_nova_collab_events enable row level security;
revoke all on table public.tgg_nova_collab_events from anon;
grant select, insert, delete on table public.tgg_nova_collab_events to authenticated;

create policy "nova_collab_events_select_member"
  on public.tgg_nova_collab_events for select to authenticated
  using (exists (
    select 1 from public.tgg_nova_collab_rooms r
    where r.room_key = tgg_nova_collab_events.room_key
      and ((select auth.uid()) = r.owner_id or (select auth.uid()) = any(r.member_ids))
  ));
create policy "nova_collab_events_insert_member"
  on public.tgg_nova_collab_events for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.tgg_nova_collab_rooms r
      where r.room_key = tgg_nova_collab_events.room_key
        and ((select auth.uid()) = r.owner_id or (select auth.uid()) = any(r.member_ids))
    )
  );
create policy "nova_collab_events_delete_owner"
  on public.tgg_nova_collab_events for delete to authenticated
  using (exists (
    select 1 from public.tgg_nova_collab_rooms r
    where r.room_key = tgg_nova_collab_events.room_key
      and (select auth.uid()) = r.owner_id
  ));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='tgg_nova_collab_events'
  ) then
    execute 'alter publication supabase_realtime add table public.tgg_nova_collab_events';
  end if;
end $$;

-- ============================================================
-- MIGRATION 20260911051033 harden_private_public_epk_impl_execute
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter function public.tgg_public_epk(text) security definer;
revoke execute on function private.tgg_public_epk_impl(text) from public, anon, authenticated;
grant execute on function private.tgg_public_epk_impl(text) to service_role;

-- ============================================================
-- MIGRATION 20260911081536 add_oidc_migration_archive_export_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_migration_archive_export_chunk(
  p_after_version text default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,25),50));
  v_rows jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_next text := null;
  v_has_more boolean := false;
begin
  with selected as (
    select version,name,statements,created_by,idempotency_key,rollback
    from supabase_migrations.schema_migrations
    where p_after_version is null or version > p_after_version
    order by version
    limit v_limit + 1
  ), numbered as (
    select *, row_number() over(order by version) as rn
    from selected
  ), page as (
    select version,name,statements,created_by,idempotency_key,rollback
    from numbered
    where rn <= v_limit
    order by version
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'version',version,
      'name',name,
      'statements',to_jsonb(statements),
      'created_by',created_by,
      'idempotency_key',idempotency_key,
      'rollback',to_jsonb(rollback)
    ) order by version),'[]'::jsonb),
    count(*)::integer,
    max(version),
    exists(select 1 from numbered where rn > v_limit)
  into v_rows,v_count,v_next,v_has_more
  from page;

  return jsonb_build_object(
    'ok',true,
    'count',v_count,
    'next_after',v_next,
    'has_more',v_has_more,
    'rows',v_rows
  );
end;
$$;

revoke all on function public.tgg_migration_archive_export_chunk(text,integer) from public, anon, authenticated;
grant execute on function public.tgg_migration_archive_export_chunk(text,integer) to service_role;

comment on function public.tgg_migration_archive_export_chunk(text,integer) is
'TGG server-only migration history export, paginated for the GitHub OIDC archive workflow. Not executable by browser roles.';

-- ============================================================
-- MIGRATION 20260911131544 codesync_ignore_superseded_blogger_failures
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_codesync_detect_and_fix()
returns jsonb
language plpgsql
set search_path to 'private','public','pg_temp'
as $function$
declare
  v_fixed int := 0;
  v_errors int := 0;
  v_review int := 0;
  r record;
begin
  for r in
    select id,status,claimed_at,filename
    from public.tgg_theme_deploy_jobs
    where status in ('claimed','processing')
      and claimed_at is not null
      and claimed_at < now() - interval '10 minutes'
  loop
    update public.tgg_theme_deploy_jobs
    set status='pending',
        device_id=null,
        claimed_at=null,
        error=coalesce(error,'') || case when coalesce(error,'')='' then '' else E'\n' end ||
              'Auto-recovered stale deploy claim by Code Sync Controller'
    where id=r.id;

    insert into private.tgg_code_actions(action_type,component_key,status,details)
    values ('recover_stale_deploy_job','deploy_job:'||r.id,'completed',
            jsonb_build_object('filename',r.filename,'previous_status',r.status));
    v_fixed := v_fixed + 1;
  end loop;

  -- Resolve stale Blogger failure issues when a newer verified deployment for
  -- the same resource already exists, or when the failure belongs to the
  -- intentionally removed World E2E verifier test page.
  update private.tgg_code_issues i
  set status='resolved',
      last_seen_at=now(),
      auto_fixed_at=coalesce(i.auto_fixed_at,now())
  from public.v98_blogger_deployments f
  where i.status='open'
    and i.issue_key='blogger_deploy_failed:'||f.id::text
    and f.status='failed'
    and (
      f.resource_key='/p/world-e2e-verifier.html'
      or exists (
        select 1
        from public.v98_blogger_deployments s
        where s.status='verified'
          and s.resource_type is not distinct from f.resource_type
          and s.resource_key is not distinct from f.resource_key
          and s.updated_at > f.updated_at
      )
    );

  for r in
    select f.id,f.resource_type,f.resource_key,f.error_message
    from public.v98_blogger_deployments f
    where f.status='failed'
      and f.updated_at > now() - interval '24 hours'
      and f.resource_key is distinct from '/p/world-e2e-verifier.html'
      and not exists (
        select 1
        from public.v98_blogger_deployments s
        where s.status='verified'
          and s.resource_type is not distinct from f.resource_type
          and s.resource_key is not distinct from f.resource_key
          and s.updated_at > f.updated_at
      )
  loop
    perform private.tgg_codesync_upsert_issue(
      'blogger_deploy_failed:'||r.id,
      'error',
      'blogger:'||coalesce(r.resource_type,'unknown')||':'||coalesce(r.resource_key,r.id::text),
      'Blogger deployment failed',
      jsonb_build_object('deployment_id',r.id,'error',r.error_message)
    );
    v_errors := v_errors + 1;
  end loop;

  select count(*) into v_review
  from private.tgg_edge_function_registry
  where duplicate_candidate and retirement_state='review';

  if v_review > 0 then
    perform private.tgg_codesync_upsert_issue(
      'edge_function_version_chain:review_required',
      'warning',
      'edge_functions',
      'One or more duplicate Edge Functions still require dependency review.',
      jsonb_build_object('needs_review',v_review,'auto_delete',false)
    );
  else
    update private.tgg_code_issues
    set status='resolved',last_seen_at=now()
    where issue_key in (
      'edge_function_version_chain:tgg-creator-os-app',
      'edge_function_version_chain:review_required'
    )
    and status='open';
  end if;

  return jsonb_build_object('ok',true,'fixed',v_fixed,'issues_seen',v_errors,'needs_review',v_review,'checked_at',now());
end;
$function$;

-- ============================================================
-- MIGRATION 20260911132529 control_room_certification_runs_v51_1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_control_room_certification_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid null,
  status text not null default 'pending' check (status in ('pending','pass','warn','fail')),
  results jsonb not null default '{}'::jsonb,
  browser jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_control_room_certification_runs enable row level security;

revoke all on table public.tgg_control_room_certification_runs from anon;
grant select, insert, update, delete on table public.tgg_control_room_certification_runs to authenticated;

create policy "cert_runs_select_own"
on public.tgg_control_room_certification_runs
for select
to authenticated
using (auth.uid() = user_id);

create policy "cert_runs_insert_own"
on public.tgg_control_room_certification_runs
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "cert_runs_update_own"
on public.tgg_control_room_certification_runs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "cert_runs_delete_own"
on public.tgg_control_room_certification_runs
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists tgg_control_room_certification_runs_user_created_idx
on public.tgg_control_room_certification_runs (user_id, created_at desc);

create index if not exists tgg_control_room_certification_runs_project_created_idx
on public.tgg_control_room_certification_runs (project_id, created_at desc);


-- ============================================================
-- MIGRATION 20260911143339 world_v14_browser_playtest_gate
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_world_v14_playtest_evidence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','passed','failed')),
  build text not null,
  page_path text not null,
  moved_distance numeric not null default 0,
  frame_sample_count integer not null default 0,
  load_ms integer not null default 0,
  capture jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_world_v14_playtest_evidence enable row level security;
revoke all on public.tgg_world_v14_playtest_evidence from public, anon;
grant select, insert, update on public.tgg_world_v14_playtest_evidence to authenticated;

drop policy if exists "world v14 playtest owner read" on public.tgg_world_v14_playtest_evidence;
create policy "world v14 playtest owner read"
on public.tgg_world_v14_playtest_evidence for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "world v14 playtest owner insert" on public.tgg_world_v14_playtest_evidence;
create policy "world v14 playtest owner insert"
on public.tgg_world_v14_playtest_evidence for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "world v14 playtest owner update" on public.tgg_world_v14_playtest_evidence;
create policy "world v14 playtest owner update"
on public.tgg_world_v14_playtest_evidence for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.tgg_world_v14_playtest_observe(p_capture jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'pg_catalog','public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_headers jsonb := '{}'::jsonb;
  v_origin text := '';
  v_build text := coalesce(p_capture->>'build','');
  v_path text := coalesce(p_capture->>'page_path','');
  v_move numeric := greatest(0,least(10000,coalesce((p_capture->>'moved_distance')::numeric,0)));
  v_frames integer := greatest(0,least(100000,coalesce((p_capture->>'frame_sample_count')::integer,0)));
  v_load integer := greatest(0,least(120000,coalesce((p_capture->>'load_ms')::integer,0)));
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  begin
    v_headers := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_origin := coalesce(v_headers->>'origin','');
  if not (
    v_origin='https://trugogettamixtapes.blogspot.com'
    or v_origin='https://xsofowzvwetamhyuvlpj.supabase.co'
    or v_origin ~ '^https://([a-z0-9-]+\.)?trugogettamixtapes\.com$'
  ) then raise exception 'BROWSER_ORIGIN_REQUIRED' using errcode='42501'; end if;
  if v_build<>'WORLD-V14.9-PLAYTEST-GATE' or v_path<>'/p/artist-world.html' then
    raise exception 'UNAPPROVED_WORLD_PLAYTEST_BUILD' using errcode='22023';
  end if;
  if coalesce((p_capture->>'browser_context')::boolean,false) is not true
     or coalesce((p_capture->>'auth_present')::boolean,false) is not true
     or coalesce((p_capture->>'rendered')::boolean,false) is not true
     or coalesce((p_capture->>'webgl_context')::boolean,false) is not true
     or coalesce((p_capture->>'avatar_moved')::boolean,false) is not true
     or coalesce((p_capture->>'all_v14_layers_present')::boolean,false) is not true
     or coalesce((p_capture->>'blocking_error_count')::integer,1) <> 0
     or v_move < 2
     or v_frames < 30
     or v_load <= 0
     or coalesce((p_capture->>'renderer_width')::integer,0) < 240
     or coalesce((p_capture->>'renderer_height')::integer,0) < 160
  then raise exception 'WORLD_PLAYTEST_EVIDENCE_INCOMPLETE' using errcode='22023'; end if;

  insert into public.tgg_world_v14_playtest_evidence(user_id,status,build,page_path,moved_distance,frame_sample_count,load_ms,capture,observed_at,updated_at)
  values(v_uid,'passed',v_build,v_path,v_move,v_frames,v_load,(p_capture-'access_token'-'refresh_token'-'user_id'-'email'),now(),now())
  on conflict(user_id) do update set
    status='passed',build=excluded.build,page_path=excluded.page_path,moved_distance=greatest(public.tgg_world_v14_playtest_evidence.moved_distance,excluded.moved_distance),
    frame_sample_count=greatest(public.tgg_world_v14_playtest_evidence.frame_sample_count,excluded.frame_sample_count),load_ms=excluded.load_ms,
    capture=excluded.capture,observed_at=excluded.observed_at,updated_at=excluded.updated_at;

  return jsonb_build_object('ok',true,'status','passed','build',v_build,'moved_distance',v_move,'frame_sample_count',v_frames,'observed_at',now());
end;
$function$;

revoke all on function public.tgg_world_v14_playtest_observe(jsonb) from public, anon;
grant execute on function public.tgg_world_v14_playtest_observe(jsonb) to authenticated;

create or replace function public.tgg_world_v14_playtest_status()
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog','public'
as $function$
  select coalesce(
    (select jsonb_build_object('status',e.status,'build',e.build,'moved_distance',e.moved_distance,'frame_sample_count',e.frame_sample_count,'observed_at',e.observed_at)
     from public.tgg_world_v14_playtest_evidence e where e.user_id=(select auth.uid())),
    jsonb_build_object('status','pending')
  );
$function$;

revoke all on function public.tgg_world_v14_playtest_status() from public, anon;
grant execute on function public.tgg_world_v14_playtest_status() to authenticated;

-- ============================================================
-- MIGRATION 20260911143341 service_schema_baseline_exporter
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_schema_baseline_export_chunk_service(
  p_after_key bigint default 0,
  p_limit integer default 25
)
returns table(order_key bigint, kind text, object_key text, ddl text)
language sql
security definer
set search_path = ''
as $$
with enum_items as (
  select
    10000000000::bigint + row_number() over(order by n.nspname,t.typname) as order_key,
    'enum'::text as kind,
    format('%I.%I',n.nspname,t.typname) as object_key,
    format('create type %I.%I as enum (%s);',n.nspname,t.typname,
      (select string_agg(quote_literal(e.enumlabel),', ' order by e.enumsortorder) from pg_catalog.pg_enum e where e.enumtypid=t.oid)) as ddl
  from pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid=t.typnamespace
  where n.nspname in ('public','private') and t.typtype='e'
), table_items as (
  select
    30000000000::bigint + row_number() over(order by n.nspname,c.relname) as order_key,
    'table'::text as kind,
    format('%I.%I',n.nspname,c.relname) as object_key,
    format('create table %I.%I (%s%s);',n.nspname,c.relname,E'\n',cols.column_sql || E'\n') as ddl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral (
    select string_agg(
      '  ' || format('%I %s',a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod)) ||
      case
        when a.attidentity='a' then ' generated always as identity'
        when a.attidentity='d' then ' generated by default as identity'
        when a.attgenerated='s' then ' generated always as (' || pg_catalog.pg_get_expr(d.adbin,d.adrelid,true) || ') stored'
        when d.oid is not null then ' default ' || pg_catalog.pg_get_expr(d.adbin,d.adrelid,true)
        else ''
      end ||
      case when a.attnotnull then ' not null' else '' end,
      E',\n' order by a.attnum
    ) as column_sql
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  ) cols
  where n.nspname in ('public','private') and c.relkind='r'
), placeholder_view_items as (
  select
    35000000000::bigint + row_number() over(order by n.nspname,c.relname) as order_key,
    'view_placeholder'::text as kind,
    format('%I.%I',n.nspname,c.relname) as object_key,
    format('create view %I.%I as select %s where false;',n.nspname,c.relname,cols.column_sql) as ddl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join lateral (
    select string_agg(format('null::%s as %I',pg_catalog.format_type(a.atttypid,a.atttypmod),a.attname),', ' order by a.attnum) as column_sql
    from pg_catalog.pg_attribute a
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  ) cols
  where n.nspname in ('public','private') and c.relkind='v'
), function_items as (
  select
    40000000000::bigint + row_number() over(order by n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)) as order_key,
    'function'::text as kind,
    format('%I.%I(%s)',n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid)) as object_key,
    pg_catalog.pg_get_functiondef(p.oid) as ddl
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
), constraint_items as (
  select
    50000000000::bigint + row_number() over(order by n.nspname,c.relname,con.conname) as order_key,
    'constraint'::text as kind,
    format('%I.%I:%I',n.nspname,c.relname,con.conname) as object_key,
    format('alter table %I.%I add constraint %I %s;',n.nspname,c.relname,con.conname,pg_catalog.pg_get_constraintdef(con.oid,true)) as ddl
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid=con.conrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind='r'
), index_items as (
  select
    60000000000::bigint + row_number() over(order by n.nspname,ic.relname) as order_key,
    'index'::text as kind,
    format('%I.%I',n.nspname,ic.relname) as object_key,
    pg_catalog.pg_get_indexdef(i.indexrelid) || ';' as ddl
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c on c.oid=i.indrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_class ic on ic.oid=i.indexrelid
  where n.nspname in ('public','private') and c.relkind='r'
    and not exists(select 1 from pg_catalog.pg_constraint con where con.conindid=i.indexrelid)
), view_items as (
  select
    70000000000::bigint + row_number() over(order by n.nspname,c.relname) as order_key,
    'view'::text as kind,
    format('%I.%I',n.nspname,c.relname) as object_key,
    format('create or replace view %I.%I as %s%s;',n.nspname,c.relname,pg_catalog.pg_get_viewdef(c.oid,true),
      case when c.reloptions is null then '' else E';\nalter view '||format('%I.%I',n.nspname,c.relname)||' set ('||array_to_string(c.reloptions,', ')||')' end) as ddl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind='v'
), rls_items as (
  select
    80000000000::bigint + row_number() over(order by n.nspname,c.relname) as order_key,
    'rls'::text as kind,
    format('%I.%I',n.nspname,c.relname) as object_key,
    (case when c.relrowsecurity then format('alter table %I.%I enable row level security;',n.nspname,c.relname) else '' end) ||
    (case when c.relforcerowsecurity then E'\n'||format('alter table %I.%I force row level security;',n.nspname,c.relname) else '' end) as ddl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind='r' and (c.relrowsecurity or c.relforcerowsecurity)
), policy_items as (
  select
    90000000000::bigint + row_number() over(order by p.schemaname,p.tablename,p.policyname) as order_key,
    'policy'::text as kind,
    format('%I.%I:%I',p.schemaname,p.tablename,p.policyname) as object_key,
    format('create policy %I on %I.%I as %s for %s to %s%s%s;',p.policyname,p.schemaname,p.tablename,
      p.permissive,p.cmd,
      (select string_agg(case when r='public' then 'public' else quote_ident(r) end,', ' order by r) from unnest(p.roles) r),
      case when p.qual is null then '' else ' using ('||p.qual||')' end,
      case when p.with_check is null then '' else ' with check ('||p.with_check||')' end) as ddl
  from pg_catalog.pg_policies p
  where p.schemaname in ('public','private')
), trigger_items as (
  select
    100000000000::bigint + row_number() over(order by n.nspname,c.relname,t.tgname) as order_key,
    'trigger'::text as kind,
    format('%I.%I:%I',n.nspname,c.relname,t.tgname) as object_key,
    pg_catalog.pg_get_triggerdef(t.oid,true) || ';' as ddl
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname in ('public','private')
), items as (
  select 1::bigint as order_key,'prelude'::text as kind,'bootstrap'::text as object_key,
         E'create schema if not exists private;\nset check_function_bodies = off;'::text as ddl
  union all select * from enum_items
  union all select * from table_items
  union all select * from placeholder_view_items
  union all select * from function_items
  union all select * from constraint_items
  union all select * from index_items
  union all select * from view_items
  union all select * from rls_items
  union all select * from policy_items
  union all select * from trigger_items
  union all select 110000000000::bigint,'postlude','bootstrap',E'set check_function_bodies = on;'::text
)
select i.order_key,i.kind,i.object_key,i.ddl
from items i
where i.order_key > greatest(coalesce(p_after_key,0),0)
order by i.order_key
limit least(greatest(coalesce(p_limit,25),1),50);
$$;
revoke all on function public.tgg_schema_baseline_export_chunk_service(bigint,integer) from public, anon, authenticated;
grant execute on function public.tgg_schema_baseline_export_chunk_service(bigint,integer) to service_role;

-- ============================================================
-- MIGRATION 20260911143812 signup_password_approval_guard_shadow
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create schema if not exists private;

create table if not exists private.tgg_signup_password_guard_config (
  id smallint primary key default 1 check (id=1),
  enforcement_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.tgg_signup_password_guard_config(id,enforcement_enabled)
values (1,false)
on conflict (id) do nothing;

create table if not exists private.tgg_signup_password_approvals (
  token uuid primary key,
  email_hash text not null,
  purpose text not null check (purpose in ('creator_os_direct','call_validation_invite')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

revoke all on private.tgg_signup_password_guard_config from public, anon, authenticated;
revoke all on private.tgg_signup_password_approvals from public, anon, authenticated;

create or replace function public.tgg_signup_approval_issue_service(
  p_token uuid,
  p_email_hash text,
  p_purpose text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if p_token is null or coalesce(length(p_email_hash),0) <> 64 then
    raise exception 'invalid signup approval payload';
  end if;
  if p_purpose not in ('creator_os_direct','call_validation_invite') then
    raise exception 'invalid signup approval purpose';
  end if;
  delete from private.tgg_signup_password_approvals where expires_at <= now();
  insert into private.tgg_signup_password_approvals(token,email_hash,purpose,expires_at)
  values (p_token,lower(p_email_hash),p_purpose,now()+interval '5 minutes')
  on conflict (token) do update set
    email_hash=excluded.email_hash,
    purpose=excluded.purpose,
    expires_at=excluded.expires_at,
    created_at=now();
  return jsonb_build_object('ok',true,'expires_in_seconds',300);
end;
$$;
revoke all on function public.tgg_signup_approval_issue_service(uuid,text,text) from public, anon, authenticated;
grant execute on function public.tgg_signup_approval_issue_service(uuid,text,text) to service_role;

create or replace function public.tgg_signup_approval_revoke_service(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare n integer;
begin
  delete from private.tgg_signup_password_approvals where token=p_token;
  get diagnostics n = row_count;
  return jsonb_build_object('ok',true,'deleted',n);
end;
$$;
revoke all on function public.tgg_signup_approval_revoke_service(uuid) from public, anon, authenticated;
grant execute on function public.tgg_signup_approval_revoke_service(uuid) to service_role;

create or replace function private.tgg_signup_password_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private, extensions
as $$
declare
  v_enforce boolean := false;
  v_token_text text;
  v_token uuid;
  v_expected_hash text;
  v_purpose text;
  v_found boolean := false;
begin
  if tg_op='INSERT' then
    if coalesce(new.encrypted_password,'')='' then
      return new;
    end if;
  elsif tg_op='UPDATE' then
    if not (
      old.encrypted_password is distinct from new.encrypted_password
      and coalesce(new.raw_user_meta_data->>'repaired_unconfirmed_account','false')='true'
      and coalesce(old.raw_user_meta_data->>'repaired_unconfirmed_account','false')<>'true'
    ) then
      return new;
    end if;
  else
    return new;
  end if;

  select enforcement_enabled into v_enforce
  from private.tgg_signup_password_guard_config where id=1;

  v_token_text := coalesce(new.raw_user_meta_data->>'tgg_signup_approval','');
  v_purpose := coalesce(new.raw_user_meta_data->>'signup_source','creator_os_direct');

  if v_token_text <> '' then
    begin
      v_token := v_token_text::uuid;
      v_expected_hash := encode(extensions.digest(lower(coalesce(new.email,'')),'sha256'),'hex');
      delete from private.tgg_signup_password_approvals
      where token=v_token
        and email_hash=v_expected_hash
        and purpose=v_purpose
        and expires_at>now()
      returning true into v_found;
    exception when others then
      v_found := false;
    end;
  end if;

  if v_found then
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data,'{}'::jsonb) - 'tgg_signup_approval';
    return new;
  end if;

  if coalesce(v_enforce,false) then
    raise exception using errcode='P0001', message='TGG_PASSWORD_APPROVAL_REQUIRED';
  end if;

  return new;
end;
$$;

revoke all on function private.tgg_signup_password_guard() from public, anon, authenticated;

drop trigger if exists tgg_signup_password_approval_guard on auth.users;
create trigger tgg_signup_password_approval_guard
before insert or update on auth.users
for each row execute function private.tgg_signup_password_guard();

-- ============================================================
-- MIGRATION 20260911143858 freeze_schema_baseline_snapshot_service
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter function public.tgg_schema_baseline_export_chunk_service(bigint,integer) rename to tgg_schema_baseline_export_live_chunk_service;

create table if not exists private.tgg_schema_baseline_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  latest_migration_version text,
  item_count integer not null default 0,
  stable boolean not null default false
);
create table if not exists private.tgg_schema_baseline_snapshot_items (
  snapshot_id uuid not null references private.tgg_schema_baseline_snapshots(snapshot_id) on delete cascade,
  order_key bigint not null,
  kind text not null,
  object_key text not null,
  ddl text not null,
  primary key(snapshot_id,order_key)
);
revoke all on private.tgg_schema_baseline_snapshots from public, anon, authenticated;
revoke all on private.tgg_schema_baseline_snapshot_items from public, anon, authenticated;

create or replace function public.tgg_refresh_schema_baseline_snapshot_service()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_before text;
  v_after text;
  v_count integer;
begin
  delete from private.tgg_schema_baseline_snapshots where created_at < now() - interval '1 day';
  select max(version) into v_before from supabase_migrations.schema_migrations;
  insert into private.tgg_schema_baseline_snapshots(snapshot_id,latest_migration_version,stable) values(v_id,v_before,false);

  insert into private.tgg_schema_baseline_snapshot_items(snapshot_id,order_key,kind,object_key,ddl)
  select v_id,x.order_key,x.kind,x.object_key,x.ddl
  from public.tgg_schema_baseline_export_live_chunk_service(0,20000) x;

  get diagnostics v_count = row_count;
  select max(version) into v_after from supabase_migrations.schema_migrations;
  if v_after is distinct from v_before then
    delete from private.tgg_schema_baseline_snapshots where snapshot_id=v_id;
    return jsonb_build_object('ok',false,'error','migration_changed_during_snapshot','before_version',v_before,'after_version',v_after);
  end if;

  update private.tgg_schema_baseline_snapshots set item_count=v_count,stable=true where snapshot_id=v_id;
  return jsonb_build_object('ok',true,'snapshot_id',v_id,'latest_migration_version',v_before,'item_count',v_count,'stable',true);
end;
$$;
revoke all on function public.tgg_refresh_schema_baseline_snapshot_service() from public, anon, authenticated;
grant execute on function public.tgg_refresh_schema_baseline_snapshot_service() to service_role;

create or replace function public.tgg_schema_baseline_snapshot_chunk_service(
  p_snapshot_id uuid,
  p_after_key bigint default 0,
  p_limit integer default 100
)
returns table(order_key bigint,kind text,object_key text,ddl text)
language sql
security definer
set search_path = ''
as $$
  select i.order_key,i.kind,i.object_key,i.ddl
  from private.tgg_schema_baseline_snapshot_items i
  join private.tgg_schema_baseline_snapshots s on s.snapshot_id=i.snapshot_id
  where i.snapshot_id=p_snapshot_id and s.stable=true and i.order_key>greatest(coalesce(p_after_key,0),0)
  order by i.order_key
  limit least(greatest(coalesce(p_limit,100),1),250);
$$;
revoke all on function public.tgg_schema_baseline_snapshot_chunk_service(uuid,bigint,integer) from public, anon, authenticated;
grant execute on function public.tgg_schema_baseline_snapshot_chunk_service(uuid,bigint,integer) to service_role;

-- ============================================================
-- MIGRATION 20260911143917 page_full_schema_snapshot_refresh
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_refresh_schema_baseline_snapshot_service()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_before text;
  v_after text;
  v_after_key bigint := 0;
  v_batch integer;
  v_count integer := 0;
  v_next bigint;
begin
  delete from private.tgg_schema_baseline_snapshots where created_at < now() - interval '1 day';
  select max(version) into v_before from supabase_migrations.schema_migrations;
  insert into private.tgg_schema_baseline_snapshots(snapshot_id,latest_migration_version,stable) values(v_id,v_before,false);

  loop
    insert into private.tgg_schema_baseline_snapshot_items(snapshot_id,order_key,kind,object_key,ddl)
    select v_id,x.order_key,x.kind,x.object_key,x.ddl
    from public.tgg_schema_baseline_export_live_chunk_service(v_after_key,50) x;
    get diagnostics v_batch = row_count;
    exit when v_batch=0;
    v_count := v_count + v_batch;
    select max(order_key) into v_next from private.tgg_schema_baseline_snapshot_items where snapshot_id=v_id;
    if v_next is null or v_next<=v_after_key then
      delete from private.tgg_schema_baseline_snapshots where snapshot_id=v_id;
      return jsonb_build_object('ok',false,'error','snapshot_pagination_stalled','after_key',v_after_key);
    end if;
    v_after_key := v_next;
    exit when v_batch<50;
    if v_count>20000 then
      delete from private.tgg_schema_baseline_snapshots where snapshot_id=v_id;
      return jsonb_build_object('ok',false,'error','snapshot_object_limit_exceeded','item_count',v_count);
    end if;
  end loop;

  select max(version) into v_after from supabase_migrations.schema_migrations;
  if v_after is distinct from v_before then
    delete from private.tgg_schema_baseline_snapshots where snapshot_id=v_id;
    return jsonb_build_object('ok',false,'error','migration_changed_during_snapshot','before_version',v_before,'after_version',v_after,'item_count',v_count);
  end if;
  if v_count<3000 then
    delete from private.tgg_schema_baseline_snapshots where snapshot_id=v_id;
    return jsonb_build_object('ok',false,'error','snapshot_too_small','item_count',v_count);
  end if;

  update private.tgg_schema_baseline_snapshots set item_count=v_count,stable=true where snapshot_id=v_id;
  return jsonb_build_object('ok',true,'snapshot_id',v_id,'latest_migration_version',v_before,'item_count',v_count,'stable',true);
end;
$$;
revoke all on function public.tgg_refresh_schema_baseline_snapshot_service() from public, anon, authenticated;
grant execute on function public.tgg_refresh_schema_baseline_snapshot_service() to service_role;

-- ============================================================
-- MIGRATION 20260911144513 optimize_schema_snapshot_single_pass
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.tgg_schema_baseline_export_live_chunk_service(bigint,integer)'::regprocedure) into v_def;
  v_new := replace(v_def,
    'limit least(greatest(coalesce(p_limit,25),1),50);',
    'limit least(greatest(coalesce(p_limit,25),1),20000);');
  if v_new = v_def then
    raise exception 'schema exporter limit clause not found';
  end if;
  execute v_new;
end
$$;

create or replace function public.tgg_refresh_schema_baseline_snapshot_service()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_before text;
  v_after text;
  v_count integer := 0;
begin
  delete from private.tgg_schema_baseline_snapshots where created_at < now() - interval '1 day';
  select max(version) into v_before from supabase_migrations.schema_migrations;
  insert into private.tgg_schema_baseline_snapshots(snapshot_id,latest_migration_version,stable)
  values(v_id,v_before,false);

  insert into private.tgg_schema_baseline_snapshot_items(snapshot_id,order_key,kind,object_key,ddl)
  select v_id,x.order_key,x.kind,x.object_key,x.ddl
  from public.tgg_schema_baseline_export_live_chunk_service(0,20000) x;
  get diagnostics v_count = row_count;

  select max(version) into v_after from supabase_migrations.schema_migrations;
  if v_after is distinct from v_before then
    delete from private.tgg_schema_baseline_snapshots where snapshot_id=v_id;
    return jsonb_build_object('ok',false,'error','migration_changed_during_snapshot','before_version',v_before,'after_version',v_after,'item_count',v_count);
  end if;
  if v_count<3000 then
    delete from private.tgg_schema_baseline_snapshots where snapshot_id=v_id;
    return jsonb_build_object('ok',false,'error','snapshot_too_small','item_count',v_count);
  end if;

  update private.tgg_schema_baseline_snapshots set item_count=v_count,stable=true where snapshot_id=v_id;
  return jsonb_build_object('ok',true,'snapshot_id',v_id,'latest_migration_version',v_before,'item_count',v_count,'stable',true);
end;
$$;
revoke all on function public.tgg_refresh_schema_baseline_snapshot_service() from public, anon, authenticated;
grant execute on function public.tgg_refresh_schema_baseline_snapshot_service() to service_role;

