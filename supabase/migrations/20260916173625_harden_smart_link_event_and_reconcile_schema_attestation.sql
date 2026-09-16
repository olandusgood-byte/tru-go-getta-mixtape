create schema if not exists tgg_anon_internal;
revoke all on schema tgg_anon_internal from public;
grant usage on schema tgg_anon_internal to anon, authenticated, service_role;

create or replace function tgg_anon_internal.record_smart_link_event(
  p_link_id uuid,
  p_event_type text default 'click'::text,
  p_destination text default null::text,
  p_referrer text default null::text,
  p_utm_source text default null::text,
  p_utm_medium text default null::text,
  p_utm_campaign text default null::text
) returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if p_event_type not in ('click','destination_click') then
    raise exception 'INVALID_EVENT_TYPE';
  end if;

  if not exists(
    select 1 from public.tgg_smart_links l
    where l.id=p_link_id and l.is_active=true
  ) then
    raise exception 'SMART_LINK_NOT_ACTIVE';
  end if;

  insert into public.tgg_smart_link_events(
    link_id,event_type,destination,referrer,utm_source,utm_medium,utm_campaign
  )
  values(
    p_link_id,p_event_type,left(p_destination,500),left(p_referrer,500),
    left(p_utm_source,120),left(p_utm_medium,120),left(p_utm_campaign,120)
  );
end
$function$;

revoke all on function tgg_anon_internal.record_smart_link_event(uuid,text,text,text,text,text,text) from public;
grant execute on function tgg_anon_internal.record_smart_link_event(uuid,text,text,text,text,text,text) to anon, authenticated, service_role;

create or replace function public.tgg_record_smart_link_event(
  p_link_id uuid,
  p_event_type text default 'click'::text,
  p_destination text default null::text,
  p_referrer text default null::text,
  p_utm_source text default null::text,
  p_utm_medium text default null::text,
  p_utm_campaign text default null::text
) returns void
language sql
security invoker
set search_path to ''
as $function$
  select tgg_anon_internal.record_smart_link_event($1,$2,$3,$4,$5,$6,$7);
$function$;

revoke all on function public.tgg_record_smart_link_event(uuid,text,text,text,text,text,text) from public;
grant execute on function public.tgg_record_smart_link_event(uuid,text,text,text,text,text,text) to anon, authenticated, service_role;

comment on function public.tgg_record_smart_link_event(uuid,text,text,text,text,text,text) is
  'Public invoker-only smart-link analytics RPC. Delegates to one bounded non-exposed helper; preserves anonymous click tracking without an exposed SECURITY DEFINER function.';

do $do$
declare
  v_result jsonb;
begin
  v_result := private.tgg_schema_attestation_reconcile(
    'approved ONE-FINAL route/Blogger changes reconciled after smart-link exposure hardening',
    array[
      'constraint:tgg_site_routes_master_admin_canonical',
      'handoff:blogger.oauth',
      'private.tgg_enforce_one_final_routes()',
      'private.tgg_runtime_drift_guard_internal()',
      'public.tgg_launch_closeout_summary()',
      'route:owner_master_admin'
    ]::text[]
  );

  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'SCHEMA_ATTESTATION_RECONCILE_FAILED: %', v_result::text;
  end if;
end
$do$;
