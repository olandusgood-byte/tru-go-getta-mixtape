-- TGG Auto Builder continuous development/staging watchdog
-- Captures verified live automation state from 2026-09-08.
-- Guardrails:
--   * no production target auto-claims
--   * no high-risk auto-claims
--   * no production promotion/deploy auto-claims
--   * historical/noncanonical work excluded unless explicitly development-approved
--   * AB-006 / V223 production boundary remains explicit-approval only

create or replace function public.tgg_build_claim_ready_batch(
  p_worker text,
  p_limit integer default 5
)
returns table(
  task_id uuid,
  task_key text,
  title text,
  task_type text,
  priority integer,
  risk_level text,
  agent_type text
)
language plpgsql
set search_path=''
as $$
begin
  if p_worker is null or length(trim(p_worker))=0 then
    raise exception 'worker is required';
  end if;

  if p_limit < 1 or p_limit > 25 then
    raise exception 'p_limit must be between 1 and 25';
  end if;

  return query
  with picked as (
    select t.id
    from public.tgg_build_tasks t
    join public.tgg_build_milestones m on m.id=t.milestone_id
    join public.tgg_build_releases r on r.id=m.release_id
    where t.status='ready'
      and t.risk_level <> 'high'
      and coalesce(r.target_environment,'staging') <> 'production'
      and coalesce((r.metadata->>'production_promotion_performed')::boolean,false) is not true
      and coalesce((r.metadata->>'production_deploy_performed')::boolean,false) is not true
      and (
        coalesce((r.metadata->>'canonical')::boolean,true) is not false
        or (
          coalesce((r.metadata->>'development_scope_approved')::boolean,false) is true
          and coalesce((r.metadata->>'development_only')::boolean,false) is true
        )
      )
      and coalesce((r.metadata->>'auto_builder_claim_allowed')::boolean,true) is not false
      and coalesce((r.metadata->>'historical_only')::boolean,false) is not true
      and (
        coalesce((r.metadata->>'historical_backlog')::boolean,false) is not true
        or coalesce((r.metadata->>'development_scope_approved')::boolean,false) is true
      )
      and (t.locked_at is null or t.locked_at < now() - interval '15 minutes')
    order by t.priority,t.created_at
    for update of t skip locked
    limit p_limit
  ),
  claimed as (
    update public.tgg_build_tasks t
    set status='building',
        locked_by=p_worker,
        locked_at=now(),
        started_at=coalesce(t.started_at,now()),
        updated_at=now()
    from picked
    where t.id=picked.id
    returning t.*
  )
  select c.id,c.task_key,c.title,c.task_type,c.priority,c.risk_level,c.agent_type
  from claimed c
  order by c.priority,c.created_at;
end;
$$;

create or replace function public.tgg_autobuilder_detect_state()
returns jsonb
language plpgsql
set search_path=''
as $$
declare
  v_ready integer;
  v_running integer;
  v_approval integer;
  v_blocked integer;
  v_unfinished integer;
  v_status text;
begin
  perform public.tgg_build_refresh_ready_tasks();

  with eligible as (
    select t.*
    from public.tgg_build_tasks t
    join public.tgg_build_milestones m on m.id=t.milestone_id
    join public.tgg_build_releases r on r.id=m.release_id
    where coalesce(r.target_environment,'staging') <> 'production'
      and coalesce((r.metadata->>'production_promotion_performed')::boolean,false) is not true
      and coalesce((r.metadata->>'production_deploy_performed')::boolean,false) is not true
      and (
        coalesce((r.metadata->>'canonical')::boolean,true) is not false
        or (
          coalesce((r.metadata->>'development_scope_approved')::boolean,false) is true
          and coalesce((r.metadata->>'development_only')::boolean,false) is true
        )
      )
      and coalesce((r.metadata->>'auto_builder_claim_allowed')::boolean,true) is not false
      and coalesce((r.metadata->>'historical_only')::boolean,false) is not true
      and (
        coalesce((r.metadata->>'historical_backlog')::boolean,false) is not true
        or coalesce((r.metadata->>'development_scope_approved')::boolean,false) is true
      )
  )
  select
    count(*) filter(where status='ready'),
    count(*) filter(where status in ('designing','building','testing','repairing','staging')),
    count(*) filter(where status='approval_required'),
    count(*) filter(where status='blocked'),
    count(*) filter(where status not in ('complete','passed','skipped'))
  into v_ready,v_running,v_approval,v_blocked,v_unfinished
  from eligible;

  v_status := case
    when v_unfinished=0 then 'complete'
    when v_ready>0 or v_running>0 then 'running'
    when v_approval>0 then 'waiting_approval'
    when v_blocked>0 then 'blocked'
    else 'blocked'
  end;

  return jsonb_build_object(
    'status',v_status,
    'ready',v_ready,
    'running',v_running,
    'approval_required',v_approval,
    'blocked',v_blocked,
    'unfinished',v_unfinished,
    'historical_noncanonical_excluded',true,
    'production_auto_claim_blocked',true,
    'high_risk_auto_claim_blocked',true,
    'canonical_boundary','AB-006',
    'canonical_source_version','V223'
  );
end;
$$;

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
  v_open_failures integer;
  v_stale_jobs integer;
begin
  v_codesync := private.tgg_codesync_tick();
  v_migration := private.tgg_refresh_migration_hygiene_runtime_inventory();
  v_detect := public.tgg_autobuilder_detect_state();

  select count(*) into v_open_failures
  from public.tgg_build_failures
  where status in ('open','repairing','blocked');

  select count(*) into v_stale_jobs
  from public.tgg_theme_deploy_jobs
  where status in ('claimed','processing')
    and claimed_at < now()-interval '10 minutes';

  select * into v_ctrl
  from public.tgg_autobuilder_controller
  where id=1;

  if v_ctrl.enabled then
    v_cycle := public.tgg_autobuilder_run_cycle();
  else
    v_cycle := jsonb_build_object('status','paused','reason','controller_disabled');
  end if;

  return jsonb_build_object(
    'ok',true,
    'checked_at',now(),
    'codesync',v_codesync,
    'migration_hygiene',v_migration,
    'detected',v_detect,
    'cycle',v_cycle,
    'open_build_failures',v_open_failures,
    'stale_theme_jobs',v_stale_jobs,
    'production_auto_claim_blocked',true,
    'high_risk_auto_claim_blocked',true,
    'production_promotion_requires_explicit_approval',true
  );
end;
$$;

revoke all on function public.tgg_autobuilder_watchdog() from public,anon,authenticated;
grant execute on function public.tgg_autobuilder_watchdog() to postgres;

update public.tgg_autobuilder_controller
set enabled=true,
    status='running',
    mode='fast',
    max_batch_size=5,
    updated_at=now(),
    last_cycle_result=coalesce(last_cycle_result,'{}'::jsonb) || jsonb_build_object(
      'continuous_watchdog_enabled',true,
      'production_auto_claim_blocked',true,
      'high_risk_auto_claim_blocked',true,
      'production_promotion_requires_explicit_approval',true,
      'enabled_at',now()
    )
where id=1;

do $$
declare v_jobid bigint;
begin
  for v_jobid in
    select jobid from cron.job where jobname='tgg-autobuilder-continuous-watchdog'
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  perform cron.schedule(
    'tgg-autobuilder-continuous-watchdog',
    '*/10 * * * *',
    'select public.tgg_autobuilder_watchdog();'
  );
end $$;
