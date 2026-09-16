-- Regression guard for the approved Activation Bridge replacement of the legacy #master-admin route.

do $$
declare
  v_old constant text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1#master-admin';
  v_new constant text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit';
  v_paths jsonb;
  v_drift jsonb;
  v_status jsonb;
begin
  select notes#>'{route_contract,active_external_paths}'
  into v_paths
  from public.tgg_production_baselines
  where version='V531-FINAL' and status='locked';

  if v_paths is null
     or not (v_paths ? v_new)
     or (v_paths ? v_old)
  then
    raise exception 'ACTIVATION_BRIDGE_BASELINE_ROUTE_DRIFT: %', v_paths;
  end if;

  v_drift := public.tgg_get_production_drift();
  if coalesce((v_drift->>'ok')::boolean,false) is not true
     or coalesce((v_drift->>'drift_count')::integer,0) <> 0
  then
    raise exception 'PRODUCTION_DRIFT_NOT_ZERO: %', v_drift;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_drift->'drift','[]'::jsonb)) x
    where x->>'type'='external_route_contract'
  ) then
    raise exception 'STALE_EXTERNAL_ROUTE_CONTRACT_REMAINS';
  end if;

  v_status := public.tgg_one_final_status_summary();
  if coalesce((v_status->>'core_launch_ready')::boolean,false) is not true
     or v_status->>'status' <> 'online'
  then
    raise exception 'ONE_FINAL_STATUS_STALE_RED: %', v_status;
  end if;
end
$$;

select jsonb_build_object(
  'ok',true,
  'contract','ACTIVATION-BRIDGE-BASELINE-ROUTE-1.0',
  'production_drift',public.tgg_get_production_drift()->>'drift_count',
  'one_final_status',public.tgg_one_final_status_summary()->>'status'
) as activation_bridge_baseline_route_test;
