-- Reconcile the locked V531 external-route contract after the approved
-- Master Admin move from the retired #master-admin fragment to the
-- dedicated owner Activation Bridge. No other baseline field is changed.

do $$
declare
  v_version constant text := 'V531-FINAL';
  v_old constant text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1#master-admin';
  v_new constant text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit';
  v_paths jsonb;
  v_next jsonb;
  v_old_count integer:=0;
  v_new_count integer:=0;
begin
  select notes#>'{route_contract,active_external_paths}'
  into v_paths
  from public.tgg_production_baselines
  where version=v_version and status='locked'
  for update;

  if v_paths is null or jsonb_typeof(v_paths) <> 'array' then
    raise exception 'V531_EXTERNAL_ROUTE_CONTRACT_MISSING';
  end if;

  select count(*) filter (where value=v_old),
         count(*) filter (where value=v_new)
  into v_old_count,v_new_count
  from jsonb_array_elements_text(v_paths);

  -- Idempotent replay: already reconciled is accepted only in the exact
  -- expected one-new/zero-old state.
  if v_old_count=0 and v_new_count=1 then
    return;
  end if;

  if v_old_count<>1 or v_new_count<>0 then
    raise exception 'UNEXPECTED_V531_MASTER_ADMIN_ROUTE_STATE old=% new=% paths=%',
      v_old_count,v_new_count,v_paths;
  end if;

  select jsonb_agg(case when value=v_old then v_new else value end order by ord)
  into v_next
  from jsonb_array_elements_text(v_paths) with ordinality as t(value,ord);

  update public.tgg_production_baselines
  set notes=jsonb_set(notes,'{route_contract,active_external_paths}',v_next,false)
  where version=v_version and status='locked';

  if not found then
    raise exception 'V531_LOCKED_BASELINE_NOT_UPDATED';
  end if;
end
$$;
