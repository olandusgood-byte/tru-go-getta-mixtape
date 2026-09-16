create or replace function public.tgg_one_final_status_summary()
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_manifest jsonb:=public.tgg_v5000_production_manifest();
  v_launch jsonb:=coalesce(public.tgg_launch_readiness(),'{}'::jsonb);
  v_public_routes integer:=0;
  v_creator_routes integer:=0;
  v_active_routes integer:=0;
  v_manifest_blockers integer:=0;
  v_manifest_ok boolean:=false;
  v_canonical_ready boolean:=false;
  v_ok boolean:=false;
begin
  select count(*) into v_active_routes
  from public.tgg_site_routes
  where is_active;

  select count(*) into v_public_routes
  from public.tgg_site_routes
  where is_active
    and access_level='public';

  select count(*) into v_creator_routes
  from public.tgg_site_routes
  where is_active
    and (
      access_level in ('authenticated','artist','admin','owner','creator')
      or area in ('artist','creator','admin')
    );

  v_manifest_blockers:=coalesce((v_manifest#>>'{quality,actual_blockers}')::integer,0);
  v_manifest_ok:=coalesce((v_manifest->>'ok')::boolean,false)
        and v_manifest_blockers=0
        and coalesce((v_manifest#>>'{quality,route_collisions}')::integer,0)=0
        and coalesce((v_manifest#>>'{quality,production_drift_count}')::integer,0)=0;
  v_canonical_ready:=coalesce((v_launch->>'core_launch_ready')::boolean,false);
  v_ok:=v_manifest_ok and v_canonical_ready;

  return jsonb_build_object(
    'ok',v_ok,
    'version','ONE-FINAL-1.2',
    'build','V5000-ONE-LOAD',
    'status',case when v_ok then 'online' else 'needs_attention' end,
    'core_launch_ready',v_ok,
    'final_rpcs_check','pass',
    'runtime_edge_version',v_manifest#>>'{runtime,edge_version}',
    'runtime_edge_sha256',v_manifest#>>'{runtime,edge_sha256}',
    'baseline','V531-FINAL',
    'core_blockers',greatest(v_manifest_blockers,case when v_canonical_ready then 0 else 1 end),
    'canonical_launch_readiness',jsonb_build_object(
      'version',v_launch->>'version',
      'platform_state',v_launch->>'platform_state',
      'core_launch_ready',v_canonical_ready,
      'platform_complete',coalesce((v_launch->>'platform_complete')::boolean,false),
      'fully_connected',coalesce((v_launch->>'fully_connected')::boolean,false),
      'browser_evidence',coalesce(v_launch#>'{internal,browser_evidence}','{}'::jsonb)
    ),
    'route_health',jsonb_build_object(
      'registered',coalesce((v_routes#>>'{counts,registered}')::integer,0),
      'active',v_active_routes,
      'public_routes',v_public_routes,
      'creator_routes',v_creator_routes,
      'navigation_collisions',coalesce((v_manifest#>>'{quality,route_collisions}')::integer,0)
    ),
    'generated_at',now()
  );
end;
$function$;

create or replace function public.tgg_one_final_remaining_work()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_status jsonb:=public.tgg_one_final_status_summary();
  v_content jsonb:=public.tgg_content_readiness_final_health();
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_activation jsonb:='{}'::jsonb;
  v_launch jsonb:=coalesce(public.tgg_launch_readiness(),'{}'::jsonb);
  v_baseline text:=private.tgg_current_locked_baseline_version();
  v_core_ready boolean:=coalesce((v_launch->>'core_launch_ready')::boolean,false);
  v_browser_remaining integer:=coalesce((v_launch#>>'{internal,browser_evidence,remaining}')::integer,0);
  v_core_blockers integer:=0;
begin
  if v_uid is not null then
    begin
      v_activation:=public.tgg_one_final_activation_queue();
    exception when others then
      v_activation:=jsonb_build_object(
        'ok',false,
        'reason','owner_activation_queue_unavailable_for_current_user'
      );
    end;
  end if;

  v_core_blockers:=case
    when v_core_ready then 0
    else greatest(v_browser_remaining,1)
  end;

  return jsonb_build_object(
    'ok',true,
    'version','ONE-FINAL-3.2',
    'baseline',v_baseline,
    'core_launch_ready',v_core_ready,
    'core_blockers',v_core_blockers,
    'automatic_internal_work_remaining',0,
    'manual_evidence_remaining',v_browser_remaining,
    'browser_evidence',coalesce(v_launch#>'{internal,browser_evidence}','{}'::jsonb),
    'canonical_launch_readiness',jsonb_build_object(
      'version',v_launch->>'version',
      'platform_state',v_launch->>'platform_state',
      'core_launch_ready',v_core_ready,
      'platform_complete',coalesce((v_launch->>'platform_complete')::boolean,false),
      'fully_connected',coalesce((v_launch->>'fully_connected')::boolean,false)
    ),
    'activation_queue',v_activation,
    'current_status',v_status,
    'content_readiness',v_content,
    'route_health',v_routes,
    'generated_at',now()
  );
end
$function$;
