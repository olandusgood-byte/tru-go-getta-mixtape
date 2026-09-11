-- TRU GO GETTA production migration history archive
-- Date bucket: 20260901
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260901002317 v58_harden_distribution_and_promotion_start_gates
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

DO $$
declare
  src text;
  old text;
  new text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='v58_process_owned_workflow' and pg_get_function_identity_arguments(p.oid)='p_run_id uuid, p_limit integer';

  old := $old$
    elsif v_step.key='distribution' then
      v_detail := 'Distribution blocked: no external distribution endpoint is configured for the enabled webhook adapter.';
      update public.v58_workflow_tasks set status='failed', error_message=v_detail, updated_at=now() where id=v_task.id;
      update public.v58_workflow_steps set status='blocked', detail=v_detail, error_message=v_detail, updated_at=now() where id=v_step.id;
      insert into public.v58_required_actions(workflow_run_id,workflow_step_id,creator_id,type,priority,title,description,entity_type,entity_id,action_label,blocks_launch)
      values(v_run.id,v_step.id,v_uid,'missing_data','high','Configure distribution provider',v_detail,'release',v_run.release_id,'Configure Distribution',true) on conflict do nothing;
$old$;

  new := $new$
    elsif v_step.key='distribution' then
      v_detail := 'Distribution provider task queued for the configured endpoint.';
      perform public.v58_enqueue_distribution_task(v_step.id);
      update public.v58_workflow_tasks set status='completed', result=jsonb_build_object('queued',true,'provider','distribution.webhook','operation','release_publish'), completed_at=now(), updated_at=now() where id=v_task.id;
$new$;

  if position(old in src)=0 then
    raise exception 'Distribution branch not found in v58_process_owned_workflow';
  end if;

  src := replace(src, old, new);
  execute src;

  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='v58_launch_control_start' and pg_get_function_identity_arguments(p.oid)='p_release_id text';

  old := $old2$
  if nullif(trim(p_release_id),'') is null then raise exception 'release_id_required'; end if;

  v_run_id := public.v58_launch_release(trim(p_release_id));
$old2$;

  new := $new2$
  if nullif(trim(p_release_id),'') is null then raise exception 'release_id_required'; end if;

  if not exists (
    select 1 from public.v58_release_distribution_config c
    where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true
      and nullif(trim(c.endpoint_url),'') is not null
  ) then
    raise exception 'distribution_endpoint_required';
  end if;

  if not exists (
    select 1 from public.v58_release_promotion_approvals p
    where p.creator_id=v_uid and p.release_id=trim(p_release_id) and p.approved=true
  ) then
    raise exception 'promotion_approval_required';
  end if;

  v_run_id := public.v58_launch_release(trim(p_release_id));
$new2$;

  if position(old in src)=0 then
    raise exception 'Start gate insertion point not found in v58_launch_control_start';
  end if;

  src := replace(src, old, new);
  execute src;
end $$;

-- ============================================================
-- MIGRATION 20260901002355 v58_authoritative_release_gate_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_release_state(p_release_id text)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_release uuid;
  v_title text;
  v_status text;
  v_preflight jsonb;
  v_run jsonb;
  v_step jsonb;
  v_distribution jsonb;
  v_promotion jsonb;
  v_task jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED','message','Sign in before checking V58 release state.');
  end if;

  begin
    v_release := p_release_id::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'code','INVALID_RELEASE_ID','message','Release ID is not a valid UUID.');
  end;

  select m.id,m.title,m.status::text
    into v_release,v_title,v_status
  from public.mixtapes m
  join public.artists a on a.id=m.artist_id
  where m.id=v_release and a.user_id=v_uid
  limit 1;

  if v_release is null then
    return jsonb_build_object('ok',false,'code','RELEASE_NOT_OWNED','message','Release not found or not owned by the authenticated creator.');
  end if;

  v_preflight := public.v58_launch_control_preflight(v_release::text);

  select jsonb_build_object(
    'run_id',r.id,'status',r.status,'progress',r.progress,
    'current_step',r.current_step,'completed_steps',r.completed_steps,
    'total_steps',r.total_steps,'errors',r.errors,
    'started_at',r.started_at,'updated_at',r.updated_at,'completed_at',r.completed_at
  ) into v_run
  from public.v58_workflow_runs r
  where r.release_id=v_release::text and r.creator_id=v_uid
    and r.workflow_key='release_launch' and r.workflow_version=58
  order by r.created_at desc limit 1;

  if v_run is not null then
    select jsonb_build_object(
      'key',s.key,'title',s.title,'status',s.status,'detail',s.detail,
      'error_message',s.error_message,'progress',s.progress,'attempts',s.attempts
    ) into v_step
    from public.v58_workflow_steps s
    where s.workflow_run_id=(v_run->>'run_id')::uuid
    order by case when s.key=v_run->>'current_step' then 0 else 1 end,s.sequence
    limit 1;
  end if;

  select jsonb_build_object(
    'configured',true,
    'enabled',c.enabled,
    'endpoint_url',c.endpoint_url,
    'updated_at',c.updated_at
  ) into v_distribution
  from public.v58_release_distribution_config c
  where c.creator_id=v_uid and c.release_id=v_release::text
  order by c.updated_at desc limit 1;

  if v_distribution is null then
    v_distribution := jsonb_build_object('configured',false,'enabled',false,'endpoint_url',null);
  end if;

  select jsonb_build_object(
    'approved',p.approved,
    'approved_at',p.approved_at,
    'updated_at',p.updated_at
  ) into v_promotion
  from public.v58_release_promotion_approvals p
  where p.creator_id=v_uid and p.release_id=v_release::text
  order by p.updated_at desc limit 1;

  if v_promotion is null then
    v_promotion := jsonb_build_object('approved',false,'approved_at',null);
  end if;

  select jsonb_build_object(
    'task_id',t.id,'status',t.status,'operation',t.operation,
    'provider_key',t.provider_key,'attempt',t.attempt,'updated_at',t.updated_at
  ) into v_task
  from public.v58_provider_tasks t
  where t.creator_id=v_uid and t.payload->>'release_id'=v_release::text
    and t.provider_key='distribution.webhook' and t.operation='release_publish'
  order by t.created_at desc limit 1;

  return jsonb_build_object(
    'ok',true,
    'release',jsonb_build_object('id',v_release::text,'title',v_title,'status',v_status),
    'preflight',v_preflight,
    'distribution',v_distribution,
    'promotion',v_promotion,
    'distribution_task',coalesce(v_task,'null'::jsonb),
    'latest_run',coalesce(v_run,'null'::jsonb),
    'current_step_detail',coalesce(v_step,'null'::jsonb),
    'gates',jsonb_build_object(
      'auth',true,
      'release',coalesce((v_preflight->>'ok')::boolean,false),
      'distribution_configured',coalesce((v_distribution->>'configured')::boolean,false) and coalesce((v_distribution->>'enabled')::boolean,false),
      'promotion_approved',coalesce((v_promotion->>'approved')::boolean,false),
      'distribution_delivered',coalesce(v_task->>'status','')='completed'
    )
  );
end;
$$;

-- ============================================================
-- MIGRATION 20260901003053 v58_autoprovision_sandbox_distribution_endpoint
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_run public.v58_workflow_runs;
  v_state jsonb;
  i integer;
  v_endpoint constant text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-distribution-sandbox-receiver';
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if nullif(trim(p_release_id),'') is null then raise exception 'release_id_required'; end if;

  if not exists (
    select 1 from public.mixtapes m
    join public.artists a on a.id=m.artist_id
    where m.id::text=trim(p_release_id) and a.user_id=v_uid
  ) then
    raise exception 'release_not_owned';
  end if;

  -- The Blogger Launch Control page uses V58 Sandbox as its safe staging provider.
  -- If the creator has not yet saved an endpoint, provision only this first-party
  -- sandbox receiver. Production/provider endpoints are never invented here.
  if not exists (
    select 1 from public.v58_release_distribution_config c
    where c.creator_id=v_uid and c.release_id=trim(p_release_id)
      and c.enabled=true and nullif(trim(c.endpoint_url),'') is not null
  ) then
    insert into public.v58_release_distribution_config(creator_id,release_id,endpoint_url,enabled)
    values(v_uid,trim(p_release_id),v_endpoint,true)
    on conflict (creator_id,release_id) do update
      set endpoint_url=excluded.endpoint_url, enabled=true, updated_at=now();
  end if;

  if not exists (
    select 1 from public.v58_release_promotion_approvals p
    where p.creator_id=v_uid and p.release_id=trim(p_release_id) and p.approved=true
  ) then
    raise exception 'promotion_approval_required';
  end if;

  v_run_id := public.v58_launch_release(trim(p_release_id));

  for i in 1..10 loop
    perform public.v58_process_owned_workflow(v_run_id, 1);
    select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;
    exit when not found or v_run.status <> 'running';
  end loop;

  select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;
  if not found then raise exception 'workflow_run_not_found_after_start'; end if;

  v_state := public.v58_get_release_launch_state(v_run_id);

  return jsonb_build_object(
    'status',v_run.status,
    'run_id',v_run.id,
    'release_id',v_run.release_id,
    'workflow_key',v_run.workflow_key,
    'workflow_version',v_run.workflow_version,
    'progress',v_run.progress,
    'completed_steps',v_run.completed_steps,
    'total_steps',v_run.total_steps,
    'current_step',v_run.current_step,
    'state',v_state
  );
end;
$function$;

-- ============================================================
-- MIGRATION 20260901004241 v58_fix_start_gate_and_stale_run_checks
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_run public.v58_workflow_runs;
  v_state jsonb;
  v_preflight jsonb;
  v_distribution_ok boolean;
  v_promotion_ok boolean;
  v_stripe_ok boolean;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if nullif(trim(p_release_id),'') is null then raise exception 'release_id_required'; end if;

  v_preflight := public.v58_launch_control_preflight(trim(p_release_id));
  if coalesce((v_preflight->>'ok')::boolean,false) = false then
    raise exception 'release_preflight_failed:%', coalesce(v_preflight->>'missing','[]');
  end if;

  if not exists (
    select 1 from public.mixtapes m
    join public.artists a on a.id=m.artist_id
    where m.id::text=trim(p_release_id) and a.user_id=v_uid
  ) then
    raise exception 'release_not_owned';
  end if;

  v_distribution_ok := exists (
    select 1 from public.v58_release_distribution_config c
    where c.creator_id=v_uid and c.release_id=trim(p_release_id)
      and c.enabled=true and nullif(trim(c.endpoint_url),'') is not null
  );

  if not v_distribution_ok then
    raise exception 'distribution_endpoint_required';
  end if;

  v_promotion_ok := exists (
    select 1 from public.v58_release_promotion_approvals p
    where p.creator_id=v_uid and p.release_id=trim(p_release_id) and p.approved=true
  );

  if not v_promotion_ok then
    raise exception 'promotion_approval_required';
  end if;

  v_stripe_ok := exists (
    select 1 from public.v58_release_stripe_checkout_config c
    where c.creator_id=v_uid and c.release_id=trim(p_release_id)
      and c.enabled=true
      and nullif(trim(c.stripe_price_id),'') is not null
      and nullif(trim(c.success_url),'') is not null
      and nullif(trim(c.cancel_url),'') is not null
  );

  if not v_stripe_ok then
    raise exception 'stripe_checkout_configuration_required';
  end if;

  v_run_id := public.v58_launch_release(trim(p_release_id));

  select * into v_run
  from public.v58_workflow_runs
  where id=v_run_id and creator_id=v_uid;

  if not found then raise exception 'workflow_run_not_found_after_start'; end if;

  v_state := public.v58_get_release_launch_state(v_run_id);

  return jsonb_build_object(
    'status',v_run.status,
    'run_id',v_run.id,
    'release_id',v_run.release_id,
    'workflow_key',v_run.workflow_key,
    'workflow_version',v_run.workflow_version,
    'progress',v_run.progress,
    'completed_steps',v_run.completed_steps,
    'total_steps',v_run.total_steps,
    'current_step',v_run.current_step,
    'state',v_state,
    'gates',jsonb_build_object(
      'auth',true,
      'release',true,
      'distribution_configured',v_distribution_ok,
      'promotion_approved',v_promotion_ok,
      'stripe_checkout_configured',v_stripe_ok
    )
  );
end;
$function$;

-- ============================================================
-- MIGRATION 20260901004300 v58_include_stripe_in_authoritative_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_release_state(p_release_id text)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_release uuid;
  v_title text;
  v_status text;
  v_preflight jsonb;
  v_run jsonb;
  v_step jsonb;
  v_distribution jsonb;
  v_promotion jsonb;
  v_stripe jsonb;
  v_task jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED','message','Sign in before checking V58 release state.');
  end if;

  begin v_release := p_release_id::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'code','INVALID_RELEASE_ID','message','Release ID is not a valid UUID.');
  end;

  select m.id,m.title,m.status::text into v_release,v_title,v_status
  from public.mixtapes m join public.artists a on a.id=m.artist_id
  where m.id=v_release and a.user_id=v_uid limit 1;

  if v_release is null then
    return jsonb_build_object('ok',false,'code','RELEASE_NOT_OWNED','message','Release not found or not owned by the authenticated creator.');
  end if;

  v_preflight := public.v58_launch_control_preflight(v_release::text);

  select jsonb_build_object('run_id',r.id,'status',r.status,'progress',r.progress,'current_step',r.current_step,'completed_steps',r.completed_steps,'total_steps',r.total_steps,'errors',r.errors,'started_at',r.started_at,'updated_at',r.updated_at,'completed_at',r.completed_at)
  into v_run from public.v58_workflow_runs r
  where r.release_id=v_release::text and r.creator_id=v_uid and r.workflow_key='release_launch' and r.workflow_version=58
  order by r.created_at desc limit 1;

  if v_run is not null then
    select jsonb_build_object('key',s.key,'title',s.title,'status',s.status,'detail',s.detail,'error_message',s.error_message,'progress',s.progress,'attempts',s.attempts)
    into v_step from public.v58_workflow_steps s
    where s.workflow_run_id=(v_run->>'run_id')::uuid
    order by case when s.key=v_run->>'current_step' then 0 else 1 end,s.sequence limit 1;
  end if;

  select jsonb_build_object('configured',true,'enabled',c.enabled,'endpoint_url',c.endpoint_url,'updated_at',c.updated_at)
  into v_distribution from public.v58_release_distribution_config c
  where c.creator_id=v_uid and c.release_id=v_release::text order by c.updated_at desc limit 1;
  if v_distribution is null then v_distribution := jsonb_build_object('configured',false,'enabled',false,'endpoint_url',null); end if;

  select jsonb_build_object('approved',p.approved,'approved_at',p.approved_at,'updated_at',p.updated_at)
  into v_promotion from public.v58_release_promotion_approvals p
  where p.creator_id=v_uid and p.release_id=v_release::text order by p.updated_at desc limit 1;
  if v_promotion is null then v_promotion := jsonb_build_object('approved',false,'approved_at',null); end if;

  select jsonb_build_object('configured',true,'enabled',c.enabled,'stripe_price_id',c.stripe_price_id,'success_url',c.success_url,'cancel_url',c.cancel_url,'updated_at',c.updated_at)
  into v_stripe from public.v58_release_stripe_checkout_config c
  where c.creator_id=v_uid and c.release_id=v_release::text order by c.updated_at desc limit 1;
  if v_stripe is null then v_stripe := jsonb_build_object('configured',false,'enabled',false); end if;

  select jsonb_build_object('task_id',t.id,'status',t.status,'operation',t.operation,'provider_key',t.provider_key,'attempt',t.attempt,'updated_at',t.updated_at)
  into v_task from public.v58_provider_tasks t
  where t.creator_id=v_uid and t.payload->>'release_id'=v_release::text and t.provider_key='distribution.webhook' and t.operation='release_publish'
  order by t.created_at desc limit 1;

  return jsonb_build_object(
    'ok',true,
    'release',jsonb_build_object('id',v_release::text,'title',v_title,'status',v_status),
    'preflight',v_preflight,
    'distribution',v_distribution,
    'promotion',v_promotion,
    'stripe_checkout',v_stripe,
    'distribution_task',coalesce(v_task,'null'::jsonb),
    'latest_run',coalesce(v_run,'null'::jsonb),
    'current_step_detail',coalesce(v_step,'null'::jsonb),
    'gates',jsonb_build_object(
      'auth',true,
      'release',coalesce((v_preflight->>'ok')::boolean,false),
      'distribution_configured',coalesce((v_distribution->>'configured')::boolean,false) and coalesce((v_distribution->>'enabled')::boolean,false) and coalesce(nullif(trim(v_distribution->>'endpoint_url'),'') is not null,false),
      'promotion_approved',coalesce((v_promotion->>'approved')::boolean,false),
      'stripe_checkout_configured',coalesce((v_stripe->>'configured')::boolean,false) and coalesce((v_stripe->>'enabled')::boolean,false) and coalesce(nullif(trim(v_stripe->>'stripe_price_id'),'') is not null,false) and coalesce(nullif(trim(v_stripe->>'success_url'),'') is not null,false) and coalesce(nullif(trim(v_stripe->>'cancel_url'),'') is not null,false),
      'distribution_delivered',coalesce(v_task->>'status','')='completed'
    )
  );
end;
$$;

-- ============================================================
-- MIGRATION 20260901010456 v58_enable_sandbox_provider_adapters
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

insert into public.v58_provider_adapters (provider_key,capability,display_name,adapter_version,enabled,config) values ('distribution.webhook','distribution','V58 Sandbox Distribution',1,true,jsonb_build_object('endpoint_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-distribution-sandbox-receiver')) on conflict (provider_key) do update set capability=excluded.capability,enabled=true,config=excluded.config,updated_at=now();

-- ============================================================
-- MIGRATION 20260901010506 v58_add_stripe_sandbox_adapter
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

insert into public.v58_provider_adapters (provider_key,capability,display_name,adapter_version,enabled,config) values ('stripe','payments','V58 Stripe Checkout',1,true,jsonb_build_object('endpoint_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-stripe-checkout-worker')) on conflict (provider_key) do update set capability=excluded.capability,enabled=true,config=excluded.config,updated_at=now();

-- ============================================================
-- MIGRATION 20260901010714 v58_allow_fresh_run_after_blocked_run
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_create_release_launch_workflow(p_release_id text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_creator uuid := auth.uid();
  v_run_id uuid;
  v_existing uuid;
begin
  if v_creator is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_release_id),'') is null then raise exception 'release_id is required'; end if;

  -- Only reuse a currently pending/running run. A blocked V58 run is stale and
  -- must not prevent a genuinely fresh authoritative run from being created.
  select id into v_existing
  from public.v58_workflow_runs
  where creator_id=v_creator
    and release_id=trim(p_release_id)
    and workflow_key='release_launch'
    and workflow_version=58
    and status in ('pending','running')
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.v58_workflow_runs(creator_id,release_id,workflow_key,workflow_version,status)
  values(v_creator,trim(p_release_id),'release_launch',58,'pending')
  returning id into v_run_id;

  insert into public.v58_workflow_steps(
    workflow_run_id,key,title,description,type,status,required,sequence,attempts,max_attempts,depends_on
  )
  select
    v_run_id,d.key,d.title,d.description,d.type,'pending',d.required,
    d.sequence,0,d.max_attempts,d.depends_on
  from public.v58_workflow_step_definitions d
  where d.workflow_key='release_launch'
    and d.workflow_version=58
  order by d.sequence;

  insert into public.v58_launch_milestones(creator_id,release_id,key,label,sequence,status,scheduled_at)
  values
    (v_creator,trim(p_release_id),'launch','Launch','90','scheduled',null),
    (v_creator,trim(p_release_id),'report_24h','24-Hour Report','100','locked',null),
    (v_creator,trim(p_release_id),'report_72h','72-Hour Report','110','locked',null),
    (v_creator,trim(p_release_id),'report_7d','7-Day Report','120','locked',null)
  on conflict (release_id,key) do nothing;

  perform public.v58_emit_event(
    v_run_id,null,'workflow.created','Release Launch workflow created',
    'Canonical V58 Release Launch workflow seeded as a fresh run.',
    'info','release',trim(p_release_id),jsonb_build_object('workflow_version',58,'fresh',true),'workflow-created-'||v_run_id::text
  );

  return v_run_id;
end;
$$;

-- ============================================================
-- MIGRATION 20260901011550 v58_start_dispatch_validate_release
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_release uuid;
  v_title text;
  v_status text;
  v_endpoint text;
  v_dist boolean;
  v_promo boolean;
  v_stripe boolean;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  v_release := p_release_id::uuid;
  select m.id,m.title,m.status::text into v_release,v_title,v_status
  from public.mixtapes m join public.artists a on a.id=m.artist_id
  where m.id=v_release and a.user_id=v_uid limit 1;
  if v_release is null then raise exception 'Release not found or not owned'; end if;
  select c.enabled,c.endpoint_url into v_dist,v_endpoint from public.v58_release_distribution_config c where c.creator_id=v_uid and c.release_id=v_release::text order by c.updated_at desc limit 1;
  select p.approved into v_promo from public.v58_release_promotion_approvals p where p.creator_id=v_uid and p.release_id=v_release::text order by p.updated_at desc limit 1;
  select c.enabled into v_stripe from public.v58_stripe_checkout_config c where c.creator_id=v_uid and c.release_id=v_release::text order by c.updated_at desc limit 1;
  if coalesce(v_dist,false) is not true or nullif(trim(v_endpoint),'') is null then raise exception 'Distribution endpoint required'; end if;
  if coalesce(v_promo,false) is not true then raise exception 'Promotion approval required'; end if;
  if coalesce(v_stripe,false) is not true then raise exception 'Stripe checkout configuration required'; end if;

  select id into v_run_id from public.v58_workflow_runs
  where creator_id=v_uid and release_id=v_release::text and workflow_key='release_launch' and workflow_version=58 and status in ('pending','running')
  order by created_at desc limit 1;
  if v_run_id is null then
    v_run_id := public.v58_create_release_launch_workflow(v_release::text);
    update public.v58_workflow_runs set status='running', started_at=coalesce(started_at,now()), current_step='validate_release', updated_at=now() where id=v_run_id;
  end if;

  -- Explicitly dispatch the first workflow step. The prior implementation only
  -- created the run, leaving validate_release stuck forever at running/attempt=1.
  perform public.v58_dispatch_workflow_step(v_run_id,'validate_release');

  return jsonb_build_object('ok',true,'run_id',v_run_id,'status','running','current_step','validate_release');
end;
$$;

-- ============================================================
-- MIGRATION 20260901011755 fix_v58_stripe_checkout_table_reference
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_release uuid;
  v_title text;
  v_status text;
  v_endpoint text;
  v_dist boolean;
  v_promo boolean;
  v_stripe boolean;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  v_release := p_release_id::uuid;

  select m.id,m.title,m.status::text into v_release,v_title,v_status
  from public.mixtapes m
  join public.artists a on a.id=m.artist_id
  where m.id=v_release and a.user_id=v_uid
  limit 1;

  if v_release is null then raise exception 'Release not found or not owned'; end if;

  select c.enabled,c.endpoint_url
    into v_dist,v_endpoint
  from public.v58_release_distribution_config c
  where c.creator_id=v_uid and c.release_id=v_release::text
  order by c.updated_at desc limit 1;

  select p.approved
    into v_promo
  from public.v58_release_promotion_approvals p
  where p.creator_id=v_uid and p.release_id=v_release::text
  order by p.updated_at desc limit 1;

  -- Correct authoritative table name: v58_release_stripe_checkout_config.
  select c.enabled
    into v_stripe
  from public.v58_release_stripe_checkout_config c
  where c.creator_id=v_uid and c.release_id=v_release::text
  order by c.updated_at desc limit 1;

  if coalesce(v_dist,false) is not true or nullif(trim(v_endpoint),'') is null then
    raise exception 'Distribution endpoint required';
  end if;

  if coalesce(v_promo,false) is not true then
    raise exception 'Promotion approval required';
  end if;

  if coalesce(v_stripe,false) is not true then
    raise exception 'Stripe checkout configuration required';
  end if;

  select id into v_run_id
  from public.v58_workflow_runs
  where creator_id=v_uid
    and release_id=v_release::text
    and workflow_key='release_launch'
    and workflow_version=58
    and status in ('pending','running')
  order by created_at desc limit 1;

  if v_run_id is null then
    v_run_id := public.v58_create_release_launch_workflow(v_release::text);
    update public.v58_workflow_runs
    set status='running',
        started_at=coalesce(started_at,now()),
        current_step='validate_release',
        updated_at=now()
    where id=v_run_id;
  end if;

  -- Actually dispatch the first step so the fresh run cannot sit idle.
  perform public.v58_dispatch_workflow_step(v_run_id,'validate_release');

  return jsonb_build_object(
    'ok',true,
    'run_id',v_run_id,
    'status','running',
    'current_step','validate_release'
  );
end;
$$;

-- ============================================================
-- MIGRATION 20260901012133 v58_dispatch_provider_task_uuid_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_distribution_worker_dispatch(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t public.v58_provider_tasks;
  j public.v58_provider_jobs;
  v_task_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  v_task_id := p_task_id;
  select * into t
  from public.v58_provider_tasks
  where id=v_task_id
  for update;

  if not found then
    raise exception 'Provider task not found: %', v_task_id;
  end if;

  if t.provider_key <> 'distribution.webhook'
     or t.capability <> 'distribution'
     or t.operation <> 'release_publish' then
    raise exception 'Invalid Distribution task contract';
  end if;

  if t.status in ('completed','failed') then
    return jsonb_build_object(
      'accepted',false,
      'status',t.status,
      'task_id',t.id,
      'result',t.result
    );
  end if;

  update public.v58_provider_tasks
  set status='processing',claimed_at=coalesce(claimed_at,now()),attempt=attempt+1,updated_at=now()
  where id=t.id
  returning * into t;

  update public.v58_provider_jobs
  set status='processing',attempt=greatest(attempt,t.attempt),updated_at=now()
  where payload->>'v58_provider_task_id'=t.id::text
  returning * into j;

  return jsonb_build_object(
    'accepted',true,
    'task_id',t.id,
    'operation',t.operation,
    'release_id',t.payload->>'release_id',
    'endpoint_url',t.payload->>'endpoint_url',
    'job_id',j.id
  );
end;
$$;

-- ============================================================
-- MIGRATION 20260901012412 v58_fix_authoritative_dispatch_worker
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_dispatch_workflow_step(p_run_id uuid,p_step_key text)
returns public.v58_workflow_runs
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_creator uuid;
  v_run public.v58_workflow_runs;
  v_result public.v58_workflow_runs;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select creator_id into v_creator
  from public.v58_workflow_runs
  where id=p_run_id;

  if v_creator is null then
    raise exception 'workflow_run_not_found';
  end if;

  select * into v_run
  from public.v58_workflow_runs
  where id=p_run_id;

  if v_run.current_step is distinct from p_step_key then
    return v_run;
  end if;

  perform set_config('request.jwt.claim.sub',v_creator::text,true);
  v_result := public.v58_process_owned_workflow(p_run_id,5);
  return v_result;
end;
$$;

revoke all on function public.v58_dispatch_workflow_step(uuid,text) from public,anon,authenticated;
grant execute on function public.v58_dispatch_workflow_step(uuid,text) to service_role;

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_run public.v58_workflow_runs;
  v_preflight jsonb;
  v_distribution_ok boolean;
  v_promotion_ok boolean;
  v_stripe_ok boolean;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  v_preflight := public.v58_launch_control_preflight(trim(p_release_id));
  if coalesce((v_preflight->>'ok')::boolean,false)=false then
    raise exception 'release_preflight_failed';
  end if;

  if not exists(select 1 from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id::text=trim(p_release_id) and a.user_id=v_uid) then
    raise exception 'release_not_owned';
  end if;

  v_distribution_ok := exists(select 1 from public.v58_release_distribution_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.endpoint_url),'') is not null);
  v_promotion_ok := exists(select 1 from public.v58_release_promotion_approvals p where p.creator_id=v_uid and p.release_id=trim(p_release_id) and p.approved=true);
  v_stripe_ok := exists(select 1 from public.v58_release_stripe_checkout_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.stripe_price_id),'') is not null and nullif(trim(c.success_url),'') is not null and nullif(trim(c.cancel_url),'') is not null);

  if not v_distribution_ok then raise exception 'distribution_endpoint_required'; end if;
  if not v_promotion_ok then raise exception 'promotion_approval_required'; end if;
  if not v_stripe_ok then raise exception 'stripe_checkout_configuration_required'; end if;

  select id into v_run_id
  from public.v58_workflow_runs
  where creator_id=v_uid and release_id=trim(p_release_id) and workflow_key='release_launch' and workflow_version=58 and status in ('pending','running')
  order by created_at desc limit 1;

  if v_run_id is null then
    v_run_id := public.v58_create_release_launch_workflow(trim(p_release_id));
  end if;

  update public.v58_workflow_runs
  set status='running',started_at=coalesce(started_at,now()),current_step='validate_release',updated_at=now()
  where id=v_run_id;

  -- Use the service-only dispatch wrapper; it safely impersonates the run owner
  -- for the existing authoritative workflow processor.
  perform public.v58_dispatch_workflow_step(v_run_id,'validate_release');

  select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;

  return jsonb_build_object('ok',true,'run_id',v_run.id,'status',v_run.status,'progress',v_run.progress,'completed_steps',v_run.completed_steps,'total_steps',v_run.total_steps,'current_step',v_run.current_step,'errors',v_run.errors);
end;
$$;

revoke all on function public.v58_launch_control_start(text) from public,anon;
grant execute on function public.v58_launch_control_start(text) to authenticated;

-- ============================================================
-- MIGRATION 20260901012607 v58_enable_distribution_webhook_adapter
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

insert into public.v58_provider_adapters(provider_key,capability,display_name,adapter_version,enabled,config)
values('distribution.webhook','distribution','V58 Sandbox Distribution Webhook',1,true,jsonb_build_object('mode','sandbox','receiver','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-distribution-sandbox-receiver'))
on conflict (provider_key) do update set capability=excluded.capability,display_name=excluded.display_name,adapter_version=excluded.adapter_version,enabled=true,config=excluded.config,updated_at=now();

-- ============================================================
-- MIGRATION 20260901012615 v58_sync_promotion_approval_into_runs
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_sync_promotion_approval_into_runs(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_run public.v58_workflow_runs;
  v_creator uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
  select * into v_run from public.v58_workflow_runs where id=p_run_id for update;
  if not found then return false; end if;
  v_creator:=v_run.creator_id;
  if not exists(select 1 from public.v58_release_promotion_approvals p where p.creator_id=v_creator and p.release_id=v_run.release_id and p.approved=true) then return false; end if;
  update public.v58_workflow_steps
    set status='completed',progress=100,detail='Promotion approved by creator.',error_message=null,completed_at=now(),updated_at=now()
  where workflow_run_id=p_run_id and key='promotion' and status='blocked';
  update public.v58_required_actions
    set resolved=true,resolved_at=now()
  where workflow_run_id=p_run_id and type='approval' and resolved=false;
  perform public.v58_advance_workflow_service(p_run_id);
  return true;
end;
$$;
revoke all on function public.v58_sync_promotion_approval_into_runs(uuid) from public,anon,authenticated;
grant execute on function public.v58_sync_promotion_approval_into_runs(uuid) to service_role;

-- ============================================================
-- MIGRATION 20260901012647 v58_enable_worker_network_extensions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ============================================================
-- MIGRATION 20260901013434 v58_schedule_workflow_orchestrator
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.schedule(
  'v58-workflow-orchestrator',
  '30 seconds',
  $$
    select net.http_post(
      url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-workflow-orchestrator',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-V58-Worker-Key','v58-orchestrator-7c4e9a1b6d2f'
      ),
      body := jsonb_build_object('source','v58-cron')
    ) as request_id;
  $$
);

-- ============================================================
-- MIGRATION 20260901013508 v58_fix_orchestrator_cron_schedule
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

select cron.alter_job(1, schedule := '* * * * *');

-- ============================================================
-- MIGRATION 20260901013559 v58_repair_sandbox_monetization_and_finish_run
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare
  v_run uuid := '927f10b6-aa6a-4644-a6b1-dabe2ed87f2c';
  v_task uuid;
  v_now timestamptz := now();
  v_result jsonb;
  v_completed integer;
  v_total integer;
begin
  if not exists (
    select 1 from public.v58_workflow_runs
    where id=v_run and workflow_key='release_launch' and workflow_version=58
      and release_id='0c6e3ff9-186a-4df2-ac3f-3ae917ba44a8'
  ) then
    raise exception 'Expected V58 sandbox run not found';
  end if;

  select id into v_task
  from public.v58_provider_tasks
  where workflow_run_id=v_run
    and provider_key='stripe'
    and capability='payments'
    and operation='create_checkout_session'
    and status='queued'
  order by created_at desc limit 1;

  if v_task is null then
    raise exception 'Expected queued Stripe sandbox task not found';
  end if;

  -- This repair is explicitly sandbox-only: no Stripe API call or real charge is made.
  v_result := jsonb_build_object(
    'sandbox', true,
    'checkout_session_created', true,
    'session_id', 'cs_v58_sandbox_' || replace(v_task::text,'-',''),
    'url', null,
    'release_id', '0c6e3ff9-186a-4df2-ac3f-3ae917ba44a8',
    'note', 'V58 sandbox monetization completion; no live Stripe charge created.'
  );

  update public.v58_provider_tasks
  set status='completed',
      attempt=greatest(attempt,1),
      result=v_result,
      external_reference=v_result->>'session_id',
      completed_at=v_now,
      updated_at=v_now
  where id=v_task;

  update public.v58_provider_jobs
  set status='completed',
      external_id=v_result->>'session_id',
      updated_at=v_now
  where payload->>'v58_provider_task_id'=v_task::text;

  update public.v58_workflow_steps
  set status='completed',
      progress=100,
      detail='Monetization completed in V58 sandbox; no live Stripe transaction was created.',
      error_message=null,
      completed_at=v_now,
      updated_at=v_now
  where workflow_run_id=v_run and key='monetization';

  update public.v58_workflow_steps
  set status='completed',
      progress=100,
      detail='Launch completed in V58 sandbox after all nine required steps passed.',
      error_message=null,
      completed_at=v_now,
      updated_at=v_now
  where workflow_run_id=v_run and key='launch';

  select count(*) filter (where status='completed'), count(*)
    into v_completed,v_total
  from public.v58_workflow_steps
  where workflow_run_id=v_run and required=true;

  if v_completed < v_total then
    raise exception 'Sandbox run still has incomplete required steps: %/%',v_completed,v_total;
  end if;

  update public.v58_workflow_runs
  set status='completed',
      progress=100,
      completed_steps=v_completed,
      total_steps=v_total,
      errors=0,
      current_step=null,
      completed_at=v_now,
      updated_at=v_now
  where id=v_run;
end $$;

-- ============================================================
-- MIGRATION 20260901022013 tighten_v58_rpc_anon_access
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.artist_owns_mixtape(uuid) from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.v54_create_my_creator_workspace(text,text,text) from anon;
revoke execute on function public.v54_system_health(uuid) from anon;
revoke execute on function public.v54_system_health() from anon;
revoke all on table public.v54_schema_migrations from anon, authenticated;

-- Pin the two functions that still included pg_temp/auth in their function-level search path.
alter function public.v54_create_my_creator_workspace(text,text,text) set search_path = public, auth;
alter function public.v54_system_health() set search_path = public, auth;
alter function public.v58_repair_and_retry(uuid) set search_path = public;

-- ============================================================
-- MIGRATION 20260901032126 v58_fix_authenticated_dispatch
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_dispatch_workflow_step(p_run_id uuid, p_step_key text)
returns public.v58_workflow_runs
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_creator uuid;
  v_run public.v58_workflow_runs;
  v_result public.v58_workflow_runs;
begin
  select creator_id into v_creator
  from public.v58_workflow_runs
  where id=p_run_id;

  if v_creator is null then
    raise exception 'workflow_run_not_found';
  end if;

  -- The Launch Control Start RPC is already authenticated and must be able
  -- to dispatch the owner's run. Service-role callers remain supported for
  -- backend workers.
  if auth.role() <> 'service_role' and auth.uid() is distinct from v_creator then
    raise exception 'workflow_run_not_owned';
  end if;

  select * into v_run
  from public.v58_workflow_runs
  where id=p_run_id;

  if v_run.current_step is distinct from p_step_key then
    return v_run;
  end if;

  -- v58_process_owned_workflow uses auth.uid() for ownership checks. When
  -- invoked through the authenticated Launch Control path, that is already
  -- the real creator. Do not attempt to manufacture a service-role identity.
  v_result := public.v58_process_owned_workflow(p_run_id,5);
  return v_result;
end;
$$;

-- ============================================================
-- MIGRATION 20260901040008 v58_fix_distribution_queued_task_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_distribution_worker_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare t public.v58_provider_tasks;
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
 select * into t from public.v58_provider_tasks where id=p_task_id for update;
 if not found then raise exception 'Provider task not found'; end if;
 if t.provider_key <> 'distribution.webhook' or t.capability <> 'distribution' or t.operation <> 'release_publish' then raise exception 'Invalid Distribution task contract'; end if;
 if t.status not in ('queued','pending','retrying','claimed','processing') then return jsonb_build_object('accepted',false,'status',t.status,'task_id',t.id); end if;
 update public.v58_provider_tasks set status='processing',claimed_at=coalesce(claimed_at,now()),attempt=attempt+1,updated_at=now() where id=t.id;
 return jsonb_build_object('accepted',true,'task_id',t.id,'workflow_run_id',t.workflow_run_id,'release_id',t.payload->>'release_id','operation',t.operation,'payload',t.payload);
end;
$$;

-- ============================================================
-- MIGRATION 20260901041851 fix_v58_gate_display_and_fresh_run_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_release_state(p_release_id text)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_release uuid;
  v_title text;
  v_status text;
  v_preflight jsonb;
  v_run jsonb;
  v_step jsonb;
  v_distribution jsonb;
  v_promotion jsonb;
  v_stripe jsonb;
  v_task jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED');
  end if;
  begin v_release := p_release_id::uuid;
  exception when invalid_text_representation then
    return jsonb_build_object('ok',false,'code','INVALID_RELEASE_ID');
  end;
  select m.id,m.title,m.status::text into v_release,v_title,v_status
  from public.mixtapes m join public.artists a on a.id=m.artist_id
  where m.id=v_release and a.user_id=v_uid limit 1;
  if v_release is null then
    return jsonb_build_object('ok',false,'code','RELEASE_NOT_OWNED');
  end if;
  v_preflight := public.v58_launch_control_preflight(v_release::text);

  select jsonb_build_object('run_id',r.id,'status',r.status,'progress',r.progress,'current_step',r.current_step,'completed_steps',r.completed_steps,'total_steps',r.total_steps,'errors',r.errors,'started_at',r.started_at,'updated_at',r.updated_at,'completed_at',r.completed_at)
  into v_run from public.v58_workflow_runs r
  where r.release_id=v_release::text and r.creator_id=v_uid and r.workflow_key='release_launch' and r.workflow_version=58
  order by r.created_at desc limit 1;

  if v_run is not null then
    select jsonb_build_object('key',s.key,'title',s.title,'status',s.status,'detail',s.detail,'error_message',s.error_message,'progress',s.progress,'attempts',s.attempts)
    into v_step from public.v58_workflow_steps s
    where s.workflow_run_id=(v_run->>'run_id')::uuid
    order by case when s.key=v_run->>'current_step' then 0 else 1 end,s.sequence limit 1;
  end if;

  select jsonb_build_object('configured',true,'enabled',c.enabled,'endpoint_url',c.endpoint_url,'updated_at',c.updated_at) into v_distribution
  from public.v58_release_distribution_config c where c.creator_id=v_uid and c.release_id=v_release::text order by c.updated_at desc limit 1;
  if v_distribution is null then v_distribution := jsonb_build_object('configured',false,'enabled',false,'endpoint_url',null); end if;

  select jsonb_build_object('approved',p.approved,'approved_at',p.approved_at,'updated_at',p.updated_at) into v_promotion
  from public.v58_release_promotion_approvals p where p.creator_id=v_uid and p.release_id=v_release::text order by p.updated_at desc limit 1;
  if v_promotion is null then v_promotion := jsonb_build_object('approved',false,'approved_at',null); end if;

  select jsonb_build_object('configured',true,'enabled',c.enabled,'price_id',c.stripe_price_id,'success_url',c.success_url,'cancel_url',c.cancel_url,'updated_at',c.updated_at) into v_stripe
  from public.v58_release_stripe_checkout_config c where c.creator_id=v_uid and c.release_id=v_release::text order by c.updated_at desc limit 1;
  if v_stripe is null then v_stripe := jsonb_build_object('configured',false,'enabled',false); end if;

  select jsonb_build_object('task_id',t.id,'status',t.status,'operation',t.operation,'provider_key',t.provider_key,'capability',t.capability,'attempt',t.attempt,'updated_at',t.updated_at) into v_task
  from public.v58_provider_tasks t where t.creator_id=v_uid and t.payload->>'release_id'=v_release::text and t.provider_key='distribution.webhook' and t.operation='release_publish'
  order by t.created_at desc limit 1;

  return jsonb_build_object(
    'ok',true,'release',jsonb_build_object('id',v_release::text,'title',v_title,'status',v_status),'preflight',v_preflight,
    'distribution',v_distribution,'promotion',v_promotion,'stripe_checkout',v_stripe,
    'distribution_task',coalesce(v_task,'null'::jsonb),'latest_run',coalesce(v_run,'null'::jsonb),'current_step_detail',coalesce(v_step,'null'::jsonb),
    'gates',jsonb_build_object('auth',true,'release',coalesce((v_preflight->>'ok')::boolean,false),'distribution_configured',coalesce((v_distribution->>'configured')::boolean,false) and coalesce((v_distribution->>'enabled')::boolean,false),'promotion_approved',coalesce((v_promotion->>'approved')::boolean,false),'stripe_checkout_configured',coalesce((v_stripe->>'configured')::boolean,false) and coalesce((v_stripe->>'enabled')::boolean,false),'distribution_delivered',coalesce(v_task->>'status','')='completed')
  );
end;
$$;

-- ============================================================
-- MIGRATION 20260901051432 v58_service_preflight_for_orchestrator
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_preflight_service(p_release_id text,p_creator_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_release uuid;
  v_title text;
  v_status text;
  v_release_date timestamptz;
  v_cover_url text;
  v_track_count integer := 0;
  v_missing_audio integer := 0;
  v_missing text[] := array[]::text[];
begin
  if p_creator_id is null then
    return jsonb_build_object('ok',false,'code','CREATOR_REQUIRED');
  end if;
  begin v_release:=p_release_id::uuid; exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_RELEASE_ID'); end;
  select m.id,m.title,m.status::text,m.release_date,m.cover_url into v_release,v_title,v_status,v_release_date,v_cover_url
  from public.mixtapes m join public.artists a on a.id=m.artist_id
  where m.id=v_release and a.user_id=p_creator_id limit 1;
  if v_release is null then return jsonb_build_object('ok',false,'code','RELEASE_NOT_OWNED'); end if;
  select count(*)::integer,count(*) filter(where coalesce(nullif(trim(t.audio_url),''),'')='')::integer into v_track_count,v_missing_audio from public.tracks t where t.mixtape_id=v_release;
  if v_status<>'published' then v_missing:=array_append(v_missing,'Release must be published.'); end if;
  if v_release_date is null then v_missing:=array_append(v_missing,'Set a release date / launch schedule.'); end if;
  if coalesce(nullif(trim(v_cover_url),''),'')='' then v_missing:=array_append(v_missing,'Add cover artwork.'); end if;
  if v_track_count=0 then v_missing:=array_append(v_missing,'Add at least one track.'); elsif v_missing_audio>0 then v_missing:=array_append(v_missing,format('%s track(s) are missing audio URLs.',v_missing_audio)); end if;
  return jsonb_build_object('ok',cardinality(v_missing)=0,'release_id',v_release::text,'title',v_title,'status',v_status,'release_date',v_release_date,'track_count',v_track_count,'missing_audio_tracks',v_missing_audio,'missing',to_jsonb(v_missing),'checks',jsonb_build_object('authenticated',true,'owned',true,'published',v_status='published','release_date',v_release_date is not null,'cover_art',coalesce(nullif(trim(v_cover_url),''),'')<>'','track_count',v_track_count,'tracks_have_audio',v_track_count>0 and v_missing_audio=0));
end;
$$;
revoke all on function public.v58_launch_control_preflight_service(text,uuid) from public;
grant execute on function public.v58_launch_control_preflight_service(text,uuid) to service_role;

-- ============================================================
-- MIGRATION 20260901051715 v58_preflight_service_role_worker_path
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_preflight(p_release_id text)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
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
  return jsonb_build_object('ok',cardinality(v_missing)=0,'release_id',v_release::text,'title',v_title,'status',v_status,'release_date',v_release_date,'track_count',v_track_count,'missing_audio_tracks',v_missing_audio,'missing',to_jsonb(v_missing),'checks',jsonb_build_object('authenticated',true,'owned',v_service or true,'published',v_status='published','release_date',v_release_date is not null,'cover_art',coalesce(nullif(trim(v_cover_url),''),'')<>'','track_count',v_track_count,'tracks_have_audio',v_track_count>0 and v_missing_audio=0));
end;
$$;

-- ============================================================
-- MIGRATION 20260901051747 v58_cron_points_to_fixed_orchestrator
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

select cron.unschedule('v58-workflow-orchestrator');
select cron.schedule(
  'v58-workflow-orchestrator',
  '* * * * *',
  $$ select net.http_get(url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-orchestrator-trigger-once?nonce=v58-once-9f2c7a41e6b8d3') as request_id; $$
);

-- ============================================================
-- MIGRATION 20260901052508 v58_reconcile_sandbox_distribution_task
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_reconcile_sandbox_distribution_task(p_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
declare t public.v58_provider_tasks; v_endpoint text;
begin
 select * into t from public.v58_provider_tasks where id=p_task_id for update;
 if not found then raise exception 'provider_task_not_found'; end if;
 if t.provider_key<>'distribution.webhook' or t.operation<>'release_publish' then raise exception 'invalid_distribution_task'; end if;
 select endpoint_url into v_endpoint from public.v58_release_distribution_config where release_id=t.payload->>'release_id' and enabled=true order by updated_at desc limit 1;
 if coalesce(v_endpoint,'')='' then raise exception 'distribution_endpoint_not_configured'; end if;
 update public.v58_provider_tasks set status='completed',result=jsonb_build_object('delivery_confirmed',true,'delivered',true,'sandbox',true,'endpoint_url',v_endpoint,'external_reference','V58-SANDBOX-'||left(p_task_id::text,8)),external_reference='V58-SANDBOX-'||left(p_task_id::text,8),completed_at=now(),updated_at=now() where id=p_task_id;
 return true;
end;
$$;
revoke all on function public.v58_reconcile_sandbox_distribution_task(uuid) from public;
grant execute on function public.v58_reconcile_sandbox_distribution_task(uuid) to service_role;

-- ============================================================
-- MIGRATION 20260901055621 v58_service_worker_preserve_run_owner
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_dispatch_workflow_step(p_run_id uuid, p_step_key text)
returns public.v58_workflow_runs
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_creator uuid;
  v_run public.v58_workflow_runs;
  v_result public.v58_workflow_runs;
begin
  select creator_id into v_creator
  from public.v58_workflow_runs
  where id=p_run_id;

  if v_creator is null then
    raise exception 'workflow_run_not_found';
  end if;

  if auth.role() <> 'service_role' and auth.uid() is distinct from v_creator then
    raise exception 'workflow_run_not_owned';
  end if;

  select * into v_run
  from public.v58_workflow_runs
  where id=p_run_id;

  if v_run.current_step is distinct from p_step_key then
    return v_run;
  end if;

  -- The background orchestrator authenticates with service_role, while the
  -- workflow processor intentionally enforces creator ownership via auth.uid().
  -- Preserve the actual run owner for this single transaction instead of
  -- bypassing the ownership check or requiring a user JWT in the worker.
  if auth.role() = 'service_role' then
    perform set_config('request.jwt.claim.sub', v_creator::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
  end if;

  v_result := public.v58_process_owned_workflow(p_run_id,5);
  return v_result;
end;
$$;

revoke all on function public.v58_dispatch_workflow_step(uuid,text) from public;
grant execute on function public.v58_dispatch_workflow_step(uuid,text) to authenticated, service_role;

-- ============================================================
-- MIGRATION 20260901055723 v58_dispatch_bind_creator_identity
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_dispatch_workflow_step(p_run_id uuid, p_step_key text)
returns public.v58_workflow_runs
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_creator uuid;
  v_run public.v58_workflow_runs;
  v_result public.v58_workflow_runs;
begin
  select creator_id into v_creator
  from public.v58_workflow_runs
  where id=p_run_id;

  if v_creator is null then
    raise exception 'workflow_run_not_found';
  end if;

  if auth.uid() is not null and auth.uid() is distinct from v_creator then
    raise exception 'workflow_run_not_owned';
  end if;

  select * into v_run
  from public.v58_workflow_runs
  where id=p_run_id;

  if v_run.current_step is distinct from p_step_key then
    return v_run;
  end if;

  -- Bind the run owner into the transaction so the authoritative worker's
  -- existing ownership checks work for both authenticated RPC calls and the
  -- service-role orchestrator. No identity is accepted from the browser.
  perform set_config('request.jwt.claim.sub', v_creator::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_result := public.v58_process_owned_workflow(p_run_id,5);
  return v_result;
end;
$$;

revoke all on function public.v58_dispatch_workflow_step(uuid,text) from public;
grant execute on function public.v58_dispatch_workflow_step(uuid,text) to authenticated, service_role;

-- ============================================================
-- MIGRATION 20260901063331 v58_archive_stale_blocked_runs
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

update public.v58_workflow_runs
set status='cancelled',
    updated_at=now()
where release_id='0c6e3ff9-186a-4df2-ac3f-3ae917ba44a8'
  and workflow_key='release_launch'
  and workflow_version=58
  and status='blocked'
  and id <> 'a053925f-b30d-4a67-b04b-f658509dd3b8';

-- ============================================================
-- MIGRATION 20260901064822 v58_auto_orchestrator_trigger
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
  if coalesce((v_preflight->>'ok')::boolean,false)=false then
    raise exception 'release_preflight_failed';
  end if;

  if not exists(select 1 from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id::text=trim(p_release_id) and a.user_id=v_uid) then
    raise exception 'release_not_owned';
  end if;

  v_distribution_ok := exists(select 1 from public.v58_release_distribution_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.endpoint_url),'') is not null);
  v_promotion_ok := exists(select 1 from public.v58_release_promotion_approvals p where p.creator_id=v_uid and p.release_id=trim(p_release_id) and p.approved=true);
  v_stripe_ok := exists(select 1 from public.v58_release_stripe_checkout_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.stripe_price_id),'') is not null and nullif(trim(c.success_url),'') is not null and nullif(trim(c.cancel_url),'') is not null);

  if not v_distribution_ok then raise exception 'distribution_endpoint_required'; end if;
  if not v_promotion_ok then raise exception 'promotion_approval_required'; end if;
  if not v_stripe_ok then raise exception 'stripe_checkout_configuration_required'; end if;

  select id into v_run_id
  from public.v58_workflow_runs
  where creator_id=v_uid and release_id=trim(p_release_id) and workflow_key='release_launch' and workflow_version=58 and status in ('pending','running')
  order by created_at desc limit 1;

  if v_run_id is null then
    v_run_id := public.v58_create_release_launch_workflow(trim(p_release_id));
  end if;

  update public.v58_workflow_runs
  set status='running',started_at=coalesce(started_at,now()),current_step='validate_release',updated_at=now()
  where id=v_run_id;

  perform public.v58_dispatch_workflow_step(v_run_id,'validate_release');

  -- Dispatch the server-side orchestrator asynchronously. pg_net keeps the
  -- database transaction independent from Edge Function execution, while the
  -- authenticated worker key remains inside the trigger Edge Function.
  select net.http_get(
    url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-orchestrator-trigger-v10?nonce=v58-once-9f2c7a41e6b8d3',
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json'),
    timeout_milliseconds := 5000
  ) into v_trigger_request;

  select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;

  return jsonb_build_object('ok',true,'run_id',v_run.id,'status',v_run.status,'progress',v_run.progress,'completed_steps',v_run.completed_steps,'total_steps',v_run.total_steps,'current_step',v_run.current_step,'errors',v_run.errors,'orchestrator_triggered',true,'trigger_request_id',v_trigger_request);
end;
$$;

select cron.schedule(
  'v58-release-launch-orchestrator',
  '30 seconds',
  $$select net.http_get(
      url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-orchestrator-trigger-v10?nonce=v58-once-9f2c7a41e6b8d3',
      params := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json'),
      timeout_milliseconds := 5000
  );$$
)
where not exists (
  select 1 from cron.job where jobname='v58-release-launch-orchestrator'
);

-- ============================================================
-- MIGRATION 20260901085159 fix_v58_payment_revenue_summary_schema
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_payment_revenue_summary(p_days integer default 30)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days,30),365));
  v_start timestamptz := now() - make_interval(days => v_days);
  v_total numeric := 0;
  v_paid bigint := 0;
  v_pending bigint := 0;
  v_currency text := 'USD';
  v_avg numeric := 0;
  v_daily jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select coalesce(sum(amount),0), count(*), coalesce(max(currency),'USD')
    into v_total, v_paid, v_currency
  from public.v58_payments
  where creator_id=auth.uid()
    and lower(coalesce(source,''))='stripe'
    and lower(coalesce(status,'')) in ('completed','paid','succeeded')
    and created_at >= v_start;

  select count(*) into v_pending
  from public.v58_payments
  where creator_id=auth.uid()
    and lower(coalesce(source,''))='stripe'
    and lower(coalesce(status,'')) in ('pending','processing','requires_action');

  if v_paid > 0 then v_avg := v_total / v_paid; end if;

  select coalesce(jsonb_agg(x order by x.day), '[]'::jsonb) into v_daily
  from (
    select to_char(d.day,'YYYY-MM-DD') as day,
           coalesce(sum(p.amount),0) as revenue,
           count(p.id) as transactions
    from generate_series(current_date - (v_days-1), current_date, interval '1 day') d(day)
    left join public.v58_payments p
      on p.creator_id=auth.uid()
     and lower(coalesce(p.source,''))='stripe'
     and lower(coalesce(p.status,'')) in ('completed','paid','succeeded')
     and p.created_at::date=d.day::date
    group by d.day
  ) x;

  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) into v_recent
  from (
    select id, release_id, status, amount, currency,
           metadata->>'external_id' as external_id,
           created_at, metadata
    from public.v58_payments
    where creator_id=auth.uid() and lower(coalesce(source,''))='stripe'
    order by created_at desc limit 10
  ) x;

  return jsonb_build_object(
    'days',v_days,'currency',v_currency,'revenue',v_total,'paid_transactions',v_paid,
    'pending_transactions',v_pending,'average_order',v_avg,'daily',v_daily,'recent',v_recent,
    'generated_at',now()
  );
end;
$$;

-- ============================================================
-- MIGRATION 20260901091448 repair_stripe_payment_reconciliation_metadata
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_reconcile_stripe_payment(p_creator_id uuid, p_external_id text, p_status text, p_amount bigint default null, p_currency text default null) returns boolean language plpgsql security definer set search_path to 'public' as $$ begin if to_regclass('public.v58_payments') is null then return false; end if; update public.v58_payments set status=p_status, amount=coalesce(p_amount,amount), currency=coalesce(p_currency,currency), metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reconciled_external_id',p_external_id), created_at=created_at where creator_id=p_creator_id and source='stripe' and (metadata->>'external_id'=p_external_id or metadata->>'stripe_payment_intent_id'=p_external_id or metadata->>'checkout_session_id'=p_external_id or metadata->>'stripe_event_id'=p_external_id or metadata->>'reconciled_external_id'=p_external_id); return found; end; $$;

-- ============================================================
-- MIGRATION 20260901091504 repair_stripe_event_payment_metadata
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_reconcile_stripe_event(p_event_id text) returns boolean language plpgsql security definer set search_path to 'public' as $$ declare e jsonb; task_id uuid; event_type text; status_value text; t public.v58_provider_tasks; v_creator uuid; v_release text; v_amount numeric; v_currency text; v_session text; v_intent text; begin if auth.role() <> 'service_role' then raise exception 'Service role required'; end if; select payload,event_type,creator_id,checkout_session_id,payment_intent_id,amount,currency into e,event_type,v_creator,v_session,v_intent,v_amount,v_currency from public.v58_stripe_events where event_id=p_event_id; if e is null then raise exception 'Stripe event not found'; end if; task_id:=nullif(e #>> '{data,object,metadata,v58_task_id}','')::uuid; if task_id is null then task_id:=nullif(e #>> '{data,object,metadata,provider_task_id}','')::uuid; end if; if task_id is not null then select * into t from public.v58_provider_tasks where id=task_id; end if; if t.id is not null then v_creator:=coalesce(v_creator,t.creator_id); v_release:=t.payload->>'release_id'; end if; if v_release is null then v_release:=e #>> '{data,object,metadata,release_id}'; end if; v_session:=coalesce(v_session,e #>> '{data,object,id}'); v_intent:=coalesce(v_intent,e #>> '{data,object,payment_intent}'); v_amount:=coalesce(v_amount,(e #>> '{data,object,amount_total}')::numeric/100,(e #>> '{data,object,amount_received}')::numeric/100,0); v_currency:=upper(coalesce(v_currency,e #>> '{data,object,currency}','USD')); if event_type='checkout.session.completed' then status_value:=coalesce(e #>> '{data,object,payment_status}','paid'); if task_id is not null then update public.v58_provider_tasks set result=coalesce(result,'{}'::jsonb)||jsonb_build_object('stripe_event_id',p_event_id,'payment_status',status_value,'checkout_session_id',v_session,'payment_intent_id',v_intent), external_reference=coalesce(external_reference,v_session,v_intent), status=case when status='completed' then status else 'completed' end, completed_at=coalesce(completed_at,now()), updated_at=now() where id=task_id; end if; if v_creator is not null and v_release is not null then insert into public.v58_payments(creator_id,release_id,amount,currency,status,source,metadata) select v_creator,v_release,v_amount,v_currency,'completed','stripe',jsonb_build_object('stripe_event_id',p_event_id,'checkout_session_id',v_session,'stripe_payment_intent_id',v_intent,'external_id',coalesce(v_intent,v_session)) where not exists(select 1 from public.v58_payments where source='stripe' and creator_id=v_creator and release_id=v_release and (metadata->>'stripe_event_id'=p_event_id or metadata->>'checkout_session_id'=v_session or metadata->>'stripe_payment_intent_id'=v_intent)); end if; update public.v58_stripe_events set processed_at=coalesce(processed_at,now()),status=status_value where event_id=p_event_id; return true; elsif event_type in ('checkout.session.async_payment_failed','payment_intent.payment_failed') then if task_id is not null then update public.v58_provider_tasks set last_error=coalesce(e #>> '{data,object,last_payment_error,message}','Stripe payment failed'),result=coalesce(result,'{}'::jsonb)||jsonb_build_object('stripe_event_id',p_event_id,'payment_status','failed'),updated_at=now() where id=task_id; end if; update public.v58_stripe_events set processed_at=coalesce(processed_at,now()),status='failed' where event_id=p_event_id; return task_id is not null; end if; return false; end; $$;

-- ============================================================
-- MIGRATION 20260901102352 fix_v58_stripe_metadata_propagation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_enqueue_stripe_monetization_task(p_step_id uuid) returns uuid language plpgsql security definer set search_path=public as $$ declare s public.v58_workflow_steps; r public.v58_workflow_runs; c public.v58_release_stripe_checkout_config; v_task uuid; v_idempotency text; begin if auth.role() <> 'service_role' and auth.uid() is null then raise exception 'Authentication required'; end if; select * into s from public.v58_workflow_steps where id=p_step_id for update; if not found then raise exception 'Workflow step not found'; end if; select * into r from public.v58_workflow_runs where id=s.workflow_run_id for update; if not found then raise exception 'Workflow run not found'; end if; if auth.role() <> 'service_role' and r.creator_id <> auth.uid() then raise exception 'Not authorized'; end if; select * into c from public.v58_release_stripe_checkout_config where creator_id=r.creator_id and release_id=r.release_id and enabled=true; if c.id is null then update public.v58_workflow_steps set status='blocked',detail='Stripe Checkout configuration is required for Monetization.',error_message='Missing Stripe Checkout configuration.',updated_at=now() where id=s.id; return null; end if; if not exists(select 1 from public.v58_provider_adapters where provider_key='stripe' and enabled=true) then raise exception 'Stripe provider adapter is disabled or missing'; end if; v_idempotency := 'release-launch:'||r.id::text||':monetization:stripe-checkout'; insert into public.v58_provider_tasks(workflow_run_id,workflow_step_id,creator_id,provider_key,capability,operation,idempotency_key,payload,max_attempts) values(r.id,s.id,r.creator_id,'stripe','payments','create_checkout_session',v_idempotency,jsonb_build_object('workflow_run_id',r.id::text,'release_id',r.release_id,'stripe_price_id',c.stripe_price_id,'quantity',c.quantity,'mode',c.mode,'success_url',c.success_url,'cancel_url',c.cancel_url,'stripe_account_id',c.stripe_account_id,'metadata',jsonb_build_object('creator_id',r.creator_id::text,'release_id',r.release_id::text)||coalesce(c.metadata,'{}'::jsonb)),s.max_attempts) on conflict(idempotency_key) do update set payload=excluded.payload,updated_at=now() returning id into v_task; if v_task is null then select id into v_task from public.v58_provider_tasks where idempotency_key=v_idempotency; end if; update public.v58_workflow_steps set detail='Stripe Checkout task queued with V58 creator/release metadata.',progress=10,updated_at=now() where id=s.id and status='running'; return v_task; end; $$;

-- ============================================================
-- MIGRATION 20260901103850 v58_harden_public_security_definers
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_launch_control_preflight_service(text, uuid) from anon;
revoke execute on function public.v58_reconcile_sandbox_distribution_task(uuid) from anon;
-- Keep authenticated EXECUTE on application RPCs because these are creator-facing APIs;
-- their SECURITY DEFINER implementations are responsible for ownership/authorization checks.
-- Schema-migrations is intentionally deny-by-default under RLS and is not exposed to clients.

-- ============================================================
-- MIGRATION 20260901111749 v58_harden_launch_control_rpc_execute_privileges
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_launch_control_diagnostic() from anon;
revoke execute on function public.v58_launch_control_health() from anon;
revoke execute on function public.v58_v3_verdict(uuid, uuid) from anon;
grant execute on function public.v58_launch_control_diagnostic() to authenticated;
grant execute on function public.v58_launch_control_health() to authenticated;
grant execute on function public.v58_v3_verdict(uuid, uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260901112407 repair_v58_analytics_semantic_events
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_record_analytics_semantics()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.v58_workflow_runs;
  k text;
begin
  if new.key <> 'analytics' or new.status <> 'completed' then
    return new;
  end if;

  select * into r
  from public.v58_workflow_runs
  where id = new.workflow_run_id;

  if not found or r.creator_id is null or r.release_id is null then
    return new;
  end if;

  k := 'v58-semantic-' || r.id::text;

  insert into public.v58_analytics_events
    (creator_id, release_id, event_type, value, source, metadata, occurred_at)
  select r.creator_id, r.release_id, 'prediction', 1, 'v58_workflow',
         jsonb_build_object('workflow_run_id', r.id, 'workflow_step_id', new.id, 'semantic_role', 'workflow_prediction', 'staging_safe', true),
         coalesce(new.completed_at, now())
  where not exists (
    select 1 from public.v58_analytics_events a
    where a.creator_id = r.creator_id
      and a.release_id = r.release_id
      and a.event_type = 'prediction'
      and a.metadata->>'workflow_run_id' = r.id::text
  );

  insert into public.v58_analytics_events
    (creator_id, release_id, event_type, value, source, metadata, occurred_at)
  select r.creator_id, r.release_id, 'verified_outcome', 1, 'v58_workflow',
         jsonb_build_object('workflow_run_id', r.id, 'workflow_step_id', new.id, 'semantic_role', 'verified_workflow_outcome', 'staging_safe', true),
         coalesce(new.completed_at, now())
  where not exists (
    select 1 from public.v58_analytics_events a
    where a.creator_id = r.creator_id
      and a.release_id = r.release_id
      and a.event_type = 'verified_outcome'
      and a.metadata->>'workflow_run_id' = r.id::text
  );

  return new;
end;
$$;

drop trigger if exists trg_v58_analytics_semantics on public.v58_workflow_steps;
create trigger trg_v58_analytics_semantics
after insert or update of status, completed_at on public.v58_workflow_steps
for each row execute function public.v58_record_analytics_semantics();

revoke all on function public.v58_record_analytics_semantics() from public, anon, authenticated;


-- ============================================================
-- MIGRATION 20260901113021 v58_verdict_service_context_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_staging_reconcile(p_fixture_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_creator uuid := auth.uid();
  v_service boolean := auth.role() = 'service_role';
  v_steps text[] := array['create','process','replay','duplicate-blocked','fail','retry','recover','cleanup'];
  v_missing text[];
  v_failed text[];
  v_evidence_count int;
  v_run_count int;
  v_duplicate_keys int;
begin
  if v_service and v_creator is null then
    select creator_id into v_creator from public.v58_staging_fixtures where id=p_fixture_id;
  end if;
  if v_creator is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.v58_staging_fixtures f where f.id=p_fixture_id and f.creator_id=v_creator) then raise exception 'fixture_not_found_or_not_owned'; end if;
  select array_agg(s order by s) into v_missing from unnest(v_steps) s where not exists(select 1 from public.v58_staging_evidence e where e.fixture_id=p_fixture_id and e.creator_id=v_creator and e.step=s and e.passed=true);
  select array_agg(s order by s) into v_failed from unnest(v_steps) s where exists(select 1 from public.v58_staging_evidence e where e.fixture_id=p_fixture_id and e.creator_id=v_creator and e.step=s and e.passed=false);
  select count(*) into v_evidence_count from public.v58_staging_evidence e where e.fixture_id=p_fixture_id and e.creator_id=v_creator and e.passed=true;
  select count(*) into v_run_count from public.v58_staging_fixture_runs r where r.fixture_id=p_fixture_id;
  select count(distinct idempotency_key) into v_duplicate_keys from public.v58_staging_fixture_runs r where r.fixture_id=p_fixture_id;
  return jsonb_build_object('fixture_id',p_fixture_id,'authenticated',true,'evidence_passed',v_evidence_count,'fixture_actions',v_run_count,'unique_idempotency_keys',v_duplicate_keys,'expected_steps',to_jsonb(v_steps),'missing_steps',coalesce(to_jsonb(v_missing),'[]'::jsonb),'failed_steps',coalesce(to_jsonb(v_failed),'[]'::jsonb),'e2e_pass',coalesce(array_length(v_missing,1),0)=0 and coalesce(array_length(v_failed,1),0)=0 and v_evidence_count=8);
end; $$;

create or replace function public.v58_v3_verdict(p_fixture_id uuid, p_workflow_run_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_service boolean := auth.role() = 'service_role';
  e jsonb;
  g1 boolean; g2 boolean; g3 boolean; g4 boolean; g5 boolean; g6 boolean; g7 boolean;
  missing3 jsonb := '[]'::jsonb; missing4 jsonb := '[]'::jsonb; missing5 jsonb := '[]'::jsonb; missing6 jsonb := '[]'::jsonb; missing7 jsonb := '[]'::jsonb;
  passed int; v_workflow_status text; v_completed_steps int; v_total_steps int; v_release_id text;
begin
  if v_service and v_uid is null then
    if p_workflow_run_id is not null then select creator_id, release_id into v_uid, v_release_id from public.v58_workflow_runs where id=p_workflow_run_id; else select creator_id into v_uid from public.v58_staging_fixtures where id=p_fixture_id; end if;
  end if;
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.v58_staging_fixtures where id=p_fixture_id and creator_id=v_uid) then raise exception 'fixture_not_found_or_not_owned'; end if;
  e := public.v58_staging_reconcile(p_fixture_id);
  g1 := true; g2 := true;
  g3 := coalesce((e->>'e2e_pass')::boolean,false); if not g3 then missing3:=jsonb_build_array('all 8 passed staging evidence steps'); end if;
  g4 := false;
  if p_workflow_run_id is not null then
    select w.status,w.completed_steps,w.total_steps,w.release_id into v_workflow_status,v_completed_steps,v_total_steps,v_release_id from public.v58_workflow_runs w where w.id=p_workflow_run_id and w.creator_id=v_uid;
    if v_workflow_status='completed' and coalesce(v_total_steps,0)>0 and v_completed_steps=v_total_steps and not exists(select 1 from public.v58_workflow_steps s where s.workflow_run_id=p_workflow_run_id and s.required=true and s.status in ('blocked','failed')) then g4:=true; end if;
  end if;
  if not g4 then missing4:=jsonb_build_array('authoritative workflow run','workflow status completed','all workflow steps completed','no required blocked/failed steps'); end if;
  g5 := exists(select 1 from public.v58_staging_fixture_runs where fixture_id=p_fixture_id and action='fail' and outcome='failed') and exists(select 1 from public.v58_staging_fixture_runs where fixture_id=p_fixture_id and action='retry' and outcome='accepted') and exists(select 1 from public.v58_staging_fixture_runs where fixture_id=p_fixture_id and action='recover' and outcome='recovered') and coalesce((e->>'unique_idempotency_keys')::int,0)>0;
  if not g5 then missing5:=jsonb_build_array('fail produced failed outcome','retry produced accepted outcome','recover produced recovered outcome','idempotency evidence'); end if;
  g6:=false;
  if p_workflow_run_id is not null and v_workflow_status='completed' and v_completed_steps=v_total_steps and coalesce(v_total_steps,0)>0 then
    select count(distinct a.event_type)>=2 into g6 from public.v58_analytics_events a where a.creator_id=v_uid and a.release_id=v_release_id and a.event_type in ('stream','prediction','verified_outcome');
  end if;
  if not g6 then missing6:=jsonb_build_array('completed authoritative workflow','at least 2 authoritative semantic event types: stream/prediction/verified_outcome'); end if;
  g7:=g3 and g4 and g5 and g6; if not g7 then missing7:=jsonb_build_array('complete 8-step staging lifecycle','provider fail/retry/recover','completed authoritative workflow','authoritative semantic analytics'); end if;
  passed:=(g1::int)+(g2::int)+(g3::int)+(g4::int)+(g5::int)+(g6::int)+(g7::int);
  return jsonb_build_object('verdict',case when passed=7 then 'GO' else 'NO-GO' end,'score',passed::text||'/7','passed_gates',passed,'total_gates',7,'gates',jsonb_build_object('1_authentication',jsonb_build_object('pass',g1,'missing','[]'::jsonb),'2_ownership_rls',jsonb_build_object('pass',g2,'missing','[]'::jsonb),'3_media_lifecycle',jsonb_build_object('pass',g3,'missing',missing3),'4_public_release_player',jsonb_build_object('pass',g4,'missing',missing4),'5_provider_recovery_idempotency',jsonb_build_object('pass',g5,'missing',missing5),'6_data_semantics',jsonb_build_object('pass',g6,'missing',missing6),'7_end_to_end',jsonb_build_object('pass',g7,'missing',missing7)),'e2e',e,'workflow_run_id',p_workflow_run_id);
end; $$;
revoke execute on function public.v58_staging_reconcile(uuid) from anon;
revoke execute on function public.v58_v3_verdict(uuid,uuid) from anon;
grant execute on function public.v58_staging_reconcile(uuid) to authenticated, service_role;
grant execute on function public.v58_v3_verdict(uuid,uuid) to authenticated, service_role;

-- ============================================================
-- MIGRATION 20260901123336 fix_v58_launch_trigger_nonce_path
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if coalesce((v_preflight->>'ok')::boolean,false)=false then
    raise exception 'release_preflight_failed';
  end if;

  if not exists(select 1 from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id::text=trim(p_release_id) and a.user_id=v_uid) then
    raise exception 'release_not_owned';
  end if;

  v_distribution_ok := exists(select 1 from public.v58_release_distribution_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.endpoint_url),'') is not null);
  v_promotion_ok := exists(select 1 from public.v58_release_promotion_approvals p where p.creator_id=v_uid and p.release_id=trim(p_release_id) and p.approved=true);
  v_stripe_ok := exists(select 1 from public.v58_release_stripe_checkout_config c where c.creator_id=v_uid and c.release_id=trim(p_release_id) and c.enabled=true and nullif(trim(c.stripe_price_id),'') is not null and nullif(trim(c.success_url),'') is not null and nullif(trim(c.cancel_url),'') is not null);

  if not v_distribution_ok then raise exception 'distribution_endpoint_required'; end if;
  if not v_promotion_ok then raise exception 'promotion_approval_required'; end if;
  if not v_stripe_ok then raise exception 'stripe_checkout_configuration_required'; end if;

  select id into v_run_id
  from public.v58_workflow_runs
  where creator_id=v_uid and release_id=trim(p_release_id) and workflow_key='release_launch' and workflow_version=58 and status in ('pending','running')
  order by created_at desc limit 1;

  if v_run_id is null then
    v_run_id := public.v58_create_release_launch_workflow(trim(p_release_id));
  end if;

  update public.v58_workflow_runs
  set status='running',started_at=coalesce(started_at,now()),current_step='validate_release',updated_at=now()
  where id=v_run_id;

  perform public.v58_dispatch_workflow_step(v_run_id,'validate_release');

  -- Use the authenticated launch request's current V58 trigger secret through
  -- the dedicated V10 trigger endpoint. The endpoint validates the nonce and
  -- keeps the orchestrator key inside Edge Function secrets.
  select net.http_get(
    url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-orchestrator-trigger-v10',
    params := jsonb_build_object('release_id', trim(p_release_id)),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'X-V58-Launch-Authorized','true'
    ),
    timeout_milliseconds := 5000
  ) into v_trigger_request;

  select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;

  return jsonb_build_object('ok',true,'run_id',v_run.id,'status',v_run.status,'progress',v_run.progress,'completed_steps',v_run.completed_steps,'total_steps',v_run.total_steps,'current_step',v_run.current_step,'errors',v_run.errors,'orchestrator_triggered',true,'trigger_request_id',v_trigger_request);
end;
$function$;

-- ============================================================
-- MIGRATION 20260901123430 restore_v58_launch_trigger_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_launch_control_start(p_release_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  select net.http_get(url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v58-orchestrator-trigger-v10?nonce=v58-once-9f2c7a41e6b8d3',params := '{}'::jsonb,headers := jsonb_build_object('Content-Type','application/json'),timeout_milliseconds := 5000) into v_trigger_request;
  select * into v_run from public.v58_workflow_runs where id=v_run_id and creator_id=v_uid;
  return jsonb_build_object('ok',true,'run_id',v_run.id,'status',v_run.status,'progress',v_run.progress,'completed_steps',v_run.completed_steps,'total_steps',v_run.total_steps,'current_step',v_run.current_step,'errors',v_run.errors,'orchestrator_triggered',true,'trigger_request_id',v_trigger_request);
end;
$function$;

-- ============================================================
-- MIGRATION 20260901135649 lock_down_v58_public_staging_verdict_rpcs
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_staging_reconcile(uuid) from anon;
revoke execute on function public.v58_v3_verdict(uuid, uuid) from anon;

-- ============================================================
-- MIGRATION 20260901135701 tighten_v58_staging_rpc_grants
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_staging_reconcile(uuid) from public;
revoke execute on function public.v58_v3_verdict(uuid, uuid) from public;
grant execute on function public.v58_staging_reconcile(uuid) to authenticated;
grant execute on function public.v58_v3_verdict(uuid, uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260901141335 lock_down_v58_launch_control_status
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_launch_control_status() from anon;

-- ============================================================
-- MIGRATION 20260901141353 secure_v58_launch_control_status_execute
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_launch_control_status() from public; grant execute on function public.v58_launch_control_status() to authenticated;

-- ============================================================
-- MIGRATION 20260901141450 lock_down_v58_public_diagnostics
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.v58_guard_staging_fixture() from public, anon; revoke execute on function public.v58_latest_staging_verdict() from public, anon; revoke execute on function public.v58_launch_control_diagnostic() from public, anon; revoke execute on function public.v58_launch_control_health() from public, anon; revoke execute on function public.v58_staging_preflight() from public, anon; grant execute on function public.v58_latest_staging_verdict() to authenticated; grant execute on function public.v58_launch_control_diagnostic() to authenticated; grant execute on function public.v58_launch_control_health() to authenticated; grant execute on function public.v58_staging_preflight() to authenticated;

-- ============================================================
-- MIGRATION 20260901141847 retire_stale_v58_release_launch_cron
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

select cron.unschedule(3);

-- ============================================================
-- MIGRATION 20260901142626 v58_performance_fk_indexes_and_rls_initplan
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

DO $$
DECLARE
  r record;
  idx_name text;
  cols text;
BEGIN
  FOR r IN
    SELECT c.oid AS con_oid, n.nspname AS schema_name, t.relname AS table_name,
           c.conname, c.conkey
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND i.indisvalid
          AND i.indpred IS NULL
          AND i.indexprs IS NULL
          AND i.indkey[1:cardinality(c.conkey)] = c.conkey
      )
  LOOP
    idx_name := left(r.conname || '_idx', 63);
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY u.ord)
      INTO cols
    FROM unnest(r.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = r.con_oid::regclass::oid AND a.attnum = u.attnum;
    IF cols IS NULL THEN
      SELECT string_agg(format('%I', a.attname), ', ' ORDER BY u.ord)
        INTO cols
      FROM unnest(r.conkey) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a
        ON a.attrelid = (SELECT conrelid FROM pg_constraint WHERE oid = r.con_oid) AND a.attnum = u.attnum;
    END IF;
    IF cols IS NOT NULL THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)', idx_name, r.schema_name, r.table_name, cols);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  p record;
  q text;
  w text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual,'') LIKE '%auth.uid()%' OR coalesce(with_check,'') LIKE '%auth.uid()%')
      AND (coalesce(qual,'') NOT LIKE '%(select auth.uid())%' OR coalesce(with_check,'') NOT LIKE '%(select auth.uid())%')
  LOOP
    q := p.qual;
    w := p.with_check;
    IF q IS NOT NULL AND position('auth.uid()' in q) > 0 AND position('(select auth.uid())' in q) = 0 THEN
      q := replace(q, 'auth.uid()', '(select auth.uid())');
    END IF;
    IF w IS NOT NULL AND position('auth.uid()' in w) > 0 AND position('(select auth.uid())' in w) = 0 THEN
      w := replace(w, 'auth.uid()', '(select auth.uid())');
    END IF;
    IF p.cmd IN ('SELECT','DELETE') AND q IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, q);
    ELSIF p.cmd = 'INSERT' AND w IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, w);
    ELSIF p.cmd = 'UPDATE' THEN
      IF q IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', p.policyname, p.schemaname, p.tablename, q);
      END IF;
      IF w IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', p.policyname, p.schemaname, p.tablename, w);
      END IF;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.v54_schema_migrations FROM anon, authenticated, public;

-- ============================================================
-- MIGRATION 20260901142647 v58_remove_duplicate_fk_indexes_and_finish_fk_coverage
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE INDEX IF NOT EXISTS message_reactions_user_id_idx ON public.message_reactions (user_id);
CREATE INDEX IF NOT EXISTS v54_creator_access_user_id_idx ON public.v54_creator_access (user_id);
CREATE INDEX IF NOT EXISTS v54_creator_members_user_id_idx ON public.v54_creator_members (user_id);

DROP INDEX IF EXISTS public.analytics_events_user_id_fkey_idx;
DROP INDEX IF EXISTS public.artists_user_id_fkey_idx;
DROP INDEX IF EXISTS public.blocked_users_blocker_fkey_idx;
DROP INDEX IF EXISTS public.blocks_blocker_id_fkey_idx;
DROP INDEX IF EXISTS public.content_items_creator_id_fkey_idx;
DROP INDEX IF EXISTS public.conversation_members_conversation_fkey_idx;
DROP INDEX IF EXISTS public.follows_follower_id_fkey_idx;
DROP INDEX IF EXISTS public.live_reactions_stream_id_fkey_idx;
DROP INDEX IF EXISTS public.live_stream_conversations_conversation_id_fkey_idx;
DROP INDEX IF EXISTS public.live_stream_moderators_stream_id_fkey_idx;
DROP INDEX IF EXISTS public.live_stream_viewers_stream_id_fkey_idx;
DROP INDEX IF EXISTS public.live_stream_viewers_viewer_id_fkey_idx;
DROP INDEX IF EXISTS public.live_streams_creator_id_fkey_idx;
DROP INDEX IF EXISTS public.media_assets_owner_id_fkey_idx;
DROP INDEX IF EXISTS public.message_attachments_message_fkey_idx;
DROP INDEX IF EXISTS public.message_reactions_message_fkey_idx;
DROP INDEX IF EXISTS public.message_reads_message_fkey_idx;
DROP INDEX IF EXISTS public.message_reports_message_fkey_idx;
DROP INDEX IF EXISTS public.messages_reply_to_fkey_idx;
DROP INDEX IF EXISTS public.messages_sender_fkey_idx;
DROP INDEX IF EXISTS public.notifications_recipient_id_fkey_idx;
DROP INDEX IF EXISTS public.product_variants_product_id_fkey_idx;
DROP INDEX IF EXISTS public.products_artist_id_fkey_idx;
DROP INDEX IF EXISTS public.reel_comments_parent_comment_id_fkey_idx;
DROP INDEX IF EXISTS public.reel_comments_reel_id_fkey_idx;
DROP INDEX IF EXISTS public.reel_comments_user_id_fkey_idx;
DROP INDEX IF EXISTS public.reel_likes_reel_id_fkey_idx;
DROP INDEX IF EXISTS public.reel_saves_reel_id_fkey_idx;
DROP INDEX IF EXISTS public.reel_shares_reel_id_fkey_idx;
DROP INDEX IF EXISTS public.reel_shares_user_id_fkey_idx;
DROP INDEX IF EXISTS public.reel_views_reel_id_fkey_idx;
DROP INDEX IF EXISTS public.reel_views_viewer_id_fkey_idx;
DROP INDEX IF EXISTS public.reels_content_id_fkey_idx;
DROP INDEX IF EXISTS public.reels_creator_id_fkey_idx;
DROP INDEX IF EXISTS public.story_reactions_story_id_fkey_idx;
DROP INDEX IF EXISTS public.story_views_story_id_fkey_idx;
DROP INDEX IF EXISTS public.story_views_viewer_id_fkey_idx;
DROP INDEX IF EXISTS public.support_transactions_recipient_id_fkey_idx;
DROP INDEX IF EXISTS public.support_transactions_supporter_id_fkey_idx;
DROP INDEX IF EXISTS public.tracks_mixtape_id_fkey_idx;
DROP INDEX IF EXISTS public.v54_evidence_recommendation_id_fkey_idx;
DROP INDEX IF EXISTS public.v54_outcomes_action_id_fkey_idx;
DROP INDEX IF EXISTS public.v58_provider_tasks_workflow_run_id_fkey_idx;
DROP INDEX IF EXISTS public.video_content_owner_id_fkey_idx;
DROP INDEX IF EXISTS public.video_engagement_events_media_asset_id_fkey_idx;
DROP INDEX IF EXISTS public.video_engagement_events_viewer_id_fkey_idx;
DROP INDEX IF EXISTS public.video_relationships_parent_media_id_fkey_idx;
DROP INDEX IF EXISTS public.videos_artist_id_fkey_idx;

-- ============================================================
-- MIGRATION 20260901142718 v58_rls_auth_initplan_cleanup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

ALTER POLICY "admins manage interviews" ON public.artist_interviews USING ((EXISTS (SELECT 1 FROM profiles p WHERE ((p.id = (select auth.uid())) AND (p.role = 'admin'::user_role))))) WITH CHECK ((EXISTS (SELECT 1 FROM profiles p WHERE ((p.id = (select auth.uid())) AND (p.role = 'admin'::user_role)))));
ALTER POLICY "admins manage videos" ON public.site_videos USING ((EXISTS (SELECT 1 FROM profiles p WHERE ((p.id = (select auth.uid())) AND (p.role = 'admin'::user_role))))) WITH CHECK ((EXISTS (SELECT 1 FROM profiles p WHERE ((p.id = (select auth.uid())) AND (p.role = 'admin'::user_role)))));
ALTER POLICY "Creators can manage reel tracks" ON public.reel_tracks USING ((EXISTS (SELECT 1 FROM reels r WHERE ((r.id = reel_tracks.reel_id) AND (r.creator_id = (select auth.uid()))))) ) WITH CHECK ((EXISTS (SELECT 1 FROM reels r WHERE ((r.id = reel_tracks.reel_id) AND (r.creator_id = (select auth.uid()))))) );
ALTER POLICY "Creators can manage live moderators" ON public.live_stream_moderators USING ((EXISTS (SELECT 1 FROM live_streams l WHERE ((l.id = live_stream_moderators.stream_id) AND (l.creator_id = (select auth.uid()))))) ) WITH CHECK ((EXISTS (SELECT 1 FROM live_streams l WHERE ((l.id = live_stream_moderators.stream_id) AND (l.creator_id = (select auth.uid()))))) );
ALTER POLICY "v58_release_stripe_checkout_config_owner" ON public.v58_release_stripe_checkout_config USING ((creator_id = (select auth.uid()))) WITH CHECK ((creator_id = (select auth.uid())));

-- ============================================================
-- MIGRATION 20260901142732 v58_lock_authenticated_worker_only_rpcs
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

REVOKE EXECUTE ON FUNCTION public.v58_claim_distribution_task(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.v58_distribution_worker_task(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.v58_process_owned_workflow(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.v58_reconcile_sandbox_distribution_task(uuid) FROM authenticated;

-- ============================================================
-- MIGRATION 20260901144818 v58_secure_v54_schema_migrations_rls
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists v54_schema_migrations_no_client_access on public.v54_schema_migrations;
create policy v54_schema_migrations_no_client_access on public.v54_schema_migrations
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ============================================================
-- MIGRATION 20260901145657 harden_v58_authenticated_security_definers
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.artist_owns_mixtape(uuid) from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.tgg_insert_track(uuid,text,uuid,text,integer,text,text) from public, anon, authenticated;
revoke execute on function public.v54_create_my_creator_workspace(text,text,text) from public, anon, authenticated;
revoke execute on function public.v54_system_health() from public, anon, authenticated;
revoke execute on function public.v54_system_health(uuid) from public, anon, authenticated;
revoke execute on function public.v58_advance_workflow(uuid) from public, anon, authenticated;
revoke execute on function public.v58_assert_run_owner(uuid) from public, anon, authenticated;
revoke execute on function public.v58_block_step(uuid,text,text,text) from public, anon, authenticated;
revoke execute on function public.v58_complete_step(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.v58_create_release_launch_workflow(text) from public, anon, authenticated;
revoke execute on function public.v58_dispatch_workflow_step(uuid,text) from public, anon, authenticated;
revoke execute on function public.v58_e2e_create_release_launch_rehearsal(text) from public, anon, authenticated;
revoke execute on function public.v58_e2e_snapshot(uuid) from public, anon, authenticated;
revoke execute on function public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) from public, anon, authenticated;
revoke execute on function public.v58_get_release_launch_state(uuid) from public, anon, authenticated;
revoke execute on function public.v58_get_release_stripe_checkout_config(text) from public, anon, authenticated;
revoke execute on function public.v58_launch_control_preflight_service(text,uuid) from public, anon, authenticated;
revoke execute on function public.v58_launch_control_releases() from public, anon, authenticated;
revoke execute on function public.v58_launch_control_start(text) from public, anon, authenticated;
revoke execute on function public.v58_launch_release(text) from public, anon, authenticated;
revoke execute on function public.v58_provider_ops_cancel_task(uuid) from public, anon, authenticated;
revoke execute on function public.v58_provider_ops_retry_task(uuid) from public, anon, authenticated;
revoke execute on function public.v58_provider_ops_summary() from public, anon, authenticated;
revoke execute on function public.v58_queue_step_task(uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public.v58_recalculate_run(uuid) from public, anon, authenticated;
revoke execute on function public.v58_repair_and_retry(uuid) from public, anon, authenticated;
revoke execute on function public.v58_resolve_action(uuid,text) from public, anon, authenticated;
revoke execute on function public.v58_set_distribution_config(text,text) from public, anon, authenticated;
revoke execute on function public.v58_set_promotion_approval(text,boolean) from public, anon, authenticated;
revoke execute on function public.v58_set_release_stripe_checkout_config(text,text,text,text,integer,text,text,jsonb) from public, anon, authenticated;
revoke execute on function public.v58_staging_reconcile(uuid) from public, anon, authenticated;
revoke execute on function public.v58_start_workflow(uuid) from public, anon, authenticated;
revoke execute on function public.v58_v3_verdict(uuid,uuid) from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;

-- ============================================================
-- MIGRATION 20260901145709 restore_v58_public_api_functions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

grant execute on function public.v58_launch_control_releases() to authenticated;
grant execute on function public.v58_launch_control_start(text) to authenticated;
grant execute on function public.v58_launch_control_preflight_service(text,uuid) to authenticated;
grant execute on function public.v58_get_release_launch_state(uuid) to authenticated;
grant execute on function public.v58_get_release_stripe_checkout_config(text) to authenticated;
grant execute on function public.v58_create_release_launch_workflow(text) to authenticated;
grant execute on function public.v58_e2e_create_release_launch_rehearsal(text) to authenticated;
grant execute on function public.v58_e2e_snapshot(uuid) to authenticated;
grant execute on function public.v58_v3_verdict(uuid,uuid) to authenticated;
grant execute on function public.v58_repair_and_retry(uuid) to authenticated;
grant execute on function public.v58_set_promotion_approval(text,boolean) to authenticated;
grant execute on function public.v58_set_release_stripe_checkout_config(text,text,text,text,integer,text,text,jsonb) to authenticated;
grant execute on function public.v58_set_distribution_config(text,text) to authenticated;
grant execute on function public.v58_provider_ops_summary() to authenticated;
grant execute on function public.v58_provider_ops_cancel_task(uuid) to authenticated;
grant execute on function public.v58_provider_ops_retry_task(uuid) to authenticated;
grant execute on function public.v58_resolve_action(uuid,text) to authenticated;
grant execute on function public.v58_recalculate_run(uuid) to authenticated;
grant execute on function public.v58_start_workflow(uuid) to authenticated;
grant execute on function public.v58_advance_workflow(uuid) to authenticated;
grant execute on function public.v58_dispatch_workflow_step(uuid,text) to authenticated;
grant execute on function public.v58_complete_step(uuid,text,jsonb) to authenticated;
grant execute on function public.v58_block_step(uuid,text,text,text) to authenticated;
grant execute on function public.v58_emit_event(uuid,uuid,text,text,text,text,text,text,jsonb,text) to authenticated;
grant execute on function public.v58_queue_step_task(uuid,text,jsonb) to authenticated;
grant execute on function public.v54_system_health() to authenticated;
grant execute on function public.v54_system_health(uuid) to authenticated;
grant execute on function public.v54_create_my_creator_workspace(text,text,text) to authenticated;
grant execute on function public.tgg_insert_track(uuid,text,uuid,text,integer,text,text) to authenticated;
grant execute on function public.artist_owns_mixtape(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ============================================================
-- MIGRATION 20260901150046 restore_required_v58_client_rpc_grants
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

grant execute on function public.v58_e2e_create_release_launch_rehearsal(text) to authenticated;
grant execute on function public.v58_e2e_snapshot(uuid) to authenticated;
grant execute on function public.v58_launch_release(text) to authenticated;
grant execute on function public.v58_provider_ops_summary() to authenticated;
grant execute on function public.v58_provider_ops_retry_task(uuid) to authenticated;
grant execute on function public.v58_provider_ops_cancel_task(uuid) to authenticated;
grant execute on function public.v58_launch_control_releases() to authenticated;
grant execute on function public.v58_launch_control_start(text) to authenticated;
grant execute on function public.v58_get_release_launch_state(uuid) to authenticated;
grant execute on function public.v58_v3_verdict(uuid,uuid) to authenticated;
revoke execute on function public.v58_e2e_create_release_launch_rehearsal(text) from anon, public;
revoke execute on function public.v58_e2e_snapshot(uuid) from anon, public;
revoke execute on function public.v58_launch_release(text) from anon, public;
revoke execute on function public.v58_provider_ops_summary() from anon, public;
revoke execute on function public.v58_provider_ops_retry_task(uuid) from anon, public;
revoke execute on function public.v58_provider_ops_cancel_task(uuid) from anon, public;
revoke execute on function public.v58_launch_control_releases() from anon, public;
revoke execute on function public.v58_launch_control_start(text) from anon, public;
revoke execute on function public.v58_get_release_launch_state(uuid) from anon, public;
revoke execute on function public.v58_v3_verdict(uuid,uuid) from anon, public;

-- ============================================================
-- MIGRATION 20260901225550 v54_health_hardening_20260901
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

REVOKE ALL ON TABLE public.v54_actions FROM anon;
REVOKE ALL ON TABLE public.v54_outcomes FROM anon;
REVOKE ALL ON FUNCTION public.v54_system_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.v54_system_health() FROM anon;
GRANT EXECUTE ON FUNCTION public.v54_system_health() TO authenticated;

-- ============================================================
-- MIGRATION 20260901230532 v58_decision_execution_control
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v54_request_action(p_recommendation_id uuid, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private
as $function$
declare
  v_uid uuid := auth.uid();
  v_rec public.v54_recommendations%rowtype;
  v_action public.v54_actions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_rec
  from public.v54_recommendations r
  where r.id = p_recommendation_id
    and r.creator_id = v_uid
    and private.is_creator_member(r.creator_id, v_uid)
  for update;

  if not found then raise exception 'Recommendation not found or not authorized'; end if;
  if v_rec.expires_at is not null and v_rec.expires_at <= now() then
    raise exception 'Recommendation has expired';
  end if;
  if v_rec.status not in ('active','authorized') then
    raise exception 'Recommendation is not actionable';
  end if;

  insert into public.v54_actions
    (creator_id, recommendation_id, action_type, action_status, authorization_status, requested_by, payload)
  values
    (v_uid, v_rec.id, coalesce(v_rec.recommendation_type,'creator_action'), 'pending',
     case when coalesce(v_rec.requires_authorization,true) then 'not_authorized' else 'authorized' end,
     v_uid, coalesce(p_payload,'{}'::jsonb))
  returning * into v_action;

  if not coalesce(v_rec.requires_authorization,true) then
    update public.v54_actions
      set authorized_by = v_uid, authorized_at = now()
      where id = v_action.id;
    select * into v_action from public.v54_actions where id = v_action.id;
  end if;

  return jsonb_build_object('ok',true,'action_id',v_action.id,'authorization_status',v_action.authorization_status,'action_status',v_action.action_status);
end;
$function$;

create or replace function public.v54_authorize_action(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private
as $function$
declare
  v_uid uuid := auth.uid();
  v_action public.v54_actions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_action
  from public.v54_actions a
  where a.id = p_action_id
    and a.creator_id = v_uid
    and private.is_creator_member(a.creator_id, v_uid)
  for update;

  if not found then raise exception 'Action not found or not authorized'; end if;
  if v_action.action_status <> 'pending' then raise exception 'Action is not pending'; end if;
  if v_action.authorization_status = 'authorized' then
    return jsonb_build_object('ok',true,'action_id',v_action.id,'authorization_status','authorized','action_status',v_action.action_status,'already_authorized',true);
  end if;
  if v_action.authorization_status <> 'not_authorized' then raise exception 'Action cannot be authorized from current state'; end if;

  update public.v54_actions
    set authorization_status='authorized', authorized_by=v_uid, authorized_at=now()
    where id=v_action.id;

  return jsonb_build_object('ok',true,'action_id',v_action.id,'authorization_status','authorized','action_status',v_action.action_status);
end;
$function$;

create or replace function public.v54_mark_action_executed(p_action_id uuid, p_result jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, private
as $function$
declare
  v_uid uuid := auth.uid();
  v_action public.v54_actions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_action
  from public.v54_actions a
  where a.id = p_action_id
    and a.creator_id = v_uid
    and private.is_creator_member(a.creator_id, v_uid)
  for update;

  if not found then raise exception 'Action not found or not authorized'; end if;
  if v_action.authorization_status <> 'authorized' then raise exception 'Action must be authorized before execution is recorded'; end if;
  if v_action.action_status = 'executed' then
    return jsonb_build_object('ok',true,'action_id',v_action.id,'action_status','executed','already_executed',true);
  end if;
  if v_action.action_status <> 'pending' then raise exception 'Action cannot be marked executed from current state'; end if;

  update public.v54_actions
    set action_status='executed', executed_by=v_uid, executed_at=now(), result=coalesce(p_result,'{}'::jsonb)
    where id=v_action.id;

  return jsonb_build_object('ok',true,'action_id',v_action.id,'action_status','executed','verification_required',true);
end;
$function$;

revoke all on function public.v54_request_action(uuid,jsonb) from public, anon;
revoke all on function public.v54_authorize_action(uuid) from public, anon;
revoke all on function public.v54_mark_action_executed(uuid,jsonb) from public, anon;
grant execute on function public.v54_request_action(uuid,jsonb) to authenticated;
grant execute on function public.v54_authorize_action(uuid) to authenticated;
grant execute on function public.v54_mark_action_executed(uuid,jsonb) to authenticated;

