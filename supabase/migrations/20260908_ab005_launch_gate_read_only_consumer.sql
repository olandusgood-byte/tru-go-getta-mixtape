-- AB-005 Launch Gate read-only consumer
-- Additive only. No production advancement or deployment is performed here.
create or replace function public.tgg_ab005_launch_gate()
returns jsonb
language plpgsql
security invoker
set search_path = public
stable
as $$
declare
  v_stage record;
  v_ready boolean := false;
begin
  select s.id, s.staging_key, s.status, s.checkpoint_key,
         s.previous_stable_key, s.verified_at, s.smoke_summary, s.created_at
    into v_stage
    from public.tgg_build_staging_releases s
   where s.smoke_summary->>'ab005_clean_pass' = 'true'
   order by s.verified_at desc nulls last, s.created_at desc
   limit 1;

  if found then
    v_ready := v_stage.status = 'passed'
      and nullif(v_stage.checkpoint_key, '') is not null
      and coalesce(v_stage.smoke_summary->>'ab005_clean_pass','false') = 'true';
  end if;

  return jsonb_build_object(
    'ok', true,
    'consumer', 'ab005-launch-gate',
    'read_only', true,
    'eligible', v_ready,
    'staging', case when found then jsonb_build_object(
      'id', v_stage.id,
      'staging_key', v_stage.staging_key,
      'status', v_stage.status,
      'checkpoint_key', v_stage.checkpoint_key,
      'clean_pass', coalesce(v_stage.smoke_summary->>'ab005_clean_pass','false') = 'true',
      'rollback_reference', v_stage.previous_stable_key,
      'rollback_cutoff', v_stage.smoke_summary->>'rollback_cutoff',
      'verified_at', v_stage.verified_at,
      'created_at', v_stage.created_at
    ) else null end,
    'production_gate_required', true,
    'production_promoted', false
  );
end;
$$;

revoke all on function public.tgg_ab005_launch_gate() from public, anon;
grant execute on function public.tgg_ab005_launch_gate() to authenticated;
