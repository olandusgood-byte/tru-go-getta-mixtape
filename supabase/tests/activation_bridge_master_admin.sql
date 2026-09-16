-- Regression guard for the canonical TGG Activation Bridge / Master Admin surface.
-- Safe to run against a production-parity database; read-only except for raised assertions.

do $$
declare
  v_url constant text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit';
  v_manifest jsonb;
  v_drift jsonb;
  v_cleanup record;
begin
  if not exists (
    select 1
    from public.tgg_site_routes
    where route_key='owner_master_admin'
      and is_active=true
      and is_primary=true
      and path=v_url
  ) then
    raise exception 'ACTIVATION_BRIDGE_ROUTE_DRIFT';
  end if;

  select config into v_manifest
  from public.tgg_master_shared_settings
  where setting_key='runtime_manifest'
    and is_published=true;

  if v_manifest is null
     or v_manifest->>'canonical_master_admin' is distinct from v_url
     or v_manifest->>'owner_console_url' is distinct from v_url
     or v_manifest->>'direct_owner_console_url' is distinct from v_url
     or v_manifest->>'canonical_owner_route' is distinct from v_url
     or v_manifest->>'master_admin_edge' is distinct from 'tgg-one-final-page-audit'
     or v_manifest->>'owner_console_strategy' is distinct from 'dedicated_owner_activation_bridge'
  then
    raise exception 'ACTIVATION_BRIDGE_MANIFEST_DRIFT';
  end if;

  if not exists (
    select 1
    from private.tgg_edge_function_registry
    where slug='tgg-one-final-page-audit'
      and canonical=true
      and retirement_state='keep'
      and runtime_state='owner_activation_bridge'
      and status='ACTIVE'
  ) then
    raise exception 'ACTIVATION_BRIDGE_REGISTRY_DRIFT';
  end if;

  select * into v_cleanup
  from private.tgg_edge_physical_cleanup_candidates()
  where slug='tgg-one-final-page-audit';

  if v_cleanup.slug is null
     or v_cleanup.eligible
     or v_cleanup.cleanup_action is distinct from 'keep'
     or v_cleanup.reason is distinct from 'registry_keep_canonical'
  then
    raise exception 'ACTIVATION_BRIDGE_CLEANUP_GUARD_DRIFT';
  end if;

  v_drift := public.tgg_runtime_drift_guard();
  if coalesce((v_drift->>'ok')::boolean,false) is not true then
    raise exception 'ACTIVATION_BRIDGE_RUNTIME_DRIFT: %', v_drift;
  end if;
end
$$;

select jsonb_build_object(
  'ok',true,
  'contract','TGG-ACTIVATION-BRIDGE-V1',
  'master_admin_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit',
  'drift_guard',public.tgg_runtime_drift_guard()->>'version'
) as activation_bridge_master_admin_test;
