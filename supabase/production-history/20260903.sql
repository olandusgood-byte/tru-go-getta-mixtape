-- TRU GO GETTA production migration history archive
-- Date bucket: 20260903
-- Historical evidence only. Do not replay against production.
-- Preserve the recorded order. Validate in an isolated clean environment before any bootstrap use.

-- ============================================================
-- MIGRATION 20260903005828 v157_harden_launch_control_functions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- V157 hardening: pin function search_path and fully qualify auth helpers.
-- No schema/data changes; preserves existing behavior and authorization boundaries.

CREATE OR REPLACE FUNCTION public.v58_launch_control_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  u uuid := auth.uid();
  f uuid;
  r uuid;
  v jsonb;
  required text[] := array['create','process','replay','duplicate-blocked','fail','retry','recover','cleanup'];
  missing_steps jsonb;
  missing_gates jsonb;
begin
  if u is null then raise exception 'authentication_required'; end if;

  select sf.id into f
  from public.v58_staging_fixtures sf
  where sf.creator_id=u and exists (
    select 1 from public.v58_staging_evidence se
    where se.fixture_id=sf.id and se.creator_id=u and se.passed=true
    group by se.fixture_id having count(distinct se.step)=8
  ) order by sf.updated_at desc, sf.created_at desc limit 1;

  select wr.id into r
  from public.v58_workflow_runs wr
  where wr.creator_id=u and wr.status='completed'
    and coalesce(wr.total_steps,0)>0 and wr.completed_steps=wr.total_steps
    and not exists (
      select 1 from public.v58_workflow_steps ws
      where ws.workflow_run_id=wr.id and ws.required=true and ws.status in ('blocked','failed')
    )
  order by wr.updated_at desc, wr.created_at desc limit 1;

  if f is null then
    return jsonb_build_object(
      'status','PENDING','score','0/7','verdict','PENDING','authenticated',true,
      'missing_steps',to_jsonb(required),
      'missing_gates',jsonb_build_array('1_authentication','2_ownership_rls','3_media_lifecycle','4_public_release_player','5_provider_recovery_idempotency','6_data_semantics','7_end_to_end'),
      'next_action','Run authenticated V58 staging E2E'
    );
  end if;

  select coalesce(jsonb_agg(x),'[]'::jsonb) into missing_steps
  from unnest(required) x
  where not exists (
    select 1 from public.v58_staging_evidence se
    where se.fixture_id=f and se.creator_id=u and se.step=x and se.passed=true
  );

  v := public.v58_v3_verdict(f,r);

  select coalesce(jsonb_agg(key),'[]'::jsonb) into missing_gates
  from jsonb_each(v->'gates')
  where coalesce((value->>'pass')::boolean,false) is not true;

  return jsonb_build_object(
    'status',v->>'verdict','score',v->>'score','verdict',v->>'verdict','authenticated',true,
    'fixture_id',f,'workflow_run_id',r,'missing_steps',missing_steps,'missing_gates',missing_gates,
    'evidence',v->'e2e','gates',v->'gates',
    'next_action',case when v->>'verdict'='GO' then 'Staging GO' else 'Resolve missing evidence and rerun' end,
    'refreshed_at',clock_timestamp()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.v58_launch_control_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  v_uid uuid := auth.uid();
  f uuid;
  r uuid;
  v jsonb;
  e jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  select sf.id into f
  from public.v58_staging_fixtures sf
  where sf.creator_id=v_uid and exists (
    select 1 from public.v58_staging_evidence se
    where se.fixture_id=sf.id and se.creator_id=v_uid and se.passed=true
    group by se.fixture_id having count(distinct se.step)=8
  ) order by sf.updated_at desc, sf.created_at desc limit 1;

  select wr.id into r
  from public.v58_workflow_runs wr
  where wr.creator_id=v_uid and wr.status='completed'
    and coalesce(wr.total_steps,0)>0 and wr.completed_steps=wr.total_steps
    and not exists (
      select 1 from public.v58_workflow_steps ws
      where ws.workflow_run_id=wr.id and ws.required=true and ws.status in ('blocked','failed')
    )
  order by wr.updated_at desc, wr.created_at desc limit 1;

  if f is null then
    return jsonb_build_object(
      'state','PENDING','score','0/7','verdict','PENDING',
      'message','No complete staging evidence exists yet.','gates','[]'::jsonb
    );
  end if;

  v := public.v58_v3_verdict(f,r);
  e := v->'e2e';

  return jsonb_build_object(
    'state',case when v->>'verdict'='GO' then 'GO' else 'NO-GO' end,
    'score',v->>'score','verdict',v->>'verdict','fixture_id',f,'workflow_run_id',r,
    'e2e',e,'gates',v->'gates','refreshed_at',clock_timestamp()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.v58_resolve_action(
  p_action_id uuid,
  p_resolution text DEFAULT 'approved'::text
)
RETURNS public.v58_workflow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare
  v_action public.v58_required_actions;
  v_step public.v58_workflow_steps;
  v_run public.v58_workflow_runs;
begin
  select * into v_action
  from public.v58_required_actions
  where id=p_action_id and creator_id=auth.uid()
  for update;

  if not found then raise exception 'Action not found or not owned by current creator'; end if;

  if v_action.resolved then
    return public.v58_recalculate_run(v_action.workflow_run_id);
  end if;

  update public.v58_required_actions
  set resolved=true, resolved_at=now()
  where id=p_action_id;

  if v_action.workflow_step_id is not null and lower(p_resolution) in ('approved','resolved','complete','completed') then
    select * into v_step from public.v58_workflow_steps where id=v_action.workflow_step_id for update;
    if found and v_step.status in ('blocked','running','retrying') then
      update public.v58_workflow_steps
      set status='completed', progress=100, detail=coalesce(detail,'Approved by creator.'),
          error_message=null, completed_at=now(), updated_at=now()
      where id=v_step.id;

      perform public.v58_emit_event(
        v_action.workflow_run_id, v_step.id, 'action.resolved', v_action.title || ' approved',
        'Creator action resolved; workflow may continue.', 'success', 'required_action', p_action_id::text,
        jsonb_build_object('resolution',p_resolution), 'action-resolved-' || p_action_id::text
      );
    end if;
  end if;

  v_run := public.v58_recalculate_run(v_action.workflow_run_id);
  if v_run.status <> 'completed' then
    v_run := public.v58_advance_workflow(v_action.workflow_run_id);
  end if;
  return v_run;
end;
$function$;

CREATE OR REPLACE FUNCTION public.v58_launch_control_preflight(p_release_id text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.role(),'') = 'service_role';
  v_release uuid;
  v_title text;
  v_status text;
  v_release_date timestamptz;
  v_cover_url text;
  v_track_count integer := 0;
  v_missing_audio integer := 0;
  v_missing text[] := array[]::text[];
begin
  if v_uid is null and not v_service then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED','message','Sign in before running V58.');
  end if;
  begin v_release := p_release_id::uuid; exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_RELEASE_ID','message','Release ID is not a valid UUID.'); end;
  if v_service then
    select m.id,m.title,m.status::text,m.release_date,m.cover_url into v_release,v_title,v_status,v_release_date,v_cover_url
    from public.mixtapes m where m.id=v_release limit 1;
  else
    select m.id,m.title,m.status::text,m.release_date,m.cover_url into v_release,v_title,v_status,v_release_date,v_cover_url
    from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id=v_release and a.user_id=v_uid limit 1;
  end if;
  if v_release is null then return jsonb_build_object('ok',false,'code','RELEASE_NOT_FOUND','message','Release not found.'); end if;
  select count(*)::integer,count(*) filter(where coalesce(nullif(trim(t.audio_url),''),'')='')::integer into v_track_count,v_missing_audio from public.tracks t where t.mixtape_id=v_release;
  if v_status<>'published' then v_missing:=array_append(v_missing,'Release must be published.'); end if;
  if v_release_date is null then v_missing:=array_append(v_missing,'Set a release date / launch schedule.'); end if;
  if coalesce(nullif(trim(v_cover_url),''),'')='' then v_missing:=array_append(v_missing,'Add cover artwork.'); end if;
  if v_track_count=0 then v_missing:=array_append(v_missing,'Add at least one track.'); elsif v_missing_audio>0 then v_missing:=array_append(v_missing,format('%s track(s) are missing audio URLs.',v_missing_audio)); end if;
  return jsonb_build_object('ok',cardinality(v_missing)=0,'release_id',v_release::text,'title',v_title,'status',v_status,'release_date',v_release_date,'track_count',v_track_count,'missing_audio_tracks',v_missing_audio,'missing',to_jsonb(v_missing),'checks',jsonb_build_object('authenticated',true,'owned',true,'published',v_status='published','release_date',v_release_date is not null,'cover_art',coalesce(nullif(trim(v_cover_url),''),'')<>'','track_count',v_track_count,'tracks_have_audio',v_track_count>0 and v_missing_audio=0));
end;
$function$;

-- ============================================================
-- MIGRATION 20260903080052 v122_harden_track_access_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke all on function public.tgg_track_access_policy(uuid,text) from public;
grant execute on function public.tgg_track_access_policy(uuid,text) to anon, authenticated;

create or replace function public.tgg_track_access_policy(p_track_id uuid, p_mode text default 'stream')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
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
  if not found then raise exception 'TRACK_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into m from public.mixtapes where id = t.mixtape_id;
  if not found then raise exception 'MIXTAPE_NOT_FOUND' using errcode = 'P0002'; end if;

  if m.status::text <> 'published' then
    raise exception 'MIXTAPE_NOT_PUBLISHED' using errcode = '42501';
  end if;

  if t.audio_path is null or btrim(t.audio_path) = '' then
    raise exception 'AUDIO_PATH_NOT_CONFIGURED' using errcode = '22023';
  end if;

  if p_mode = 'download' then
    if coalesce(t.download_policy,'stream_only') = 'stream_only' then
      raise exception 'DOWNLOAD_NOT_ALLOWED' using errcode = '42501';
    elsif t.download_policy = 'account_required' and u is null then
      raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
    elsif t.download_policy = 'email_required' then
      if u is null then raise exception 'ACCOUNT_REQUIRED' using errcode = '42501'; end if;
      select email_confirmed_at into email_confirmed from auth.users where id = u;
      if email_confirmed is null then raise exception 'VERIFIED_EMAIL_REQUIRED' using errcode = '42501'; end if;
    end if;
  end if;

  return jsonb_build_object(
    'track_id', t.id,
    'mixtape_id', t.mixtape_id,
    'audio_path', t.audio_path,
    'download_policy', coalesce(t.download_policy,'stream_only'),
    'mode', p_mode,
    'user_id', u
  );
end;
$function$;

-- ============================================================
-- MIGRATION 20260903080300 v122_harden_track_access_api
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.tgg_track_access_policy(uuid,text) from public;
revoke execute on function public.tgg_track_access_policy(uuid,text) from anon;
grant execute on function public.tgg_track_access_policy(uuid,text) to anon, authenticated;

alter function public.tgg_track_access_policy(uuid,text) set search_path = public, auth, pg_temp;

create or replace function public.tgg_track_access_policy(p_track_id uuid, p_mode text default 'stream')
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  t public.tracks%rowtype;
  m public.mixtapes%rowtype;
  u uuid := auth.uid();
  email_confirmed timestamptz;
begin
  if p_mode not in ('stream','download') then raise exception 'INVALID_ACCESS_MODE' using errcode='22023'; end if;
  select * into t from public.tracks where id=p_track_id;
  if not found then raise exception 'TRACK_NOT_FOUND' using errcode='P0002'; end if;
  select * into m from public.mixtapes where id=t.mixtape_id;
  if not found then raise exception 'MIXTAPE_NOT_FOUND' using errcode='P0002'; end if;
  if m.status::text <> 'published' then raise exception 'MIXTAPE_NOT_PUBLISHED' using errcode='42501'; end if;
  if t.audio_path is null or btrim(t.audio_path)='' then raise exception 'AUDIO_PATH_NOT_CONFIGURED' using errcode='22023'; end if;
  if p_mode='download' then
    if t.download_policy='stream_only' then raise exception 'DOWNLOAD_NOT_ALLOWED' using errcode='42501';
    elsif t.download_policy='account_required' and u is null then raise exception 'ACCOUNT_REQUIRED' using errcode='42501';
    elsif t.download_policy='email_required' then
      if u is null then raise exception 'ACCOUNT_REQUIRED' using errcode='42501'; end if;
      select email_confirmed_at into email_confirmed from auth.users where id=u;
      if email_confirmed is null then raise exception 'VERIFIED_EMAIL_REQUIRED' using errcode='42501'; end if;
    end if;
  end if;
  return jsonb_build_object('track_id',t.id,'mixtape_id',t.mixtape_id,'audio_path',t.audio_path,'download_policy',t.download_policy,'mode',p_mode,'user_id',u);
end;
$$;

revoke execute on function public.tgg_track_access_policy(uuid,text) from public;
revoke execute on function public.tgg_track_access_policy(uuid,text) from anon;
grant execute on function public.tgg_track_access_policy(uuid,text) to anon, authenticated;

-- ============================================================
-- MIGRATION 20260903081136 v84_final_security_integrity_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Lock trigger-function name resolution to trusted schemas.
create or replace function public.merch_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.tgg_promotion_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Public catalog/detail are intentionally anonymous-facing, but the track
-- access policy returns protected audio_path and must never be anonymous.
revoke execute on function public.tgg_track_access_policy(uuid,text) from anon;

-- Provider reconciliation/event mutation functions must never be callable by
-- anonymous users. Their existing authenticated/service paths remain intact.
revoke execute on function public.v59_reconcile_provider_operations(uuid,text) from anon;
revoke execute on function public.v59_record_provider_event(uuid,text,text,text,jsonb) from anon;

commit;

-- ============================================================
-- MIGRATION 20260903081256 v84_harden_provider_mutations_and_trigger_functions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

REVOKE EXECUTE ON FUNCTION public.v59_record_provider_event(uuid,text,text,text,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.v59_reconcile_provider_operations(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merch_touch_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.merch_touch_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.tgg_promotion_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tgg_promotion_updated_at() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.v59_record_provider_event(uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.v59_reconcile_provider_operations(uuid,text) TO authenticated;

-- ============================================================
-- MIGRATION 20260903081304 v84_remove_public_trigger_execute_grants
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

REVOKE EXECUTE ON FUNCTION public.merch_touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tgg_promotion_updated_at() FROM PUBLIC;

-- ============================================================
-- MIGRATION 20260903081425 v84_harden_remaining_public_security_definers
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

REVOKE EXECUTE ON FUNCTION public.tgg_public_mixtape_catalog() FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_public_mixtape_detail(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.artist_owns_mixtape(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_admin_review_merch(uuid,text,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_admin_review_mixtape(uuid,text,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_admin_review_promotion(uuid,text,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_admin_review_video(uuid,text,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_create_conversation(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_create_conversation_v2(uuid,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_creator_create_video(text,text,text,text,date,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_insert_track(uuid,text,uuid,text,integer,text,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_live_end(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_live_join(uuid,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_live_leave(text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_live_schedule(uuid,text,text,text,text,timestamptz,boolean) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_live_start(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_mark_conversation_read_v2(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_mark_message_read(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_send_message_v2(uuid,text,text,uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_submit_merch(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_submit_mixtape(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_submit_promotion(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_submit_video(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_track_access_policy(uuid,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_video_publish(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_video_record_event(uuid,text,numeric,jsonb) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v54_authorize_action(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v54_create_my_creator_workspace(text,text,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v54_mark_action_executed(uuid,jsonb) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v54_request_action(uuid,jsonb) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v54_system_health() FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_advance_workflow(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_block_step(uuid,text,text,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_complete_step(uuid,text,jsonb) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_create_release_launch_workflow(text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_dispatch_workflow_step(uuid,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_e2e_create_release_launch_rehearsal(text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_e2e_snapshot(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_get_release_launch_state(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_get_release_stripe_checkout_config(text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_launch_control_health() FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_launch_control_preflight_service(text,uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_launch_control_releases() FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_launch_control_start(text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_launch_control_status() FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_launch_release(text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_provider_ops_cancel_task(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_provider_ops_retry_task(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_provider_ops_summary() FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_queue_step_task(uuid,text,jsonb) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_recalculate_run(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_repair_and_retry(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_resolve_action(uuid,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_set_distribution_config(text,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_set_promotion_approval(text,boolean) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_set_release_stripe_checkout_config(text,text,text,text,integer,text,text,jsonb) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_start_workflow(uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v58_v3_verdict(uuid,uuid) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v59_reconcile_provider_operations(uuid,text) FROM PUBLIC; REVOKE EXECUTE ON FUNCTION public.v59_record_provider_event(uuid,text,text,text,jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.tgg_public_mixtape_catalog() TO anon; GRANT EXECUTE ON FUNCTION public.tgg_public_mixtape_detail(uuid) TO anon; GRANT EXECUTE ON FUNCTION public.artist_owns_mixtape(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_admin_review_merch(uuid,text,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_admin_review_mixtape(uuid,text,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_admin_review_promotion(uuid,text,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_admin_review_video(uuid,text,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_create_conversation(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_create_conversation_v2(uuid,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_creator_create_video(text,text,text,text,date,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_insert_track(uuid,text,uuid,text,integer,text,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_live_end(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_live_join(uuid,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_live_leave(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_live_schedule(uuid,text,text,text,text,timestamptz,boolean) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_live_start(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_mark_conversation_read_v2(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_mark_message_read(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_send_message_v2(uuid,text,text,uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_submit_merch(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_submit_mixtape(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_submit_promotion(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_submit_video(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_track_access_policy(uuid,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_video_publish(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_video_record_event(uuid,text,numeric,jsonb) TO authenticated; GRANT EXECUTE ON FUNCTION public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) TO authenticated; GRANT EXECUTE ON FUNCTION public.v54_authorize_action(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v54_create_my_creator_workspace(text,text,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v54_mark_action_executed(uuid,jsonb) TO authenticated; GRANT EXECUTE ON FUNCTION public.v54_request_action(uuid,jsonb) TO authenticated; GRANT EXECUTE ON FUNCTION public.v54_system_health() TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_advance_workflow(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_block_step(uuid,text,text,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_complete_step(uuid,text,jsonb) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_create_release_launch_workflow(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_dispatch_workflow_step(uuid,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_e2e_create_release_launch_rehearsal(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_e2e_snapshot(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_get_release_launch_state(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_get_release_stripe_checkout_config(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_launch_control_health() TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_launch_control_preflight_service(text,uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_launch_control_releases() TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_launch_control_start(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_launch_control_status() TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_launch_release(text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_provider_ops_cancel_task(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_provider_ops_retry_task(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_provider_ops_summary() TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_queue_step_task(uuid,text,jsonb) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_recalculate_run(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_repair_and_retry(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_resolve_action(uuid,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_set_distribution_config(text,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_set_promotion_approval(text,boolean) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_set_release_stripe_checkout_config(text,text,text,text,integer,text,text,jsonb) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_start_workflow(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v58_v3_verdict(uuid,uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.v59_reconcile_provider_operations(uuid,text) TO authenticated; GRANT EXECUTE ON FUNCTION public.v59_record_provider_event(uuid,text,text,text,jsonb) TO authenticated;

-- ============================================================
-- MIGRATION 20260903081836 v84_password_breach_guard_schema
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_password_breach_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  action text not null check (action in ('signup','password_change','password_reset')),
  blocked boolean not null default false,
  reason text null,
  created_at timestamptz not null default now()
);

alter table public.tgg_password_breach_checks enable row level security;

revoke all on table public.tgg_password_breach_checks from anon, authenticated;

create index if not exists tgg_password_breach_checks_created_at_idx
  on public.tgg_password_breach_checks (created_at desc);

create index if not exists tgg_password_breach_checks_user_id_idx
  on public.tgg_password_breach_checks (user_id);

comment on table public.tgg_password_breach_checks is 'Minimal audit trail for the TRU GO GETTA password breach guard. Does not store passwords or password hashes.';

-- ============================================================
-- MIGRATION 20260903093345 v58_harden_launch_verdict_execution
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_v3_verdict(uuid, uuid) from public, anon, authenticated;
grant execute on function public.v58_v3_verdict(uuid, uuid) to service_role;

-- Keep Launch Control health callable by signed-in creators; it performs its own auth.uid() check.
revoke execute on function public.v58_launch_control_health() from public, anon;
grant execute on function public.v58_launch_control_health() to authenticated, service_role;


-- ============================================================
-- MIGRATION 20260903093550 harden_security_definer_search_paths_pass_2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter function public.artist_owns_mixtape(uuid) set search_path = '';
alter function public.handle_new_user() set search_path = '';
alter function public.is_admin() set search_path = '';
alter function public.tgg_creator_create_video(text,text,text,text,date,text) set search_path = '';
alter function public.tgg_insert_track(uuid,text,uuid,text,integer,text,text) set search_path = '';
alter function public.tgg_live_end(uuid) set search_path = '';
alter function public.tgg_live_join(uuid,text) set search_path = '';
alter function public.tgg_live_leave(text) set search_path = '';
alter function public.tgg_live_schedule(uuid,text,text,text,text,timestamptz,boolean) set search_path = '';
alter function public.tgg_live_start(uuid) set search_path = '';
alter function public.tgg_mark_conversation_read_v2(uuid) set search_path = '';
alter function public.tgg_mark_message_read(uuid) set search_path = '';
alter function public.tgg_public_mixtape_catalog() set search_path = '';
alter function public.tgg_public_mixtape_detail(uuid) set search_path = '';
alter function public.tgg_send_message_v2(uuid,text,text,uuid) set search_path = '';
alter function public.tgg_submit_video(uuid) set search_path = '';
alter function public.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) set search_path = '';
alter function public.tgg_video_publish(uuid) set search_path = '';
alter function public.tgg_video_record_event(uuid,text,numeric,jsonb) set search_path = '';
alter function public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) set search_path = '';
alter function public.v58_advance_workflow_service(uuid) set search_path = '';
alter function public.v58_assert_run_owner(uuid) set search_path = '';
alter function public.v58_block_step(uuid,text,text,text) set search_path = '';
alter function public.v58_claim_distribution_task(uuid) set search_path = '';
alter function public.v58_claim_workflow_tasks(integer) set search_path = '';
alter function public.v58_complete_distribution_task(uuid,text,text) set search_path = '';
alter function public.v58_complete_provider_task(uuid,jsonb,text) set search_path = '';
alter function public.v58_complete_step(uuid,text,jsonb) set search_path = '';
alter function public.v58_complete_workflow_task(uuid,jsonb,text) set search_path = '';
alter function public.v58_create_release_launch_workflow(text) set search_path = '';
alter function public.v58_distribution_worker_dispatch(uuid) set search_path = '';
alter function public.v58_distribution_worker_task(uuid) set search_path = '';
alter function public.v58_e2e_create_release_launch_rehearsal(text) set search_path = '';
alter function public.v58_e2e_snapshot(uuid) set search_path = '';
alter function public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) set search_path = '';
alter function public.v58_enqueue_distribution_task(uuid) set search_path = '';
alter function public.v58_enqueue_provider_task(uuid,uuid,text,text,text,text,jsonb,integer) set search_path = '';
alter function public.v58_enqueue_stripe_monetization_task(uuid) set search_path = '';
alter function public.v58_fail_provider_task(uuid,text,integer) set search_path = '';
alter function public.v58_fail_workflow_task(uuid,text) set search_path = '';
alter function public.v58_get_release_launch_state(uuid) set search_path = '';
alter function public.v58_get_release_stripe_checkout_config(text) set search_path = '';
alter function public.v58_launch_control_releases() set search_path = '';
alter function public.v58_launch_control_start(text) set search_path = '';
alter function public.v58_process_owned_workflow(uuid,integer) set search_path = '';
alter function public.v58_provider_ops_cancel_task(uuid) set search_path = '';
alter function public.v58_provider_ops_retry_task(uuid) set search_path = '';
alter function public.v58_provider_ops_summary() set search_path = '';
alter function public.v58_provider_worker_contract(uuid) set search_path = '';
alter function public.v58_queue_step_task(uuid,text,jsonb) set search_path = '';
alter function public.v58_reconcile_stripe_event(text) set search_path = '';
alter function public.v58_record_distribution_delivery(uuid,boolean,text,jsonb) set search_path = '';
alter function public.v58_repair_and_retry(uuid) set search_path = '';
alter function public.v58_retry_provider_job(uuid) set search_path = '';
alter function public.v58_set_distribution_config(text,text) set search_path = '';
alter function public.v58_set_promotion_approval(text,boolean) set search_path = '';
alter function public.v58_set_release_stripe_checkout_config(text,text,text,text,integer,text,text,jsonb) set search_path = '';
alter function public.v58_staging_reconcile(uuid) set search_path = '';
alter function public.v58_sync_promotion_approval_into_runs(uuid) set search_path = '';
alter function public.v59_reconcile_provider_operations(uuid,text) set search_path = '';
alter function public.v59_record_provider_event(uuid,text,text,text,jsonb) set search_path = '';

-- ============================================================
-- MIGRATION 20260903093601 harden_remaining_safe_definer_search_paths
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter function public.tgg_create_conversation(uuid) set search_path = '';
alter function public.tgg_create_conversation_v2(uuid,text) set search_path = '';
alter function public.tgg_submit_mixtape(uuid) set search_path = '';
alter function public.tgg_track_access_policy(uuid,text) set search_path = '';
alter function public.v54_authorize_action(uuid) set search_path = '';
alter function public.v54_create_my_creator_workspace(text,text,text) set search_path = '';
alter function public.v54_mark_action_executed(uuid,jsonb) set search_path = '';
alter function public.v54_request_action(uuid,jsonb) set search_path = '';
alter function public.v54_system_health() set search_path = '';
alter function public.v58_dispatch_workflow_step(uuid,text) set search_path = '';

-- ============================================================
-- MIGRATION 20260903093619 harden_admin_review_functions_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_admin_review_merch(p_product_id uuid,p_action text,p_note text default null::text) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_status text; v_creator uuid; v_new text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
 select status,creator_id into v_status,v_creator from public.merch_products where id=p_product_id for update;
 if v_status is null then raise exception 'MERCH_NOT_FOUND'; end if;
 if p_action not in ('approve','request_changes','reject') then raise exception 'INVALID_ACTION'; end if;
 if v_status <> 'pending' then raise exception 'INVALID_STATUS'; end if;
 if p_action='approve' then v_new='published'; elsif p_action='request_changes' then v_new='changes_requested'; else v_new='rejected'; end if;
 if p_action in ('request_changes','reject') and nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'NOTE_REQUIRED'; end if;
 update public.merch_products set status=v_new,admin_note=nullif(trim(coalesce(p_note,'')),''),published_at=case when v_new='published' then now() else published_at end where id=p_product_id;
 insert into public.notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,title,body) values((select user_id from public.artists where id=v_creator),auth.uid(),'merch_review','merch_product',p_product_id,case when v_new='published' then 'Merch approved' when v_new='changes_requested' then 'Changes requested' else 'Merch rejected' end,coalesce(nullif(trim(p_note),''),'Your merchandise submission was reviewed.'));
 return jsonb_build_object('ok',true,'product_id',p_product_id,'previous_status',v_status,'status',v_new,'reviewed_by',auth.uid());
end $function$;
create or replace function public.tgg_admin_review_promotion(p_campaign_id uuid,p_action text,p_note text default null::text) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_admin uuid; v_creator uuid; v_old text; v_new text;
begin
 v_admin:=auth.uid(); if v_admin is null then raise exception 'AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.profiles where id=v_admin and role='admin') then raise exception 'ADMIN_REQUIRED'; end if;
 select creator_id,status into v_creator,v_old from public.promotion_campaigns where id=p_campaign_id for update;
 if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
 if v_old <> 'pending' then raise exception 'INVALID_STATUS'; end if;
 if p_action='approve' then v_new='approved'; elsif p_action='reject' then if nullif(trim(p_note),'') is null then raise exception 'NOTE_REQUIRED'; end if; v_new='rejected'; elsif p_action='request_changes' then if nullif(trim(p_note),'') is null then raise exception 'NOTE_REQUIRED'; end if; v_new='draft'; else raise exception 'INVALID_ACTION'; end if;
 update public.promotion_campaigns set status=v_new,admin_note=case when p_action='approve' then null else trim(p_note) end,updated_at=now() where id=p_campaign_id;
 insert into public.notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,title,body) values(v_creator,v_admin,'promotion_review','promotion_campaign',p_campaign_id,'Promotion review update','Your promotion campaign was reviewed: '||v_new||case when nullif(trim(p_note),'') is not null then ' — '||trim(p_note) else '' end);
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'status',v_new,'reviewed_by',v_admin);
end $function$;
alter function public.tgg_admin_review_video(uuid,text,text) set search_path = '';
alter function public.tgg_admin_review_mixtape(uuid,text,text) set search_path = '';

-- ============================================================
-- MIGRATION 20260903093630 harden_final_submit_functions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_submit_merch(p_product_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_creator uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select a.id,mp.status into v_creator,v_status from public.merch_products mp join public.artists a on a.id=mp.creator_id where mp.id=p_product_id and a.user_id=auth.uid() for update;
 if v_creator is null then raise exception 'MERCH_NOT_FOUND_OR_NOT_OWNER'; end if;
 if v_status not in ('draft','changes_requested') then raise exception 'INVALID_STATUS'; end if;
 update public.merch_products set status='pending',admin_note=null where id=p_product_id;
 return jsonb_build_object('ok',true,'product_id',p_product_id,'status','pending');
end $function$;
create or replace function public.tgg_submit_promotion(p_campaign_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_creator uuid; v_status text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select a.id into v_creator from public.artists a where a.user_id=auth.uid();
 if v_creator is null then raise exception 'CREATOR_PROFILE_REQUIRED'; end if;
 select status into v_status from public.promotion_campaigns where id=p_campaign_id and creator_id=v_creator for update;
 if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
 if v_status not in ('draft','rejected') then raise exception 'INVALID_STATUS'; end if;
 update public.promotion_campaigns set status='pending',admin_note=null,updated_at=now() where id=p_campaign_id;
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'status','pending');
end $function$;

-- ============================================================
-- MIGRATION 20260903093717 v122_harden_public_mixtape_definers
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.tgg_public_mixtape_catalog() from public;
revoke execute on function public.tgg_public_mixtape_detail(uuid) from public;
grant execute on function public.tgg_public_mixtape_catalog() to anon, authenticated;
grant execute on function public.tgg_public_mixtape_detail(uuid) to anon, authenticated;

alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;


-- ============================================================
-- MIGRATION 20260903094055 v122_integrity_fk_indexes_and_breach_audit_lockdown
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create index if not exists creator_conversations_created_by_idx on public.creator_conversations (created_by);
create index if not exists creator_messages_sender_id_idx on public.creator_messages (sender_id);
create index if not exists v98_blogger_backups_user_id_idx on public.v98_blogger_backups (user_id);
create index if not exists v98_blogger_deployments_backup_id_idx on public.v98_blogger_deployments (backup_id);
create index if not exists v98_blogger_deployments_user_id_idx on public.v98_blogger_deployments (user_id);

drop policy if exists "deny_api_access_password_breach_audit" on public.tgg_password_breach_checks;
create policy "deny_api_access_password_breach_audit" on public.tgg_password_breach_checks as restrictive for all to anon, authenticated using (false) with check (false);

-- ============================================================
-- MIGRATION 20260903094414 v58_secure_recalculate_and_staging_runner
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_recalculate_run(p_run_id uuid)
returns public.v58_workflow_runs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run public.v58_workflow_runs;
  v_total integer;
  v_done integer;
  v_errors integer;
  v_current text;
  v_status text;
  v_blocking boolean;
  v_progress numeric(5,2);
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_run from public.v58_workflow_runs where id = p_run_id for update;
  if not found then raise exception 'workflow_run_not_found'; end if;
  if v_run.creator_id <> v_uid and auth.role() <> 'service_role' then raise exception 'workflow_run_not_found_or_not_owned'; end if;

  select count(*) into v_total
  from public.v58_workflow_steps where workflow_run_id = p_run_id and required = true;

  select count(*) into v_done
  from public.v58_workflow_steps where workflow_run_id = p_run_id and required = true and status in ('completed','skipped');

  select count(*) into v_errors
  from public.v58_workflow_steps where workflow_run_id = p_run_id and status in ('failed','blocked');

  select key into v_current
  from public.v58_workflow_steps
  where workflow_run_id = p_run_id and status in ('running','retrying','blocked')
  order by sequence limit 1;

  select exists (
    select 1 from public.v58_required_actions a
    where a.workflow_run_id = p_run_id and a.resolved = false and a.blocks_launch = true
  ) into v_blocking;

  v_progress := case when v_total = 0 then 0 else round((v_done::numeric / v_total::numeric) * 100, 2) end;

  if v_run.status in ('cancelled','failed') then v_status := v_run.status;
  elsif v_done = v_total and v_total > 0 then v_status := 'completed';
  elsif v_errors > 0 or v_blocking then v_status := 'blocked';
  elsif v_run.started_at is not null then v_status := 'running';
  else v_status := 'pending'; end if;

  update public.v58_workflow_runs
  set status=v_status, progress=v_progress, total_steps=v_total, completed_steps=v_done,
      current_step=v_current, errors=v_errors,
      completed_at=case when v_status='completed' then coalesce(completed_at,now()) else completed_at end,
      updated_at=now()
  where id=p_run_id returning * into v_run;
  return v_run;
end;
$function$;

alter function public.v58_staging_run_full_e2e() set search_path = '';

-- ============================================================
-- MIGRATION 20260903095009 harden_distribution_reconcile_and_finalize_20260903
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop function if exists public.v58_reconcile_sandbox_distribution_task(uuid);
create function public.v58_reconcile_sandbox_distribution_task(p_task_id uuid)
returns public.v58_provider_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare v_task public.v58_provider_tasks;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_task from public.v58_provider_tasks where id=p_task_id for update;
  if not found then raise exception 'Provider task not found'; end if;
  if v_task.provider_key <> 'distribution.webhook' or v_task.capability <> 'distribution' or v_task.operation <> 'release_publish' then raise exception 'Invalid distribution task contract'; end if;
  if v_task.status = 'completed' then return v_task; end if;
  if v_task.status not in ('queued','pending','retrying','claimed','processing') then raise exception 'Distribution task not runnable'; end if;
  update public.v58_provider_tasks set status='processing',claimed_at=coalesce(claimed_at,now()),attempt=case when status in ('queued','pending','retrying') then attempt+1 else attempt end,updated_at=now() where id=p_task_id returning * into v_task;
  return v_task;
end;
$$;
revoke execute on function public.v58_reconcile_sandbox_distribution_task(uuid) from public, anon, authenticated;
grant execute on function public.v58_reconcile_sandbox_distribution_task(uuid) to service_role;

create or replace function public.v58_distribution_finalize_sandbox(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare t public.v58_provider_tasks; r boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into t from public.v58_provider_tasks where id=p_task_id for update;
  if not found then raise exception 'Provider task not found'; end if;
  if t.provider_key <> 'distribution.webhook' or t.operation <> 'release_publish' then raise exception 'Invalid distribution task contract'; end if;
  if t.status not in ('processing','claimed') then return t.status='completed'; end if;
  r := public.v58_complete_provider_task(p_task_id,jsonb_build_object('delivered',true,'delivery_confirmed',true,'mode','sandbox','external_reference','V58-SANDBOX-'||p_task_id::text), 'V58-SANDBOX-'||p_task_id::text);
  return coalesce(r,false);
end;
$$;
revoke execute on function public.v58_distribution_finalize_sandbox(uuid) from public, anon, authenticated;
grant execute on function public.v58_distribution_finalize_sandbox(uuid) to service_role;

-- ============================================================
-- MIGRATION 20260903095649 v58_fix_distribution_processing_recovery
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_reconcile_sandbox_distribution_task(p_task_id uuid)
returns public.v58_provider_tasks
language plpgsql
security definer
set search_path = ''
as $function$
declare v_task public.v58_provider_tasks;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into v_task from public.v58_provider_tasks where id=p_task_id for update;
  if not found then raise exception 'Provider task not found'; end if;
  if v_task.provider_key <> 'distribution.webhook' or v_task.capability <> 'distribution' or v_task.operation <> 'release_publish' then raise exception 'Invalid distribution task contract'; end if;
  if v_task.status = 'completed' then return v_task; end if;
  if v_task.status not in ('queued','pending','retrying','claimed','processing') then raise exception 'Distribution task not runnable'; end if;
  update public.v58_provider_tasks
    set status='processing',
        claimed_at=coalesce(claimed_at,now()),
        attempt=case when status in ('queued','pending','retrying') then attempt+1 else attempt end,
        updated_at=now()
    where id=p_task_id
    returning * into v_task;
  return v_task;
end;
$function$;

create or replace function public.v58_distribution_finalize_sandbox(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare t public.v58_provider_tasks; r boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into t from public.v58_provider_tasks where id=p_task_id for update;
  if not found then raise exception 'Provider task not found'; end if;
  if t.provider_key <> 'distribution.webhook' or t.capability <> 'distribution' or t.operation <> 'release_publish' then raise exception 'Invalid distribution task contract'; end if;
  if t.status not in ('processing','claimed') then return t.status='completed'; end if;
  r := public.v58_complete_provider_task(p_task_id,jsonb_build_object('delivered',true,'delivery_confirmed',true,'mode','sandbox','external_reference','V58-SANDBOX-'||p_task_id::text), 'V58-SANDBOX-'||p_task_id::text);
  return coalesce(r,false);
end;
$function$;

revoke execute on function public.v58_reconcile_sandbox_distribution_task(uuid) from public, anon, authenticated;
revoke execute on function public.v58_distribution_finalize_sandbox(uuid) from public, anon, authenticated;

-- ============================================================
-- MIGRATION 20260903100752 v58_sandbox_distribution_cron_recovery
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE OR REPLACE FUNCTION public.v58_distribution_finalize_sandbox(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  t public.v58_provider_tasks;
  v_result jsonb;
  v_external text;
begin
  if auth.role() <> 'service_role' and current_user <> 'postgres' then
    raise exception 'Service role required';
  end if;
  select * into t from public.v58_provider_tasks where id=p_task_id for update;
  if not found then raise exception 'Provider task not found'; end if;
  if t.provider_key <> 'distribution.webhook' or t.capability <> 'distribution' or t.operation <> 'release_publish' then
    raise exception 'Invalid distribution task contract';
  end if;
  if t.status not in ('claimed','processing','retrying','queued') then
    return t.status='completed';
  end if;
  v_external := 'V58-SANDBOX-'||t.id::text;
  v_result := jsonb_build_object('delivered',true,'delivery_confirmed',true,'mode','sandbox','external_reference',v_external,'release_id',t.payload->>'release_id','provider_task_id',t.id::text);
  return public.v58_complete_provider_task(t.id,v_result,v_external);
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.v58_distribution_finalize_sandbox(uuid) FROM PUBLIC, anon, authenticated;
DO $outer$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='v58-sandbox-distribution-recovery') THEN
    PERFORM cron.schedule('v58-sandbox-distribution-recovery','* * * * *',$job$select public.v58_distribution_finalize_sandbox(id) from public.v58_provider_tasks where provider_key='distribution.webhook' and capability='distribution' and operation='release_publish' and status in ('queued','retrying','claimed','processing') and updated_at < now()-interval '90 seconds';$job$);
  END IF;
END
$outer$;

-- ============================================================
-- MIGRATION 20260903100824 v58_internal_cron_provider_completion
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE OR REPLACE FUNCTION public.v58_complete_provider_task(p_task_id uuid,p_result jsonb DEFAULT '{}'::jsonb,p_external_reference text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare t public.v58_provider_tasks;
begin
 if auth.role() <> 'service_role' and current_user <> 'postgres' then raise exception 'Service role required'; end if;
 select * into t from public.v58_provider_tasks where id=p_task_id for update;
 if not found then raise exception 'Provider task not found'; end if;
 if t.provider_key='distribution.webhook' and t.operation='release_publish' then
   if coalesce(p_result->>'delivered','false') <> 'true' then raise exception 'Distribution task cannot complete without delivered=true'; end if;
 end if;
 if t.status not in ('claimed','processing') then return false; end if;
 update public.v58_provider_tasks set status='completed',result=coalesce(p_result,'{}'::jsonb),external_reference=p_external_reference,completed_at=now(),updated_at=now() where id=p_task_id;
 update public.v58_provider_jobs set status='completed',attempt=t.attempt,max_attempts=t.max_attempts,external_id=p_external_reference,payload=payload || jsonb_build_object('v58_provider_task_id',p_task_id::text),updated_at=now() where payload->>'v58_provider_task_id'=p_task_id::text;
 if t.workflow_step_id is not null then
   update public.v58_workflow_steps set status='completed',progress=100,detail='Distribution provider task completed.',error_message=null,completed_at=now(),updated_at=now() where id=t.workflow_step_id and status in ('running','retrying','blocked');
   perform public.v58_emit_event(t.workflow_run_id,t.workflow_step_id,'provider.completed',coalesce(t.provider_key,'Provider')||' task complete',coalesce(t.provider_key,'Provider')||' operation completed successfully.','success','provider_task',p_task_id::text,coalesce(p_result,'{}'::jsonb),'provider-completed-'||p_task_id::text);
   update public.v58_workflow_runs set updated_at=now() where id=t.workflow_run_id;
   perform public.v58_advance_workflow_service(t.workflow_run_id);
 end if;
 return true;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.v58_complete_provider_task(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- MIGRATION 20260903100850 v58_internal_cron_workflow_recovery_auth
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE OR REPLACE FUNCTION public.v58_recalculate_run(p_run_id uuid)
RETURNS public.v58_workflow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_run public.v58_workflow_runs; v_total int; v_done int; v_errors int; v_current text;
begin
 if auth.uid() is null and current_user <> 'postgres' then raise exception 'authentication_required'; end if;
 select * into v_run from public.v58_workflow_runs where id=p_run_id for update; if not found then raise exception 'Workflow run not found'; end if;
 if current_user <> 'postgres' and auth.uid() <> v_run.creator_id and auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
 select count(*) into v_total from public.v58_workflow_steps where workflow_run_id=p_run_id and required=true;
 select count(*) into v_done from public.v58_workflow_steps where workflow_run_id=p_run_id and required=true and status in ('completed','skipped');
 select count(*) into v_errors from public.v58_workflow_steps where workflow_run_id=p_run_id and status='failed';
 select key into v_current from public.v58_workflow_steps where workflow_run_id=p_run_id and status in ('running','retrying','blocked') order by sequence limit 1;
 update public.v58_workflow_runs set completed_steps=v_done,total_steps=v_total,progress=case when v_total=0 then 0 else round((v_done::numeric/v_total::numeric)*100,2) end,current_step=v_current,errors=v_errors,status=case when v_total>0 and v_done=v_total then 'completed' else 'running' end,completed_at=case when v_total>0 and v_done=v_total then coalesce(completed_at,now()) else null end,updated_at=now() where id=p_run_id returning * into v_run;
 return v_run;
end;
$function$;
CREATE OR REPLACE FUNCTION public.v58_advance_workflow_service(p_run_id uuid)
RETURNS public.v58_workflow_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_run public.v58_workflow_runs; s public.v58_workflow_steps; v_dep_blocked boolean; v_action_id uuid;
begin
 if auth.role() <> 'service_role' and current_user <> 'postgres' then raise exception 'Service role required'; end if;
 select * into v_run from public.v58_workflow_runs where id=p_run_id for update; if not found then raise exception 'Workflow run not found'; end if;
 for s in select * from public.v58_workflow_steps where workflow_run_id=p_run_id and status='pending' order by sequence loop
   select exists(select 1 from unnest(s.depends_on) dep left join public.v58_workflow_steps ds on ds.workflow_run_id=s.workflow_run_id and ds.key=dep where ds.id is null or ds.status not in ('completed','skipped')) into v_dep_blocked;
   if v_dep_blocked then continue; end if;
   update public.v58_workflow_steps set status='running',attempts=attempts+1,started_at=coalesce(started_at,now()),progress=case when type in ('validation','automation','gate') then 5 else progress end,updated_at=now() where id=s.id;
   perform public.v58_emit_event(s.workflow_run_id,s.id,'workflow.step.started',coalesce(s.title,s.key)||' started',coalesce(s.title,s.key)||' started','info','workflow_step',s.id::text,'{}'::jsonb,'step-started-'||s.id::text);
   if s.type='approval' then
     insert into public.v58_required_actions(workflow_run_id,workflow_step_id,action_type,status,created_at,updated_at) values(s.workflow_run_id,s.id,'approval','pending',now(),now()) on conflict do nothing returning id into v_action_id;
     update public.v58_workflow_steps set status='blocked',detail='Waiting for creator approval.',updated_at=now() where id=s.id;
   elsif s.key='monetization' then perform public.v58_enqueue_stripe_monetization_task(s.id);
   elsif s.key='distribution' then perform public.v58_enqueue_distribution_task(s.id);
   else perform public.v58_queue_step_task(s.id);
   end if;
 end loop;
 return public.v58_recalculate_run(p_run_id);
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.v58_recalculate_run(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.v58_advance_workflow_service(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- MIGRATION 20260903101620 v84_harden_v58_release_config_and_preflight_ownership
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_set_release_stripe_checkout_config(p_release_id text, p_stripe_price_id text, p_success_url text, p_cancel_url text, p_quantity integer default 1, p_mode text default 'payment'::text, p_stripe_account_id text default null::text, p_metadata jsonb default '{}'::jsonb)
returns public.v58_release_stripe_checkout_config
language plpgsql
security definer
set search_path = ''
as $function$
declare v_row public.v58_release_stripe_checkout_config;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_release_id),'') is null then raise exception 'release_id is required'; end if;
  if nullif(trim(p_stripe_price_id),'') is null then raise exception 'stripe_price_id is required'; end if;
  if nullif(trim(p_success_url),'') is null or nullif(trim(p_cancel_url),'') is null then raise exception 'success_url and cancel_url are required'; end if;
  if p_quantity < 1 then raise exception 'quantity must be positive'; end if;
  if p_mode not in ('payment','subscription','setup') then raise exception 'Unsupported Stripe Checkout mode'; end if;
  if not exists (
    select 1 from public.mixtapes m
    join public.artists a on a.id=m.artist_id
    where m.id::text=trim(p_release_id) and a.user_id=auth.uid()
  ) then raise exception 'Release not owned by authenticated creator'; end if;
  insert into public.v58_release_stripe_checkout_config(
    creator_id,release_id,stripe_price_id,quantity,mode,success_url,cancel_url,
    stripe_account_id,metadata,enabled
  ) values (
    auth.uid(),trim(p_release_id),trim(p_stripe_price_id),p_quantity,p_mode,trim(p_success_url),trim(p_cancel_url),
    nullif(trim(p_stripe_account_id),''),coalesce(p_metadata,'{}'::jsonb),true
  )
  on conflict (creator_id,release_id) do update set
    stripe_price_id=excluded.stripe_price_id, quantity=excluded.quantity, mode=excluded.mode,
    success_url=excluded.success_url, cancel_url=excluded.cancel_url,
    stripe_account_id=excluded.stripe_account_id, metadata=excluded.metadata,
    enabled=true, updated_at=now()
  returning * into v_row;
  return v_row;
end;
$function$;

create or replace function public.v58_launch_control_preflight_service(p_release_id text, p_creator_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_release uuid; v_title text; v_status text; v_release_date timestamptz; v_cover_url text;
  v_track_count integer := 0; v_missing_audio integer := 0; v_missing text[] := array[]::text[];
begin
  if p_creator_id is null then return jsonb_build_object('ok',false,'code','CREATOR_REQUIRED'); end if;
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() is distinct from p_creator_id) then
    raise exception 'Not authorized';
  end if;
  begin v_release:=p_release_id::uuid; exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_RELEASE_ID'); end;
  select m.id,m.title,m.status::text,m.release_date,m.cover_url into v_release,v_title,v_status,v_release_date,v_cover_url
  from public.mixtapes m join public.artists a on a.id=m.artist_id
  where m.id=v_release and a.user_id=p_creator_id limit 1;
  if v_release is null then return jsonb_build_object('ok',false,'code','RELEASE_NOT_OWNED'); end if;
  select count(*)::integer,count(*) filter(where coalesce(nullif(trim(t.audio_url),''),'')='')::integer into v_track_count,v_missing_audio
  from public.tracks t where t.mixtape_id=v_release;
  if v_status<>'published' then v_missing:=array_append(v_missing,'Release must be published.'); end if;
  if v_release_date is null then v_missing:=array_append(v_missing,'Set a release date / launch schedule.'); end if;
  if coalesce(nullif(trim(v_cover_url),''),'')='' then v_missing:=array_append(v_missing,'Add cover artwork.'); end if;
  if v_track_count=0 then v_missing:=array_append(v_missing,'Add at least one track.'); elsif v_missing_audio>0 then v_missing:=array_append(v_missing,format('%s track(s) are missing audio URLs.',v_missing_audio)); end if;
  return jsonb_build_object('ok',cardinality(v_missing)=0,'release_id',v_release::text,'title',v_title,'status',v_status,'release_date',v_release_date,'track_count',v_track_count,'missing_audio_tracks',v_missing_audio,'missing',to_jsonb(v_missing),'checks',jsonb_build_object('authenticated',true,'owned',true,'published',v_status='published','release_date',v_release_date is not null,'cover_art',coalesce(nullif(trim(v_cover_url),''),'')<>'','track_count',v_track_count,'tracks_have_audio',v_track_count>0 and v_missing_audio=0));
end;
$function$;

alter function public.v58_set_release_stripe_checkout_config(text,text,text,text,integer,text,text,jsonb) set search_path = '';
alter function public.v58_launch_control_preflight_service(text,uuid) set search_path = '';


-- ============================================================
-- MIGRATION 20260903101857 v84_security_definer_api_lockdown
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;
-- Public catalog/detail are intentionally public read APIs; keep them executable by anon/authenticated.
-- All admin/workflow/provider mutation and internal helper SECURITY DEFINER RPCs are restricted to service_role.
revoke execute on function public.artist_owns_mixtape(uuid) from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.tgg_admin_review_merch(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.tgg_admin_review_mixtape(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.tgg_admin_review_promotion(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.tgg_admin_review_video(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.tgg_submit_merch(uuid) from public, anon, authenticated;
revoke execute on function public.tgg_submit_mixtape(uuid) from public, anon, authenticated;
revoke execute on function public.tgg_submit_promotion(uuid) from public, anon, authenticated;
revoke execute on function public.tgg_submit_video(uuid) from public, anon, authenticated;
revoke execute on function public.v58_advance_workflow(uuid) from public, anon, authenticated;
revoke execute on function public.v58_block_step(uuid,text,text,text) from public, anon, authenticated;
revoke execute on function public.v58_complete_step(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.v58_create_release_launch_workflow(text) from public, anon, authenticated;
revoke execute on function public.v58_dispatch_workflow_step(uuid,text) from public, anon, authenticated;
revoke execute on function public.v58_e2e_create_release_launch_rehearsal(text) from public, anon, authenticated;
revoke execute on function public.v58_e2e_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) from public, anon, authenticated;
revoke execute on function public.v58_get_release_launch_state(uuid) from public, anon, authenticated;
revoke execute on function public.v58_get_release_stripe_checkout_config(text) from public, anon, authenticated;
revoke execute on function public.v58_launch_control_health() from public, anon, authenticated;
revoke execute on function public.v58_launch_control_preflight_service(text,uuid) from public, anon, authenticated;
revoke execute on function public.v58_launch_control_releases() from public, anon, authenticated;
revoke execute on function public.v58_launch_control_start(text) from public, anon, authenticated;
revoke execute on function public.v58_launch_control_status() from public, anon, authenticated;
revoke execute on function public.v58_launch_release(text) from public, anon, authenticated;
revoke execute on function public.v58_provider_ops_cancel_task(uuid) from public, anon, authenticated;
revoke execute on function public.v58_provider_ops_retry_task(uuid) from public, anon, authenticated;
revoke execute on function public.v58_provider_ops_summary() from public, anon, authenticated;
revoke execute on function public.v58_queue_step_task(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.v58_repair_and_retry(uuid) from public, anon, authenticated;
revoke execute on function public.v58_resolve_action(uuid,text) from public, anon, authenticated;
revoke execute on function public.v58_set_distribution_config(text,text) from public, anon, authenticated;
revoke execute on function public.v58_set_promotion_approval(text,boolean) from public, anon, authenticated;
revoke execute on function public.v58_set_release_stripe_checkout_config(text,text,text,text,integer,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.v58_start_workflow(uuid) from public, anon, authenticated;
revoke execute on function public.v59_reconcile_provider_operations(uuid,text) from public, anon, authenticated;
revoke execute on function public.v59_record_provider_event(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.v54_authorize_action(uuid) from public, anon, authenticated;
revoke execute on function public.v54_create_my_creator_workspace(text,text,text) from public, anon, authenticated;
revoke execute on function public.v54_mark_action_executed(uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.v54_request_action(uuid,jsonb) from public, anon, authenticated;
revoke execute on function public.v54_system_health() from public, anon, authenticated;
-- Explicitly restore only the intended public catalog surface.
grant execute on function public.tgg_public_mixtape_catalog() to anon, authenticated;
grant execute on function public.tgg_public_mixtape_detail(uuid) to anon, authenticated;
commit;

-- ============================================================
-- MIGRATION 20260903102131 v84_remove_redundant_duplicate_indexes
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop index if exists public.provider_operation_events_operation_idx;
drop index if exists public.provider_operations_state_idx;
drop index if exists public.v58_provider_jobs_task_ref_uidx;
drop index if exists public.idx_artists_user_id;
drop index if exists public.profiles_id_fkey_idx;
drop index if exists public.live_streams_content_id_fkey_idx;
drop index if exists public.idx_reels_content;
drop index if exists public.stories_content_id_fkey_idx;


-- ============================================================
-- MIGRATION 20260903102555 v84_fix_creator_conversation_member_rls_scope
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists ccm_member_select on public.creator_conversation_members;
create policy ccm_member_select
on public.creator_conversation_members
for select
to authenticated
using (
  (user_id = (select auth.uid()))
  or exists (
    select 1
    from public.creator_conversation_members m2
    where m2.conversation_id = creator_conversation_members.conversation_id
      and m2.user_id = (select auth.uid())
  )
);

-- ============================================================
-- MIGRATION 20260903102726 v84_rls_auth_uid_initplan_hardening_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare r record; u text; c text; stmt text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname='public'
      and ((qual is not null and qual ~ 'auth\\.uid\\(\\)' and qual !~ 'SELECT auth\\.uid')
        or (with_check is not null and with_check ~ 'auth\\.uid\\(\\)' and with_check !~ 'SELECT auth\\.uid'))
  loop
    u := case when r.qual is not null then regexp_replace(r.qual, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g') end;
    c := case when r.with_check is not null then regexp_replace(r.with_check, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g') end;
    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if u is not null then stmt := stmt || format(' using (%s)', u); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;
end $$;

-- ============================================================
-- MIGRATION 20260903102804 v84_rls_auth_uid_initplan_hardening_v3
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare r record; u text; c text; stmt text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname='public'
      and ((qual is not null and qual like '%auth.uid()%' and lower(qual) not like '%select auth.uid()%')
        or (with_check is not null and with_check like '%auth.uid()%' and lower(with_check) not like '%select auth.uid()%'))
  loop
    u := case when r.qual is not null then replace(r.qual, 'auth.uid()', '(select auth.uid())') end;
    c := case when r.with_check is not null then replace(r.with_check, 'auth.uid()', '(select auth.uid())') end;
    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if u is not null then stmt := stmt || format(' using (%s)', u); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;
end $$;

-- ============================================================
-- MIGRATION 20260903103653 v84_cancel_orphaned_provider_tasks
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v84_cancel_orphaned_provider_tasks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'Internal execution only';
  end if;
  update public.v58_provider_tasks t
  set status='cancelled', updated_at=now()
  where t.status in ('queued','retrying')
    and exists (
      select 1
      from public.v58_workflow_steps s
      join public.v58_workflow_runs w on w.id=s.workflow_run_id
      where s.id=t.workflow_step_id
        and w.status in ('completed','blocked','failed','cancelled')
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.v84_cancel_orphaned_provider_tasks() from public, anon, authenticated;
grant execute on function public.v84_cancel_orphaned_provider_tasks() to postgres;

-- ============================================================
-- MIGRATION 20260903104305 v84_default_privileges_hardening_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- V84: make newly-created public objects opt-in for API access.
-- Existing object grants are intentionally untouched; public/authenticated access remains
-- explicitly granted where the application needs it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- Supabase projects can have platform-owned defaults as well. If the executing role
-- has authority over that role's defaults, harden those too; otherwise the migration
-- remains successful without changing existing access.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

-- ============================================================
-- MIGRATION 20260903104333 v84_launch_control_trigger_canonical_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE OR REPLACE FUNCTION public.v58_launch_control_start(p_release_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_run public.v58_workflow_runs;
  v_preflight jsonb;
  v_distribution_ok boolean;
  v_promotion_ok boolean;
  v_stripe_ok boolean;
  v_trigger_request bigint;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  v_preflight := public.v58_launch_control_preflight(trim(p_release_id));
  if coalesce((v_preflight->>'ok')::boolean,false)=false then raise exception 'release_preflight_failed'; end if;
  if not exists(select 1 from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id::text=trim(p_release_id) and a.user_id=v_uid) then raise exception 'release_not_owned'; end if;
  v_distribution_ok := exists(select 1 from public.v58_release_distribution_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.endpoint_url),'') is not null);
  v_promotion_ok := exists(select 1 from public.v58_release_promotion_approvals p where p.creator_id=v_uid and p.release_id=trim(p_release_id) and p.approved=true);
  v_stripe_ok := exists(select 1 from public.v58_release_stripe_checkout_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.stripe_price_id),'') is not null and nullif(trim(c.success_url),'') is not null and nullif(trim(c.cancel_url),'') is not null);
  if not v_distribution_ok then raise exception 'distribution_endpoint_required'; end if;
  if not v_promotion_ok then raise exception 'promotion_approval_required'; end if;
  if not v_stripe_ok then raise exception 'stripe_checkout_configuration_required'; end if;
  select id into v_run_id from public.v58_workflow_runs where creator_id=v_uid and release_id=trim(p_release_id) and workflow_key='release_launch' and workflow_version=58 and status in ('pending','running') order by created_at desc limit 1;
  if v_run_id is null then v_run_id := public.v58_create_release_launch_workflow(trim(p_release_id)); end if;
  update public.v58_workflow_runs set status='running',started_at=coalesce(started_at,now()),current_step='validate_release',updated_at=now() where id=v_run_id;
  perform public.v58_dispatch_workflow_step(v_run_id,'validate_release');
  select net.http_get(url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-orchestrator-trigger-v16?nonce=v58-once-9f2c7a41e6b8d3',params := '{}'::jsonb,headers := jsonb_build_object('Content-Type','application/json'),timeout_milliseconds := 5000) into v_trigger_request;
  select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;
  return jsonb_build_object('ok',true,'run_id',v_run.id,'status',v_run.status,'progress',v_run.progress,'completed_steps',v_run.completed_steps,'total_steps',v_run.total_steps,'current_step',v_run.current_step,'errors',v_run.errors,'orchestrator_triggered',true,'trigger_request_id',v_trigger_request);
end;
$function$;

-- ============================================================
-- MIGRATION 20260903104526 v84_public_function_grant_hardening_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_video_merch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tgg_media_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.v54_check_rpcs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.v54_check_tables() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.v54_required_tables() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_content_owner() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.tgg_public_mixtape_catalog() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_public_mixtape_detail(uuid) TO anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND p.prosecdef=false
      AND p.proname IN ('set_updated_at','set_video_merch_updated_at','tgg_media_set_updated_at','v54_check_rpcs','v54_check_tables','v54_required_tables','validate_content_owner')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
  END LOOP;
END $$;

-- ============================================================
-- MIGRATION 20260903105441 v84_rls_policy_dedup_hardening_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists "mixtapes admin update" on public.mixtapes;
drop policy if exists "mixtapes artist update" on public.mixtapes;
drop policy if exists "v58_payments_select_own" on public.v58_payments;

-- Keep the canonical policies whose semantics already cover these paths:
-- mixtapes: "Admins can update mixtapes" covers admin updates; "artists can edit their own mixtapes" covers creator updates.
-- v58_payments: "v58 payments creator read" is the authenticated creator policy.

comment on policy "Admins can update mixtapes" on public.mixtapes is 'Canonical admin update policy; redundant duplicate policy removed by v84_rls_policy_dedup_hardening_v1.';
comment on policy "artists can edit their own mixtapes" on public.mixtapes is 'Canonical creator update policy; redundant duplicate policy removed by v84_rls_policy_dedup_hardening_v1.';
comment on policy "v58 payments creator read" on public.v58_payments is 'Canonical authenticated creator read policy; redundant public-role duplicate removed by v84_rls_policy_dedup_hardening_v1.';

-- ============================================================
-- MIGRATION 20260903105657 v84_rls_role_scope_hardening_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Tighten creator-write policies that require auth.uid() from PUBLIC to authenticated.
-- This preserves authenticated behavior while eliminating needless anon evaluation.

drop policy if exists "Users can delete own content" on public.content_items;
create policy "Users can delete own content" on public.content_items for delete to authenticated using (creator_id = (select auth.uid()));

drop policy if exists "Users can create own content" on public.content_items;
create policy "Users can create own content" on public.content_items for insert to authenticated with check (creator_id = (select auth.uid()));

drop policy if exists "Users can update own content" on public.content_items;
create policy "Users can update own content" on public.content_items for update to authenticated using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));

drop policy if exists "Creators can delete live streams" on public.live_streams;
create policy "Creators can delete live streams" on public.live_streams for delete to authenticated using (creator_id = (select auth.uid()));

drop policy if exists "Creators can create live streams" on public.live_streams;
create policy "Creators can create live streams" on public.live_streams for insert to authenticated with check (creator_id = (select auth.uid()));

drop policy if exists "Creators can update live streams" on public.live_streams;
create policy "Creators can update live streams" on public.live_streams for update to authenticated using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));

drop policy if exists "Creators can delete reels" on public.reels;
create policy "Creators can delete reels" on public.reels for delete to authenticated using (creator_id = (select auth.uid()));

drop policy if exists "Creators can create reels" on public.reels;
create policy "Creators can create reels" on public.reels for insert to authenticated with check (creator_id = (select auth.uid()));

drop policy if exists "Creators can update reels" on public.reels;
create policy "Creators can update reels" on public.reels for update to authenticated using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));

drop policy if exists "Creators can delete stories" on public.stories;
create policy "Creators can delete stories" on public.stories for delete to authenticated using (creator_id = (select auth.uid()));

drop policy if exists "Creators can create stories" on public.stories;
create policy "Creators can create stories" on public.stories for insert to authenticated with check (creator_id = (select auth.uid()));

drop policy if exists "Creators can update stories" on public.stories;
create policy "Creators can update stories" on public.stories for update to authenticated using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));

drop policy if exists "Users can delete own reel comments" on public.reel_comments;
create policy "Users can delete own reel comments" on public.reel_comments for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can create reel comments" on public.reel_comments;
create policy "Users can create reel comments" on public.reel_comments for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Users can update own reel comments" on public.reel_comments;
create policy "Users can update own reel comments" on public.reel_comments for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============================================================
-- MIGRATION 20260903105825 v84_rls_policy_performance_hardening_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Consolidate only the Advisor-confirmed overlapping permissive policies.
-- Preserve public-read behavior and authenticated creator/admin access.

-- Public-read policies already cover anon + authenticated; admin/creator policies
-- only need to apply to authenticated users.
alter policy "Public can view live moderators" on public.live_stream_moderators to anon, authenticated;
alter policy "Creators can manage live moderators" on public.live_stream_moderators to authenticated;
alter policy "Public can view reel tracks" on public.reel_tracks to anon, authenticated;
alter policy "Creators can manage reel tracks" on public.reel_tracks to authenticated;

-- Separate public-read from creator/admin access by restricting public-read
-- policies to anon. This removes the duplicated authenticated SELECT evaluation
-- while preserving authenticated users' access through their creator policies.
alter policy "public read published interviews" on public.artist_interviews to anon;
alter policy "artists public read" on public.artists to anon;
alter policy "public read published videos" on public.site_videos to anon;
alter policy "merch_variants_public_select" on public.merch_product_variants to anon;
alter policy "merch_products_public_select" on public.merch_products to anon;
alter policy "Public can view images of published products" on public.product_images to anon;
alter policy "Public can view variants of published products" on public.product_variants to anon;
alter policy "Public can view published products" on public.products to anon;
alter policy "Public can view published videos" on public.videos to anon;

-- For tables whose authenticated users must see BOTH their own/private rows and
-- public rows, make the authenticated creator/admin policy explicitly include
-- the public condition. This preserves the prior union semantics in one policy.

drop policy if exists "Admins can view artists" on public.artists;
create policy "artists authenticated read" on public.artists
  for select to authenticated
  using (true);

-- The artists table is intentionally public-read; authenticated SELECT is now
-- covered by the single authenticated policy above.

drop policy if exists "Admins can view all mixtapes" on public.mixtapes;
drop policy if exists "mixtapes public read" on public.mixtapes;
create policy "mixtapes authenticated read" on public.mixtapes
  for select to authenticated
  using (
    (status = 'published'::mixtape_status)
    or exists (
      select 1 from public.artists a
      where a.id = mixtapes.artist_id
        and a.user_id = (select auth.uid())
    )
    or (select public.is_admin())
  );
create policy "mixtapes public read anon" on public.mixtapes
  for select to anon
  using (
    (status = 'published'::mixtape_status)
    or exists (
      select 1 from public.artists a
      where a.id = mixtapes.artist_id
        and a.user_id = (select auth.uid())
    )
  );

-- Keep the existing authenticated profile access semantics, but combine owner
-- and admin checks into one policy.
drop policy if exists "Admins can view profiles" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "profiles authenticated read" on public.profiles
  for select to authenticated
  using ((id = (select auth.uid())) or (select public.is_admin()));

-- Tracks: combine admin + artist-owned authenticated SELECT.
drop policy if exists "Admins can view tracks" on public.tracks;
drop policy if exists "tracks artist read own" on public.tracks;
create policy "tracks authenticated read" on public.tracks
  for select to authenticated
  using (
    (exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'::user_role
    ))
    or exists (
      select 1 from public.artists a
      where a.id = tracks.artist_id and a.user_id = (select auth.uid())
    )
  );

-- Video public-read + creator-read: authenticated creator policy now also grants
-- published public videos, eliminating the second permissive SELECT policy.
drop policy if exists "Artists can view their own videos" on public.videos;
drop policy if exists "Public can view published videos" on public.videos;
create policy "videos authenticated read" on public.videos
  for select to authenticated
  using (
    (status = 'published'::text and visibility = 'public'::text)
    or exists (
      select 1 from public.artists a
      where a.id = videos.artist_id and a.user_id = (select auth.uid())
    )
  );

-- Products: combine creator + public SELECT.
drop policy if exists "Artists can view their own products" on public.products;
drop policy if exists "Public can view published products" on public.products;
create policy "products authenticated read" on public.products
  for select to authenticated
  using (
    status = 'published'::text
    or exists (
      select 1 from public.artists a
      where a.id = products.artist_id and a.user_id = (select auth.uid())
    )
  );

-- Product variants: combine creator + public SELECT.
drop policy if exists "Artists can view their own product variants" on public.product_variants;
drop policy if exists "Public can view variants of published products" on public.product_variants;
create policy "product_variants authenticated read" on public.product_variants
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_variants.product_id
        and (
          p.status = 'published'::text
          or exists (
            select 1 from public.artists a
            where a.id = p.artist_id and a.user_id = (select auth.uid())
          )
        )
    )
  );

-- Product images: combine creator + public SELECT.
drop policy if exists "Artists can view their own product images" on public.product_images;
drop policy if exists "Public can view images of published products" on public.product_images;
create policy "product_images authenticated read" on public.product_images
  for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id
        and (
          p.status = 'published'::text
          or exists (
            select 1 from public.artists a
            where a.id = p.artist_id and a.user_id = (select auth.uid())
          )
        )
    )
  );

-- Merch variants: combine admin + creator + public SELECT; preserve all prior
-- creator write policies and admin ALL policy.
drop policy if exists "merch_variants_admin_all" on public.merch_product_variants;
drop policy if exists "merch_variants_creator_select" on public.merch_product_variants;
drop policy if exists "merch_variants_public_select" on public.merch_product_variants;
create policy "merch_variants_authenticated_read" on public.merch_product_variants
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1
      from public.merch_products mp
      join public.artists a on a.id = mp.creator_id
      where mp.id = merch_product_variants.product_id
        and (
          mp.status = 'published'::text
          or a.user_id = (select auth.uid())
        )
    )
  );
create policy "merch_variants_admin_write" on public.merch_product_variants
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "merch_variants_admin_update" on public.merch_product_variants
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "merch_variants_admin_delete" on public.merch_product_variants
  for delete to authenticated
  using ((select public.is_admin()));

-- Merch products: combine admin + creator + public SELECT; preserve creator writes.
drop policy if exists "merch_products_admin_all" on public.merch_products;
drop policy if exists "merch_products_creator_select" on public.merch_products;
drop policy if exists "merch_products_public_select" on public.merch_products;
create policy "merch_products_authenticated_read" on public.merch_products
  for select to authenticated
  using (
    (select public.is_admin())
    or status = 'published'::text
    or exists (
      select 1 from public.artists a
      where a.id = merch_products.creator_id and a.user_id = (select auth.uid())
    )
  );
create policy "merch_products_admin_insert" on public.merch_products for insert to authenticated with check ((select public.is_admin()));
create policy "merch_products_admin_update" on public.merch_products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "merch_products_admin_delete" on public.merch_products for delete to authenticated using ((select public.is_admin()));

-- Promotion campaigns: combine admin + creator access for authenticated users.
drop policy if exists "promotion_admin_all" on public.promotion_campaigns;
drop policy if exists "promotion_creator_select" on public.promotion_campaigns;
create policy "promotion_authenticated_select" on public.promotion_campaigns
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.artists a
      where a.id = promotion_campaigns.creator_id and a.user_id = (select auth.uid())
    )
  );
create policy "promotion_admin_insert" on public.promotion_campaigns for insert to authenticated with check ((select public.is_admin()));
create policy "promotion_admin_update" on public.promotion_campaigns for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "promotion_admin_delete" on public.promotion_campaigns for delete to authenticated using ((select public.is_admin()));

-- Preserve the existing creator insert/update/delete policies above; admin ALL
-- was split so each command has one authenticated policy per intent.


-- ============================================================
-- MIGRATION 20260903105841 v84_rls_policy_performance_hardening_v3
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Final consolidation of Advisor-confirmed multiple-permissive policies.
-- Preserve the union of prior admin/creator/public access semantics.

-- Live moderators: one public SELECT policy, creator-only write policies.
drop policy if exists "Creators can manage live moderators" on public.live_stream_moderators;
drop policy if exists "Public can view live moderators" on public.live_stream_moderators;
create policy "live_moderators_public_select" on public.live_stream_moderators
  for select to public using (true);
create policy "live_moderators_creator_insert" on public.live_stream_moderators
  for insert to authenticated
  with check (exists (select 1 from public.live_streams l where l.id = live_stream_moderators.stream_id and l.creator_id = (select auth.uid())));
create policy "live_moderators_creator_update" on public.live_stream_moderators
  for update to authenticated
  using (exists (select 1 from public.live_streams l where l.id = live_stream_moderators.stream_id and l.creator_id = (select auth.uid())))
  with check (exists (select 1 from public.live_streams l where l.id = live_stream_moderators.stream_id and l.creator_id = (select auth.uid())));
create policy "live_moderators_creator_delete" on public.live_stream_moderators
  for delete to authenticated
  using (exists (select 1 from public.live_streams l where l.id = live_stream_moderators.stream_id and l.creator_id = (select auth.uid())));

-- Reel tracks: one public SELECT policy, creator-only writes.
drop policy if exists "Creators can manage reel tracks" on public.reel_tracks;
drop policy if exists "Public can view reel tracks" on public.reel_tracks;
create policy "reel_tracks_public_select" on public.reel_tracks
  for select to public
  using (exists (select 1 from public.reels r join public.content_items c on c.id = r.content_id where r.id = reel_tracks.reel_id and c.status = 'PUBLISHED'::text and c.visibility = 'PUBLIC'::text) or exists (select 1 from public.reels r where r.id = reel_tracks.reel_id and r.creator_id = (select auth.uid())));
create policy "reel_tracks_creator_insert" on public.reel_tracks
  for insert to authenticated
  with check (exists (select 1 from public.reels r where r.id = reel_tracks.reel_id and r.creator_id = (select auth.uid())));
create policy "reel_tracks_creator_update" on public.reel_tracks
  for update to authenticated
  using (exists (select 1 from public.reels r where r.id = reel_tracks.reel_id and r.creator_id = (select auth.uid())))
  with check (exists (select 1 from public.reels r where r.id = reel_tracks.reel_id and r.creator_id = (select auth.uid())));
create policy "reel_tracks_creator_delete" on public.reel_tracks
  for delete to authenticated
  using (exists (select 1 from public.reels r where r.id = reel_tracks.reel_id and r.creator_id = (select auth.uid())));

-- Merch variants: one policy per authenticated command, with admin OR creator semantics.
drop policy if exists "merch_variants_admin_write" on public.merch_product_variants;
drop policy if exists "merch_variants_admin_update" on public.merch_product_variants;
drop policy if exists "merch_variants_admin_delete" on public.merch_product_variants;
drop policy if exists "merch_variants_creator_insert" on public.merch_product_variants;
drop policy if exists "merch_variants_creator_update" on public.merch_product_variants;
drop policy if exists "merch_variants_creator_delete" on public.merch_product_variants;
create policy "merch_variants_authenticated_insert" on public.merch_product_variants
  for insert to authenticated
  with check (
    (select public.is_admin())
    or product_id in (select mp.id from public.merch_products mp join public.artists a on a.id = mp.creator_id where a.user_id = (select auth.uid()))
  );
create policy "merch_variants_authenticated_update" on public.merch_product_variants
  for update to authenticated
  using (
    (select public.is_admin())
    or product_id in (select mp.id from public.merch_products mp join public.artists a on a.id = mp.creator_id where a.user_id = (select auth.uid()) and mp.status = any(array['draft'::text,'changes_requested'::text,'rejected'::text]))
  )
  with check (
    (select public.is_admin())
    or product_id in (select mp.id from public.merch_products mp join public.artists a on a.id = mp.creator_id where a.user_id = (select auth.uid()) and mp.status = any(array['draft'::text,'changes_requested'::text,'rejected'::text]))
  );
create policy "merch_variants_authenticated_delete" on public.merch_product_variants
  for delete to authenticated
  using (
    (select public.is_admin())
    or product_id in (select mp.id from public.merch_products mp join public.artists a on a.id = mp.creator_id where a.user_id = (select auth.uid()) and mp.status = any(array['draft'::text,'changes_requested'::text,'rejected'::text]))
  );

-- Merch products: one policy per authenticated command, admin OR creator.
drop policy if exists "merch_products_admin_insert" on public.merch_products;
drop policy if exists "merch_products_admin_update" on public.merch_products;
drop policy if exists "merch_products_admin_delete" on public.merch_products;
drop policy if exists "merch_products_creator_insert" on public.merch_products;
drop policy if exists "merch_products_creator_update" on public.merch_products;
drop policy if exists "merch_products_creator_delete" on public.merch_products;
create policy "merch_products_authenticated_insert" on public.merch_products
  for insert to authenticated
  with check (
    (select public.is_admin())
    or creator_id in (select a.id from public.artists a where a.user_id = (select auth.uid()))
  );
create policy "merch_products_authenticated_update" on public.merch_products
  for update to authenticated
  using (
    (select public.is_admin())
    or creator_id in (select a.id from public.artists a where a.user_id = (select auth.uid()))
  )
  with check (
    (select public.is_admin())
    or (creator_id in (select a.id from public.artists a where a.user_id = (select auth.uid())) and status = any(array['draft'::text,'pending'::text,'changes_requested'::text,'rejected'::text]))
  );
create policy "merch_products_authenticated_delete" on public.merch_products
  for delete to authenticated
  using (
    (select public.is_admin())
    or (creator_id in (select a.id from public.artists a where a.user_id = (select auth.uid())) and status = any(array['draft'::text,'changes_requested'::text,'rejected'::text]))
  );

-- Promotion campaigns: one policy per authenticated command, admin OR creator.
drop policy if exists "promotion_admin_insert" on public.promotion_campaigns;
drop policy if exists "promotion_admin_update" on public.promotion_campaigns;
drop policy if exists "promotion_admin_delete" on public.promotion_campaigns;
drop policy if exists "promotion_creator_insert" on public.promotion_campaigns;
drop policy if exists "promotion_creator_update" on public.promotion_campaigns;
drop policy if exists "promotion_creator_delete" on public.promotion_campaigns;
create policy "promotion_authenticated_insert" on public.promotion_campaigns
  for insert to authenticated
  with check ((select public.is_admin()) or exists (select 1 from public.artists a where a.id = promotion_campaigns.creator_id and a.user_id = (select auth.uid())));
create policy "promotion_authenticated_update" on public.promotion_campaigns
  for update to authenticated
  using ((select public.is_admin()) or exists (select 1 from public.artists a where a.id = promotion_campaigns.creator_id and a.user_id = (select auth.uid())))
  with check ((select public.is_admin()) or (exists (select 1 from public.artists a where a.id = promotion_campaigns.creator_id and a.user_id = (select auth.uid())) and status = any(array['draft'::text,'pending'::text,'rejected'::text])));
create policy "promotion_authenticated_delete" on public.promotion_campaigns
  for delete to authenticated
  using ((select public.is_admin()) or (exists (select 1 from public.artists a where a.id = promotion_campaigns.creator_id and a.user_id = (select auth.uid())) and status = 'draft'::text));

-- Mixtapes: combine admin + artist UPDATE into one authenticated policy.
drop policy if exists "Admins can update mixtapes" on public.mixtapes;
drop policy if exists "artists can edit their own mixtapes" on public.mixtapes;
create policy "mixtapes authenticated update" on public.mixtapes
  for update to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.artists a where a.id = mixtapes.artist_id and a.user_id = (select auth.uid()))
  )
  with check (
    (select public.is_admin())
    or ((status = any(array['draft'::mixtape_status,'pending'::mixtape_status,'changes_requested'::mixtape_status,'rejected'::mixtape_status])) and exists (select 1 from public.artists a where a.id = mixtapes.artist_id and a.user_id = (select auth.uid())))
  );


-- ============================================================
-- MIGRATION 20260903110407 v84_public_catalog_invoker_hardening_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create policy "tracks public read published mixtapes" on public.tracks for select to anon using (exists (select 1 from public.mixtapes m where m.id = tracks.mixtape_id and m.status = 'published'));

create or replace function public.tgg_public_mixtape_catalog()
returns table(id uuid, title text, genre text, description text, cover_url text, release_date timestamptz, artist_id uuid, artist_name text, track_count bigint)
language sql
security invoker
set search_path = ''
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
security invoker
set search_path = ''
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
revoke all on function public.tgg_public_mixtape_detail(uuid) from public;
grant execute on function public.tgg_public_mixtape_catalog() to anon, authenticated;
grant execute on function public.tgg_public_mixtape_detail(uuid) to anon, authenticated;

-- ============================================================
-- MIGRATION 20260903110707 v84_definer_api_wrapper_hardening_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres;

alter function public.tgg_create_conversation(uuid) set schema private;
alter function public.tgg_create_conversation_v2(uuid,text) set schema private;
alter function public.tgg_creator_create_video(text,text,text,text,date,text) set schema private;
alter function public.tgg_insert_track(uuid,text,uuid,text,integer,text,text) set schema private;
alter function public.tgg_live_end(uuid) set schema private;
alter function public.tgg_live_join(uuid,text) set schema private;
alter function public.tgg_live_leave(text) set schema private;
alter function public.tgg_live_schedule(uuid,text,text,text,text,timestamptz,boolean) set schema private;
alter function public.tgg_live_start(uuid) set schema private;
alter function public.tgg_mark_conversation_read_v2(uuid) set schema private;
alter function public.tgg_mark_message_read(uuid) set schema private;
alter function public.tgg_send_message_v2(uuid,text,text,uuid) set schema private;
alter function public.tgg_track_access_policy(uuid,text) set schema private;
alter function public.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) set schema private;
alter function public.tgg_video_publish(uuid) set schema private;
alter function public.tgg_video_record_event(uuid,text,numeric,jsonb) set schema private;
alter function public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) set schema private;

create or replace function public.tgg_create_conversation(p_user_id uuid) returns uuid language sql security invoker set search_path='' as $$ select private.tgg_create_conversation(p_user_id); $$;
create or replace function public.tgg_create_conversation_v2(p_user_id uuid,p_title text default null) returns uuid language sql security invoker set search_path='' as $$ select private.tgg_create_conversation_v2(p_user_id,p_title); $$;
create or replace function public.tgg_creator_create_video(p_title text,p_description text default null,p_video_url text default null,p_thumbnail_url text default null,p_release_date date default null,p_visibility text default 'public') returns jsonb language sql security invoker set search_path='' as $$ select private.tgg_creator_create_video(p_title,p_description,p_video_url,p_thumbnail_url,p_release_date,p_visibility); $$;
create or replace function public.tgg_insert_track(p_artist_id uuid,p_audio_url text,p_mixtape_id uuid,p_title text,p_track_number integer,p_youtube_url text default null,p_youtube_video_id text default null) returns uuid language sql security invoker set search_path='' as $$ select private.tgg_insert_track(p_artist_id,p_audio_url,p_mixtape_id,p_title,p_track_number,p_youtube_url,p_youtube_video_id); $$;
create or replace function public.tgg_live_end(p_stream_id uuid) returns public.live_streams language sql security invoker set search_path='' as $$ select private.tgg_live_end(p_stream_id); $$;
create or replace function public.tgg_live_join(p_stream_id uuid,p_session_id text) returns public.live_stream_viewers language sql security invoker set search_path='' as $$ select private.tgg_live_join(p_stream_id,p_session_id); $$;
create or replace function public.tgg_live_leave(p_session_id text) returns public.live_stream_viewers language sql security invoker set search_path='' as $$ select private.tgg_live_leave(p_session_id); $$;
create or replace function public.tgg_live_schedule(p_content_id uuid,p_title text,p_description text default null,p_category text default null,p_thumbnail_path text default null,p_scheduled_start timestamptz default null,p_recording_enabled boolean default true) returns public.live_streams language sql security invoker set search_path='' as $$ select private.tgg_live_schedule(p_content_id,p_title,p_description,p_category,p_thumbnail_path,p_scheduled_start,p_recording_enabled); $$;
create or replace function public.tgg_live_start(p_stream_id uuid) returns public.live_streams language sql security invoker set search_path='' as $$ select private.tgg_live_start(p_stream_id); $$;
create or replace function public.tgg_mark_conversation_read_v2(p_conversation_id uuid) returns boolean language sql security invoker set search_path='' as $$ select private.tgg_mark_conversation_read_v2(p_conversation_id); $$;
create or replace function public.tgg_mark_message_read(p_message_id uuid) returns boolean language sql security invoker set search_path='' as $$ select private.tgg_mark_message_read(p_message_id); $$;
create or replace function public.tgg_send_message_v2(p_conversation_id uuid,p_body text,p_message_type text default 'text',p_reply_to_id uuid default null) returns uuid language sql security invoker set search_path='' as $$ select private.tgg_send_message_v2(p_conversation_id,p_body,p_message_type,p_reply_to_id); $$;
create or replace function public.tgg_track_access_policy(p_track_id uuid,p_mode text default 'stream') returns jsonb language sql security invoker set search_path='' as $$ select private.tgg_track_access_policy(p_track_id,p_mode); $$;
create or replace function public.tgg_video_create(p_title text,p_description text default null,p_genre text default null,p_release_date date default null,p_explicit_content boolean default false,p_video_url text default null,p_thumbnail_url text default null,p_visibility text default 'private',p_featured boolean default false,p_allow_downloads boolean default false) returns public.videos language sql security invoker set search_path='' as $$ select private.tgg_video_create(p_title,p_description,p_genre,p_release_date,p_explicit_content,p_video_url,p_thumbnail_url,p_visibility,p_featured,p_allow_downloads); $$;
create or replace function public.tgg_video_publish(p_video_id uuid) returns public.videos language sql security invoker set search_path='' as $$ select private.tgg_video_publish(p_video_id); $$;
create or replace function public.tgg_video_record_event(p_video_id uuid,p_event_type text,p_watch_seconds numeric default null,p_event_metadata jsonb default '{}'::jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.tgg_video_record_event(p_video_id,p_event_type,p_watch_seconds,p_event_metadata); $$;
create or replace function public.tgg_video_update(p_video_id uuid,p_title text default null,p_description text default null,p_genre text default null,p_release_date date default null,p_explicit_content boolean default null,p_thumbnail_url text default null,p_visibility text default null,p_featured boolean default null,p_allow_downloads boolean default null) returns public.videos language sql security invoker set search_path='' as $$ select private.tgg_video_update(p_video_id,p_title,p_description,p_genre,p_release_date,p_explicit_content,p_thumbnail_url,p_visibility,p_featured,p_allow_downloads); $$;

grant execute on function public.tgg_create_conversation(uuid) to authenticated;
grant execute on function public.tgg_create_conversation_v2(uuid,text) to authenticated;
grant execute on function public.tgg_creator_create_video(text,text,text,text,date,text) to authenticated;
grant execute on function public.tgg_insert_track(uuid,text,uuid,text,integer,text,text) to authenticated;
grant execute on function public.tgg_live_end(uuid) to authenticated;
grant execute on function public.tgg_live_join(uuid,text) to authenticated;
grant execute on function public.tgg_live_leave(text) to authenticated;
grant execute on function public.tgg_live_schedule(uuid,text,text,text,text,timestamptz,boolean) to authenticated;
grant execute on function public.tgg_live_start(uuid) to authenticated;
grant execute on function public.tgg_mark_conversation_read_v2(uuid) to authenticated;
grant execute on function public.tgg_mark_message_read(uuid) to authenticated;
grant execute on function public.tgg_send_message_v2(uuid,text,text,uuid) to authenticated;
grant execute on function public.tgg_track_access_policy(uuid,text) to authenticated;
grant execute on function public.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) to authenticated;
grant execute on function public.tgg_video_publish(uuid) to authenticated;
grant execute on function public.tgg_video_record_event(uuid,text,numeric,jsonb) to authenticated;
grant execute on function public.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) to authenticated;

revoke all on all functions in schema private from public, anon, authenticated, service_role;
grant usage on schema private to postgres;
grant execute on function private.tgg_create_conversation(uuid) to postgres;
grant execute on function private.tgg_create_conversation_v2(uuid,text) to postgres;
grant execute on function private.tgg_creator_create_video(text,text,text,text,date,text) to postgres;
grant execute on function private.tgg_insert_track(uuid,text,uuid,text,integer,text,text) to postgres;
grant execute on function private.tgg_live_end(uuid) to postgres;
grant execute on function private.tgg_live_join(uuid,text) to postgres;
grant execute on function private.tgg_live_leave(text) to postgres;
grant execute on function private.tgg_live_schedule(uuid,text,text,text,text,timestamptz,boolean) to postgres;
grant execute on function private.tgg_live_start(uuid) to postgres;
grant execute on function private.tgg_mark_conversation_read_v2(uuid) to postgres;
grant execute on function private.tgg_mark_message_read(uuid) to postgres;
grant execute on function private.tgg_send_message_v2(uuid,text,text,uuid) to postgres;
grant execute on function private.tgg_track_access_policy(uuid,text) to postgres;
grant execute on function private.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) to postgres;
grant execute on function private.tgg_video_publish(uuid) to postgres;
grant execute on function private.tgg_video_record_event(uuid,text,numeric,jsonb) to postgres;
grant execute on function private.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) to postgres;

-- ============================================================
-- MIGRATION 20260903110714 v84_private_rpc_execution_bridge_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

grant usage on schema private to authenticated;
grant execute on function private.tgg_create_conversation(uuid) to authenticated;
grant execute on function private.tgg_create_conversation_v2(uuid,text) to authenticated;
grant execute on function private.tgg_creator_create_video(text,text,text,text,date,text) to authenticated;
grant execute on function private.tgg_insert_track(uuid,text,uuid,text,integer,text,text) to authenticated;
grant execute on function private.tgg_live_end(uuid) to authenticated;
grant execute on function private.tgg_live_join(uuid,text) to authenticated;
grant execute on function private.tgg_live_leave(text) to authenticated;
grant execute on function private.tgg_live_schedule(uuid,text,text,text,text,timestamptz,boolean) to authenticated;
grant execute on function private.tgg_live_start(uuid) to authenticated;
grant execute on function private.tgg_mark_conversation_read_v2(uuid) to authenticated;
grant execute on function private.tgg_mark_message_read(uuid) to authenticated;
grant execute on function private.tgg_send_message_v2(uuid,text,text,uuid) to authenticated;
grant execute on function private.tgg_track_access_policy(uuid,text) to authenticated;
grant execute on function private.tgg_video_create(text,text,text,date,boolean,text,text,text,boolean,boolean) to authenticated;
grant execute on function private.tgg_video_publish(uuid) to authenticated;
grant execute on function private.tgg_video_record_event(uuid,text,numeric,jsonb) to authenticated;
grant execute on function private.tgg_video_update(uuid,text,text,text,date,boolean,text,text,boolean,boolean) to authenticated;

-- ============================================================
-- MIGRATION 20260903111407 v122_free_password_breach_guard_audit
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v122_security_control_status (id boolean primary key default true, breach_guard_function text not null default 'tgg-password-breach-check-v3', architecture text not null default 'server_side_hibp_k_anonymity', fail_closed boolean not null default true, updated_at timestamptz not null default now());
insert into public.v122_security_control_status(id) values (true) on conflict (id) do update set breach_guard_function=excluded.breach_guard_function, architecture=excluded.architecture, fail_closed=excluded.fail_closed, updated_at=now();
alter table public.v122_security_control_status enable row level security;
drop policy if exists v122_security_control_status_none on public.v122_security_control_status;
revoke all on public.v122_security_control_status from public, anon, authenticated, service_role;

-- ============================================================
-- MIGRATION 20260903111607 v122_security_control_status_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.v122_security_control_status enable row level security;
alter table public.v122_security_control_status force row level security;
revoke all on table public.v122_security_control_status from public, anon, authenticated, service_role;

-- ============================================================
-- MIGRATION 20260903111911 v122_security_control_explicit_deny_policy
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create policy v122_security_control_deny_all on public.v122_security_control_status as restrictive for all to public using (false) with check (false);

-- ============================================================
-- MIGRATION 20260903113646 v54_authenticated_execute_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v54_system_health() from public, anon;
grant execute on function public.v54_system_health() to authenticated;
revoke execute on function public.v54_authorize_action(uuid) from public, anon;
grant execute on function public.v54_authorize_action(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260903121833 fix_creator_admin_rpc_permissions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_admin() from anon;
grant execute on function public.v54_system_health() to authenticated;
revoke execute on function public.v54_system_health() from anon;
grant execute on function public.v58_resolve_action(uuid,text) to authenticated;
revoke execute on function public.v58_resolve_action(uuid,text) from anon;
grant execute on function public.tgg_upload_track(uuid,text,integer,text,text,text,text) to authenticated;
revoke execute on function public.tgg_upload_track(uuid,text,integer,text,text,text,text) from anon;

-- ============================================================
-- MIGRATION 20260903122245 harden_creator_security_definer_functions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v54_authorize_action(uuid) from authenticated;
revoke execute on function public.v54_authorize_action(uuid) from anon;

-- v54_authorize_action is not part of the current Creator Studio V158 workflow.
-- Keep it inaccessible until a verified caller is explicitly needed.

-- Keep the currently required application RPCs executable by authenticated users,
-- while anonymous callers remain blocked.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.v54_system_health() to authenticated;
grant execute on function public.v58_resolve_action(uuid,text) to authenticated;

grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.v54_system_health() from anon;
revoke execute on function public.v58_resolve_action(uuid,text) from anon;

-- ============================================================
-- MIGRATION 20260903122936 move_creator_security_definers_private
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create schema if not exists private;

alter function public.is_admin() set schema private;
alter function public.v54_system_health() set schema private;
alter function public.v58_resolve_action(uuid,text) set schema private;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select private.is_admin();
$function$;

create or replace function public.v54_system_health()
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.v54_system_health();
$function$;

create or replace function public.v58_resolve_action(p_action_id uuid, p_resolution text default 'approved')
returns public.v58_workflow_runs
language sql
security invoker
set search_path = ''
as $function$
  select private.v58_resolve_action(p_action_id, p_resolution);
$function$;

revoke execute on function private.is_admin() from public, anon;
revoke execute on function private.v54_system_health() from public, anon;
revoke execute on function private.v58_resolve_action(uuid,text) from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.v54_system_health() to authenticated;
grant execute on function private.v58_resolve_action(uuid,text) to authenticated;
grant usage on schema private to authenticated;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.v54_system_health() from public, anon;
revoke execute on function public.v58_resolve_action(uuid,text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.v54_system_health() to authenticated;
grant execute on function public.v58_resolve_action(uuid,text) to authenticated;

-- ============================================================
-- MIGRATION 20260903123030 harden_private_membership_function_search_paths
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

ALTER FUNCTION private.is_conversation_member(uuid, uuid) SET search_path = '';
ALTER FUNCTION private.is_creator_member(uuid, uuid) SET search_path = '';
REVOKE EXECUTE ON FUNCTION private.is_conversation_member(uuid, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_creator_member(uuid, uuid) FROM public, anon, authenticated;

-- ============================================================
-- MIGRATION 20260903123236 enforce_free_password_breach_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_password_is_breached(p_password text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_password is null or length(p_password) < 8 then
    return jsonb_build_object('checked', false, 'acceptable', false, 'reason', 'minimum_length');
  end if;
  if length(p_password) > 128 then
    return jsonb_build_object('checked', false, 'acceptable', false, 'reason', 'maximum_length');
  end if;
  return jsonb_build_object('checked', false, 'acceptable', false, 'reason', 'use_edge_function');
end;
$function$;
revoke execute on function public.tgg_password_is_breached(text) from public, anon, authenticated;
comment on function public.tgg_password_is_breached(text) is 'Guardrail placeholder: passwords must be checked by tgg-password-breach-check-v4 Edge Function using HIBP k-anonymity. This database function intentionally never receives or stores passwords.';

-- ============================================================
-- MIGRATION 20260903124716 v159_creator_growth_analytics_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v159_creator_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.artists(id) on delete cascade,
  event_type text not null check (event_type in ('profile_view','content_view','content_play','content_download','follow','share','upload','publish','submission')),
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

alter table public.v159_creator_events enable row level security;

create index if not exists idx_v159_creator_events_creator_time on public.v159_creator_events(creator_id, occurred_at desc);
create index if not exists idx_v159_creator_events_entity_time on public.v159_creator_events(entity_type, entity_id, occurred_at desc);

 drop policy if exists v159_events_select_own on public.v159_creator_events;
create policy v159_events_select_own on public.v159_creator_events
  for select to authenticated
  using (exists (select 1 from public.artists a where a.id = creator_id and a.user_id = (select auth.uid())));

 drop policy if exists v159_events_insert_own on public.v159_creator_events;
create policy v159_events_insert_own on public.v159_creator_events
  for insert to authenticated
  with check (exists (select 1 from public.artists a where a.id = creator_id and a.user_id = (select auth.uid())));

create or replace function public.v159_record_creator_event(
  p_event_type text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_creator_id uuid;
  v_id uuid;
begin
  select a.id into v_creator_id
  from public.artists a
  where a.user_id = (select auth.uid())
  limit 1;

  if v_creator_id is null then
    raise exception 'creator profile not found';
  end if;

  if p_event_type not in ('profile_view','content_view','content_play','content_download','follow','share','upload','publish','submission') then
    raise exception 'invalid event type';
  end if;

  insert into public.v159_creator_events(creator_id,event_type,entity_type,entity_id,metadata)
  values(v_creator_id,p_event_type,p_entity_type,p_entity_id,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.v159_record_creator_event(text,text,uuid,jsonb) from public, anon;
grant execute on function public.v159_record_creator_event(text,text,uuid,jsonb) to authenticated;

create or replace function public.v159_creator_metrics()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_creator_id uuid;
  v_artist_id uuid;
  v_result jsonb;
begin
  select a.id into v_artist_id from public.artists a where a.user_id = (select auth.uid()) limit 1;
  if v_artist_id is null then
    return jsonb_build_object('profile',jsonb_build_object(),'content',jsonb_build_object(),'events',jsonb_build_object());
  end if;

  select jsonb_build_object(
    'profile', jsonb_build_object('artist_id',v_artist_id),
    'content', jsonb_build_object(
      'mixtapes', (select count(*) from public.mixtapes m where m.artist_id=v_artist_id),
      'published_mixtapes', (select count(*) from public.mixtapes m where m.artist_id=v_artist_id and m.status::text='published'),
      'videos', (select count(*) from public.videos v where v.artist_id=v_artist_id),
      'published_videos', (select count(*) from public.videos v where v.artist_id=v_artist_id and lower(coalesce(v.status,''))='published'),
      'plays', coalesce((select sum(coalesce(m.play_count,0)) from public.mixtapes m where m.artist_id=v_artist_id),0) + coalesce((select sum(coalesce(v.play_count,0)) from public.videos v where v.artist_id=v_artist_id),0)
    ),
    'events', jsonb_build_object(
      'last_30_days', (select count(*) from public.v159_creator_events e where e.creator_id=v_artist_id and e.occurred_at >= now()-interval '30 days'),
      'uploads', (select count(*) from public.v159_creator_events e where e.creator_id=v_artist_id and e.event_type='upload' and e.occurred_at >= now()-interval '30 days'),
      'publishes', (select count(*) from public.v159_creator_events e where e.creator_id=v_artist_id and e.event_type='publish' and e.occurred_at >= now()-interval '30 days')
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.v159_creator_metrics() from public, anon;
grant execute on function public.v159_creator_metrics() to authenticated;

-- ============================================================
-- MIGRATION 20260903124815 v159_creator_dashboard_metrics_rpc_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v159_creator_metrics()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as uid
  ),
  a as (
    select ar.id
    from public.artists ar
    join me on me.uid = ar.user_id
  ),
  mt as (
    select count(*)::bigint total, count(*) filter (where m.status::text = 'published')::bigint published, coalesce(sum(m.play_count),0)::bigint plays
    from public.mixtapes m join a on a.id=m.artist_id
  ),
  tr as (
    select count(*)::bigint total, coalesce(sum(t.duration_seconds),0)::bigint seconds
    from public.tracks t join a on a.id=t.artist_id
  ),
  vd as (
    select count(*)::bigint total, count(*) filter (where lower(coalesce(v.status,''))='published' or lower(coalesce(v.visibility,''))='public')::bigint published, coalesce(sum(v.play_count),0)::bigint plays
    from public.videos v join a on a.id=v.artist_id
  ),
  ev as (
    select count(*)::bigint events_30d
    from public.v159_creator_events e join me on me.uid=e.creator_id
    where e.occurred_at >= now()-interval '30 days'
  )
  select jsonb_build_object(
    'mixtapes', jsonb_build_object('total',mt.total,'published',mt.published,'plays',mt.plays),
    'tracks', jsonb_build_object('total',tr.total,'duration_seconds',tr.seconds),
    'videos', jsonb_build_object('total',vd.total,'published',vd.published,'plays',vd.plays),
    'events_30d',ev.events_30d,
    'generated_at',now()
  )
  from mt,tr,vd,ev;
$$;

revoke execute on function public.v159_creator_metrics() from anon;
grant execute on function public.v159_creator_metrics() to authenticated;

revoke execute on function public.v159_record_creator_event(text,text,uuid,jsonb) from anon;
grant execute on function public.v159_record_creator_event(text,text,uuid,jsonb) to authenticated;

-- ============================================================
-- MIGRATION 20260903124926 v159_publishing_discovery_hardening_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v159_creator_publish_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (select (select auth.uid()) uid),
  a as (select ar.id from public.artists ar join me on me.uid=ar.user_id),
  m as (select count(*)::bigint total,count(*) filter (where lower(coalesce(status::text,''))='published')::bigint published,count(*) filter (where lower(coalesce(status::text,''))='pending')::bigint pending,count(*) filter (where lower(coalesce(status::text,''))='draft')::bigint drafts,count(*) filter (where lower(coalesce(status::text,''))='changes_requested')::bigint changes_requested from public.mixtapes where artist_id in (select id from a)),
  v as (select count(*)::bigint total,count(*) filter (where lower(coalesce(status,''))='published')::bigint published,count(*) filter (where lower(coalesce(status,''))='pending')::bigint pending,count(*) filter (where lower(coalesce(status,''))='draft')::bigint drafts from public.videos where artist_id in (select id from a))
  select jsonb_build_object('mixtapes',jsonb_build_object('total',m.total,'published',m.published,'pending',m.pending,'drafts',m.drafts,'changes_requested',m.changes_requested),'videos',jsonb_build_object('total',v.total,'published',v.published,'pending',v.pending,'drafts',v.drafts),'generated_at',now()) from m,v;
$$;
revoke execute on function public.v159_creator_publish_summary() from anon;
grant execute on function public.v159_creator_publish_summary() to authenticated;

drop function if exists public.v159_record_creator_event(text,text,uuid,jsonb);
create function public.v159_record_creator_event(p_event_type text,p_entity_type text,p_entity_id uuid,p_metadata jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if p_event_type is null or length(trim(p_event_type))=0 or length(p_event_type)>80 then raise exception 'invalid event_type'; end if;
  if p_entity_type is null or length(trim(p_entity_type))=0 or length(p_entity_type)>80 then raise exception 'invalid entity_type'; end if;
  insert into public.v159_creator_events(creator_id,event_type,entity_type,entity_id,metadata)
  values ((select auth.uid()),trim(p_event_type),trim(p_entity_type),p_entity_id,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.v159_record_creator_event(text,text,uuid,jsonb) from anon;
grant execute on function public.v159_record_creator_event(text,text,uuid,jsonb) to authenticated;

create index if not exists v159_creator_events_creator_occurred_idx on public.v159_creator_events(creator_id,occurred_at desc);
create index if not exists v159_creator_events_entity_idx on public.v159_creator_events(entity_type,entity_id);


-- ============================================================
-- MIGRATION 20260903221048 fix_messenger_rls_conversation_scope
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

drop policy if exists "tgg members select own conversations" on public.tgg_conversation_members;
create policy "tgg members select own conversations"
on public.tgg_conversation_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.tgg_conversation_members self_member
    where self_member.conversation_id = tgg_conversation_members.conversation_id
      and self_member.user_id = (select auth.uid())
  )
);

drop policy if exists "tgg messages select members" on public.tgg_messages;
create policy "tgg messages select members"
on public.tgg_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.tgg_conversation_members m
    where m.conversation_id = tgg_messages.conversation_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists "tgg messages insert members" on public.tgg_messages;
create policy "tgg messages insert members"
on public.tgg_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.tgg_conversation_members m
    where m.conversation_id = tgg_messages.conversation_id
      and m.user_id = (select auth.uid())
  )
);

commit;

-- ============================================================
-- MIGRATION 20260903221102 harden_messenger_membership_helper
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create or replace function private.tgg_is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tgg_conversation_members m
    where m.conversation_id = target_conversation_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.tgg_is_conversation_member(uuid) from public, anon;
grant execute on function private.tgg_is_conversation_member(uuid) to authenticated;

drop policy if exists "tgg members select own conversations" on public.tgg_conversation_members;
create policy "tgg members select own conversations"
on public.tgg_conversation_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.tgg_is_conversation_member(conversation_id))
);

drop policy if exists "tgg messages select members" on public.tgg_messages;
create policy "tgg messages select members"
on public.tgg_messages
for select
to authenticated
using ((select private.tgg_is_conversation_member(conversation_id)));

drop policy if exists "tgg messages insert members" on public.tgg_messages;
create policy "tgg messages insert members"
on public.tgg_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and (select private.tgg_is_conversation_member(conversation_id))
);

commit;

-- ============================================================
-- MIGRATION 20260903221142 optimize_tgg_messenger_rls_and_indexes
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create index if not exists tgg_collaboration_requests_conversation_id_idx on public.tgg_collaboration_requests(conversation_id);
create index if not exists tgg_collaboration_requests_sender_id_idx on public.tgg_collaboration_requests(sender_id);
create index if not exists tgg_conversations_created_by_idx on public.tgg_conversations(created_by);
create index if not exists tgg_messages_sender_id_idx on public.tgg_messages(sender_id);

drop policy if exists "tgg conversations insert own" on public.tgg_conversations;
create policy "tgg conversations insert own"
on public.tgg_conversations for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "tgg conversations select members" on public.tgg_conversations;
create policy "tgg conversations select members"
on public.tgg_conversations for select to authenticated
using (created_by = (select auth.uid()) or (select private.tgg_is_conversation_member(id)));

drop policy if exists "tgg conversations update members" on public.tgg_conversations;
create policy "tgg conversations update members"
on public.tgg_conversations for update to authenticated
using (created_by = (select auth.uid()) or (select private.tgg_is_conversation_member(id)))
with check (created_by = (select auth.uid()) or (select private.tgg_is_conversation_member(id)));

drop policy if exists "tgg members insert owners" on public.tgg_conversation_members;
create policy "tgg members insert owners"
on public.tgg_conversation_members for insert to authenticated
with check (
  exists (
    select 1 from public.tgg_conversations c
    where c.id = tgg_conversation_members.conversation_id
      and c.created_by = (select auth.uid())
  )
);

drop policy if exists "tgg members update self" on public.tgg_conversation_members;
create policy "tgg members update self"
on public.tgg_conversation_members for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "tgg collabs insert sender" on public.tgg_collaboration_requests;
create policy "tgg collabs insert sender"
on public.tgg_collaboration_requests for insert to authenticated
with check (sender_id = (select auth.uid()) and sender_id <> recipient_id);

drop policy if exists "tgg collabs select participants" on public.tgg_collaboration_requests;
create policy "tgg collabs select participants"
on public.tgg_collaboration_requests for select to authenticated
using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists "tgg collabs update participants" on public.tgg_collaboration_requests;
create policy "tgg collabs update participants"
on public.tgg_collaboration_requests for update to authenticated
using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
with check (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

commit;

-- ============================================================
-- MIGRATION 20260903221240 complete_creator_media_public_access_and_artwork
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Public/authenticated reads for published media and commerce.
drop policy if exists "authenticated read published videos" on public.site_videos;
create policy "authenticated read published videos"
on public.site_videos for select to authenticated
using (published = true);

drop policy if exists "authenticated read published interviews" on public.artist_interviews;
create policy "authenticated read published interviews"
on public.artist_interviews for select to authenticated
using (published = true);

drop policy if exists "tracks authenticated read published mixtapes" on public.tracks;
create policy "tracks authenticated read published mixtapes"
on public.tracks for select to authenticated
using (
  exists (
    select 1 from public.mixtapes m
    where m.id = tracks.mixtape_id
      and m.status = 'published'::mixtape_status
  )
);

drop policy if exists "merch_products public read published" on public.merch_products;
create policy "merch_products public read published"
on public.merch_products for select to anon
using (status = 'published');

drop policy if exists "products public read published" on public.products;
create policy "products public read published"
on public.products for select to anon
using (status = 'published');

-- Creator artwork persistence expected by the theme.
create table if not exists public.artist_artwork (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  image_url text not null,
  status text not null default 'draft' check (status in ('draft','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists artist_artwork_user_id_idx on public.artist_artwork(user_id);
create index if not exists artist_artwork_status_created_idx on public.artist_artwork(status, created_at desc);
alter table public.artist_artwork enable row level security;

drop policy if exists "artist artwork public read published" on public.artist_artwork;
create policy "artist artwork public read published"
on public.artist_artwork for select to anon
using (status = 'published');

drop policy if exists "artist artwork authenticated read" on public.artist_artwork;
create policy "artist artwork authenticated read"
on public.artist_artwork for select to authenticated
using (status = 'published' or user_id = (select auth.uid()));

drop policy if exists "artist artwork own insert" on public.artist_artwork;
create policy "artist artwork own insert"
on public.artist_artwork for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "artist artwork own update" on public.artist_artwork;
create policy "artist artwork own update"
on public.artist_artwork for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "artist artwork own delete" on public.artist_artwork;
create policy "artist artwork own delete"
on public.artist_artwork for delete to authenticated
using (user_id = (select auth.uid()));

-- Creator-owned Storage paths. Existing admin policies remain intact.
drop policy if exists "tgg videos owner upload" on storage.objects;
create policy "tgg videos owner upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "tgg videos owner update" on storage.objects;
create policy "tgg videos owner update"
on storage.objects for update to authenticated
using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "tgg videos owner delete" on storage.objects;
create policy "tgg videos owner delete"
on storage.objects for delete to authenticated
using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "tgg thumbnails owner upload" on storage.objects;
create policy "tgg thumbnails owner upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'media-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "tgg thumbnails owner update" on storage.objects;
create policy "tgg thumbnails owner update"
on storage.objects for update to authenticated
using (bucket_id = 'media-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'media-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "tgg thumbnails owner delete" on storage.objects;
create policy "tgg thumbnails owner delete"
on storage.objects for delete to authenticated
using (bucket_id = 'media-thumbnails' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "tgg artist images owner update" on storage.objects;
create policy "tgg artist images owner update"
on storage.objects for update to authenticated
using (bucket_id = 'artist-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'artist-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "tgg artist images owner delete" on storage.objects;
create policy "tgg artist images owner delete"
on storage.objects for delete to authenticated
using (bucket_id = 'artist-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;

-- ============================================================
-- MIGRATION 20260903221431 restore_theme_schema_compatibility
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Fields already expected by the deployed unified release engine.
alter table public.mixtapes add column if not exists slug text;
alter table public.mixtapes add column if not exists cover_path text;
alter table public.mixtapes add column if not exists audio_url text;
alter table public.mixtapes add column if not exists download_count bigint not null default 0;

-- Stable authenticated ownership columns for legacy/new Creator Studio code.
alter table public.mixtapes add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.tracks add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.products add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.merch_products add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.site_videos add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.artist_interviews add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Status compatibility for the Creator Studio media editor.
alter table public.site_videos add column if not exists status text not null default 'draft' check (status in ('draft','published'));
alter table public.artist_interviews add column if not exists status text not null default 'draft' check (status in ('draft','published'));

-- Backfill ownership where an artist relationship already exists.
update public.mixtapes m set user_id=a.user_id from public.artists a where a.id=m.artist_id and m.user_id is null;
update public.tracks t set user_id=a.user_id from public.artists a where a.id=t.artist_id and t.user_id is null;
update public.products p set user_id=a.user_id from public.artists a where a.id=p.artist_id and p.user_id is null;
update public.merch_products p set user_id=a.user_id from public.artists a where a.id=p.creator_id and p.user_id is null;

-- Existing public media keeps its current published state reflected in status.
update public.site_videos set status=case when published is true then 'published' else 'draft' end;
update public.artist_interviews set status=case when published is true then 'published' else 'draft' end;

create index if not exists mixtapes_user_id_idx on public.mixtapes(user_id);
create index if not exists tracks_user_id_idx on public.tracks(user_id);
create index if not exists products_user_id_idx on public.products(user_id);
create index if not exists merch_products_user_id_idx on public.merch_products(user_id);
create index if not exists site_videos_user_id_idx on public.site_videos(user_id);
create index if not exists artist_interviews_user_id_idx on public.artist_interviews(user_id);

create or replace function private.tgg_sync_creator_ownership()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare aid uuid; auid uuid;
begin
  if TG_TABLE_NAME in ('mixtapes','tracks','products') then
    if NEW.user_id is not null and NEW.artist_id is null then
      select a.id into aid from public.artists a where a.user_id=NEW.user_id order by a.created_at asc limit 1;
      NEW.artist_id:=aid;
    elsif NEW.user_id is null and NEW.artist_id is not null then
      select a.user_id into auid from public.artists a where a.id=NEW.artist_id limit 1;
      NEW.user_id:=auid;
    end if;
  elsif TG_TABLE_NAME='merch_products' then
    if NEW.user_id is not null and NEW.creator_id is null then
      select a.id into aid from public.artists a where a.user_id=NEW.user_id order by a.created_at asc limit 1;
      NEW.creator_id:=aid;
    elsif NEW.user_id is null and NEW.creator_id is not null then
      select a.user_id into auid from public.artists a where a.id=NEW.creator_id limit 1;
      NEW.user_id:=auid;
    end if;
  end if;
  return NEW;
end;
$$;
revoke all on function private.tgg_sync_creator_ownership() from public, anon, authenticated;

drop trigger if exists tgg_sync_mixtapes_owner on public.mixtapes;
create trigger tgg_sync_mixtapes_owner before insert or update of artist_id,user_id on public.mixtapes for each row execute function private.tgg_sync_creator_ownership();
drop trigger if exists tgg_sync_tracks_owner on public.tracks;
create trigger tgg_sync_tracks_owner before insert or update of artist_id,user_id on public.tracks for each row execute function private.tgg_sync_creator_ownership();
drop trigger if exists tgg_sync_products_owner on public.products;
create trigger tgg_sync_products_owner before insert or update of artist_id,user_id on public.products for each row execute function private.tgg_sync_creator_ownership();
drop trigger if exists tgg_sync_merch_owner on public.merch_products;
create trigger tgg_sync_merch_owner before insert or update of creator_id,user_id on public.merch_products for each row execute function private.tgg_sync_creator_ownership();

create or replace function private.tgg_sync_media_published()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if NEW.status is distinct from OLD.status or TG_OP='INSERT' then
    NEW.published := (NEW.status='published');
  elsif NEW.published is distinct from OLD.published then
    NEW.status := case when NEW.published then 'published' else 'draft' end;
  end if;
  return NEW;
end;
$$;
revoke all on function private.tgg_sync_media_published() from public, anon, authenticated;

drop trigger if exists tgg_sync_site_videos_published on public.site_videos;
create trigger tgg_sync_site_videos_published before insert or update of status,published on public.site_videos for each row execute function private.tgg_sync_media_published();
drop trigger if exists tgg_sync_interviews_published on public.artist_interviews;
create trigger tgg_sync_interviews_published before insert or update of status,published on public.artist_interviews for each row execute function private.tgg_sync_media_published();

-- Creator-owned media management in addition to existing admin policies.
drop policy if exists "site videos own insert" on public.site_videos;
create policy "site videos own insert" on public.site_videos for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists "site videos own update" on public.site_videos;
create policy "site videos own update" on public.site_videos for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists "site videos own delete" on public.site_videos;
create policy "site videos own delete" on public.site_videos for delete to authenticated using (user_id=(select auth.uid()));

drop policy if exists "interviews own insert" on public.artist_interviews;
create policy "interviews own insert" on public.artist_interviews for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists "interviews own update" on public.artist_interviews;
create policy "interviews own update" on public.artist_interviews for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists "interviews own delete" on public.artist_interviews;
create policy "interviews own delete" on public.artist_interviews for delete to authenticated using (user_id=(select auth.uid()));

commit;

-- ============================================================
-- MIGRATION 20260903221603 consolidate_media_track_rls_policies
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- SITE VIDEOS: replace overlapping admin/owner/published policies with one per action.
drop policy if exists "admins manage videos" on public.site_videos;
drop policy if exists "site videos own delete" on public.site_videos;
drop policy if exists "site videos own insert" on public.site_videos;
drop policy if exists "authenticated read published videos" on public.site_videos;
drop policy if exists "site videos own update" on public.site_videos;

create policy "site videos authenticated select"
on public.site_videos for select to authenticated
using (
  published = true
  or user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
);

create policy "site videos authenticated insert"
on public.site_videos for insert to authenticated
with check (
  user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
);

create policy "site videos authenticated update"
on public.site_videos for update to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
)
with check (
  user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
);

create policy "site videos authenticated delete"
on public.site_videos for delete to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
);

-- INTERVIEWS: same consolidation.
drop policy if exists "admins manage interviews" on public.artist_interviews;
drop policy if exists "interviews own delete" on public.artist_interviews;
drop policy if exists "interviews own insert" on public.artist_interviews;
drop policy if exists "authenticated read published interviews" on public.artist_interviews;
drop policy if exists "interviews own update" on public.artist_interviews;

create policy "interviews authenticated select"
on public.artist_interviews for select to authenticated
using (
  published = true
  or user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
);

create policy "interviews authenticated insert"
on public.artist_interviews for insert to authenticated
with check (
  user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
);

create policy "interviews authenticated update"
on public.artist_interviews for update to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
)
with check (
  user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
);

create policy "interviews authenticated delete"
on public.artist_interviews for delete to authenticated
using (
  user_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
);

-- TRACKS: combine authenticated owner/admin and published-read paths.
drop policy if exists "tracks authenticated read" on public.tracks;
drop policy if exists "tracks authenticated read published mixtapes" on public.tracks;
create policy "tracks authenticated select"
on public.tracks for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'::user_role)
  or exists (select 1 from public.artists a where a.id=tracks.artist_id and a.user_id=(select auth.uid()))
  or exists (select 1 from public.mixtapes m where m.id=tracks.mixtape_id and m.status='published'::mixtape_status)
);

commit;

-- ============================================================
-- MIGRATION 20260903223456 remove_duplicate_v159_creator_events_index
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop index if exists public.v159_creator_events_creator_occurred_idx;

-- ============================================================
-- MIGRATION 20260903224026 v98_blogger_one_time_connect_links
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.v98_blogger_connect_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  requested_blog_url text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.v98_blogger_connect_links enable row level security;
revoke all on table public.v98_blogger_connect_links from public, anon, authenticated;
create index if not exists v98_blogger_connect_links_expires_idx on public.v98_blogger_connect_links (expires_at) where used_at is null;

-- ============================================================
-- MIGRATION 20260903224041 v98_blogger_connect_link_cleanup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v98_cleanup_expired_blogger_connect_links()
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.v98_blogger_connect_links
  where expires_at < now() - interval '1 day' or used_at < now() - interval '1 day';
$$;
revoke all on function public.v98_cleanup_expired_blogger_connect_links() from public, anon, authenticated;

-- ============================================================
-- MIGRATION 20260903224051 v98_blogger_connect_links_service_only
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

comment on table public.v98_blogger_connect_links is 'Short-lived one-time tokens for initiating Blogger OAuth without exposing user credentials. Service-role only; no client policies.';

-- ============================================================
-- MIGRATION 20260903224056 v98_blogger_connect_links_one_time_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create unique index if not exists v98_blogger_connect_links_active_token_idx on public.v98_blogger_connect_links (token_hash) where used_at is null;

-- ============================================================
-- MIGRATION 20260903224101 v98_blogger_connect_links_expiry_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.v98_blogger_connect_links drop constraint if exists v98_blogger_connect_links_future_expiry;
alter table public.v98_blogger_connect_links add constraint v98_blogger_connect_links_future_expiry check (expires_at > created_at);

-- ============================================================
-- MIGRATION 20260903224107 v98_blogger_connect_links_audit_index
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create index if not exists v98_blogger_connect_links_user_created_idx on public.v98_blogger_connect_links (user_id, created_at desc);

-- ============================================================
-- MIGRATION 20260903224112 v98_blogger_connect_links_no_client_access
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke all privileges on public.v98_blogger_connect_links from public;
revoke all privileges on public.v98_blogger_connect_links from anon;
revoke all privileges on public.v98_blogger_connect_links from authenticated;

-- ============================================================
-- MIGRATION 20260903224120 v98_blogger_connect_link_prune_old_rows
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

delete from public.v98_blogger_connect_links where (used_at is not null and used_at < now() - interval '1 day') or expires_at < now() - interval '1 day';

-- ============================================================
-- MIGRATION 20260903232010 fix_v98_blogger_oauth_state_consume_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop function if exists v98_private.consume_blogger_oauth_state(text);
create function v98_private.consume_blogger_oauth_state(p_state_hash text)
returns table(id uuid, user_id uuid, redirect_uri text, requested_blog_url text)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
  update public.v98_blogger_oauth_states s
     set consumed_at = now()
   where s.state_hash = p_state_hash
     and s.consumed_at is null
     and s.expires_at > now()
  returning s.id, s.user_id, s.redirect_uri, s.requested_blog_url;
end;
$function$;
revoke all on function v98_private.consume_blogger_oauth_state(text) from public, anon, authenticated;
grant execute on function v98_private.consume_blogger_oauth_state(text) to service_role;

-- ============================================================
-- MIGRATION 20260903232042 compat_v98_blogger_rpc_names
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public."v98_private.consume_blogger_oauth_state"(p_state_hash text)
returns table(id uuid, user_id uuid, redirect_uri text, requested_blog_url text)
language sql
security definer
set search_path=''
as $$ select * from v98_private.consume_blogger_oauth_state(p_state_hash); $$;

create or replace function public."v98_private.get_blogger_refresh_token"(p_user_id uuid, p_connection_id uuid)
returns text
language sql
security definer
set search_path=''
as $$ select v98_private.get_blogger_refresh_token(p_user_id,p_connection_id); $$;

create or replace function public."v98_private.store_blogger_refresh_token"(p_user_id uuid, p_connection_id uuid, p_refresh_token text)
returns uuid
language sql
security definer
set search_path=''
as $$ select v98_private.store_blogger_refresh_token(p_user_id,p_connection_id,p_refresh_token); $$;

revoke all on function public."v98_private.consume_blogger_oauth_state"(text) from public, anon, authenticated;
revoke all on function public."v98_private.get_blogger_refresh_token"(uuid,uuid) from public, anon, authenticated;
revoke all on function public."v98_private.store_blogger_refresh_token"(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public."v98_private.consume_blogger_oauth_state"(text) to service_role;
grant execute on function public."v98_private.get_blogger_refresh_token"(uuid,uuid) to service_role;
grant execute on function public."v98_private.store_blogger_refresh_token"(uuid,uuid,text) to service_role;

