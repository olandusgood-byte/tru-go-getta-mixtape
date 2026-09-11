-- TRU GO GETTA production migration history archive
-- Date bucket: 20260902
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260902054812 v59_video_live_operations_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_video_create(p_title text,p_description text default null,p_genre text default null,p_release_date date default null,p_explicit_content boolean default false,p_video_url text default null,p_thumbnail_url text default null,p_visibility text default 'private',p_featured boolean default false,p_allow_downloads boolean default false) returns public.videos language plpgsql security definer set search_path=public as $$ declare v public.videos; begin if auth.uid() is null then raise exception 'authentication_required'; end if; if coalesce(trim(p_title),'')='' then raise exception 'title_required'; end if; if p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if; insert into public.videos(artist_id,title,description,genre,release_date,explicit_content,video_url,thumbnail_url,visibility,featured,allow_downloads,status) values(auth.uid(),trim(p_title),p_description,p_genre,p_release_date,p_explicit_content,p_video_url,p_thumbnail_url,p_visibility,p_featured,p_allow_downloads,case when p_visibility='public' and coalesce(p_video_url,'')<>'' then 'published' else 'draft' end) returning * into v; return v; end $$; create or replace function public.tgg_video_update(p_video_id uuid,p_title text default null,p_description text default null,p_genre text default null,p_release_date date default null,p_explicit_content boolean default null,p_thumbnail_url text default null,p_visibility text default null,p_featured boolean default null,p_allow_downloads boolean default null) returns public.videos language plpgsql security definer set search_path=public as $$ declare v public.videos; begin if auth.uid() is null then raise exception 'authentication_required'; end if; update public.videos set title=coalesce(nullif(trim(p_title),''),title),description=coalesce(p_description,description),genre=coalesce(p_genre,genre),release_date=coalesce(p_release_date,release_date),explicit_content=coalesce(p_explicit_content,explicit_content),thumbnail_url=coalesce(p_thumbnail_url,thumbnail_url),visibility=coalesce(p_visibility,visibility),featured=coalesce(p_featured,featured),allow_downloads=coalesce(p_allow_downloads,allow_downloads),updated_at=now() where id=p_video_id and artist_id=auth.uid() returning * into v; if not found then raise exception 'video_not_found_or_not_owned'; end if; return v; end $$; create or replace function public.tgg_video_publish(p_video_id uuid) returns public.videos language plpgsql security definer set search_path=public as $$ declare v public.videos; begin if auth.uid() is null then raise exception 'authentication_required'; end if; update public.videos set visibility='public',status='published',release_date=coalesce(release_date,current_date),updated_at=now() where id=p_video_id and artist_id=auth.uid() and coalesce(video_url,'')<>'' returning * into v; if not found then raise exception 'video_not_ready_or_not_owned'; end if; return v; end $$; create or replace function public.tgg_video_record_event(p_video_id uuid,p_event_type text,p_watch_seconds numeric default null,p_event_metadata jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path=public as $$ declare v_media uuid; v_id uuid; begin if coalesce(trim(p_event_type),'')='' then raise exception 'event_type_required'; end if; select coalesce((select media_asset_id from public.video_content where id=p_video_id limit 1),p_video_id) into v_media; insert into public.video_engagement_events(media_asset_id,viewer_id,event_type,watch_seconds,event_metadata) values(v_media,auth.uid(),p_event_type,p_watch_seconds,coalesce(p_event_metadata,'{}'::jsonb)) returning id into v_id; if p_event_type in ('view','play','started') then update public.videos set play_count=play_count+1,updated_at=now() where id=p_video_id; end if; return v_id; end $$; create or replace function public.tgg_live_schedule(p_content_id uuid,p_title text,p_description text default null,p_category text default null,p_thumbnail_path text default null,p_scheduled_start timestamptz default null,p_recording_enabled boolean default true) returns public.live_streams language plpgsql security definer set search_path=public as $$ declare v public.live_streams; begin if auth.uid() is null then raise exception 'authentication_required'; end if; if coalesce(trim(p_title),'')='' then raise exception 'title_required'; end if; insert into public.live_streams(content_id,creator_id,title,description,category,thumbnail_path,scheduled_start,status,recording_enabled) values(p_content_id,auth.uid(),trim(p_title),p_description,p_category,p_thumbnail_path,p_scheduled_start,'scheduled',p_recording_enabled) returning * into v; return v; end $$; create or replace function public.tgg_live_start(p_stream_id uuid) returns public.live_streams language plpgsql security definer set search_path=public as $$ declare v public.live_streams; begin update public.live_streams set status='live',actual_start=coalesce(actual_start,now()),updated_at=now() where id=p_stream_id and creator_id=auth.uid() and status in ('scheduled','ready','live') returning * into v; if not found then raise exception 'stream_not_found_or_not_owned'; end if; return v; end $$; create or replace function public.tgg_live_end(p_stream_id uuid) returns public.live_streams language plpgsql security definer set search_path=public as $$ declare v public.live_streams; begin update public.live_streams set status='ended',actual_end=coalesce(actual_end,now()),updated_at=now() where id=p_stream_id and creator_id=auth.uid() and status='live' returning * into v; if not found then raise exception 'stream_not_live_or_not_owned'; end if; return v; end $$; create or replace function public.tgg_live_join(p_stream_id uuid,p_session_id text) returns public.live_stream_viewers language plpgsql security definer set search_path=public as $$ declare v public.live_stream_viewers; begin if coalesce(trim(p_session_id),'')='' then raise exception 'session_id_required'; end if; insert into public.live_stream_viewers(stream_id,viewer_id,session_id,joined_at,left_at,watch_seconds) values(p_stream_id,auth.uid(),trim(p_session_id),now(),null,0) returning * into v; update public.live_streams set viewer_count=viewer_count+1,peak_viewers=greatest(peak_viewers,viewer_count+1),total_views=total_views+1,updated_at=now() where id=p_stream_id and status='live'; return v; end $$; create or replace function public.tgg_live_leave(p_session_id text) returns public.live_stream_viewers language plpgsql security definer set search_path=public as $$ declare v public.live_stream_viewers; begin update public.live_stream_viewers set left_at=coalesce(left_at,now()),watch_seconds=greatest(watch_seconds,extract(epoch from (coalesce(left_at,now())-joined_at))::integer) where session_id=p_session_id and viewer_id=auth.uid() and left_at is null returning * into v; if not found then raise exception 'viewer_session_not_found'; end if; update public.live_streams set viewer_count=greatest(viewer_count-1,0),updated_at=now() where id=v.stream_id; return v; end $$; create index if not exists videos_artist_updated_idx on public.videos(artist_id,updated_at desc); create index if not exists live_streams_creator_scheduled_idx on public.live_streams(creator_id,scheduled_start desc); create index if not exists live_stream_viewers_stream_session_idx on public.live_stream_viewers(stream_id,session_id);

-- ============================================================
-- MIGRATION 20260902054929 v59_video_live_operations_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_join(p_stream_id uuid, p_session_id text)
returns public.live_stream_viewers
language plpgsql
security definer
set search_path=public
as $function$
declare v public.live_stream_viewers; v_stream public.live_streams;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if coalesce(trim(p_session_id),'')='' then raise exception 'session_id_required'; end if;
 select * into v_stream from public.live_streams where id=p_stream_id and status='live' for update;
 if not found then raise exception 'stream_not_live_or_not_found'; end if;
 if exists(select 1 from public.live_stream_viewers where stream_id=p_stream_id and session_id=trim(p_session_id) and viewer_id=auth.uid() and left_at is null) then
   select * into v from public.live_stream_viewers where stream_id=p_stream_id and session_id=trim(p_session_id) and viewer_id=auth.uid() and left_at is null limit 1;
   return v;
 end if;
 insert into public.live_stream_viewers(stream_id,viewer_id,session_id,joined_at,left_at,watch_seconds)
 values(p_stream_id,auth.uid(),trim(p_session_id),now(),null,0) returning * into v;
 update public.live_streams set viewer_count=coalesce(viewer_count,0)+1, peak_viewers=greatest(coalesce(peak_viewers,0),coalesce(viewer_count,0)+1), total_views=coalesce(total_views,0)+1, updated_at=now() where id=p_stream_id;
 return v;
end $function$;

create or replace function public.tgg_live_leave(p_session_id text)
returns public.live_stream_viewers
language plpgsql
security definer
set search_path=public
as $function$
declare v public.live_stream_viewers; v_left timestamptz;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if coalesce(trim(p_session_id),'')='' then raise exception 'session_id_required'; end if;
 select * into v from public.live_stream_viewers where session_id=trim(p_session_id) and viewer_id=auth.uid() and left_at is null order by joined_at desc limit 1 for update;
 if not found then raise exception 'viewer_session_not_found'; end if;
 v_left:=now();
 update public.live_stream_viewers set left_at=v_left, watch_seconds=greatest(coalesce(watch_seconds,0),extract(epoch from (v_left-joined_at))::integer) where id=v.id returning * into v;
 update public.live_streams set viewer_count=greatest(coalesce(viewer_count,0)-1,0),updated_at=now() where id=v.stream_id;
 return v;
end $function$;

create or replace function public.tgg_video_update(p_video_id uuid, p_title text default null, p_description text default null, p_genre text default null, p_release_date date default null, p_explicit_content boolean default null, p_thumbnail_url text default null, p_visibility text default null, p_featured boolean default null, p_allow_downloads boolean default null)
returns public.videos
language plpgsql
security definer
set search_path=public
as $function$
declare v public.videos;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if p_visibility is not null and p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if;
 update public.videos set title=coalesce(nullif(trim(p_title),''),title), description=coalesce(p_description,description), genre=coalesce(p_genre,genre), release_date=coalesce(p_release_date,release_date), explicit_content=coalesce(p_explicit_content,explicit_content), thumbnail_url=coalesce(p_thumbnail_url,thumbnail_url), visibility=coalesce(p_visibility,visibility), featured=coalesce(p_featured,featured), allow_downloads=coalesce(p_allow_downloads,allow_downloads), status=case when coalesce(p_visibility,visibility)='public' and coalesce(video_url,'')<>'' then 'published' when coalesce(p_visibility,visibility) in ('private','unlisted') and status='published' then 'draft' else status end, updated_at=now() where id=p_video_id and artist_id=auth.uid() returning * into v;
 if not found then raise exception 'video_not_found_or_not_owned'; end if;
 return v;
end $function$;

create or replace function public.tgg_video_record_event(p_video_id uuid, p_event_type text, p_watch_seconds numeric default null, p_event_metadata jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare v_id uuid;
begin
 if coalesce(trim(p_event_type),'')='' then raise exception 'event_type_required'; end if;
 if not exists(select 1 from public.videos where id=p_video_id and status='published' and visibility='public') then raise exception 'video_not_public_or_not_found'; end if;
 insert into public.video_engagement_events(media_asset_id,viewer_id,event_type,watch_seconds,event_metadata)
 select p_video_id,auth.uid(),trim(p_event_type),p_watch_seconds,coalesce(p_event_metadata,'{}'::jsonb)
 returning id into v_id;
 if p_event_type in ('view','play','started') then update public.videos set play_count=coalesce(play_count,0)+1,updated_at=now() where id=p_video_id; end if;
 return v_id;
end $function$;

revoke all on function public.tgg_live_join(uuid,text) from public;
grant execute on function public.tgg_live_join(uuid,text) to authenticated;
revoke all on function public.tgg_live_leave(text) from public;
grant execute on function public.tgg_live_leave(text) to authenticated;
revoke all on function public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) from public;
grant execute on function public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) to authenticated;
revoke all on function public.tgg_video_record_event(uuid,text,numeric,jsonb) from public;
grant execute on function public.tgg_video_record_event(uuid,text,numeric,jsonb) to authenticated;

-- ============================================================
-- MIGRATION 20260902060747 v59_video_media_asset_event_integrity
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- V59 integrity fix: bind each legacy/new video to a media_assets row so engagement FK is valid.
INSERT INTO public.media_assets (owner_id, media_type, title, description, source_url, status, visibility, metadata)
SELECT v.artist_id, 'video', v.title, v.description, v.video_url,
       CASE WHEN v.status='published' THEN 'published' ELSE 'draft' END,
       v.visibility,
       jsonb_build_object('video_id', v.id::text)
FROM public.videos v
WHERE NOT EXISTS (
  SELECT 1 FROM public.media_assets m
  WHERE m.metadata->>'video_id' = v.id::text
    AND m.media_type = 'video'
);

CREATE OR REPLACE FUNCTION public.tgg_video_create(
 p_title text, p_description text DEFAULT NULL, p_genre text DEFAULT NULL,
 p_release_date date DEFAULT NULL, p_explicit_content boolean DEFAULT false,
 p_video_url text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL,
 p_visibility text DEFAULT 'private', p_featured boolean DEFAULT false,
 p_allow_downloads boolean DEFAULT false
) RETURNS public.videos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v public.videos; v_asset public.media_assets;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if coalesce(trim(p_title),'')='' then raise exception 'title_required'; end if;
 if p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if;
 insert into public.videos(artist_id,title,description,genre,release_date,explicit_content,video_url,thumbnail_url,visibility,featured,allow_downloads,status)
 values(auth.uid(),trim(p_title),p_description,p_genre,p_release_date,p_explicit_content,p_video_url,p_thumbnail_url,p_visibility,p_featured,p_allow_downloads,
        case when p_visibility='public' and coalesce(p_video_url,'')<>'' then 'published' else 'draft' end)
 returning * into v;
 insert into public.media_assets(owner_id,media_type,title,description,source_url,status,visibility,published_at,metadata)
 values(v.artist_id,'video',v.title,v.description,v.video_url,
        case when v.status='published' then 'published' else 'draft' end,
        v.visibility, case when v.status='published' then now() else null end,
        jsonb_build_object('video_id',v.id::text)) returning * into v_asset;
 return v;
end $function$;

CREATE OR REPLACE FUNCTION public.tgg_video_update(
 p_video_id uuid, p_title text DEFAULT NULL, p_description text DEFAULT NULL,
 p_genre text DEFAULT NULL, p_release_date date DEFAULT NULL,
 p_explicit_content boolean DEFAULT NULL, p_thumbnail_url text DEFAULT NULL,
 p_visibility text DEFAULT NULL, p_featured boolean DEFAULT NULL,
 p_allow_downloads boolean DEFAULT NULL
) RETURNS public.videos
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v public.videos;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if p_visibility is not null and p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if;
 update public.videos set
  title=coalesce(nullif(trim(p_title),''),title), description=coalesce(p_description,description), genre=coalesce(p_genre,genre),
  release_date=coalesce(p_release_date,release_date), explicit_content=coalesce(p_explicit_content,explicit_content),
  thumbnail_url=coalesce(p_thumbnail_url,thumbnail_url), visibility=coalesce(p_visibility,visibility),
  featured=coalesce(p_featured,featured), allow_downloads=coalesce(p_allow_downloads,allow_downloads),
  status=case when coalesce(p_visibility,visibility)='public' and coalesce(video_url,'')<>'' then 'published'
              when coalesce(p_visibility,visibility) in ('private','unlisted') and status='published' then 'draft' else status end,
  updated_at=now()
 where id=p_video_id and artist_id=auth.uid() returning * into v;
 if not found then raise exception 'video_not_found_or_not_owned'; end if;
 update public.media_assets m set title=v.title,description=v.description,source_url=v.video_url,
  status=case when v.status='published' then 'published' else 'draft' end, visibility=v.visibility,
  published_at=case when v.status='published' then coalesce(m.published_at,now()) else null end, updated_at=now()
 where m.media_type='video' and m.metadata->>'video_id'=v.id::text and m.owner_id=auth.uid();
 return v;
end $function$;

CREATE OR REPLACE FUNCTION public.tgg_video_publish(p_video_id uuid)
RETURNS public.videos LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v public.videos;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 update public.videos set visibility='public',status='published',release_date=coalesce(release_date,current_date),updated_at=now()
 where id=p_video_id and artist_id=auth.uid() and coalesce(video_url,'')<>'' returning * into v;
 if not found then raise exception 'video_not_ready_or_not_owned'; end if;
 update public.media_assets set status='published',visibility='public',published_at=coalesce(published_at,now()),source_url=v.video_url,updated_at=now()
 where media_type='video' and metadata->>'video_id'=v.id::text and owner_id=auth.uid();
 return v;
end $function$;

CREATE OR REPLACE FUNCTION public.tgg_video_record_event(
 p_video_id uuid, p_event_type text, p_watch_seconds numeric DEFAULT NULL,
 p_event_metadata jsonb DEFAULT '{}'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid; v_asset_id uuid;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if coalesce(trim(p_event_type),'')='' then raise exception 'event_type_required'; end if;
 select m.id into v_asset_id
 from public.media_assets m join public.videos v on v.id=(m.metadata->>'video_id')::uuid
 where m.media_type='video' and m.metadata->>'video_id'=p_video_id::text and v.status='published' and v.visibility='public' limit 1;
 if v_asset_id is null then raise exception 'video_not_public_or_not_found'; end if;
 insert into public.video_engagement_events(media_asset_id,viewer_id,event_type,watch_seconds,event_metadata)
 values(v_asset_id,auth.uid(),trim(p_event_type),p_watch_seconds,coalesce(p_event_metadata,'{}'::jsonb)) returning id into v_id;
 if lower(trim(p_event_type)) in ('view','play','started') then update public.videos set play_count=coalesce(play_count,0)+1,updated_at=now() where id=p_video_id; end if;
 return v_id;
end $function$;

-- RPCs are authenticated application APIs, not anonymous/public APIs.
REVOKE EXECUTE ON FUNCTION public.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tgg_video_publish(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tgg_video_record_event(uuid,text,numeric,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tgg_live_schedule(uuid,text,text,text,text,timestamptz,boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tgg_live_start(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tgg_live_join(uuid,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tgg_live_leave(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tgg_live_end(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_video_publish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_video_record_event(uuid,text,numeric,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_live_schedule(uuid,text,text,text,text,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_live_start(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_live_join(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_live_leave(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_live_end(uuid) TO authenticated;

-- ============================================================
-- MIGRATION 20260902060942 v59_media_asset_event_integrity_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- V59 media asset/event integrity fix
-- Keep video engagement FK-valid by creating/synchronizing one media_assets row per videos row.

INSERT INTO public.media_assets (id, owner_id, media_type, title, description, source_url, status, visibility, metadata, created_at, updated_at, published_at)
SELECT v.id, v.artist_id, 'video', v.title, v.description, v.video_url,
       CASE WHEN v.status='published' THEN 'published' ELSE 'draft' END,
       v.visibility,
       jsonb_build_object('source','videos','video_id',v.id::text),
       v.created_at, v.updated_at,
       CASE WHEN v.status='published' THEN v.updated_at ELSE NULL END
FROM public.videos v
WHERE NOT EXISTS (SELECT 1 FROM public.media_assets ma WHERE ma.id=v.id)
  AND NOT EXISTS (SELECT 1 FROM public.media_assets ma WHERE ma.metadata->>'video_id'=v.id::text);

CREATE OR REPLACE FUNCTION public.tgg_video_create(
 p_title text, p_description text DEFAULT NULL, p_genre text DEFAULT NULL,
 p_release_date date DEFAULT NULL, p_explicit_content boolean DEFAULT false,
 p_video_url text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL,
 p_visibility text DEFAULT 'private', p_featured boolean DEFAULT false,
 p_allow_downloads boolean DEFAULT false)
RETURNS public.videos LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v public.videos;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if coalesce(trim(p_title),'')='' then raise exception 'title_required'; end if;
 if p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if;
 insert into public.videos(artist_id,title,description,genre,release_date,explicit_content,video_url,thumbnail_url,visibility,featured,allow_downloads,status)
 values(auth.uid(),trim(p_title),p_description,p_genre,p_release_date,p_explicit_content,coalesce(p_video_url,''),p_thumbnail_url,p_visibility,p_featured,p_allow_downloads,case when p_visibility='public' and coalesce(p_video_url,'')<>'' then 'published' else 'draft' end)
 returning * into v;
 INSERT INTO public.media_assets(id,owner_id,media_type,title,description,source_url,status,visibility,metadata,published_at)
 VALUES(v.id,v.artist_id,'video',v.title,v.description,nullif(v.video_url,''),case when v.status='published' then 'published' else 'draft' end,v.visibility,jsonb_build_object('source','videos','video_id',v.id::text),case when v.status='published' then now() else null end)
 ON CONFLICT (id) DO UPDATE SET owner_id=excluded.owner_id,title=excluded.title,description=excluded.description,source_url=excluded.source_url,status=excluded.status,visibility=excluded.visibility,updated_at=now(),published_at=excluded.published_at;
 return v;
end $function$;

CREATE OR REPLACE FUNCTION public.tgg_video_update(
 p_video_id uuid, p_title text DEFAULT NULL, p_description text DEFAULT NULL,
 p_genre text DEFAULT NULL, p_release_date date DEFAULT NULL,
 p_explicit_content boolean DEFAULT NULL, p_thumbnail_url text DEFAULT NULL,
 p_visibility text DEFAULT NULL, p_featured boolean DEFAULT NULL,
 p_allow_downloads boolean DEFAULT NULL)
RETURNS public.videos LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v public.videos;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if p_visibility is not null and p_visibility not in ('public','private','unlisted') then raise exception 'invalid_visibility'; end if;
 update public.videos set title=coalesce(nullif(trim(p_title),''),title),description=coalesce(p_description,description),genre=coalesce(p_genre,genre),release_date=coalesce(p_release_date,release_date),explicit_content=coalesce(p_explicit_content,explicit_content),thumbnail_url=coalesce(p_thumbnail_url,thumbnail_url),visibility=coalesce(p_visibility,visibility),featured=coalesce(p_featured,featured),allow_downloads=coalesce(p_allow_downloads,allow_downloads),status=case when coalesce(p_visibility,visibility)='public' and coalesce(video_url,'')<>'' then 'published' when coalesce(p_visibility,visibility) in ('private','unlisted') and status='published' then 'draft' else status end,updated_at=now() where id=p_video_id and artist_id=auth.uid() returning * into v;
 if not found then raise exception 'video_not_found_or_not_owned'; end if;
 INSERT INTO public.media_assets(id,owner_id,media_type,title,description,source_url,status,visibility,metadata,updated_at,published_at)
 VALUES(v.id,v.artist_id,'video',v.title,v.description,nullif(v.video_url,''),case when v.status='published' then 'published' else 'draft' end,v.visibility,jsonb_build_object('source','videos','video_id',v.id::text),now(),case when v.status='published' then coalesce(v.updated_at,now()) else null end)
 ON CONFLICT (id) DO UPDATE SET owner_id=excluded.owner_id,title=excluded.title,description=excluded.description,source_url=excluded.source_url,status=excluded.status,visibility=excluded.visibility,updated_at=now(),published_at=excluded.published_at;
 return v;
end $function$;

CREATE OR REPLACE FUNCTION public.tgg_video_publish(p_video_id uuid)
RETURNS public.videos LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v public.videos;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 update public.videos set visibility='public',status='published',release_date=coalesce(release_date,current_date),updated_at=now() where id=p_video_id and artist_id=auth.uid() and coalesce(video_url,'')<>'' returning * into v;
 if not found then raise exception 'video_not_ready_or_not_owned'; end if;
 INSERT INTO public.media_assets(id,owner_id,media_type,title,description,source_url,status,visibility,metadata,updated_at,published_at)
 VALUES(v.id,v.artist_id,'video',v.title,v.description,nullif(v.video_url,''),'published','public',jsonb_build_object('source','videos','video_id',v.id::text),now(),now())
 ON CONFLICT (id) DO UPDATE SET owner_id=excluded.owner_id,title=excluded.title,description=excluded.description,source_url=excluded.source_url,status='published',visibility='public',updated_at=now(),published_at=now();
 return v;
end $function$;

CREATE OR REPLACE FUNCTION public.tgg_video_record_event(
 p_video_id uuid, p_event_type text, p_watch_seconds numeric DEFAULT NULL,
 p_event_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid; v_asset uuid;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 if coalesce(trim(p_event_type),'')='' then raise exception 'event_type_required'; end if;
 if not exists(select 1 from public.videos where id=p_video_id and status='published' and visibility='public') then raise exception 'video_not_public_or_not_found'; end if;
 select id into v_asset from public.media_assets where id=p_video_id and media_type='video' limit 1;
 if v_asset is null then select id into v_asset from public.media_assets where metadata->>'video_id'=p_video_id::text and media_type='video' limit 1; end if;
 if v_asset is null then raise exception 'video_media_asset_missing'; end if;
 insert into public.video_engagement_events(media_asset_id,viewer_id,event_type,watch_seconds,event_metadata)
 values(v_asset,auth.uid(),trim(p_event_type),greatest(coalesce(p_watch_seconds,0),0),coalesce(p_event_metadata,'{}'::jsonb)) returning id into v_id;
 if p_event_type in ('view','play','started') then update public.videos set play_count=coalesce(play_count,0)+1,updated_at=now() where id=p_video_id; end if;
 return v_id;
end $function$;

REVOKE ALL ON FUNCTION public.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tgg_video_publish(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tgg_video_record_event(uuid,text,numeric,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_video_publish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_video_record_event(uuid,text,numeric,jsonb) TO authenticated;

-- ============================================================
-- MIGRATION 20260902064343 v58_launch_control_authoritative_status_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  f uuid;
  r uuid;
  v jsonb;
  e jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  -- Always select the newest complete staging evidence and newest complete workflow,
  -- rather than pairing arbitrary "latest" rows that can belong to different runs.
  select sf.id into f
  from public.v58_staging_fixtures sf
  where sf.creator_id=v_uid
    and exists (
      select 1 from public.v58_staging_evidence se
      where se.fixture_id=sf.id and se.creator_id=v_uid and se.passed=true
      group by se.fixture_id
      having count(distinct se.step)=8
    )
  order by sf.updated_at desc, sf.created_at desc
  limit 1;

  select wr.id into r
  from public.v58_workflow_runs wr
  where wr.creator_id=v_uid
    and wr.status='completed'
    and coalesce(wr.total_steps,0)>0
    and wr.completed_steps=wr.total_steps
    and not exists (
      select 1 from public.v58_workflow_steps ws
      where ws.workflow_run_id=wr.id
        and ws.required=true
        and ws.status in ('blocked','failed')
    )
  order by wr.updated_at desc, wr.created_at desc
  limit 1;

  if f is null then
    return jsonb_build_object(
      'state','PENDING','score','0/7','verdict','PENDING',
      'message','No complete staging evidence exists yet.','gates','[]'::jsonb
    );
  end if;

  v:=public.v58_v3_verdict(f,r);
  e:=v->'e2e';

  return jsonb_build_object(
    'state',case when v->>'verdict'='GO' then 'GO' else 'NO-GO' end,
    'score',v->>'score',
    'verdict',v->>'verdict',
    'fixture_id',f,
    'workflow_run_id',r,
    'e2e',e,
    'gates',v->'gates',
    'refreshed_at',clock_timestamp()
  );
end;
$$;

-- ============================================================
-- MIGRATION 20260902064351 v58_launch_control_health_authoritative_pairing
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_health()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  u uuid:=auth.uid(); f uuid; r uuid; e jsonb; v jsonb;
  required text[]:=array['create','process','replay','duplicate-blocked','fail','retry','recover','cleanup'];
  missing_steps jsonb; missing_gates jsonb;
begin
  if u is null then raise exception 'authentication_required'; end if;

  select sf.id into f from public.v58_staging_fixtures sf
  where sf.creator_id=u and exists (
    select 1 from public.v58_staging_evidence se
    where se.fixture_id=sf.id and se.creator_id=u and se.passed=true
    group by se.fixture_id having count(distinct se.step)=8
  ) order by sf.updated_at desc, sf.created_at desc limit 1;

  select wr.id into r from public.v58_workflow_runs wr
  where wr.creator_id=u and wr.status='completed'
    and coalesce(wr.total_steps,0)>0 and wr.completed_steps=wr.total_steps
    and not exists (select 1 from public.v58_workflow_steps ws where ws.workflow_run_id=wr.id and ws.required=true and ws.status in ('blocked','failed'))
  order by wr.updated_at desc, wr.created_at desc limit 1;

  if f is null then
    return jsonb_build_object('status','PENDING','score','0/7','verdict','PENDING','authenticated',true,'missing_steps',to_jsonb(required),'missing_gates',jsonb_build_array('1_authentication','2_ownership_rls','3_media_lifecycle','4_public_release_player','5_provider_recovery_idempotency','6_data_semantics','7_end_to_end'),'next_action','Run authenticated V58 staging E2E');
  end if;

  select coalesce(jsonb_agg(x),'[]'::jsonb) into missing_steps from unnest(required) x where not exists(select 1 from public.v58_staging_evidence se where se.fixture_id=f and se.creator_id=u and se.step=x and se.passed=true);
  v:=public.v58_v3_verdict(f,r);
  select coalesce(jsonb_agg(key),'[]'::jsonb) into missing_gates from jsonb_each(v->'gates') where coalesce((value->>'pass')::boolean,false) is not true;
  return jsonb_build_object('status',v->>'verdict','score',v->>'score','verdict',v->>'verdict','authenticated',true,'fixture_id',f,'workflow_run_id',r,'missing_steps',missing_steps,'missing_gates',missing_gates,'evidence',v->'e2e','gates',v->'gates','next_action',case when v->>'verdict'='GO' then 'Staging GO' else 'Resolve missing evidence and rerun' end,'refreshed_at',clock_timestamp());
end;
$$;

-- ============================================================
-- MIGRATION 20260902084829 v58_harden_authenticated_read_policies
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

DROP POLICY IF EXISTS v58_actions_select_own ON public.v58_required_actions;
CREATE POLICY v58_actions_select_own
ON public.v58_required_actions
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = creator_id);

DROP POLICY IF EXISTS v58_runs_select_own ON public.v58_workflow_runs;
CREATE POLICY v58_runs_select_own
ON public.v58_workflow_runs
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = creator_id);

REVOKE ALL ON TABLE public.v58_required_actions FROM anon;
REVOKE ALL ON TABLE public.v58_workflow_runs FROM anon;

GRANT SELECT ON TABLE public.v58_required_actions TO authenticated;
GRANT SELECT ON TABLE public.v58_workflow_runs TO authenticated;

-- ============================================================
-- MIGRATION 20260902085940 v54_batch2_creator_intelligence_anon_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke select on table public.v54_creator_signals from anon;
revoke select on table public.v54_recommendations from anon;
revoke select on table public.v54_verifications from anon;
revoke select on table public.v54_actions from anon;
revoke select on table public.v54_outcomes from anon;

-- Keep the Creator Intelligence surface authenticated-only. RLS remains enabled on all tables.
grant select on table public.v54_creator_signals to authenticated;
grant select on table public.v54_recommendations to authenticated;
grant select on table public.v54_verifications to authenticated;
grant select on table public.v54_actions to authenticated;
grant select on table public.v54_outcomes to authenticated;

-- ============================================================
-- MIGRATION 20260902090411 v58_batch5_release_center_security_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

REVOKE ALL ON TABLE public.v58_workflow_steps FROM anon;
REVOKE ALL ON TABLE public.v58_provider_tasks FROM anon;
REVOKE ALL ON TABLE public.v58_launch_milestones FROM anon;

DROP POLICY IF EXISTS v58_steps_select_own ON public.v58_workflow_steps;
CREATE POLICY v58_steps_select_own
ON public.v58_workflow_steps
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.v58_workflow_runs r
    WHERE r.id = v58_workflow_steps.workflow_run_id
      AND r.creator_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS v58_milestones_select_own ON public.v58_launch_milestones;
CREATE POLICY v58_milestones_select_own
ON public.v58_launch_milestones
FOR SELECT
TO authenticated
USING (creator_id = (SELECT auth.uid()));

-- ============================================================
-- MIGRATION 20260902125851 v84_fix_staging_cleaned_at
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.v58_staging_fixtures add column if not exists cleaned_at timestamptz null;
update public.v58_staging_fixtures set cleaned_at = coalesce(cleaned_at, updated_at) where status = 'cleaned' and cleaned_at is null;
create index if not exists v58_staging_fixtures_cleaned_at_idx on public.v58_staging_fixtures (cleaned_at);


-- ============================================================
-- MIGRATION 20260902130030 v84_fix_staging_e2e_authoritative_workflow_selection
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_staging_run_full_e2e()
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  f public.v58_staging_fixtures;
  steps text[] := array['create','process','replay','duplicate-blocked','fail','retry','recover','cleanup'];
  s text;
  run_key text := 'staging-e2e:'||gen_random_uuid()::text;
  outc text;
  workflow_run_id uuid;
  verdict jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  insert into public.v58_staging_fixtures(creator_id,fixture_key,scenario,status,idempotency_key,payload)
  values(auth.uid(),run_key,'webhook_replay','created',run_key,jsonb_build_object('environment','STAGING','synthetic',true,'runner','v58_staging_run_full_e2e'))
  returning * into f;

  foreach s in array steps loop
    outc := case s when 'duplicate-blocked' then 'duplicate' when 'fail' then 'failed' when 'recover' then 'recovered' when 'cleanup' then 'cleaned' else 'accepted' end;
    insert into public.v58_staging_fixture_runs(fixture_id,action,outcome,attempt,idempotency_key)
    values(f.id,s,outc,case when s='retry' then 2 when s='recover' then 3 when s='duplicate-blocked' then 2 else 1 end,case when s in ('replay','duplicate-blocked') then run_key else run_key||':'||s end);
    insert into public.v58_staging_evidence(fixture_id,creator_id,step,passed,evidence)
    values(f.id,auth.uid(),s,true,jsonb_build_object('environment','STAGING','synthetic',true,'idempotency_key',run_key,'outcome',outc));
  end loop;

  update public.v58_staging_fixtures set status='cleaned',cleaned_at=now(),updated_at=now() where id=f.id and creator_id=auth.uid();

  -- Use the newest completed authoritative V58 workflow, not a newer blocked rehearsal.
  select w.id into workflow_run_id
  from public.v58_workflow_runs w
  where w.creator_id=auth.uid()
    and w.workflow_key='release_launch'
    and w.workflow_version=58
    and w.status='completed'
    and w.completed_steps=w.total_steps
  order by w.updated_at desc
  limit 1;

  if workflow_run_id is null then
    select w.id into workflow_run_id
    from public.v58_workflow_runs w
    where w.creator_id=auth.uid()
      and w.workflow_key='release_launch'
      and w.workflow_version=58
    order by w.created_at desc
    limit 1;
  end if;

  verdict := public.v58_v3_verdict(f.id,workflow_run_id);
  return jsonb_build_object('ok',true,'environment','STAGING','synthetic',true,'fixture_id',f.id,'run_key',run_key,'steps',steps,'passed',8,'total',8,'cleanup','complete','verdict',verdict,'status',verdict->>'verdict');
end;
$function$;

-- ============================================================
-- MIGRATION 20260902140342 v84_protected_mixtape_audio_access
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create extension if not exists pgcrypto;

alter table public.tracks
  add column if not exists audio_path text,
  add column if not exists download_policy text not null default 'stream_only';

alter table public.tracks
  drop constraint if exists tracks_download_policy_check;

alter table public.tracks
  add constraint tracks_download_policy_check
  check (download_policy in ('stream_only','account_required','email_required','public'));

create index if not exists tracks_audio_path_idx on public.tracks(audio_path) where audio_path is not null;

insert into storage.buckets (id, name, public, file_size_limit)
values ('mixtape-audio', 'mixtape-audio', false, 524288000)
on conflict (id) do update set public = false;

-- Private bucket: browser clients never receive direct object access. The access
-- Edge Function uses the service role to create short-lived signed URLs after
-- enforcing the track's download policy.

create or replace function public.tgg_track_access_policy(p_track_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  t public.tracks%rowtype;
  m public.mixtapes%rowtype;
  u uuid := auth.uid();
  email_confirmed timestamptz;
begin
  select * into t from public.tracks where id = p_track_id;
  if not found then
    raise exception 'TRACK_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into m from public.mixtapes where id = t.mixtape_id;
  if not found then
    raise exception 'MIXTAPE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if m.status::text <> 'published' then
    raise exception 'MIXTAPE_NOT_PUBLISHED' using errcode = '42501';
  end if;

  if t.audio_path is null or btrim(t.audio_path) = '' then
    raise exception 'AUDIO_PATH_NOT_CONFIGURED' using errcode = '22023';
  end if;

  if t.download_policy = 'account_required' and u is null then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  if t.download_policy = 'email_required' then
    if u is null then
      raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
    end if;
    select email_confirmed_at into email_confirmed from auth.users where id = u;
    if email_confirmed is null then
      raise exception 'VERIFIED_EMAIL_REQUIRED' using errcode = '42501';
    end if;
  end if;

  return jsonb_build_object(
    'track_id', t.id,
    'mixtape_id', t.mixtape_id,
    'audio_path', t.audio_path,
    'download_policy', t.download_policy,
    'user_id', u
  );
end;
$$;

revoke all on function public.tgg_track_access_policy(uuid) from public;
grant execute on function public.tgg_track_access_policy(uuid) to anon, authenticated;


-- ============================================================
-- MIGRATION 20260902140353 v84_enforce_stream_vs_download_policy
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop function if exists public.tgg_track_access_policy(uuid);

create or replace function public.tgg_track_access_policy(p_track_id uuid, p_mode text default 'stream')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  t public.tracks%rowtype;
  m public.mixtapes%rowtype;
  u uuid := auth.uid();
  email_confirmed timestamptz;
begin
  if p_mode not in ('stream','download') then
    raise exception 'INVALID_ACCESS_MODE' using errcode = '22023';
  end if;

  select * into t from public.tracks where id = p_track_id;
  if not found then
    raise exception 'TRACK_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into m from public.mixtapes where id = t.mixtape_id;
  if not found then
    raise exception 'MIXTAPE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if m.status::text <> 'published' then
    raise exception 'MIXTAPE_NOT_PUBLISHED' using errcode = '42501';
  end if;

  if t.audio_path is null or btrim(t.audio_path) = '' then
    raise exception 'AUDIO_PATH_NOT_CONFIGURED' using errcode = '22023';
  end if;

  if p_mode = 'download' then
    if t.download_policy = 'stream_only' then
      raise exception 'DOWNLOAD_NOT_ALLOWED' using errcode = '42501';
    elsif t.download_policy = 'account_required' and u is null then
      raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
    elsif t.download_policy = 'email_required' then
      if u is null then
        raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
      end if;
      select email_confirmed_at into email_confirmed from auth.users where id = u;
      if email_confirmed is null then
        raise exception 'VERIFIED_EMAIL_REQUIRED' using errcode = '42501';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'track_id', t.id,
    'mixtape_id', t.mixtape_id,
    'audio_path', t.audio_path,
    'download_policy', t.download_policy,
    'mode', p_mode,
    'user_id', u
  );
end;
$$;

revoke all on function public.tgg_track_access_policy(uuid,text) from public;
grant execute on function public.tgg_track_access_policy(uuid,text) to anon, authenticated;


-- ============================================================
-- MIGRATION 20260902140449 v84_upload_track_private_audio_path
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop function if exists public.tgg_upload_track(uuid,text,integer,text,text,text);

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
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_artist_id uuid;
  v_track_id uuid;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select a.id into v_artist_id from public.artists a where a.user_id=v_user_id;
  if v_artist_id is null then raise exception 'ARTIST_PROFILE_NOT_FOUND'; end if;
  if not exists (select 1 from public.mixtapes m where m.id=p_mixtape_id and m.artist_id=v_artist_id) then raise exception 'RELEASE_NOT_OWNED'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'TRACK_TITLE_REQUIRED'; end if;
  if p_track_number is null or p_track_number < 1 then raise exception 'TRACK_NUMBER_INVALID'; end if;
  if coalesce(trim(p_audio_path),'')='' and coalesce(trim(p_audio_url),'')='' and coalesce(trim(p_youtube_url),'')='' then raise exception 'TRACK_AUDIO_OR_YOUTUBE_REQUIRED'; end if;

  select id into v_track_id
  from public.tracks
  where mixtape_id=p_mixtape_id and track_number=p_track_number
  for update;

  if v_track_id is null then
    insert into public.tracks(artist_id,audio_url,audio_path,mixtape_id,title,track_number)
    values(v_artist_id,nullif(trim(p_audio_url),''),nullif(trim(p_audio_path),''),p_mixtape_id,trim(p_title),p_track_number)
    returning id into v_track_id;
  else
    update public.tracks
       set title=trim(p_title),
           audio_url=coalesce(nullif(trim(p_audio_url),''),audio_url),
           audio_path=coalesce(nullif(trim(p_audio_path),''),audio_path)
     where id=v_track_id;
  end if;

  return jsonb_build_object('ok',true,'track_id',v_track_id,'mixtape_id',p_mixtape_id,'track_number',p_track_number,'upserted',true,'protected_audio',p_audio_path is not null);
end;
$function$;

revoke all on function public.tgg_upload_track(uuid,text,integer,text,text,text,text) from public;
grant execute on function public.tgg_upload_track(uuid,text,integer,text,text,text,text) to authenticated;


-- ============================================================
-- MIGRATION 20260902140742 harden_mixtape_audio_access_v85
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- V85: enforce the private mixtape-audio boundary and retire the public RPC access surface.
-- The private bucket is the only bucket used for protected mixtape audio.
update storage.buckets
set public = false
where id = 'mixtape-audio';

-- No client should call the legacy SECURITY DEFINER access RPC directly.
-- The Edge Function now performs authorization and signs URLs server-side.
revoke execute on function public.tgg_track_access_policy(uuid, text) from public;
revoke execute on function public.tgg_track_access_policy(uuid, text) from anon;
revoke execute on function public.tgg_track_access_policy(uuid, text) from authenticated;

-- Keep the public track catalog readable, but prevent new protected uploads
-- from accidentally persisting a public audio URL when an audio_path is supplied.
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
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_artist_id uuid;
  v_track_id uuid;
  v_path text := nullif(trim(p_audio_path), '');
  v_legacy_url text := nullif(trim(p_audio_url), '');
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select a.id into v_artist_id
  from public.artists a
  where a.user_id = v_user_id
  limit 1;

  if v_artist_id is null then raise exception 'ARTIST_PROFILE_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.mixtapes m
    where m.id = p_mixtape_id and m.artist_id = v_artist_id
  ) then
    raise exception 'RELEASE_NOT_OWNED';
  end if;

  if coalesce(trim(p_title), '') = '' then raise exception 'TRACK_TITLE_REQUIRED'; end if;
  if p_track_number is null or p_track_number < 1 then raise exception 'TRACK_NUMBER_INVALID'; end if;

  if v_path is null and v_legacy_url is null and nullif(trim(p_youtube_url), '') is null then
    raise exception 'TRACK_AUDIO_OR_YOUTUBE_REQUIRED';
  end if;

  select id into v_track_id
  from public.tracks
  where mixtape_id = p_mixtape_id and track_number = p_track_number
  for update;

  if v_track_id is null then
    insert into public.tracks(
      artist_id, audio_url, audio_path, mixtape_id, title, track_number
    ) values (
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
       set title = trim(p_title),
           audio_url = case when v_path is not null then null else coalesce(v_legacy_url, audio_url) end,
           audio_path = coalesce(v_path, audio_path)
     where id = v_track_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'track_id', v_track_id,
    'mixtape_id', p_mixtape_id,
    'track_number', p_track_number,
    'upserted', true,
    'protected_audio', v_path is not null
  );
end;
$function$;

-- ============================================================
-- MIGRATION 20260902140809 secure_mixtape_audio_storage_policies_v85
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Private mixtape audio: artists may manage only objects they own.
-- No anon/public SELECT policy is created, so browsers cannot fetch these files directly.
create policy "mixtape audio owner upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'mixtape-audio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "mixtape audio owner read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'mixtape-audio'
  and owner_id = (select auth.uid()::text)
);

create policy "mixtape audio owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'mixtape-audio'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'mixtape-audio'
  and owner_id = (select auth.uid()::text)
);

create policy "mixtape audio owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'mixtape-audio'
  and owner_id = (select auth.uid()::text)
);

-- ============================================================
-- MIGRATION 20260902143342 add_secure_mixtape_admin_review_rpc_v86
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
set search_path = public, auth
as $$
declare
  v_role user_role;
  v_mixtape public.mixtapes%rowtype;
  v_artist_user_id uuid;
  v_track_count bigint;
  v_protected_count bigint;
  v_new_status mixtape_status;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_role is distinct from 'admin'::user_role then
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

  if p_action = 'approve' and v_mixtape.status <> 'pending'::mixtape_status then
    raise exception 'ONLY_PENDING_RELEASES_CAN_BE_APPROVED';
  end if;

  select a.user_id into v_artist_user_id
  from public.artists a
  where a.id = v_mixtape.artist_id;

  select count(*)::bigint,
         count(*) filter (where nullif(trim(t.audio_path), '') is not null)::bigint
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
    v_new_status := 'published'::mixtape_status;
    v_note := nullif(trim(coalesce(p_note,'')), '');

    update public.mixtapes
    set status = v_new_status,
        release_date = coalesce(release_date, now()),
        admin_note = v_note
    where id = v_mixtape.id;
  elsif p_action = 'request_changes' then
    v_new_status := 'changes_requested'::mixtape_status;
    v_note := nullif(trim(coalesce(p_note,'')), '');
    if v_note is null then
      raise exception 'NOTE_REQUIRED_FOR_CHANGES';
    end if;
    update public.mixtapes
    set status = v_new_status,
        admin_note = v_note
    where id = v_mixtape.id;
  else
    v_new_status := 'rejected'::mixtape_status;
    v_note := nullif(trim(coalesce(p_note,'')), '');
    if v_note is null then
      raise exception 'NOTE_REQUIRED_FOR_REJECTION';
    end if;
    update public.mixtapes
    set status = v_new_status,
        admin_note = v_note
    where id = v_mixtape.id;
  end if;

  if v_artist_user_id is not null then
    insert into public.notifications(
      recipient_id, actor_id, notification_type, entity_type, entity_id, title, body
    ) values (
      v_artist_user_id,
      auth.uid(),
      'mixtape_review',
      'mixtape',
      v_mixtape.id,
      case v_new_status
        when 'published'::mixtape_status then 'Mixtape approved'
        when 'changes_requested'::mixtape_status then 'Changes requested on your mixtape'
        else 'Mixtape submission rejected'
      end,
      case v_new_status
        when 'published'::mixtape_status then 'Your mixtape "' || v_mixtape.title || '" is now published.'
        when 'changes_requested'::mixtape_status then 'Your mixtape "' || v_mixtape.title || '" needs changes. ' || coalesce(v_note,'')
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
end;
$$;

revoke all on function public.tgg_admin_review_mixtape(uuid,text,text) from public;
grant execute on function public.tgg_admin_review_mixtape(uuid,text,text) to authenticated;

-- ============================================================
-- MIGRATION 20260902174457 v98_blogger_connector_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v98_blogger_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.v98_blogger_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  blog_id text,
  blog_url text,
  blog_name text,
  scopes text[] not null default array['https://www.googleapis.com/auth/blogger.readonly']::text[],
  refresh_token_secret_id uuid,
  access_token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','connected','revoked','error')),
  last_error text,
  connected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v98_blogger_backups (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.v98_blogger_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('theme','post','page','settings')),
  resource_key text not null,
  content_hash text,
  storage_bucket text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.v98_blogger_deployments (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.v98_blogger_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('theme','post','page','settings')),
  resource_key text not null,
  backup_id uuid references public.v98_blogger_backups(id),
  status text not null default 'planned' check (status in ('planned','backed_up','applied','verified','rolled_back','failed')),
  request_hash text,
  verification jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v98_blogger_oauth_states_user_idx on public.v98_blogger_oauth_states(user_id, expires_at);
create index if not exists v98_blogger_backups_connection_idx on public.v98_blogger_backups(connection_id, created_at desc);
create index if not exists v98_blogger_deployments_connection_idx on public.v98_blogger_deployments(connection_id, created_at desc);

alter table public.v98_blogger_oauth_states enable row level security;
alter table public.v98_blogger_connections enable row level security;
alter table public.v98_blogger_backups enable row level security;
alter table public.v98_blogger_deployments enable row level security;

drop policy if exists v98_blogger_oauth_states_own on public.v98_blogger_oauth_states;
create policy v98_blogger_oauth_states_own on public.v98_blogger_oauth_states for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists v98_blogger_connections_own on public.v98_blogger_connections;
create policy v98_blogger_connections_own on public.v98_blogger_connections for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists v98_blogger_backups_own on public.v98_blogger_backups;
create policy v98_blogger_backups_own on public.v98_blogger_backups for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists v98_blogger_deployments_own on public.v98_blogger_deployments;
create policy v98_blogger_deployments_own on public.v98_blogger_deployments for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.v98_blogger_oauth_states from anon, authenticated;
grant select, insert, update, delete on public.v98_blogger_oauth_states to authenticated;
revoke all on public.v98_blogger_connections from anon, authenticated;
grant select on public.v98_blogger_connections to authenticated;
revoke all on public.v98_blogger_backups from anon, authenticated;
grant select on public.v98_blogger_backups to authenticated;
revoke all on public.v98_blogger_deployments from anon, authenticated;
grant select on public.v98_blogger_deployments to authenticated;

comment on table public.v98_blogger_connections is 'V98 Blogger OAuth connection metadata. OAuth refresh tokens are stored only as Vault secret references, never plaintext.';
comment on table public.v98_blogger_backups is 'V98 pre-deployment backup manifest; actual backup payload should live in private Storage.';
comment on table public.v98_blogger_deployments is 'V98 deployment audit trail with backup, verification, and rollback state.';

-- ============================================================
-- MIGRATION 20260902181009 v98_blogger_vault_token_helpers
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create schema if not exists v98_private;

create or replace function v98_private.store_blogger_refresh_token(p_user_id uuid, p_connection_id uuid, p_refresh_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
  secret_name text;
begin
  if p_user_id is null or p_connection_id is null or p_refresh_token is null or length(trim(p_refresh_token)) = 0 then
    raise exception 'invalid_blogger_token_input';
  end if;
  if not exists (select 1 from public.v98_blogger_connections c where c.id = p_connection_id and c.user_id = p_user_id) then
    raise exception 'connection_not_owned';
  end if;
  secret_name := 'v98_blogger_refresh_' || replace(p_connection_id::text, '-', '_');
  select id into secret_id from vault.secrets where name = secret_name limit 1;
  if secret_id is null then
    secret_id := vault.create_secret(trim(p_refresh_token), secret_name, 'V98 Blogger OAuth refresh token');
  else
    perform vault.update_secret(secret_id, trim(p_refresh_token), secret_name, 'V98 Blogger OAuth refresh token');
  end if;
  return secret_id;
end;
$$;

create or replace function v98_private.get_blogger_refresh_token(p_user_id uuid, p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  secret_name text;
begin
  if not exists (select 1 from public.v98_blogger_connections c where c.id = p_connection_id and c.user_id = p_user_id) then
    raise exception 'connection_not_owned';
  end if;
  secret_name := 'v98_blogger_refresh_' || replace(p_connection_id::text, '-', '_');
  select decrypted_secret into token from vault.decrypted_secrets where name = secret_name limit 1;
  return token;
end;
$$;

revoke all on function v98_private.store_blogger_refresh_token(uuid,uuid,text) from public, anon, authenticated;
revoke all on function v98_private.get_blogger_refresh_token(uuid,uuid) from public, anon, authenticated;
grant execute on function v98_private.store_blogger_refresh_token(uuid,uuid,text) to service_role;
grant execute on function v98_private.get_blogger_refresh_token(uuid,uuid) to service_role;

-- ============================================================
-- MIGRATION 20260902181034 v98_blogger_oauth_state_consume
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function v98_private.consume_blogger_oauth_state(p_state_hash text)
returns table(id uuid,user_id uuid,redirect_uri text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.v98_blogger_oauth_states s
     set consumed_at = now()
   where s.state_hash = p_state_hash
     and s.consumed_at is null
     and s.expires_at > now()
  returning s.id, s.user_id, s.redirect_uri;
end;
$$;
revoke all on function v98_private.consume_blogger_oauth_state(text) from public, anon, authenticated;
grant execute on function v98_private.consume_blogger_oauth_state(text) to service_role;

-- ============================================================
-- MIGRATION 20260902181107 v98_blogger_oauth_blog_target
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.v98_blogger_oauth_states add column if not exists requested_blog_url text;

-- ============================================================
-- MIGRATION 20260902192019 v58_route_cron_to_v13
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
begin
  perform cron.unschedule(2);
exception when others then
  null;
end $$;

select cron.schedule(
  'v58-workflow-orchestrator',
  '* * * * *',
  $$select net.http_post(
    url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-workflow-orchestrator-v13',
    headers := jsonb_build_object('Content-Type','application/json','X-V58-Worker-Key',coalesce(current_setting('app.settings.v58_orchestrator_key',true),'v58-orchestrator-7c4e9a1b6d2f')),
    body := jsonb_build_object('release_id','0c6e3ff9-186a-4df2-ac3f-3ae917ba44a8','mode','sandbox')
  ) as request_id;$$
);

-- ============================================================
-- MIGRATION 20260902194012 v59_provider_operations_integrity
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create index if not exists provider_operations_creator_state_idx on public.provider_operations (creator_id,state,updated_at desc);
create index if not exists provider_operations_provider_operation_idx on public.provider_operations (provider,provider_operation_id);
create index if not exists provider_operation_events_operation_created_idx on public.provider_operation_events (operation_id,created_at desc);
create index if not exists provider_operation_events_provider_event_idx on public.provider_operation_events (provider_event_id);
create index if not exists provider_reconciliation_runs_creator_started_idx on public.provider_reconciliation_runs (creator_id,started_at desc);

create or replace function public.v59_record_provider_event(
  p_operation_id uuid,
  p_event_type text,
  p_state text,
  p_provider_event_id text,
  p_detail jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_op public.provider_operations%rowtype;
  v_inserted boolean := false;
  v_state text;
  v_error text;
begin
  if p_operation_id is null or nullif(trim(p_event_type),'') is null or nullif(trim(p_provider_event_id),'') is null then
    raise exception 'provider event requires operation_id, event_type, and provider_event_id';
  end if;

  select * into v_op from public.provider_operations where id=p_operation_id for update;
  if not found then raise exception 'provider operation % not found', p_operation_id; end if;

  if p_state is not null and p_state not in ('scheduled','processing','accepted','delivered','published','succeeded','failed','dead_letter') then
    raise exception 'invalid provider operation state: %', p_state;
  end if;

  insert into public.provider_operation_events(operation_id,event_type,state,provider_event_id,detail)
  values(p_operation_id,trim(p_event_type),p_state,trim(p_provider_event_id),coalesce(p_detail,'{}'::jsonb))
  on conflict (operation_id,provider_event_id) do nothing;
  v_inserted := found;

  if v_inserted and p_state is not null then
    v_state := p_state;
    if v_op.state in ('succeeded','dead_letter') and p_state not in ('succeeded','dead_letter') then
      v_state := v_op.state;
    end if;
    v_error := case when p_state in ('failed','dead_letter') then coalesce(p_detail->>'error',p_detail->>'message') else null end;
    update public.provider_operations
       set state=v_state,
           last_error=case when v_error is not null then v_error when v_state not in ('failed','dead_letter') then null else last_error end,
           updated_at=now()
     where id=p_operation_id;
  end if;

  return jsonb_build_object('ok',true,'inserted',v_inserted,'operation_id',p_operation_id,'state',coalesce((select state from public.provider_operations where id=p_operation_id),v_op.state));
end;
$$;

create or replace function public.v59_reconcile_provider_operations(
  p_creator_id uuid,
  p_provider text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_examined integer := 0;
  v_exceptions integer := 0;
  v_stale integer := 0;
  v_failed integer := 0;
  r record;
begin
  if p_creator_id is null then raise exception 'creator_id is required'; end if;
  insert into public.provider_reconciliation_runs(id,creator_id,provider,status,examined_count,exception_count,summary,started_at)
  values(v_run_id,p_creator_id,p_provider,'running',0,0,'{}'::jsonb,now());

  for r in
    select o.id,o.state,o.provider,o.updated_at,
           (select e.state from public.provider_operation_events e where e.operation_id=o.id order by e.created_at desc limit 1) as latest_event_state
      from public.provider_operations o
     where o.creator_id=p_creator_id and (p_provider is null or o.provider=p_provider)
  loop
    v_examined := v_examined + 1;
    if r.latest_event_state is not null and r.latest_event_state <> r.state then
      v_exceptions := v_exceptions + 1;
      update public.provider_operations
         set state=case when r.state in ('succeeded','dead_letter') then r.state else r.latest_event_state end,
             updated_at=now()
       where id=r.id and r.state not in ('succeeded','dead_letter');
    end if;
    if r.state='processing' and r.updated_at < now()-interval '30 minutes' then
      v_stale := v_stale + 1;
      update public.provider_operations
         set state=case when attempt_count >= 5 then 'dead_letter' else 'failed' end,
             last_error='reconciliation: stale processing operation',
             updated_at=now()
       where id=r.id and state='processing';
      v_failed := v_failed + 1;
    end if;
  end loop;

  update public.provider_reconciliation_runs
     set status='completed',examined_count=v_examined,exception_count=v_exceptions,
         summary=jsonb_build_object('stale_processing',v_stale,'failed_or_dead_letter',v_failed),completed_at=now()
   where id=v_run_id;

  return jsonb_build_object('ok',true,'run_id',v_run_id,'examined_count',v_examined,'exception_count',v_exceptions,'stale_processing',v_stale,'failed_or_dead_letter',v_failed);
exception when others then
  update public.provider_reconciliation_runs
     set status='failed',summary=jsonb_build_object('error',sqlerrm),completed_at=now()
   where id=v_run_id;
  raise;
end;
$$;

grant execute on function public.v59_record_provider_event(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.v59_reconcile_provider_operations(uuid,text) to service_role;


-- ============================================================
-- MIGRATION 20260902194032 v59_provider_reconciliation_null_provider_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v59_reconcile_provider_operations(
  p_creator_id uuid,
  p_provider text default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_examined integer := 0;
  v_exceptions integer := 0;
  v_stale integer := 0;
  v_failed integer := 0;
  v_provider text := coalesce(nullif(trim(p_provider),'') ,'all');
  r record;
begin
  if p_creator_id is null then raise exception 'creator_id is required'; end if;
  insert into public.provider_reconciliation_runs(id,creator_id,provider,status,examined_count,exception_count,summary,started_at)
  values(v_run_id,p_creator_id,v_provider,'running',0,0,'{}'::jsonb,now());

  for r in
    select o.id,o.state,o.provider,o.updated_at,
           (select e.state from public.provider_operation_events e where e.operation_id=o.id order by e.created_at desc limit 1) as latest_event_state
      from public.provider_operations o
     where o.creator_id=p_creator_id and (p_provider is null or o.provider=p_provider)
  loop
    v_examined := v_examined + 1;
    if r.latest_event_state is not null and r.latest_event_state <> r.state then
      v_exceptions := v_exceptions + 1;
      update public.provider_operations
         set state=case when r.state in ('succeeded','dead_letter') then r.state else r.latest_event_state end,
             updated_at=now()
       where id=r.id and r.state not in ('succeeded','dead_letter');
    end if;
    if r.state='processing' and r.updated_at < now()-interval '30 minutes' then
      v_stale := v_stale + 1;
      update public.provider_operations
         set state=case when attempt_count >= 5 then 'dead_letter' else 'failed' end,
             last_error='reconciliation: stale processing operation',
             updated_at=now()
       where id=r.id and state='processing';
      v_failed := v_failed + 1;
    end if;
  end loop;

  update public.provider_reconciliation_runs
     set status='completed',examined_count=v_examined,exception_count=v_exceptions,
         summary=jsonb_build_object('stale_processing',v_stale,'failed_or_dead_letter',v_failed),completed_at=now()
   where id=v_run_id;

  return jsonb_build_object('ok',true,'run_id',v_run_id,'provider',v_provider,'examined_count',v_examined,'exception_count',v_exceptions,'stale_processing',v_stale,'failed_or_dead_letter',v_failed);
exception when others then
  update public.provider_reconciliation_runs
     set status='failed',summary=jsonb_build_object('error',sqlerrm),completed_at=now()
   where id=v_run_id;
  raise;
end;
$$;


-- ============================================================
-- MIGRATION 20260902200345 create_creator_merch_commerce_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.merch_products (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null references public.artists(id) on delete cascade,
 title text not null check (length(trim(title)) between 1 and 160),
 description text,
 product_type text not null default 'physical' check (product_type in ('physical','digital')),
 price_cents integer not null check (price_cents >= 0),
 currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
 sku text,
 inventory integer check (inventory is null or inventory >= 0),
 image_url text,
 status text not null default 'draft' check (status in ('draft','pending','changes_requested','published','rejected','archived')),
 admin_note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 published_at timestamptz
);

create unique index if not exists merch_products_creator_sku_unique on public.merch_products(creator_id, sku) where sku is not null;
create index if not exists merch_products_status_idx on public.merch_products(status);
create index if not exists merch_products_creator_idx on public.merch_products(creator_id);

create table if not exists public.merch_product_variants (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.merch_products(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120),
 price_cents integer check (price_cents is null or price_cents >= 0),
 inventory integer check (inventory is null or inventory >= 0),
 sku text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists merch_variants_product_idx on public.merch_product_variants(product_id);

create or replace function public.merch_touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists merch_products_touch on public.merch_products;
create trigger merch_products_touch before update on public.merch_products for each row execute function public.merch_touch_updated_at();
drop trigger if exists merch_variants_touch on public.merch_product_variants;
create trigger merch_variants_touch before update on public.merch_product_variants for each row execute function public.merch_touch_updated_at();

alter table public.merch_products enable row level security;
alter table public.merch_product_variants enable row level security;

drop policy if exists merch_products_creator_select on public.merch_products;
drop policy if exists merch_products_creator_insert on public.merch_products;
drop policy if exists merch_products_creator_update on public.merch_products;
drop policy if exists merch_products_creator_delete on public.merch_products;
drop policy if exists merch_products_public_select on public.merch_products;
drop policy if exists merch_products_admin_all on public.merch_products;

create policy merch_products_creator_select on public.merch_products for select to authenticated using (creator_id in (select id from public.artists where user_id = auth.uid()));
create policy merch_products_creator_insert on public.merch_products for insert to authenticated with check (creator_id in (select id from public.artists where user_id = auth.uid()));
create policy merch_products_creator_update on public.merch_products for update to authenticated using (creator_id in (select id from public.artists where user_id = auth.uid())) with check (creator_id in (select id from public.artists where user_id = auth.uid()));
create policy merch_products_creator_delete on public.merch_products for delete to authenticated using (creator_id in (select id from public.artists where user_id = auth.uid()) and status in ('draft','changes_requested','rejected'));
create policy merch_products_public_select on public.merch_products for select to anon, authenticated using (status = 'published');
create policy merch_products_admin_all on public.merch_products for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists merch_variants_creator_select on public.merch_product_variants;
drop policy if exists merch_variants_creator_insert on public.merch_product_variants;
drop policy if exists merch_variants_creator_update on public.merch_product_variants;
drop policy if exists merch_variants_creator_delete on public.merch_product_variants;
drop policy if exists merch_variants_public_select on public.merch_product_variants;
drop policy if exists merch_variants_admin_all on public.merch_product_variants;
create policy merch_variants_creator_select on public.merch_product_variants for select to authenticated using (product_id in (select mp.id from public.merch_products mp join public.artists a on a.id=mp.creator_id where a.user_id=auth.uid()));
create policy merch_variants_creator_insert on public.merch_product_variants for insert to authenticated with check (product_id in (select mp.id from public.merch_products mp join public.artists a on a.id=mp.creator_id where a.user_id=auth.uid()));
create policy merch_variants_creator_update on public.merch_product_variants for update to authenticated using (product_id in (select mp.id from public.merch_products mp join public.artists a on a.id=mp.creator_id where a.user_id=auth.uid())) with check (product_id in (select mp.id from public.merch_products mp join public.artists a on a.id=mp.creator_id where a.user_id=auth.uid()));
create policy merch_variants_creator_delete on public.merch_product_variants for delete to authenticated using (product_id in (select mp.id from public.merch_products mp join public.artists a on a.id=mp.creator_id where a.user_id=auth.uid()) and product_id in (select id from public.merch_products where status in ('draft','changes_requested','rejected')));
create policy merch_variants_public_select on public.merch_product_variants for select to anon, authenticated using (product_id in (select id from public.merch_products where status='published'));
create policy merch_variants_admin_all on public.merch_product_variants for all to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

create or replace function public.tgg_submit_merch(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_creator uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select a.id, mp.status into v_creator,v_status from merch_products mp join artists a on a.id=mp.creator_id where mp.id=p_product_id and a.user_id=auth.uid() for update;
 if v_creator is null then raise exception 'MERCH_NOT_FOUND_OR_NOT_OWNER'; end if;
 if v_status not in ('draft','changes_requested') then raise exception 'INVALID_STATUS'; end if;
 update merch_products set status='pending', admin_note=null where id=p_product_id;
 return jsonb_build_object('ok',true,'product_id',p_product_id,'status','pending');
end $$;
revoke all on function public.tgg_submit_merch(uuid) from public;
grant execute on function public.tgg_submit_merch(uuid) to authenticated;

create or replace function public.tgg_admin_review_merch(p_product_id uuid,p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare v_status text; v_creator uuid; v_new text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from profiles where id=auth.uid() and role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
 select status,creator_id into v_status,v_creator from merch_products where id=p_product_id for update;
 if v_status is null then raise exception 'MERCH_NOT_FOUND'; end if;
 if p_action not in ('approve','request_changes','reject') then raise exception 'INVALID_ACTION'; end if;
 if v_status <> 'pending' then raise exception 'INVALID_STATUS'; end if;
 if p_action='approve' then v_new='published'; elsif p_action='request_changes' then v_new='changes_requested'; else v_new='rejected'; end if;
 if p_action in ('request_changes','reject') and nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'NOTE_REQUIRED'; end if;
 update merch_products set status=v_new, admin_note=nullif(trim(coalesce(p_note,'')),''), published_at=case when v_new='published' then now() else published_at end where id=p_product_id;
 insert into notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,title,body) values((select user_id from artists where id=v_creator),auth.uid(),'merch_review','merch_product',p_product_id,case when v_new='published' then 'Merch approved' when v_new='changes_requested' then 'Changes requested' else 'Merch rejected' end,coalesce(nullif(trim(p_note),''),'Your merchandise submission was reviewed.'));
 return jsonb_build_object('ok',true,'product_id',p_product_id,'previous_status',v_status,'status',v_new,'reviewed_by',auth.uid());
end $$;
revoke all on function public.tgg_admin_review_merch(uuid,text,text) from public;
grant execute on function public.tgg_admin_review_merch(uuid,text,text) to authenticated;


-- ============================================================
-- MIGRATION 20260902202737 create_creator_messenger_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.creator_conversations (id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.creator_conversation_members (conversation_id uuid not null references public.creator_conversations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, joined_at timestamptz not null default now(), primary key(conversation_id,user_id));
create table if not exists public.creator_messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.creator_conversations(id) on delete cascade, sender_id uuid not null references auth.users(id) on delete cascade, body text not null check (char_length(trim(body)) between 1 and 5000), created_at timestamptz not null default now(), read_at timestamptz);
create index if not exists idx_ccm_user on public.creator_conversation_members(user_id);
create index if not exists idx_cm_conversation_created on public.creator_messages(conversation_id,created_at);
create or replace function public.tgg_touch_creator_conversation() returns trigger language plpgsql security invoker set search_path=public as $$ begin update public.creator_conversations set updated_at=now() where id=new.conversation_id; return new; end; $$;
drop trigger if exists creator_message_touch on public.creator_messages;
create trigger creator_message_touch after insert on public.creator_messages for each row execute function public.tgg_touch_creator_conversation();
alter table public.creator_conversations enable row level security;
alter table public.creator_conversation_members enable row level security;
alter table public.creator_messages enable row level security;
drop policy if exists cc_member_select on public.creator_conversations;
create policy cc_member_select on public.creator_conversations for select to authenticated using (exists(select 1 from public.creator_conversation_members m where m.conversation_id=id and m.user_id=auth.uid()));
drop policy if exists ccm_member_select on public.creator_conversation_members;
create policy ccm_member_select on public.creator_conversation_members for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.creator_conversation_members m2 where m2.conversation_id=conversation_id and m2.user_id=auth.uid()));
drop policy if exists cm_member_select on public.creator_messages;
create policy cm_member_select on public.creator_messages for select to authenticated using (exists(select 1 from public.creator_conversation_members m where m.conversation_id=creator_messages.conversation_id and m.user_id=auth.uid()));
drop policy if exists cm_member_insert on public.creator_messages;
create policy cm_member_insert on public.creator_messages for insert to authenticated with check (sender_id=auth.uid() and exists(select 1 from public.creator_conversation_members m where m.conversation_id=creator_messages.conversation_id and m.user_id=auth.uid()));
create or replace function public.tgg_create_conversation(p_user_id uuid) returns uuid language plpgsql security definer set search_path=public,auth as $$ declare v_id uuid; begin if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if; if p_user_id is null or p_user_id=auth.uid() then raise exception 'INVALID_RECIPIENT'; end if; select c.id into v_id from public.creator_conversations c join public.creator_conversation_members a on a.conversation_id=c.id and a.user_id=auth.uid() join public.creator_conversation_members b on b.conversation_id=c.id and b.user_id=p_user_id limit 1; if v_id is not null then return v_id; end if; insert into public.creator_conversations(created_by) values(auth.uid()) returning id into v_id; insert into public.creator_conversation_members values(v_id,auth.uid()),(v_id,p_user_id); return v_id; end; $$;
create or replace function public.tgg_mark_message_read(p_message_id uuid) returns boolean language plpgsql security definer set search_path=public,auth as $$ begin update public.creator_messages set read_at=now() where id=p_message_id and read_at is null and exists(select 1 from public.creator_conversation_members m where m.conversation_id=creator_messages.conversation_id and m.user_id=auth.uid()); return found; end; $$;
revoke all on function public.tgg_create_conversation(uuid) from public,anon; grant execute on function public.tgg_create_conversation(uuid) to authenticated;
revoke all on function public.tgg_mark_message_read(uuid) from public,anon; grant execute on function public.tgg_mark_message_read(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260902203026 create_creator_promotion_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.promotion_campaigns (id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.artists(id) on delete cascade, title text not null, description text, campaign_type text not null default 'general' check (campaign_type in ('general','music','video','merch','event','profile')), target_url text, image_url text, budget_cents bigint not null default 0 check (budget_cents >= 0), status text not null default 'draft' check (status in ('draft','pending','approved','active','paused','completed','rejected')), admin_note text, starts_at timestamptz, ends_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists promotion_campaigns_creator_idx on public.promotion_campaigns(creator_id,status);
create or replace function public.tgg_promotion_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
drop trigger if exists promotion_campaigns_updated_at on public.promotion_campaigns;
create trigger promotion_campaigns_updated_at before update on public.promotion_campaigns for each row execute function public.tgg_promotion_updated_at();
alter table public.promotion_campaigns enable row level security;
drop policy if exists promotion_creator_select on public.promotion_campaigns; create policy promotion_creator_select on public.promotion_campaigns for select to authenticated using (exists(select 1 from public.artists a where a.id=creator_id and a.user_id=auth.uid()));
drop policy if exists promotion_creator_insert on public.promotion_campaigns; create policy promotion_creator_insert on public.promotion_campaigns for insert to authenticated with check (exists(select 1 from public.artists a where a.id=creator_id and a.user_id=auth.uid()));
drop policy if exists promotion_creator_update on public.promotion_campaigns; create policy promotion_creator_update on public.promotion_campaigns for update to authenticated using (exists(select 1 from public.artists a where a.id=creator_id and a.user_id=auth.uid())) with check (exists(select 1 from public.artists a where a.id=creator_id and a.user_id=auth.uid()));
drop policy if exists promotion_creator_delete on public.promotion_campaigns; create policy promotion_creator_delete on public.promotion_campaigns for delete to authenticated using (exists(select 1 from public.artists a where a.id=creator_id and a.user_id=auth.uid()) and status='draft');
drop policy if exists promotion_admin_all on public.promotion_campaigns; create policy promotion_admin_all on public.promotion_campaigns for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
create or replace function public.tgg_submit_promotion(p_campaign_id uuid) returns jsonb language plpgsql security definer set search_path=public,auth as $$ declare v_creator uuid; v_status text; begin if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if; select a.id into v_creator from public.artists a where a.user_id=auth.uid(); if v_creator is null then raise exception 'CREATOR_PROFILE_REQUIRED'; end if; select status into v_status from public.promotion_campaigns where id=p_campaign_id and creator_id=v_creator for update; if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if; if v_status not in ('draft','rejected') then raise exception 'INVALID_STATUS'; end if; update public.promotion_campaigns set status='pending',admin_note=null,updated_at=now() where id=p_campaign_id; return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'status','pending'); end $$;
create or replace function public.tgg_admin_review_promotion(p_campaign_id uuid,p_action text,p_note text default null) returns jsonb language plpgsql security definer set search_path=public,auth as $$ declare v_admin uuid; v_creator uuid; v_old text; v_new text; begin v_admin:=auth.uid(); if v_admin is null then raise exception 'AUTH_REQUIRED'; end if; if not exists(select 1 from public.profiles where id=v_admin and role='admin') then raise exception 'ADMIN_REQUIRED'; end if; select creator_id,status into v_creator,v_old from public.promotion_campaigns where id=p_campaign_id for update; if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if; if v_old <> 'pending' then raise exception 'INVALID_STATUS'; end if; if p_action='approve' then v_new='approved'; elsif p_action='reject' then if nullif(trim(p_note),'') is null then raise exception 'NOTE_REQUIRED'; end if; v_new='rejected'; elsif p_action='request_changes' then if nullif(trim(p_note),'') is null then raise exception 'NOTE_REQUIRED'; end if; v_new='draft'; else raise exception 'INVALID_ACTION'; end if; update public.promotion_campaigns set status=v_new,admin_note=case when p_action='approve' then null else trim(p_note) end,updated_at=now() where id=p_campaign_id; insert into public.notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,title,body) values(v_creator,v_admin,'promotion_review','promotion_campaign',p_campaign_id,'Promotion review update','Your promotion campaign was reviewed: '||v_new||case when nullif(trim(p_note),'') is not null then ' — '||trim(p_note) else '' end); return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'status',v_new,'reviewed_by',v_admin); end $$;
revoke all on function public.tgg_submit_promotion(uuid) from public,anon; grant execute on function public.tgg_submit_promotion(uuid) to authenticated;
revoke all on function public.tgg_admin_review_promotion(uuid,text,text) from public,anon; grant execute on function public.tgg_admin_review_promotion(uuid,text,text) to authenticated;

-- ============================================================
-- MIGRATION 20260902204441 final_launch_security_hardening_v87
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Final launch hardening: prevent direct client publishing for creator-owned videos.
-- Creators may create drafts only; publishing remains an admin action.

create or replace function public.tgg_creator_create_video(
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
set search_path = public, auth
as $$
declare
  v_artist_id uuid;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select id into v_artist_id
  from public.artists
  where user_id = auth.uid()
  limit 1;

  if v_artist_id is null then
    raise exception 'CREATOR_PROFILE_REQUIRED';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'TITLE_REQUIRED';
  end if;

  if nullif(trim(coalesce(p_video_url,'')), '') is null then
    raise exception 'VIDEO_URL_REQUIRED';
  end if;

  if p_visibility not in ('public','private') then
    raise exception 'INVALID_VISIBILITY';
  end if;

  insert into public.videos(
    artist_id,title,description,release_date,video_url,thumbnail_url,status,visibility
  ) values (
    v_artist_id,trim(p_title),nullif(trim(p_description),''),p_release_date,
    trim(p_video_url),nullif(trim(p_thumbnail_url),''),'draft',p_visibility
  ) returning id into v_id;

  return jsonb_build_object('ok',true,'video_id',v_id,'status','draft');
end;
$$;

revoke all on function public.tgg_creator_create_video(text,text,text,text,date,text) from public, anon;
grant execute on function public.tgg_creator_create_video(text,text,text,text,date,text) to authenticated;

-- Remove any legacy public execution path that could be used to invoke direct video publishing functions.
-- Existing table RLS already restricts creators to their own rows and public visibility to published/public rows.

comment on function public.tgg_creator_create_video(text,text,text,text,date,text) is 'Creator-safe video creation. Always creates draft; admin approval is required for publication.';

-- ============================================================
-- MIGRATION 20260902204454 secure_video_review_workflow_v88
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Lock video publishing behind admin review, matching the mixtape/merch/promotion workflow.
drop policy if exists "Artists can update their own videos" on public.videos;
create policy "Artists can update their own videos"
on public.videos for update to authenticated
using (
  exists (select 1 from public.artists a where a.id = videos.artist_id and a.user_id = auth.uid())
)
with check (
  exists (select 1 from public.artists a where a.id = videos.artist_id and a.user_id = auth.uid())
  and status in ('draft','changes_requested')
);

create or replace function public.tgg_submit_video(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select v.id,v.status into v_id,v_status
  from public.videos v join public.artists a on a.id=v.artist_id
  where v.id=p_video_id and a.user_id=auth.uid()
  for update;
  if v_id is null then raise exception 'VIDEO_NOT_FOUND_OR_NOT_OWNER'; end if;
  if v_status not in ('draft','changes_requested') then raise exception 'INVALID_VIDEO_STATUS'; end if;
  update public.videos set status='pending' where id=v_id;
  return jsonb_build_object('ok',true,'video_id',v_id,'status','pending');
end;
$$;
revoke all on function public.tgg_submit_video(uuid) from public,anon;
grant execute on function public.tgg_submit_video(uuid) to authenticated;

create or replace function public.tgg_admin_review_video(p_video_id uuid,p_action text,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_status text; v_creator uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
  select status, artist_id into v_status,v_creator from public.videos where id=p_video_id for update;
  if v_status is null then raise exception 'VIDEO_NOT_FOUND'; end if;
  if v_status <> 'pending' then raise exception 'VIDEO_NOT_PENDING'; end if;
  if p_action not in ('approve','request_changes','reject') then raise exception 'INVALID_ACTION'; end if;
  if p_action in ('request_changes','reject') and nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'NOTE_REQUIRED'; end if;
  update public.videos set
    status = case when p_action='approve' then 'published' else case when p_action='request_changes' then 'changes_requested' else 'rejected' end end,
    admin_note = nullif(trim(p_note),'')
  where id=p_video_id;
  return jsonb_build_object('ok',true,'video_id',p_video_id,'status',(select status from public.videos where id=p_video_id),'reviewed_by',auth.uid());
end;
$$;
revoke all on function public.tgg_admin_review_video(uuid,text,text) from public,anon;
grant execute on function public.tgg_admin_review_video(uuid,text,text) to authenticated;

comment on function public.tgg_submit_video(uuid) is 'Creator submits owned video for admin review; cannot publish directly.';
comment on function public.tgg_admin_review_video(uuid,text,text) is 'Admin-only video moderation workflow.';

-- ============================================================
-- MIGRATION 20260902204615 harden_messaging_authorization_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Remove broad direct-write paths from messaging tables. Reads remain member-scoped.
drop policy if exists conversation_members_insert on public.conversation_members;
drop policy if exists conversation_members_update on public.conversation_members;
drop policy if exists conversation_members_delete on public.conversation_members;
drop policy if exists conversations_insert on public.conversations;
drop policy if exists conversations_update on public.conversations;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;

-- Keep direct SELECT policies intact; creation, membership changes, sending, and read-state changes
-- must flow through SECURITY DEFINER RPCs that validate auth.uid() and membership.

-- Ensure authenticated clients cannot execute arbitrary security-definer functions by default.
-- Existing messaging RPCs retain their intended authenticated grants.
commit;

-- ============================================================
-- MIGRATION 20260902204744 add_secure_messaging_rpcs_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create or replace function public.tgg_create_conversation_v2(p_user_id uuid, p_title text default null)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_user_id is null or p_user_id = auth.uid() then raise exception 'INVALID_RECIPIENT'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'RECIPIENT_NOT_FOUND'; end if;

  select c.id into v_id
  from public.conversations c
  join public.conversation_members a on a.conversation_id=c.id and a.user_id=auth.uid()
  join public.conversation_members b on b.conversation_id=c.id and b.user_id=p_user_id
  where c.conversation_type='direct'
  limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.conversations(conversation_type,title,created_by)
  values('direct', nullif(left(trim(coalesce(p_title,'')),200),''), auth.uid())
  returning id into v_id;

  insert into public.conversation_members(conversation_id,user_id,role)
  values(v_id,auth.uid(),'member'),(v_id,p_user_id,'member');
  return v_id;
end;
$$;

create or replace function public.tgg_send_message_v2(p_conversation_id uuid, p_body text, p_message_type text default 'text', p_reply_to_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_id uuid; v_body text; v_type text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.conversation_members where conversation_id=p_conversation_id and user_id=auth.uid()) then raise exception 'NOT_A_MEMBER'; end if;
  v_body := nullif(trim(p_body),'');
  if v_body is null then raise exception 'EMPTY_MESSAGE'; end if;
  if length(v_body) > 5000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  v_type := coalesce(nullif(trim(p_message_type),''),'text');
  if v_type not in ('text') then raise exception 'INVALID_MESSAGE_TYPE'; end if;
  if p_reply_to_id is not null and not exists (select 1 from public.messages where id=p_reply_to_id and conversation_id=p_conversation_id) then raise exception 'INVALID_REPLY'; end if;

  insert into public.messages(conversation_id,sender_id,body,message_type,reply_to_id)
  values(p_conversation_id,auth.uid(),v_body,v_type,p_reply_to_id)
  returning id into v_id;
  update public.conversations set updated_at=now() where id=p_conversation_id;
  return v_id;
end;
$$;

create or replace function public.tgg_mark_conversation_read_v2(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.conversation_members
     set last_read_at=now()
   where conversation_id=p_conversation_id and user_id=auth.uid();
  return found;
end;
$$;

revoke all on function public.tgg_create_conversation_v2(uuid,text) from public, anon;
revoke all on function public.tgg_send_message_v2(uuid,text,text,uuid) from public, anon;
revoke all on function public.tgg_mark_conversation_read_v2(uuid) from public, anon;
grant execute on function public.tgg_create_conversation_v2(uuid,text) to authenticated;
grant execute on function public.tgg_send_message_v2(uuid,text,text,uuid) to authenticated;
grant execute on function public.tgg_mark_conversation_read_v2(uuid) to authenticated;

commit;

-- ============================================================
-- MIGRATION 20260902205038 production_content_authorization_hardening_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Videos: creators may create only drafts and may only delete non-published work.
drop policy if exists "Artists can create their own videos" on public.videos;
drop policy if exists "Artists can delete their own videos" on public.videos;
create policy "Artists can create their own videos" on public.videos
for insert to authenticated
with check (
  status in ('draft','changes_requested')
  and exists (select 1 from public.artists a where a.id = videos.artist_id and a.user_id = auth.uid())
);
create policy "Artists can delete their own videos" on public.videos
for delete to authenticated
using (
  status in ('draft','changes_requested')
  and exists (select 1 from public.artists a where a.id = videos.artist_id and a.user_id = auth.uid())
);

-- Merch: creators can never promote a product directly to published/archived/approved/active.
drop policy if exists merch_products_creator_update on public.merch_products;
create policy merch_products_creator_update on public.merch_products
for update to authenticated
using (
  creator_id in (select a.id from public.artists a where a.user_id = auth.uid())
)
with check (
  creator_id in (select a.id from public.artists a where a.user_id = auth.uid())
  and status in ('draft','pending','changes_requested','rejected')
);

-- Merch variants may only be edited while their parent product is creator-editable.
drop policy if exists merch_variants_creator_update on public.merch_product_variants;
create policy merch_variants_creator_update on public.merch_product_variants
for update to authenticated
using (
  product_id in (
    select mp.id from public.merch_products mp
    join public.artists a on a.id = mp.creator_id
    where a.user_id = auth.uid()
      and mp.status in ('draft','changes_requested','rejected')
  )
)
with check (
  product_id in (
    select mp.id from public.merch_products mp
    join public.artists a on a.id = mp.creator_id
    where a.user_id = auth.uid()
      and mp.status in ('draft','changes_requested','rejected')
  )
);

-- Promotion: creators may edit campaigns, but can never self-approve/activate them.
drop policy if exists promotion_creator_update on public.promotion_campaigns;
create policy promotion_creator_update on public.promotion_campaigns
for update to authenticated
using (
  exists (select 1 from public.artists a where a.id = promotion_campaigns.creator_id and a.user_id = auth.uid())
)
with check (
  exists (select 1 from public.artists a where a.id = promotion_campaigns.creator_id and a.user_id = auth.uid())
  and status in ('draft','pending','rejected')
);

-- Tracks: creators may only add/edit tracks on creator-owned non-published mixtapes.
drop policy if exists "tracks artist insert" on public.tracks;
drop policy if exists "tracks artist update" on public.tracks;
create policy "tracks artist insert" on public.tracks
for insert to authenticated
with check (
  exists (
    select 1
    from public.mixtapes m
    join public.artists a on a.id = m.artist_id
    where m.id = tracks.mixtape_id
      and a.user_id = auth.uid()
      and m.status in ('draft','pending','changes_requested','rejected')
      and tracks.artist_id = m.artist_id
  )
);
create policy "tracks artist update" on public.tracks
for update to authenticated
using (
  exists (
    select 1
    from public.mixtapes m
    join public.artists a on a.id = m.artist_id
    where m.id = tracks.mixtape_id
      and tracks.artist_id = m.artist_id
      and a.user_id = auth.uid()
      and m.status in ('draft','pending','changes_requested','rejected')
  )
)
with check (
  exists (
    select 1
    from public.mixtapes m
    join public.artists a on a.id = m.artist_id
    where m.id = tracks.mixtape_id
      and tracks.artist_id = m.artist_id
      and a.user_id = auth.uid()
      and m.status in ('draft','pending','changes_requested','rejected')
  )
);

-- Anonymous clients must never receive direct write privileges on creator-content tables.
revoke insert, update, delete, truncate on public.merch_products from anon;
revoke insert, update, delete, truncate on public.merch_product_variants from anon;
revoke insert, update, delete, truncate on public.promotion_campaigns from anon;
revoke insert, update, delete, truncate on public.tracks from anon;
revoke insert, update, delete, truncate on public.videos from anon;

commit;

-- ============================================================
-- MIGRATION 20260902205112 lock_track_data_and_public_catalog_rpc_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Public clients must use safe RPCs rather than selecting the tracks table directly.
drop policy if exists "tracks public read" on public.tracks;
create policy "tracks artist read own" on public.tracks
for select to authenticated
using (
  exists (
    select 1 from public.artists a
    where a.id = tracks.artist_id and a.user_id = auth.uid()
  )
);

-- Safe public catalog: no audio_path or audio_url is ever returned.
create or replace function public.tgg_public_mixtape_catalog()
returns table (
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
security definer
set search_path = public
as $$
  select m.id, m.title, m.genre, m.description, m.cover_url, m.release_date,
         a.id, a.stage_name, count(t.id)::bigint
  from public.mixtapes m
  left join public.artists a on a.id = m.artist_id
  left join public.tracks t on t.mixtape_id = m.id
  where m.status = 'published'
  group by m.id, a.id, a.stage_name
  order by m.release_date desc nulls last, m.created_at desc;
$$;

create or replace function public.tgg_public_mixtape_detail(p_mixtape_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', m.id,
    'title', m.title,
    'genre', m.genre,
    'description', m.description,
    'cover_url', m.cover_url,
    'release_date', m.release_date,
    'artists', jsonb_build_object('id', a.id, 'stage_name', a.stage_name),
    'tracks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'track_number', t.track_number,
          'title', t.title,
          'featured_artist', t.featured_artist,
          'download_policy', t.download_policy
        ) order by t.track_number
      )
      from public.tracks t
      where t.mixtape_id = m.id
    ), '[]'::jsonb)
  )
  from public.mixtapes m
  left join public.artists a on a.id = m.artist_id
  where m.id = p_mixtape_id
    and m.status = 'published';
$$;

revoke all on function public.tgg_public_mixtape_catalog() from public;
grant execute on function public.tgg_public_mixtape_catalog() to anon, authenticated;
revoke all on function public.tgg_public_mixtape_detail(uuid) from public;
grant execute on function public.tgg_public_mixtape_detail(uuid) to anon, authenticated;

-- No direct track reads for anonymous users; public access is through the safe RPCs.
revoke select on public.tracks from anon;

commit;

-- ============================================================
-- MIGRATION 20260902205643 final_v54_grant_hardening_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke insert, update, delete on public.conversations from anon;
revoke insert, update, delete on public.conversation_members from anon;
revoke insert, update, delete on public.messages from anon;
revoke insert, delete on public.notifications from anon;
revoke insert, update, delete on public.mixtapes from anon;
revoke insert, update, delete on public.tracks from anon;
revoke insert, update, delete on public.promotion_campaigns from anon;

revoke insert, update, delete on public.conversations from authenticated;
revoke insert, update, delete on public.conversation_members from authenticated;
revoke insert, update, delete on public.messages from authenticated;
revoke insert, delete on public.notifications from authenticated;

-- Public mixtape pages now use the safe catalog/detail RPCs, so direct anon table access is unnecessary.
revoke select on public.mixtapes from anon;
revoke select on public.tracks from anon;

-- Remove duplicate profile SELECT policies; the remaining policies preserve own-profile/admin visibility.
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "profiles own read" on public.profiles;


-- ============================================================
-- MIGRATION 20260902210057 harden_legacy_storage_uploads_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

drop policy if exists "audio authenticated upload" on storage.objects;
drop policy if exists "cover authenticated upload" on storage.objects;
drop policy if exists "tgg audio upload" on storage.objects;
drop policy if exists "tgg covers upload" on storage.objects;
drop policy if exists "tgg artist images upload" on storage.objects;

create policy "tgg audio owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'audio'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "tgg covers owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'covers'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "tgg artist images owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'artist-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;

-- ============================================================
-- MIGRATION 20260902210347 harden_creator_submission_and_legacy_rpc_access_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_submit_mixtape(p_mixtape_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_artist_id uuid;
  v_status text;
  v_track_count integer;
  v_protected_count integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  select a.id into v_artist_id from public.artists a where a.user_id=v_user_id limit 1;
  if v_artist_id is null then raise exception 'ARTIST_PROFILE_NOT_FOUND'; end if;
  select status::text into v_status from public.mixtapes where id=p_mixtape_id and artist_id=v_artist_id for update;
  if v_status is null then raise exception 'RELEASE_NOT_OWNED'; end if;
  if v_status not in ('draft','changes_requested','rejected') then raise exception 'INVALID_SUBMISSION_STATUS'; end if;
  select count(*)::integer, count(*) filter (where audio_path is not null and btrim(audio_path) <> '')::integer
    into v_track_count, v_protected_count
    from public.tracks where mixtape_id=p_mixtape_id and artist_id=v_artist_id;
  if v_track_count < 1 then raise exception 'TRACK_REQUIRED'; end if;
  if v_protected_count <> v_track_count then raise exception 'PROTECTED_AUDIO_REQUIRED'; end if;
  update public.mixtapes set status='pending' where id=p_mixtape_id and artist_id=v_artist_id;
  return jsonb_build_object('ok',true,'mixtape_id',p_mixtape_id,'status','pending','track_count',v_track_count);
end;
$$;
revoke all on function public.tgg_submit_mixtape(uuid) from public, anon;
grant execute on function public.tgg_submit_mixtape(uuid) to authenticated;

revoke execute on function public.tgg_set_release_date(uuid,timestamptz) from public, anon;
revoke execute on function public.tgg_media_set_updated_at() from public, anon;
revoke execute on function public.tgg_promotion_updated_at() from public, anon;
revoke execute on function public.tgg_touch_creator_conversation() from public, anon;
revoke execute on function public.tgg_track_access_policy(uuid,text) from public, anon;


-- ============================================================
-- MIGRATION 20260902212406 harden_v54_dashboard_summary_execute_privilege
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v54_dashboard_summary(uuid) from anon;

-- ============================================================
-- MIGRATION 20260902212417 remove_public_v54_dashboard_summary_execute
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v54_dashboard_summary(uuid) from public; grant execute on function public.v54_dashboard_summary(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260902212448 harden_v54_test_health_execute_privilege
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v54_test_health() from public; revoke execute on function public.v54_test_health() from anon; grant execute on function public.v54_test_health() to authenticated;

-- ============================================================
-- MIGRATION 20260902213058 phase2_creator_analytics_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.creator_analytics_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.v54_creators(id) on delete cascade,
  mixtape_id uuid null,
  event_type text not null check (event_type in ('view','play','download','share','like','follow','release')),
  session_id text null,
  source text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists creator_analytics_events_creator_time_idx on public.creator_analytics_events (creator_id, occurred_at desc);
create index if not exists creator_analytics_events_mixtape_time_idx on public.creator_analytics_events (mixtape_id, occurred_at desc);
create index if not exists creator_analytics_events_type_time_idx on public.creator_analytics_events (event_type, occurred_at desc);
alter table public.creator_analytics_events enable row level security;
drop policy if exists creator_analytics_events_select_own on public.creator_analytics_events;
create policy creator_analytics_events_select_own on public.creator_analytics_events for select to authenticated using (exists (select 1 from public.v54_creator_members m where m.creator_id = creator_analytics_events.creator_id and m.user_id = auth.uid()));
drop policy if exists creator_analytics_events_insert_own on public.creator_analytics_events;
create policy creator_analytics_events_insert_own on public.creator_analytics_events for insert to authenticated with check (exists (select 1 from public.v54_creator_members m where m.creator_id = creator_analytics_events.creator_id and m.user_id = auth.uid()));
create or replace function public.phase2_creator_analytics(p_creator_id uuid, p_days integer default 30)
returns table (event_type text, event_count bigint)
language sql security invoker set search_path = public, auth
as $$
  select e.event_type, count(*)::bigint as event_count
  from public.creator_analytics_events e
  where e.creator_id = p_creator_id
    and e.occurred_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days,30),365)))
    and exists (select 1 from public.v54_creator_members m where m.creator_id = e.creator_id and m.user_id = auth.uid())
  group by e.event_type
  order by count(*) desc;
$$;
revoke all on function public.phase2_creator_analytics(uuid, integer) from public;
grant execute on function public.phase2_creator_analytics(uuid, integer) to authenticated;
grant select, insert on public.creator_analytics_events to authenticated;

-- ============================================================
-- MIGRATION 20260902213216 phase2_creator_analytics_dashboard_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.phase2_creator_analytics_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_creator uuid;
  v_days integer := greatest(1, least(coalesce(p_days,30),365));
  v_result jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select m.creator_id into v_creator
  from public.v54_creator_members m
  where m.user_id=v_user
  order by m.created_at asc
  limit 1;
  if v_creator is null then raise exception 'Creator workspace not found'; end if;
  select jsonb_build_object(
    'creator_id', v_creator,
    'days', v_days,
    'events_total', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.occurred_at>=now()-make_interval(days=>v_days)),
    'views', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='view' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'plays', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='play' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'downloads', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='download' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'shares', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='share' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'likes', (select count(*) from public.creator_analytics_events e where e.creator_id=v_creator and e.event_type='like' and e.occurred_at>=now()-make_interval(days=>v_days)),
    'mixtapes', coalesce((select jsonb_agg(to_jsonb(x) order by x.play_count desc, x.created_at desc) from (select mt.id,mt.title,mt.genre,mt.status,mt.featured,mt.play_count,mt.created_at from public.mixtapes mt join public.artists ar on ar.id=mt.artist_id where ar.user_id=v_user order by mt.play_count desc,mt.created_at desc limit 12) x),'[]'::jsonb),
    'event_breakdown', coalesce((select jsonb_agg(jsonb_build_object('event_type',z.event_type,'count',z.event_count) order by z.event_count desc) from (select e.event_type,count(*)::bigint event_count from public.creator_analytics_events e where e.creator_id=v_creator and e.occurred_at>=now()-make_interval(days=>v_days) group by e.event_type) z),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.phase2_creator_analytics_dashboard(integer) from public;
grant execute on function public.phase2_creator_analytics_dashboard(integer) to authenticated;

-- ============================================================
-- MIGRATION 20260902213305 phase2_creator_analytics_summary
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.phase2_creator_analytics_summary(p_creator_id uuid, p_days integer default 30)
returns table(metric text, value bigint)
language sql
security invoker
set search_path = public, auth
as $$
  select * from (
    select 'views'::text, count(*)::bigint from public.creator_analytics_events e where e.creator_id=p_creator_id and e.event_type='view' and e.occurred_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,30),365)))
    union all select 'plays', count(*) from public.creator_analytics_events e where e.creator_id=p_creator_id and e.event_type='play' and e.occurred_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,30),365)))
    union all select 'downloads', count(*) from public.creator_analytics_events e where e.creator_id=p_creator_id and e.event_type='download' and e.occurred_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,30),365)))
    union all select 'shares', count(*) from public.creator_analytics_events e where e.creator_id=p_creator_id and e.event_type='share' and e.occurred_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,30),365)))
    union all select 'likes', count(*) from public.creator_analytics_events e where e.creator_id=p_creator_id and e.event_type='like' and e.occurred_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,30),365)))
    union all select 'follows', count(*) from public.creator_analytics_events e where e.creator_id=p_creator_id and e.event_type='follow' and e.occurred_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,30),365)))
  ) s
  where exists (select 1 from public.v54_creator_members m where m.creator_id=p_creator_id and m.user_id=auth.uid());
$$;
revoke all on function public.phase2_creator_analytics_summary(uuid,integer) from public;
grant execute on function public.phase2_creator_analytics_summary(uuid,integer) to authenticated;

create or replace function public.phase2_mixtape_performance(p_creator_id uuid, p_days integer default 30)
returns table(mixtape_id uuid, title text, genre text, cover_url text, play_count bigint, period_plays bigint, period_views bigint, period_downloads bigint)
language sql
security invoker
set search_path = public, auth
as $$
  select m.id,m.title,m.genre,m.cover_url,coalesce(m.play_count,0)::bigint,
    coalesce((select count(*) from public.creator_analytics_events e where e.mixtape_id=m.id and e.creator_id=p_creator_id and e.event_type='play' and e.occurred_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,30),365)))),0)::bigint,
    coalesce((select count(*) from public.creator_analytics_events e where e.mixtape_id=m.id and e.creator_id=p_creator_id and e.event_type='view' and e.occurred_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,30),365)))),0)::bigint,
    coalesce((select count(*) from public.creator_analytics_events e where e.mixtape_id=m.id and e.creator_id=p_creator_id and e.event_type='download' and e.occurred_at >= now() - make_interval(days => greatest(1,least(coalesce(p_days,30),365)))),0)::bigint
  from public.mixtapes m
  join public.artists a on a.id=m.artist_id
  where exists (select 1 from public.v54_creator_members cm where cm.creator_id=p_creator_id and cm.user_id=auth.uid())
    and (a.user_id=auth.uid() or exists (select 1 from public.v54_creator_members cm2 where cm2.creator_id=p_creator_id and cm2.user_id=auth.uid()))
  order by coalesce(m.play_count,0) desc, m.created_at desc;
$$;
revoke all on function public.phase2_mixtape_performance(uuid,integer) from public;
grant execute on function public.phase2_mixtape_performance(uuid,integer) to authenticated;

