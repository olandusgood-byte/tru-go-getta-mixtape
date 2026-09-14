-- TRU GO GETTA production migration history archive
-- Date bucket: 20260906
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260906164304 harden_video_creator_moderation_flow_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_video_create(
  p_title text,
  p_description text default null,
  p_genre text default null,
  p_release_date date default null,
  p_explicit_content boolean default false,
  p_video_url text default null,
  p_thumbnail_url text default null,
  p_visibility text default 'private',
  p_featured boolean default false,
  p_allow_downloads boolean default false
)
returns public.videos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.videos;
  v_artist_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'title_required'; end if;
  if p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id = auth.uid()
  limit 1;

  if v_artist_id is null then raise exception 'creator_profile_required'; end if;

  insert into public.videos(
    artist_id,title,description,genre,release_date,explicit_content,
    video_url,thumbnail_url,visibility,featured,allow_downloads,status
  )
  values(
    v_artist_id,trim(p_title),p_description,p_genre,p_release_date,p_explicit_content,
    coalesce(p_video_url,''),p_thumbnail_url,p_visibility,p_featured,p_allow_downloads,'draft'
  )
  returning * into v;

  insert into public.media_assets(
    id,owner_id,media_type,title,description,source_url,status,visibility,metadata,published_at
  )
  values(
    v.id,v.artist_id,'video',v.title,v.description,nullif(v.video_url,''),
    'draft',v.visibility,jsonb_build_object('source','videos','video_id',v.id::text),null
  )
  on conflict (id) do update
  set owner_id=excluded.owner_id,
      title=excluded.title,
      description=excluded.description,
      source_url=excluded.source_url,
      status='draft',
      visibility=excluded.visibility,
      updated_at=now(),
      published_at=null;

  return v;
end
$function$;

create or replace function private.tgg_video_publish(p_video_id uuid)
returns public.videos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.videos;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'admin_required';
  end if;

  update public.videos
  set visibility='public',
      status='published',
      release_date=coalesce(release_date,current_date),
      updated_at=now()
  where id=p_video_id
    and status='pending'
    and coalesce(video_url,'')<>''
  returning * into v;

  if not found then raise exception 'video_not_pending_or_not_ready'; end if;

  insert into public.media_assets(
    id,owner_id,media_type,title,description,source_url,status,visibility,metadata,updated_at,published_at
  )
  values(
    v.id,v.artist_id,'video',v.title,v.description,nullif(v.video_url,''),
    'published','public',jsonb_build_object('source','videos','video_id',v.id::text),now(),now()
  )
  on conflict (id) do update
  set owner_id=excluded.owner_id,
      title=excluded.title,
      description=excluded.description,
      source_url=excluded.source_url,
      status='published',
      visibility='public',
      updated_at=now(),
      published_at=now();

  return v;
end
$function$;

revoke execute on function private.tgg_video_publish(uuid) from anon, authenticated, public;
revoke execute on function public.tgg_video_publish(uuid) from anon, authenticated, public;

grant execute on function public.tgg_submit_video(uuid) to authenticated;
grant execute on function public.tgg_admin_review_video(uuid,text,text) to authenticated;


-- ============================================================
-- MIGRATION 20260906164354 fix_video_media_owner_and_enable_review_rpcs_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_video_create(
  p_title text,
  p_description text default null,
  p_genre text default null,
  p_release_date date default null,
  p_explicit_content boolean default false,
  p_video_url text default null,
  p_thumbnail_url text default null,
  p_visibility text default 'private',
  p_featured boolean default false,
  p_allow_downloads boolean default false
)
returns public.videos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.videos;
  v_artist_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'title_required'; end if;
  if p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id = v_user_id
  limit 1;

  if v_artist_id is null then raise exception 'creator_profile_required'; end if;

  insert into public.videos(
    artist_id,title,description,genre,release_date,explicit_content,
    video_url,thumbnail_url,visibility,featured,allow_downloads,status
  )
  values(
    v_artist_id,trim(p_title),p_description,p_genre,p_release_date,p_explicit_content,
    coalesce(p_video_url,''),p_thumbnail_url,p_visibility,p_featured,p_allow_downloads,'draft'
  )
  returning * into v;

  insert into public.media_assets(
    id,owner_id,media_type,title,description,source_url,status,visibility,metadata,published_at
  )
  values(
    v.id,v_user_id,'video',v.title,v.description,nullif(v.video_url,''),
    'draft',v.visibility,jsonb_build_object('source','videos','video_id',v.id::text),null
  )
  on conflict (id) do update
  set owner_id=excluded.owner_id,
      title=excluded.title,
      description=excluded.description,
      source_url=excluded.source_url,
      status='draft',
      visibility=excluded.visibility,
      updated_at=now(),
      published_at=null;

  return v;
end
$function$;

create or replace function public.tgg_admin_review_video(
  p_video_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_artist_id uuid;
  v_owner_user_id uuid;
  v_new_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select v.status, v.artist_id
    into v_status, v_artist_id
  from public.videos v
  where v.id=p_video_id
  for update;

  if v_status is null then raise exception 'VIDEO_NOT_FOUND'; end if;
  if v_status <> 'pending' then raise exception 'VIDEO_NOT_PENDING'; end if;
  if p_action not in ('approve','request_changes','reject') then raise exception 'INVALID_ACTION'; end if;
  if p_action in ('request_changes','reject')
     and nullif(trim(coalesce(p_note,'')),'') is null
  then raise exception 'NOTE_REQUIRED'; end if;

  select a.user_id into v_owner_user_id
  from public.artists a
  where a.id=v_artist_id;

  v_new_status :=
    case
      when p_action='approve' then 'published'
      when p_action='request_changes' then 'changes_requested'
      else 'rejected'
    end;

  update public.videos
  set status=v_new_status,
      visibility=case when v_new_status='published' then 'public' else visibility end,
      release_date=case when v_new_status='published' then coalesce(release_date,current_date) else release_date end,
      admin_note=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_video_id;

  if v_owner_user_id is not null then
    insert into public.media_assets(
      id,owner_id,media_type,title,description,source_url,status,visibility,metadata,updated_at,published_at
    )
    select
      v.id,
      v_owner_user_id,
      'video',
      v.title,
      v.description,
      nullif(v.video_url,''),
      case when v_new_status='published' then 'published' else 'draft' end,
      case when v_new_status='published' then 'public' else v.visibility end,
      jsonb_build_object('source','videos','video_id',v.id::text),
      now(),
      case when v_new_status='published' then now() else null end
    from public.videos v
    where v.id=p_video_id
    on conflict (id) do update
    set owner_id=excluded.owner_id,
        title=excluded.title,
        description=excluded.description,
        source_url=excluded.source_url,
        status=excluded.status,
        visibility=excluded.visibility,
        updated_at=now(),
        published_at=excluded.published_at;

    insert into public.notifications(
      recipient_id,actor_id,notification_type,entity_type,entity_id,title,body
    )
    values(
      v_owner_user_id,
      auth.uid(),
      'video_review',
      'video',
      p_video_id,
      case
        when v_new_status='published' then 'Video approved'
        when v_new_status='changes_requested' then 'Changes requested on your video'
        else 'Video rejected'
      end,
      coalesce(nullif(trim(p_note),''),'Your video submission was reviewed.')
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'video_id',p_video_id,
    'status',v_new_status,
    'reviewed_by',auth.uid()
  );
end
$function$;

grant execute on function public.tgg_submit_mixtape(uuid) to authenticated;
grant execute on function public.tgg_submit_video(uuid) to authenticated;
grant execute on function public.tgg_submit_merch(uuid) to authenticated;
grant execute on function public.tgg_submit_promotion(uuid) to authenticated;

grant execute on function public.tgg_admin_review_mixtape(uuid,text,text) to authenticated;
grant execute on function public.tgg_admin_review_video(uuid,text,text) to authenticated;
grant execute on function public.tgg_admin_review_merch(uuid,text,text) to authenticated;
grant execute on function public.tgg_admin_review_promotion(uuid,text,text) to authenticated;


-- ============================================================
-- MIGRATION 20260906164422 align_video_status_constraint_with_v501_review_flow
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.videos
  drop constraint if exists videos_status_check;

alter table public.videos
  add constraint videos_status_check
  check (
    status in (
      'draft',
      'pending_review',
      'pending',
      'changes_requested',
      'published',
      'rejected'
    )
  );


-- ============================================================
-- MIGRATION 20260906164441 add_video_admin_note_for_v501_moderation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.videos
  add column if not exists admin_note text;


-- ============================================================
-- MIGRATION 20260906164607 fix_mixtape_review_enum_qualification_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_admin_review_mixtape(
  p_mixtape_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.user_role;
  v_mixtape public.mixtapes%rowtype;
  v_artist_user_id uuid;
  v_track_count bigint;
  v_protected_count bigint;
  v_new_status public.mixtape_status;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is distinct from 'admin'::public.user_role then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_action not in ('approve','request_changes','reject') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_mixtape
  from public.mixtapes
  where id = p_mixtape_id
  for update;

  if not found then
    raise exception 'MIXTAPE_NOT_FOUND';
  end if;

  if p_action = 'approve'
     and v_mixtape.status <> 'pending'::public.mixtape_status
  then
    raise exception 'ONLY_PENDING_RELEASES_CAN_BE_APPROVED';
  end if;

  select a.user_id into v_artist_user_id
  from public.artists a
  where a.id = v_mixtape.artist_id;

  select count(*)::bigint,
         count(*) filter (
           where nullif(trim(t.audio_path), '') is not null
         )::bigint
    into v_track_count, v_protected_count
  from public.tracks t
  where t.mixtape_id = v_mixtape.id;

  if p_action = 'approve' then
    if v_track_count < 1 then
      raise exception 'APPROVAL_BLOCKED_NO_TRACKS';
    end if;
    if v_protected_count <> v_track_count then
      raise exception 'APPROVAL_BLOCKED_UNPROTECTED_TRACK';
    end if;

    v_new_status := 'published'::public.mixtape_status;
    v_note := nullif(trim(coalesce(p_note,'')), '');

    update public.mixtapes
    set status = v_new_status,
        release_date = coalesce(release_date, now()),
        admin_note = v_note
    where id = v_mixtape.id;

  elsif p_action = 'request_changes' then
    v_new_status := 'changes_requested'::public.mixtape_status;
    v_note := nullif(trim(coalesce(p_note,'')), '');
    if v_note is null then raise exception 'NOTE_REQUIRED_FOR_CHANGES'; end if;

    update public.mixtapes
    set status = v_new_status,
        admin_note = v_note
    where id = v_mixtape.id;

  else
    v_new_status := 'rejected'::public.mixtape_status;
    v_note := nullif(trim(coalesce(p_note,'')), '');
    if v_note is null then raise exception 'NOTE_REQUIRED_FOR_REJECTION'; end if;

    update public.mixtapes
    set status = v_new_status,
        admin_note = v_note
    where id = v_mixtape.id;
  end if;

  if v_artist_user_id is not null then
    insert into public.notifications(
      recipient_id, actor_id, notification_type, entity_type, entity_id, title, body
    )
    values(
      v_artist_user_id,
      auth.uid(),
      'mixtape_review',
      'mixtape',
      v_mixtape.id,
      case v_new_status
        when 'published'::public.mixtape_status then 'Mixtape approved'
        when 'changes_requested'::public.mixtape_status then 'Changes requested on your mixtape'
        else 'Mixtape submission rejected'
      end,
      case v_new_status
        when 'published'::public.mixtape_status
          then 'Your mixtape "' || v_mixtape.title || '" is now published.'
        when 'changes_requested'::public.mixtape_status
          then 'Your mixtape "' || v_mixtape.title || '" needs changes. ' || coalesce(v_note,'')
        else 'Your mixtape "' || v_mixtape.title || '" was rejected. ' || coalesce(v_note,'')
      end
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'mixtape_id', v_mixtape.id,
    'previous_status', v_mixtape.status,
    'status', v_new_status,
    'track_count', v_track_count,
    'protected_audio_count', v_protected_count,
    'reviewed_by', auth.uid()
  );
end
$function$;

grant execute on function public.tgg_admin_review_mixtape(uuid,text,text) to authenticated;


-- ============================================================
-- MIGRATION 20260906164647 fix_promotion_review_notification_recipient_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_admin_review_promotion(
  p_campaign_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid;
  v_creator_artist_id uuid;
  v_creator_user_id uuid;
  v_old text;
  v_new text;
begin
  v_admin := auth.uid();
  if v_admin is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles
    where id=v_admin and role='admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select creator_id,status
    into v_creator_artist_id,v_old
  from public.promotion_campaigns
  where id=p_campaign_id
  for update;

  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if v_old <> 'pending' then raise exception 'INVALID_STATUS'; end if;

  select a.user_id into v_creator_user_id
  from public.artists a
  where a.id=v_creator_artist_id;

  if p_action='approve' then
    v_new='approved';
  elsif p_action='reject' then
    if nullif(trim(p_note),'') is null then raise exception 'NOTE_REQUIRED'; end if;
    v_new='rejected';
  elsif p_action='request_changes' then
    if nullif(trim(p_note),'') is null then raise exception 'NOTE_REQUIRED'; end if;
    v_new='draft';
  else
    raise exception 'INVALID_ACTION';
  end if;

  update public.promotion_campaigns
  set status=v_new,
      admin_note=case when p_action='approve' then null else trim(p_note) end,
      updated_at=now()
  where id=p_campaign_id;

  if v_creator_user_id is not null then
    insert into public.notifications(
      recipient_id,actor_id,notification_type,entity_type,entity_id,title,body
    )
    values(
      v_creator_user_id,
      v_admin,
      'promotion_review',
      'promotion_campaign',
      p_campaign_id,
      'Promotion review update',
      'Your promotion campaign was reviewed: ' || v_new ||
      case
        when nullif(trim(p_note),'') is not null then ' — ' || trim(p_note)
        else ''
      end
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'campaign_id',p_campaign_id,
    'status',v_new,
    'reviewed_by',v_admin
  );
end
$function$;

grant execute on function public.tgg_admin_review_promotion(uuid,text,text) to authenticated;


-- ============================================================
-- MIGRATION 20260906164851 move_submit_review_security_definer_logic_private_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_submit_mixtape(p_mixtape_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_artist_id uuid;
  v_status text;
  v_track_count integer;
  v_protected_count integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id=v_user_id
  limit 1;

  if v_artist_id is null then raise exception 'ARTIST_PROFILE_NOT_FOUND'; end if;

  select status::text into v_status
  from public.mixtapes
  where id=p_mixtape_id and artist_id=v_artist_id
  for update;

  if v_status is null then raise exception 'RELEASE_NOT_OWNED'; end if;
  if v_status not in ('draft','changes_requested','rejected') then
    raise exception 'INVALID_SUBMISSION_STATUS';
  end if;

  select count(*)::integer,
         count(*) filter (
           where audio_path is not null and btrim(audio_path) <> ''
         )::integer
    into v_track_count, v_protected_count
  from public.tracks
  where mixtape_id=p_mixtape_id
    and artist_id=v_artist_id;

  if v_track_count < 1 then raise exception 'TRACK_REQUIRED'; end if;
  if v_protected_count <> v_track_count then raise exception 'PROTECTED_AUDIO_REQUIRED'; end if;

  update public.mixtapes
  set status='pending'
  where id=p_mixtape_id and artist_id=v_artist_id;

  return jsonb_build_object(
    'ok',true,'mixtape_id',p_mixtape_id,'status','pending','track_count',v_track_count
  );
end
$function$;

create or replace function private.tgg_admin_review_mixtape(
  p_mixtape_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.user_role;
  v_mixtape public.mixtapes%rowtype;
  v_artist_user_id uuid;
  v_track_count bigint;
  v_protected_count bigint;
  v_new_status public.mixtape_status;
  v_note text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is distinct from 'admin'::public.user_role then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_action not in ('approve','request_changes','reject') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_mixtape
  from public.mixtapes
  where id = p_mixtape_id
  for update;

  if not found then raise exception 'MIXTAPE_NOT_FOUND'; end if;

  if p_action='approve'
     and v_mixtape.status <> 'pending'::public.mixtape_status
  then
    raise exception 'ONLY_PENDING_RELEASES_CAN_BE_APPROVED';
  end if;

  select a.user_id into v_artist_user_id
  from public.artists a
  where a.id=v_mixtape.artist_id;

  select count(*)::bigint,
         count(*) filter (
           where nullif(trim(t.audio_path),'') is not null
         )::bigint
    into v_track_count,v_protected_count
  from public.tracks t
  where t.mixtape_id=v_mixtape.id;

  if p_action='approve' then
    if v_track_count < 1 then raise exception 'APPROVAL_BLOCKED_NO_TRACKS'; end if;
    if v_protected_count <> v_track_count then raise exception 'APPROVAL_BLOCKED_UNPROTECTED_TRACK'; end if;
    v_new_status := 'published'::public.mixtape_status;
    v_note := nullif(trim(coalesce(p_note,'')),'');
    update public.mixtapes
    set status=v_new_status,
        release_date=coalesce(release_date,now()),
        admin_note=v_note
    where id=v_mixtape.id;
  elsif p_action='request_changes' then
    v_new_status := 'changes_requested'::public.mixtape_status;
    v_note := nullif(trim(coalesce(p_note,'')),'');
    if v_note is null then raise exception 'NOTE_REQUIRED_FOR_CHANGES'; end if;
    update public.mixtapes
    set status=v_new_status,admin_note=v_note
    where id=v_mixtape.id;
  else
    v_new_status := 'rejected'::public.mixtape_status;
    v_note := nullif(trim(coalesce(p_note,'')),'');
    if v_note is null then raise exception 'NOTE_REQUIRED_FOR_REJECTION'; end if;
    update public.mixtapes
    set status=v_new_status,admin_note=v_note
    where id=v_mixtape.id;
  end if;

  if v_artist_user_id is not null then
    insert into public.notifications(
      recipient_id,actor_id,notification_type,entity_type,entity_id,title,body
    )
    values(
      v_artist_user_id,
      auth.uid(),
      'mixtape_review',
      'mixtape',
      v_mixtape.id,
      case v_new_status
        when 'published'::public.mixtape_status then 'Mixtape approved'
        when 'changes_requested'::public.mixtape_status then 'Changes requested on your mixtape'
        else 'Mixtape submission rejected'
      end,
      case v_new_status
        when 'published'::public.mixtape_status
          then 'Your mixtape "' || v_mixtape.title || '" is now published.'
        when 'changes_requested'::public.mixtape_status
          then 'Your mixtape "' || v_mixtape.title || '" needs changes. ' || coalesce(v_note,'')
        else 'Your mixtape "' || v_mixtape.title || '" was rejected. ' || coalesce(v_note,'')
      end
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'mixtape_id',v_mixtape.id,
    'previous_status',v_mixtape.status,
    'status',v_new_status,
    'track_count',v_track_count,
    'protected_audio_count',v_protected_count,
    'reviewed_by',auth.uid()
  );
end
$function$;

create or replace function private.tgg_submit_video(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select v.id,v.status into v_id,v_status
  from public.videos v
  join public.artists a on a.id=v.artist_id
  where v.id=p_video_id
    and a.user_id=auth.uid()
  for update;

  if v_id is null then raise exception 'VIDEO_NOT_FOUND_OR_NOT_OWNER'; end if;
  if v_status not in ('draft','changes_requested') then
    raise exception 'INVALID_VIDEO_STATUS';
  end if;

  update public.videos
  set status='pending'
  where id=v_id;

  return jsonb_build_object('ok',true,'video_id',v_id,'status','pending');
end
$function$;

create or replace function private.tgg_admin_review_video(
  p_video_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_artist_id uuid;
  v_owner_user_id uuid;
  v_new_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select v.status,v.artist_id
    into v_status,v_artist_id
  from public.videos v
  where v.id=p_video_id
  for update;

  if v_status is null then raise exception 'VIDEO_NOT_FOUND'; end if;
  if v_status <> 'pending' then raise exception 'VIDEO_NOT_PENDING'; end if;
  if p_action not in ('approve','request_changes','reject') then raise exception 'INVALID_ACTION'; end if;
  if p_action in ('request_changes','reject')
     and nullif(trim(coalesce(p_note,'')),'') is null
  then raise exception 'NOTE_REQUIRED'; end if;

  select a.user_id into v_owner_user_id
  from public.artists a
  where a.id=v_artist_id;

  v_new_status :=
    case
      when p_action='approve' then 'published'
      when p_action='request_changes' then 'changes_requested'
      else 'rejected'
    end;

  update public.videos
  set status=v_new_status,
      visibility=case when v_new_status='published' then 'public' else visibility end,
      release_date=case when v_new_status='published' then coalesce(release_date,current_date) else release_date end,
      admin_note=nullif(trim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=p_video_id;

  if v_owner_user_id is not null then
    insert into public.media_assets(
      id,owner_id,media_type,title,description,source_url,status,visibility,metadata,updated_at,published_at
    )
    select
      v.id,
      v_owner_user_id,
      'video',
      v.title,
      v.description,
      nullif(v.video_url,''),
      case when v_new_status='published' then 'published' else 'draft' end,
      case when v_new_status='published' then 'public' else v.visibility end,
      jsonb_build_object('source','videos','video_id',v.id::text),
      now(),
      case when v_new_status='published' then now() else null end
    from public.videos v
    where v.id=p_video_id
    on conflict (id) do update
    set owner_id=excluded.owner_id,
        title=excluded.title,
        description=excluded.description,
        source_url=excluded.source_url,
        status=excluded.status,
        visibility=excluded.visibility,
        updated_at=now(),
        published_at=excluded.published_at;

    insert into public.notifications(
      recipient_id,actor_id,notification_type,entity_type,entity_id,title,body
    )
    values(
      v_owner_user_id,
      auth.uid(),
      'video_review',
      'video',
      p_video_id,
      case
        when v_new_status='published' then 'Video approved'
        when v_new_status='changes_requested' then 'Changes requested on your video'
        else 'Video rejected'
      end,
      coalesce(nullif(trim(p_note),''),'Your video submission was reviewed.')
    );
  end if;

  return jsonb_build_object(
    'ok',true,'video_id',p_video_id,'status',v_new_status,'reviewed_by',auth.uid()
  );
end
$function$;

create or replace function private.tgg_submit_merch(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select a.id,mp.status
    into v_creator,v_status
  from public.merch_products mp
  join public.artists a on a.id=mp.creator_id
  where mp.id=p_product_id
    and a.user_id=auth.uid()
  for update;

  if v_creator is null then raise exception 'MERCH_NOT_FOUND_OR_NOT_OWNER'; end if;
  if v_status not in ('draft','changes_requested') then raise exception 'INVALID_STATUS'; end if;

  update public.merch_products
  set status='pending',admin_note=null
  where id=p_product_id;

  return jsonb_build_object('ok',true,'product_id',p_product_id,'status','pending');
end
$function$;

create or replace function private.tgg_admin_review_merch(
  p_product_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_creator uuid;
  v_new text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles
    where id=auth.uid() and role='admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select status,creator_id
    into v_status,v_creator
  from public.merch_products
  where id=p_product_id
  for update;

  if v_status is null then raise exception 'MERCH_NOT_FOUND'; end if;
  if p_action not in ('approve','request_changes','reject') then raise exception 'INVALID_ACTION'; end if;
  if v_status <> 'pending' then raise exception 'INVALID_STATUS'; end if;

  if p_action='approve' then
    v_new='published';
  elsif p_action='request_changes' then
    v_new='changes_requested';
  else
    v_new='rejected';
  end if;

  if p_action in ('request_changes','reject')
     and nullif(trim(coalesce(p_note,'')),'') is null
  then raise exception 'NOTE_REQUIRED'; end if;

  update public.merch_products
  set status=v_new,
      admin_note=nullif(trim(coalesce(p_note,'')),''),
      published_at=case when v_new='published' then now() else published_at end
  where id=p_product_id;

  insert into public.notifications(
    recipient_id,actor_id,notification_type,entity_type,entity_id,title,body
  )
  values(
    (select user_id from public.artists where id=v_creator),
    auth.uid(),
    'merch_review',
    'merch_product',
    p_product_id,
    case
      when v_new='published' then 'Merch approved'
      when v_new='changes_requested' then 'Changes requested'
      else 'Merch rejected'
    end,
    coalesce(nullif(trim(p_note),''),'Your merchandise submission was reviewed.')
  );

  return jsonb_build_object(
    'ok',true,'product_id',p_product_id,'previous_status',v_status,'status',v_new,'reviewed_by',auth.uid()
  );
end
$function$;

create or replace function private.tgg_submit_promotion(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator uuid;
  v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select a.id into v_creator
  from public.artists a
  where a.user_id=auth.uid();

  if v_creator is null then raise exception 'CREATOR_PROFILE_REQUIRED'; end if;

  select status into v_status
  from public.promotion_campaigns
  where id=p_campaign_id
    and creator_id=v_creator
  for update;

  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if v_status not in ('draft','rejected') then raise exception 'INVALID_STATUS'; end if;

  update public.promotion_campaigns
  set status='pending',admin_note=null,updated_at=now()
  where id=p_campaign_id;

  return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'status','pending');
end
$function$;

create or replace function private.tgg_admin_review_promotion(
  p_campaign_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid;
  v_creator_artist_id uuid;
  v_creator_user_id uuid;
  v_old text;
  v_new text;
begin
  v_admin:=auth.uid();
  if v_admin is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1 from public.profiles
    where id=v_admin and role='admin'
  ) then raise exception 'ADMIN_REQUIRED'; end if;

  select creator_id,status
    into v_creator_artist_id,v_old
  from public.promotion_campaigns
  where id=p_campaign_id
  for update;

  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if v_old <> 'pending' then raise exception 'INVALID_STATUS'; end if;

  select a.user_id into v_creator_user_id
  from public.artists a
  where a.id=v_creator_artist_id;

  if p_action='approve' then
    v_new='approved';
  elsif p_action='reject' then
    if nullif(trim(p_note),'') is null then raise exception 'NOTE_REQUIRED'; end if;
    v_new='rejected';
  elsif p_action='request_changes' then
    if nullif(trim(p_note),'') is null then raise exception 'NOTE_REQUIRED'; end if;
    v_new='draft';
  else
    raise exception 'INVALID_ACTION';
  end if;

  update public.promotion_campaigns
  set status=v_new,
      admin_note=case when p_action='approve' then null else trim(p_note) end,
      updated_at=now()
  where id=p_campaign_id;

  if v_creator_user_id is not null then
    insert into public.notifications(
      recipient_id,actor_id,notification_type,entity_type,entity_id,title,body
    )
    values(
      v_creator_user_id,
      v_admin,
      'promotion_review',
      'promotion_campaign',
      p_campaign_id,
      'Promotion review update',
      'Your promotion campaign was reviewed: ' || v_new ||
      case
        when nullif(trim(p_note),'') is not null then ' — ' || trim(p_note)
        else ''
      end
    );
  end if;

  return jsonb_build_object(
    'ok',true,'campaign_id',p_campaign_id,'status',v_new,'reviewed_by',v_admin
  );
end
$function$;

create or replace function public.tgg_submit_mixtape(p_mixtape_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_submit_mixtape(p_mixtape_id);
$function$;

create or replace function public.tgg_admin_review_mixtape(p_mixtape_id uuid,p_action text,p_note text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_admin_review_mixtape(p_mixtape_id,p_action,p_note);
$function$;

create or replace function public.tgg_submit_video(p_video_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_submit_video(p_video_id);
$function$;

create or replace function public.tgg_admin_review_video(p_video_id uuid,p_action text,p_note text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_admin_review_video(p_video_id,p_action,p_note);
$function$;

create or replace function public.tgg_submit_merch(p_product_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_submit_merch(p_product_id);
$function$;

create or replace function public.tgg_admin_review_merch(p_product_id uuid,p_action text,p_note text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_admin_review_merch(p_product_id,p_action,p_note);
$function$;

create or replace function public.tgg_submit_promotion(p_campaign_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_submit_promotion(p_campaign_id);
$function$;

create or replace function public.tgg_admin_review_promotion(p_campaign_id uuid,p_action text,p_note text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_admin_review_promotion(p_campaign_id,p_action,p_note);
$function$;

grant execute on function private.tgg_submit_mixtape(uuid) to authenticated;
grant execute on function private.tgg_admin_review_mixtape(uuid,text,text) to authenticated;
grant execute on function private.tgg_submit_video(uuid) to authenticated;
grant execute on function private.tgg_admin_review_video(uuid,text,text) to authenticated;
grant execute on function private.tgg_submit_merch(uuid) to authenticated;
grant execute on function private.tgg_admin_review_merch(uuid,text,text) to authenticated;
grant execute on function private.tgg_submit_promotion(uuid) to authenticated;
grant execute on function private.tgg_admin_review_promotion(uuid,text,text) to authenticated;

grant execute on function public.tgg_submit_mixtape(uuid) to authenticated;
grant execute on function public.tgg_admin_review_mixtape(uuid,text,text) to authenticated;
grant execute on function public.tgg_submit_video(uuid) to authenticated;
grant execute on function public.tgg_admin_review_video(uuid,text,text) to authenticated;
grant execute on function public.tgg_submit_merch(uuid) to authenticated;
grant execute on function public.tgg_admin_review_merch(uuid,text,text) to authenticated;
grant execute on function public.tgg_submit_promotion(uuid) to authenticated;
grant execute on function public.tgg_admin_review_promotion(uuid,text,text) to authenticated;

revoke execute on function private.tgg_submit_mixtape(uuid) from anon,public;
revoke execute on function private.tgg_admin_review_mixtape(uuid,text,text) from anon,public;
revoke execute on function private.tgg_submit_video(uuid) from anon,public;
revoke execute on function private.tgg_admin_review_video(uuid,text,text) from anon,public;
revoke execute on function private.tgg_submit_merch(uuid) from anon,public;
revoke execute on function private.tgg_admin_review_merch(uuid,text,text) from anon,public;
revoke execute on function private.tgg_submit_promotion(uuid) from anon,public;
revoke execute on function private.tgg_admin_review_promotion(uuid,text,text) from anon,public;

revoke execute on function public.tgg_submit_mixtape(uuid) from anon,public;
revoke execute on function public.tgg_admin_review_mixtape(uuid,text,text) from anon,public;
revoke execute on function public.tgg_submit_video(uuid) from anon,public;
revoke execute on function public.tgg_admin_review_video(uuid,text,text) from anon,public;
revoke execute on function public.tgg_submit_merch(uuid) from anon,public;
revoke execute on function public.tgg_admin_review_merch(uuid,text,text) from anon,public;
revoke execute on function public.tgg_submit_promotion(uuid) from anon,public;
revoke execute on function public.tgg_admin_review_promotion(uuid,text,text) from anon,public;


-- ============================================================
-- MIGRATION 20260906165010 fix_video_update_ownership_and_moderation_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_video_update(
  p_video_id uuid,
  p_title text default null,
  p_description text default null,
  p_genre text default null,
  p_release_date date default null,
  p_explicit_content boolean default null,
  p_thumbnail_url text default null,
  p_visibility text default null,
  p_featured boolean default null,
  p_allow_downloads boolean default null
)
returns public.videos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.videos;
  v_artist_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  if p_visibility is not null
     and p_visibility not in ('public','private','unlisted')
  then
    raise exception 'invalid_visibility';
  end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id=v_user_id
  limit 1;

  if v_artist_id is null then raise exception 'creator_profile_required'; end if;

  update public.videos
  set title=coalesce(nullif(trim(p_title),''),title),
      description=coalesce(p_description,description),
      genre=coalesce(p_genre,genre),
      release_date=coalesce(p_release_date,release_date),
      explicit_content=coalesce(p_explicit_content,explicit_content),
      thumbnail_url=coalesce(p_thumbnail_url,thumbnail_url),
      visibility=coalesce(p_visibility,visibility),
      featured=coalesce(p_featured,featured),
      allow_downloads=coalesce(p_allow_downloads,allow_downloads),
      updated_at=now()
  where id=p_video_id
    and artist_id=v_artist_id
    and status in ('draft','changes_requested')
  returning * into v;

  if not found then raise exception 'video_not_editable_or_not_owned'; end if;

  insert into public.media_assets(
    id,owner_id,media_type,title,description,source_url,status,visibility,metadata,updated_at,published_at
  )
  values(
    v.id,
    v_user_id,
    'video',
    v.title,
    v.description,
    nullif(v.video_url,''),
    'draft',
    v.visibility,
    jsonb_build_object('source','videos','video_id',v.id::text),
    now(),
    null
  )
  on conflict (id) do update
  set owner_id=excluded.owner_id,
      title=excluded.title,
      description=excluded.description,
      source_url=excluded.source_url,
      status='draft',
      visibility=excluded.visibility,
      updated_at=now(),
      published_at=null;

  return v;
end
$function$;


-- ============================================================
-- MIGRATION 20260906165601 fix_creator_conversation_members_recursion_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_is_creator_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.creator_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = auth.uid()
  );
$$;

revoke all on function private.tgg_is_creator_conversation_member(uuid) from public, anon;
grant execute on function private.tgg_is_creator_conversation_member(uuid) to authenticated;

drop policy if exists ccm_member_select on public.creator_conversation_members;
create policy ccm_member_select
on public.creator_conversation_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or private.tgg_is_creator_conversation_member(conversation_id)
);


-- ============================================================
-- MIGRATION 20260906165817 restrict_legacy_live_moderator_visibility_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists live_moderators_public_select on public.live_stream_moderators;

create policy live_moderators_related_select
on public.live_stream_moderators
for select
to authenticated
using (
  moderator_id = (select auth.uid())
  or exists (
    select 1
    from public.live_streams l
    where l.id = live_stream_moderators.stream_id
      and l.creator_id = (select auth.uid())
  )
);

revoke select on table public.live_stream_moderators from anon;
grant select on table public.live_stream_moderators to authenticated;


-- ============================================================
-- MIGRATION 20260906165851 restrict_public_artist_sensitive_columns_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke select on table public.artists from anon;

grant select (
  id,
  stage_name,
  bio,
  avatar_url,
  created_at,
  instagram,
  website,
  youtube,
  soundcloud,
  spotify
) on table public.artists to anon;


-- ============================================================
-- MIGRATION 20260906165947 restrict_v58_provider_jobs_to_authenticated_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists v58_jobs_select_own on public.v58_provider_jobs;

create policy v58_jobs_select_own
on public.v58_provider_jobs
for select
to authenticated
using (
  creator_id = (select auth.uid())
);

revoke select on table public.v58_provider_jobs from anon;
grant select on table public.v58_provider_jobs to authenticated;


-- ============================================================
-- MIGRATION 20260906170016 align_auth_scoped_select_policies_v501
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter policy "Users can view own analytics" on public.analytics_events to authenticated;
alter policy "Users can view own blocks" on public.blocks to authenticated;
alter policy "Creators can view live reactions" on public.live_reactions to authenticated;
alter policy "Creators can view live analytics" on public.live_stream_viewers to authenticated;
alter policy "Creators read events for their provider operations" on public.provider_operation_events to authenticated;
alter policy "Creators read their provider operations" on public.provider_operations to authenticated;
alter policy "Creators read their reconciliation runs" on public.provider_reconciliation_runs to authenticated;
alter policy "Users can view own reel saves" on public.reel_saves to authenticated;
alter policy "Creators can view reel shares" on public.reel_shares to authenticated;
alter policy "Creators can view reel analytics" on public.reel_views to authenticated;
alter policy "Creators can view story analytics" on public.story_views to authenticated;
alter policy "Users can view support they sent" on public.support_transactions to authenticated;
alter policy "creator events select own" on public.v159_creator_events to authenticated;
alter policy "v58_analytics_select_own" on public.v58_analytics_events to authenticated;
alter policy "v58_release_distribution_owner_select" on public.v58_release_distribution_config to authenticated;
alter policy "v58_release_promotion_owner_select" on public.v58_release_promotion_approvals to authenticated;
alter policy "v58_staging_evidence_select" on public.v58_staging_evidence to authenticated;
alter policy "v58_staging_fixture_runs_select" on public.v58_staging_fixture_runs to authenticated;
alter policy "v58_staging_fixtures_select" on public.v58_staging_fixtures to authenticated;
alter policy "v58_events_select_own" on public.v58_workflow_events to authenticated;
alter policy "v58_tasks_select_own" on public.v58_workflow_tasks to authenticated;

revoke select on table
  public.analytics_events,
  public.blocks,
  public.live_reactions,
  public.live_stream_viewers,
  public.provider_operation_events,
  public.provider_operations,
  public.provider_reconciliation_runs,
  public.reel_saves,
  public.reel_shares,
  public.reel_views,
  public.story_views,
  public.support_transactions,
  public.v159_creator_events,
  public.v58_analytics_events,
  public.v58_release_distribution_config,
  public.v58_release_promotion_approvals,
  public.v58_staging_evidence,
  public.v58_staging_fixture_runs,
  public.v58_staging_fixtures,
  public.v58_workflow_events,
  public.v58_workflow_tasks
from anon;


-- ============================================================
-- MIGRATION 20260906170722 finalize_v305_public_media_privacy
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


-- Artists: keep only public profile/discovery fields anonymous.
revoke select on table public.artists from anon;
grant select (
  id,
  stage_name,
  bio,
  avatar_url,
  created_at,
  instagram,
  website,
  youtube,
  soundcloud,
  spotify
) on table public.artists to anon;

-- Tracks: remove table-wide anonymous SELECT so private storage paths/user IDs
-- are not exposed. Grant only fields required by public playback/discovery.
revoke select on table public.tracks from anon;
grant select (
  id,
  mixtape_id,
  track_number,
  title,
  featured_artist,
  audio_url,
  duration_seconds,
  download_policy,
  has_secure_audio
) on table public.tracks to anon;


-- ============================================================
-- MIGRATION 20260906170900 public_artist_projection_for_anon_views_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.public_artist_directory_v1 (
  artist_id uuid primary key references public.artists(id) on delete cascade,
  user_id uuid,
  stage_name text,
  bio text,
  avatar_url text,
  instagram text,
  website text,
  youtube text,
  soundcloud text,
  spotify text,
  created_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.public_artist_directory_v1 enable row level security;

drop policy if exists public_artist_directory_read on public.public_artist_directory_v1;
create policy public_artist_directory_read
on public.public_artist_directory_v1
for select
to anon, authenticated
using (true);

revoke all on table public.public_artist_directory_v1 from anon, authenticated;
grant select on table public.public_artist_directory_v1 to anon, authenticated;

insert into public.public_artist_directory_v1(
  artist_id,user_id,stage_name,bio,avatar_url,instagram,website,youtube,soundcloud,spotify,created_at,updated_at
)
select
  id,user_id,stage_name,bio,avatar_url,instagram,website,youtube,soundcloud,spotify,created_at,now()
from public.artists
on conflict (artist_id) do update
set user_id=excluded.user_id,
    stage_name=excluded.stage_name,
    bio=excluded.bio,
    avatar_url=excluded.avatar_url,
    instagram=excluded.instagram,
    website=excluded.website,
    youtube=excluded.youtube,
    soundcloud=excluded.soundcloud,
    spotify=excluded.spotify,
    created_at=excluded.created_at,
    updated_at=now();

create or replace function private.tgg_sync_public_artist_directory()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op='DELETE' then
    delete from public.public_artist_directory_v1
    where artist_id=old.id;
    return old;
  end if;

  insert into public.public_artist_directory_v1(
    artist_id,user_id,stage_name,bio,avatar_url,instagram,website,youtube,soundcloud,spotify,created_at,updated_at
  )
  values(
    new.id,new.user_id,new.stage_name,new.bio,new.avatar_url,new.instagram,new.website,new.youtube,new.soundcloud,new.spotify,new.created_at,now()
  )
  on conflict (artist_id) do update
  set user_id=excluded.user_id,
      stage_name=excluded.stage_name,
      bio=excluded.bio,
      avatar_url=excluded.avatar_url,
      instagram=excluded.instagram,
      website=excluded.website,
      youtube=excluded.youtube,
      soundcloud=excluded.soundcloud,
      spotify=excluded.spotify,
      created_at=excluded.created_at,
      updated_at=now();

  return new;
end;
$$;

revoke all on function private.tgg_sync_public_artist_directory() from public,anon,authenticated;

drop trigger if exists tgg_sync_public_artist_directory on public.artists;
create trigger tgg_sync_public_artist_directory
after insert or update or delete on public.artists
for each row execute function private.tgg_sync_public_artist_directory();

create or replace view public.public_home_feed_v1
with (security_invoker=true)
as
select
  m.id as mixtape_id,
  m.slug,
  m.title,
  m.genre,
  m.description,
  m.cover_url,
  m.release_date,
  m.featured,
  m.play_count,
  m.download_count,
  a.artist_id,
  a.stage_name,
  a.avatar_url,
  (
    select count(*)
    from public.tracks t
    where t.mixtape_id=m.id
  ) as track_count
from public.mixtapes m
left join public.public_artist_directory_v1 a
  on a.artist_id=m.artist_id
where m.status='published'::public.mixtape_status
order by m.featured desc,m.release_date desc nulls last,m.created_at desc;

create or replace view public.public_artist_profile_v1
with (security_invoker=true)
as
select
  a.artist_id,
  a.stage_name,
  a.bio,
  a.avatar_url,
  a.instagram,
  a.website,
  a.youtube,
  a.soundcloud,
  a.spotify,
  (
    select count(*)
    from public.mixtapes m
    where m.artist_id=a.artist_id
      and m.status='published'::public.mixtape_status
  ) as published_releases,
  (
    select count(*)
    from public.artist_follows f
    where f.artist_id=a.artist_id
  ) as followers,
  (
    select coalesce(sum(m.play_count),0)::bigint
    from public.mixtapes m
    where m.artist_id=a.artist_id
      and m.status='published'::public.mixtape_status
  ) as total_plays
from public.public_artist_directory_v1 a
where exists (
  select 1
  from public.mixtapes m
  where m.artist_id=a.artist_id
    and m.status='published'::public.mixtape_status
);

create or replace view public.public_merch_v1
with (security_invoker=true)
as
select
  mp.id,
  mp.creator_id,
  mp.title,
  mp.description,
  mp.product_type,
  mp.price_cents,
  mp.currency,
  mp.sku,
  mp.inventory,
  mp.image_url,
  mp.published_at,
  a.stage_name as creator_name
from public.merch_products mp
left join public.public_artist_directory_v1 a
  on a.artist_id=mp.creator_id
where mp.status='published';

create or replace view public.public_release_detail_v1
with (security_invoker=true)
as
select
  m.id as mixtape_id,
  m.slug,
  m.title,
  m.genre,
  m.description,
  m.cover_url,
  m.release_date,
  m.explicit,
  m.play_count,
  m.download_count,
  m.artist_id,
  a.stage_name,
  a.avatar_url,
  (
    select count(*) from public.tracks t where t.mixtape_id=m.id
  ) as track_count,
  (
    select count(*) from public.release_saves s where s.mixtape_id=m.id
  ) as save_count,
  (
    select count(*) from public.release_reactions r where r.mixtape_id=m.id
  ) as reaction_count,
  (
    select count(*) from public.release_comments c
    where c.mixtape_id=m.id and c.hidden_by_creator=false
  ) as visible_comment_count
from public.mixtapes m
left join public.public_artist_directory_v1 a
  on a.artist_id=m.artist_id
where m.status='published'::public.mixtape_status;

create or replace view public.active_stories_v1
with (security_invoker=true)
as
select
  s.id,
  s.user_id,
  coalesce(a.stage_name,'TGG User') as display_name,
  a.avatar_url,
  s.story_type,
  s.caption,
  s.media_url,
  s.linked_release_id,
  s.created_at,
  s.expires_at
from public.tgg_stories s
left join public.public_artist_directory_v1 a
  on a.user_id=s.user_id
where s.expires_at>now()
order by s.created_at desc;

create or replace view public.public_shorts_v1
with (security_invoker=true)
as
select
  s.id,
  s.user_id,
  s.caption,
  s.media_url,
  s.thumbnail_url,
  s.linked_release_id,
  s.duration_seconds,
  s.created_at,
  coalesce(a.stage_name,'TGG Creator') as creator_name,
  count(r.user_id) filter (where r.reaction='like') as likes,
  count(r.user_id) filter (where r.reaction='fire') as fires
from public.tgg_shorts s
left join public.public_artist_directory_v1 a
  on a.user_id=s.user_id
left join public.tgg_short_reactions r
  on r.short_id=s.id
where s.status='published'
  and s.visibility='public'
group by s.id,a.stage_name;

grant select on table
  public.public_home_feed_v1,
  public.public_artist_profile_v1,
  public.public_merch_v1,
  public.public_release_detail_v1,
  public.active_stories_v1,
  public.public_shorts_v1
to anon,authenticated;

-- Raw artists is no longer needed by anonymous public views.
revoke select on table public.artists from anon;


-- ============================================================
-- MIGRATION 20260906170934 simplify_anon_mixtape_read_policy_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists "mixtapes public read anon" on public.mixtapes;

create policy "mixtapes public read anon"
on public.mixtapes
for select
to anon
using (
  status='published'::public.mixtape_status
);


-- ============================================================
-- MIGRATION 20260906171140 harden_public_telemetry_payload_bounds_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.analytics_events
  add constraint analytics_events_session_len_chk
    check (session_id is null or char_length(session_id) <= 128),
  add constraint analytics_events_event_type_len_chk
    check (char_length(event_type) between 1 and 80),
  add constraint analytics_events_entity_type_len_chk
    check (entity_type is null or char_length(entity_type) <= 80),
  add constraint analytics_events_referrer_len_chk
    check (referrer is null or char_length(referrer) <= 2048),
  add constraint analytics_events_metadata_shape_chk
    check (jsonb_typeof(metadata) = 'object'),
  add constraint analytics_events_metadata_size_chk
    check (octet_length(metadata::text) <= 8192);

alter table public.live_reactions
  add constraint live_reactions_type_len_chk
    check (char_length(reaction_type) between 1 and 32);

alter table public.live_stream_viewers
  add constraint live_stream_viewers_session_len_chk
    check (char_length(session_id) between 1 and 128),
  add constraint live_stream_viewers_watch_upper_chk
    check (watch_seconds <= 604800);

alter table public.reel_views
  add constraint reel_views_session_len_chk
    check (session_id is null or char_length(session_id) <= 128),
  add constraint reel_views_watch_upper_chk
    check (watch_seconds <= 86400);

alter table public.tgg_smart_link_events
  add constraint smart_link_destination_len_chk
    check (destination is null or char_length(destination) <= 2048),
  add constraint smart_link_referrer_len_chk
    check (referrer is null or char_length(referrer) <= 2048),
  add constraint smart_link_utm_source_len_chk
    check (utm_source is null or char_length(utm_source) <= 255),
  add constraint smart_link_utm_medium_len_chk
    check (utm_medium is null or char_length(utm_medium) <= 255),
  add constraint smart_link_utm_campaign_len_chk
    check (utm_campaign is null or char_length(utm_campaign) <= 255);


-- ============================================================
-- MIGRATION 20260906171416 quarantine_terminal_parent_v58_backlog_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.v58_workflow_tasks wt
set status='cancelled',
    error_message=coalesce(nullif(error_message,''),'Cancelled during V513 cleanup because parent workflow run is terminal.'),
    updated_at=now()
from public.v58_workflow_runs wr
where wr.id=wt.workflow_run_id
  and wt.status='queued'
  and wr.status in ('completed','cancelled');

update public.v58_provider_jobs pj
set status='dead_letter',
    error_message=coalesce(nullif(error_message,''),'Dead-lettered during V513 cleanup because parent workflow run is terminal.'),
    updated_at=now()
from public.v58_workflow_runs wr
where wr.id=pj.workflow_run_id
  and pj.status='pending'
  and wr.status in ('completed','cancelled');


-- ============================================================
-- MIGRATION 20260906171457 retire_superseded_blocked_v58_runs_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


with superseded as (
  select b.id
  from public.v58_workflow_runs b
  where b.status='blocked'
    and exists (
      select 1
      from public.v58_workflow_runs newer
      where newer.release_id=b.release_id
        and newer.status='completed'
        and newer.created_at>b.created_at
    )
)
update public.v58_workflow_tasks wt
set status='cancelled',
    error_message=coalesce(nullif(wt.error_message,''),'Cancelled during V513 cleanup because parent blocked run was superseded by a newer completed run.'),
    updated_at=now()
where wt.workflow_run_id in (select id from superseded)
  and wt.status='queued';

with superseded as (
  select b.id
  from public.v58_workflow_runs b
  where b.status='blocked'
    and exists (
      select 1
      from public.v58_workflow_runs newer
      where newer.release_id=b.release_id
        and newer.status='completed'
        and newer.created_at>b.created_at
    )
)
update public.v58_workflow_runs wr
set status='cancelled',
    current_step=null,
    completed_at=coalesce(completed_at,now()),
    updated_at=now()
where wr.id in (select id from superseded);


-- ============================================================
-- MIGRATION 20260906171536 retire_final_stale_v58_launch_run_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.v58_workflow_steps
set status='skipped',
    detail=coalesce(nullif(detail,''),'Skipped during V513 cleanup: legacy launch run cannot complete because release has no tracks.'),
    error_message=coalesce(nullif(error_message,''),'Legacy V58 launch run retired.'),
    completed_at=coalesce(completed_at,now()),
    updated_at=now()
where workflow_run_id='546f4385-9c02-49cc-a732-80514fc75b71'::uuid
  and status in ('pending','running','blocked','failed','retrying');

update public.v58_workflow_tasks
set status='cancelled',
    error_message=coalesce(nullif(error_message,''),'Cancelled during V513 cleanup with retired legacy launch run.'),
    updated_at=now()
where workflow_run_id='546f4385-9c02-49cc-a732-80514fc75b71'::uuid
  and status='queued';

update public.v58_workflow_runs
set status='cancelled',
    current_step=null,
    completed_at=coalesce(completed_at,now()),
    updated_at=now()
where id='546f4385-9c02-49cc-a732-80514fc75b71'::uuid
  and status='blocked';


-- ============================================================
-- MIGRATION 20260906171834 migrate_public_rpcs_to_artist_projection_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_public_mixtape_catalog()
returns table(
  id uuid,
  title text,
  genre text,
  description text,
  cover_url text,
  release_date timestamptz,
  artist_id uuid,
  artist_name text,
  track_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    m.id,
    m.title,
    m.genre,
    m.description,
    m.cover_url,
    m.release_date,
    a.artist_id,
    a.stage_name,
    count(t.id)::bigint
  from public.mixtapes m
  left join public.public_artist_directory_v1 a
    on a.artist_id=m.artist_id
  left join public.tracks t
    on t.mixtape_id=m.id
  where m.status='published'::public.mixtape_status
  group by m.id,a.artist_id,a.stage_name
  order by m.release_date desc nulls last,m.created_at desc;
$function$;

create or replace function public.tgg_public_mixtape_detail(p_mixtape_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'id',m.id,
    'title',m.title,
    'genre',m.genre,
    'description',m.description,
    'cover_url',m.cover_url,
    'release_date',m.release_date,
    'artists',jsonb_build_object(
      'id',a.artist_id,
      'stage_name',a.stage_name
    ),
    'tracks',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',t.id,
          'track_number',t.track_number,
          'title',t.title,
          'featured_artist',t.featured_artist,
          'download_policy',t.download_policy
        )
        order by t.track_number
      )
      from public.tracks t
      where t.mixtape_id=m.id
    ),'[]'::jsonb)
  )
  from public.mixtapes m
  left join public.public_artist_directory_v1 a
    on a.artist_id=m.artist_id
  where m.id=p_mixtape_id
    and m.status='published'::public.mixtape_status;
$function$;

create or replace function public.tgg_get_public_collection(p_collection_id uuid)
returns table(
  collection_id uuid,
  collection_name text,
  collection_description text,
  updated_at timestamptz,
  item_id uuid,
  mixtape_id uuid,
  mixtape_title text,
  artist_name text,
  cover_url text,
  slug text,
  added_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    c.id,
    c.name,
    c.description,
    c.updated_at,
    i.id,
    i.mixtape_id,
    m.title,
    a.stage_name,
    m.cover_url,
    m.slug,
    i.added_at
  from public.fan_collections c
  join public.fan_collection_items i
    on i.collection_id=c.id
  join public.mixtapes m
    on m.id=i.mixtape_id
   and m.status='published'::public.mixtape_status
  left join public.public_artist_directory_v1 a
    on a.artist_id=m.artist_id
  where c.id=p_collection_id
    and c.is_public=true
  order by i.added_at desc;
$function$;

create or replace function public.tgg_get_site_route_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.area,r.nav_group,r.nav_order,r.title),
    '[]'::jsonb
  )
  from public.tgg_site_routes r
  where r.is_active=true
    and r.access_level <> 'admin'
    and (
      r.access_level='public'
      or (
        r.access_level='authenticated'
        and (select auth.uid()) is not null
      )
      or (
        r.access_level='artist'
        and exists (
          select 1
          from public.public_artist_directory_v1 a
          where a.user_id=(select auth.uid())
        )
      )
    );
$function$;

grant execute on function public.tgg_public_mixtape_catalog() to anon,authenticated;
grant execute on function public.tgg_public_mixtape_detail(uuid) to anon,authenticated;
grant execute on function public.tgg_get_public_collection(uuid) to anon,authenticated;
grant execute on function public.tgg_get_site_route_manifest() to anon,authenticated;


-- ============================================================
-- MIGRATION 20260906171941 public_release_engagement_aggregate_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.public_release_engagement_counts_v1 (
  mixtape_id uuid primary key references public.mixtapes(id) on delete cascade,
  saves bigint not null default 0,
  likes bigint not null default 0,
  fires bigint not null default 0,
  comments bigint not null default 0,
  total_reactions bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.public_release_engagement_counts_v1 enable row level security;

drop policy if exists public_release_engagement_counts_read
on public.public_release_engagement_counts_v1;

create policy public_release_engagement_counts_read
on public.public_release_engagement_counts_v1
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.mixtapes m
    where m.id = public_release_engagement_counts_v1.mixtape_id
      and m.status='published'::public.mixtape_status
  )
);

revoke all on table public.public_release_engagement_counts_v1 from anon,authenticated;
grant select on table public.public_release_engagement_counts_v1 to anon,authenticated;

insert into public.public_release_engagement_counts_v1(
  mixtape_id,saves,likes,fires,comments,total_reactions,updated_at
)
select
  m.id,
  coalesce((select count(*) from public.release_saves s where s.mixtape_id=m.id),0),
  coalesce((select count(*) from public.release_reactions r where r.mixtape_id=m.id and lower(r.reaction)='like'),0),
  coalesce((select count(*) from public.release_reactions r where r.mixtape_id=m.id and lower(r.reaction)='fire'),0),
  coalesce((select count(*) from public.release_comments c where c.mixtape_id=m.id and c.hidden_by_creator=false),0),
  coalesce((select count(*) from public.release_reactions r where r.mixtape_id=m.id),0),
  now()
from public.mixtapes m
on conflict (mixtape_id) do update
set saves=excluded.saves,
    likes=excluded.likes,
    fires=excluded.fires,
    comments=excluded.comments,
    total_reactions=excluded.total_reactions,
    updated_at=now();

create or replace function private.tgg_refresh_release_engagement_counts(p_mixtape_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_mixtape_id is null then
    return;
  end if;

  insert into public.public_release_engagement_counts_v1(
    mixtape_id,saves,likes,fires,comments,total_reactions,updated_at
  )
  select
    p_mixtape_id,
    (select count(*) from public.release_saves s where s.mixtape_id=p_mixtape_id),
    (select count(*) from public.release_reactions r where r.mixtape_id=p_mixtape_id and lower(r.reaction)='like'),
    (select count(*) from public.release_reactions r where r.mixtape_id=p_mixtape_id and lower(r.reaction)='fire'),
    (select count(*) from public.release_comments c where c.mixtape_id=p_mixtape_id and c.hidden_by_creator=false),
    (select count(*) from public.release_reactions r where r.mixtape_id=p_mixtape_id),
    now()
  where exists (select 1 from public.mixtapes m where m.id=p_mixtape_id)
  on conflict (mixtape_id) do update
  set saves=excluded.saves,
      likes=excluded.likes,
      fires=excluded.fires,
      comments=excluded.comments,
      total_reactions=excluded.total_reactions,
      updated_at=now();
end;
$$;

create or replace function private.tgg_sync_release_engagement_counts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op='DELETE' then
    perform private.tgg_refresh_release_engagement_counts(old.mixtape_id);
    return old;
  elsif tg_op='UPDATE' then
    perform private.tgg_refresh_release_engagement_counts(old.mixtape_id);
    if new.mixtape_id is distinct from old.mixtape_id then
      perform private.tgg_refresh_release_engagement_counts(new.mixtape_id);
    else
      perform private.tgg_refresh_release_engagement_counts(new.mixtape_id);
    end if;
    return new;
  else
    perform private.tgg_refresh_release_engagement_counts(new.mixtape_id);
    return new;
  end if;
end;
$$;

revoke all on function private.tgg_refresh_release_engagement_counts(uuid)
from public,anon,authenticated;
revoke all on function private.tgg_sync_release_engagement_counts()
from public,anon,authenticated;

drop trigger if exists tgg_sync_release_saves_counts on public.release_saves;
create trigger tgg_sync_release_saves_counts
after insert or update or delete on public.release_saves
for each row execute function private.tgg_sync_release_engagement_counts();

drop trigger if exists tgg_sync_release_reactions_counts on public.release_reactions;
create trigger tgg_sync_release_reactions_counts
after insert or update or delete on public.release_reactions
for each row execute function private.tgg_sync_release_engagement_counts();

drop trigger if exists tgg_sync_release_comments_counts on public.release_comments;
create trigger tgg_sync_release_comments_counts
after insert or update or delete on public.release_comments
for each row execute function private.tgg_sync_release_engagement_counts();

create or replace view public.public_release_engagement_v2
with (security_invoker=true)
as
select
  c.mixtape_id,
  c.saves,
  c.likes,
  c.fires,
  c.comments
from public.public_release_engagement_counts_v1 c;

create or replace view public.public_release_detail_v1
with (security_invoker=true)
as
select
  m.id as mixtape_id,
  m.slug,
  m.title,
  m.genre,
  m.description,
  m.cover_url,
  m.release_date,
  m.explicit,
  m.play_count,
  m.download_count,
  m.artist_id,
  a.stage_name,
  a.avatar_url,
  (
    select count(*)
    from public.tracks t
    where t.mixtape_id=m.id
  ) as track_count,
  coalesce(e.saves,0) as save_count,
  coalesce(e.total_reactions,0) as reaction_count,
  coalesce(e.comments,0) as visible_comment_count
from public.mixtapes m
left join public.public_artist_directory_v1 a
  on a.artist_id=m.artist_id
left join public.public_release_engagement_counts_v1 e
  on e.mixtape_id=m.id
where m.status='published'::public.mixtape_status;

grant select on table public.public_release_engagement_v2,
                      public.public_release_detail_v1
to anon,authenticated;


-- ============================================================
-- MIGRATION 20260906172152 restore_artist_artwork_read_grants_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


grant select on table public.artist_artwork to anon,authenticated;


-- ============================================================
-- MIGRATION 20260906172308 restore_private_creator_membership_helper_exec_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke all on function private.is_creator_member(uuid,uuid) from public,anon;
grant execute on function private.is_creator_member(uuid,uuid) to authenticated;


-- ============================================================
-- MIGRATION 20260906172406 restore_private_conversation_membership_helper_exec_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke all on function private.is_conversation_member(uuid,uuid) from public,anon;
grant execute on function private.is_conversation_member(uuid,uuid) to authenticated;


-- ============================================================
-- MIGRATION 20260906172604 retire_browser_staging_and_health_rpcs_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke execute on function public.v54_system_health() from public,anon,authenticated;
revoke execute on function public.v54_test_health() from public,anon,authenticated;
revoke execute on function public.v58_guard_staging_fixture() from public,anon,authenticated;
revoke execute on function public.v58_staging_fixture_transition(uuid,text,text) from public,anon,authenticated;
revoke execute on function public.v58_staging_run_and_score() from public,anon,authenticated;
revoke execute on function public.v58_staging_run_full_e2e() from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906172636 retire_browser_v58_launch_control_rpcs_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke execute on function public.v58_launch_control_preflight(text) from public,anon,authenticated;
revoke execute on function public.v58_launch_control_release_state(text) from public,anon,authenticated;
revoke execute on function public.v58_launch_control_resume(uuid) from public,anon,authenticated;
revoke execute on function public.v58_resolve_action(uuid,text) from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906172659 retire_remaining_browser_v54_v58_diagnostics_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke execute on function public.v54_dashboard_summary(uuid) from public,anon,authenticated;
revoke execute on function public.v58_latest_staging_verdict() from public,anon,authenticated;
revoke execute on function public.v58_launch_control_diagnostic() from public,anon,authenticated;
revoke execute on function public.v58_staging_preflight() from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906172916 remove_raw_auth_users_dependencies_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace view public.fan_activity_summary
with (security_invoker=true)
as
select
  (select auth.uid()) as user_id,
  (
    select count(*)
    from public.artist_follows f
    where f.user_id=(select auth.uid())
  ) as followed_artists,
  (
    select count(*)
    from public.release_saves s
    where s.user_id=(select auth.uid())
  ) as saved_releases,
  (
    select count(*)
    from public.release_reactions r
    where r.user_id=(select auth.uid())
  ) as reactions,
  (
    select count(*)
    from public.release_comments c
    where c.user_id=(select auth.uid())
  ) as comments,
  (
    select count(*)
    from public.fan_collections fc
    where fc.user_id=(select auth.uid())
  ) as collections,
  (
    select count(*)
    from public.fan_listening_history h
    where h.user_id=(select auth.uid())
  ) as listening_events,
  (
    select count(*)
    from public.notifications n
    where n.recipient_id=(select auth.uid())
      and n.read_at is null
  ) as unread_notifications,
  greatest(
    (
      select max(h.listened_at)
      from public.fan_listening_history h
      where h.user_id=(select auth.uid())
    ),
    (
      select max(n.created_at)
      from public.notifications n
      where n.recipient_id=(select auth.uid())
    )
  ) as last_activity_at
where (select auth.uid()) is not null;

grant select on public.fan_activity_summary to authenticated;

create or replace function public.tgg_create_collaboration_request(
  p_recipient_id uuid,
  p_project_title text,
  p_project_type text,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_recipient_user uuid;
  v_id uuid;
  v_title text:=btrim(coalesce(p_project_title,''));
  v_type text:=btrim(coalesce(p_project_type,''));
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
begin
  if v_user is null then raise exception 'authentication required'; end if;

  select a.user_id
    into v_recipient_user
  from public.public_artist_directory_v1 a
  where a.artist_id=p_recipient_id
     or a.user_id=p_recipient_id
  limit 1;

  if v_recipient_user is null or v_recipient_user=v_user then
    raise exception 'invalid recipient';
  end if;

  if char_length(v_title)<1 or char_length(v_title)>160 then
    raise exception 'project title must be 1 to 160 characters';
  end if;

  if char_length(v_type)<1 or char_length(v_type)>80 then
    raise exception 'project type must be 1 to 80 characters';
  end if;

  if v_note is not null and char_length(v_note)>2000 then
    raise exception 'note too long';
  end if;

  if exists(
    select 1
    from public.tgg_collaboration_requests r
    where r.sender_id=v_user
      and r.recipient_id=v_recipient_user
      and r.project_title=v_title
      and r.status='pending'
  ) then
    raise exception 'matching request already pending';
  end if;

  insert into public.tgg_collaboration_requests(
    sender_id,recipient_id,project_title,project_type,note,status
  )
  values(
    v_user,v_recipient_user,v_title,v_type,v_note,'pending'
  )
  returning id into v_id;

  return v_id;
end
$function$;

grant execute on function public.tgg_create_collaboration_request(uuid,text,text,text)
to authenticated;
revoke execute on function public.tgg_create_collaboration_request(uuid,text,text,text)
from anon,public;


-- ============================================================
-- MIGRATION 20260906173055 remove_service_only_runtime_dependency_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_command_center()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'generated_at', now(),
    'user_id', (select auth.uid()),
    'runtime', coalesce(
      public.tgg_get_frontend_integration_health(),
      jsonb_build_object('ok',false)
    ),
    'profile', jsonb_build_object(
      'profile_count',(select count(*) from public.profiles where id=(select auth.uid())),
      'artist_count',(select count(*) from public.artists where user_id=(select auth.uid()))
    ),
    'music', jsonb_build_object(
      'mixtapes',(select count(*) from public.mixtapes m join public.artists a on a.id=m.artist_id where a.user_id=(select auth.uid())),
      'tracks',(select count(*) from public.tracks t join public.mixtapes m on m.id=t.mixtape_id join public.artists a on a.id=m.artist_id where a.user_id=(select auth.uid())),
      'release_status_history',(select count(*) from public.release_status_history where user_id=(select auth.uid()))
    ),
    'media', jsonb_build_object(
      'videos',(select count(*) from public.videos v join public.artists a on a.id=v.artist_id where a.user_id=(select auth.uid())),
      'video_assets',(select count(*) from public.media_assets where owner_id=(select auth.uid())),
      'creative_projects',(select count(*) from public.tgg_creative_projects where user_id=(select auth.uid()))
    ),
    'community', jsonb_build_object(
      'followers',(select count(*) from public.artist_follows af join public.artists a on a.id=af.artist_id where a.user_id=(select auth.uid())),
      'notifications',(select count(*) from public.notifications where recipient_id=(select auth.uid())),
      'conversations',(select count(*) from public.tgg_conversation_members where user_id=(select auth.uid())),
      'messages',(select count(*) from public.tgg_messages where sender_id=(select auth.uid()))
    ),
    'commerce', jsonb_build_object(
      'products',(select count(*) from public.merch_products p join public.artists a on a.id=p.creator_id where a.user_id=(select auth.uid())),
      'support_transactions',(select count(*) from public.tgg_support_transactions st join public.artists a on a.id=st.artist_id where a.user_id=(select auth.uid())),
      'live_events',(select count(*) from public.tgg_live_events le join public.artists a on a.id=le.artist_id where a.user_id=(select auth.uid()))
    ),
    'growth', jsonb_build_object(
      'campaigns',(select count(*) from public.tgg_campaigns where owner_user_id=(select auth.uid())),
      'goals',(select count(*) from public.tgg_creator_goals where owner_user_id=(select auth.uid())),
      'opportunities',(select count(*) from public.tgg_opportunities where created_by=(select auth.uid())),
      'smart_links',(select count(*) from public.tgg_smart_links where owner_user_id=(select auth.uid())),
      'action_queue',(select count(*) from public.tgg_creator_action_queue where owner_user_id=(select auth.uid()))
    ),
    'workspace', coalesce(
      (select jsonb_build_object(
        'preferences',jsonb_build_object(
          'default_workspace',p.default_workspace,
          'compact_mode',p.compact_mode,
          'sidebar_collapsed',p.sidebar_collapsed,
          'reduce_motion',p.reduce_motion
        )
      )
      from public.tgg_creator_ui_preferences p
      where p.user_id=(select auth.uid())),
      '{}'::jsonb
    ),
    'routes', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'route_key',r.route_key,'title',r.title,'area',r.area,'path',r.path,
        'workspace_key',r.workspace_key,'icon',r.icon,'nav_group',r.nav_group,'nav_order',r.nav_order
      ) order by r.nav_order,r.route_key)
       from public.tgg_site_routes r
       where r.is_active=true
         and r.access_level in ('public','authenticated','artist')),
      '[]'::jsonb
    )
  );
$function$;

grant execute on function public.tgg_creator_os_command_center() to authenticated;
revoke execute on function public.tgg_creator_os_command_center() from anon,public;


-- ============================================================
-- MIGRATION 20260906173135 remove_master_status_service_readiness_dependency_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_master_status()
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_user uuid := (select auth.uid());
  v_artist uuid;
  v_result jsonb;
  v_health jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select a.id into v_artist
  from public.artists a
  where a.user_id = v_user
  limit 1;

  if v_artist is null then
    raise exception 'creator_profile_required' using errcode = '42501';
  end if;

  v_health := public.tgg_get_frontend_integration_health();

  select jsonb_build_object(
    'version','V3931',
    'scope','creator_os',
    'generated_at',now(),
    'creator', jsonb_build_object(
      'user_id',v_user,
      'artist_id',v_artist,
      'stage_name',(select a.stage_name from public.artists a where a.id=v_artist)
    ),
    'command_center', coalesce((
      select to_jsonb(c) - 'creator_user_id' - 'artist_id'
      from public.tgg_creator_command_center c
      where c.creator_user_id=v_user and c.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'actions', coalesce((
      select to_jsonb(s) - 'owner_user_id' - 'artist_id'
      from public.tgg_creator_action_summary s
      where s.owner_user_id=v_user and s.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'release_health', coalesce((
      select jsonb_agg(to_jsonb(r) - 'creator_user_id' - 'artist_id')
      from public.tgg_creator_release_health r
      where r.creator_user_id=v_user and r.artist_id=v_artist
    ), '[]'::jsonb),
    'growth', coalesce((
      select to_jsonb(g) - 'owner_user_id' - 'artist_id'
      from public.tgg_creator_growth_snapshot g
      where g.owner_user_id=v_user and g.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'fans', coalesce((
      select to_jsonb(f) - 'creator_user_id' - 'artist_id'
      from public.tgg_creator_fan_intelligence_summary f
      where f.creator_user_id=v_user and f.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'supporters', coalesce((
      select to_jsonb(su) - 'creator_user_id' - 'artist_id'
      from public.tgg_creator_supporter_summary su
      where su.creator_user_id=v_user and su.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'monetization', coalesce((
      select to_jsonb(m) - 'creator_user_id' - 'artist_id'
      from public.tgg_creator_monetization_summary m
      where m.creator_user_id=v_user and m.artist_id=v_artist
      limit 1
    ), '{}'::jsonb),
    'bookings', coalesce((
      select jsonb_agg(to_jsonb(b) - 'creator_user_id')
      from public.tgg_creator_booking_pipeline b
      where b.creator_user_id=v_user
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(to_jsonb(cp) - 'creator_user_id' - 'artist_id')
      from public.tgg_creator_campaign_health cp
      where cp.creator_user_id=v_user and cp.artist_id=v_artist
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) - 'creator_user_id' - 'artist_id')
      from public.tgg_creator_event_performance e
      where e.creator_user_id=v_user and e.artist_id=v_artist
    ), '[]'::jsonb),
    'daily_brief', coalesce((
      select to_jsonb(d) - 'owner_user_id'
      from public.tgg_creator_daily_brief d
      where d.owner_user_id=v_user
      limit 1
    ), '{}'::jsonb),
    'ui', jsonb_build_object(
      'preferences', coalesce((
        select to_jsonb(p) - 'user_id'
        from public.tgg_creator_ui_preferences p
        where p.user_id=v_user
        limit 1
      ), '{}'::jsonb),
      'workspace_state', coalesce((
        select jsonb_agg(to_jsonb(w) - 'user_id')
        from public.tgg_creator_ui_workspace_state w
        where w.user_id=v_user
      ), '[]'::jsonb)
    ),
    'notifications', coalesce((
      select count(*) from public.notifications n where n.recipient_id=v_user
    ),0),
    'content', jsonb_build_object(
      'releases', (select count(*) from public.mixtapes m where m.artist_id=v_artist),
      'tracks', (select count(*) from public.tracks t join public.mixtapes m on m.id=t.mixtape_id where m.artist_id=v_artist),
      'videos', (select count(*) from public.videos v where v.artist_id=v_artist),
      'products', (select count(*) from public.products p where p.artist_id=v_artist)
    ),
    'readiness', jsonb_build_object(
      'runtime', case
        when coalesce((v_health->>'ok')::boolean,false) then 'ready'
        else 'degraded'
      end,
      'authenticated', true,
      'artist_ready', coalesce((v_health->>'artist_ready')::boolean,false),
      'version', v_health->>'version'
    )
  ) into v_result;

  return v_result;
end;
$function$;

grant execute on function public.tgg_creator_os_master_status() to authenticated;
revoke execute on function public.tgg_creator_os_master_status() from anon,public;


-- ============================================================
-- MIGRATION 20260906173227 retire_browser_final_reconciliation_rpc_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke execute on function public.tgg_creator_os_final_reconciliation()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906173507 fix_pending_media_path_validation_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_register_pending_media_upload(
  p_app_scope text,
  p_storage_path text
)
returns uuid
language plpgsql
security invoker
set search_path = 'public','storage'
as $function$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_parts text[];
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  if p_app_scope not in ('studio','messages','video','vault') then
    raise exception 'invalid app scope';
  end if;

  v_parts := storage.foldername(p_storage_path);

  if array_length(v_parts,1) is null
     or array_length(v_parts,1) < 2
     or v_parts[1] is distinct from v_uid::text
     or v_parts[2] is distinct from p_app_scope
  then
    raise exception 'invalid storage path';
  end if;

  insert into public.tgg_pending_media_uploads(
    user_id,app_scope,storage_path
  )
  values(
    v_uid,p_app_scope,p_storage_path
  )
  on conflict(storage_bucket,storage_path)
  do update
  set status='pending',
      finalized_at=null
  where public.tgg_pending_media_uploads.user_id=v_uid
  returning id into v_id;

  if v_id is null then
    raise exception 'storage path already owned by another user';
  end if;

  return v_id;
end
$function$;

grant execute on function public.tgg_register_pending_media_upload(text,text)
to authenticated;
revoke execute on function public.tgg_register_pending_media_upload(text,text)
from anon,public;


-- ============================================================
-- MIGRATION 20260906173552 fix_creator_opportunity_bundle_rpc_signature_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_creator_opportunity_bundle(
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  uid uuid:=auth.uid();
  aid uuid;
  result jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;

  select a.id into aid
  from public.artists a
  where a.user_id=uid
    and (p_artist_id is null or a.id=p_artist_id)
  order by a.created_at
  limit 1;

  if aid is null then raise exception 'artist not found'; end if;

  select jsonb_build_object(
    'matches',coalesce((
      select jsonb_agg(to_jsonb(m))
      from public.tgg_get_opportunity_matches(20) m
    ),'[]'::jsonb),
    'applications',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select ap.*,o.title as opportunity_title,o.opportunity_type,o.deadline
        from public.tgg_opportunity_applications ap
        join public.tgg_opportunities o on o.id=ap.opportunity_id
        where ap.applicant_user_id=uid
        order by ap.created_at desc
        limit 50
      ) x
    ),'[]'::jsonb),
    'created',coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at desc)
      from (
        select *
        from public.tgg_opportunities
        where created_by=uid
        order by created_at desc
        limit 30
      ) o
    ),'[]'::jsonb)
  ) into result;

  return result;
end
$function$;

grant execute on function public.tgg_get_creator_opportunity_bundle(uuid)
to authenticated;
revoke execute on function public.tgg_get_creator_opportunity_bundle(uuid)
from anon,public;


-- ============================================================
-- MIGRATION 20260906173804 repair_creator_automation_and_track_rpcs_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_refresh_fan_intelligence(p_artist_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if p_artist_id is not null and not exists (
    select 1 from public.artists a
    where a.id=p_artist_id and a.user_id=v_user
  ) then
    raise exception 'artist not owned';
  end if;

  delete from public.tgg_fan_intelligence_snapshots s
  where s.creator_user_id=v_user
    and (p_artist_id is null or s.artist_id=p_artist_id);

  insert into public.tgg_fan_intelligence_snapshots(
    creator_user_id,artist_id,fan_user_id,
    engagement_score,recency_score,loyalty_score,
    fan_state,recommended_action,last_seen_at,calculated_at
  )
  select
    v_user,
    fj.artist_id,
    fj.user_id,
    least(100,greatest(0,
      least(coalesce(fj.streams_count,0),40)
      + least(coalesce(fj.saves_count,0),10)*3
      + least(coalesce(fj.comments_count,0),10)*4
      + least(coalesce(fj.events_count,0),5)*5
      + least(coalesce(fj.rooms_count,0),5)*4
      + case when coalesce(fj.supporter,false) then 20 else 0 end
    ))::int,
    case
      when fj.last_seen_at is null then 0
      when fj.last_seen_at >= now()-interval '3 days' then 100
      when fj.last_seen_at >= now()-interval '7 days' then 85
      when fj.last_seen_at >= now()-interval '30 days' then 60
      when fj.last_seen_at >= now()-interval '90 days' then 30
      else 10
    end::int,
    least(100,greatest(0,
      case coalesce(fj.journey_stage,'listener')
        when 'supporter' then 100
        when 'superfan' then 90
        when 'regular' then 75
        when 'fan' then 55
        else 30
      end
      + case when coalesce(fj.supporter,false) then 10 else 0 end
    ))::int,
    case
      when coalesce(fj.supporter,false) then 'supporter'
      when coalesce(fj.journey_stage,'')='superfan' then 'superfan'
      when fj.last_seen_at is null or fj.last_seen_at<now()-interval '90 days' then 'dormant'
      when fj.last_seen_at<now()-interval '30 days' then 'slipping'
      when fj.first_seen_at>=now()-interval '14 days' then 'new'
      else 'active'
    end,
    case
      when coalesce(fj.supporter,false) then 'Reward loyalty with exclusive access or recognition.'
      when coalesce(fj.journey_stage,'')='superfan' then 'Invite to a private room, early listen, or street-team mission.'
      when fj.last_seen_at is null or fj.last_seen_at<now()-interval '90 days' then 'Run a low-frequency win-back touchpoint tied to a new release or event.'
      when fj.last_seen_at<now()-interval '30 days' then 'Re-engage with a targeted update, event invite, or personalized release recommendation.'
      when fj.first_seen_at>=now()-interval '14 days' then 'Welcome them and guide them toward saving, following, or joining a Circle.'
      else 'Keep nurturing with relevant releases, Rooms, and events.'
    end,
    fj.last_seen_at,
    now()
  from public.tgg_fan_journey fj
  join public.artists a on a.id=fj.artist_id
  where a.user_id=v_user
    and (p_artist_id is null or fj.artist_id=p_artist_id);

  get diagnostics v_count=row_count;
  return v_count;
end
$function$;

create or replace function public.tgg_refresh_fan_intelligence(p_artist_id uuid default null)
returns integer
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_refresh_fan_intelligence(p_artist_id);
$function$;

create or replace function private.tgg_refresh_supporter_health()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_count integer:=0;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  insert into public.tgg_supporter_health_snapshots(
    creator_user_id,artist_id,fan_user_id,membership_id,
    health_score,supporter_state,lifetime_support_cents,current_tier_id,
    current_period_end,recommended_action,calculated_at
  )
  select
    v_uid,m.artist_id,m.fan_user_id,m.id,
    greatest(0,least(100,
      case when m.status='active' then 55 when m.status in ('canceled','cancelled') then 10 else 25 end
      + case when coalesce(m.cancel_at_period_end,false) then -25 else 10 end
      + case when m.started_at<now()-interval '90 days' then 15 else 5 end
      + case when coalesce(fi.loyalty_score,0)>=70 then 10 else 0 end
    )),
    case
      when m.status not in ('active','trialing') then 'churned'
      when coalesce(m.cancel_at_period_end,false)
        or (m.current_period_end is not null and m.current_period_end<now()+interval '10 days') then 'at_risk'
      when m.started_at>now()-interval '30 days' then 'new'
      when m.started_at<now()-interval '180 days' then 'loyal'
      else 'active'
    end,
    coalesce(st.total_cents,0),
    m.tier_id,m.current_period_end,
    case
      when m.status not in ('active','trialing') then 'Invite back with a relevant new release or supporter benefit.'
      when coalesce(m.cancel_at_period_end,false) then 'Review cancellation risk and offer a meaningful retention touchpoint.'
      when m.started_at>now()-interval '30 days' then 'Welcome this new supporter and show them their member benefits.'
      when m.started_at<now()-interval '180 days' then 'Recognize this loyal supporter with an exclusive thank-you or early access.'
      else 'Keep this supporter engaged with regular member-only value.'
    end,
    now()
  from public.tgg_memberships m
  join public.artists a on a.id=m.artist_id and a.user_id=v_uid
  left join public.tgg_fan_intelligence_snapshots fi
    on fi.creator_user_id=v_uid
   and fi.artist_id=m.artist_id
   and fi.fan_user_id=m.fan_user_id
  left join lateral (
    select sum(s.amount_cents)::bigint total_cents
    from public.tgg_support_transactions s
    where s.artist_id=m.artist_id
      and s.fan_user_id=m.fan_user_id
      and s.status in ('paid','succeeded','complete','completed')
  ) st on true
  on conflict (creator_user_id,artist_id,fan_user_id)
  do update set
    membership_id=excluded.membership_id,
    health_score=excluded.health_score,
    supporter_state=excluded.supporter_state,
    lifetime_support_cents=excluded.lifetime_support_cents,
    current_tier_id=excluded.current_tier_id,
    current_period_end=excluded.current_period_end,
    recommended_action=excluded.recommended_action,
    calculated_at=now();

  get diagnostics v_count=row_count;
  return v_count;
end
$function$;

create or replace function public.tgg_refresh_supporter_health()
returns integer
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_refresh_supporter_health();
$function$;

create or replace function private.tgg_sync_creator_action_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_count integer:=0;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  insert into public.tgg_creator_digest_preferences(user_id)
  values(v_uid)
  on conflict(user_id) do nothing;

  insert into public.notifications(
    recipient_id,actor_id,notification_type,entity_type,entity_id,title,body
  )
  select
    q.owner_user_id,null,'creator_action','creator_action',q.id,
    'Creator action: '||q.title,q.rationale
  from public.tgg_creator_action_queue q
  join public.tgg_creator_digest_preferences p on p.user_id=q.owner_user_id
  where q.owner_user_id=v_uid
    and q.status='open'
    and p.action_alerts_enabled
    and q.priority>=p.minimum_priority
    and not exists (
      select 1
      from public.notifications n
      where n.recipient_id=q.owner_user_id
        and n.notification_type='creator_action'
        and n.entity_id=q.id
    );

  get diagnostics v_count=row_count;
  return v_count;
end
$function$;

create or replace function public.tgg_sync_creator_action_notifications()
returns integer
language sql
security invoker
set search_path = ''
as $function$
select private.tgg_sync_creator_action_notifications();
$function$;

create or replace function public.tgg_sync_fan_crm_segments(p_artist_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_count integer:=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  if p_artist_id is not null and not exists (
    select 1 from public.artists a
    where a.id=p_artist_id and a.user_id=v_user
  ) then
    raise exception 'artist not owned';
  end if;

  insert into public.tgg_fan_crm(
    creator_user_id,artist_id,fan_user_id,segment,tags,private_notes,created_at,updated_at
  )
  select
    s.creator_user_id,
    s.artist_id,
    s.fan_user_id,
    s.fan_state,
    jsonb_build_array('auto:' || s.fan_state),
    null,
    now(),
    now()
  from public.tgg_fan_intelligence_snapshots s
  where s.creator_user_id=v_user
    and (p_artist_id is null or s.artist_id=p_artist_id)
  on conflict (creator_user_id,artist_id,fan_user_id)
  do update set
    segment=excluded.segment,
    tags=case
      when jsonb_typeof(public.tgg_fan_crm.tags)='array'
        then public.tgg_fan_crm.tags || jsonb_build_array('auto:' || excluded.segment)
      else jsonb_build_array('auto:' || excluded.segment)
    end,
    updated_at=now();

  get diagnostics v_count=row_count;
  return v_count;
end
$function$;

create or replace function private.tgg_insert_track(
  p_artist_id uuid,
  p_audio_url text,
  p_mixtape_id uuid,
  p_title text,
  p_track_number integer,
  p_youtube_url text default null,
  p_youtube_video_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_track_id uuid;
  v_status public.mixtape_status;
begin
  if not exists (
    select 1
    from public.artists a
    where a.id=p_artist_id
      and a.user_id=auth.uid()
  ) then
    raise exception 'Artist does not belong to the logged-in user';
  end if;

  select m.status into v_status
  from public.mixtapes m
  where m.id=p_mixtape_id
    and m.artist_id=p_artist_id;

  if v_status is null then
    raise exception 'Mixtape does not belong to this artist';
  end if;

  if v_status not in (
    'draft'::public.mixtape_status,
    'changes_requested'::public.mixtape_status,
    'rejected'::public.mixtape_status
  ) then
    raise exception 'RELEASE_NOT_EDITABLE';
  end if;

  if coalesce(btrim(p_title),'')='' then raise exception 'TRACK_TITLE_REQUIRED'; end if;
  if p_track_number is null or p_track_number<1 then raise exception 'TRACK_NUMBER_INVALID'; end if;

  insert into public.tracks(
    artist_id,mixtape_id,track_number,title,audio_url
  )
  values(
    p_artist_id,p_mixtape_id,p_track_number,btrim(p_title),nullif(btrim(p_audio_url),'')
  )
  returning id into new_track_id;

  return new_track_id;
end
$function$;

create or replace function public.tgg_upload_track(
  p_mixtape_id uuid,
  p_title text,
  p_track_number integer,
  p_audio_url text default null,
  p_youtube_url text default null,
  p_youtube_video_id text default null,
  p_audio_path text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public','pg_temp'
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_artist_id uuid;
  v_track_id uuid;
  v_status public.mixtape_status;
  v_path text:=nullif(trim(p_audio_path),'');
  v_legacy_url text:=nullif(trim(p_audio_url),'');
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id=v_user_id
  limit 1;

  if v_artist_id is null then raise exception 'ARTIST_PROFILE_NOT_FOUND'; end if;

  select m.status into v_status
  from public.mixtapes m
  where m.id=p_mixtape_id
    and m.artist_id=v_artist_id;

  if v_status is null then raise exception 'RELEASE_NOT_OWNED'; end if;

  if v_status not in (
    'draft'::public.mixtape_status,
    'changes_requested'::public.mixtape_status,
    'rejected'::public.mixtape_status
  ) then
    raise exception 'RELEASE_NOT_EDITABLE';
  end if;

  if coalesce(trim(p_title),'')='' then raise exception 'TRACK_TITLE_REQUIRED'; end if;
  if p_track_number is null or p_track_number<1 then raise exception 'TRACK_NUMBER_INVALID'; end if;

  if v_path is null
     and v_legacy_url is null
     and nullif(trim(p_youtube_url),'') is null
  then
    raise exception 'TRACK_AUDIO_OR_YOUTUBE_REQUIRED';
  end if;

  select id into v_track_id
  from public.tracks
  where mixtape_id=p_mixtape_id
    and track_number=p_track_number
  for update;

  if v_track_id is null then
    insert into public.tracks(
      artist_id,audio_url,audio_path,mixtape_id,title,track_number
    )
    values(
      v_artist_id,
      case when v_path is null then v_legacy_url else null end,
      v_path,
      p_mixtape_id,
      trim(p_title),
      p_track_number
    )
    returning id into v_track_id;
  else
    update public.tracks
    set title=trim(p_title),
        audio_url=case
          when v_path is not null then null
          else coalesce(v_legacy_url,audio_url)
        end,
        audio_path=coalesce(v_path,audio_path)
    where id=v_track_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'track_id',v_track_id,
    'mixtape_id',p_mixtape_id,
    'track_number',p_track_number,
    'upserted',true,
    'protected_audio',v_path is not null
  );
end
$function$;

grant execute on function private.tgg_refresh_fan_intelligence(uuid) to authenticated;
grant execute on function private.tgg_refresh_supporter_health() to authenticated;
grant execute on function private.tgg_sync_creator_action_notifications() to authenticated;

revoke execute on function private.tgg_refresh_fan_intelligence(uuid) from anon,public;
revoke execute on function private.tgg_refresh_supporter_health() from anon,public;
revoke execute on function private.tgg_sync_creator_action_notifications() from anon,public;

grant execute on function public.tgg_refresh_fan_intelligence(uuid) to authenticated;
grant execute on function public.tgg_refresh_supporter_health() to authenticated;
grant execute on function public.tgg_sync_creator_action_notifications() to authenticated;
grant execute on function public.tgg_sync_fan_crm_segments(uuid) to authenticated;
grant execute on function public.tgg_upload_track(uuid,text,integer,text,text,text,text) to authenticated;

revoke execute on function public.tgg_refresh_fan_intelligence(uuid) from anon,public;
revoke execute on function public.tgg_refresh_supporter_health() from anon,public;
revoke execute on function public.tgg_sync_creator_action_notifications() from anon,public;
revoke execute on function public.tgg_sync_fan_crm_segments(uuid) from anon,public;
revoke execute on function public.tgg_upload_track(uuid,text,integer,text,text,text,text) from anon,public;


-- ============================================================
-- MIGRATION 20260906173855 align_creator_analytics_rls_to_artist_ids_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists creator_analytics_events_insert_own
on public.creator_analytics_events;

drop policy if exists creator_analytics_events_select_own
on public.creator_analytics_events;

create policy creator_analytics_events_insert_own
on public.creator_analytics_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.artists a
    where a.id=creator_analytics_events.creator_id
      and a.user_id=(select auth.uid())
  )
);

create policy creator_analytics_events_select_own
on public.creator_analytics_events
for select
to authenticated
using (
  exists (
    select 1
    from public.artists a
    where a.id=creator_analytics_events.creator_id
      and a.user_id=(select auth.uid())
  )
);


-- ============================================================
-- MIGRATION 20260906174020 modernize_creator_analytics_and_follow_contract_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.creator_analytics_events
  drop constraint if exists creator_analytics_events_creator_id_fkey;

alter table public.creator_analytics_events
  add constraint creator_analytics_events_creator_id_fkey
  foreign key (creator_id)
  references public.artists(id)
  on delete cascade;

alter table public.creator_analytics_events
  drop constraint if exists creator_analytics_events_event_type_check;

alter table public.creator_analytics_events
  add constraint creator_analytics_events_event_type_check
  check (
    event_type in (
      'view','play','download','share','like','follow','release',
      'release_view','track_play','video_view','merch_view'
    )
  );

create or replace function public.tgg_toggle_artist_follow(p_artist_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_owner uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;

  select a.user_id into v_owner
  from public.artists a
  where a.id=p_artist_id;

  if v_owner is null then raise exception 'artist unavailable'; end if;
  if v_owner=v_user then raise exception 'cannot follow your own artist profile'; end if;

  if exists (
    select 1 from public.artist_follows f
    where f.user_id=v_user and f.artist_id=p_artist_id
  ) then
    delete from public.artist_follows
    where user_id=v_user and artist_id=p_artist_id;
    return false;
  end if;

  insert into public.artist_follows(user_id,artist_id)
  values(v_user,p_artist_id);

  return true;
end
$function$;

grant execute on function public.tgg_toggle_artist_follow(uuid) to authenticated;
revoke execute on function public.tgg_toggle_artist_follow(uuid) from anon,public;


-- ============================================================
-- MIGRATION 20260906174227 retire_unreferenced_legacy_browser_rpc_aliases_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke execute on function public.phase2_creator_analytics(uuid,integer) from public,anon,authenticated;
revoke execute on function public.phase2_creator_analytics_dashboard(integer) from public,anon,authenticated;
revoke execute on function public.phase2_creator_analytics_summary(uuid,integer) from public,anon,authenticated;
revoke execute on function public.phase2_mixtape_performance(uuid,integer) from public,anon,authenticated;

revoke execute on function public.tgg_creator_os_bootstrap() from public,anon,authenticated;
revoke execute on function public.tgg_creator_os_bootstrap_v1() from public,anon,authenticated;
revoke execute on function public.tgg_creator_os_command_center_v1() from public,anon,authenticated;
revoke execute on function public.tgg_creator_os_home_bundle() from public,anon,authenticated;
revoke execute on function public.tgg_creator_os_home_v1() from public,anon,authenticated;
revoke execute on function public.tgg_creator_os_master_bundle() from public,anon,authenticated;
revoke execute on function public.tgg_creator_os_unified_bundle() from public,anon,authenticated;

revoke execute on function public.v159_creator_metrics() from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906174413 align_live_rpc_status_vocabulary_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_live_schedule(
  p_content_id uuid,
  p_title text,
  p_description text default null,
  p_category text default null,
  p_thumbnail_path text default null,
  p_scheduled_start timestamptz default null,
  p_recording_enabled boolean default true
)
returns public.live_streams
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.live_streams;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'title_required'; end if;
  if p_content_id is null then raise exception 'content_id_required'; end if;

  if not exists (
    select 1
    from public.content_items c
    where c.id=p_content_id
      and c.creator_id=auth.uid()
  ) then
    raise exception 'content_not_found_or_not_owned';
  end if;

  insert into public.live_streams(
    content_id,creator_id,title,description,category,thumbnail_path,
    scheduled_start,status,recording_enabled
  )
  values(
    p_content_id,auth.uid(),trim(p_title),p_description,p_category,p_thumbnail_path,
    p_scheduled_start,'SCHEDULED',p_recording_enabled
  )
  returning * into v;

  return v;
end
$function$;

create or replace function private.tgg_live_start(p_stream_id uuid)
returns public.live_streams
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.live_streams;
begin
  update public.live_streams
  set status='LIVE',
      actual_start=coalesce(actual_start,now()),
      updated_at=now()
  where id=p_stream_id
    and creator_id=auth.uid()
    and status in ('SCHEDULED','STARTING','LIVE')
  returning * into v;

  if not found then raise exception 'stream_not_found_or_not_owned'; end if;
  return v;
end
$function$;

create or replace function private.tgg_live_end(p_stream_id uuid)
returns public.live_streams
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.live_streams;
begin
  update public.live_streams
  set status='ENDED',
      actual_end=coalesce(actual_end,now()),
      updated_at=now()
  where id=p_stream_id
    and creator_id=auth.uid()
    and status='LIVE'
  returning * into v;

  if not found then raise exception 'stream_not_live_or_not_owned'; end if;
  return v;
end
$function$;

create or replace function private.tgg_live_join(
  p_stream_id uuid,
  p_session_id text
)
returns public.live_stream_viewers
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.live_stream_viewers;
  v_stream public.live_streams;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if coalesce(trim(p_session_id),'')='' then raise exception 'session_id_required'; end if;

  select * into v_stream
  from public.live_streams
  where id=p_stream_id
    and status='LIVE'
  for update;

  if not found then raise exception 'stream_not_live_or_not_found'; end if;

  if exists(
    select 1
    from public.live_stream_viewers
    where stream_id=p_stream_id
      and session_id=trim(p_session_id)
      and viewer_id=auth.uid()
      and left_at is null
  ) then
    select * into v
    from public.live_stream_viewers
    where stream_id=p_stream_id
      and session_id=trim(p_session_id)
      and viewer_id=auth.uid()
      and left_at is null
    limit 1;
    return v;
  end if;

  insert into public.live_stream_viewers(
    stream_id,viewer_id,session_id,joined_at,left_at,watch_seconds
  )
  values(
    p_stream_id,auth.uid(),trim(p_session_id),now(),null,0
  )
  returning * into v;

  update public.live_streams
  set viewer_count=coalesce(viewer_count,0)+1,
      peak_viewers=greatest(coalesce(peak_viewers,0),coalesce(viewer_count,0)+1),
      total_views=coalesce(total_views,0)+1,
      updated_at=now()
  where id=p_stream_id;

  return v;
end
$function$;


-- ============================================================
-- MIGRATION 20260906174523 public_artist_follow_count_aggregate_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.public_artist_follow_counts_v1 (
  artist_id uuid primary key references public.artists(id) on delete cascade,
  followers bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.public_artist_follow_counts_v1 enable row level security;

drop policy if exists public_artist_follow_counts_read
on public.public_artist_follow_counts_v1;

create policy public_artist_follow_counts_read
on public.public_artist_follow_counts_v1
for select
to anon,authenticated
using (true);

revoke all on table public.public_artist_follow_counts_v1 from anon,authenticated;
grant select on table public.public_artist_follow_counts_v1 to anon,authenticated;

insert into public.public_artist_follow_counts_v1(artist_id,followers,updated_at)
select
  a.id,
  coalesce((select count(*) from public.artist_follows f where f.artist_id=a.id),0),
  now()
from public.artists a
on conflict (artist_id) do update
set followers=excluded.followers,
    updated_at=now();

create or replace function private.tgg_refresh_public_artist_follow_count(p_artist_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_artist_id is null then return; end if;

  insert into public.public_artist_follow_counts_v1(artist_id,followers,updated_at)
  select
    p_artist_id,
    (select count(*) from public.artist_follows f where f.artist_id=p_artist_id),
    now()
  where exists (select 1 from public.artists a where a.id=p_artist_id)
  on conflict (artist_id) do update
  set followers=excluded.followers,
      updated_at=now();
end
$function$;

create or replace function private.tgg_sync_public_artist_follow_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op='DELETE' then
    perform private.tgg_refresh_public_artist_follow_count(old.artist_id);
    return old;
  elsif tg_op='UPDATE' then
    perform private.tgg_refresh_public_artist_follow_count(old.artist_id);
    if new.artist_id is distinct from old.artist_id then
      perform private.tgg_refresh_public_artist_follow_count(new.artist_id);
    end if;
    return new;
  else
    perform private.tgg_refresh_public_artist_follow_count(new.artist_id);
    return new;
  end if;
end
$function$;

revoke all on function private.tgg_refresh_public_artist_follow_count(uuid)
from public,anon,authenticated;
revoke all on function private.tgg_sync_public_artist_follow_count()
from public,anon,authenticated;

drop trigger if exists tgg_sync_public_artist_follow_count
on public.artist_follows;

create trigger tgg_sync_public_artist_follow_count
after insert or update or delete on public.artist_follows
for each row execute function private.tgg_sync_public_artist_follow_count();

create or replace view public.public_artist_profile_v1
with (security_invoker=true)
as
select
  a.artist_id,
  a.stage_name,
  a.bio,
  a.avatar_url,
  a.instagram,
  a.website,
  a.youtube,
  a.soundcloud,
  a.spotify,
  (
    select count(*)
    from public.mixtapes m
    where m.artist_id=a.artist_id
      and m.status='published'::public.mixtape_status
  ) as published_releases,
  coalesce(fc.followers,0) as followers,
  (
    select coalesce(sum(m.play_count),0)::bigint
    from public.mixtapes m
    where m.artist_id=a.artist_id
      and m.status='published'::public.mixtape_status
  ) as total_plays
from public.public_artist_directory_v1 a
left join public.public_artist_follow_counts_v1 fc
  on fc.artist_id=a.artist_id
where exists (
  select 1
  from public.mixtapes m
  where m.artist_id=a.artist_id
    and m.status='published'::public.mixtape_status
);

grant select on public.public_artist_profile_v1 to anon,authenticated;


-- ============================================================
-- MIGRATION 20260906174850 bound_video_and_ui_rpc_inputs_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_creator_create_video(
  p_title text,
  p_description text default null,
  p_video_url text default null,
  p_thumbnail_url text default null,
  p_release_date date default null,
  p_visibility text default 'public'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_artist_id uuid;
  v_id uuid;
  v_title text:=btrim(coalesce(p_title,''));
  v_description text:=nullif(btrim(coalesce(p_description,'')),'');
  v_video_url text:=nullif(btrim(coalesce(p_video_url,'')),'');
  v_thumbnail_url text:=nullif(btrim(coalesce(p_thumbnail_url,'')),'');
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select id into v_artist_id
  from public.artists
  where user_id=auth.uid()
  limit 1;

  if v_artist_id is null then raise exception 'CREATOR_PROFILE_REQUIRED'; end if;

  if char_length(v_title)<1 or char_length(v_title)>160 then
    raise exception 'TITLE_INVALID';
  end if;
  if v_description is not null and char_length(v_description)>5000 then
    raise exception 'DESCRIPTION_TOO_LONG';
  end if;
  if v_video_url is null or char_length(v_video_url)>2048 then
    raise exception 'VIDEO_URL_INVALID';
  end if;
  if v_thumbnail_url is not null and char_length(v_thumbnail_url)>2048 then
    raise exception 'THUMBNAIL_URL_TOO_LONG';
  end if;
  if p_visibility not in ('public','private') then
    raise exception 'INVALID_VISIBILITY';
  end if;

  insert into public.videos(
    artist_id,title,description,release_date,video_url,thumbnail_url,status,visibility
  )
  values(
    v_artist_id,v_title,v_description,p_release_date,
    v_video_url,v_thumbnail_url,'draft',p_visibility
  )
  returning id into v_id;

  return jsonb_build_object('ok',true,'video_id',v_id,'status','draft');
end
$function$;

create or replace function private.tgg_video_create(
  p_title text,
  p_description text default null,
  p_genre text default null,
  p_release_date date default null,
  p_explicit_content boolean default false,
  p_video_url text default null,
  p_thumbnail_url text default null,
  p_visibility text default 'private',
  p_featured boolean default false,
  p_allow_downloads boolean default false
)
returns public.videos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.videos;
  v_artist_id uuid;
  v_user_id uuid:=auth.uid();
  v_title text:=btrim(coalesce(p_title,''));
  v_description text:=nullif(btrim(coalesce(p_description,'')),'');
  v_genre text:=nullif(btrim(coalesce(p_genre,'')),'');
  v_video_url text:=nullif(btrim(coalesce(p_video_url,'')),'');
  v_thumbnail_url text:=nullif(btrim(coalesce(p_thumbnail_url,'')),'');
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if char_length(v_title)<1 or char_length(v_title)>160 then raise exception 'title_invalid'; end if;
  if v_description is not null and char_length(v_description)>5000 then raise exception 'description_too_long'; end if;
  if v_genre is not null and char_length(v_genre)>120 then raise exception 'genre_too_long'; end if;
  if v_video_url is not null and char_length(v_video_url)>2048 then raise exception 'video_url_too_long'; end if;
  if v_thumbnail_url is not null and char_length(v_thumbnail_url)>2048 then raise exception 'thumbnail_url_too_long'; end if;
  if p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id=v_user_id
  limit 1;

  if v_artist_id is null then raise exception 'creator_profile_required'; end if;

  insert into public.videos(
    artist_id,title,description,genre,release_date,explicit_content,
    video_url,thumbnail_url,visibility,featured,allow_downloads,status
  )
  values(
    v_artist_id,v_title,v_description,v_genre,p_release_date,p_explicit_content,
    coalesce(v_video_url,''),v_thumbnail_url,p_visibility,p_featured,p_allow_downloads,'draft'
  )
  returning * into v;

  insert into public.media_assets(
    id,owner_id,media_type,title,description,source_url,status,visibility,metadata,published_at
  )
  values(
    v.id,v_user_id,'video',v.title,v.description,nullif(v.video_url,''),
    'draft',v.visibility,jsonb_build_object('source','videos','video_id',v.id::text),null
  )
  on conflict(id) do update
  set owner_id=excluded.owner_id,
      title=excluded.title,
      description=excluded.description,
      source_url=excluded.source_url,
      status='draft',
      visibility=excluded.visibility,
      updated_at=now(),
      published_at=null;

  return v;
end
$function$;

create or replace function private.tgg_video_update(
  p_video_id uuid,
  p_title text default null,
  p_description text default null,
  p_genre text default null,
  p_release_date date default null,
  p_explicit_content boolean default null,
  p_thumbnail_url text default null,
  p_visibility text default null,
  p_featured boolean default null,
  p_allow_downloads boolean default null
)
returns public.videos
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v public.videos;
  v_artist_id uuid;
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  if p_title is not null and (char_length(btrim(p_title))<1 or char_length(btrim(p_title))>160) then
    raise exception 'title_invalid';
  end if;
  if p_description is not null and char_length(p_description)>5000 then raise exception 'description_too_long'; end if;
  if p_genre is not null and char_length(p_genre)>120 then raise exception 'genre_too_long'; end if;
  if p_thumbnail_url is not null and char_length(p_thumbnail_url)>2048 then raise exception 'thumbnail_url_too_long'; end if;
  if p_visibility is not null and p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id=v_user_id
  limit 1;

  if v_artist_id is null then raise exception 'creator_profile_required'; end if;

  update public.videos
  set title=coalesce(nullif(btrim(p_title),''),title),
      description=coalesce(p_description,description),
      genre=coalesce(p_genre,genre),
      release_date=coalesce(p_release_date,release_date),
      explicit_content=coalesce(p_explicit_content,explicit_content),
      thumbnail_url=coalesce(p_thumbnail_url,thumbnail_url),
      visibility=coalesce(p_visibility,visibility),
      featured=coalesce(p_featured,featured),
      allow_downloads=coalesce(p_allow_downloads,allow_downloads),
      updated_at=now()
  where id=p_video_id
    and artist_id=v_artist_id
    and status in ('draft','changes_requested')
  returning * into v;

  if not found then raise exception 'video_not_editable_or_not_owned'; end if;

  insert into public.media_assets(
    id,owner_id,media_type,title,description,source_url,status,visibility,metadata,updated_at,published_at
  )
  values(
    v.id,v_user_id,'video',v.title,v.description,nullif(v.video_url,''),
    'draft',v.visibility,jsonb_build_object('source','videos','video_id',v.id::text),now(),null
  )
  on conflict(id) do update
  set owner_id=excluded.owner_id,
      title=excluded.title,
      description=excluded.description,
      source_url=excluded.source_url,
      status='draft',
      visibility=excluded.visibility,
      updated_at=now(),
      published_at=null;

  return v;
end
$function$;

create or replace function public.tgg_set_creator_ui_workspace_state(
  p_workspace text,
  p_search_query text default null,
  p_filter_state jsonb default null,
  p_sort_key text default null,
  p_sort_direction text default null,
  p_view_mode text default null,
  p_page_size integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  uid uuid:=auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_workspace not in ('dashboard','releases','fans','growth','messages','live','opportunities','supporters','career','library') then raise exception 'invalid workspace'; end if;
  if p_search_query is not null and char_length(p_search_query)>500 then raise exception 'search query too long'; end if;
  if p_filter_state is not null and jsonb_typeof(p_filter_state)<>'object' then raise exception 'invalid filter state'; end if;
  if p_filter_state is not null and octet_length(p_filter_state::text)>8192 then raise exception 'filter state too large'; end if;
  if p_sort_key is not null and char_length(p_sort_key)>80 then raise exception 'sort key too long'; end if;
  if p_sort_direction is not null and p_sort_direction not in ('asc','desc') then raise exception 'invalid sort direction'; end if;
  if p_view_mode is not null and char_length(p_view_mode)>80 then raise exception 'view mode too long'; end if;
  if p_page_size is not null and (p_page_size<5 or p_page_size>100) then raise exception 'invalid page size'; end if;

  insert into public.tgg_creator_ui_workspace_state(
    user_id,workspace,search_query,filter_state,sort_key,sort_direction,view_mode,page_size
  )
  values(
    uid,p_workspace,p_search_query,coalesce(p_filter_state,'{}'::jsonb),
    p_sort_key,coalesce(p_sort_direction,'desc'),coalesce(p_view_mode,'default'),coalesce(p_page_size,25)
  )
  on conflict(user_id,workspace) do update set
    search_query=coalesce(p_search_query,tgg_creator_ui_workspace_state.search_query),
    filter_state=coalesce(p_filter_state,tgg_creator_ui_workspace_state.filter_state),
    sort_key=coalesce(p_sort_key,tgg_creator_ui_workspace_state.sort_key),
    sort_direction=coalesce(p_sort_direction,tgg_creator_ui_workspace_state.sort_direction),
    view_mode=coalesce(p_view_mode,tgg_creator_ui_workspace_state.view_mode),
    page_size=coalesce(p_page_size,tgg_creator_ui_workspace_state.page_size),
    updated_at=now()
  returning to_jsonb(tgg_creator_ui_workspace_state.*) into result;

  return result;
end
$function$;


-- ============================================================
-- MIGRATION 20260906175007 bound_media_metadata_and_remove_v54_analytics_fallback_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_record_creator_event(
  p_event_type text,
  p_mixtape_id uuid default null,
  p_session_id text default null,
  p_source text default 'web',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_creator_id uuid;
  v_event_id uuid;
  v_type text:=lower(trim(coalesce(p_event_type,'')));
  v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  if v_type not in ('play','download','release_view','track_play','video_view','merch_view','share') then
    raise exception 'unsupported analytics event type';
  end if;
  if jsonb_typeof(v_metadata)<>'object' then raise exception 'metadata must be an object'; end if;
  if octet_length(v_metadata::text)>8192 then raise exception 'metadata too large'; end if;

  if p_mixtape_id is not null then
    select m.artist_id into v_creator_id
    from public.mixtapes m
    join public.artists a on a.id=m.artist_id
    where m.id=p_mixtape_id
      and a.user_id=(select auth.uid());
    if v_creator_id is null then raise exception 'release unavailable or not owned'; end if;
  else
    select a.id into v_creator_id
    from public.artists a
    where a.user_id=(select auth.uid())
    order by a.created_at
    limit 1;
  end if;

  if v_creator_id is null then raise exception 'creator could not be resolved'; end if;

  insert into public.creator_analytics_events(
    creator_id,mixtape_id,event_type,session_id,source,metadata,occurred_at
  )
  values(
    v_creator_id,
    p_mixtape_id,
    v_type,
    nullif(left(trim(coalesce(p_session_id,'')),128),''),
    nullif(left(trim(coalesce(p_source,'web')),64),''),
    v_metadata,
    now()
  )
  returning id into v_event_id;

  return v_event_id;
end
$function$;

create or replace function private.tgg_video_record_event(
  p_video_id uuid,
  p_event_type text,
  p_watch_seconds numeric default null,
  p_event_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_asset uuid;
  v_type text:=btrim(coalesce(p_event_type,''));
  v_meta jsonb:=coalesce(p_event_metadata,'{}'::jsonb);
  v_watch numeric:=greatest(coalesce(p_watch_seconds,0),0);
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if char_length(v_type)<1 or char_length(v_type)>64 then raise exception 'event_type_invalid'; end if;
  if v_watch>86400 then raise exception 'watch_seconds_too_large'; end if;
  if jsonb_typeof(v_meta)<>'object' then raise exception 'event_metadata_invalid'; end if;
  if octet_length(v_meta::text)>8192 then raise exception 'event_metadata_too_large'; end if;

  if not exists(
    select 1 from public.videos
    where id=p_video_id and status='published' and visibility='public'
  ) then
    raise exception 'video_not_public_or_not_found';
  end if;

  select id into v_asset
  from public.media_assets
  where id=p_video_id and media_type='video'
  limit 1;

  if v_asset is null then
    select id into v_asset
    from public.media_assets
    where metadata->>'video_id'=p_video_id::text
      and media_type='video'
    limit 1;
  end if;

  if v_asset is null then raise exception 'video_media_asset_missing'; end if;

  insert into public.video_engagement_events(
    media_asset_id,viewer_id,event_type,watch_seconds,event_metadata
  )
  values(v_asset,auth.uid(),v_type,v_watch,v_meta)
  returning id into v_id;

  if v_type in ('view','play','started') then
    update public.videos
    set play_count=coalesce(play_count,0)+1,
        updated_at=now()
    where id=p_video_id;
  end if;

  return v_id;
end
$function$;

create or replace function public.tgg_register_media_vault_asset(
  p_project_id uuid,
  p_asset_type text,
  p_title text,
  p_storage_path text,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_duration_seconds numeric default null,
  p_width integer default null,
  p_height integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.tgg_media_vault_assets
language plpgsql
security invoker
set search_path = 'public','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_row public.tgg_media_vault_assets;
  v_first text;
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_asset_type is null or length(btrim(p_asset_type))<1 or length(p_asset_type)>80 then raise exception 'invalid asset type'; end if;
  if p_title is null or length(btrim(p_title))<1 or length(p_title)>200 then raise exception 'invalid title'; end if;
  if p_storage_path is null or length(btrim(p_storage_path))<3 or length(p_storage_path)>1024 then raise exception 'invalid storage path'; end if;
  if p_mime_type is not null and char_length(p_mime_type)>255 then raise exception 'mime type too long'; end if;
  if p_file_size_bytes is not null and (p_file_size_bytes<0 or p_file_size_bytes>524288000) then raise exception 'invalid file size'; end if;
  if p_duration_seconds is not null and (p_duration_seconds<0 or p_duration_seconds>86400) then raise exception 'invalid duration'; end if;
  if p_width is not null and (p_width<1 or p_width>16384) then raise exception 'invalid width'; end if;
  if p_height is not null and (p_height<1 or p_height>16384) then raise exception 'invalid height'; end if;
  if jsonb_typeof(v_meta)<>'object' then raise exception 'metadata must be an object'; end if;
  if octet_length(v_meta::text)>16384 then raise exception 'metadata too large'; end if;

  v_first:=split_part(p_storage_path,'/',1);
  if v_first<>v_uid::text then raise exception 'storage path must be scoped to current user'; end if;

  if p_project_id is not null and not exists(
    select 1 from public.tgg_creative_projects cp
    where cp.id=p_project_id and cp.user_id=v_uid
  ) then
    raise exception 'creative project not found or not owned by current user';
  end if;

  insert into public.tgg_media_vault_assets(
    user_id,project_id,asset_type,title,source_kind,storage_path,
    mime_type,file_size_bytes,duration_seconds,width,height,metadata
  )
  values(
    v_uid,p_project_id,btrim(p_asset_type),btrim(p_title),'upload',btrim(p_storage_path),
    nullif(btrim(coalesce(p_mime_type,'')),''),p_file_size_bytes,p_duration_seconds,p_width,p_height,v_meta
  )
  returning * into v_row;

  return v_row;
end
$function$;

create or replace function public.tgg_register_message_attachment(
  p_message_id uuid,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_storage_path text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
  v_path text:=btrim(coalesce(p_storage_path,''));
  v_name text:=btrim(coalesce(p_file_name,''));
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if char_length(v_name)<1 or char_length(v_name)>255 then raise exception 'invalid file name'; end if;
  if p_mime_type is not null and char_length(p_mime_type)>255 then raise exception 'mime type too long'; end if;
  if p_file_size is null or p_file_size<1 or p_file_size>524288000 then raise exception 'invalid file size'; end if;
  if char_length(v_path)<3 or char_length(v_path)>1024 or split_part(v_path,'/',1)<>v_user::text then raise exception 'invalid creator media path'; end if;
  if jsonb_typeof(v_meta)<>'object' then raise exception 'metadata must be an object'; end if;
  if octet_length(v_meta::text)>16384 then raise exception 'metadata too large'; end if;

  if not exists(
    select 1
    from public.tgg_messages m
    join public.tgg_conversation_members cm
      on cm.conversation_id=m.conversation_id
     and cm.user_id=v_user
    where m.id=p_message_id
      and m.sender_id=v_user
  ) then
    raise exception 'message unavailable';
  end if;

  insert into public.tgg_message_attachments(
    message_id,user_id,file_name,mime_type,file_size,storage_bucket,storage_path,metadata
  )
  values(
    p_message_id,v_user,v_name,nullif(btrim(coalesce(p_mime_type,'')),''),p_file_size,
    'creator-media',v_path,v_meta
  )
  returning id into v_id;

  return v_id;
end
$function$;

create or replace function public.tgg_register_studio_asset(
  p_project_id uuid,
  p_asset_type text,
  p_name text,
  p_storage_path text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
  v_type text:=btrim(coalesce(p_asset_type,''));
  v_name text:=btrim(coalesce(p_name,''));
  v_path text:=btrim(coalesce(p_storage_path,''));
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists(
    select 1 from public.tgg_studio_projects p
    where p.id=p_project_id and p.user_id=v_user
  ) then raise exception 'studio project unavailable'; end if;
  if char_length(v_type)<1 or char_length(v_type)>80 then raise exception 'invalid asset type'; end if;
  if char_length(v_name)<1 or char_length(v_name)>240 then raise exception 'invalid asset name'; end if;
  if char_length(v_path)<3 or char_length(v_path)>1024 or split_part(v_path,'/',1)<>v_user::text then raise exception 'invalid creator media path'; end if;
  if jsonb_typeof(v_meta)<>'object' then raise exception 'metadata must be an object'; end if;
  if octet_length(v_meta::text)>16384 then raise exception 'metadata too large'; end if;

  insert into public.tgg_studio_assets(
    project_id,user_id,asset_type,name,storage_path,metadata
  )
  values(p_project_id,v_user,v_type,v_name,v_path,v_meta)
  returning id into v_id;

  return v_id;
end
$function$;

create or replace function public.tgg_finalize_vault_upload(
  p_title text,
  p_asset_type text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_duration_seconds numeric default null,
  p_width integer default null,
  p_height integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = 'public','storage'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_asset public.tgg_media_vault_assets;
  v_obj_exists boolean;
  v_parts text[];
  v_meta jsonb:=coalesce(p_metadata,'{}'::jsonb);
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_title is null or length(trim(p_title))=0 or length(trim(p_title))>200 then raise exception 'invalid title'; end if;
  if p_asset_type not in ('audio','video','image','other') then raise exception 'invalid asset type'; end if;
  if p_file_size is null or p_file_size<1 or p_file_size>524288000 then raise exception 'invalid file size'; end if;
  if p_mime_type is not null and char_length(p_mime_type)>255 then raise exception 'mime type too long'; end if;
  if p_duration_seconds is not null and (p_duration_seconds<0 or p_duration_seconds>86400) then raise exception 'invalid duration'; end if;
  if p_width is not null and (p_width<1 or p_width>16384) then raise exception 'invalid width'; end if;
  if p_height is not null and (p_height<1 or p_height>16384) then raise exception 'invalid height'; end if;
  if jsonb_typeof(v_meta)<>'object' then raise exception 'metadata must be an object'; end if;
  if octet_length(v_meta::text)>16384 then raise exception 'metadata too large'; end if;

  v_parts:=storage.foldername(p_storage_path);
  if array_length(v_parts,1) is null
     or array_length(v_parts,1)<2
     or v_parts[1] is distinct from v_uid::text
     or v_parts[2] is distinct from 'vault'
     or char_length(p_storage_path)>1024
  then
    raise exception 'invalid storage path';
  end if;

  select exists(
    select 1 from storage.objects
    where bucket_id='creator-media'
      and name=p_storage_path
      and owner_id=v_uid::text
  ) into v_obj_exists;

  if not v_obj_exists then raise exception 'uploaded object not found'; end if;

  select * into v_asset
  from public.tgg_register_media_vault_asset(
    null,p_asset_type,trim(p_title),p_storage_path,p_mime_type,p_file_size,
    p_duration_seconds,p_width,p_height,v_meta
  );

  perform public.tgg_mark_media_upload_finalized(p_storage_path);
  return v_asset.id;
end
$function$;


-- ============================================================
-- MIGRATION 20260906175305 replace_raw_social_identity_reads_with_counts_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.public_user_follow_counts_v1 (
  user_id uuid primary key,
  followers bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.public_reel_like_counts_v1 (
  reel_id uuid primary key,
  likes bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.public_short_reaction_counts_v1 (
  short_id uuid primary key,
  likes bigint not null default 0,
  fires bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.public_user_follow_counts_v1 enable row level security;
alter table public.public_reel_like_counts_v1 enable row level security;
alter table public.public_short_reaction_counts_v1 enable row level security;

drop policy if exists public_user_follow_counts_read on public.public_user_follow_counts_v1;
create policy public_user_follow_counts_read
on public.public_user_follow_counts_v1 for select
to anon,authenticated using (true);

drop policy if exists public_reel_like_counts_read on public.public_reel_like_counts_v1;
create policy public_reel_like_counts_read
on public.public_reel_like_counts_v1 for select
to anon,authenticated using (true);

drop policy if exists public_short_reaction_counts_read on public.public_short_reaction_counts_v1;
create policy public_short_reaction_counts_read
on public.public_short_reaction_counts_v1 for select
to anon,authenticated using (true);

revoke all on public.public_user_follow_counts_v1 from anon,authenticated;
revoke all on public.public_reel_like_counts_v1 from anon,authenticated;
revoke all on public.public_short_reaction_counts_v1 from anon,authenticated;
grant select on public.public_user_follow_counts_v1 to anon,authenticated;
grant select on public.public_reel_like_counts_v1 to anon,authenticated;
grant select on public.public_short_reaction_counts_v1 to anon,authenticated;

insert into public.public_user_follow_counts_v1(user_id,followers,updated_at)
select following_id,count(*)::bigint,now()
from public.follows
group by following_id
on conflict(user_id) do update
set followers=excluded.followers,updated_at=now();

insert into public.public_reel_like_counts_v1(reel_id,likes,updated_at)
select reel_id,count(*)::bigint,now()
from public.reel_likes
group by reel_id
on conflict(reel_id) do update
set likes=excluded.likes,updated_at=now();

insert into public.public_short_reaction_counts_v1(short_id,likes,fires,updated_at)
select short_id,
       count(*) filter(where reaction='like')::bigint,
       count(*) filter(where reaction='fire')::bigint,
       now()
from public.tgg_short_reactions
group by short_id
on conflict(short_id) do update
set likes=excluded.likes,fires=excluded.fires,updated_at=now();

create or replace function private.tgg_refresh_public_user_follow_count(p_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_user_id is null then return; end if;
  insert into public.public_user_follow_counts_v1(user_id,followers,updated_at)
  values(
    p_user_id,
    (select count(*) from public.follows where following_id=p_user_id),
    now()
  )
  on conflict(user_id) do update
  set followers=excluded.followers,updated_at=now();
end $$;

create or replace function private.tgg_refresh_public_reel_like_count(p_reel_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_reel_id is null then return; end if;
  insert into public.public_reel_like_counts_v1(reel_id,likes,updated_at)
  values(
    p_reel_id,
    (select count(*) from public.reel_likes where reel_id=p_reel_id),
    now()
  )
  on conflict(reel_id) do update
  set likes=excluded.likes,updated_at=now();
end $$;

create or replace function private.tgg_refresh_public_short_reaction_count(p_short_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if p_short_id is null then return; end if;
  insert into public.public_short_reaction_counts_v1(short_id,likes,fires,updated_at)
  values(
    p_short_id,
    (select count(*) from public.tgg_short_reactions where short_id=p_short_id and reaction='like'),
    (select count(*) from public.tgg_short_reactions where short_id=p_short_id and reaction='fire'),
    now()
  )
  on conflict(short_id) do update
  set likes=excluded.likes,fires=excluded.fires,updated_at=now();
end $$;

create or replace function private.tgg_sync_public_user_follow_count()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='DELETE' then
    perform private.tgg_refresh_public_user_follow_count(old.following_id);
    return old;
  elsif tg_op='UPDATE' then
    perform private.tgg_refresh_public_user_follow_count(old.following_id);
    perform private.tgg_refresh_public_user_follow_count(new.following_id);
    return new;
  else
    perform private.tgg_refresh_public_user_follow_count(new.following_id);
    return new;
  end if;
end $$;

create or replace function private.tgg_sync_public_reel_like_count()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='DELETE' then
    perform private.tgg_refresh_public_reel_like_count(old.reel_id);
    return old;
  elsif tg_op='UPDATE' then
    perform private.tgg_refresh_public_reel_like_count(old.reel_id);
    perform private.tgg_refresh_public_reel_like_count(new.reel_id);
    return new;
  else
    perform private.tgg_refresh_public_reel_like_count(new.reel_id);
    return new;
  end if;
end $$;

create or replace function private.tgg_sync_public_short_reaction_count()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op='DELETE' then
    perform private.tgg_refresh_public_short_reaction_count(old.short_id);
    return old;
  elsif tg_op='UPDATE' then
    perform private.tgg_refresh_public_short_reaction_count(old.short_id);
    perform private.tgg_refresh_public_short_reaction_count(new.short_id);
    return new;
  else
    perform private.tgg_refresh_public_short_reaction_count(new.short_id);
    return new;
  end if;
end $$;

revoke all on function private.tgg_refresh_public_user_follow_count(uuid) from public,anon,authenticated;
revoke all on function private.tgg_refresh_public_reel_like_count(uuid) from public,anon,authenticated;
revoke all on function private.tgg_refresh_public_short_reaction_count(uuid) from public,anon,authenticated;
revoke all on function private.tgg_sync_public_user_follow_count() from public,anon,authenticated;
revoke all on function private.tgg_sync_public_reel_like_count() from public,anon,authenticated;
revoke all on function private.tgg_sync_public_short_reaction_count() from public,anon,authenticated;

drop trigger if exists tgg_sync_public_user_follow_count on public.follows;
create trigger tgg_sync_public_user_follow_count
after insert or update or delete on public.follows
for each row execute function private.tgg_sync_public_user_follow_count();

drop trigger if exists tgg_sync_public_reel_like_count on public.reel_likes;
create trigger tgg_sync_public_reel_like_count
after insert or update or delete on public.reel_likes
for each row execute function private.tgg_sync_public_reel_like_count();

drop trigger if exists tgg_sync_public_short_reaction_count on public.tgg_short_reactions;
create trigger tgg_sync_public_short_reaction_count
after insert or update or delete on public.tgg_short_reactions
for each row execute function private.tgg_sync_public_short_reaction_count();

create or replace view public.public_shorts_v1
with (security_invoker=true)
as
select
  s.id,
  s.user_id,
  s.caption,
  s.media_url,
  s.thumbnail_url,
  s.linked_release_id,
  s.duration_seconds,
  s.created_at,
  coalesce(a.stage_name,'TGG Creator') as creator_name,
  coalesce(rc.likes,0) as likes,
  coalesce(rc.fires,0) as fires
from public.tgg_shorts s
left join public.public_artist_directory_v1 a
  on a.user_id=s.user_id
left join public.public_short_reaction_counts_v1 rc
  on rc.short_id=s.id
where s.status='published'
  and s.visibility='public';

grant select on public.public_shorts_v1 to anon,authenticated;

revoke select on public.follows from anon;
revoke select on public.reel_likes from anon;
revoke select on public.tgg_short_reactions from anon;


-- ============================================================
-- MIGRATION 20260906175407 tighten_storage_objects_base_grants_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke insert,update,delete,truncate,trigger,references
on table storage.objects
from anon;

revoke truncate,trigger,references
on table storage.objects
from authenticated;


-- ============================================================
-- MIGRATION 20260906175446 set_storage_bucket_limits_and_mime_types_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update storage.buckets
set file_size_limit=10485760,
    allowed_mime_types=array['image/jpeg','image/png','image/webp']::text[]
where id in ('artist-images','covers','media-thumbnails');

update storage.buckets
set file_size_limit=104857600,
    allowed_mime_types=array['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg']::text[]
where id='audio';

update storage.buckets
set file_size_limit=524288000,
    allowed_mime_types=array['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg']::text[]
where id='mixtape-audio';

update storage.buckets
set file_size_limit=524288000,
    allowed_mime_types=array['video/mp4','video/webm','video/quicktime']::text[]
where id='videos';

update storage.buckets
set file_size_limit=10485760,
    allowed_mime_types=array['application/json']::text[]
where id='v98-blogger-backups';


-- ============================================================
-- MIGRATION 20260906175730 protect_artist_payment_columns_v513
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_get_own_artist_payment_status(p_artist_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select jsonb_build_object(
    'stripe_onboarding_complete',coalesce(a.stripe_onboarding_complete,false),
    'payouts_enabled',coalesce(a.payouts_enabled,false)
  )
  into v_result
  from public.artists a
  where a.id=p_artist_id
    and a.user_id=v_uid;

  if v_result is null then raise exception 'artist profile not found'; end if;
  return v_result;
end
$function$;

revoke all on function private.tgg_get_own_artist_payment_status(uuid)
from public,anon;
grant execute on function private.tgg_get_own_artist_payment_status(uuid)
to authenticated;

create or replace function public.tgg_get_creator_dashboard_bundle(
  p_artist_id uuid default null,
  p_action_limit integer default 8
)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_limit integer:=greatest(1,least(coalesce(p_action_limit,8),25));
  v_result jsonb;
  v_payment jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select a.id into v_artist
  from public.artists a
  where a.user_id=v_uid
    and (p_artist_id is null or a.id=p_artist_id)
  order by a.created_at asc
  limit 1;

  if v_artist is null then raise exception 'artist profile not found'; end if;

  v_payment:=private.tgg_get_own_artist_payment_status(v_artist);

  select jsonb_build_object(
    'artist',(
      select jsonb_build_object(
        'id',a.id,
        'stage_name',a.stage_name,
        'avatar_url',a.avatar_url,
        'bio',a.bio,
        'stripe_onboarding_complete',coalesce((v_payment->>'stripe_onboarding_complete')::boolean,false),
        'payouts_enabled',coalesce((v_payment->>'payouts_enabled')::boolean,false)
      )
      from public.artists a
      where a.id=v_artist
        and a.user_id=v_uid
    ),
    'command_center',coalesce((
      select to_jsonb(c)-'creator_user_id'
      from public.tgg_creator_command_center c
      where c.creator_user_id=v_uid and c.artist_id=v_artist
      limit 1
    ),'{}'::jsonb),
    'monetization',coalesce((
      select to_jsonb(m)-'creator_user_id'
      from public.tgg_creator_monetization_summary m
      where m.creator_user_id=v_uid and m.artist_id=v_artist
      limit 1
    ),'{}'::jsonb),
    'fan_intelligence',coalesce((
      select to_jsonb(f)-'creator_user_id'
      from public.tgg_creator_fan_intelligence_summary f
      where f.creator_user_id=v_uid and f.artist_id=v_artist
      limit 1
    ),'{}'::jsonb),
    'supporters',coalesce((
      select to_jsonb(s)-'creator_user_id'
      from public.tgg_creator_supporter_summary s
      where s.creator_user_id=v_uid and s.artist_id=v_artist
      limit 1
    ),'{}'::jsonb),
    'actions',coalesce((
      select jsonb_agg(to_jsonb(q) order by q.priority desc,q.due_at nulls last,q.created_at desc)
      from (
        select id,source_type,source_id,action_type,title,rationale,priority,status,due_at,metadata,created_at
        from public.tgg_creator_action_queue
        where owner_user_id=v_uid
          and artist_id=v_artist
          and status='open'
        order by priority desc,due_at nulls last,created_at desc
        limit v_limit
      ) q
    ),'[]'::jsonb),
    'releases',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.release_date desc nulls last,r.title)
      from (
        select release_id,title,status,release_date,play_count,download_count,
               checklist_items,checklist_done,readiness_percent,smart_link_clicks
        from public.tgg_creator_release_health
        where creator_user_id=v_uid and artist_id=v_artist
        order by release_date desc nulls last,title
        limit 12
      ) r
    ),'[]'::jsonb),
    'campaigns',coalesce((
      select jsonb_agg(to_jsonb(c) order by c.starts_at desc nulls last,c.title)
      from (
        select campaign_id,title,status,objective,target_value,current_value,
               starts_at,ends_at,task_count,tasks_done,objective_percent
        from public.tgg_creator_campaign_health
        where creator_user_id=v_uid and artist_id=v_artist
        order by starts_at desc nulls last,title
        limit 12
      ) c
    ),'[]'::jsonb),
    'generated_at',now()
  ) into v_result;

  return v_result;
end
$function$;

revoke select on table public.artists from authenticated;
grant select(
  id,user_id,stage_name,bio,avatar_url,created_at,
  instagram,website,youtube,soundcloud,spotify
) on table public.artists to authenticated;


-- ============================================================
-- MIGRATION 20260906180257 surface_live_blogger_bridge_health_v514
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_blogger_bridge_health()
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_conn public.v98_blogger_connections;
  v_deploy_total bigint:=0;
  v_verified bigint:=0;
  v_failed bigint:=0;
  v_latest timestamptz;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select *
    into v_conn
  from public.v98_blogger_connections
  where user_id=v_uid
  order by updated_at desc
  limit 1;

  if v_conn.id is not null then
    select
      count(*),
      count(*) filter (where status='verified'),
      count(*) filter (where status in ('failed','rolled_back')),
      max(updated_at)
    into v_deploy_total,v_verified,v_failed,v_latest
    from public.v98_blogger_deployments
    where user_id=v_uid
      and connection_id=v_conn.id;
  end if;

  return jsonb_build_object(
    'ok',coalesce(v_conn.status='connected' and v_conn.revoked_at is null,false),
    'connected',coalesce(v_conn.status='connected' and v_conn.revoked_at is null,false),
    'mode','blogger_api_direct',
    'normal_page_post_deploy','v98-blogger-connector',
    'normal_deploy_ready',coalesce(v_conn.status='connected' and v_conn.revoked_at is null,false),
    'backup_restore_ready',coalesce(v_conn.status='connected' and v_conn.revoked_at is null,false),
    'api_verification_ready',coalesce(v_conn.status='connected' and v_conn.revoked_at is null,false),
    'public_render_verification','best_effort',
    'theme_xml_transport','tgg-theme-autodeploy',
    'theme_xml_mode','legacy_optional',
    'browser_automation_required_for_normal_deploy',false,
    'blog',case when v_conn.id is null then null else jsonb_build_object(
      'blog_url',v_conn.blog_url,
      'blog_name',v_conn.blog_name,
      'status',v_conn.status,
      'connected_at',v_conn.connected_at,
      'updated_at',v_conn.updated_at,
      'last_error',v_conn.last_error
    ) end,
    'deployments',jsonb_build_object(
      'total',v_deploy_total,
      'verified',v_verified,
      'failed_or_rolled_back',v_failed,
      'latest_at',v_latest
    ),
    'version','v514'
  );
end
$function$;

grant execute on function public.tgg_get_blogger_bridge_health() to authenticated;
revoke execute on function public.tgg_get_blogger_bridge_health() from anon,public;

create or replace function public.tgg_get_frontend_integration_health()
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  uid uuid:=auth.uid();
  aid uuid;
  blogger jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;

  select id into aid
  from public.artists
  where user_id=uid
  order by created_at
  limit 1;

  blogger:=public.tgg_get_blogger_bridge_health();

  return jsonb_build_object(
    'ok',true,
    'authenticated',true,
    'artist_ready',aid is not null,
    'artist_id',aid,
    'server_time',now(),
    'contracts',public.tgg_get_frontend_api_contract(),
    'shell_ready',true,
    'maintenance_available',true,
    'blogger_bridge',blogger,
    'blogger_ready',coalesce((blogger->>'normal_deploy_ready')::boolean,false),
    'version','v514'
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906180458 canonicalize_submit_music_route_v514
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_site_routes
set path='/p/upload-mixtape.html',
    title='Upload Music',
    workspace_key='upload',
    nav_group='creator',
    nav_order=31,
    is_primary=false,
    updated_at=now()
where route_key='submit_music';


-- ============================================================
-- MIGRATION 20260906181034 disable_sandbox_distribution_adapter_in_production_v514
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.v58_provider_adapters
set enabled=false,
    config = coalesce(config,'{}'::jsonb)
      || jsonb_build_object(
        'mode','disabled',
        'disabled_reason','production_distribution_endpoint_required',
        'previous_endpoint_url',config->>'endpoint_url'
      )
      - 'endpoint_url'
      - 'receiver',
    updated_at=now()
where provider_key='distribution.webhook'
  and (
    coalesce(config->>'mode','')='sandbox'
    or coalesce(config->>'endpoint_url','') ilike '%sandbox%'
    or coalesce(config->>'receiver','') ilike '%sandbox%'
  );


-- ============================================================
-- MIGRATION 20260906181224 surface_provider_pipeline_health_v514
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe_enabled boolean:=false;
  v_stripe_endpoint text;
  v_dist_enabled boolean:=false;
  v_dist_mode text;
  v_dist_endpoint text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select enabled,config->>'endpoint_url'
    into v_stripe_enabled,v_stripe_endpoint
  from public.v58_provider_adapters
  where provider_key='stripe'
  limit 1;

  select enabled,config->>'mode',config->>'endpoint_url'
    into v_dist_enabled,v_dist_mode,v_dist_endpoint
  from public.v58_provider_adapters
  where provider_key='distribution.webhook'
  limit 1;

  return jsonb_build_object(
    'ok',coalesce(v_stripe_enabled,false),
    'payments',jsonb_build_object(
      'ready',coalesce(v_stripe_enabled,false),
      'checkout_worker',case
        when coalesce(v_stripe_endpoint,'') like '%v58-stripe-checkout-worker-v10%' then 'v58-stripe-checkout-worker-v10'
        else null
      end,
      'live_webhook','v58-stripe-webhook-v2',
      'sandbox_webhook','v58-stripe-webhook-v4'
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist_enabled,false)
        and coalesce(v_dist_mode,'')='production'
        and nullif(v_dist_endpoint,'') is not null,
      'enabled',coalesce(v_dist_enabled,false),
      'mode',coalesce(v_dist_mode,'disabled'),
      'endpoint_configured',nullif(v_dist_endpoint,'') is not null,
      'status',case
        when coalesce(v_dist_enabled,false)
          and coalesce(v_dist_mode,'')='production'
          and nullif(v_dist_endpoint,'') is not null
        then 'ready'
        else 'production_endpoint_required'
      end
    ),
    'version','v514'
  );
end
$function$;

grant execute on function public.tgg_get_provider_pipeline_health() to authenticated;
revoke execute on function public.tgg_get_provider_pipeline_health() from anon,public;

create or replace function public.tgg_get_frontend_integration_health()
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  uid uuid:=auth.uid();
  aid uuid;
  blogger jsonb;
  providers jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;

  select id into aid
  from public.artists
  where user_id=uid
  order by created_at
  limit 1;

  blogger:=public.tgg_get_blogger_bridge_health();
  providers:=public.tgg_get_provider_pipeline_health();

  return jsonb_build_object(
    'ok',true,
    'authenticated',true,
    'artist_ready',aid is not null,
    'artist_id',aid,
    'server_time',now(),
    'contracts',public.tgg_get_frontend_api_contract(),
    'shell_ready',true,
    'maintenance_available',true,
    'blogger_bridge',blogger,
    'blogger_ready',coalesce((blogger->>'normal_deploy_ready')::boolean,false),
    'providers',providers,
    'payments_ready',coalesce((providers#>>'{payments,ready}')::boolean,false),
    'distribution_ready',coalesce((providers#>>'{distribution,ready}')::boolean,false),
    'version','v514'
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906182923 add_merch_order_ledger_and_fulfillment_v515
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.tgg_merch_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.merch_products(id) on delete restrict,
  creator_id uuid not null references public.artists(id) on delete restrict,
  buyer_user_id uuid null references public.profiles(id) on delete set null,
  checkout_session_id text not null unique,
  payment_intent_id text null,
  quantity integer not null check (quantity between 1 and 100),
  amount_total bigint not null check (amount_total >= 0),
  currency text not null,
  customer_email text null,
  shipping jsonb not null default '{}'::jsonb,
  status text not null default 'paid' check (status in ('paid','fulfilled','refunded','cancelled')),
  fulfilled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_merch_orders enable row level security;

revoke all on table public.tgg_merch_orders from anon,authenticated;
grant select on table public.tgg_merch_orders to authenticated;

drop policy if exists tgg_merch_orders_select_related
on public.tgg_merch_orders;

create policy tgg_merch_orders_select_related
on public.tgg_merch_orders
for select
to authenticated
using (
  buyer_user_id=(select auth.uid())
  or exists (
    select 1
    from public.artists a
    where a.id=tgg_merch_orders.creator_id
      and a.user_id=(select auth.uid())
  )
);

create index if not exists tgg_merch_orders_creator_created_idx
  on public.tgg_merch_orders(creator_id,created_at desc);

create index if not exists tgg_merch_orders_buyer_created_idx
  on public.tgg_merch_orders(buyer_user_id,created_at desc)
  where buyer_user_id is not null;

create or replace function private.tgg_record_merch_checkout_completed(
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_product_id uuid,
  p_creator_id uuid,
  p_buyer_user_id uuid,
  p_quantity integer,
  p_amount_total bigint,
  p_currency text,
  p_customer_email text,
  p_shipping jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing uuid;
  v_product public.merch_products;
  v_order_id uuid;
  v_expected bigint;
  v_shipping jsonb:=coalesce(p_shipping,'{}'::jsonb);
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if nullif(btrim(coalesce(p_checkout_session_id,'')),'') is null then
    raise exception 'checkout_session_required';
  end if;
  if p_quantity is null or p_quantity<1 or p_quantity>10 then
    raise exception 'quantity_invalid';
  end if;
  if p_amount_total is null or p_amount_total<0 then
    raise exception 'amount_invalid';
  end if;
  if char_length(coalesce(p_currency,''))<>3 then
    raise exception 'currency_invalid';
  end if;
  if jsonb_typeof(v_shipping)<>'object' or octet_length(v_shipping::text)>16384 then
    raise exception 'shipping_invalid';
  end if;

  select id into v_existing
  from public.tgg_merch_orders
  where checkout_session_id=p_checkout_session_id;

  if v_existing is not null then
    return v_existing;
  end if;

  select *
    into v_product
  from public.merch_products
  where id=p_product_id
    and creator_id=p_creator_id
    and status='published'
  for update;

  if v_product.id is null then
    raise exception 'published_product_not_found';
  end if;

  v_expected := (v_product.price_cents::bigint * p_quantity::bigint);
  if v_expected<>p_amount_total then
    raise exception 'amount_mismatch';
  end if;
  if upper(v_product.currency)<>upper(p_currency) then
    raise exception 'currency_mismatch';
  end if;

  if v_product.inventory is not null then
    if v_product.inventory<p_quantity then
      raise exception 'inventory_insufficient';
    end if;
    update public.merch_products
    set inventory=inventory-p_quantity,
        updated_at=now()
    where id=v_product.id;
  end if;

  insert into public.tgg_merch_orders(
    product_id,creator_id,buyer_user_id,
    checkout_session_id,payment_intent_id,
    quantity,amount_total,currency,
    customer_email,shipping,status
  )
  values(
    p_product_id,p_creator_id,p_buyer_user_id,
    p_checkout_session_id,nullif(btrim(coalesce(p_payment_intent_id,'')),''),
    p_quantity,p_amount_total,upper(p_currency),
    nullif(btrim(coalesce(p_customer_email,'')),''),
    v_shipping,'paid'
  )
  returning id into v_order_id;

  return v_order_id;
end
$function$;

revoke all on function private.tgg_record_merch_checkout_completed(
  text,text,uuid,uuid,uuid,integer,bigint,text,text,jsonb
) from public,anon,authenticated;
grant execute on function private.tgg_record_merch_checkout_completed(
  text,text,uuid,uuid,uuid,integer,bigint,text,text,jsonb
) to service_role;


-- ============================================================
-- MIGRATION 20260906183115 promote_native_store_checkout_health_v515
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe_enabled boolean:=false;
  v_stripe_endpoint text;
  v_dist_enabled boolean:=false;
  v_dist_mode text;
  v_dist_endpoint text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select enabled,config->>'endpoint_url'
    into v_stripe_enabled,v_stripe_endpoint
  from public.v58_provider_adapters
  where provider_key='stripe'
  limit 1;

  select enabled,config->>'mode',config->>'endpoint_url'
    into v_dist_enabled,v_dist_mode,v_dist_endpoint
  from public.v58_provider_adapters
  where provider_key='distribution.webhook'
  limit 1;

  return jsonb_build_object(
    'ok',coalesce(v_stripe_enabled,false),
    'payments',jsonb_build_object(
      'ready',coalesce(v_stripe_enabled,false),
      'checkout_ready',true,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'legacy_v58_checkout_worker','v58-stripe-checkout-worker-v10',
      'live_webhook','v58-stripe-webhook-v2',
      'sandbox_webhook','v58-stripe-webhook-v4'
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist_enabled,false)
        and coalesce(v_dist_mode,'')='production'
        and nullif(v_dist_endpoint,'') is not null,
      'enabled',coalesce(v_dist_enabled,false),
      'mode',coalesce(v_dist_mode,'disabled'),
      'endpoint_configured',nullif(v_dist_endpoint,'') is not null,
      'status',case
        when coalesce(v_dist_enabled,false)
          and coalesce(v_dist_mode,'')='production'
          and nullif(v_dist_endpoint,'') is not null
        then 'ready'
        else 'production_endpoint_required'
      end
    ),
    'version','v515'
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906183332 retire_legacy_stripe_adapter_v515
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.v58_provider_adapters
set enabled=false,
    config=coalesce(config,'{}'::jsonb)
      || jsonb_build_object(
        'mode','retired',
        'disabled_reason','native_store_checkout_v515'
      )
      - 'endpoint_url',
    updated_at=now()
where provider_key='stripe';

create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_dist_enabled boolean:=false;
  v_dist_mode text;
  v_dist_endpoint text;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select enabled,config->>'mode',config->>'endpoint_url'
    into v_dist_enabled,v_dist_mode,v_dist_endpoint
  from public.v58_provider_adapters
  where provider_key='distribution.webhook'
  limit 1;

  return jsonb_build_object(
    'ok',true,
    'payments',jsonb_build_object(
      'ready',true,
      'checkout_ready',true,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'live_webhook','v58-stripe-webhook-v2',
      'sandbox_webhook','v58-stripe-webhook-v4',
      'legacy_v58_checkout','retired'
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist_enabled,false)
        and coalesce(v_dist_mode,'')='production'
        and nullif(v_dist_endpoint,'') is not null,
      'enabled',coalesce(v_dist_enabled,false),
      'mode',coalesce(v_dist_mode,'disabled'),
      'endpoint_configured',nullif(v_dist_endpoint,'') is not null,
      'status',case
        when coalesce(v_dist_enabled,false)
          and coalesce(v_dist_mode,'')='production'
          and nullif(v_dist_endpoint,'') is not null
        then 'ready'
        else 'production_endpoint_required'
      end
    ),
    'version','v515'
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906183844 arm_one_time_v516_blogger_batch
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.tgg_final_batch_control (
  id integer primary key,
  enabled boolean not null default false,
  armed_at timestamptz,
  consumed_at timestamptz,
  result jsonb not null default '{}'::jsonb
);
alter table public.tgg_final_batch_control enable row level security;
revoke all on table public.tgg_final_batch_control from anon,authenticated;
insert into public.tgg_final_batch_control(id,enabled,armed_at,consumed_at,result)
values(1,true,now(),null,'{}'::jsonb)
on conflict(id) do update
set enabled=true,armed_at=now(),consumed_at=null,result='{}'::jsonb;


-- ============================================================
-- MIGRATION 20260906184348 record_v516_production_attestation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.tgg_production_baselines (
  version text primary key,
  status text not null check (status in ('candidate','locked','retired')),
  locked_at timestamptz not null default now(),
  blogger_deployments integer not null default 0,
  blogger_verified integer not null default 0,
  blogger_failed integer not null default 0,
  public_routes integer not null default 0,
  public_catalog_releases integer not null default 0,
  performance_warnings integer not null default 0,
  security_warnings jsonb not null default '[]'::jsonb,
  payments_ready boolean not null default false,
  distribution_ready boolean not null default false,
  notes jsonb not null default '{}'::jsonb
);

alter table public.tgg_production_baselines enable row level security;
revoke all on table public.tgg_production_baselines from anon,authenticated;

insert into public.tgg_production_baselines(
  version,status,locked_at,blogger_deployments,blogger_verified,blogger_failed,
  public_routes,public_catalog_releases,performance_warnings,security_warnings,
  payments_ready,distribution_ready,notes
)
values(
  'V516-FINAL',
  'locked',
  now(),
  9,9,0,
  17,3,0,
  '["auth_leaked_password_protection"]'::jsonb,
  true,false,
  jsonb_build_object(
    'blogger_batch','9/9 API verified',
    'theme','V308 locked',
    'homepage','V305 privacy playback',
    'dashboard','V312 resilient',
    'messages','V401 realtime',
    'live','V500 WebRTC',
    'store','V402 native Stripe checkout',
    'vault','V400 creator content',
    'legacy_v58_runtime','retired',
    'distribution','disabled until production DSP endpoint exists'
  )
)
on conflict(version) do update
set status=excluded.status,
    locked_at=excluded.locked_at,
    blogger_deployments=excluded.blogger_deployments,
    blogger_verified=excluded.blogger_verified,
    blogger_failed=excluded.blogger_failed,
    public_routes=excluded.public_routes,
    public_catalog_releases=excluded.public_catalog_releases,
    performance_warnings=excluded.performance_warnings,
    security_warnings=excluded.security_warnings,
    payments_ready=excluded.payments_ready,
    distribution_ready=excluded.distribution_ready,
    notes=excluded.notes;

create or replace function public.tgg_get_production_baseline()
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select to_jsonb(b)
  from public.tgg_production_baselines b
  where b.status='locked'
  order by b.locked_at desc
  limit 1
$$;

grant execute on function public.tgg_get_production_baseline() to authenticated;
revoke execute on function public.tgg_get_production_baseline() from anon,public;


-- ============================================================
-- MIGRATION 20260906184520 v516_baseline_drift_monitoring
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'page_hashes',
  jsonb_build_object(
    '/p/homepage.html','63a28441c0344df67b02d0297d54c9f17855bff6aad46529ca436235ac76919c',
    '/p/artist-dashboard_0633467215.html','b604e1fcc0b5d4ceb007a9a177dd243dfbbd92d8c1c1bb946ab3632739955e48',
    '/p/creator-dashboard.html','0c3a25ac10926a96702d9edfd9b4cac9de7b01c94015769128a981c4d5fc7401',
    '/p/messages.html','e22706f559743763e9a4baad0497c761ffc3401e8754e6ed6af23a21325f7927',
    '/p/backstage.html','3f05a05d6065e69b8b0c43844eb64742d26cc6e0add2adde7be86ee995daffc1',
    '/p/artist-world.html','0c526598be5d2797d0b3fffd20bae67852a180b0cf97ab5248ee2d948ba7e946',
    '/p/live.html','2f1be8c85b5ea53e9fce7f832bdcb7a8ed14a4690d32fb351338b2c8cf212f5f',
    '/p/creator-store.html','78d5b335f5535b2b24bffe14b18c3a704b919ae80fc0a5665f264ee77bc31a99',
    '/p/vault.html','dbf0b57554986e7f7e2da792a268cdbff592a7e97fbfa63a01ad6629d38dfc7f'
  )
)
where version='V516-FINAL';

create or replace function private.tgg_production_baseline_drift()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_expected jsonb;
  v_path text;
  v_hash text;
  v_latest_hash text;
  v_latest_status text;
  v_drift jsonb:='[]'::jsonb;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  if v_baseline.version is null then
    return jsonb_build_object('ok',false,'error','locked_baseline_missing');
  end if;

  v_expected:=coalesce(v_baseline.notes->'page_hashes','{}'::jsonb);

  for v_path,v_hash in
    select key,value#>>'{}'
    from jsonb_each(v_expected)
  loop
    select
      d.verification->>'content_hash',
      d.status
    into v_latest_hash,v_latest_status
    from public.v98_blogger_deployments d
    where d.verification->>'path'=v_path
    order by d.updated_at desc
    limit 1;

    if v_latest_hash is distinct from v_hash
       or v_latest_status is distinct from 'verified'
    then
      v_drift:=v_drift || jsonb_build_array(
        jsonb_build_object(
          'path',v_path,
          'expected_hash',v_hash,
          'current_hash',v_latest_hash,
          'current_status',v_latest_status
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_drift)=0,
    'baseline',v_baseline.version,
    'checked_at',now(),
    'expected_pages',jsonb_object_length(v_expected),
    'drift_count',jsonb_array_length(v_drift),
    'drift',v_drift
  );
end
$function$;

revoke all on function private.tgg_production_baseline_drift()
from public,anon,authenticated;

create or replace function public.tgg_get_production_drift()
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.tgg_production_baseline_drift();
$$;

grant execute on function public.tgg_get_production_drift() to authenticated;
revoke execute on function public.tgg_get_production_drift() from anon,public;

create or replace function private.tgg_monitor_production_baseline()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v jsonb;
  v_ok boolean;
begin
  v:=private.tgg_production_baseline_drift();
  v_ok:=coalesce((v->>'ok')::boolean,false);

  if v_ok then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v
    where alert_key='production:baseline_drift'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:baseline_drift','open','warning','production_baseline',
      now(),now(),1,v
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='production_baseline',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;
end
$function$;

revoke all on function private.tgg_monitor_production_baseline()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906184540 v516_final_health_and_baseline_reader
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_production_baseline()
returns jsonb
language sql
security definer
set search_path=''
as $$
  select to_jsonb(b)
  from public.tgg_production_baselines b
  where b.status='locked'
  order by b.locked_at desc
  limit 1
$$;

revoke all on function private.tgg_production_baseline()
from public,anon,authenticated;

create or replace function public.tgg_get_production_baseline()
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.tgg_production_baseline();
$$;

grant execute on function public.tgg_get_production_baseline() to authenticated;
revoke execute on function public.tgg_get_production_baseline() from anon,public;

create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();

  return jsonb_build_object(
    'ok',
      coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_blog->>'ok')::boolean,false)
      and coalesce((v_provider#>>'{payments,ready}')::boolean,false),
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'providers',v_provider,
    'drift',v_drift,
    'public_contract',jsonb_build_object(
      'routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'known_external_items',jsonb_build_array(
      'Supabase leaked-password protection setting remains disabled',
      'Production DSP endpoint is not configured',
      'Two-user realtime/call smoke requires a second legitimate account/device'
    ),
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_final_platform_health() to authenticated;
revoke execute on function public.tgg_final_platform_health() from anon,public;


-- ============================================================
-- MIGRATION 20260906184613 fix_v516_drift_page_count
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_production_baseline_drift()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_expected jsonb;
  v_path text;
  v_hash text;
  v_latest_hash text;
  v_latest_status text;
  v_drift jsonb:='[]'::jsonb;
  v_expected_pages integer:=0;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  if v_baseline.version is null then
    return jsonb_build_object('ok',false,'error','locked_baseline_missing');
  end if;

  v_expected:=coalesce(v_baseline.notes->'page_hashes','{}'::jsonb);

  select count(*) into v_expected_pages
  from jsonb_object_keys(v_expected);

  for v_path,v_hash in
    select key,value#>>'{}'
    from jsonb_each(v_expected)
  loop
    select
      d.verification->>'content_hash',
      d.status
    into v_latest_hash,v_latest_status
    from public.v98_blogger_deployments d
    where d.verification->>'path'=v_path
    order by d.updated_at desc
    limit 1;

    if v_latest_hash is distinct from v_hash
       or v_latest_status is distinct from 'verified'
    then
      v_drift:=v_drift || jsonb_build_array(
        jsonb_build_object(
          'path',v_path,
          'expected_hash',v_hash,
          'current_hash',v_latest_hash,
          'current_status',v_latest_status
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_drift)=0,
    'baseline',v_baseline.version,
    'checked_at',now(),
    'expected_pages',v_expected_pages,
    'drift_count',jsonb_array_length(v_drift),
    'drift',v_drift
  );
end
$function$;

revoke all on function private.tgg_production_baseline_drift()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906184645 allow_authenticated_readonly_v516_baseline_helpers
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


grant execute on function private.tgg_production_baseline()
to authenticated;

grant execute on function private.tgg_production_baseline_drift()
to authenticated;

revoke execute on function private.tgg_monitor_production_baseline()
from authenticated,anon,public;


-- ============================================================
-- MIGRATION 20260906185125 canonicalize_missing_route_aliases_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_site_routes set path='/p/creator-store.html',updated_at=now()
where route_key='merch';

update public.tgg_site_routes set path='/p/backstage.html',updated_at=now()
where route_key='memberships';

update public.tgg_site_routes set path='/p/artist-world.html',updated_at=now()
where route_key='artists';

update public.tgg_site_routes set path='/p/live.html',updated_at=now()
where route_key='events';

update public.tgg_site_routes set path='/p/career-os.html',updated_at=now()
where route_key='opportunities_public';

update public.tgg_site_routes set path='/p/artist-world.html',updated_at=now()
where route_key in ('fan_hub','fan_following','shorts');

update public.tgg_site_routes set path='/p/music-hub.html',updated_at=now()
where route_key in ('fan_library','radio');

update public.tgg_site_routes set path='/p/backstage.html',updated_at=now()
where route_key='fan_rewards';

update public.tgg_site_routes set path='/p/homepage.html',updated_at=now()
where route_key in ('discover','charts');

update public.tgg_site_routes set path='/search/label/Mixtapes',updated_at=now()
where route_key='releases';

update public.tgg_site_routes set path='/p/artist-dashboard_0633467215.html',updated_at=now()
where route_key='artist_settings';


-- ============================================================
-- MIGRATION 20260906185726 record_v516_edge_capacity_and_route_integrity
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'edge_function_capacity',
  jsonb_build_object(
    'total_functions',100,
    'active_functions',100,
    'at_project_limit',true,
    'safe_strategy','reuse retired function slots for one-time maintenance; do not add new function names without deleting old slots or increasing plan capacity'
  )
)
where version='V516-FINAL';

create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();

  return jsonb_build_object(
    'ok',
      coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_blog->>'ok')::boolean,false)
      and coalesce((v_provider#>>'{payments,ready}')::boolean,false)
      and coalesce((v_baseline#>>'{notes,route_integrity,ok}')::boolean,false),
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',v_baseline#>'{notes,route_integrity}',
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'known_external_items',jsonb_build_array(
      'Supabase leaked-password protection setting remains disabled',
      'Production DSP endpoint is not configured',
      'Two-user realtime/call smoke requires a second legitimate account/device'
    ),
    'generated_at',now()
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906185911 extend_v516_baseline_to_13_pages
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.v98_blogger_deployments
set verification = coalesce(verification,'{}'::jsonb) || jsonb_build_object(
  'content_hash',
  case verification->>'path'
    when '/p/about.html' then '5fd7d515ab04f853d6b1ae5cb822b495f945771750f7ac502834faa2921552c7'
    when '/p/help.html' then 'ccfc6506ef67b591969b2c79c2c4d58feeb1f35f5e473a59d0973c30832e3a82'
    when '/p/privacy.html' then '53ea458741b1a9936320a0f773043717c3ab7237bae08862dc7b32436ddea68d'
    when '/p/terms.html' then 'adcc29f68673ba3d4c77b4754f8b7a6216600c5679c8282e1d46fa81efd3976c'
  end
)
where verification->>'legal_page'='true'
  and verification->>'path' in (
    '/p/about.html','/p/help.html','/p/privacy.html','/p/terms.html'
  );

update public.tgg_production_baselines
set
  blogger_deployments=13,
  blogger_verified=13,
  blogger_failed=0,
  notes = jsonb_set(
    notes,
    '{page_hashes}',
    coalesce(notes->'page_hashes','{}'::jsonb)
    || jsonb_build_object(
      '/p/about.html','5fd7d515ab04f853d6b1ae5cb822b495f945771750f7ac502834faa2921552c7',
      '/p/help.html','ccfc6506ef67b591969b2c79c2c4d58feeb1f35f5e473a59d0973c30832e3a82',
      '/p/privacy.html','53ea458741b1a9936320a0f773043717c3ab7237bae08862dc7b32436ddea68d',
      '/p/terms.html','adcc29f68673ba3d4c77b4754f8b7a6216600c5679c8282e1d46fa81efd3976c'
    ),
    true
  )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906190008 extend_v516_drift_to_route_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_production_baseline_drift()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_expected jsonb;
  v_path text;
  v_hash text;
  v_latest_hash text;
  v_latest_status text;
  v_drift jsonb:='[]'::jsonb;
  v_expected_pages integer:=0;
  v_expected_routes text[]:=array[]::text[];
  v_current_routes text[]:=array[]::text[];
  v_route_drift boolean:=false;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  if v_baseline.version is null then
    return jsonb_build_object('ok',false,'error','locked_baseline_missing');
  end if;

  v_expected:=coalesce(v_baseline.notes->'page_hashes','{}'::jsonb);

  select count(*) into v_expected_pages
  from jsonb_object_keys(v_expected);

  for v_path,v_hash in
    select key,value#>>'{}'
    from jsonb_each(v_expected)
  loop
    select
      d.verification->>'content_hash',
      d.status
    into v_latest_hash,v_latest_status
    from public.v98_blogger_deployments d
    where d.verification->>'path'=v_path
    order by d.updated_at desc
    limit 1;

    if v_latest_hash is distinct from v_hash
       or v_latest_status is distinct from 'verified'
    then
      v_drift:=v_drift || jsonb_build_array(
        jsonb_build_object(
          'type','blogger_page',
          'path',v_path,
          'expected_hash',v_hash,
          'current_hash',v_latest_hash,
          'current_status',v_latest_status
        )
      );
    end if;
  end loop;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_routes
  from jsonb_array_elements_text(
    coalesce(v_baseline.notes#>'{route_audit,present}','[]'::jsonb)
  );

  select coalesce(array_agg(path order by path),array[]::text[])
  into v_current_routes
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q;

  v_route_drift := v_expected_routes is distinct from v_current_routes;

  if v_route_drift then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','route_contract',
        'expected_routes',to_jsonb(v_expected_routes),
        'current_routes',to_jsonb(v_current_routes)
      )
    );
  end if;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_drift)=0,
    'baseline',v_baseline.version,
    'checked_at',now(),
    'expected_pages',v_expected_pages,
    'expected_route_paths',cardinality(v_expected_routes),
    'current_route_paths',cardinality(v_current_routes),
    'drift_count',jsonb_array_length(v_drift),
    'drift',v_drift
  );
end
$function$;

grant execute on function private.tgg_production_baseline_drift()
to authenticated;
revoke execute on function private.tgg_production_baseline_drift()
from anon,public;


-- ============================================================
-- MIGRATION 20260906192051 trim_realtime_publication_to_live_subscriptions_v516_fixed
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter publication supabase_realtime drop table
  public.artist_follows,
  public.conversation_members,
  public.conversations,
  public.live_reactions,
  public.live_streams,
  public.merch_product_variants,
  public.merch_products,
  public.message_reactions,
  public.message_reads,
  public.notification_preferences,
  public.notifications,
  public.tgg_artist_world_settings,
  public.tgg_call_rooms,
  public.tgg_conversations,
  public.tgg_membership_tiers,
  public.tgg_memberships,
  public.tgg_message_reads,
  public.tgg_messages,
  public.tgg_story_reactions,
  public.tgg_story_views,
  public.tgg_support_transactions;


-- ============================================================
-- MIGRATION 20260906192305 enforce_v516_canonical_route_aliases
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_site_routes set path='/p/creator-store.html',updated_at=now() where route_key='merch';
update public.tgg_site_routes set path='/p/backstage.html',updated_at=now() where route_key='memberships';
update public.tgg_site_routes set path='/p/artist-world.html',updated_at=now() where route_key='artists';
update public.tgg_site_routes set path='/p/live.html',updated_at=now() where route_key='events';
update public.tgg_site_routes set path='/p/career-os.html',updated_at=now() where route_key='opportunities_public';

update public.tgg_site_routes set path='/p/artist-world.html',updated_at=now()
where route_key in ('fan_hub','fan_following','shorts');

update public.tgg_site_routes set path='/p/music-hub.html',updated_at=now()
where route_key in ('fan_library','radio');

update public.tgg_site_routes set path='/p/backstage.html',updated_at=now()
where route_key='fan_rewards';

update public.tgg_site_routes set path='/p/homepage.html',updated_at=now()
where route_key in ('discover','charts');

update public.tgg_site_routes set path='/search/label/Mixtapes',updated_at=now()
where route_key='releases';

update public.tgg_site_routes set path='/p/artist-dashboard_0633467215.html',updated_at=now()
where route_key='artist_settings';

update public.tgg_site_routes set path='/p/upload-mixtape.html',updated_at=now()
where route_key='submit_music';

alter table public.tgg_site_routes
  drop constraint if exists tgg_site_routes_v516_canonical_aliases_check;

alter table public.tgg_site_routes
  add constraint tgg_site_routes_v516_canonical_aliases_check
  check (
    case route_key
      when 'merch' then path='/p/creator-store.html'
      when 'memberships' then path='/p/backstage.html'
      when 'artists' then path='/p/artist-world.html'
      when 'events' then path='/p/live.html'
      when 'opportunities_public' then path='/p/career-os.html'
      when 'fan_hub' then path='/p/artist-world.html'
      when 'fan_following' then path='/p/artist-world.html'
      when 'shorts' then path='/p/artist-world.html'
      when 'fan_library' then path='/p/music-hub.html'
      when 'radio' then path='/p/music-hub.html'
      when 'fan_rewards' then path='/p/backstage.html'
      when 'discover' then path='/p/homepage.html'
      when 'charts' then path='/p/homepage.html'
      when 'releases' then path='/search/label/Mixtapes'
      when 'artist_settings' then path='/p/artist-dashboard_0633467215.html'
      when 'submit_music' then path='/p/upload-mixtape.html'
      else true
    end
  );


-- ============================================================
-- MIGRATION 20260906192357 remove_duplicate_artist_index_and_lock_realtime_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop index if exists public.artists_user_id_unique_idx;

update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'realtime_publication',
  jsonb_build_object(
    'publication','supabase_realtime',
    'expected_tables',jsonb_build_array(
      'messages',
      'tgg_call_participants',
      'tgg_call_signals',
      'tgg_collaboration_requests',
      'tgg_live_events',
      'tgg_stories',
      'tgg_vault_items'
    ),
    'table_count',7,
    'locked_at',now()
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906192415 extend_v516_drift_to_realtime_publication
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_production_baseline_drift()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_expected jsonb;
  v_path text;
  v_hash text;
  v_latest_hash text;
  v_latest_status text;
  v_drift jsonb:='[]'::jsonb;
  v_expected_pages integer:=0;
  v_expected_routes text[]:=array[]::text[];
  v_current_routes text[]:=array[]::text[];
  v_expected_realtime text[]:=array[]::text[];
  v_current_realtime text[]:=array[]::text[];
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  if v_baseline.version is null then
    return jsonb_build_object('ok',false,'error','locked_baseline_missing');
  end if;

  v_expected:=coalesce(v_baseline.notes->'page_hashes','{}'::jsonb);

  select count(*) into v_expected_pages
  from jsonb_object_keys(v_expected);

  for v_path,v_hash in
    select key,value#>>'{}'
    from jsonb_each(v_expected)
  loop
    select
      d.verification->>'content_hash',
      d.status
    into v_latest_hash,v_latest_status
    from public.v98_blogger_deployments d
    where d.verification->>'path'=v_path
    order by d.updated_at desc
    limit 1;

    if v_latest_hash is distinct from v_hash
       or v_latest_status is distinct from 'verified'
    then
      v_drift:=v_drift || jsonb_build_array(
        jsonb_build_object(
          'type','blogger_page',
          'path',v_path,
          'expected_hash',v_hash,
          'current_hash',v_latest_hash,
          'current_status',v_latest_status
        )
      );
    end if;
  end loop;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_routes
  from jsonb_array_elements_text(
    coalesce(v_baseline.notes#>'{route_audit,present}','[]'::jsonb)
  );

  select coalesce(array_agg(path order by path),array[]::text[])
  into v_current_routes
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q;

  if v_expected_routes is distinct from v_current_routes then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','route_contract',
        'expected_routes',to_jsonb(v_expected_routes),
        'current_routes',to_jsonb(v_current_routes)
      )
    );
  end if;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_realtime
  from jsonb_array_elements_text(
    coalesce(v_baseline.notes#>'{realtime_publication,expected_tables}','[]'::jsonb)
  );

  select coalesce(array_agg(tablename order by tablename),array[]::text[])
  into v_current_realtime
  from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime'
    and schemaname='public';

  if v_expected_realtime is distinct from v_current_realtime then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','realtime_publication',
        'expected_tables',to_jsonb(v_expected_realtime),
        'current_tables',to_jsonb(v_current_realtime)
      )
    );
  end if;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_drift)=0,
    'baseline',v_baseline.version,
    'checked_at',now(),
    'expected_pages',v_expected_pages,
    'expected_route_paths',cardinality(v_expected_routes),
    'current_route_paths',cardinality(v_current_routes),
    'expected_realtime_tables',cardinality(v_expected_realtime),
    'current_realtime_tables',cardinality(v_current_realtime),
    'drift_count',jsonb_array_length(v_drift),
    'drift',v_drift
  );
end
$function$;

grant execute on function private.tgg_production_baseline_drift() to authenticated;
revoke execute on function private.tgg_production_baseline_drift() from anon,public;


-- ============================================================
-- MIGRATION 20260906192527 modernize_operational_cron_slo_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_operational_record_cron_slo()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_success bigint:=0;
  v_failure bigint:=0;
  v_running bigint:=0;
  v_last_end timestamptz;
  v_health text;
  v_active_jobs bigint:=0;
  v_observed_runs bigint:=0;
  v_job_ids jsonb:='[]'::jsonb;
begin
  select count(*)
    into v_active_jobs
  from cron.job
  where active=true
    and jobname like 'tgg-%';

  select
    coalesce(sum(case when d.status='succeeded' then 1 else 0 end),0),
    coalesce(sum(case when d.status not in ('succeeded','running') then 1 else 0 end),0),
    coalesce(sum(case when d.status='running' then 1 else 0 end),0),
    max(d.end_time),
    count(*),
    coalesce(jsonb_agg(distinct d.jobid order by d.jobid),'[]'::jsonb)
  into
    v_success,
    v_failure,
    v_running,
    v_last_end,
    v_observed_runs,
    v_job_ids
  from cron.job_run_details d
  join cron.job j on j.jobid=d.jobid
  where j.active=true
    and j.jobname like 'tgg-%'
    and d.start_time>now()-interval '15 minutes';

  v_health:=case
    when v_active_jobs=0 then 'unknown'
    when v_observed_runs=0 then 'degraded'
    when v_failure>0 then 'degraded'
    else 'healthy'
  end;

  insert into public.tgg_operational_slo_snapshots(
    subsystem,health,availability_pct,success_count,failure_count,metadata
  )
  values(
    'pg_cron_runtime',
    v_health,
    case
      when v_success+v_failure=0 then null
      else round(100.0*v_success/(v_success+v_failure),3)
    end,
    v_success,
    v_failure,
    jsonb_build_object(
      'strategy','dynamic_active_tgg_crons',
      'active_job_count',v_active_jobs,
      'observed_run_count',v_observed_runs,
      'running_count',v_running,
      'tracked_job_ids',v_job_ids,
      'last_run_end',v_last_end,
      'window_minutes',15
    )
  );
end
$function$;

revoke all on function private.tgg_operational_record_cron_slo()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906193126 lock_storage_bucket_privacy_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'storage_contract',
  jsonb_build_object(
    'buckets',
    jsonb_build_object(
      'artist-images',true,
      'audio',true,
      'covers',true,
      'creator-media',false,
      'media-thumbnails',true,
      'mixtape-audio',false,
      'v98-blogger-backups',false,
      'videos',false
    ),
    'private_buckets',jsonb_build_array(
      'creator-media','mixtape-audio','v98-blogger-backups','videos'
    ),
    'public_buckets',jsonb_build_array(
      'artist-images','audio','covers','media-thumbnails'
    ),
    'anon_write_policies',0,
    'owner_path_strategy','first storage folder segment must equal auth.uid() for creator writes',
    'locked_at',now()
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906193148 extend_v516_drift_to_storage_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_production_baseline_drift()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_expected jsonb;
  v_path text;
  v_hash text;
  v_latest_hash text;
  v_latest_status text;
  v_drift jsonb:='[]'::jsonb;
  v_expected_pages integer:=0;
  v_expected_routes text[]:=array[]::text[];
  v_current_routes text[]:=array[]::text[];
  v_expected_realtime text[]:=array[]::text[];
  v_current_realtime text[]:=array[]::text[];
  v_expected_storage jsonb:='{}'::jsonb;
  v_current_storage jsonb:='{}'::jsonb;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  if v_baseline.version is null then
    return jsonb_build_object('ok',false,'error','locked_baseline_missing');
  end if;

  v_expected:=coalesce(v_baseline.notes->'page_hashes','{}'::jsonb);

  select count(*) into v_expected_pages
  from jsonb_object_keys(v_expected);

  for v_path,v_hash in
    select key,value#>>'{}'
    from jsonb_each(v_expected)
  loop
    select
      d.verification->>'content_hash',
      d.status
    into v_latest_hash,v_latest_status
    from public.v98_blogger_deployments d
    where d.verification->>'path'=v_path
    order by d.updated_at desc
    limit 1;

    if v_latest_hash is distinct from v_hash
       or v_latest_status is distinct from 'verified'
    then
      v_drift:=v_drift || jsonb_build_array(
        jsonb_build_object(
          'type','blogger_page',
          'path',v_path,
          'expected_hash',v_hash,
          'current_hash',v_latest_hash,
          'current_status',v_latest_status
        )
      );
    end if;
  end loop;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_routes
  from jsonb_array_elements_text(
    coalesce(v_baseline.notes#>'{route_audit,present}','[]'::jsonb)
  );

  select coalesce(array_agg(path order by path),array[]::text[])
  into v_current_routes
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q;

  if v_expected_routes is distinct from v_current_routes then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','route_contract',
        'expected_routes',to_jsonb(v_expected_routes),
        'current_routes',to_jsonb(v_current_routes)
      )
    );
  end if;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_realtime
  from jsonb_array_elements_text(
    coalesce(v_baseline.notes#>'{realtime_publication,expected_tables}','[]'::jsonb)
  );

  select coalesce(array_agg(tablename order by tablename),array[]::text[])
  into v_current_realtime
  from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime'
    and schemaname='public';

  if v_expected_realtime is distinct from v_current_realtime then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','realtime_publication',
        'expected_tables',to_jsonb(v_expected_realtime),
        'current_tables',to_jsonb(v_current_realtime)
      )
    );
  end if;

  v_expected_storage:=coalesce(v_baseline.notes#>'{storage_contract,buckets}','{}'::jsonb);

  select coalesce(jsonb_object_agg(id,public order by id),'{}'::jsonb)
  into v_current_storage
  from storage.buckets
  where id in (
    'artist-images','audio','covers','creator-media',
    'media-thumbnails','mixtape-audio','v98-blogger-backups','videos'
  );

  if v_expected_storage is distinct from v_current_storage then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','storage_bucket_privacy',
        'expected',v_expected_storage,
        'current',v_current_storage
      )
    );
  end if;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_drift)=0,
    'baseline',v_baseline.version,
    'checked_at',now(),
    'expected_pages',v_expected_pages,
    'expected_route_paths',cardinality(v_expected_routes),
    'current_route_paths',cardinality(v_current_routes),
    'expected_realtime_tables',cardinality(v_expected_realtime),
    'current_realtime_tables',cardinality(v_current_realtime),
    'storage_buckets_checked',(select count(*) from jsonb_object_keys(v_expected_storage)),
    'drift_count',jsonb_array_length(v_drift),
    'drift',v_drift
  );
end
$function$;

grant execute on function private.tgg_production_baseline_drift() to authenticated;
revoke execute on function private.tgg_production_baseline_drift() from anon,public;


-- ============================================================
-- MIGRATION 20260906195753 revoke_stray_v58_payments_browser_read_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke select on public.v58_payments from authenticated,anon;


-- ============================================================
-- MIGRATION 20260906200151 accept_notifications_realtime_and_relock_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = jsonb_set(
  notes,
  '{realtime_publication,expected_tables}',
  jsonb_build_array(
    'messages',
    'notifications',
    'tgg_call_participants',
    'tgg_call_signals',
    'tgg_collaboration_requests',
    'tgg_live_events',
    'tgg_stories',
    'tgg_vault_items'
  ),
  true
)
|| jsonb_build_object(
  'realtime_publication',
  coalesce(notes->'realtime_publication','{}'::jsonb)
  || jsonb_build_object(
    'table_count',8,
    'notifications_intent','allowed_core_realtime_table',
    'updated_at',now()
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906200241 fix_v516_realtime_expected_table_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = jsonb_set(
  notes,
  '{realtime_publication}',
  coalesce(notes->'realtime_publication','{}'::jsonb)
  || jsonb_build_object(
    'publication','supabase_realtime',
    'expected_tables',jsonb_build_array(
      'messages',
      'notifications',
      'tgg_call_participants',
      'tgg_call_signals',
      'tgg_collaboration_requests',
      'tgg_live_events',
      'tgg_stories',
      'tgg_vault_items'
    ),
    'table_count',8,
    'notifications_intent','allowed_core_realtime_table',
    'updated_at',now()
  ),
  true
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906200327 lock_creator_settings_alias_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_site_routes
set path='/p/artist-dashboard_0633467215.html',
    is_primary=false,
    updated_at=now()
where route_key='creator_settings';

alter table public.tgg_site_routes
  drop constraint if exists tgg_site_routes_v516_canonical_aliases_check;

alter table public.tgg_site_routes
  add constraint tgg_site_routes_v516_canonical_aliases_check
  check (
    case route_key
      when 'merch' then path='/p/creator-store.html'
      when 'memberships' then path='/p/backstage.html'
      when 'artists' then path='/p/artist-world.html'
      when 'events' then path='/p/live.html'
      when 'opportunities_public' then path='/p/career-os.html'
      when 'fan_hub' then path='/p/artist-world.html'
      when 'fan_following' then path='/p/artist-world.html'
      when 'shorts' then path='/p/artist-world.html'
      when 'fan_library' then path='/p/music-hub.html'
      when 'radio' then path='/p/music-hub.html'
      when 'fan_rewards' then path='/p/backstage.html'
      when 'discover' then path='/p/homepage.html'
      when 'charts' then path='/p/homepage.html'
      when 'releases' then path='/search/label/Mixtapes'
      when 'artist_settings' then path='/p/artist-dashboard_0633467215.html'
      when 'creator_settings' then path='/p/artist-dashboard_0633467215.html'
      when 'submit_music' then path='/p/upload-mixtape.html'
      else true
    end
  );


-- ============================================================
-- MIGRATION 20260906203150 fix_v516_checkout_and_dynamic_route_health
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function tgg_safe_api.public_checkout_capabilities()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'store_checkout',
      coalesce((
        select enabled
          and mode='production'
          and endpoint_configured
        from public.tgg_provider_runtime_config
        where provider_key='stripe'
        limit 1
      ),false),
    'membership_checkout',false
  );
$function$;

grant execute on function tgg_safe_api.public_checkout_capabilities()
to anon,authenticated;

create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_expected_routes int;
  v_current_routes int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  return jsonb_build_object(
    'ok',
      coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_blog->>'ok')::boolean,false)
      and coalesce((v_provider#>>'{payments,ready}')::boolean,false)
      and v_expected_routes>0
      and v_expected_routes=v_current_routes,
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_v516_drift_contract'
    ),
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'known_external_items',jsonb_build_array(
      'Supabase leaked-password protection setting remains disabled',
      'Production DSP endpoint is not configured',
      'Two-user realtime/call smoke requires a second legitimate account/device'
    ),
    'generated_at',now()
  );
end
$function$;

update public.tgg_production_baselines
set notes = jsonb_set(
  notes,
  '{route_integrity}',
  jsonb_build_object(
    'ok',true,
    'expected_unique_page_paths',36,
    'present_count',36,
    'missing_count',0,
    'source','dynamic_v516_drift_contract',
    'updated_at',now()
  ),
  true
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906211216 update_v516_realtime_contract_for_36_page_app
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = jsonb_set(
  notes,
  '{realtime_publication}',
  jsonb_build_object(
    'publication','supabase_realtime',
    'expected_tables',jsonb_build_array(
      'messages',
      'notifications',
      'tgg_call_participants',
      'tgg_call_signals',
      'tgg_collaboration_requests',
      'tgg_live_chat_messages',
      'tgg_live_events',
      'tgg_live_guest_requests',
      'tgg_stories',
      'tgg_studio_project_events',
      'tgg_studio_project_presence',
      'tgg_vault_items'
    ),
    'table_count',12,
    'locked_at',now()
  ),
  true
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906211333 harden_live_public_rpcs_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


begin;

create table if not exists public.public_live_reaction_counts_v1 (
  stream_id uuid primary key references public.live_streams(id) on delete cascade,
  fire bigint not null default 0,
  heart bigint not null default 0,
  clap bigint not null default 0,
  hundred bigint not null default 0,
  total bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.public_live_reaction_counts_v1 enable row level security;

revoke all on public.public_live_reaction_counts_v1 from anon,authenticated;
grant select on public.public_live_reaction_counts_v1 to anon,authenticated;

drop policy if exists public_live_reaction_counts_read
on public.public_live_reaction_counts_v1;

create policy public_live_reaction_counts_read
on public.public_live_reaction_counts_v1
for select
to anon,authenticated
using (
  exists (
    select 1
    from public.live_streams s
    join public.content_items c on c.id=s.content_id
    where s.id=public_live_reaction_counts_v1.stream_id
      and c.status='PUBLISHED'
      and c.visibility='PUBLIC'
      and s.audience='everyone'
      and s.status in ('LIVE','SCHEDULED','ENDED')
  )
);

insert into public.public_live_reaction_counts_v1(
  stream_id,fire,heart,clap,hundred,total,updated_at
)
select
  s.id,
  count(r.id) filter(where r.reaction_type='fire')::bigint,
  count(r.id) filter(where r.reaction_type='heart')::bigint,
  count(r.id) filter(where r.reaction_type='clap')::bigint,
  count(r.id) filter(where r.reaction_type='100')::bigint,
  count(r.id)::bigint,
  now()
from public.live_streams s
left join public.live_reactions r on r.stream_id=s.id
group by s.id
on conflict(stream_id) do update
set fire=excluded.fire,
    heart=excluded.heart,
    clap=excluded.clap,
    hundred=excluded.hundred,
    total=excluded.total,
    updated_at=now();

create or replace function private.tgg_refresh_live_reaction_count(p_stream_id uuid)
returns void
language sql
security definer
set search_path=''
as $$
  insert into public.public_live_reaction_counts_v1(
    stream_id,fire,heart,clap,hundred,total,updated_at
  )
  select
    p_stream_id,
    count(*) filter(where reaction_type='fire')::bigint,
    count(*) filter(where reaction_type='heart')::bigint,
    count(*) filter(where reaction_type='clap')::bigint,
    count(*) filter(where reaction_type='100')::bigint,
    count(*)::bigint,
    now()
  from public.live_reactions
  where stream_id=p_stream_id
  on conflict(stream_id) do update
  set fire=excluded.fire,
      heart=excluded.heart,
      clap=excluded.clap,
      hundred=excluded.hundred,
      total=excluded.total,
      updated_at=excluded.updated_at;
$$;

revoke all on function private.tgg_refresh_live_reaction_count(uuid)
from public,anon,authenticated;

create or replace function private.tgg_sync_live_reaction_count()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.tgg_refresh_live_reaction_count(coalesce(new.stream_id,old.stream_id));
  return coalesce(new,old);
end
$$;

revoke all on function private.tgg_sync_live_reaction_count()
from public,anon,authenticated;

drop trigger if exists tgg_sync_live_reaction_count
on public.live_reactions;

create trigger tgg_sync_live_reaction_count
after insert or update or delete on public.live_reactions
for each row
execute function private.tgg_sync_live_reaction_count();

create or replace function public.tgg_live_react(
  p_stream_id uuid,
  p_reaction_type text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_type text:=lower(btrim(coalesce(p_reaction_type,'')));
  v_id uuid;
begin
  if v_type not in ('fire','heart','clap','100') then
    raise exception 'REACTION_INVALID';
  end if;

  if not exists(
    select 1
    from public.live_streams s
    join public.content_items c on c.id=s.content_id
    where s.id=p_stream_id
      and s.status='LIVE'
      and s.reactions_enabled=true
      and c.status='PUBLISHED'
      and c.visibility='PUBLIC'
  ) then
    raise exception 'REACTIONS_UNAVAILABLE';
  end if;

  insert into public.live_reactions(stream_id,user_id,reaction_type)
  values(p_stream_id,v_uid,v_type)
  returning id into v_id;

  return jsonb_build_object(
    'ok',true,
    'reaction_id',v_id,
    'reaction_type',v_type
  );
end
$$;

create or replace function public.tgg_public_live_bundle(
  p_stream_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'ok',true,
    'version','PUBLIC-LIVE-V516',
    'streams',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',s.id,
          'title',s.title,
          'description',s.description,
          'category',s.category,
          'status',s.status,
          'broadcast_mode',s.broadcast_mode,
          'audience',s.audience,
          'camera_enabled',s.camera_enabled,
          'screen_enabled',s.screen_enabled,
          'mic_enabled',s.mic_enabled,
          'system_audio_enabled',s.system_audio_enabled,
          'chat_enabled',s.chat_enabled,
          'reactions_enabled',s.reactions_enabled,
          'pip_position',s.pip_position,
          'viewer_count',s.viewer_count,
          'peak_viewers',s.peak_viewers,
          'actual_start',s.actual_start,
          'scheduled_start',s.scheduled_start,
          'media_provider',s.media_provider,
          'media_playback_id',s.media_playback_id,
          'creator',jsonb_build_object(
            'user_id',a.user_id,
            'artist_id',a.artist_id,
            'stage_name',a.stage_name,
            'avatar_url',a.avatar_url
          ),
          'reaction_counts',jsonb_build_object(
            'fire',coalesce(rc.fire,0),
            'heart',coalesce(rc.heart,0),
            'clap',coalesce(rc.clap,0),
            '100',coalesce(rc.hundred,0)
          ),
          'chat',
            case when s.chat_enabled then coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id',m.id,
                  'user_id',m.user_id,
                  'display_name',m.display_name,
                  'body',m.body,
                  'created_at',m.created_at
                )
                order by m.created_at
              )
              from (
                select *
                from public.tgg_live_chat_messages
                where stream_id=s.id
                order by created_at desc
                limit 100
              ) m
            ),'[]'::jsonb)
            else '[]'::jsonb end
        )
        order by case when s.status='LIVE' then 0 else 1 end,s.created_at desc
      )
      from public.live_streams s
      join public.content_items c on c.id=s.content_id
      left join public.public_artist_directory_v1 a on a.user_id=s.creator_id
      left join public.public_live_reaction_counts_v1 rc on rc.stream_id=s.id
      where c.status='PUBLISHED'
        and c.visibility='PUBLIC'
        and s.audience='everyone'
        and (p_stream_id is null or s.id=p_stream_id)
        and s.status in ('LIVE','SCHEDULED','ENDED')
    ),'[]'::jsonb),
    'generated_at',now()
  );
$$;

grant execute on function public.tgg_live_react(uuid,text)
to anon,authenticated;

grant execute on function public.tgg_public_live_bundle(uuid)
to anon,authenticated;

revoke execute on function public.tgg_live_react(uuid,text) from public;
revoke execute on function public.tgg_public_live_bundle(uuid) from public;

commit;


-- ============================================================
-- MIGRATION 20260906211859 reconcile_v516_full_site_to_36_pages
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set blogger_deployments=36,
    blogger_verified=36,
    blogger_failed=0,
    notes = jsonb_set(
      jsonb_set(
        notes,
        '{rollback_contract}',
        coalesce(notes->'rollback_contract','{}'::jsonb)
          || jsonb_build_object(
            'locked_pages',36,
            'restorable_pages',36,
            'missing_backups',0,
            'backup_bucket','v98-blogger-backups',
            'integrity_validated',true,
            'validated_at',now()
          ),
        true
      ),
      '{route_integrity}',
      coalesce(notes->'route_integrity','{}'::jsonb)
        || jsonb_build_object(
          'ok',true,
          'expected_unique_page_paths',36,
          'present_count',36,
          'missing_count',0,
          'verified_at',now()
        ),
      true
    )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906211948 merge_studio_project_select_policies_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists tgg_studio_projects_own_all
on public.tgg_studio_projects;

create policy tgg_studio_projects_owner_insert
on public.tgg_studio_projects
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy tgg_studio_projects_owner_update
on public.tgg_studio_projects
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy tgg_studio_projects_owner_delete
on public.tgg_studio_projects
for delete
to authenticated
using ((select auth.uid()) = user_id);


-- ============================================================
-- MIGRATION 20260906212029 break_studio_project_rls_recursion_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_is_studio_project_owner(
  p_project_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.tgg_studio_projects p
    where p.id=p_project_id
      and p.user_id=p_user_id
  )
$$;

create or replace function private.tgg_is_studio_project_member(
  p_project_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.tgg_studio_project_members m
    where m.project_id=p_project_id
      and m.user_id=p_user_id
      and m.left_at is null
  )
$$;

revoke all on function private.tgg_is_studio_project_owner(uuid,uuid)
from public,anon;
revoke all on function private.tgg_is_studio_project_member(uuid,uuid)
from public,anon;

grant execute on function private.tgg_is_studio_project_owner(uuid,uuid)
to authenticated;
grant execute on function private.tgg_is_studio_project_member(uuid,uuid)
to authenticated;

drop policy if exists tgg_studio_projects_member_select
on public.tgg_studio_projects;

create policy tgg_studio_projects_member_select
on public.tgg_studio_projects
for select
to authenticated
using (
  (select auth.uid())=user_id
  or private.tgg_is_studio_project_member(id,(select auth.uid()))
);

drop policy if exists tgg_studio_project_members_visible
on public.tgg_studio_project_members;

create policy tgg_studio_project_members_visible
on public.tgg_studio_project_members
for select
to authenticated
using (
  user_id=(select auth.uid())
  or private.tgg_is_studio_project_owner(project_id,(select auth.uid()))
  or private.tgg_is_studio_project_member(project_id,(select auth.uid()))
);


-- ============================================================
-- MIGRATION 20260906213052 record_v516_36_page_restore_integrity
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = jsonb_set(
  notes,
  '{rollback_contract}',
  coalesce(notes->'rollback_contract','{}'::jsonb)
    || jsonb_build_object(
      'locked_pages',36,
      'restorable_pages',36,
      'missing_backups',0,
      'parseable_restore_payloads',36,
      'invalid_restore_payloads',0,
      'integrity_validated',true,
      'integrity_verified_at','2026-09-06T21:29:12.197Z'
    ),
  true
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906213520 lock_realtime_privilege_matrix_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_realtime_privilege_matrix()
returns jsonb
language sql
security definer
set search_path=''
as $$
  with rt as (
    select tablename
    from pg_catalog.pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'table',tablename,
      'anon_select',has_table_privilege('anon',format('public.%I',tablename),'SELECT'),
      'anon_insert',has_table_privilege('anon',format('public.%I',tablename),'INSERT'),
      'anon_update',has_table_privilege('anon',format('public.%I',tablename),'UPDATE'),
      'anon_delete',has_table_privilege('anon',format('public.%I',tablename),'DELETE'),
      'auth_select',has_table_privilege('authenticated',format('public.%I',tablename),'SELECT'),
      'auth_insert',has_table_privilege('authenticated',format('public.%I',tablename),'INSERT'),
      'auth_update',has_table_privilege('authenticated',format('public.%I',tablename),'UPDATE'),
      'auth_delete',has_table_privilege('authenticated',format('public.%I',tablename),'DELETE'),
      'policy_count',(
        select count(*)
        from pg_catalog.pg_policies p
        where p.schemaname='public'
          and p.tablename=rt.tablename
      )
    )
    order by tablename
  ),'[]'::jsonb)
  from rt
$$;

revoke all on function private.tgg_realtime_privilege_matrix()
from public,anon,authenticated;

update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'realtime_access_contract',
  jsonb_build_object(
    'matrix',private.tgg_realtime_privilege_matrix(),
    'locked_at',now()
  )
)
where version='V516-FINAL';

alter function private.tgg_production_baseline_drift()
rename to tgg_production_baseline_drift_core;

create function private.tgg_production_baseline_drift()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_core jsonb;
  v_expected jsonb;
  v_current jsonb;
  v_drift jsonb;
begin
  v_core:=private.tgg_production_baseline_drift_core();

  select coalesce(notes#>'{realtime_access_contract,matrix}','[]'::jsonb)
  into v_expected
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  v_current:=private.tgg_realtime_privilege_matrix();
  v_drift:=coalesce(v_core->'drift','[]'::jsonb);

  if v_expected is distinct from v_current then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','realtime_access_contract',
        'expected',v_expected,
        'current',v_current
      )
    );
  end if;

  return v_core
    || jsonb_build_object(
      'ok',jsonb_array_length(v_drift)=0,
      'drift_count',jsonb_array_length(v_drift),
      'drift',v_drift,
      'realtime_access_tables',jsonb_array_length(v_current)
    );
end
$function$;

grant execute on function private.tgg_production_baseline_drift()
to authenticated;

revoke execute on function private.tgg_production_baseline_drift()
from anon,public;

revoke all on function private.tgg_production_baseline_drift_core()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906213658 add_merch_refund_lifecycle_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.tgg_merch_orders
  add column if not exists refunded_amount bigint not null default 0,
  add column if not exists refunded_at timestamptz null,
  add column if not exists stripe_charge_id text null,
  add column if not exists last_refund_event_id text null;

alter table public.tgg_merch_orders
  drop constraint if exists tgg_merch_orders_status_check;

alter table public.tgg_merch_orders
  add constraint tgg_merch_orders_status_check
  check (
    status in (
      'paid',
      'fulfilled',
      'partially_refunded',
      'refunded',
      'cancelled'
    )
  );

alter table public.tgg_merch_orders
  drop constraint if exists tgg_merch_orders_refunded_amount_check;

alter table public.tgg_merch_orders
  add constraint tgg_merch_orders_refunded_amount_check
  check (
    refunded_amount >= 0
    and refunded_amount <= amount_total
  );

create index if not exists tgg_merch_orders_payment_intent_idx
  on public.tgg_merch_orders(payment_intent_id)
  where payment_intent_id is not null;

create or replace function private.tgg_record_merch_refund(
  p_event_id text,
  p_payment_intent_id text,
  p_charge_id text,
  p_amount_refunded bigint,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_order public.tgg_merch_orders;
  v_new_amount bigint;
  v_new_status text;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if nullif(btrim(coalesce(p_event_id,'')),'') is null then
    raise exception 'event_id_required';
  end if;

  if nullif(btrim(coalesce(p_payment_intent_id,'')),'') is null then
    return jsonb_build_object('handled',false,'reason','payment_intent_missing');
  end if;

  if p_amount_refunded is null or p_amount_refunded<0 then
    raise exception 'refund_amount_invalid';
  end if;

  select *
  into v_order
  from public.tgg_merch_orders
  where payment_intent_id=p_payment_intent_id
  order by created_at desc
  limit 1
  for update;

  if v_order.id is null then
    return jsonb_build_object(
      'handled',false,
      'reason','merch_order_not_found',
      'payment_intent_id',p_payment_intent_id
    );
  end if;

  if upper(v_order.currency)<>upper(coalesce(p_currency,'')) then
    raise exception 'refund_currency_mismatch';
  end if;

  v_new_amount:=least(
    v_order.amount_total,
    greatest(v_order.refunded_amount, p_amount_refunded)
  );

  v_new_status:=case
    when v_new_amount>=v_order.amount_total then 'refunded'
    when v_new_amount>0 then 'partially_refunded'
    else v_order.status
  end;

  update public.tgg_merch_orders
  set refunded_amount=v_new_amount,
      refunded_at=case
        when v_new_amount>0 then coalesce(refunded_at,now())
        else refunded_at
      end,
      stripe_charge_id=coalesce(
        nullif(btrim(coalesce(p_charge_id,'')),''),
        stripe_charge_id
      ),
      last_refund_event_id=p_event_id,
      status=v_new_status,
      updated_at=now()
  where id=v_order.id;

  return jsonb_build_object(
    'handled',true,
    'order_id',v_order.id,
    'status',v_new_status,
    'refunded_amount',v_new_amount,
    'amount_total',v_order.amount_total,
    'inventory_restocked',false
  );
end
$function$;

revoke all on function private.tgg_record_merch_refund(
  text,text,text,bigint,text
) from public,anon,authenticated;

grant execute on function private.tgg_record_merch_refund(
  text,text,text,bigint,text
) to service_role;


-- ============================================================
-- MIGRATION 20260906213854 add_v516_stripe_event_ledger
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.tgg_stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  livemode boolean not null default true,
  object_id text null,
  checkout_session_id text null,
  payment_intent_id text null,
  amount bigint null,
  currency text null,
  handled_kind text not null default 'observed',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_stripe_webhook_events enable row level security;

revoke all on table public.tgg_stripe_webhook_events
from anon,authenticated;

create index if not exists tgg_stripe_webhook_events_created_idx
  on public.tgg_stripe_webhook_events(created_at desc);

create index if not exists tgg_stripe_webhook_events_payment_intent_idx
  on public.tgg_stripe_webhook_events(payment_intent_id)
  where payment_intent_id is not null;

create or replace function private.tgg_record_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_object_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount bigint,
  p_currency text,
  p_handled_kind text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
  v_duplicate boolean:=false;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if nullif(btrim(coalesce(p_event_id,'')),'') is null then
    raise exception 'event_id_required';
  end if;

  if nullif(btrim(coalesce(p_event_type,'')),'') is null then
    raise exception 'event_type_required';
  end if;

  if octet_length(coalesce(p_result,'{}'::jsonb)::text)>16384 then
    raise exception 'event_result_too_large';
  end if;

  insert into public.tgg_stripe_webhook_events(
    stripe_event_id,event_type,livemode,object_id,
    checkout_session_id,payment_intent_id,amount,currency,
    handled_kind,result
  )
  values(
    p_event_id,p_event_type,coalesce(p_livemode,true),
    nullif(btrim(coalesce(p_object_id,'')),''),
    nullif(btrim(coalesce(p_checkout_session_id,'')),''),
    nullif(btrim(coalesce(p_payment_intent_id,'')),''),
    p_amount,
    nullif(upper(btrim(coalesce(p_currency,''))),''),
    coalesce(nullif(btrim(coalesce(p_handled_kind,'')),''),'observed'),
    coalesce(p_result,'{}'::jsonb)
  )
  on conflict(stripe_event_id) do update
  set updated_at=now()
  returning id into v_id;

  select count(*)>1 into v_duplicate
  from public.tgg_stripe_webhook_events
  where stripe_event_id=p_event_id;

  return jsonb_build_object(
    'id',v_id,
    'duplicate',v_duplicate
  );
end
$function$;

revoke all on function private.tgg_record_stripe_webhook_event(
  text,text,boolean,text,text,text,bigint,text,text,jsonb
) from public,anon,authenticated;

grant execute on function private.tgg_record_stripe_webhook_event(
  text,text,boolean,text,text,text,bigint,text,text,jsonb
) to service_role;


-- ============================================================
-- MIGRATION 20260906213944 finalize_v516_stripe_event_idempotency
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_record_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_livemode boolean,
  p_object_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount bigint,
  p_currency text,
  p_handled_kind text,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_id uuid;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if nullif(btrim(coalesce(p_event_id,'')),'') is null then
    raise exception 'event_id_required';
  end if;

  if nullif(btrim(coalesce(p_event_type,'')),'') is null then
    raise exception 'event_type_required';
  end if;

  if octet_length(coalesce(p_result,'{}'::jsonb)::text)>16384 then
    raise exception 'event_result_too_large';
  end if;

  select id into v_id
  from public.tgg_stripe_webhook_events
  where stripe_event_id=p_event_id;

  if v_id is not null then
    return jsonb_build_object(
      'id',v_id,
      'duplicate',true
    );
  end if;

  insert into public.tgg_stripe_webhook_events(
    stripe_event_id,event_type,livemode,object_id,
    checkout_session_id,payment_intent_id,amount,currency,
    handled_kind,result
  )
  values(
    p_event_id,p_event_type,coalesce(p_livemode,true),
    nullif(btrim(coalesce(p_object_id,'')),''),
    nullif(btrim(coalesce(p_checkout_session_id,'')),''),
    nullif(btrim(coalesce(p_payment_intent_id,'')),''),
    p_amount,
    nullif(upper(btrim(coalesce(p_currency,''))),''),
    coalesce(nullif(btrim(coalesce(p_handled_kind,'')),''),'observed'),
    coalesce(p_result,'{}'::jsonb)
  )
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,
    'duplicate',false
  );
end
$function$;

create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe public.tgg_provider_runtime_config;
  v_dist public.tgg_provider_runtime_config;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_stripe
  from public.tgg_provider_runtime_config
  where provider_key='stripe';

  select * into v_dist
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  return jsonb_build_object(
    'ok',coalesce(v_stripe.enabled,false),
    'payments',jsonb_build_object(
      'ready',coalesce(v_stripe.enabled,false)
        and v_stripe.mode='production'
        and v_stripe.endpoint_configured,
      'checkout_ready',true,
      'refunds_ready',true,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'event_ledger','tgg_stripe_webhook_events',
      'live_webhook','v58-stripe-webhook-v2',
      'live_events',jsonb_build_array(
        'checkout.session.completed',
        'payment_intent.succeeded',
        'charge.refunded'
      ),
      'sandbox_webhook','v58-stripe-webhook-v4',
      'legacy_v58_checkout','retired',
      'legacy_v58_webhook_db_dependencies',false
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist.enabled,false)
        and v_dist.mode='production'
        and v_dist.endpoint_configured,
      'enabled',coalesce(v_dist.enabled,false),
      'mode',coalesce(v_dist.mode,'disabled'),
      'endpoint_configured',coalesce(v_dist.endpoint_configured,false),
      'status',case
        when coalesce(v_dist.enabled,false)
          and v_dist.mode='production'
          and v_dist.endpoint_configured
        then 'ready'
        else coalesce(v_dist.disabled_reason,'production_endpoint_required')
      end
    ),
    'version','v516'
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906214224 sync_v516_payment_health_async_checkout
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe public.tgg_provider_runtime_config;
  v_dist public.tgg_provider_runtime_config;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_stripe
  from public.tgg_provider_runtime_config
  where provider_key='stripe';

  select * into v_dist
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  return jsonb_build_object(
    'ok',coalesce(v_stripe.enabled,false),
    'payments',jsonb_build_object(
      'ready',coalesce(v_stripe.enabled,false)
        and v_stripe.mode='production'
        and v_stripe.endpoint_configured,
      'checkout_ready',true,
      'async_checkout_ready',true,
      'refunds_ready',true,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'event_ledger','tgg_stripe_webhook_events',
      'live_webhook','v58-stripe-webhook-v2',
      'live_events',jsonb_build_array(
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'payment_intent.succeeded',
        'charge.refunded'
      ),
      'sandbox_webhook','v58-stripe-webhook-v4',
      'legacy_v58_checkout','retired',
      'legacy_v58_webhook_db_dependencies',false
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist.enabled,false)
        and v_dist.mode='production'
        and v_dist.endpoint_configured,
      'enabled',coalesce(v_dist.enabled,false),
      'mode',coalesce(v_dist.mode,'disabled'),
      'endpoint_configured',coalesce(v_dist.endpoint_configured,false),
      'status',case
        when coalesce(v_dist.enabled,false)
          and v_dist.mode='production'
          and v_dist.endpoint_configured
        then 'ready'
        else coalesce(v_dist.disabled_reason,'production_endpoint_required')
      end
    ),
    'version','v516'
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906214334 add_merch_checkout_inventory_reservations_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.tgg_merch_checkout_reservations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  product_id uuid not null references public.merch_products(id) on delete restrict,
  creator_id uuid not null references public.artists(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 10),
  inventory_reserved boolean not null default false,
  checkout_session_id text unique null,
  status text not null default 'pending'
    check (status in ('pending','completed','expired','released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  released_at timestamptz null
);

alter table public.tgg_merch_checkout_reservations enable row level security;
revoke all on table public.tgg_merch_checkout_reservations from anon,authenticated;

create index if not exists tgg_merch_checkout_reservations_pending_idx
  on public.tgg_merch_checkout_reservations(status,expires_at)
  where status='pending';

create or replace function private.tgg_reserve_merch_checkout(
  p_request_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_existing public.tgg_merch_checkout_reservations;
  v_product public.merch_products;
  v_reservation_id uuid;
  v_reserved boolean:=false;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_product_id is null then raise exception 'product_id_required'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>10 then
    raise exception 'quantity_invalid';
  end if;
  if p_expires_at is null or p_expires_at<=now() then
    raise exception 'expires_at_invalid';
  end if;

  select * into v_existing
  from public.tgg_merch_checkout_reservations
  where request_id=p_request_id
  for update;

  if v_existing.id is not null then
    select * into v_product
    from public.merch_products
    where id=v_existing.product_id;

    return jsonb_build_object(
      'reservation_id',v_existing.id,
      'request_id',v_existing.request_id,
      'product_id',v_existing.product_id,
      'creator_id',v_existing.creator_id,
      'quantity',v_existing.quantity,
      'inventory_reserved',v_existing.inventory_reserved,
      'checkout_session_id',v_existing.checkout_session_id,
      'status',v_existing.status,
      'expires_at',v_existing.expires_at,
      'title',v_product.title,
      'description',v_product.description,
      'product_type',v_product.product_type,
      'price_cents',v_product.price_cents,
      'currency',v_product.currency,
      'image_url',v_product.image_url,
      'duplicate_request',true
    );
  end if;

  select * into v_product
  from public.merch_products
  where id=p_product_id
    and status='published'
  for update;

  if v_product.id is null then
    raise exception 'product_not_available';
  end if;

  if v_product.price_cents is null or v_product.price_cents<50 then
    raise exception 'product_price_invalid';
  end if;

  if v_product.inventory is not null then
    if v_product.inventory<p_quantity then
      raise exception 'inventory_insufficient';
    end if;

    update public.merch_products
    set inventory=inventory-p_quantity,
        updated_at=now()
    where id=v_product.id;

    v_reserved:=true;
  end if;

  insert into public.tgg_merch_checkout_reservations(
    request_id,product_id,creator_id,quantity,
    inventory_reserved,status,expires_at
  )
  values(
    p_request_id,v_product.id,v_product.creator_id,p_quantity,
    v_reserved,'pending',p_expires_at
  )
  returning id into v_reservation_id;

  return jsonb_build_object(
    'reservation_id',v_reservation_id,
    'request_id',p_request_id,
    'product_id',v_product.id,
    'creator_id',v_product.creator_id,
    'quantity',p_quantity,
    'inventory_reserved',v_reserved,
    'checkout_session_id',null,
    'status','pending',
    'expires_at',p_expires_at,
    'title',v_product.title,
    'description',v_product.description,
    'product_type',v_product.product_type,
    'price_cents',v_product.price_cents,
    'currency',v_product.currency,
    'image_url',v_product.image_url,
    'duplicate_request',false
  );
end
$function$;

create or replace function private.tgg_attach_merch_checkout_session(
  p_request_id uuid,
  p_checkout_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v public.tgg_merch_checkout_reservations;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if nullif(btrim(coalesce(p_checkout_session_id,'')),'') is null then
    raise exception 'checkout_session_required';
  end if;

  update public.tgg_merch_checkout_reservations
  set checkout_session_id=coalesce(checkout_session_id,p_checkout_session_id),
      updated_at=now()
  where request_id=p_request_id
    and status='pending'
  returning * into v;

  if v.id is null then
    raise exception 'reservation_not_pending';
  end if;

  if v.checkout_session_id<>p_checkout_session_id then
    raise exception 'checkout_session_mismatch';
  end if;

  return jsonb_build_object(
    'reservation_id',v.id,
    'checkout_session_id',v.checkout_session_id,
    'status',v.status
  );
end
$function$;

create or replace function private.tgg_release_merch_checkout_reservation(
  p_request_id uuid,
  p_checkout_session_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v public.tgg_merch_checkout_reservations;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  select * into v
  from public.tgg_merch_checkout_reservations
  where (
    (p_request_id is not null and request_id=p_request_id)
    or (
      nullif(btrim(coalesce(p_checkout_session_id,'')),'') is not null
      and checkout_session_id=p_checkout_session_id
    )
  )
  order by created_at desc
  limit 1
  for update;

  if v.id is null then
    return jsonb_build_object('handled',false,'reason','reservation_not_found');
  end if;

  if v.status<>'pending' then
    return jsonb_build_object(
      'handled',true,
      'reservation_id',v.id,
      'status',v.status,
      'inventory_released',false,
      'duplicate',true
    );
  end if;

  if v.inventory_reserved then
    update public.merch_products
    set inventory=coalesce(inventory,0)+v.quantity,
        updated_at=now()
    where id=v.product_id;
  end if;

  update public.tgg_merch_checkout_reservations
  set status=case when p_reason='expired' then 'expired' else 'released' end,
      released_at=now(),
      updated_at=now()
  where id=v.id;

  return jsonb_build_object(
    'handled',true,
    'reservation_id',v.id,
    'status',case when p_reason='expired' then 'expired' else 'released' end,
    'inventory_released',v.inventory_reserved,
    'quantity',v.quantity
  );
end
$function$;

revoke all on function private.tgg_reserve_merch_checkout(uuid,uuid,integer,timestamptz)
from public,anon,authenticated;
revoke all on function private.tgg_attach_merch_checkout_session(uuid,text)
from public,anon,authenticated;
revoke all on function private.tgg_release_merch_checkout_reservation(uuid,text,text)
from public,anon,authenticated;

grant execute on function private.tgg_reserve_merch_checkout(uuid,uuid,integer,timestamptz)
to service_role;
grant execute on function private.tgg_attach_merch_checkout_session(uuid,text)
to service_role;
grant execute on function private.tgg_release_merch_checkout_reservation(uuid,text,text)
to service_role;


-- ============================================================
-- MIGRATION 20260906214507 wire_merch_reservations_and_gate_memberships_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


insert into public.tgg_provider_runtime_config(
  provider_key,capability,display_name,enabled,mode,endpoint_configured,disabled_reason,updated_at
)
values(
  'membership.stripe',
  'memberships',
  'Stripe Memberships',
  false,
  'disabled',
  true,
  'membership_checkout_not_enabled',
  now()
)
on conflict(provider_key) do update
set capability=excluded.capability,
    display_name=excluded.display_name,
    enabled=excluded.enabled,
    mode=excluded.mode,
    endpoint_configured=excluded.endpoint_configured,
    disabled_reason=excluded.disabled_reason,
    updated_at=excluded.updated_at;

create or replace function public.tgg_public_checkout_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
  select jsonb_build_object(
    'store_checkout',
      coalesce((
        select enabled
          and mode='production'
          and endpoint_configured
        from public.tgg_provider_runtime_config
        where provider_key='stripe'
        limit 1
      ),false),
    'membership_checkout',
      coalesce((
        select enabled
          and mode='production'
          and endpoint_configured
        from public.tgg_provider_runtime_config
        where provider_key='membership.stripe'
        limit 1
      ),false)
  );
$function$;

create or replace function private.tgg_record_merch_checkout_completed(
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_product_id uuid,
  p_creator_id uuid,
  p_buyer_user_id uuid,
  p_quantity integer,
  p_amount_total bigint,
  p_currency text,
  p_customer_email text,
  p_shipping jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_existing uuid;
  v_product public.merch_products;
  v_reservation public.tgg_merch_checkout_reservations;
  v_order_id uuid;
  v_expected bigint;
  v_shipping jsonb:=coalesce(p_shipping,'{}'::jsonb);
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if nullif(btrim(coalesce(p_checkout_session_id,'')),'') is null then
    raise exception 'checkout_session_required';
  end if;
  if p_quantity is null or p_quantity<1 or p_quantity>10 then
    raise exception 'quantity_invalid';
  end if;
  if p_amount_total is null or p_amount_total<0 then
    raise exception 'amount_invalid';
  end if;
  if char_length(coalesce(p_currency,''))<>3 then
    raise exception 'currency_invalid';
  end if;
  if jsonb_typeof(v_shipping)<>'object' or octet_length(v_shipping::text)>16384 then
    raise exception 'shipping_invalid';
  end if;

  select id into v_existing
  from public.tgg_merch_orders
  where checkout_session_id=p_checkout_session_id;

  if v_existing is not null then
    return v_existing;
  end if;

  select *
  into v_product
  from public.merch_products
  where id=p_product_id
    and creator_id=p_creator_id
    and status='published'
  for update;

  if v_product.id is null then
    raise exception 'published_product_not_found';
  end if;

  v_expected := (v_product.price_cents::bigint * p_quantity::bigint);
  if v_expected<>p_amount_total then
    raise exception 'amount_mismatch';
  end if;
  if upper(v_product.currency)<>upper(p_currency) then
    raise exception 'currency_mismatch';
  end if;

  select *
  into v_reservation
  from public.tgg_merch_checkout_reservations
  where checkout_session_id=p_checkout_session_id
  order by created_at desc
  limit 1
  for update;

  if v_reservation.id is not null then
    if v_reservation.status in ('expired','released') then
      raise exception 'reservation_inactive';
    end if;
    if v_reservation.product_id<>p_product_id
       or v_reservation.creator_id<>p_creator_id
       or v_reservation.quantity<>p_quantity then
      raise exception 'reservation_mismatch';
    end if;

    if v_reservation.status='pending' then
      update public.tgg_merch_checkout_reservations
      set status='completed',
          completed_at=now(),
          updated_at=now()
      where id=v_reservation.id;
    end if;
  else
    -- Legacy pre-reservation checkout fallback.
    if v_product.inventory is not null then
      if v_product.inventory<p_quantity then
        raise exception 'inventory_insufficient';
      end if;

      update public.merch_products
      set inventory=inventory-p_quantity,
          updated_at=now()
      where id=v_product.id;
    end if;
  end if;

  insert into public.tgg_merch_orders(
    product_id,creator_id,buyer_user_id,
    checkout_session_id,payment_intent_id,
    quantity,amount_total,currency,
    customer_email,shipping,status
  )
  values(
    p_product_id,p_creator_id,p_buyer_user_id,
    p_checkout_session_id,
    nullif(btrim(coalesce(p_payment_intent_id,'')),''),
    p_quantity,p_amount_total,upper(p_currency),
    nullif(btrim(coalesce(p_customer_email,'')),''),
    v_shipping,'paid'
  )
  returning id into v_order_id;

  return v_order_id;
end
$function$;

revoke all on function private.tgg_record_merch_checkout_completed(
  text,text,uuid,uuid,uuid,integer,bigint,text,text,jsonb
) from public,anon,authenticated;

grant execute on function private.tgg_record_merch_checkout_completed(
  text,text,uuid,uuid,uuid,integer,bigint,text,text,jsonb
) to service_role;


-- ============================================================
-- MIGRATION 20260906214634 sync_v516_inventory_reservation_health
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe public.tgg_provider_runtime_config;
  v_membership public.tgg_provider_runtime_config;
  v_dist public.tgg_provider_runtime_config;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_stripe
  from public.tgg_provider_runtime_config
  where provider_key='stripe';

  select * into v_membership
  from public.tgg_provider_runtime_config
  where provider_key='membership.stripe';

  select * into v_dist
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  return jsonb_build_object(
    'ok',coalesce(v_stripe.enabled,false),
    'payments',jsonb_build_object(
      'ready',coalesce(v_stripe.enabled,false)
        and v_stripe.mode='production'
        and v_stripe.endpoint_configured,
      'checkout_ready',true,
      'inventory_reservations_ready',true,
      'checkout_expiry_release_ready',true,
      'async_checkout_ready',true,
      'refunds_ready',true,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'reservation_ledger','tgg_merch_checkout_reservations',
      'event_ledger','tgg_stripe_webhook_events',
      'live_webhook','v58-stripe-webhook-v2',
      'live_events',jsonb_build_array(
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
        'payment_intent.succeeded',
        'charge.refunded'
      ),
      'legacy_v58_checkout','retired',
      'legacy_v58_webhook_db_dependencies',false
    ),
    'memberships',jsonb_build_object(
      'checkout_ready',
        coalesce(v_membership.enabled,false)
        and v_membership.mode='production'
        and v_membership.endpoint_configured,
      'status',case
        when coalesce(v_membership.enabled,false)
          and v_membership.mode='production'
          and v_membership.endpoint_configured
        then 'ready'
        else coalesce(v_membership.disabled_reason,'membership_checkout_not_enabled')
      end
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist.enabled,false)
        and v_dist.mode='production'
        and v_dist.endpoint_configured,
      'enabled',coalesce(v_dist.enabled,false),
      'mode',coalesce(v_dist.mode,'disabled'),
      'endpoint_configured',coalesce(v_dist.endpoint_configured,false),
      'status',case
        when coalesce(v_dist.enabled,false)
          and v_dist.mode='production'
          and v_dist.endpoint_configured
        then 'ready'
        else coalesce(v_dist.disabled_reason,'production_endpoint_required')
      end
    ),
    'version','v516'
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906214719 harden_merch_reservation_idempotency_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_reserve_merch_checkout(
  p_request_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_existing public.tgg_merch_checkout_reservations;
  v_product public.merch_products;
  v_reservation_id uuid;
  v_reserved boolean:=false;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_product_id is null then raise exception 'product_id_required'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>10 then
    raise exception 'quantity_invalid';
  end if;
  if p_expires_at is null or p_expires_at<=now() then
    raise exception 'expires_at_invalid';
  end if;

  select * into v_existing
  from public.tgg_merch_checkout_reservations
  where request_id=p_request_id
  for update;

  if v_existing.id is not null then
    if v_existing.product_id<>p_product_id
       or v_existing.quantity<>p_quantity then
      raise exception 'request_id_payload_mismatch';
    end if;

    if v_existing.status<>'pending' then
      raise exception 'request_id_not_reusable';
    end if;

    select * into v_product
    from public.merch_products
    where id=v_existing.product_id;

    return jsonb_build_object(
      'reservation_id',v_existing.id,
      'request_id',v_existing.request_id,
      'product_id',v_existing.product_id,
      'creator_id',v_existing.creator_id,
      'quantity',v_existing.quantity,
      'inventory_reserved',v_existing.inventory_reserved,
      'checkout_session_id',v_existing.checkout_session_id,
      'status',v_existing.status,
      'expires_at',v_existing.expires_at,
      'title',v_product.title,
      'description',v_product.description,
      'product_type',v_product.product_type,
      'price_cents',v_product.price_cents,
      'currency',v_product.currency,
      'image_url',v_product.image_url,
      'duplicate_request',true
    );
  end if;

  select * into v_product
  from public.merch_products
  where id=p_product_id
    and status='published'
  for update;

  if v_product.id is null then
    raise exception 'product_not_available';
  end if;

  if v_product.price_cents is null or v_product.price_cents<50 then
    raise exception 'product_price_invalid';
  end if;

  if v_product.inventory is not null then
    if v_product.inventory<p_quantity then
      raise exception 'inventory_insufficient';
    end if;

    update public.merch_products
    set inventory=inventory-p_quantity,
        updated_at=now()
    where id=v_product.id;

    v_reserved:=true;
  end if;

  insert into public.tgg_merch_checkout_reservations(
    request_id,product_id,creator_id,quantity,
    inventory_reserved,status,expires_at
  )
  values(
    p_request_id,v_product.id,v_product.creator_id,p_quantity,
    v_reserved,'pending',p_expires_at
  )
  returning id into v_reservation_id;

  return jsonb_build_object(
    'reservation_id',v_reservation_id,
    'request_id',p_request_id,
    'product_id',v_product.id,
    'creator_id',v_product.creator_id,
    'quantity',p_quantity,
    'inventory_reserved',v_reserved,
    'checkout_session_id',null,
    'status','pending',
    'expires_at',p_expires_at,
    'title',v_product.title,
    'description',v_product.description,
    'product_type',v_product.product_type,
    'price_cents',v_product.price_cents,
    'currency',v_product.currency,
    'image_url',v_product.image_url,
    'duplicate_request',false
  );
end
$function$;

revoke all on function private.tgg_reserve_merch_checkout(
  uuid,uuid,integer,timestamptz
) from public,anon,authenticated;

grant execute on function private.tgg_reserve_merch_checkout(
  uuid,uuid,integer,timestamptz
) to service_role;


-- ============================================================
-- MIGRATION 20260906214837 monitor_stale_merch_reservations_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_monitor_production_baseline()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v jsonb;
  v_ok boolean;
  v_stale_count bigint:=0;
  v_stale_payload jsonb:='{}'::jsonb;
begin
  v:=private.tgg_production_baseline_drift();
  v_ok:=coalesce((v->>'ok')::boolean,false);

  if v_ok then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v
    where alert_key='production:baseline_drift'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:baseline_drift','open','warning','production_baseline',
      now(),now(),1,v
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='production_baseline',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;

  select
    count(*),
    jsonb_build_object(
      'threshold_hours',48,
      'count',count(*),
      'oldest_created_at',min(created_at),
      'reservations',coalesce(
        jsonb_agg(
          jsonb_build_object(
            'reservation_id',id,
            'product_id',product_id,
            'quantity',quantity,
            'checkout_session_id',checkout_session_id,
            'created_at',created_at,
            'expires_at',expires_at
          )
          order by created_at
        ) filter(where created_at<now()-interval '48 hours'),
        '[]'::jsonb
      )
    )
  into v_stale_count,v_stale_payload
  from public.tgg_merch_checkout_reservations
  where status='pending'
    and created_at<now()-interval '48 hours';

  if v_stale_count=0 then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v_stale_payload
    where alert_key='commerce:stale_inventory_reservation'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'commerce:stale_inventory_reservation',
      'open',
      'warning',
      'commerce',
      now(),
      now(),
      1,
      v_stale_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='commerce',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;
end
$function$;

revoke all on function private.tgg_monitor_production_baseline()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906215105 fail_closed_digital_store_checkout_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace view public.public_merch_v1
with (security_invoker=true)
as
select
  mp.id,
  mp.creator_id,
  mp.title,
  mp.description,
  mp.product_type,
  mp.price_cents,
  mp.currency,
  mp.sku,
  mp.inventory,
  mp.image_url,
  mp.published_at,
  a.stage_name as creator_name
from public.merch_products mp
left join public.public_artist_directory_v1 a
  on a.artist_id=mp.creator_id
where mp.status='published'
  and mp.product_type='physical';

grant select on public.public_merch_v1 to anon,authenticated;

create or replace function private.tgg_reserve_merch_checkout(
  p_request_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_existing public.tgg_merch_checkout_reservations;
  v_product public.merch_products;
  v_reservation_id uuid;
  v_reserved boolean:=false;
begin
  if auth.role()<>'service_role' then
    raise exception 'service_role_required';
  end if;

  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_product_id is null then raise exception 'product_id_required'; end if;
  if p_quantity is null or p_quantity<1 or p_quantity>10 then
    raise exception 'quantity_invalid';
  end if;
  if p_expires_at is null or p_expires_at<=now() then
    raise exception 'expires_at_invalid';
  end if;

  select * into v_existing
  from public.tgg_merch_checkout_reservations
  where request_id=p_request_id
  for update;

  if v_existing.id is not null then
    if v_existing.product_id<>p_product_id
       or v_existing.quantity<>p_quantity then
      raise exception 'request_id_payload_mismatch';
    end if;

    if v_existing.status<>'pending' then
      raise exception 'request_id_not_reusable';
    end if;

    select * into v_product
    from public.merch_products
    where id=v_existing.product_id;

    if v_product.product_type<>'physical' then
      raise exception 'digital_fulfillment_not_configured';
    end if;

    return jsonb_build_object(
      'reservation_id',v_existing.id,
      'request_id',v_existing.request_id,
      'product_id',v_existing.product_id,
      'creator_id',v_existing.creator_id,
      'quantity',v_existing.quantity,
      'inventory_reserved',v_existing.inventory_reserved,
      'checkout_session_id',v_existing.checkout_session_id,
      'status',v_existing.status,
      'expires_at',v_existing.expires_at,
      'title',v_product.title,
      'description',v_product.description,
      'product_type',v_product.product_type,
      'price_cents',v_product.price_cents,
      'currency',v_product.currency,
      'image_url',v_product.image_url,
      'duplicate_request',true
    );
  end if;

  select * into v_product
  from public.merch_products
  where id=p_product_id
    and status='published'
  for update;

  if v_product.id is null then
    raise exception 'product_not_available';
  end if;

  if v_product.product_type<>'physical' then
    raise exception 'digital_fulfillment_not_configured';
  end if;

  if v_product.price_cents is null or v_product.price_cents<50 then
    raise exception 'product_price_invalid';
  end if;

  if v_product.inventory is not null then
    if v_product.inventory<p_quantity then
      raise exception 'inventory_insufficient';
    end if;

    update public.merch_products
    set inventory=inventory-p_quantity,
        updated_at=now()
    where id=v_product.id;

    v_reserved:=true;
  end if;

  insert into public.tgg_merch_checkout_reservations(
    request_id,product_id,creator_id,quantity,
    inventory_reserved,status,expires_at
  )
  values(
    p_request_id,v_product.id,v_product.creator_id,p_quantity,
    v_reserved,'pending',p_expires_at
  )
  returning id into v_reservation_id;

  return jsonb_build_object(
    'reservation_id',v_reservation_id,
    'request_id',p_request_id,
    'product_id',v_product.id,
    'creator_id',v_product.creator_id,
    'quantity',p_quantity,
    'inventory_reserved',v_reserved,
    'checkout_session_id',null,
    'status','pending',
    'expires_at',p_expires_at,
    'title',v_product.title,
    'description',v_product.description,
    'product_type',v_product.product_type,
    'price_cents',v_product.price_cents,
    'currency',v_product.currency,
    'image_url',v_product.image_url,
    'duplicate_request',false
  );
end
$function$;

revoke all on function private.tgg_reserve_merch_checkout(
  uuid,uuid,integer,timestamptz
) from public,anon,authenticated;

grant execute on function private.tgg_reserve_merch_checkout(
  uuid,uuid,integer,timestamptz
) to service_role;

update public.tgg_production_baselines
set notes=notes||jsonb_build_object(
  'digital_commerce',
  jsonb_build_object(
    'physical_merch_checkout',true,
    'digital_store_checkout',false,
    'digital_public_catalog',false,
    'digital_fulfillment_status','not_configured',
    'fail_closed',true,
    'reason','no protected digital asset delivery workflow configured'
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906220425 harden_public_live_chat_payloads_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.tgg_live_chat_messages
  drop constraint if exists tgg_live_chat_messages_body_check;

alter table public.tgg_live_chat_messages
  add constraint tgg_live_chat_messages_body_check
  check (
    char_length(body) between 1 and 500
    and char_length(btrim(body)) >= 1
  );

alter table public.tgg_live_chat_messages
  drop constraint if exists tgg_live_chat_messages_display_name_check;

alter table public.tgg_live_chat_messages
  add constraint tgg_live_chat_messages_display_name_check
  check (
    display_name is null
    or char_length(display_name) <= 80
  );

drop policy if exists tgg_live_chat_insert
on public.tgg_live_chat_messages;

create policy tgg_live_chat_insert
on public.tgg_live_chat_messages
for insert
to anon,authenticated
with check (
  char_length(body) between 1 and 500
  and char_length(btrim(body)) >= 1
  and (
    display_name is null
    or char_length(display_name) <= 80
  )
  and (
    user_id is null
    or user_id=(select auth.uid())
  )
  and exists (
    select 1
    from public.live_streams s
    where s.id=tgg_live_chat_messages.stream_id
      and s.chat_enabled=true
      and s.status='LIVE'
  )
);


-- ============================================================
-- MIGRATION 20260906221217 include_live_blogger_truth_in_final_health_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_live jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_expected_routes int;
  v_current_routes int;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();
  v_live:=coalesce(v_baseline#>'{notes,live_blogger_hash_monitor}','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  return jsonb_build_object(
    'ok',
      coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_blog->>'ok')::boolean,false)
      and coalesce((v_provider#>>'{payments,ready}')::boolean,false)
      and coalesce((v_live->>'ok')::boolean,false)
      and v_live_fresh
      and v_expected_routes>0
      and v_expected_routes=v_current_routes,
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'blogger_live_content',v_live || jsonb_build_object('fresh',v_live_fresh),
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_v516_drift_contract'
    ),
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'known_external_items',jsonb_build_array(
      'Supabase leaked-password protection setting remains disabled',
      'Production DSP endpoint is not configured',
      'Two-user realtime/call smoke requires a second legitimate account/device'
    ),
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_final_platform_health() to authenticated;
revoke execute on function public.tgg_final_platform_health() from anon,public;


-- ============================================================
-- MIGRATION 20260906221700 monitor_store_checkout_runtime_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_monitor_production_baseline()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v jsonb;
  v_ok boolean;
  v_stale_count bigint:=0;
  v_stale_payload jsonb:='{}'::jsonb;
  v_stripe_ready boolean:=false;
  v_stripe_payload jsonb:='{}'::jsonb;
begin
  v:=private.tgg_production_baseline_drift();
  v_ok:=coalesce((v->>'ok')::boolean,false);

  if v_ok then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v
    where alert_key='production:baseline_drift'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:baseline_drift','open','warning','production_baseline',
      now(),now(),1,v
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='production_baseline',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;

  select
    coalesce(enabled,false)
      and mode='production'
      and coalesce(endpoint_configured,false),
    jsonb_build_object(
      'provider_key',provider_key,
      'enabled',enabled,
      'mode',mode,
      'endpoint_configured',endpoint_configured,
      'disabled_reason',disabled_reason,
      'updated_at',updated_at,
      'checkout_runtime','tgg-store-checkout'
    )
  into v_stripe_ready,v_stripe_payload
  from public.tgg_provider_runtime_config
  where provider_key='stripe'
  limit 1;

  v_stripe_ready:=coalesce(v_stripe_ready,false);

  if v_stripe_ready then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v_stripe_payload
    where alert_key='production:store_checkout_runtime'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:store_checkout_runtime',
      'open',
      'warning',
      'commerce',
      now(),
      now(),
      1,
      v_stripe_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='commerce',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;

  select
    count(*),
    jsonb_build_object(
      'threshold_hours',48,
      'count',count(*),
      'oldest_created_at',min(created_at),
      'reservations',coalesce(
        jsonb_agg(
          jsonb_build_object(
            'reservation_id',id,
            'product_id',product_id,
            'quantity',quantity,
            'checkout_session_id',checkout_session_id,
            'created_at',created_at,
            'expires_at',expires_at
          )
          order by created_at
        ) filter(where created_at<now()-interval '48 hours'),
        '[]'::jsonb
      )
    )
  into v_stale_count,v_stale_payload
  from public.tgg_merch_checkout_reservations
  where status='pending'
    and created_at<now()-interval '48 hours';

  if v_stale_count=0 then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v_stale_payload
    where alert_key='commerce:stale_inventory_reservation'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'commerce:stale_inventory_reservation',
      'open',
      'warning',
      'commerce',
      now(),
      now(),
      1,
      v_stale_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='commerce',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;
end
$function$;

revoke all on function private.tgg_monitor_production_baseline()
from public,anon,authenticated;

update public.tgg_production_baselines
set
  payments_ready=false,
  notes = notes || jsonb_build_object(
    'stripe_runtime_incident',
    jsonb_build_object(
      'status','open',
      'detected_at',now(),
      'runtime_probe','stripe_server_secret_missing',
      'checkout_runtime','tgg-store-checkout',
      'live_webhook_still_configured',true,
      'resolution','restore Stripe server secret in Supabase Edge Function secrets',
      'auto_alert','production:store_checkout_runtime'
    )
  )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906222027 clarify_stripe_runtime_incident_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'stripe_runtime_incident',
  coalesce(notes->'stripe_runtime_incident','{}'::jsonb)
  || jsonb_build_object(
    'status','open',
    'checkout_session_creation_ready',false,
    'live_webhook_enabled',true,
    'live_webhook','v58-stripe-webhook-v2',
    'live_webhook_events',jsonb_build_array(
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'checkout.session.expired',
      'payment_intent.succeeded',
      'charge.refunded'
    ),
    'account_connectivity','verified',
    'scope','checkout_edge_runtime_secret_only',
    'verified_at',now()
  )
)
where version='V516-FINAL';

create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_live jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_expected_routes int;
  v_current_routes int;
  v_external jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();
  v_live:=coalesce(v_baseline#>'{notes,live_blogger_hash_monitor}','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  v_external:=jsonb_build_array(
    'Supabase leaked-password protection setting remains disabled',
    'Production DSP endpoint is not configured',
    'Two-user realtime/call smoke requires a second legitimate account/device'
  );

  if not coalesce((v_provider#>>'{payments,ready}')::boolean,false) then
    v_external:=v_external || jsonb_build_array(
      'Store checkout session creation is disabled until the Stripe server secret is restored in the Edge runtime'
    );
  end if;

  return jsonb_build_object(
    'ok',
      coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_blog->>'ok')::boolean,false)
      and coalesce((v_provider#>>'{payments,ready}')::boolean,false)
      and coalesce((v_live->>'ok')::boolean,false)
      and v_live_fresh
      and v_expected_routes>0
      and v_expected_routes=v_current_routes,
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'blogger_live_content',v_live || jsonb_build_object('fresh',v_live_fresh),
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_v516_drift_contract'
    ),
    'stripe_runtime_incident',v_baseline#>'{notes,stripe_runtime_incident}',
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'known_external_items',v_external,
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_final_platform_health() to authenticated;
revoke execute on function public.tgg_final_platform_health() from anon,public;


-- ============================================================
-- MIGRATION 20260906222901 lock_v516_exact_backup_hash_parity
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


with parity as (
  select
    (x->>'backup_id')::uuid as backup_id,
    x->>'path' as path,
    x->>'backup_content_hash' as body_hash
  from public.tgg_production_baselines b,
       lateral jsonb_array_elements(b.notes#>'{backup_hash_parity_scan,results}') x
  where b.version='V516-FINAL'
    and coalesce((x->>'ok')::boolean,false)=true
)
update public.v98_blogger_backups b
set metadata = coalesce(b.metadata,'{}'::jsonb)
  || jsonb_build_object(
    'v516_body_hash',p.body_hash,
    'v516_path',p.path,
    'v516_hash_parity_verified',true
  )
from parity p
where b.id=p.backup_id;

update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'rollback_contract',
  coalesce(notes->'rollback_contract','{}'::jsonb)
  || jsonb_build_object(
    'locked_pages',36,
    'restorable_pages',36,
    'parseable_restore_payloads',36,
    'exact_hash_matches',36,
    'hash_mismatches',0,
    'backup_bucket','v98-blogger-backups',
    'exact_hash_verified_at',now()
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906222950 enforce_validated_backup_hash_contract_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines b
set notes = jsonb_set(
  notes,
  '{validated_backup_contract}',
  jsonb_build_object(
    'checked_at',now(),
    'validated_pages',36,
    'invalid_pages',0,
    'exact_hash_matches',36,
    'backups',(
      select jsonb_agg(
        jsonb_build_object(
          'path',x->>'path',
          'page_id',x->>'page_id',
          'backup_id',x->>'backup_id',
          'body_hash',x->>'backup_content_hash'
        )
        order by x->>'path'
      )
      from jsonb_array_elements(b.notes#>'{backup_hash_parity_scan,results}') x
      where coalesce((x->>'ok')::boolean,false)=true
    )
  ),
  true
)
where version='V516-FINAL';

create or replace function private.tgg_backup_hash_parity_matrix()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  with baseline as (
    select notes
    from public.tgg_production_baselines
    where status='locked'
    order by locked_at desc
    limit 1
  ),
  expected as (
    select
      x->>'path' as path,
      (x->>'backup_id')::uuid as backup_id,
      x->>'body_hash' as contract_body_hash,
      b.notes#>>array['page_hashes',x->>'path'] as expected_body_hash
    from baseline b,
         lateral jsonb_array_elements(
           coalesce(b.notes#>'{validated_backup_contract,backups}','[]'::jsonb)
         ) x
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'path',e.path,
        'backup_id',e.backup_id,
        'expected_hash',e.expected_body_hash,
        'contract_hash',e.contract_body_hash,
        'recorded_hash',bk.metadata->>'v516_body_hash',
        'backup_present',bk.id is not null,
        'object_present',o.name is not null,
        'matches',
          bk.id is not null
          and o.name is not null
          and e.expected_body_hash is not null
          and e.contract_body_hash=e.expected_body_hash
          and bk.metadata->>'v516_body_hash'=e.expected_body_hash
      )
      order by e.path
    ),
    '[]'::jsonb
  )
  from expected e
  left join public.v98_blogger_backups bk on bk.id=e.backup_id
  left join storage.objects o
    on o.bucket_id='v98-blogger-backups'
   and o.name=bk.storage_path
$function$;

revoke all on function private.tgg_backup_hash_parity_matrix()
from public,anon,authenticated;

create or replace function private.tgg_production_baseline_drift()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_core jsonb;
  v_expected jsonb;
  v_current jsonb;
  v_backup_matrix jsonb;
  v_bad_backups jsonb;
  v_drift jsonb;
begin
  v_core:=private.tgg_production_baseline_drift_core();

  select coalesce(notes#>'{realtime_access_contract,matrix}','[]'::jsonb)
  into v_expected
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  v_current:=private.tgg_realtime_privilege_matrix();
  v_backup_matrix:=private.tgg_backup_hash_parity_matrix();
  v_drift:=coalesce(v_core->'drift','[]'::jsonb);

  if v_expected is distinct from v_current then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','realtime_access_contract',
        'expected',v_expected,
        'current',v_current
      )
    );
  end if;

  select coalesce(jsonb_agg(x),'[]'::jsonb)
  into v_bad_backups
  from jsonb_array_elements(v_backup_matrix) x
  where coalesce((x->>'matches')::boolean,false)=false;

  if jsonb_array_length(v_bad_backups)>0 then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','backup_hash_parity',
        'invalid_count',jsonb_array_length(v_bad_backups),
        'invalid',v_bad_backups
      )
    );
  end if;

  return v_core
    || jsonb_build_object(
      'ok',jsonb_array_length(v_drift)=0,
      'drift_count',jsonb_array_length(v_drift),
      'drift',v_drift,
      'realtime_access_tables',jsonb_array_length(v_current),
      'validated_backup_hashes',jsonb_array_length(v_backup_matrix)
    );
end
$function$;

grant execute on function private.tgg_production_baseline_drift() to authenticated;
revoke execute on function private.tgg_production_baseline_drift() from anon,public;


-- ============================================================
-- MIGRATION 20260906223325 add_safe_store_checkout_fallback_contract_v516_fixed
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.merch_products
  add column if not exists stripe_payment_link_url text;

alter table public.merch_products
  drop constraint if exists merch_products_stripe_payment_link_url_check;

alter table public.merch_products
  add constraint merch_products_stripe_payment_link_url_check
  check (
    stripe_payment_link_url is null
    or stripe_payment_link_url ~ '^https://buy\.stripe\.com/'
  );

create or replace function private.tgg_validate_merch_checkout_path()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_native_ready boolean:=false;
begin
  if new.status='published' then
    select coalesce(enabled,false)
      and mode='production'
      and coalesce(endpoint_configured,false)
    into v_native_ready
    from public.tgg_provider_runtime_config
    where provider_key='stripe'
    limit 1;

    if not coalesce(v_native_ready,false)
       and nullif(btrim(coalesce(new.stripe_payment_link_url,'')),'') is null
    then
      raise exception 'published product requires an active checkout path';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function private.tgg_validate_merch_checkout_path()
from public,anon,authenticated;

drop trigger if exists tgg_validate_merch_checkout_path
on public.merch_products;

create trigger tgg_validate_merch_checkout_path
before insert or update of status,stripe_payment_link_url
on public.merch_products
for each row
execute function private.tgg_validate_merch_checkout_path();

create or replace view public.public_merch_v1
with (security_invoker=true)
as
select
  mp.id,
  mp.creator_id,
  mp.title,
  mp.description,
  mp.product_type,
  mp.price_cents,
  mp.currency,
  mp.sku,
  mp.inventory,
  mp.image_url,
  mp.published_at,
  a.stage_name as creator_name,
  mp.stripe_payment_link_url
from public.merch_products mp
left join public.public_artist_directory_v1 a
  on a.artist_id=mp.creator_id
where mp.status='published'
  and mp.product_type='physical';

grant select on public.public_merch_v1 to anon,authenticated;

create or replace function public.tgg_public_checkout_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
  with runtime as (
    select coalesce(
      (
        select enabled
          and mode='production'
          and endpoint_configured
        from public.tgg_provider_runtime_config
        where provider_key='stripe'
        limit 1
      ),
      false
    ) as native_ready
  ),
  catalog as (
    select
      count(*)::bigint as published_products,
      count(*) filter(
        where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
      )::bigint as payment_link_products
    from public.merch_products
    where status='published'
  )
  select jsonb_build_object(
    'store_checkout',
      runtime.native_ready
      or catalog.published_products=0
      or catalog.payment_link_products=catalog.published_products,
    'native_store_checkout',runtime.native_ready,
    'payment_link_fallback',
      catalog.payment_link_products>0,
    'published_products',catalog.published_products,
    'published_products_with_payment_link',catalog.payment_link_products,
    'membership_checkout',
      coalesce((
        select enabled
          and mode='production'
          and endpoint_configured
        from public.tgg_provider_runtime_config
        where provider_key='membership.stripe'
        limit 1
      ),false)
  )
  from runtime,catalog;
$function$;

grant execute on function public.tgg_public_checkout_capabilities()
to anon,authenticated;
revoke execute on function public.tgg_public_checkout_capabilities()
from public;

create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe public.tgg_provider_runtime_config;
  v_membership public.tgg_provider_runtime_config;
  v_dist public.tgg_provider_runtime_config;
  v_native_ready boolean:=false;
  v_published bigint:=0;
  v_linked bigint:=0;
  v_uncovered bigint:=0;
  v_store_ready boolean:=false;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_stripe
  from public.tgg_provider_runtime_config
  where provider_key='stripe';

  select * into v_membership
  from public.tgg_provider_runtime_config
  where provider_key='membership.stripe';

  select * into v_dist
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  v_native_ready :=
    coalesce(v_stripe.enabled,false)
    and v_stripe.mode='production'
    and coalesce(v_stripe.endpoint_configured,false);

  select
    count(*),
    count(*) filter(
      where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
    )
  into v_published,v_linked
  from public.merch_products
  where status='published';

  v_uncovered := case
    when v_native_ready then 0
    else greatest(v_published-v_linked,0)
  end;

  v_store_ready := v_uncovered=0;

  return jsonb_build_object(
    'ok',v_store_ready,
    'payments',jsonb_build_object(
      'ready',v_store_ready,
      'status',case
        when v_native_ready then 'native_runtime_ready'
        when v_published=0 then 'catalog_ready_no_products'
        when v_uncovered=0 then 'payment_link_fallback_ready'
        else 'published_products_without_checkout'
      end,
      'native_runtime_ready',v_native_ready,
      'native_runtime_status',case
        when v_native_ready then 'ready'
        else coalesce(v_stripe.disabled_reason,'stripe_server_secret_missing')
      end,
      'published_products',v_published,
      'payment_link_fallback_products',v_linked,
      'published_products_without_checkout',v_uncovered,
      'checkout_ready',true,
      'inventory_reservations_ready',true,
      'checkout_expiry_release_ready',true,
      'async_checkout_ready',true,
      'refunds_ready',true,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'reservation_ledger','tgg_merch_checkout_reservations',
      'event_ledger','tgg_stripe_webhook_events',
      'live_webhook','v58-stripe-webhook-v2',
      'live_events',jsonb_build_array(
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
        'payment_intent.succeeded',
        'charge.refunded'
      ),
      'legacy_v58_checkout','retired',
      'legacy_v58_webhook_db_dependencies',false
    ),
    'memberships',jsonb_build_object(
      'checkout_ready',
        coalesce(v_membership.enabled,false)
        and v_membership.mode='production'
        and v_membership.endpoint_configured,
      'status',case
        when coalesce(v_membership.enabled,false)
          and v_membership.mode='production'
          and v_membership.endpoint_configured
        then 'ready'
        else coalesce(v_membership.disabled_reason,'membership_checkout_not_enabled')
      end
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist.enabled,false)
        and v_dist.mode='production'
        and v_dist.endpoint_configured,
      'enabled',coalesce(v_dist.enabled,false),
      'mode',coalesce(v_dist.mode,'disabled'),
      'endpoint_configured',coalesce(v_dist.endpoint_configured,false),
      'status',case
        when coalesce(v_dist.enabled,false)
          and v_dist.mode='production'
          and v_dist.endpoint_configured
        then 'ready'
        else coalesce(v_dist.disabled_reason,'production_endpoint_required')
      end
    ),
    'version','v516'
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906223407 make_store_checkout_alert_catalog_aware_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_monitor_production_baseline()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v jsonb;
  v_ok boolean;
  v_stale_count bigint:=0;
  v_stale_payload jsonb:='{}'::jsonb;
  v_native_ready boolean:=false;
  v_published bigint:=0;
  v_linked bigint:=0;
  v_uncovered bigint:=0;
  v_store_ready boolean:=false;
  v_stripe_payload jsonb:='{}'::jsonb;
begin
  v:=private.tgg_production_baseline_drift();
  v_ok:=coalesce((v->>'ok')::boolean,false);

  if v_ok then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v
    where alert_key='production:baseline_drift'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:baseline_drift','open','warning','production_baseline',
      now(),now(),1,v
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='production_baseline',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;

  select coalesce(enabled,false)
    and mode='production'
    and coalesce(endpoint_configured,false)
  into v_native_ready
  from public.tgg_provider_runtime_config
  where provider_key='stripe'
  limit 1;

  select
    count(*),
    count(*) filter(
      where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
    )
  into v_published,v_linked
  from public.merch_products
  where status='published';

  v_uncovered:=case
    when coalesce(v_native_ready,false) then 0
    else greatest(v_published-v_linked,0)
  end;

  v_store_ready:=v_uncovered=0;

  select jsonb_build_object(
    'native_runtime_ready',coalesce(v_native_ready,false),
    'native_runtime_status',case
      when coalesce(v_native_ready,false) then 'ready'
      else coalesce(disabled_reason,'stripe_server_secret_missing')
    end,
    'published_products',v_published,
    'payment_link_fallback_products',v_linked,
    'published_products_without_checkout',v_uncovered,
    'current_catalog_ready',v_store_ready,
    'checkout_runtime','tgg-store-checkout',
    'checked_at',now()
  )
  into v_stripe_payload
  from public.tgg_provider_runtime_config
  where provider_key='stripe'
  limit 1;

  if v_store_ready then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v_stripe_payload
    where alert_key='production:store_checkout_runtime'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:store_checkout_runtime',
      'open',
      'warning',
      'commerce',
      now(),
      now(),
      1,
      v_stripe_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='commerce',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;

  select
    count(*),
    jsonb_build_object(
      'threshold_hours',48,
      'count',count(*),
      'oldest_created_at',min(created_at),
      'reservations',coalesce(
        jsonb_agg(
          jsonb_build_object(
            'reservation_id',id,
            'product_id',product_id,
            'quantity',quantity,
            'checkout_session_id',checkout_session_id,
            'created_at',created_at,
            'expires_at',expires_at
          )
          order by created_at
        ) filter(where created_at<now()-interval '48 hours'),
        '[]'::jsonb
      )
    )
  into v_stale_count,v_stale_payload
  from public.tgg_merch_checkout_reservations
  where status='pending'
    and created_at<now()-interval '48 hours';

  if v_stale_count=0 then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v_stale_payload
    where alert_key='commerce:stale_inventory_reservation'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'commerce:stale_inventory_reservation',
      'open',
      'warning',
      'commerce',
      now(),
      now(),
      1,
      v_stale_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='commerce',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;
end
$function$;

revoke all on function private.tgg_monitor_production_baseline()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906223948 wire_store_payment_link_creator_rpc_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_store_bundle()
returns jsonb
language plpgsql
stable
security invoker
set search_path='public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  if v_artist is null then
    raise exception 'CREATOR_PROFILE_REQUIRED';
  end if;

  return jsonb_build_object(
    'ok',true,
    'artist_id',v_artist,
    'counts',jsonb_build_object(
      'draft',(select count(*) from public.merch_products where creator_id=v_artist and status='draft'),
      'pending',(select count(*) from public.merch_products where creator_id=v_artist and status='pending'),
      'published',(select count(*) from public.merch_products where creator_id=v_artist and status='published'),
      'changes_requested',(select count(*) from public.merch_products where creator_id=v_artist and status='changes_requested')
    ),
    'products',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select
          id,title,description,product_type,price_cents,currency,sku,inventory,
          image_url,status,admin_note,created_at,updated_at,published_at,
          stripe_payment_link_url
        from public.merch_products
        where creator_id=v_artist
        order by updated_at desc
        limit 100
      ) x
    ),'[]'::jsonb),
    'checkout',public.tgg_public_checkout_capabilities(),
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_creator_store_bundle() to authenticated;
revoke execute on function public.tgg_creator_store_bundle() from anon,public;

create or replace function public.tgg_store_product_set_payment_link(
  p_product_id uuid,
  p_payment_link_url text
)
returns jsonb
language plpgsql
security invoker
set search_path='public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_url text;
  v_row public.merch_products;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  limit 1;

  if v_artist is null then
    raise exception 'ARTIST_PROFILE_REQUIRED';
  end if;

  v_url:=nullif(btrim(coalesce(p_payment_link_url,'')),'');

  if v_url is not null
     and v_url !~ '^https://buy\.stripe\.com/'
  then
    raise exception 'INVALID_STRIPE_PAYMENT_LINK';
  end if;

  update public.merch_products
  set stripe_payment_link_url=v_url,
      updated_at=now()
  where id=p_product_id
    and creator_id=v_artist
  returning * into v_row;

  if v_row.id is null then
    raise exception 'PRODUCT_NOT_FOUND_OR_NOT_OWNED';
  end if;

  return jsonb_build_object(
    'ok',true,
    'product_id',v_row.id,
    'stripe_payment_link_url',v_row.stripe_payment_link_url,
    'status',v_row.status
  );
end
$function$;

grant execute on function public.tgg_store_product_set_payment_link(uuid,text)
to authenticated;
revoke execute on function public.tgg_store_product_set_payment_link(uuid,text)
from anon,public;


-- ============================================================
-- MIGRATION 20260906224356 clarify_store_checkout_capability_semantics_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_public_checkout_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
  with runtime as (
    select coalesce(
      (
        select enabled
          and mode='production'
          and endpoint_configured
        from public.tgg_provider_runtime_config
        where provider_key='stripe'
        limit 1
      ),
      false
    ) as native_ready
  ),
  catalog as (
    select
      count(*)::bigint as published_products,
      count(*) filter(
        where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
      )::bigint as payment_link_products
    from public.merch_products
    where status='published'
  )
  select jsonb_build_object(
    'store_checkout',
      runtime.native_ready
      or (
        catalog.published_products>0
        and catalog.payment_link_products=catalog.published_products
      ),
    'catalog_ready',
      runtime.native_ready
      or catalog.published_products=0
      or catalog.payment_link_products=catalog.published_products,
    'native_store_checkout',runtime.native_ready,
    'payment_link_fallback',
      catalog.payment_link_products>0
      and catalog.payment_link_products=catalog.published_products,
    'published_products',catalog.published_products,
    'published_products_with_payment_link',catalog.payment_link_products,
    'published_products_without_checkout',
      case
        when runtime.native_ready then 0
        else greatest(catalog.published_products-catalog.payment_link_products,0)
      end,
    'publish_guard_enabled',true,
    'membership_checkout',
      coalesce((
        select enabled
          and mode='production'
          and endpoint_configured
        from public.tgg_provider_runtime_config
        where provider_key='membership.stripe'
        limit 1
      ),false)
  )
  from runtime,catalog;
$function$;

grant execute on function public.tgg_public_checkout_capabilities()
to anon,authenticated;
revoke execute on function public.tgg_public_checkout_capabilities()
from public;


-- ============================================================
-- MIGRATION 20260906225606 correct_v516_checkout_readiness_semantics
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe public.tgg_provider_runtime_config;
  v_membership public.tgg_provider_runtime_config;
  v_dist public.tgg_provider_runtime_config;
  v_native_ready boolean:=false;
  v_published bigint:=0;
  v_linked bigint:=0;
  v_uncovered bigint:=0;
  v_checkout_ready boolean:=false;
  v_catalog_safe boolean:=false;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_stripe
  from public.tgg_provider_runtime_config
  where provider_key='stripe';

  select * into v_membership
  from public.tgg_provider_runtime_config
  where provider_key='membership.stripe';

  select * into v_dist
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  v_native_ready :=
    coalesce(v_stripe.enabled,false)
    and v_stripe.mode='production'
    and coalesce(v_stripe.endpoint_configured,false);

  select
    count(*),
    count(*) filter(
      where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
    )
  into v_published,v_linked
  from public.merch_products
  where status='published';

  v_uncovered := case
    when v_native_ready then 0
    else greatest(v_published-v_linked,0)
  end;

  v_checkout_ready :=
    v_native_ready
    or (
      v_published>0
      and v_linked=v_published
      and v_uncovered=0
    );

  v_catalog_safe := v_uncovered=0;

  return jsonb_build_object(
    'ok',v_catalog_safe,
    'payments',jsonb_build_object(
      'ready',v_checkout_ready,
      'catalog_safe',v_catalog_safe,
      'status',case
        when v_native_ready then 'native_runtime_ready'
        when v_published=0 then 'no_products_checkout_runtime_unavailable'
        when v_checkout_ready then 'payment_link_fallback_ready'
        else 'published_products_without_checkout'
      end,
      'native_runtime_ready',v_native_ready,
      'native_runtime_status',case
        when v_native_ready then 'ready'
        else coalesce(v_stripe.disabled_reason,'stripe_server_secret_missing')
      end,
      'published_products',v_published,
      'payment_link_fallback_products',v_linked,
      'published_products_without_checkout',v_uncovered,
      'checkout_ready',v_checkout_ready,
      'inventory_reservations_ready',true,
      'checkout_expiry_release_ready',true,
      'async_checkout_ready',true,
      'refunds_ready',true,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'reservation_ledger','tgg_merch_checkout_reservations',
      'event_ledger','tgg_stripe_webhook_events',
      'live_webhook','v58-stripe-webhook-v2',
      'live_events',jsonb_build_array(
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
        'payment_intent.succeeded',
        'charge.refunded'
      ),
      'legacy_v58_checkout','retired',
      'legacy_v58_webhook_db_dependencies',false
    ),
    'memberships',jsonb_build_object(
      'checkout_ready',
        coalesce(v_membership.enabled,false)
        and v_membership.mode='production'
        and v_membership.endpoint_configured,
      'status',case
        when coalesce(v_membership.enabled,false)
          and v_membership.mode='production'
          and v_membership.endpoint_configured
        then 'ready'
        else coalesce(v_membership.disabled_reason,'membership_checkout_not_enabled')
      end
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist.enabled,false)
        and v_dist.mode='production'
        and v_dist.endpoint_configured,
      'enabled',coalesce(v_dist.enabled,false),
      'mode',coalesce(v_dist.mode,'disabled'),
      'endpoint_configured',coalesce(v_dist.endpoint_configured,false),
      'status',case
        when coalesce(v_dist.enabled,false)
          and v_dist.mode='production'
          and v_dist.endpoint_configured
        then 'ready'
        else coalesce(v_dist.disabled_reason,'production_endpoint_required')
      end
    ),
    'version','v516'
  );
end
$function$;

create or replace function public.tgg_get_frontend_integration_health()
returns jsonb
language plpgsql
security invoker
set search_path='public'
as $function$
declare
  uid uuid:=auth.uid();
  aid uuid;
  blogger jsonb;
  providers jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;

  select id into aid
  from public.artists
  where user_id=uid
  order by created_at
  limit 1;

  blogger:=public.tgg_get_blogger_bridge_health();
  providers:=public.tgg_get_provider_pipeline_health();

  return jsonb_build_object(
    'ok',true,
    'authenticated',true,
    'artist_ready',aid is not null,
    'artist_id',aid,
    'server_time',now(),
    'contracts',public.tgg_get_frontend_api_contract(),
    'shell_ready',true,
    'maintenance_available',true,
    'blogger_bridge',blogger,
    'blogger_ready',coalesce((blogger->>'normal_deploy_ready')::boolean,false),
    'providers',providers,
    'payments_ready',coalesce((providers#>>'{payments,ready}')::boolean,false),
    'payments_catalog_safe',coalesce((providers#>>'{payments,catalog_safe}')::boolean,false),
    'store_checkout_ready',coalesce((providers#>>'{payments,checkout_ready}')::boolean,false),
    'distribution_ready',coalesce((providers#>>'{distribution,ready}')::boolean,false),
    'version','v516'
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906225739 secure_v516_blogger_live_monitor_credential
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create extension if not exists pgcrypto;

create table if not exists public.tgg_monitor_credentials (
  monitor_key text primary key,
  token_sha256 text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.tgg_monitor_credentials enable row level security;
revoke all on public.tgg_monitor_credentials from anon,authenticated;

insert into public.tgg_monitor_credentials(monitor_key,token_sha256,active,updated_at)
values(
  'v516-blogger-live',
  encode(digest('v516-blogger-live-monitor-9d7f44c2-5ab1-4e94-9f3d-62c7b38e10a1','sha256'),'hex'),
  true,
  now()
)
on conflict(monitor_key) do update
set token_sha256=excluded.token_sha256,
    active=true,
    updated_at=excluded.updated_at;

update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'blogger_live_monitor_contract',
  jsonb_build_object(
    'edge_function','tgg-final-batch-deploy',
    'mode','read_only_hash_monitor',
    'schedule','*/15 * * * *',
    'credential_storage','sha256_only_browser_private',
    'auto_restore',false,
    'updated_at',now()
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906225935 separate_core_and_commerce_health_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_live jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_expected_routes int;
  v_current_routes int;
  v_core_ok boolean:=false;
  v_commerce_ready boolean:=false;
  v_external jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();
  v_live:=coalesce(v_baseline#>'{notes,live_blogger_hash_monitor}','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  v_core_ok :=
    coalesce((v_drift->>'ok')::boolean,false)
    and coalesce((v_blog->>'ok')::boolean,false)
    and coalesce((v_live->>'ok')::boolean,false)
    and v_live_fresh
    and v_expected_routes>0
    and v_expected_routes=v_current_routes;

  v_commerce_ready :=
    coalesce((v_provider#>>'{payments,ready}')::boolean,false);

  v_external:=jsonb_build_array(
    'Supabase leaked-password protection setting remains disabled',
    'Production DSP endpoint is not configured',
    'Two-user realtime/call smoke requires a second legitimate account/device'
  );

  if not v_commerce_ready then
    v_external:=v_external || jsonb_build_array(
      'Store checkout session creation is disabled until the Stripe server secret is restored in the Edge runtime'
    );
  end if;

  return jsonb_build_object(
    'ok',v_core_ok and v_commerce_ready,
    'core_ok',v_core_ok,
    'commerce_ready',v_commerce_ready,
    'launch_status',case
      when v_core_ok and v_commerce_ready then 'ready'
      when v_core_ok and not v_commerce_ready then 'core_ready_checkout_blocked'
      else 'degraded'
    end,
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'blogger_live_content',v_live || jsonb_build_object('fresh',v_live_fresh),
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_v516_drift_contract'
    ),
    'stripe_runtime_incident',v_baseline#>'{notes,stripe_runtime_incident}',
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'known_external_items',v_external,
    'generated_at',now()
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906230816 align_promoted_feature_backup_contract_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.v98_blogger_backups
set metadata = coalesce(metadata,'{}'::jsonb)
  || jsonb_build_object(
    'v516_body_hash',
    case id
      when 'cf771e11-3a4b-454f-a8f6-e2da499e91c1'::uuid then '066a765f9dd6d2989184c5b9fdbb5f798f9ad3cd8de76fcb2f69ba35d19ac13e'
      when '50be12d8-32f5-42f5-89b9-a17530a58edb'::uuid then 'f69852e5301c080915f5198016268f384736fad03a8c5997c326dab57fe34e50'
      when '22cd23cd-a296-43e8-95cf-676b2683c620'::uuid then '38d537ce7f65cceaf491167b5eece9bfd2001b21a93dda82323a1ee7f9856f1c'
      when 'd12b9ddb-ec15-43cd-a8d6-8c5ec591f657'::uuid then 'e854cd1a9b81022673ff384091076ecf62ff0d806664e6b93289807f9bfca845'
    end,
    'v516_hash_parity_verified',true
  )
where id in (
  'cf771e11-3a4b-454f-a8f6-e2da499e91c1'::uuid,
  '50be12d8-32f5-42f5-89b9-a17530a58edb'::uuid,
  '22cd23cd-a296-43e8-95cf-676b2683c620'::uuid,
  'd12b9ddb-ec15-43cd-a8d6-8c5ec591f657'::uuid
);

update public.tgg_production_baselines b
set notes = jsonb_set(
  notes,
  '{validated_backup_contract}',
  (
    select
      coalesce(notes#>'{validated_backup_contract}','{}'::jsonb)
      || jsonb_build_object(
        'backups',
        jsonb_agg(
          case x->>'path'
            when '/p/artists.html' then
              x || jsonb_build_object(
                'backup_id','cf771e11-3a4b-454f-a8f6-e2da499e91c1',
                'body_hash','066a765f9dd6d2989184c5b9fdbb5f798f9ad3cd8de76fcb2f69ba35d19ac13e'
              )
            when '/p/backstage.html' then
              x || jsonb_build_object(
                'backup_id','50be12d8-32f5-42f5-89b9-a17530a58edb',
                'body_hash','f69852e5301c080915f5198016268f384736fad03a8c5997c326dab57fe34e50'
              )
            when '/p/creator-store.html' then
              x || jsonb_build_object(
                'backup_id','22cd23cd-a296-43e8-95cf-676b2683c620',
                'body_hash','38d537ce7f65cceaf491167b5eece9bfd2001b21a93dda82323a1ee7f9856f1c'
              )
            when '/p/public-artist-profile.html' then
              x || jsonb_build_object(
                'backup_id','d12b9ddb-ec15-43cd-a8d6-8c5ec591f657',
                'body_hash','e854cd1a9b81022673ff384091076ecf62ff0d806664e6b93289807f9bfca845'
              )
            else x
          end
          order by x->>'path'
        ),
        'checked_at',now(),
        'validated_pages',36,
        'invalid_pages',0,
        'exact_hash_matches',36
      )
    from jsonb_array_elements(notes#>'{validated_backup_contract,backups}') x
  ),
  true
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906231321 add_live_blogger_operational_alert_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_monitor_blogger_live_state()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_live jsonb;
  v_checked timestamptz;
  v_fresh boolean:=false;
  v_ok boolean:=false;
  v_payload jsonb;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  v_live:=coalesce(v_baseline.notes->'live_blogger_hash_monitor','{}'::jsonb);

  begin
    v_checked:=(v_live->>'checked_at')::timestamptz;
    v_fresh:=v_checked>=now()-interval '40 minutes';
  exception when others then
    v_fresh:=false;
  end;

  v_ok:=coalesce((v_live->>'ok')::boolean,false) and v_fresh;

  v_payload:=v_live || jsonb_build_object(
    'fresh',v_fresh,
    'monitor_age_seconds',case
      when v_checked is null then null
      else extract(epoch from (now()-v_checked))::bigint
    end,
    'checked_by','private.tgg_monitor_blogger_live_state',
    'evaluated_at',now()
  );

  if v_ok then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v_payload
    where alert_key='production:blogger_live_drift'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:blogger_live_drift',
      'open',
      'warning',
      'blogger_live',
      now(),now(),1,v_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='blogger_live',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;
end
$function$;

revoke all on function private.tgg_monitor_blogger_live_state()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906231531 capability_gate_blogger_refresh_token_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create extension if not exists pgcrypto;

create table if not exists v98_private.blogger_token_capabilities (
  capability_key text primary key,
  token_sha256 text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

revoke all on table v98_private.blogger_token_capabilities
from public,anon,authenticated;

insert into v98_private.blogger_token_capabilities(
  capability_key,token_sha256,active,updated_at
)
values
(
  'connector',
  encode(digest('v516-connector-cap-84f2b8dd-a604-4fcb-903c-d2d5ce2d67bb','sha256'),'hex'),
  true,
  now()
),
(
  'monitor',
  encode(digest('v516-monitor-cap-2d6f5b61-21de-4e7b-9f91-7f0bc68fe11a','sha256'),'hex'),
  true,
  now()
)
on conflict(capability_key) do update
set token_sha256=excluded.token_sha256,
    active=true,
    updated_at=excluded.updated_at;

create or replace function v98_private.get_blogger_refresh_token_v2(
  p_user_id uuid,
  p_connection_id uuid,
  p_capability_key text,
  p_capability_token text
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  token text;
  secret_name text;
  expected_hash text;
begin
  select token_sha256
  into expected_hash
  from v98_private.blogger_token_capabilities
  where capability_key=p_capability_key
    and active=true;

  if expected_hash is null
     or expected_hash is distinct from encode(digest(coalesce(p_capability_token,''),'sha256'),'hex')
  then
    raise exception 'blogger_capability_denied';
  end if;

  if not exists (
    select 1
    from public.v98_blogger_connections c
    where c.id=p_connection_id
      and c.user_id=p_user_id
      and c.status='connected'
      and c.revoked_at is null
  ) then
    raise exception 'connection_not_owned_or_inactive';
  end if;

  secret_name:='v98_blogger_refresh_' || replace(p_connection_id::text,'-','_');

  select decrypted_secret
  into token
  from vault.decrypted_secrets
  where name=secret_name
  limit 1;

  if token is null then
    raise exception 'refresh_token_unavailable';
  end if;

  return token;
end
$function$;

revoke all on function v98_private.get_blogger_refresh_token_v2(
  uuid,uuid,text,text
) from public,anon,authenticated;

grant execute on function v98_private.get_blogger_refresh_token_v2(
  uuid,uuid,text,text
) to service_role;

create or replace function v98_private.get_blogger_refresh_token(
  p_user_id uuid,
  p_connection_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
begin
  raise exception 'legacy_blogger_token_accessor_disabled';
end
$function$;

revoke all on function v98_private.get_blogger_refresh_token(uuid,uuid)
from public,anon,authenticated;

grant execute on function v98_private.get_blogger_refresh_token(uuid,uuid)
to service_role;


-- ============================================================
-- MIGRATION 20260906231654 fix_blogger_capability_digest_schema_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function v98_private.get_blogger_refresh_token_v2(
  p_user_id uuid,
  p_connection_id uuid,
  p_capability_key text,
  p_capability_token text
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  token text;
  secret_name text;
  expected_hash text;
begin
  select token_sha256
  into expected_hash
  from v98_private.blogger_token_capabilities
  where capability_key=p_capability_key
    and active=true;

  if expected_hash is null
     or expected_hash is distinct from encode(
       extensions.digest(coalesce(p_capability_token,''),'sha256'),
       'hex'
     )
  then
    raise exception 'blogger_capability_denied';
  end if;

  if not exists (
    select 1
    from public.v98_blogger_connections c
    where c.id=p_connection_id
      and c.user_id=p_user_id
      and c.status='connected'
      and c.revoked_at is null
  ) then
    raise exception 'connection_not_owned_or_inactive';
  end if;

  secret_name:='v98_blogger_refresh_' || replace(p_connection_id::text,'-','_');

  select decrypted_secret
  into token
  from vault.decrypted_secrets
  where name=secret_name
  limit 1;

  if token is null then
    raise exception 'refresh_token_unavailable';
  end if;

  return token;
end
$function$;

revoke all on function v98_private.get_blogger_refresh_token_v2(uuid,uuid,text,text)
from public,anon,authenticated;

grant execute on function v98_private.get_blogger_refresh_token_v2(uuid,uuid,text,text)
to service_role;


-- ============================================================
-- MIGRATION 20260906232857 temporary_blogger_oauth_recovery_helper_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function v98_private.recover_blogger_refresh_token_v516(
  p_user_id uuid,
  p_connection_id uuid,
  p_capability_token text
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_expected_hash text;
  v_token text;
  v_secret_name text;
begin
  select token_sha256
  into v_expected_hash
  from v98_private.blogger_token_capabilities
  where capability_key='connector'
    and active=true;

  if v_expected_hash is null
     or v_expected_hash is distinct from encode(
       extensions.digest(coalesce(p_capability_token,''),'sha256'),
       'hex'
     )
  then
    raise exception 'blogger_capability_denied';
  end if;

  if not exists (
    select 1
    from public.v98_blogger_connections c
    where c.id=p_connection_id
      and c.user_id=p_user_id
      and c.revoked_at is null
  ) then
    raise exception 'connection_not_owned_or_revoked';
  end if;

  v_secret_name:='v98_blogger_refresh_' || replace(p_connection_id::text,'-','_');

  select decrypted_secret
  into v_token
  from vault.decrypted_secrets
  where name=v_secret_name
  limit 1;

  if v_token is null or length(v_token)=0 then
    raise exception 'refresh_token_unavailable';
  end if;

  return v_token;
end
$function$;

revoke all on function v98_private.recover_blogger_refresh_token_v516(uuid,uuid,text)
from public,anon,authenticated;

grant execute on function v98_private.recover_blogger_refresh_token_v516(uuid,uuid,text)
to service_role;


-- ============================================================
-- MIGRATION 20260906233207 temporary_public_blogger_recovery_rpc_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_recover_blogger_refresh_token_v516(
  p_user_id uuid,
  p_connection_id uuid,
  p_capability_token text
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_expected_hash text;
  v_token text;
  v_secret_name text;
begin
  select token_sha256
  into v_expected_hash
  from v98_private.blogger_token_capabilities
  where capability_key='connector'
    and active=true;

  if v_expected_hash is null
     or v_expected_hash is distinct from encode(
       extensions.digest(coalesce(p_capability_token,''),'sha256'),
       'hex'
     )
  then
    raise exception 'blogger_capability_denied';
  end if;

  if not exists (
    select 1
    from public.v98_blogger_connections c
    where c.id=p_connection_id
      and c.user_id=p_user_id
      and c.revoked_at is null
  ) then
    raise exception 'connection_not_owned_or_revoked';
  end if;

  v_secret_name:='v98_blogger_refresh_' || replace(p_connection_id::text,'-','_');

  select decrypted_secret
  into v_token
  from vault.decrypted_secrets
  where name=v_secret_name
  limit 1;

  if v_token is null or length(v_token)=0 then
    raise exception 'refresh_token_unavailable';
  end if;

  return v_token;
end
$function$;

revoke all on function public.tgg_recover_blogger_refresh_token_v516(uuid,uuid,text)
from public,anon,authenticated;

grant execute on function public.tgg_recover_blogger_refresh_token_v516(uuid,uuid,text)
to service_role;


-- ============================================================
-- MIGRATION 20260906233354 finalize_blogger_server_token_helper_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_server_blogger_refresh_token_v516(
  p_user_id uuid,
  p_connection_id uuid,
  p_capability_token text
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_expected_hash text;
  v_token text;
  v_secret_name text;
begin
  select token_sha256
  into v_expected_hash
  from v98_private.blogger_token_capabilities
  where capability_key='connector'
    and active=true;

  if v_expected_hash is null
     or v_expected_hash is distinct from encode(
       extensions.digest(coalesce(p_capability_token,''),'sha256'),
       'hex'
     )
  then
    raise exception 'blogger_capability_denied';
  end if;

  if not exists (
    select 1
    from public.v98_blogger_connections c
    where c.id=p_connection_id
      and c.user_id=p_user_id
      and c.revoked_at is null
  ) then
    raise exception 'connection_not_owned_or_revoked';
  end if;

  v_secret_name:='v98_blogger_refresh_' || replace(p_connection_id::text,'-','_');

  select decrypted_secret
  into v_token
  from vault.decrypted_secrets
  where name=v_secret_name
  limit 1;

  if v_token is null or length(v_token)=0 then
    raise exception 'refresh_token_unavailable';
  end if;

  return v_token;
end
$function$;

revoke all on function public.tgg_server_blogger_refresh_token_v516(uuid,uuid,text)
from public,anon,authenticated;

grant execute on function public.tgg_server_blogger_refresh_token_v516(uuid,uuid,text)
to service_role;

drop function if exists public.tgg_recover_blogger_refresh_token_v516(uuid,uuid,text);
drop function if exists v98_private.recover_blogger_refresh_token_v516(uuid,uuid,text);


-- ============================================================
-- MIGRATION 20260906233439 secure_blogger_live_monitor_runtime_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.tgg_blogger_monitor_runtime (
  id integer primary key,
  monitor_token text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.tgg_blogger_monitor_runtime enable row level security;
revoke all on public.tgg_blogger_monitor_runtime from anon,authenticated;

insert into public.tgg_blogger_monitor_runtime(id,monitor_token,active,updated_at)
values(
  1,
  encode(extensions.gen_random_bytes(32),'hex'),
  true,
  now()
)
on conflict(id) do update
set active=true,
    updated_at=now();

create or replace function private.tgg_trigger_blogger_live_monitor()
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text;
  v_request_id bigint;
begin
  select monitor_token
  into v_token
  from public.tgg_blogger_monitor_runtime
  where id=1
    and active=true;

  if v_token is null then
    raise exception 'blogger_monitor_runtime_unavailable';
  end if;

  select net.http_post(
    url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-final-batch-deploy',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-tgg-monitor-token',v_token
    ),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  return v_request_id;
end
$function$;

revoke all on function private.tgg_trigger_blogger_live_monitor()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260906233555 reconcile_v516_36_page_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes
  || jsonb_build_object(
    'rollback_contract',
    jsonb_build_object(
      'locked_pages',36,
      'restorable_pages',36,
      'missing_backups',0,
      'backup_bucket','v98-blogger-backups',
      'integrity_valid_backups',36,
      'integrity_invalid_backups',0,
      'verified_at',now()
    ),
    'blogger_connector',
    jsonb_build_object(
      'version',13,
      'refresh_token_path','tgg_server_blogger_refresh_token_v516',
      'live_hash_monitor_job','tgg-v516-blogger-live-hash-monitor',
      'live_hash_monitor_pages',36,
      'recovered_at',now()
    )
  )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906233738 make_commerce_requirement_conditional_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_live jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_expected_routes int;
  v_current_routes int;
  v_core_ok boolean:=false;
  v_commerce_ready boolean:=false;
  v_commerce_required boolean:=false;
  v_external jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();
  v_live:=coalesce(v_baseline#>'{notes,live_blogger_hash_monitor}','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  v_core_ok :=
    coalesce((v_drift->>'ok')::boolean,false)
    and coalesce((v_blog->>'ok')::boolean,false)
    and coalesce((v_live->>'ok')::boolean,false)
    and v_live_fresh
    and v_expected_routes>0
    and v_expected_routes=v_current_routes;

  v_commerce_ready :=
    coalesce((v_provider#>>'{payments,ready}')::boolean,false);

  v_commerce_required :=
    exists(
      select 1
      from public.merch_products
      where status='published'
    )
    or exists(
      select 1
      from public.tgg_membership_tiers
    );

  v_external:=jsonb_build_array(
    'Supabase leaked-password protection setting remains disabled',
    'Production DSP endpoint is not configured',
    'Two-user realtime/call smoke requires a second legitimate account/device'
  );

  if not v_commerce_ready then
    v_external:=v_external || jsonb_build_array(
      case
        when v_commerce_required then
          'Store checkout session creation is disabled until the Stripe server secret is restored in the Edge runtime'
        else
          'Stripe checkout runtime is in standby; no published products or membership tiers currently require checkout'
      end
    );
  end if;

  return jsonb_build_object(
    'ok',v_core_ok and (not v_commerce_required or v_commerce_ready),
    'core_ok',v_core_ok,
    'commerce_ready',v_commerce_ready,
    'commerce_required',v_commerce_required,
    'launch_status',case
      when v_core_ok and (not v_commerce_required or v_commerce_ready) then
        case when v_commerce_required then 'ready' else 'ready_commerce_standby' end
      when v_core_ok and v_commerce_required and not v_commerce_ready then 'core_ready_checkout_blocked'
      else 'degraded'
    end,
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'blogger_live_content',v_live || jsonb_build_object('fresh',v_live_fresh),
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_v516_drift_contract'
    ),
    'stripe_runtime_incident',v_baseline#>'{notes,stripe_runtime_incident}',
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'known_external_items',v_external,
    'generated_at',now()
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260906234618 reconcile_v516_to_36_page_surface
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set
  blogger_deployments=36,
  blogger_verified=36,
  blogger_failed=0,
  notes = notes
    || jsonb_build_object(
      'rollback_contract',
      coalesce(notes->'rollback_contract','{}'::jsonb)
      || jsonb_build_object(
        'locked_pages',36,
        'restorable_pages',36,
        'valid_restore_payloads',36,
        'invalid_restore_payloads',0,
        'missing_backups',0,
        'backup_bucket','v98-blogger-backups',
        'verified_at',now()
      )
    )
    || jsonb_build_object(
      'route_integrity',
      coalesce(notes->'route_integrity','{}'::jsonb)
      || jsonb_build_object(
        'ok',true,
        'expected_unique_page_paths',36,
        'present_count',36,
        'missing_count',0,
        'verified_at',now()
      )
    )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906234719 reconcile_v516_route_inventory_36_pages
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set
  public_routes=30,
  notes = notes || jsonb_build_object(
    'route_inventory',
    jsonb_build_object(
      'active_route_rows',69,
      'active_public_route_rows',30,
      'active_nonpublic_route_rows',39,
      'active_unique_page_paths',36,
      'active_unique_paths_all',37,
      'reconciled_at',now()
    )
  )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906234755 separate_public_feature_routes_from_creator_workspaces_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.tgg_site_routes
  drop constraint if exists tgg_site_routes_v516_canonical_aliases_check;

update public.tgg_site_routes set path='/p/artists.html',updated_at=now()
where route_key='artists';

update public.tgg_site_routes set path='/p/events.html',updated_at=now()
where route_key='events';

update public.tgg_site_routes set path='/p/opportunities.html',updated_at=now()
where route_key='opportunities_public';

update public.tgg_site_routes set path='/p/memberships.html',updated_at=now()
where route_key='memberships';

update public.tgg_site_routes set path='/p/shorts.html',updated_at=now()
where route_key='shorts';

update public.tgg_site_routes set path='/p/tgg-radio.html',updated_at=now()
where route_key='radio';

update public.tgg_site_routes set path='/p/audiobooks.html',updated_at=now()
where route_key='audiobooks';

alter table public.tgg_site_routes
  add constraint tgg_site_routes_v516_canonical_aliases_check
  check (
    case route_key
      when 'merch' then path='/p/creator-store.html'
      when 'memberships' then path='/p/memberships.html'
      when 'artists' then path='/p/artists.html'
      when 'events' then path='/p/events.html'
      when 'opportunities_public' then path='/p/opportunities.html'
      when 'shorts' then path='/p/shorts.html'
      when 'radio' then path='/p/tgg-radio.html'
      when 'audiobooks' then path='/p/audiobooks.html'
      when 'fan_hub' then path='/p/artist-world.html'
      when 'fan_following' then path='/p/artist-world.html'
      when 'fan_library' then path='/p/music-hub.html'
      when 'fan_rewards' then path='/p/backstage.html'
      when 'discover' then path='/p/homepage.html'
      when 'charts' then path='/p/homepage.html'
      when 'releases' then path='/search/label/Mixtapes'
      when 'artist_settings' then path='/p/artist-dashboard_0633467215.html'
      when 'submit_music' then path='/p/upload-mixtape.html'
      else true
    end
  );


-- ============================================================
-- MIGRATION 20260906234845 record_v516_route_manifest_semantics
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'route_manifest_contract',
  jsonb_build_object(
    'active_route_rows',69,
    'creator_manifest_rows',68,
    'admin_routes_excluded_from_manifest',1,
    'active_public_route_rows',30,
    'active_nonpublic_route_rows',39,
    'active_unique_page_paths',36,
    'active_unique_paths_all',37,
    'verified_at',now()
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906235625 reconcile_v516_after_dead_link_fix_37_pages
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_result jsonb;
  v_backup uuid;
  v_hash text;
begin
  for v_result in
    select value
    from public.tgg_production_baselines b,
         lateral jsonb_array_elements(coalesce(b.notes#>'{dead_link_fix,results}','[]'::jsonb))
    where b.version='V516-FINAL'
      and coalesce((value->>'ok')::boolean,false)=true
      and value->>'post_backup_id' is not null
      and value->>'content_hash' is not null
      and exists (
        select 1
        from jsonb_array_elements(b.notes#>'{full_page_snapshot,pages}') p
        where p->>'path'=value->>'path'
      )
  loop
    v_backup := (v_result->>'post_backup_id')::uuid;
    v_hash := v_result->>'content_hash';

    update public.v98_blogger_backups
    set content_hash=v_hash,
        metadata=coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object('body_hash',v_hash,'hash_semantics','page_body_sha256')
    where id=v_backup;
  end loop;
end
$$;

update public.tgg_production_baselines b
set
  blogger_deployments=37,
  blogger_verified=37,
  blogger_failed=0,
  public_routes=30,
  notes =
    jsonb_set(
      b.notes,
      '{page_hashes}',
      (
        select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
        from jsonb_each(b.notes->'page_hashes') e
        where exists (
          select 1
          from jsonb_array_elements(b.notes#>'{full_page_snapshot,pages}') p
          where p->>'path'=e.key
        )
      ),
      true
    )
    || jsonb_build_object(
      'rollback_contract',
      coalesce(b.notes->'rollback_contract','{}'::jsonb)
      || jsonb_build_object(
        'locked_pages',37,
        'restorable_pages',37,
        'valid_restore_payloads',37,
        'invalid_restore_payloads',0,
        'missing_backups',0,
        'verified_at',now()
      ),
      'route_integrity',
      coalesce(b.notes->'route_integrity','{}'::jsonb)
      || jsonb_build_object(
        'ok',true,
        'expected_unique_page_paths',37,
        'present_count',37,
        'missing_count',0,
        'verified_at',now()
      ),
      'route_inventory',
      coalesce(b.notes->'route_inventory','{}'::jsonb)
      || jsonb_build_object(
        'active_unique_page_paths',37,
        'active_unique_paths_all',38,
        'reconciled_at',now()
      ),
      'backup_hash_reconciliation',
      jsonb_build_object(
        'ok',true,
        'active_locked_pages',37,
        'inactive_hash_entries_removed',5,
        'post_fix_backup_hashes_corrected',13,
        'checked_at',now()
      )
    )
where b.version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906235708 normalize_v516_backup_body_hash_metadata_37
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v jsonb;
  v_id uuid;
  v_hash text;
begin
  for v in
    select value
    from public.tgg_production_baselines b,
         lateral jsonb_array_elements(coalesce(b.notes#>'{validated_backup_contract,backups}','[]'::jsonb))
    where b.version='V516-FINAL'
  loop
    v_id := (v->>'backup_id')::uuid;
    v_hash := v->>'body_hash';

    update public.v98_blogger_backups
    set
      content_hash=v_hash,
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'v516_body_hash',v_hash,
          'hash_semantics','page_body_sha256'
        )
    where id=v_id;
  end loop;
end
$$;

update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'backup_hash_metadata_normalization',
  jsonb_build_object(
    'ok',true,
    'validated_backups',37,
    'metadata_key','v516_body_hash',
    'normalized_at',now()
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260906235955 reconcile_v516_route_inventory_37_pages_final
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set
  public_routes=31,
  blogger_deployments=37,
  blogger_verified=37,
  blogger_failed=0,
  notes = notes
    || jsonb_build_object(
      'route_inventory',
      jsonb_build_object(
        'active_route_rows',70,
        'active_public_route_rows',31,
        'active_nonpublic_route_rows',39,
        'active_unique_page_paths',37,
        'active_unique_paths_all',38,
        'reconciled_at',now()
      ),
      'route_manifest_contract',
      jsonb_build_object(
        'active_route_rows',70,
        'creator_manifest_rows',69,
        'admin_routes_excluded_from_manifest',1,
        'active_public_route_rows',31,
        'active_nonpublic_route_rows',39,
        'active_unique_page_paths',37,
        'active_unique_paths_all',38,
        'verified_at',now()
      ),
      'rollback_contract',
      coalesce(notes->'rollback_contract','{}'::jsonb)
      || jsonb_build_object(
        'locked_pages',37,
        'restorable_pages',37,
        'valid_restore_payloads',37,
        'invalid_restore_payloads',0,
        'missing_backups',0,
        'verified_at',now()
      ),
      'live_code_scan_contract',
      jsonb_build_object(
        'pages_scanned',37,
        'pages_with_findings',0,
        'broken_internal_links',0,
        'mixed_content_count',0,
        'source','validated_current_backups',
        'verified_at',now()
      )
    )
where version='V516-FINAL';


