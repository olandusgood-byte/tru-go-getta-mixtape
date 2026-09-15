-- TRU GO GETTA production migration history archive
-- Date bucket: 20260914
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260914001721 optimize_codesync_rpc_registry_refresh
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_codesync_refresh_rpc_registry()
returns jsonb
language plpgsql
set search_path to 'private','public','pg_catalog','pg_temp'
as $function$
declare
  r record;
  v_db_refs int;
  v_policy_refs int;
  v_state text;
  v_count int:=0;
begin
  create temporary table if not exists pg_temp.tgg_codesync_function_text(
    oid oid primary key,
    function_text text not null
  ) on commit drop;
  truncate pg_temp.tgg_codesync_function_text;
  insert into pg_temp.tgg_codesync_function_text(oid,function_text)
  select p.oid, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p');

  create temporary table if not exists pg_temp.tgg_codesync_policy_text(
    policy_text text not null
  ) on commit drop;
  truncate pg_temp.tgg_codesync_policy_text;
  insert into pg_temp.tgg_codesync_policy_text(policy_text)
  select coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') || ' ' || coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'')
  from pg_policy pol;

  for r in
    select n.nspname as schema_name,p.oid,p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args,
           regexp_replace(p.proname,'_v[0-9]+$','') as family_key,
           nullif(substring(p.proname from '_v([0-9]+)$'),'')::int as version_num
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind in ('f','p') and p.proname like 'tgg_%'
  loop
    select count(*) into v_db_refs
    from pg_temp.tgg_codesync_function_text f
    where f.oid<>r.oid and position(r.function_name in f.function_text)>0;

    select count(*) into v_policy_refs
    from pg_temp.tgg_codesync_policy_text pol
    where position(r.function_name in pol.policy_text)>0;

    if exists (select 1 from private.tgg_rpc_intentional_version_names i where i.schema_name=r.schema_name and i.function_name=r.function_name and i.keep) then
      v_state:='active';
    elsif r.version_num is not null and v_db_refs=0 and v_policy_refs=0 then
      v_state:='safe_to_retire';
    elsif r.version_num is not null then
      v_state:='consolidate';
    elsif exists (
      select 1 from pg_proc q join pg_namespace nq on nq.oid=q.pronamespace
      where nq.nspname in ('public','private') and nq.nspname<>r.schema_name and q.proname=r.function_name
        and pg_get_function_identity_arguments(q.oid)=r.identity_args
    ) then
      v_state:='wrapper_pair';
    else
      v_state:='active';
    end if;

    insert into private.tgg_rpc_registry(schema_name,function_name,identity_args,family_key,version_num,db_refs,policy_refs,state,notes,last_scanned_at)
    values(r.schema_name,r.function_name,r.identity_args,r.family_key,r.version_num,v_db_refs,v_policy_refs,v_state,
      case when v_policy_refs>0 then 'Referenced by active RLS policies; do not retire without migrating policies.'
           when v_state='safe_to_retire' then 'No database-function or RLS-policy references detected.'
           when v_state='consolidate' then 'Versioned RPC still has dependencies; consolidate before retirement.'
           when v_state='wrapper_pair' then 'Public/private pair preserved pending security-wrapper comparison.'
           else null end, now())
    on conflict(schema_name,function_name,identity_args) do update set
      family_key=excluded.family_key,version_num=excluded.version_num,db_refs=excluded.db_refs,policy_refs=excluded.policy_refs,
      state=case when private.tgg_rpc_registry.state='retired' then 'retired' else excluded.state end,
      notes=excluded.notes,last_scanned_at=now();
    v_count:=v_count+1;
  end loop;

  delete from private.tgg_rpc_registry rr where rr.state<>'retired' and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname=rr.schema_name and p.proname=rr.function_name
      and pg_get_function_identity_arguments(p.oid)=rr.identity_args);

  insert into public.tgg_code_sync_rpc_state(id,tracked,canonical,consolidate,safe_to_retire,wrapper_pairs,retired,updated_at)
  values(1,(select count(*) from private.tgg_rpc_registry),(select count(*) from private.tgg_rpc_registry where state='canonical'),
    (select count(*) from private.tgg_rpc_registry where state='consolidate'),(select count(*) from private.tgg_rpc_registry where state='safe_to_retire'),
    (select count(*) from private.tgg_rpc_registry where state='wrapper_pair'),(select count(*) from private.tgg_rpc_registry where state='retired'),now())
  on conflict(id) do update set tracked=excluded.tracked,canonical=excluded.canonical,consolidate=excluded.consolidate,safe_to_retire=excluded.safe_to_retire,
    wrapper_pairs=excluded.wrapper_pairs,retired=excluded.retired,updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'tracked',v_count,'refreshed_at',now());
end;
$function$;

-- ============================================================
-- MIGRATION 20260914024035 enable_video_production_realtime_core
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tgg_studio_projects',
    'tgg_studio_assets',
    'tgg_video_timeline_items',
    'tgg_video_studio_timeline_actions',
    'tgg_video_studio_ai_edit_sessions',
    'tgg_video_studio_publish_manifests',
    'tgg_homepage_publish_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname='supabase_realtime'
           AND schemaname='public'
           AND tablename=t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- MIGRATION 20260914032533 video_studio_database_bridge_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.videos add column if not exists studio_project_id uuid references public.tgg_studio_projects(id) on delete set null; alter table public.tgg_video_publish_jobs add column if not exists video_id uuid references public.videos(id) on delete set null; create unique index if not exists videos_studio_project_id_uq on public.videos(studio_project_id) where studio_project_id is not null; create index if not exists tgg_video_publish_jobs_video_id_idx on public.tgg_video_publish_jobs(video_id); create or replace function public.tgg_video_studio_sync_draft(p_project_id uuid, p_video_url text, p_thumbnail_url text default null, p_description text default null, p_genre text default null, p_release_date date default null, p_storage_bucket text default null, p_storage_path text default null) returns uuid language plpgsql security definer set search_path=public as $$ declare v_user uuid := auth.uid(); v_artist uuid; v_video uuid; begin if v_user is null then raise exception 'AUTH_REQUIRED'; end if; if not exists(select 1 from public.tgg_studio_projects where id=p_project_id and user_id=v_user and project_type='video') then raise exception 'PROJECT_NOT_OWNED'; end if; select id into v_artist from public.artists where user_id=v_user limit 1; if v_artist is null then raise exception 'ARTIST_PROFILE_REQUIRED'; end if; if nullif(trim(coalesce(p_video_url,'')),'') is null then raise exception 'VIDEO_URL_REQUIRED'; end if; insert into public.videos(artist_id,title,description,genre,release_date,video_url,thumbnail_url,visibility,featured,allow_downloads,status,storage_bucket,storage_path,studio_project_id) select v_artist,title,coalesce(p_description,description),p_genre,p_release_date,p_video_url,p_thumbnail_url,'private',false,false,'draft',p_storage_bucket,p_storage_path,id from public.tgg_studio_projects where id=p_project_id on conflict (studio_project_id) do update set artist_id=excluded.artist_id,title=excluded.title,description=excluded.description,genre=excluded.genre,release_date=excluded.release_date,video_url=excluded.video_url,thumbnail_url=excluded.thumbnail_url,visibility='private',status='draft',storage_bucket=excluded.storage_bucket,storage_path=excluded.storage_path,updated_at=now() returning id into v_video; return v_video; end; $$; revoke all on function public.tgg_video_studio_sync_draft(uuid,text,text,text,text,date,text,text) from public; grant execute on function public.tgg_video_studio_sync_draft(uuid,text,text,text,text,date,text,text) to authenticated; create or replace function public.tgg_video_studio_queue_publish(p_project_id uuid, p_video_id uuid, p_destination text default 'public_video') returns uuid language plpgsql security definer set search_path=public as $$ declare v_user uuid := auth.uid(); v_job uuid; begin if v_user is null then raise exception 'AUTH_REQUIRED'; end if; if not exists(select 1 from public.videos v join public.artists a on a.id=v.artist_id where v.id=p_video_id and v.studio_project_id=p_project_id and a.user_id=v_user and v.status='draft') then raise exception 'VIDEO_DRAFT_NOT_OWNED'; end if; if p_destination not in ('site','social_feed','shorts','stories','public_video','release') then raise exception 'INVALID_DESTINATION'; end if; insert into public.tgg_video_publish_jobs(project_id,video_id,user_id,destination_type,destination_id,payload,status) values(p_project_id,p_video_id,v_user,p_destination,p_video_id,jsonb_build_object('project_id',p_project_id,'video_id',p_video_id,'source','video_studio'),'queued') returning id into v_job; return v_job; end; $$; revoke all on function public.tgg_video_studio_queue_publish(uuid,uuid,text) from public; grant execute on function public.tgg_video_studio_queue_publish(uuid,uuid,text) to authenticated;

-- ============================================================
-- MIGRATION 20260914033549 video_studio_source_guard_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_video_studio_sync_draft(
  p_project_id uuid,
  p_video_url text,
  p_thumbnail_url text default null,
  p_description text default null,
  p_genre text default null,
  p_release_date date default null,
  p_storage_bucket text default null,
  p_storage_path text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_project public.tgg_studio_projects;
  v_artist uuid;
  v_video_id uuid;
  v_url text := nullif(btrim(coalesce(p_video_url,'')), '');
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if v_url is null then raise exception 'video_url_required'; end if;
  if v_url ilike '%trugogettamixtapes.blogspot.com/p/live.html%' then
    raise exception 'invalid_video_source_page_url';
  end if;
  if v_url ilike '%/p/live.html#studio%' then
    raise exception 'invalid_video_source_page_url';
  end if;

  select * into v_project
  from public.tgg_studio_projects
  where id=p_project_id and user_id=v_uid and project_type='video'
  for update;
  if v_project.id is null then raise exception 'studio_project_not_found_or_not_owned'; end if;

  select a.id into v_artist
  from public.artists a
  where a.user_id=v_uid
  order by a.created_at asc
  limit 1;
  if v_artist is null then raise exception 'creator_profile_required'; end if;

  insert into public.videos(
    artist_id,title,description,genre,release_date,explicit_content,
    video_url,thumbnail_url,visibility,featured,allow_downloads,status,
    storage_bucket,storage_path,studio_project_id,updated_at
  ) values (
    v_artist,v_project.title,nullif(btrim(coalesce(p_description,'')),''),
    nullif(btrim(coalesce(p_genre,'')),''),p_release_date,false,
    v_url,nullif(btrim(coalesce(p_thumbnail_url,'')),''),
    'private',false,false,'draft',p_storage_bucket,p_storage_path,p_project_id,now()
  )
  on conflict (studio_project_id) where studio_project_id is not null
  do update set
    title=excluded.title,
    description=excluded.description,
    genre=excluded.genre,
    release_date=excluded.release_date,
    video_url=excluded.video_url,
    thumbnail_url=excluded.thumbnail_url,
    storage_bucket=excluded.storage_bucket,
    storage_path=excluded.storage_path,
    visibility='private',
    status='draft',
    updated_at=now()
  returning id into v_video_id;

  return v_video_id;
end;
$$;
revoke all on function public.tgg_video_studio_sync_draft(uuid,text,text,text,text,date,text,text) from public, anon, authenticated;
grant execute on function public.tgg_video_studio_sync_draft(uuid,text,text,text,text,date,text,text) to authenticated;

-- ============================================================
-- MIGRATION 20260914043701 fix_video_render_caption_cues_worker_access
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

grant select on table public.tgg_video_studio_caption_cues to service_role;

-- ============================================================
-- MIGRATION 20260914045510 harden_public_security_definer_search_paths
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

ALTER FUNCTION public.tgg_public_discovery_growth_feed(integer,text) SET search_path = ''; ALTER FUNCTION public.tgg_record_public_analytics_event(text,text,uuid,text,text,jsonb) SET search_path = '';

-- ============================================================
-- MIGRATION 20260914052235 harden_live_discovery_world_security_definer_paths
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter function public.tgg_discovery_growth_refresh(timestamptz) set search_path='';
alter function public.tgg_live_auto_enqueue_completion() set search_path='';
alter function public.tgg_live_clip_auto_builder_trigger() set search_path='';
alter function public.tgg_live_clip_auto_refresh_continuation() set search_path='';
alter function public.tgg_live_clip_bridge_render_output() set search_path='';
alter function public.tgg_live_clip_playback_gate(uuid) set search_path='';
alter function public.tgg_world_mvp_v1_bootstrap_player() set search_path='';

-- ============================================================
-- MIGRATION 20260914054813 fix_authenticated_storage_search_path
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

ALTER ROLE authenticated SET search_path = public, storage, extensions;

-- ============================================================
-- MIGRATION 20260914074355 harden_video_studio_security_definers_search_path
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare r record;
begin
  for r in
    select p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosecdef
      and p.proname like 'tgg_video_studio_%'
  loop
    execute format('alter function %I.%I(%s) set search_path = '''';', r.nspname, r.proname, r.args);
  end loop;
end $$;

-- ============================================================
-- MIGRATION 20260914074400 lock_down_rls_tables_without_policies
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r'
      and c.relrowsecurity=true
      and n.nspname in ('public','private')
      and not exists (
        select 1 from pg_policy pol where pol.polrelid=c.oid
      )
  loop
    execute format('revoke all on table %I.%I from anon, authenticated;', r.schema_name, r.table_name);
  end loop;
end $$;

-- ============================================================
-- MIGRATION 20260914074432 optimize_direct_auth_uid_rls_policies
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare r record; q text; w text;
begin
  for r in
    select schemaname, tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname='public'
      and ((qual ~ '(^|[^a-zA-Z_])auth\\.uid\\(\\)' and qual not like '%SELECT auth.uid()%')
        or (with_check ~ '(^|[^a-zA-Z_])auth\\.uid\\(\\)' and with_check not like '%SELECT auth.uid()%'))
  loop
    q := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    w := replace(r.with_check, 'auth.uid()', '(select auth.uid())');
    if r.cmd in ('SELECT','DELETE','UPDATE','ALL') and r.qual is not null then
      execute format('alter policy %I on %I.%I using (%s);', r.policyname, r.schemaname, r.tablename, q);
    end if;
    if r.cmd in ('INSERT','UPDATE','ALL') and r.with_check is not null then
      execute format('alter policy %I on %I.%I with check (%s);', r.policyname, r.schemaname, r.tablename, w);
    end if;
  end loop;
end $$;

-- ============================================================
-- MIGRATION 20260914074452 rebuild_auth_uid_policies_as_initplans
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare r record; q text; w text; role_sql text; policy_cmd text;
begin
  for r in
    select schemaname, tablename, policyname, cmd, array_to_string(roles, ', ') as roles_sql, qual, with_check
    from pg_policies
    where schemaname='public'
      and ((qual like '%auth.uid()%' and qual not like '%SELECT auth.uid()%')
        or (with_check like '%auth.uid()%' and with_check not like '%SELECT auth.uid()%'))
  loop
    q := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    w := replace(r.with_check, 'auth.uid()', '(select auth.uid())');
    execute format('drop policy %I on %I.%I;', r.policyname, r.schemaname, r.tablename);
    policy_cmd := case r.cmd when 'ALL' then '' else ' for ' || lower(r.cmd) end;
    role_sql := case when r.roles_sql is null or r.roles_sql='' then '' else ' to ' || r.roles_sql end;
    if r.cmd='SELECT' then
      execute format('create policy %I on %I.%I%s%s using (%s);', r.policyname, r.schemaname, r.tablename, policy_cmd, role_sql, q);
    elsif r.cmd='INSERT' then
      execute format('create policy %I on %I.%I%s%s with check (%s);', r.policyname, r.schemaname, r.tablename, policy_cmd, role_sql, w);
    elsif r.cmd='UPDATE' then
      execute format('create policy %I on %I.%I%s%s using (%s) with check (%s);', r.policyname, r.schemaname, r.tablename, policy_cmd, role_sql, q, w);
    elsif r.cmd='DELETE' then
      execute format('create policy %I on %I.%I%s%s using (%s);', r.policyname, r.schemaname, r.tablename, policy_cmd, role_sql, q);
    else
      execute format('create policy %I on %I.%I%s%s using (%s) with check (%s);', r.policyname, r.schemaname, r.tablename, policy_cmd, role_sql, coalesce(q,'true'), coalesce(w,'true'));
    end if;
  end loop;
end $$;

-- ============================================================
-- MIGRATION 20260914074511 remove_redundant_artists_select_policy
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists "artists own read" on public.artists;

-- ============================================================
-- MIGRATION 20260914220956 fix_creator_upload_bootstrap_grants
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

grant usage on schema public to authenticated;
grant execute on function public.tgg_creator_upload_bootstrap(text) to authenticated;
grant select, insert, update on table public.artists to authenticated;

