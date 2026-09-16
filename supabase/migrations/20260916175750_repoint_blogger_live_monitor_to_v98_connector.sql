create or replace function private.tgg_trigger_blogger_live_monitor()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
  v_request_id bigint;
  v_status text;
  v_revoked_at timestamptz;
  v_baseline_version text;
begin
  select version into v_baseline_version
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  select status,revoked_at into v_status,v_revoked_at
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1;

  if coalesce(v_status,'')<>'connected' or v_revoked_at is not null then
    update public.tgg_production_baselines
    set notes = notes || jsonb_build_object(
      'blogger_hash_monitor_runtime',
      jsonb_build_object('status','paused_oauth_unavailable','connection_status',v_status,'revoked_at',v_revoked_at,'checked_at',now())
    )
    where version=v_baseline_version;
    return 0;
  end if;

  select monitor_token into v_token
  from public.tgg_blogger_monitor_runtime
  where id=1 and active=true;
  if v_token is null then raise exception 'blogger_monitor_runtime_unavailable'; end if;

  select net.http_post(
    url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v98-blogger-connector/monitor',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-tgg-monitor-token',v_token),
    timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$function$;

update private.tgg_edge_function_registry
set canonical=false,
    runtime_state='retired_stub',
    retirement_state='retired',
    updated_at=now(),
    last_inventory_at=now()
where slug='tgg-tmp-video-page-scan';

update public.tgg_edge_function_runtime_inventory
set runtime_class='legacy',
    active_reference_expected=false,
    cleanup_action='retire_candidate',
    reason='Superseded by canonical v98-blogger-connector/monitor. Current tgg-tmp-video-page-scan deployment is a placeholder and has zero remaining references.',
    audited_at=now()
where function_slug='tgg-tmp-video-page-scan';