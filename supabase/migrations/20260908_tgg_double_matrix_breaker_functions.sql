-- Follow-up: complete DOUBLE MATRIX function source without rewriting prior migration.

create or replace function public.tgg_one_double_matrix_refresh()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_matrix int:=0; v_lewis int:=0; v_overlap int:=0;
  v_msteps int:=0; v_lsteps int:=0; v_dup int:=0;
  v_status text:='clear'; v_id uuid;
begin
  select count(*) into v_matrix
  from public.tgg_matrix_gateway_sessions
  where state not in ('exiting','exited');

  select count(*) into v_lewis
  from public.tgg_lewis_portal_sessions
  where state not in ('returning','exited');

  select count(*) into v_overlap
  from (
    select m.owner_user_id
    from public.tgg_matrix_gateway_sessions m
    join public.tgg_lewis_portal_sessions l on l.owner_user_id=m.owner_user_id
    where m.state not in ('exiting','exited')
      and l.state not in ('returning','exited')
    group by m.owner_user_id
  ) q;

  select count(*) into v_msteps
  from public.tgg_matrix_gateway_sessions
  where state not in ('exiting','exited') and rabbit_step>4;

  select count(*) into v_lsteps
  from public.tgg_lewis_portal_sessions
  where state not in ('returning','exited') and step_no>4;

  select coalesce(sum(c-1),0)::int into v_dup
  from (
    select owner_user_id,count(*) c
    from (
      select owner_user_id from public.tgg_matrix_gateway_sessions
      where state not in ('exiting','exited')
      union all
      select owner_user_id from public.tgg_lewis_portal_sessions
      where state not in ('returning','exited')
    ) s
    group by owner_user_id
    having count(*)>2
  ) d;

  if v_msteps>0 or v_lsteps>0 or v_dup>0 then
    v_status:='loop_risk';
  elsif v_overlap>0 then
    v_status:='watch';
  end if;

  insert into public.tgg_one_double_matrix_snapshots(
    status,active_matrix_sessions,active_lewis_sessions,overlapping_users,
    excessive_matrix_steps,excessive_lewis_steps,duplicate_active_sessions,breaker
  )
  values(
    v_status,v_matrix,v_lewis,v_overlap,v_msteps,v_lsteps,v_dup,
    jsonb_build_object(
      'role','cross_gateway_loop_and_duplication_breaker',
      'recommended_safe_return_route','artist_creator_os',
      'auto_force_exit',false,'destroy_sessions',false,
      'no_witch_logic',true,'no_spell_logic',true,'no_wizard_logic',true,
      'supernatural_action_claims',false,
      'production_authority',false,'high_risk_authority',false
    )
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok',v_status<>'restricted','snapshot_id',v_id,'status',v_status,
    'active_matrix_sessions',v_matrix,'active_lewis_sessions',v_lewis,
    'overlapping_users',v_overlap,'excessive_matrix_steps',v_msteps,
    'excessive_lewis_steps',v_lsteps,'duplicate_active_sessions',v_dup
  );
end $$;

create or replace function public.tgg_one_double_matrix_state()
returns jsonb
language sql
security definer
set search_path=''
as $$
select jsonb_build_object(
  'status',status,'active_matrix_sessions',active_matrix_sessions,
  'active_lewis_sessions',active_lewis_sessions,'overlapping_users',overlapping_users,
  'excessive_matrix_steps',excessive_matrix_steps,'excessive_lewis_steps',excessive_lewis_steps,
  'duplicate_active_sessions',duplicate_active_sessions,'breaker',breaker,'sensed_at',sensed_at
)
from public.tgg_one_double_matrix_snapshots
order by sensed_at desc limit 1
$$;

create or replace function public.tgg_one_recorded_completeness()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_base jsonb:=public.tgg_one_mirror_completeness();
  v_box jsonb:=public.tgg_one_black_box_state();
  v_audit jsonb:=public.tgg_veil_audit_state();
  v_layers int:=0; v_ok boolean;
begin
  select count(*) into v_layers from public.tgg_one_layers where active=true;
  v_ok:=coalesce((v_base->>'ok')::boolean,false)
    and v_layers>=57
    and coalesce(v_box->>'status','restricted')<>'restricted';
  return jsonb_build_object(
    'ok',v_ok,'base',v_base,'black_box',v_box,'veil_audit',v_audit,
    'minimum_required_layers',57,'active_total_layers',v_layers,
    'recorded_train_required',true,'veil_audit_required',true,
    'audit_stores_secrets',false,'black_box_rewrites_history',false,
    'production_auto_publish',false,'production_promotion_allowed',false,
    'high_risk_auto_execute',false,'canonical_boundary','AB-006',
    'canonical_source_version','V223'
  );
end $$;

create or replace function public.tgg_one_double_matrix_completeness()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_base jsonb:=public.tgg_one_recorded_completeness();
  v_breaker jsonb:=public.tgg_one_double_matrix_state();
  v_layers int:=0; v_no_occult boolean:=false; v_no_loop boolean:=false; v_ok boolean;
begin
  select count(*) into v_layers from public.tgg_one_layers where active=true;
  select exists(select 1 from public.tgg_brain_guardrails
    where guardrail_key='guardrail:no-witch-spells-wizards'
      and active and immutable and severity='critical' and action='block') into v_no_occult;
  select exists(select 1 from public.tgg_brain_guardrails
    where guardrail_key='guardrail:no-double-matrix-loop'
      and active and immutable and severity='critical' and action='block') into v_no_loop;
  v_ok:=coalesce((v_base->>'ok')::boolean,false)
    and v_layers=58 and v_no_occult and v_no_loop
    and coalesce(v_breaker->>'status','restricted')<>'restricted';
  return jsonb_build_object(
    'ok',v_ok,'base',v_base,'double_matrix_breaker',v_breaker,
    'no_witch_spells_wizards_guardrail',v_no_occult,
    'no_double_matrix_loop_guardrail',v_no_loop,
    'required_total_layers',58,'active_total_layers',v_layers,
    'recommended_safe_return_route','artist_creator_os','auto_force_exit',false,
    'supernatural_action_claims',false,'production_auto_publish',false,
    'production_promotion_allowed',false,'high_risk_auto_execute',false,
    'canonical_boundary','AB-006','canonical_source_version','V223'
  );
end $$;

revoke all on function public.tgg_one_double_matrix_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_double_matrix_state() from public,anon,authenticated;
revoke all on function public.tgg_one_double_matrix_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_double_matrix_refresh() to postgres;
grant execute on function public.tgg_one_double_matrix_state() to postgres;
grant execute on function public.tgg_one_double_matrix_completeness() to postgres;
