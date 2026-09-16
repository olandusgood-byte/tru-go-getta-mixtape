do $$
declare
  v_slug constant text := 'tgg-one-final-page-audit';
  v_old_hash constant text := '48184e518f8c319cfe3d2983f3dc5d3a68ee2c141ee82b0b24af3069fd96a0d8';
  v_new_hash constant text := '008efe8d9629b30ebfed39efc8e9b172563e0c47f533f4c3b4ceb0ae93a5492a';
  v_version integer;
  v_hash text;
begin
  select deployment_version,source_hash into v_version,v_hash
  from private.tgg_edge_function_registry
  where slug=v_slug
  for update;

  if v_version is null then raise exception 'ACTIVATION_BRIDGE_REGISTRY_MISSING'; end if;
  if not ((v_version=370 and v_hash=v_old_hash) or (v_version=371 and v_hash=v_new_hash)) then
    raise exception 'UNEXPECTED_ACTIVATION_BRIDGE_REGISTRY_STATE version=% hash=%',v_version,v_hash;
  end if;

  update private.tgg_edge_function_registry
  set deployment_version=371,
      source_hash=v_new_hash,
      verify_jwt=false,
      status='ACTIVE',
      canonical=true,
      duplicate_candidate=false,
      retirement_state='keep',
      runtime_state='owner_activation_bridge',
      last_inventory_at=now(),
      updated_at=now()
  where slug=v_slug;

  update public.tgg_edge_function_runtime_inventory
  set runtime_class='canonical',
      verify_jwt=false,
      status='ACTIVE',
      active_reference_expected=true,
      cleanup_action='keep',
      reason='canonical_owner_activation_bridge',
      audited_at=now()
  where function_slug=v_slug;

  if not found then raise exception 'ACTIVATION_BRIDGE_RUNTIME_INVENTORY_MISSING'; end if;
end
$$;
