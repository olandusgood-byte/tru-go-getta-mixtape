-- AB-005 Continuous Staging
-- Reconciled to the existing TGG build/staging/checkpoint contracts.
-- Additive only. Production advancement remains separately gated.
-- Existing contracts preserved:
--   tgg_build_staging_releases
--   tgg_launch_smoke_results (pass/fail/blocked/manual)
--   tgg_release_checkpoints (globally unique checkpoint_key + optional created_by)
--   tgg_build_release_candidates (production_approval_required remains true)

create or replace function public.ab005_prepare_staging(
  p_build_release_id uuid,
  p_run_id uuid default null,
  p_staging_key text default null,
  p_build_version text default null,
  p_previous_stable_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  if p_build_release_id is null then raise exception 'AB-005 build release id is required'; end if;
  if nullif(trim(p_staging_key), '') is null then raise exception 'AB-005 staging key is required'; end if;
  if nullif(trim(p_build_version), '') is null then raise exception 'AB-005 build version is required'; end if;

  insert into public.tgg_build_staging_releases(
    build_release_id, run_id, staging_key, build_version, status, previous_stable_key
  )
  values(
    p_build_release_id, p_run_id, p_staging_key, p_build_version, 'prepared', p_previous_stable_key
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.ab005_record_smoke(
  p_staging_release_id uuid,
  p_result text,
  p_detail jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage public.tgg_build_staging_releases%rowtype;
  v_check_key text;
  v_id bigint;
begin
  if p_result not in ('pass','fail','blocked','manual') then
    raise exception 'AB-005 smoke result must be pass, fail, blocked, or manual';
  end if;

  select * into v_stage
  from public.tgg_build_staging_releases
  where id = p_staging_release_id
  for update;

  if not found then
    raise exception 'AB-005 staging release not found: %', p_staging_release_id;
  end if;

  v_check_key := 'ab005:' || v_stage.staging_key || ':' ||
    coalesce(nullif(trim(p_detail->>'check_key'), ''), 'smoke');

  insert into public.tgg_launch_smoke_results(check_key, status, detail, checked_at)
  values(
    v_check_key,
    p_result,
    coalesce(p_detail, '{}'::jsonb) ||
      jsonb_build_object('staging_release_id', p_staging_release_id, 'created_by', p_created_by),
    clock_timestamp()
  )
  returning id into v_id;

  update public.tgg_build_staging_releases
  set status = case
      when p_result in ('fail','blocked') then 'failed'
      when p_result = 'pass' then 'smoke_testing'
      else status
    end,
    smoke_summary = coalesce(smoke_summary, '{}'::jsonb) ||
      jsonb_build_object('last_result', p_result, 'last_smoke_id', v_id)
  where id = p_staging_release_id;

  return jsonb_build_object(
    'staging_release_id', p_staging_release_id,
    'smoke_id', v_id,
    'result', p_result
  );
end;
$$;

create or replace function public.ab005_rollback_staging(
  p_staging_release_id uuid,
  p_rollback_reference text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_cutoff timestamptz;
begin
  if nullif(trim(p_rollback_reference), '') is null then
    raise exception 'AB-005 rollback reference is required';
  end if;

  v_cutoff := clock_timestamp();

  update public.tgg_build_staging_releases
  set status = 'rolled_back',
      previous_stable_key = p_rollback_reference,
      rolled_back_at = v_cutoff,
      smoke_summary = coalesce(smoke_summary, '{}'::jsonb) ||
        jsonb_build_object('rollback_reference', p_rollback_reference, 'rollback_cutoff', v_cutoff)
  where id = p_staging_release_id;

  if not found then
    raise exception 'AB-005 staging release not found: %', p_staging_release_id;
  end if;

  return jsonb_build_object(
    'staging_release_id', p_staging_release_id,
    'status', 'rolled_back',
    'rollback_reference', p_rollback_reference,
    'rollback_cutoff', v_cutoff
  );
end;
$$;

create or replace function public.ab005_checkpoint(
  p_staging_release_id uuid,
  p_checkpoint_key text,
  p_title text default 'AB-005 Continuous Staging Checkpoint',
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare v_stage public.tgg_build_staging_releases%rowtype;
begin
  if nullif(trim(p_checkpoint_key), '') is null then
    raise exception 'AB-005 checkpoint key is required';
  end if;

  select * into v_stage
  from public.tgg_build_staging_releases
  where id = p_staging_release_id;

  if not found then
    raise exception 'AB-005 staging release not found: %', p_staging_release_id;
  end if;

  insert into public.tgg_release_checkpoints(
    checkpoint_key, title, system_state, runtime_manifest, launch_readiness, notes, created_by
  )
  values(
    p_checkpoint_key,
    coalesce(nullif(trim(p_title), ''), 'AB-005 Continuous Staging Checkpoint'),
    jsonb_build_object(
      'environment','staging',
      'staging_release_id',p_staging_release_id,
      'staging_key',v_stage.staging_key,
      'status',v_stage.status
    ),
    coalesce(v_stage.deployment_manifest, '{}'::jsonb),
    jsonb_build_object(
      'environment','staging',
      'production_promoted',false,
      'production_gate_required',true
    ),
    jsonb_build_object(
      'rollback_reference',v_stage.previous_stable_key,
      'smoke_summary',coalesce(v_stage.smoke_summary,'{}'::jsonb)
    ),
    p_created_by
  );

  update public.tgg_build_staging_releases
  set checkpoint_key = p_checkpoint_key
  where id = p_staging_release_id;

  return jsonb_build_object(
    'staging_release_id',p_staging_release_id,
    'checkpoint_key',p_checkpoint_key
  );
end;
$$;

create or replace function public.ab005_advance_after_clean_pass(
  p_staging_release_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage public.tgg_build_staging_releases%rowtype;
  v_after timestamptz;
  v_total bigint;
  v_pass bigint;
  v_bad bigint;
  v_checkpoint boolean;
  v_candidate_id uuid;
begin
  select * into v_stage
  from public.tgg_build_staging_releases
  where id = p_staging_release_id
  for update;

  if not found then
    raise exception 'AB-005 staging release not found: %', p_staging_release_id;
  end if;

  if nullif(trim(v_stage.checkpoint_key), '') is null then
    raise exception 'AB-005 cannot advance without a checkpoint';
  end if;

  select exists(
    select 1 from public.tgg_release_checkpoints c
    where c.checkpoint_key = v_stage.checkpoint_key
  ) into v_checkpoint;

  if not v_checkpoint then
    raise exception 'AB-005 checkpoint key does not exist: %', v_stage.checkpoint_key;
  end if;

  v_after := coalesce(
    nullif(v_stage.smoke_summary->>'rollback_cutoff','')::timestamptz,
    v_stage.created_at
  );

  select count(*),
         count(*) filter (where status='pass'),
         count(*) filter (where status in ('fail','blocked','manual'))
  into v_total, v_pass, v_bad
  from public.tgg_launch_smoke_results
  where check_key like 'ab005:' || v_stage.staging_key || ':%'
    and checked_at > v_after;

  if v_total = 0 or v_pass <> v_total or v_bad <> 0 then
    raise exception 'AB-005 clean pass required: total=%, pass=%, bad=%', v_total, v_pass, v_bad;
  end if;

  update public.tgg_build_staging_releases
  set status = 'passed',
      verified_at = clock_timestamp(),
      smoke_summary = coalesce(smoke_summary, '{}'::jsonb) ||
        jsonb_build_object('ab005_clean_pass',true,'smoke_count',v_total)
  where id = p_staging_release_id;

  update public.tgg_build_release_candidates
  set status = case
      when status in ('canary','draft','failed','rolled_back','blocked') then 'ready'
      else status
    end,
    updated_at = clock_timestamp()
  where staging_release_id = p_staging_release_id
  returning id into v_candidate_id;

  return jsonb_build_object(
    'staging_release_id',p_staging_release_id,
    'status','passed',
    'candidate_id',v_candidate_id,
    'production_gate_required',true,
    'production_promoted',false
  );
end;
$$;

-- These controls are intentionally not public client APIs.
revoke all on function public.ab005_prepare_staging(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.ab005_record_smoke(uuid,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.ab005_rollback_staging(uuid,text) from public, anon, authenticated;
revoke all on function public.ab005_checkpoint(uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.ab005_advance_after_clean_pass(uuid) from public, anon, authenticated;

-- Production intentionally has no automatic advancement function in AB-005.
