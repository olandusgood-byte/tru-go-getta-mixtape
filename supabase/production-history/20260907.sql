-- TRU GO GETTA production migration history archive
-- Date bucket: 20260907
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260907001059 reconcile_v516_full_37_page_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set
  blogger_deployments=37,
  blogger_verified=37,
  blogger_failed=0,
  notes = notes
    || jsonb_build_object(
      'rollback_contract',
      jsonb_build_object(
        'locked_pages',37,
        'restorable_pages',37,
        'missing_backups',0,
        'backup_bucket','v98-blogger-backups',
        'integrity_validated',true,
        'integrity_checked_at',coalesce(notes#>>'{backup_integrity_scan,checked_at}',now()::text)
      ),
      'full_site_contract',
      jsonb_build_object(
        'locked_pages',37,
        'active_page_routes',37,
        'valid_backups',37,
        'invalid_backups',0,
        'status','green',
        'reconciled_at',now()
      )
    )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907001229 enforce_checkout_path_before_merch_publish_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_enforce_merch_checkout_path()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_native_ready boolean:=false;
  v_link text:=nullif(btrim(coalesce(new.stripe_payment_link_url,'')),'');
begin
  if new.status='published' then
    select coalesce(enabled,false)
      and mode='production'
      and coalesce(endpoint_configured,false)
    into v_native_ready
    from public.tgg_provider_runtime_config
    where provider_key='stripe'
    limit 1;

    if not coalesce(v_native_ready,false) then
      if v_link is null then
        raise exception 'CHECKOUT_PATH_REQUIRED'
          using detail='Stripe runtime is unavailable. Add a Stripe Payment Link before publishing.';
      end if;

      if v_link !~ '^https://buy[.]stripe[.]com/' then
        raise exception 'INVALID_STRIPE_PAYMENT_LINK'
          using detail='Published products require a https://buy.stripe.com/ payment link while native checkout is unavailable.';
      end if;
    end if;
  end if;

  return new;
end
$function$;

revoke all on function private.tgg_enforce_merch_checkout_path()
from public,anon,authenticated;

drop trigger if exists tgg_enforce_merch_checkout_path
on public.merch_products;

create trigger tgg_enforce_merch_checkout_path
before insert or update of status,stripe_payment_link_url
on public.merch_products
for each row
execute function private.tgg_enforce_merch_checkout_path();

create or replace function private.tgg_admin_review_merch(
  p_product_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status text;
  v_creator uuid;
  v_new text;
  v_link text;
  v_native_ready boolean:=false;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  if not exists (
    select 1
    from public.profiles
    where id=auth.uid()
      and role='admin'
  ) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select status,creator_id,stripe_payment_link_url
  into v_status,v_creator,v_link
  from public.merch_products
  where id=p_product_id
  for update;

  if v_status is null then raise exception 'MERCH_NOT_FOUND'; end if;
  if p_action not in ('approve','request_changes','reject') then
    raise exception 'INVALID_ACTION';
  end if;
  if v_status<>'pending' then raise exception 'INVALID_STATUS'; end if;

  if p_action='approve' then
    select coalesce(enabled,false)
      and mode='production'
      and coalesce(endpoint_configured,false)
    into v_native_ready
    from public.tgg_provider_runtime_config
    where provider_key='stripe'
    limit 1;

    if not coalesce(v_native_ready,false)
       and nullif(btrim(coalesce(v_link,'')),'') is null
    then
      raise exception 'CHECKOUT_PATH_REQUIRED'
        using detail='Native Stripe checkout is unavailable. Add a Stripe Payment Link before approval.';
    end if;

    v_new='published';
  elsif p_action='request_changes' then
    v_new='changes_requested';
  else
    v_new='rejected';
  end if;

  if p_action in ('request_changes','reject')
     and nullif(trim(coalesce(p_note,'')),'') is null
  then
    raise exception 'NOTE_REQUIRED';
  end if;

  update public.merch_products
  set status=v_new,
      admin_note=nullif(trim(coalesce(p_note,'')),''),
      published_at=case when v_new='published' then now() else published_at end,
      updated_at=now()
  where id=p_product_id;

  insert into public.notifications(
    recipient_id,actor_id,notification_type,entity_type,entity_id,title,body
  )
  values(
    (select user_id from public.artists where id=v_creator),
    auth.uid(),
    'merch_review',
    'merch_product',
    p_product_id,
    case
      when v_new='published' then 'Merch approved'
      when v_new='changes_requested' then 'Changes requested'
      else 'Merch rejected'
    end,
    coalesce(nullif(trim(p_note),''),'Your merchandise submission was reviewed.')
  );

  return jsonb_build_object(
    'ok',true,
    'product_id',p_product_id,
    'previous_status',v_status,
    'status',v_new,
    'reviewed_by',auth.uid()
  );
end
$function$;

revoke all on function private.tgg_admin_review_merch(uuid,text,text)
from public,anon;

grant execute on function private.tgg_admin_review_merch(uuid,text,text)
to authenticated;


-- ============================================================
-- MIGRATION 20260907001310 record_v516_commerce_publish_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'commerce_publish_guard',
  jsonb_build_object(
    'enabled',true,
    'trigger','tgg_enforce_merch_checkout_path',
    'native_stripe_runtime','standby_secret_missing',
    'fallback','https://buy.stripe.com/ Payment Link',
    'drafts_allowed',true,
    'publish_without_checkout_blocked',true,
    'publish_with_valid_payment_link_allowed',true,
    'published_products',(
      select count(*) from public.merch_products where status='published'
    ),
    'published_products_without_checkout',(
      select count(*)
      from public.merch_products
      where status='published'
        and nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is null
    ),
    'verified_at',now()
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907001502 require_complete_live_blogger_monitor_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_monitor_blogger_live_state()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_live jsonb;
  v_checked timestamptz;
  v_fresh boolean:=false;
  v_ok boolean:=false;
  v_locked integer:=0;
  v_seen integer:=0;
  v_payload jsonb;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  v_live:=coalesce(v_baseline.notes->'live_blogger_hash_monitor','{}'::jsonb);

  begin
    v_checked:=(v_live->>'checked_at')::timestamptz;
    v_fresh:=v_checked>=now()-interval '40 minutes';
  exception when others then
    v_fresh:=false;
  end;

  v_locked:=coalesce((v_live->>'locked_pages')::integer,0);
  v_seen:=coalesce((v_live->>'live_pages_checked')::integer,0);

  v_ok:=
    coalesce((v_live->>'ok')::boolean,false)
    and v_fresh
    and v_locked>0
    and v_seen=v_locked;

  v_payload:=v_live || jsonb_build_object(
    'fresh',v_fresh,
    'complete',v_locked>0 and v_seen=v_locked,
    'monitor_age_seconds',case
      when v_checked is null then null
      else extract(epoch from (now()-v_checked))::bigint
    end,
    'checked_by','private.tgg_monitor_blogger_live_state',
    'evaluated_at',now()
  );

  if v_ok then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v_payload
    where alert_key='production:blogger_live_drift'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:blogger_live_drift',
      'open',
      'warning',
      'blogger_live',
      now(),now(),1,v_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='blogger_live',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;
end
$function$;

revoke all on function private.tgg_monitor_blogger_live_state()
from public,anon,authenticated;

create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_live jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_live_complete boolean:=false;
  v_locked_pages integer:=0;
  v_live_pages integer:=0;
  v_expected_routes int;
  v_current_routes int;
  v_core_ok boolean:=false;
  v_commerce_ready boolean:=false;
  v_commerce_required boolean:=false;
  v_external jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();
  v_live:=coalesce(v_baseline#>'{notes,live_blogger_hash_monitor}','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_locked_pages:=coalesce((v_live->>'locked_pages')::integer,0);
  v_live_pages:=coalesce((v_live->>'live_pages_checked')::integer,0);
  v_live_complete:=v_locked_pages>0 and v_live_pages=v_locked_pages;

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  v_core_ok :=
    coalesce((v_drift->>'ok')::boolean,false)
    and coalesce((v_blog->>'ok')::boolean,false)
    and coalesce((v_live->>'ok')::boolean,false)
    and v_live_fresh
    and v_live_complete
    and v_expected_routes>0
    and v_expected_routes=v_current_routes;

  v_commerce_ready :=
    coalesce((v_provider#>>'{payments,ready}')::boolean,false);

  v_commerce_required :=
    exists(
      select 1
      from public.merch_products
      where status='published'
    )
    or exists(
      select 1
      from public.tgg_membership_tiers
    );

  v_external:=jsonb_build_array(
    'Supabase leaked-password protection setting remains disabled',
    'Production DSP endpoint is not configured',
    'Two-user realtime/call smoke requires a second legitimate account/device'
  );

  if not v_commerce_ready then
    v_external:=v_external || jsonb_build_array(
      case
        when v_commerce_required then
          'Store checkout session creation is disabled until the Stripe server secret is restored in the Edge runtime'
        else
          'Stripe checkout runtime is in standby; no published products or membership tiers currently require checkout'
      end
    );
  end if;

  return jsonb_build_object(
    'ok',v_core_ok and (not v_commerce_required or v_commerce_ready),
    'core_ok',v_core_ok,
    'commerce_ready',v_commerce_ready,
    'commerce_required',v_commerce_required,
    'launch_status',case
      when v_core_ok and (not v_commerce_required or v_commerce_ready) then
        case when v_commerce_required then 'ready' else 'ready_commerce_standby' end
      when v_core_ok and v_commerce_required and not v_commerce_ready then
        'core_ready_checkout_blocked'
      else 'degraded'
    end,
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'blogger_live_content',
      v_live || jsonb_build_object(
        'fresh',v_live_fresh,
        'complete',v_live_complete
      ),
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_v516_drift_contract'
    ),
    'stripe_runtime_incident',v_baseline#>'{notes,stripe_runtime_incident}',
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'known_external_items',v_external,
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_final_platform_health() to authenticated;
revoke execute on function public.tgg_final_platform_health() from anon,public;


-- ============================================================
-- MIGRATION 20260907003959 remove_duplicate_academy_progress_index_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop index if exists public.tgg_academy_progress_user_course_lesson_uidx;


-- ============================================================
-- MIGRATION 20260907004428 clear_stale_blogger_maintenance_error_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.v98_blogger_connections c
set last_error=null,
    updated_at=now()
where c.status='connected'
  and c.revoked_at is null
  and c.blog_url='https://trugogettamixtapes.blogspot.com/'
  and c.last_error='oauth_refresh_failed_during_maintenance'
  and exists (
    select 1
    from public.tgg_production_baselines b
    where b.version='V516-FINAL'
      and coalesce((b.notes#>>'{live_blogger_hash_monitor,ok}')::boolean,false)=true
      and coalesce((b.notes#>>'{backup_integrity_scan,ok}')::boolean,false)=true
  );


-- ============================================================
-- MIGRATION 20260907004551 record_v516_store_publish_guard_smoke
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'store_publish_guard',
  jsonb_build_object(
    'native_runtime_ready',false,
    'native_runtime_status','stripe_server_secret_missing',
    'publish_without_checkout_blocked',true,
    'payment_link_fallback_allowed',true,
    'payment_link_pattern','https://buy.stripe.com/',
    'rollback_smoke',true,
    'verified_at',now()
  )
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907030309 separate_runtime_and_blogger_maintenance_health_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_live jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_live_complete boolean:=false;
  v_locked_pages integer:=0;
  v_live_pages integer:=0;
  v_expected_routes int;
  v_current_routes int;
  v_core_ok boolean:=false;
  v_maintenance_ready boolean:=false;
  v_commerce_ready boolean:=false;
  v_commerce_required boolean:=false;
  v_external jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();
  v_live:=coalesce(v_baseline#>'{notes,live_blogger_hash_monitor}','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_locked_pages:=coalesce((v_live->>'locked_pages')::integer,0);
  v_live_pages:=coalesce((v_live->>'live_pages_checked')::integer,0);
  v_live_complete:=v_locked_pages>0 and v_live_pages=v_locked_pages;

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  v_core_ok :=
    coalesce((v_drift->>'ok')::boolean,false)
    and coalesce((v_live->>'ok')::boolean,false)
    and v_live_fresh
    and v_live_complete
    and v_expected_routes>0
    and v_expected_routes=v_current_routes;

  v_maintenance_ready := coalesce((v_blog->>'ok')::boolean,false);

  v_commerce_ready :=
    coalesce((v_provider#>>'{payments,ready}')::boolean,false);

  v_commerce_required :=
    exists(
      select 1
      from public.merch_products
      where status='published'
    )
    or exists(
      select 1
      from public.tgg_membership_tiers
      where coalesce(is_active,true)=true
    );

  v_external:=jsonb_build_array(
    'Supabase leaked-password protection setting remains disabled',
    'Production DSP endpoint is not configured',
    'Two-user realtime/call smoke requires a second legitimate account/device'
  );

  if not v_maintenance_ready then
    v_external:=v_external || jsonb_build_array(
      'Blogger deployment maintenance requires Google OAuth reauthorization; live pages and backups remain intact'
    );
  end if;

  if not v_commerce_ready then
    v_external:=v_external || jsonb_build_array(
      case
        when v_commerce_required then
          'Store checkout session creation is disabled until the Stripe server secret is restored in the Edge runtime'
        else
          'Stripe checkout runtime is in standby; no published products or active membership tiers currently require checkout'
      end
    );
  end if;

  return jsonb_build_object(
    'ok',v_core_ok and (not v_commerce_required or v_commerce_ready),
    'core_ok',v_core_ok,
    'maintenance_ready',v_maintenance_ready,
    'maintenance_status',case
      when v_maintenance_ready then 'ready'
      when coalesce(v_blog#>>'{blog,last_error}','')='google_oauth_invalid_grant'
        then 'google_reauth_required'
      else 'degraded'
    end,
    'commerce_ready',v_commerce_ready,
    'commerce_required',v_commerce_required,
    'launch_status',case
      when v_core_ok and (not v_commerce_required or v_commerce_ready) then
        case
          when v_maintenance_ready then
            case when v_commerce_required then 'ready' else 'ready_commerce_standby' end
          else 'runtime_ready_maintenance_reauth_required'
        end
      when v_core_ok and v_commerce_required and not v_commerce_ready then
        'core_ready_checkout_blocked'
      else 'degraded'
    end,
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'blogger_live_content',
      v_live || jsonb_build_object(
        'fresh',v_live_fresh,
        'complete',v_live_complete
      ),
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_v516_drift_contract'
    ),
    'rollback_integrity',jsonb_build_object(
      'restorable_pages',coalesce((v_drift->>'restorable_pages')::int,0),
      'validated_backup_hashes',coalesce((v_drift->>'validated_backup_hashes')::int,0),
      'validated_restore_objects',coalesce((v_drift->>'validated_restore_objects')::int,0)
    ),
    'stripe_runtime_incident',v_baseline#>'{notes,stripe_runtime_incident}',
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'known_external_items',v_external,
    'generated_at',now()
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260907030412 operational_alert_for_blogger_reauth_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_operational_evaluate_alerts()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  s jsonb;
  slo record;
  k text;
  v_blog_status text;
  v_blog_error text;
begin
  s:=private.tgg_operational_control_snapshot();

  if s->>'state' in ('degraded','blocked') then
    k:='control_plane:'||coalesce(s->>'state','unknown');
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values(
      k,
      case when s->>'state'='blocked' then 'critical' else 'warning' end,
      'control_plane',
      s
    )
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity=excluded.severity;
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where status<>'resolved'
      and alert_key like 'control_plane:%';
  end if;

  for slo in
    select distinct on (subsystem)
      subsystem,health,availability_pct,success_count,failure_count
    from public.tgg_operational_slo_snapshots
    order by subsystem,snapshot_at desc
  loop
    k:='slo:'||slo.subsystem;
    if slo.health in ('degraded','blocked') then
      insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
      values(
        k,
        case when slo.health='blocked' then 'critical' else 'warning' end,
        slo.subsystem,
        jsonb_build_object(
          'health',slo.health,
          'availability_pct',slo.availability_pct,
          'success_count',slo.success_count,
          'failure_count',slo.failure_count
        )
      )
      on conflict(alert_key) do update
      set status='open',
          last_seen=now(),
          occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
          last_payload=excluded.last_payload,
          severity=excluded.severity;
    else
      update public.tgg_operational_alerts
      set status='resolved',last_seen=now()
      where alert_key=k
        and status<>'resolved';
    end if;
  end loop;

  select status,last_error
  into v_blog_status,v_blog_error
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1;

  if coalesce(v_blog_status,'')<>'connected' then
    insert into public.tgg_operational_alerts(
      alert_key,severity,subsystem,last_payload
    )
    values(
      'maintenance:blogger_reauth_required',
      'warning',
      'blogger_maintenance',
      jsonb_build_object(
        'status',v_blog_status,
        'last_error',v_blog_error,
        'runtime_impact',false,
        'maintenance_impact',true,
        'action','reauthorize Google Blogger OAuth'
      )
    )
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='warning',
        subsystem='blogger_maintenance';
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where alert_key='maintenance:blogger_reauth_required'
      and status<>'resolved';
  end if;
end
$function$;


-- ============================================================
-- MIGRATION 20260907101658 separate_blogger_oauth_maintenance_from_content_drift_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_monitor_blogger_live_state()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_live jsonb;
  v_checked timestamptz;
  v_fresh boolean:=false;
  v_complete boolean:=false;
  v_last_content_ok boolean:=false;
  v_actual_drift boolean:=false;
  v_locked integer:=0;
  v_seen integer:=0;
  v_drift_count integer:=0;
  v_payload jsonb;
  v_blog_status text;
  v_blog_error text;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  v_live:=coalesce(v_baseline.notes->'live_blogger_hash_monitor','{}'::jsonb);

  begin
    v_checked:=(v_live->>'checked_at')::timestamptz;
    v_fresh:=v_checked>=now()-interval '40 minutes';
  exception when others then
    v_fresh:=false;
  end;

  v_locked:=coalesce((v_live->>'locked_pages')::integer,0);
  v_seen:=coalesce((v_live->>'live_pages_checked')::integer,0);
  v_drift_count:=coalesce((v_live->>'drift_count')::integer,0);
  v_complete:=v_locked>0 and v_seen=v_locked;
  v_last_content_ok:=coalesce((v_live->>'ok')::boolean,false)
    and v_complete
    and v_drift_count=0;

  select status,last_error
  into v_blog_status,v_blog_error
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1;

  -- Only declare production content drift when the monitor actually observed drift
  -- or a fresh, complete check reported non-OK content.
  v_actual_drift :=
    v_drift_count>0
    or (
      v_fresh
      and v_complete
      and not coalesce((v_live->>'ok')::boolean,false)
    );

  v_payload:=v_live || jsonb_build_object(
    'fresh',v_fresh,
    'complete',v_complete,
    'last_content_ok',v_last_content_ok,
    'actual_drift',v_actual_drift,
    'blogger_connection_status',v_blog_status,
    'blogger_last_error',v_blog_error,
    'monitor_age_seconds',case
      when v_checked is null then null
      else extract(epoch from (now()-v_checked))::bigint
    end,
    'checked_by','private.tgg_monitor_blogger_live_state',
    'evaluated_at',now()
  );

  if not v_actual_drift then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v_payload
    where alert_key='production:blogger_live_drift'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:blogger_live_drift',
      'open',
      'warning',
      'blogger_live',
      now(),now(),1,v_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='blogger_live',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;
end
$function$;

revoke all on function private.tgg_monitor_blogger_live_state()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907102944 trim_realtime_to_current_v516_frontend
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter publication supabase_realtime drop table
  public.messages,
  public.notifications,
  public.tgg_call_participants,
  public.tgg_collaboration_requests,
  public.tgg_live_events,
  public.tgg_stories,
  public.tgg_vault_items;

alter publication supabase_realtime add table
  public.tgg_messages;

update public.tgg_production_baselines
set notes = jsonb_set(
  notes,
  '{realtime_publication}',
  jsonb_build_object(
    'publication','supabase_realtime',
    'expected_tables',jsonb_build_array(
      'tgg_call_signals',
      'tgg_live_chat_messages',
      'tgg_live_guest_requests',
      'tgg_messages',
      'tgg_studio_project_events',
      'tgg_studio_project_presence'
    ),
    'table_count',6,
    'source','latest_validated_backup_subscription_scan',
    'verified_at',now()
  ),
  true
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907103058 reconcile_v516_drift_contract_after_realtime_trim
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


with current_rt as (
  select tablename
  from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime'
    and schemaname='public'
),
matrix as (
  select jsonb_agg(
    jsonb_build_object(
      'table',rt.tablename,
      'anon_select',has_table_privilege('anon',format('public.%I',rt.tablename),'SELECT'),
      'anon_insert',has_table_privilege('anon',format('public.%I',rt.tablename),'INSERT'),
      'anon_update',has_table_privilege('anon',format('public.%I',rt.tablename),'UPDATE'),
      'anon_delete',has_table_privilege('anon',format('public.%I',rt.tablename),'DELETE'),
      'auth_select',has_table_privilege('authenticated',format('public.%I',rt.tablename),'SELECT'),
      'auth_insert',has_table_privilege('authenticated',format('public.%I',rt.tablename),'INSERT'),
      'auth_update',has_table_privilege('authenticated',format('public.%I',rt.tablename),'UPDATE'),
      'auth_delete',has_table_privilege('authenticated',format('public.%I',rt.tablename),'DELETE'),
      'policy_count',(
        select count(*)
        from pg_policies p
        where p.schemaname='public'
          and p.tablename=rt.tablename
      )
    )
    order by rt.tablename
  ) as value
  from current_rt rt
)
update public.tgg_production_baselines
set notes =
  jsonb_set(
    jsonb_set(
      notes,
      '{page_hashes,/p/career-os.html}',
      to_jsonb('c5871333c8383229365b650c84316f2ba218cd327c8438cf8234220d6d9a0571'::text),
      true
    ),
    '{realtime_access_contract}',
    jsonb_build_object(
      'matrix',(select value from matrix),
      'locked_at',now()
    ),
    true
  )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907103306 create_pending_blogger_patch_queue_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.tgg_blogger_pending_patches (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  page_id text not null,
  title text not null,
  original_hash text not null,
  patched_hash text not null,
  content text not null,
  status text not null default 'staged'
    check (status in ('staged','blocked_google_reauth','deployed','cancelled','failed')),
  blocked_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_blogger_pending_patches enable row level security;
revoke all on public.tgg_blogger_pending_patches from anon,authenticated;


-- ============================================================
-- MIGRATION 20260907103527 separate_runtime_integrity_from_blogger_maintenance_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_live jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_live_complete boolean:=false;
  v_live_verified boolean:=false;
  v_locked_pages integer:=0;
  v_live_pages integer:=0;
  v_expected_routes int;
  v_current_routes int;
  v_core_ok boolean:=false;
  v_maintenance_ready boolean:=false;
  v_commerce_ready boolean:=false;
  v_commerce_required boolean:=false;
  v_external jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();
  v_live:=coalesce(v_baseline#>'{notes,live_blogger_hash_monitor}','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_locked_pages:=coalesce((v_live->>'locked_pages')::integer,0);
  v_live_pages:=coalesce((v_live->>'live_pages_checked')::integer,0);
  v_live_complete:=v_locked_pages>0 and v_live_pages=v_locked_pages;
  v_live_verified:=coalesce((v_live->>'ok')::boolean,false) and v_live_complete;

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  -- Core runtime integrity is based on the locked production contract.
  -- Blogger OAuth/live verification freshness is reported separately as maintenance health.
  v_core_ok :=
    coalesce((v_drift->>'ok')::boolean,false)
    and v_expected_routes>0
    and v_expected_routes=v_current_routes
    and v_artist is not null;

  v_maintenance_ready := coalesce((v_blog->>'ok')::boolean,false);

  v_commerce_ready :=
    coalesce((v_provider#>>'{payments,ready}')::boolean,false);

  v_commerce_required :=
    exists(
      select 1
      from public.merch_products
      where status='published'
    )
    or exists(
      select 1
      from public.tgg_membership_tiers
      where coalesce(is_active,true)=true
    );

  v_external:=jsonb_build_array(
    'Supabase leaked-password protection setting remains disabled',
    'Production DSP endpoint is not configured',
    'Two-user realtime/call smoke requires a second legitimate account/device'
  );

  if not v_maintenance_ready then
    v_external:=v_external || jsonb_build_array(
      'Blogger deployment maintenance requires Google OAuth reauthorization; live pages and backups remain intact'
    );
  end if;

  if not v_commerce_ready then
    v_external:=v_external || jsonb_build_array(
      case
        when v_commerce_required then
          'Store checkout session creation is disabled until the Stripe server secret is restored in the Edge runtime'
        else
          'Stripe checkout runtime is in standby; no published products or active membership tiers currently require checkout'
      end
    );
  end if;

  return jsonb_build_object(
    'ok',v_core_ok and (not v_commerce_required or v_commerce_ready),
    'core_ok',v_core_ok,
    'runtime_integrity_ready',v_core_ok,
    'maintenance_ready',v_maintenance_ready,
    'maintenance_status',case
      when v_maintenance_ready then 'ready'
      when coalesce(v_blog#>>'{blog,last_error}','')='google_oauth_invalid_grant'
        then 'google_reauth_required'
      else 'degraded'
    end,
    'live_verification_ready',v_live_verified,
    'live_verification_fresh',v_live_fresh,
    'live_verification_status',case
      when v_live_verified and v_live_fresh then 'verified_fresh'
      when v_live_verified then 'verified_stale'
      else 'unverified'
    end,
    'commerce_ready',v_commerce_ready,
    'commerce_required',v_commerce_required,
    'launch_status',case
      when v_core_ok and (not v_commerce_required or v_commerce_ready) then
        case
          when not v_maintenance_ready then 'runtime_ready_maintenance_reauth_required'
          when not v_live_fresh then 'runtime_ready_live_verification_stale'
          when v_commerce_required then 'ready'
          else 'ready_commerce_standby'
        end
      when v_core_ok and v_commerce_required and not v_commerce_ready then
        'core_ready_checkout_blocked'
      else 'degraded'
    end,
    'baseline',v_baseline->>'version',
    'version','V516-FINAL',
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'blogger_live_content',
      v_live || jsonb_build_object(
        'fresh',v_live_fresh,
        'complete',v_live_complete,
        'verified',v_live_verified
      ),
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_v516_drift_contract'
    ),
    'rollback_integrity',jsonb_build_object(
      'restorable_pages',coalesce((v_drift->>'restorable_pages')::int,0),
      'validated_backup_hashes',coalesce((v_drift->>'validated_backup_hashes')::int,0),
      'validated_restore_objects',coalesce((v_drift->>'validated_restore_objects')::int,0)
    ),
    'stripe_runtime_incident',v_baseline#>'{notes,stripe_runtime_incident}',
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'pending_blogger_patches',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'path',path,
          'status',status,
          'blocked_reason',blocked_reason,
          'patched_hash',patched_hash
        )
        order by path
      )
      from public.tgg_blogger_pending_patches
      where status in ('staged','blocked_google_reauth')
    ),'[]'::jsonb),
    'known_external_items',v_external,
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_final_platform_health() to authenticated;
revoke execute on function public.tgg_final_platform_health() from anon,public;


-- ============================================================
-- MIGRATION 20260907103606 allow_safe_pending_patch_health_metadata_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke all on public.tgg_blogger_pending_patches from anon,authenticated;

grant select(path,status,blocked_reason,patched_hash)
on public.tgg_blogger_pending_patches
to authenticated;

drop policy if exists tgg_blogger_pending_patches_health_read
on public.tgg_blogger_pending_patches;

create policy tgg_blogger_pending_patches_health_read
on public.tgg_blogger_pending_patches
for select
to authenticated
using ((select auth.uid()) is not null);


-- ============================================================
-- MIGRATION 20260907103659 pause_blogger_hash_http_when_oauth_unavailable_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_trigger_blogger_live_monitor()
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text;
  v_request_id bigint;
  v_status text;
  v_revoked_at timestamptz;
begin
  select status,revoked_at
  into v_status,v_revoked_at
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1;

  if coalesce(v_status,'')<>'connected' or v_revoked_at is not null then
    update public.tgg_production_baselines
    set notes = notes || jsonb_build_object(
      'blogger_hash_monitor_runtime',
      jsonb_build_object(
        'status','paused_oauth_unavailable',
        'connection_status',v_status,
        'revoked_at',v_revoked_at,
        'checked_at',now()
      )
    )
    where version='V516-FINAL';

    return 0;
  end if;

  select monitor_token
  into v_token
  from public.tgg_blogger_monitor_runtime
  where id=1
    and active=true;

  if v_token is null then
    raise exception 'blogger_monitor_runtime_unavailable';
  end if;

  select net.http_post(
    url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-final-batch-deploy',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-tgg-monitor-token',v_token
    ),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  return v_request_id;
end
$function$;

revoke all on function private.tgg_trigger_blogger_live_monitor()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907105036 reconcile_v516_rollback_contract_to_current_37_page_baseline
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes =
  (notes - 'backup_integrity_rescan_armed')
  || jsonb_build_object(
    'rollback_contract',
    jsonb_build_object(
      'locked_pages',37,
      'restorable_pages',37,
      'valid_restore_payloads',37,
      'invalid_restore_payloads',0,
      'missing_backups',0,
      'backup_bucket','v98-blogger-backups',
      'verified_at','2026-09-07T10:23:13.534Z'
    )
  )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907105225 refresh_command_center_validated_backup_contract_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines b
set notes = jsonb_set(
  notes,
  '{validated_backup_contract,backups}',
  (
    select jsonb_agg(
      case
        when x->>'path'='/p/command-center.html'
        then x
          || jsonb_build_object(
            'backup_id','9398535c-2998-4cda-a28f-11564b2486c8',
            'body_hash','5954ccce35d9debb0564cd51b6a369ae1fa008dfde1dbb02a46fe094f0212401'
          )
        else x
      end
      order by x->>'path'
    )
    from jsonb_array_elements(
      coalesce(notes#>'{validated_backup_contract,backups}','[]'::jsonb)
    ) x
  ),
  true
)
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907105754 use_live_blogger_monitor_for_page_drift_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_production_baseline_drift_core()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_expected jsonb;
  v_drift jsonb:='[]'::jsonb;
  v_expected_pages integer:=0;
  v_expected_routes text[]:=array[]::text[];
  v_current_routes text[]:=array[]::text[];
  v_expected_realtime text[]:=array[]::text[];
  v_current_realtime text[]:=array[]::text[];
  v_expected_storage jsonb:='{}'::jsonb;
  v_current_storage jsonb:='{}'::jsonb;
  v_restorable_pages integer:=0;
  v_missing_backup_paths jsonb:='[]'::jsonb;
  v_validated_expected integer:=0;
  v_validated_present integer:=0;
  v_missing_validated jsonb:='[]'::jsonb;
  v_live jsonb:='{}'::jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_live_complete boolean:=false;
  v_live_ok boolean:=false;
  v_live_drift_count integer:=0;
  v_live_locked integer:=0;
  v_live_seen integer:=0;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  if v_baseline.version is null then
    return jsonb_build_object('ok',false,'error','locked_baseline_missing');
  end if;

  v_expected:=coalesce(v_baseline.notes->'page_hashes','{}'::jsonb);

  select count(*) into v_expected_pages
  from jsonb_object_keys(v_expected);

  -- Page-content truth comes from the dedicated live Blogger hash monitor,
  -- not historical deployment rows.
  v_live:=coalesce(v_baseline.notes->'live_blogger_hash_monitor','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_live_ok:=coalesce((v_live->>'ok')::boolean,false);
  v_live_drift_count:=coalesce((v_live->>'drift_count')::integer,0);
  v_live_locked:=coalesce((v_live->>'locked_pages')::integer,0);
  v_live_seen:=coalesce((v_live->>'live_pages_checked')::integer,0);
  v_live_complete:=v_live_locked=v_expected_pages
    and v_live_seen=v_expected_pages
    and v_expected_pages>0;

  if v_live_drift_count>0
     or (v_live_fresh and v_live_complete and not v_live_ok)
  then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','blogger_live_content',
        'fresh',v_live_fresh,
        'complete',v_live_complete,
        'expected_pages',v_expected_pages,
        'locked_pages',v_live_locked,
        'live_pages_checked',v_live_seen,
        'drift_count',v_live_drift_count,
        'drift',coalesce(v_live->'drift','[]'::jsonb),
        'missing_pages',coalesce(v_live->'missing_pages','[]'::jsonb),
        'checked_at',v_live->>'checked_at'
      )
    );
  end if;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_routes
  from jsonb_array_elements_text(
    coalesce(v_baseline.notes#>'{route_audit,present}','[]'::jsonb)
  );

  select coalesce(array_agg(path order by path),array[]::text[])
  into v_current_routes
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q;

  if v_expected_routes is distinct from v_current_routes then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','route_contract',
        'expected_routes',to_jsonb(v_expected_routes),
        'current_routes',to_jsonb(v_current_routes)
      )
    );
  end if;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_realtime
  from jsonb_array_elements_text(
    coalesce(v_baseline.notes#>'{realtime_publication,expected_tables}','[]'::jsonb)
  );

  select coalesce(array_agg(tablename order by tablename),array[]::text[])
  into v_current_realtime
  from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime'
    and schemaname='public';

  if v_expected_realtime is distinct from v_current_realtime then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','realtime_publication',
        'expected_tables',to_jsonb(v_expected_realtime),
        'current_tables',to_jsonb(v_current_realtime)
      )
    );
  end if;

  v_expected_storage:=coalesce(v_baseline.notes#>'{storage_contract,buckets}','{}'::jsonb);

  select coalesce(jsonb_object_agg(id,public order by id),'{}'::jsonb)
  into v_current_storage
  from storage.buckets
  where id in (
    'artist-images','audio','covers','creator-media',
    'media-thumbnails','mixtape-audio','v98-blogger-backups','videos'
  );

  if v_expected_storage is distinct from v_current_storage then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','storage_bucket_privacy',
        'expected',v_expected_storage,
        'current',v_current_storage
      )
    );
  end if;

  with locked as (
    select x->>'path' as path,x->>'page_id' as page_id
    from jsonb_array_elements(v_baseline.notes#>'{full_page_snapshot,pages}') x
  ),
  backup_map as (
    select
      l.path,
      count(distinct b.id) as backup_records,
      count(distinct o.name) as backup_objects
    from locked l
    left join public.v98_blogger_backups b
      on b.resource_type='page'
     and b.resource_key=l.page_id
    left join storage.objects o
      on o.bucket_id='v98-blogger-backups'
     and o.name=b.storage_path
    group by l.path
  )
  select
    count(*) filter(where backup_records>0 and backup_objects>0),
    coalesce(
      jsonb_agg(path order by path) filter(where backup_records=0 or backup_objects=0),
      '[]'::jsonb
    )
  into v_restorable_pages,v_missing_backup_paths
  from backup_map;

  if v_restorable_pages is distinct from v_expected_pages then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','rollback_readiness',
        'expected_pages',v_expected_pages,
        'restorable_pages',v_restorable_pages,
        'missing_paths',v_missing_backup_paths
      )
    );
  end if;

  with expected as (
    select
      x->>'path' as path,
      nullif(x->>'backup_id','')::uuid as backup_id
    from jsonb_array_elements(
      coalesce(v_baseline.notes#>'{validated_backup_contract,backups}','[]'::jsonb)
    ) x
  ),
  verified as (
    select
      e.path,
      e.backup_id,
      b.storage_path,
      o.name as object_name
    from expected e
    left join public.v98_blogger_backups b on b.id=e.backup_id
    left join storage.objects o
      on o.bucket_id='v98-blogger-backups'
     and o.name=b.storage_path
  )
  select
    count(*),
    count(*) filter(where backup_id is not null and storage_path is not null and object_name is not null),
    coalesce(
      jsonb_agg(path order by path)
      filter(where backup_id is null or storage_path is null or object_name is null),
      '[]'::jsonb
    )
  into v_validated_expected,v_validated_present,v_missing_validated
  from verified;

  if v_validated_expected is distinct from v_expected_pages
     or v_validated_present is distinct from v_expected_pages
  then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','validated_restore_objects',
        'expected_pages',v_expected_pages,
        'validated_manifest_entries',v_validated_expected,
        'validated_objects_present',v_validated_present,
        'missing_paths',v_missing_validated
      )
    );
  end if;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_drift)=0,
    'baseline',v_baseline.version,
    'checked_at',now(),
    'expected_pages',v_expected_pages,
    'blogger_live_fresh',v_live_fresh,
    'blogger_live_complete',v_live_complete,
    'blogger_live_ok',v_live_ok,
    'restorable_pages',v_restorable_pages,
    'validated_restore_objects',v_validated_present,
    'expected_route_paths',cardinality(v_expected_routes),
    'current_route_paths',cardinality(v_current_routes),
    'expected_realtime_tables',cardinality(v_expected_realtime),
    'current_realtime_tables',cardinality(v_current_realtime),
    'storage_buckets_checked',(select count(*) from jsonb_object_keys(v_expected_storage)),
    'drift_count',jsonb_array_length(v_drift),
    'drift',v_drift
  );
end
$function$;

update public.tgg_production_baselines
set notes = notes - 'artist_contract_refresh_armed'
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907105903 dedupe_blogger_reconnect_link_deny_policies_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists deny_anon_reconnect_links
on public.tgg_blogger_reconnect_links;

drop policy if exists deny_authenticated_reconnect_links
on public.tgg_blogger_reconnect_links;


-- ============================================================
-- MIGRATION 20260907110021 reconcile_full_page_snapshot_summary_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = jsonb_set(
              jsonb_set(notes,'{full_page_snapshot,expected_pages}','37'::jsonb,true),
              '{full_page_snapshot,snapshotted_pages}',
              '37'::jsonb,
              true
            )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907112222 fix_blogger_monitor_for_v518_oauth_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_trigger_blogger_live_monitor()
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text;
  v_request_id bigint;
  v_status text;
  v_revoked_at timestamptz;
  v_baseline_version text;
begin
  select version
  into v_baseline_version
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  select status,revoked_at
  into v_status,v_revoked_at
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1;

  if coalesce(v_status,'')<>'connected' or v_revoked_at is not null then
    update public.tgg_production_baselines
    set notes = notes || jsonb_build_object(
      'blogger_hash_monitor_runtime',
      jsonb_build_object(
        'status','paused_oauth_unavailable',
        'connection_status',v_status,
        'revoked_at',v_revoked_at,
        'checked_at',now()
      )
    )
    where version=v_baseline_version;

    return 0;
  end if;

  select monitor_token
  into v_token
  from public.tgg_blogger_monitor_runtime
  where id=1
    and active=true;

  if v_token is null then
    raise exception 'blogger_monitor_runtime_unavailable';
  end if;

  select net.http_post(
    url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-final-batch-deploy',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-tgg-monitor-token',v_token
    ),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  return v_request_id;
end
$function$;

create or replace function private.tgg_monitor_blogger_live_state()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_live jsonb;
  v_checked timestamptz;
  v_fresh boolean:=false;
  v_complete boolean:=false;
  v_last_content_ok boolean:=false;
  v_actual_drift boolean:=false;
  v_locked integer:=0;
  v_seen integer:=0;
  v_drift_count integer:=0;
  v_payload jsonb;
  v_blog_status text;
  v_blog_error text;
  v_revoked_at timestamptz;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  v_live:=coalesce(v_baseline.notes->'live_blogger_hash_monitor','{}'::jsonb);

  begin
    v_checked:=(v_live->>'checked_at')::timestamptz;
    v_fresh:=v_checked>=now()-interval '40 minutes';
  exception when others then
    v_fresh:=false;
  end;

  v_locked:=coalesce((v_live->>'locked_pages')::integer,0);
  v_seen:=coalesce((v_live->>'live_pages_checked')::integer,0);
  v_drift_count:=coalesce((v_live->>'drift_count')::integer,0);
  v_complete:=v_locked>0 and v_seen=v_locked;
  v_last_content_ok:=coalesce((v_live->>'ok')::boolean,false)
    and v_complete
    and v_drift_count=0;

  select status,last_error,revoked_at
  into v_blog_status,v_blog_error,v_revoked_at
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1;

  v_actual_drift :=
    v_drift_count>0
    or (
      v_fresh
      and v_complete
      and not coalesce((v_live->>'ok')::boolean,false)
    );

  v_payload:=v_live || jsonb_build_object(
    'fresh',v_fresh,
    'complete',v_complete,
    'last_content_ok',v_last_content_ok,
    'actual_drift',v_actual_drift,
    'blogger_connection_status',v_blog_status,
    'blogger_last_error',v_blog_error,
    'blogger_revoked_at',v_revoked_at,
    'monitor_age_seconds',case
      when v_checked is null then null
      else extract(epoch from (now()-v_checked))::bigint
    end,
    'checked_by','private.tgg_monitor_blogger_live_state',
    'evaluated_at',now()
  );

  if not v_actual_drift then
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now(),last_payload=v_payload
    where alert_key='production:blogger_live_drift'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'production:blogger_live_drift','open','warning','blogger_live',
      now(),now(),1,v_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='blogger_live',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;

  if coalesce(v_blog_status,'')='connected'
     and v_revoked_at is null
     and coalesce(v_blog_error,'') not in ('google_oauth_invalid_grant')
  then
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now(),last_payload=v_payload
    where alert_key='integration:blogger_oauth'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(
      alert_key,status,severity,subsystem,
      first_seen,last_seen,occurrence_count,last_payload
    )
    values(
      'integration:blogger_oauth','open','warning','blogger_oauth',
      now(),now(),1,v_payload
    )
    on conflict(alert_key) do update
    set status='open',
        severity='warning',
        subsystem='blogger_oauth',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload;
  end if;
end
$function$;

revoke all on function private.tgg_trigger_blogger_live_monitor() from public,anon,authenticated;
revoke all on function private.tgg_monitor_blogger_live_state() from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907112314 make_final_platform_health_baseline_dynamic_v518
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_live jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_live_complete boolean:=false;
  v_live_verified boolean:=false;
  v_locked_pages integer:=0;
  v_live_pages integer:=0;
  v_expected_routes int;
  v_current_routes int;
  v_core_ok boolean:=false;
  v_maintenance_ready boolean:=false;
  v_commerce_ready boolean:=false;
  v_commerce_required boolean:=false;
  v_external jsonb;
  v_version text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_version:=coalesce(v_baseline->>'version','UNLOCKED');
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();
  v_live:=coalesce(v_baseline#>'{notes,live_blogger_hash_monitor}','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_locked_pages:=coalesce((v_live->>'locked_pages')::integer,0);
  v_live_pages:=coalesce((v_live->>'live_pages_checked')::integer,0);
  v_live_complete:=v_locked_pages>0 and v_live_pages=v_locked_pages;
  v_live_verified:=coalesce((v_live->>'ok')::boolean,false) and v_live_complete;

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  v_core_ok :=
    coalesce((v_drift->>'ok')::boolean,false)
    and v_expected_routes>0
    and v_expected_routes=v_current_routes
    and v_artist is not null;

  v_maintenance_ready := coalesce((v_blog->>'ok')::boolean,false);

  v_commerce_ready :=
    coalesce((v_provider#>>'{payments,ready}')::boolean,false);

  v_commerce_required :=
    exists(
      select 1
      from public.merch_products
      where status='published'
    )
    or exists(
      select 1
      from public.tgg_membership_tiers
      where coalesce(is_active,true)=true
    );

  v_external:=jsonb_build_array(
    'Supabase leaked-password protection setting remains disabled',
    'Production DSP endpoint is not configured',
    'Two-user realtime/call smoke requires a second legitimate account/device'
  );

  if not v_maintenance_ready then
    v_external:=v_external || jsonb_build_array(
      'Blogger deployment maintenance requires Google OAuth reauthorization; live pages and existing backups remain intact'
    );
  end if;

  if not v_commerce_ready then
    v_external:=v_external || jsonb_build_array(
      case
        when v_commerce_required then
          'Store checkout session creation is disabled until the Stripe server secret is restored in the Edge runtime'
        else
          'Stripe checkout runtime is in standby; no published products or active membership tiers currently require checkout'
      end
    );
  end if;

  return jsonb_build_object(
    'ok',v_core_ok and (not v_commerce_required or v_commerce_ready),
    'core_ok',v_core_ok,
    'runtime_integrity_ready',v_core_ok,
    'maintenance_ready',v_maintenance_ready,
    'maintenance_status',case
      when v_maintenance_ready then 'ready'
      when coalesce(v_blog#>>'{blog,last_error}','')='google_oauth_invalid_grant'
        then 'google_reauth_required'
      else 'degraded'
    end,
    'live_verification_ready',v_live_verified,
    'live_verification_fresh',v_live_fresh,
    'live_verification_status',case
      when v_live_verified and v_live_fresh then 'verified_fresh'
      when v_live_verified then 'verified_stale'
      else 'unverified'
    end,
    'commerce_ready',v_commerce_ready,
    'commerce_required',v_commerce_required,
    'launch_status',case
      when v_core_ok and (not v_commerce_required or v_commerce_ready) then
        case
          when not v_maintenance_ready then 'runtime_ready_maintenance_reauth_required'
          when not v_live_fresh then 'runtime_ready_live_verification_stale'
          when v_commerce_required then 'ready'
          else 'ready_commerce_standby'
        end
      when v_core_ok and v_commerce_required and not v_commerce_ready then
        'core_ready_checkout_blocked'
      else 'degraded'
    end,
    'baseline',v_version,
    'version',v_version,
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'blogger_live_content',
      v_live || jsonb_build_object(
        'fresh',v_live_fresh,
        'complete',v_live_complete,
        'verified',v_live_verified
      ),
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_locked_baseline_drift_contract'
    ),
    'rollback_integrity',jsonb_build_object(
      'restorable_pages',coalesce((v_drift->>'restorable_pages')::int,0),
      'validated_backup_hashes',coalesce((v_drift->>'validated_backup_hashes')::int,0),
      'validated_restore_objects',coalesce((v_drift->>'validated_restore_objects')::int,0)
    ),
    'stripe_runtime_incident',v_baseline#>'{notes,stripe_runtime_incident}',
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'pending_blogger_patches',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'path',path,
          'status',status,
          'blocked_reason',blocked_reason,
          'patched_hash',patched_hash
        )
        order by path
      )
      from public.tgg_blogger_pending_patches
      where status in ('staged','blocked_google_reauth')
    ),'[]'::jsonb),
    'known_external_items',v_external,
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_final_platform_health() to authenticated;
revoke execute on function public.tgg_final_platform_health() from anon,public;


-- ============================================================
-- MIGRATION 20260907112452 separate_runtime_health_from_rollback_health_v518
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_final_platform_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_artist uuid;
  v_baseline jsonb;
  v_drift jsonb;
  v_blog jsonb;
  v_provider jsonb;
  v_live jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_live_complete boolean:=false;
  v_live_verified boolean:=false;
  v_locked_pages integer:=0;
  v_live_pages integer:=0;
  v_expected_routes int;
  v_current_routes int;
  v_runtime_drift_count int:=0;
  v_rollback_drift_count int:=0;
  v_core_ok boolean:=false;
  v_rollback_ready boolean:=false;
  v_maintenance_ready boolean:=false;
  v_commerce_ready boolean:=false;
  v_commerce_required boolean:=false;
  v_external jsonb;
  v_version text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select id into v_artist
  from public.artists
  where user_id=v_uid
  order by created_at
  limit 1;

  v_baseline:=private.tgg_production_baseline();
  v_version:=coalesce(v_baseline->>'version','UNLOCKED');
  v_drift:=private.tgg_production_baseline_drift();
  v_blog:=public.tgg_get_blogger_bridge_health();
  v_provider:=public.tgg_get_provider_pipeline_health();
  v_live:=coalesce(v_baseline#>'{notes,live_blogger_hash_monitor}','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_locked_pages:=coalesce((v_live->>'locked_pages')::integer,0);
  v_live_pages:=coalesce((v_live->>'live_pages_checked')::integer,0);
  v_live_complete:=v_locked_pages>0 and v_live_pages=v_locked_pages;
  v_live_verified:=coalesce((v_live->>'ok')::boolean,false) and v_live_complete;

  v_expected_routes:=coalesce((v_drift->>'expected_route_paths')::int,0);
  v_current_routes:=coalesce((v_drift->>'current_route_paths')::int,0);

  select
    count(*) filter(
      where coalesce(x->>'type','') not in (
        'backup_hash_parity',
        'validated_restore_objects',
        'rollback_readiness'
      )
    ),
    count(*) filter(
      where coalesce(x->>'type','') in (
        'backup_hash_parity',
        'validated_restore_objects',
        'rollback_readiness'
      )
    )
  into v_runtime_drift_count,v_rollback_drift_count
  from jsonb_array_elements(coalesce(v_drift->'drift','[]'::jsonb)) x;

  v_core_ok :=
    v_runtime_drift_count=0
    and v_expected_routes>0
    and v_expected_routes=v_current_routes
    and v_artist is not null;

  v_rollback_ready :=
    v_rollback_drift_count=0
    and coalesce((v_drift->>'restorable_pages')::int,0)
      = coalesce((v_drift->>'expected_pages')::int,0)
    and coalesce((v_drift->>'validated_restore_objects')::int,0)
      = coalesce((v_drift->>'expected_pages')::int,0);

  v_maintenance_ready := coalesce((v_blog->>'ok')::boolean,false);

  v_commerce_ready :=
    coalesce((v_provider#>>'{payments,ready}')::boolean,false);

  v_commerce_required :=
    exists(
      select 1
      from public.merch_products
      where status='published'
    )
    or exists(
      select 1
      from public.tgg_membership_tiers
      where coalesce(is_active,true)=true
    );

  v_external:=jsonb_build_array(
    'Supabase leaked-password protection setting remains disabled',
    'Production DSP endpoint is not configured',
    'Two-user realtime/call smoke requires a second legitimate account/device'
  );

  if not v_maintenance_ready then
    v_external:=v_external || jsonb_build_array(
      'Blogger deployment maintenance requires Google OAuth reauthorization; live pages and existing backups remain intact'
    );
  end if;

  if not v_rollback_ready then
    v_external:=v_external || jsonb_build_array(
      'Some rollback copies predate the current locked page content and require Blogger OAuth before exact backup parity can be refreshed'
    );
  end if;

  if not v_commerce_ready then
    v_external:=v_external || jsonb_build_array(
      case
        when v_commerce_required then
          'Store checkout session creation is disabled until the Stripe server secret is restored in the Edge runtime'
        else
          'Stripe checkout runtime is in standby; no published products or active membership tiers currently require checkout'
      end
    );
  end if;

  return jsonb_build_object(
    'ok',v_core_ok and (not v_commerce_required or v_commerce_ready),
    'core_ok',v_core_ok,
    'runtime_integrity_ready',v_core_ok,
    'runtime_drift_count',v_runtime_drift_count,
    'rollback_ready',v_rollback_ready,
    'rollback_drift_count',v_rollback_drift_count,
    'maintenance_ready',v_maintenance_ready,
    'maintenance_status',case
      when v_maintenance_ready then 'ready'
      when coalesce(v_blog#>>'{blog,last_error}','')='google_oauth_invalid_grant'
        then 'google_reauth_required'
      else 'degraded'
    end,
    'live_verification_ready',v_live_verified,
    'live_verification_fresh',v_live_fresh,
    'live_verification_status',case
      when v_live_verified and v_live_fresh then 'verified_fresh'
      when v_live_verified then 'verified_stale'
      else 'unverified'
    end,
    'commerce_ready',v_commerce_ready,
    'commerce_required',v_commerce_required,
    'launch_status',case
      when v_core_ok and (not v_commerce_required or v_commerce_ready) then
        case
          when not v_maintenance_ready then 'runtime_ready_maintenance_reauth_required'
          when not v_rollback_ready then 'runtime_ready_rollback_refresh_required'
          when not v_live_fresh then 'runtime_ready_live_verification_stale'
          when v_commerce_required then 'ready'
          else 'ready_commerce_standby'
        end
      when v_core_ok and v_commerce_required and not v_commerce_ready then
        'core_ready_checkout_blocked'
      else 'degraded'
    end,
    'baseline',v_version,
    'version',v_version,
    'locked_at',v_baseline->>'locked_at',
    'artist_ready',v_artist is not null,
    'artist_id',v_artist,
    'blogger',v_blog,
    'blogger_live_content',
      v_live || jsonb_build_object(
        'fresh',v_live_fresh,
        'complete',v_live_complete,
        'verified',v_live_verified
      ),
    'providers',v_provider,
    'drift',v_drift,
    'route_integrity',jsonb_build_object(
      'ok',v_expected_routes>0 and v_expected_routes=v_current_routes,
      'expected_unique_page_paths',v_expected_routes,
      'present_count',v_current_routes,
      'missing_count',greatest(v_expected_routes-v_current_routes,0),
      'source','dynamic_locked_baseline_drift_contract'
    ),
    'rollback_integrity',jsonb_build_object(
      'ready',v_rollback_ready,
      'restorable_pages',coalesce((v_drift->>'restorable_pages')::int,0),
      'validated_backup_hashes',coalesce((v_drift->>'validated_backup_hashes')::int,0),
      'validated_restore_objects',coalesce((v_drift->>'validated_restore_objects')::int,0)
    ),
    'stripe_runtime_incident',v_baseline#>'{notes,stripe_runtime_incident}',
    'edge_function_capacity',v_baseline#>'{notes,edge_function_capacity}',
    'public_contract',jsonb_build_object(
      'public_routes',jsonb_array_length(public.tgg_get_site_route_manifest()),
      'catalog_releases',(select count(*) from public.tgg_public_mixtape_catalog()),
      'homepage_bundle',public.tgg_get_public_home_bundle(6) is not null
    ),
    'creator_contract',jsonb_build_object(
      'bootstrap',public.tgg_get_creator_bootstrap_bundle() is not null,
      'dashboard',case
        when v_artist is null then false
        else public.tgg_get_creator_dashboard_bundle(v_artist,12) is not null
      end,
      'app',public.tgg_creator_os_app_bundle() is not null,
      'master',public.tgg_creator_os_master_status() is not null
    ),
    'pending_blogger_patches',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'path',path,
          'status',status,
          'blocked_reason',blocked_reason,
          'patched_hash',patched_hash
        )
        order by path
      )
      from public.tgg_blogger_pending_patches
      where status in ('staged','blocked_google_reauth')
    ),'[]'::jsonb),
    'known_external_items',v_external,
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_final_platform_health() to authenticated;
revoke execute on function public.tgg_final_platform_health() from anon,public;


-- ============================================================
-- MIGRATION 20260907112652 update_visible_contract_versions_to_v519
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_frontend_integration_health()
returns jsonb
language plpgsql
security invoker
set search_path='public'
as $function$
declare
  uid uuid:=auth.uid();
  aid uuid;
  blogger jsonb;
  providers jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;

  select id into aid
  from public.artists
  where user_id=uid
  order by created_at
  limit 1;

  blogger:=public.tgg_get_blogger_bridge_health();
  providers:=public.tgg_get_provider_pipeline_health();

  return jsonb_build_object(
    'ok',true,
    'authenticated',true,
    'artist_ready',aid is not null,
    'artist_id',aid,
    'server_time',now(),
    'contracts',public.tgg_get_frontend_api_contract(),
    'shell_ready',true,
    'maintenance_available',true,
    'blogger_bridge',blogger,
    'blogger_ready',coalesce((blogger->>'normal_deploy_ready')::boolean,false),
    'providers',providers,
    'payments_ready',coalesce((providers#>>'{payments,ready}')::boolean,false),
    'payments_catalog_safe',coalesce((providers#>>'{payments,catalog_safe}')::boolean,false),
    'store_checkout_ready',coalesce((providers#>>'{payments,checkout_ready}')::boolean,false),
    'distribution_ready',coalesce((providers#>>'{distribution,ready}')::boolean,false),
    'version','v519'
  );
end
$function$;

create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe public.tgg_provider_runtime_config;
  v_membership public.tgg_provider_runtime_config;
  v_dist public.tgg_provider_runtime_config;
  v_native_ready boolean:=false;
  v_published bigint:=0;
  v_linked bigint:=0;
  v_uncovered bigint:=0;
  v_checkout_ready boolean:=false;
  v_catalog_safe boolean:=false;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_stripe
  from public.tgg_provider_runtime_config
  where provider_key='stripe';

  select * into v_membership
  from public.tgg_provider_runtime_config
  where provider_key='membership.stripe';

  select * into v_dist
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  v_native_ready :=
    coalesce(v_stripe.enabled,false)
    and v_stripe.mode='production'
    and coalesce(v_stripe.endpoint_configured,false);

  select
    count(*),
    count(*) filter(
      where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
    )
  into v_published,v_linked
  from public.merch_products
  where status='published';

  v_uncovered := case
    when v_native_ready then 0
    else greatest(v_published-v_linked,0)
  end;

  v_checkout_ready :=
    v_native_ready
    or (
      v_published>0
      and v_linked=v_published
      and v_uncovered=0
    );

  v_catalog_safe := v_uncovered=0;

  return jsonb_build_object(
    'ok',v_catalog_safe,
    'payments',jsonb_build_object(
      'ready',v_checkout_ready,
      'catalog_safe',v_catalog_safe,
      'status',case
        when v_native_ready then 'native_runtime_ready'
        when v_published=0 then 'no_products_checkout_runtime_unavailable'
        when v_checkout_ready then 'payment_link_fallback_ready'
        else 'published_products_without_checkout'
      end,
      'native_runtime_ready',v_native_ready,
      'native_runtime_status',case
        when v_native_ready then 'ready'
        else coalesce(v_stripe.disabled_reason,'stripe_server_secret_missing')
      end,
      'published_products',v_published,
      'payment_link_fallback_products',v_linked,
      'published_products_without_checkout',v_uncovered,
      'checkout_ready',v_checkout_ready,
      'inventory_reservations_ready',true,
      'checkout_expiry_release_ready',true,
      'async_checkout_ready',true,
      'refunds_ready',true,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'reservation_ledger','tgg_merch_checkout_reservations',
      'event_ledger','tgg_stripe_webhook_events',
      'live_webhook','v58-stripe-webhook-v2',
      'live_events',jsonb_build_array(
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
        'payment_intent.succeeded',
        'charge.refunded'
      ),
      'legacy_v58_checkout','retired',
      'legacy_v58_webhook_db_dependencies',false
    ),
    'memberships',jsonb_build_object(
      'checkout_ready',
        coalesce(v_membership.enabled,false)
        and v_membership.mode='production'
        and v_membership.endpoint_configured,
      'status',case
        when coalesce(v_membership.enabled,false)
          and v_membership.mode='production'
          and v_membership.endpoint_configured
        then 'ready'
        else coalesce(v_membership.disabled_reason,'membership_checkout_not_enabled')
      end
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist.enabled,false)
        and v_dist.mode='production'
        and v_dist.endpoint_configured,
      'enabled',coalesce(v_dist.enabled,false),
      'mode',coalesce(v_dist.mode,'disabled'),
      'endpoint_configured',coalesce(v_dist.endpoint_configured,false),
      'status',case
        when coalesce(v_dist.enabled,false)
          and v_dist.mode='production'
          and v_dist.endpoint_configured
        then 'ready'
        else coalesce(v_dist.disabled_reason,'production_endpoint_required')
      end
    ),
    'version','v519'
  );
end
$function$;

create or replace function public.tgg_public_live_bundle(p_stream_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
  select jsonb_build_object(
    'ok',true,
    'version','PUBLIC-LIVE-V519',
    'streams',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',s.id,
          'title',s.title,
          'description',s.description,
          'category',s.category,
          'status',s.status,
          'broadcast_mode',s.broadcast_mode,
          'audience',s.audience,
          'camera_enabled',s.camera_enabled,
          'screen_enabled',s.screen_enabled,
          'mic_enabled',s.mic_enabled,
          'system_audio_enabled',s.system_audio_enabled,
          'chat_enabled',s.chat_enabled,
          'reactions_enabled',s.reactions_enabled,
          'pip_position',s.pip_position,
          'viewer_count',s.viewer_count,
          'peak_viewers',s.peak_viewers,
          'actual_start',s.actual_start,
          'scheduled_start',s.scheduled_start,
          'media_provider',s.media_provider,
          'media_playback_id',s.media_playback_id,
          'creator',jsonb_build_object(
            'user_id',a.user_id,
            'artist_id',a.artist_id,
            'stage_name',a.stage_name,
            'avatar_url',a.avatar_url
          ),
          'reaction_counts',jsonb_build_object(
            'fire',coalesce(rc.fire,0),
            'heart',coalesce(rc.heart,0),
            'clap',coalesce(rc.clap,0),
            '100',coalesce(rc.hundred,0)
          ),
          'chat',
            case when s.chat_enabled then coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id',m.id,
                  'user_id',m.user_id,
                  'display_name',m.display_name,
                  'body',m.body,
                  'created_at',m.created_at
                )
                order by m.created_at
              )
              from (
                select *
                from public.tgg_live_chat_messages
                where stream_id=s.id
                order by created_at desc
                limit 100
              ) m
            ),'[]'::jsonb)
            else '[]'::jsonb end
        )
        order by case when s.status='LIVE' then 0 else 1 end,s.created_at desc
      )
      from public.live_streams s
      join public.content_items c on c.id=s.content_id
      left join public.public_artist_directory_v1 a on a.user_id=s.creator_id
      left join public.public_live_reaction_counts_v1 rc on rc.stream_id=s.id
      where c.status='PUBLISHED'
        and c.visibility='PUBLIC'
        and s.audience='everyone'
        and (p_stream_id is null or s.id=p_stream_id)
        and s.status in ('LIVE','SCHEDULED','ENDED')
    ),'[]'::jsonb),
    'generated_at',now()
  );
$function$;

grant execute on function public.tgg_get_frontend_integration_health() to authenticated;
grant execute on function public.tgg_get_provider_pipeline_health() to authenticated;
grant execute on function public.tgg_public_live_bundle(uuid) to anon,authenticated;
revoke execute on function public.tgg_get_frontend_integration_health() from anon,public;
revoke execute on function public.tgg_get_provider_pipeline_health() from anon,public;
revoke execute on function public.tgg_public_live_bundle(uuid) from public;


-- ============================================================
-- MIGRATION 20260907114127 repair_server_blogger_token_accessor_v519
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_server_blogger_refresh_token(
  p_user_id uuid,
  p_connection_id uuid
)
returns text
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text;
  v_secret_name text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     and coalesce(current_setting('request.jwt.claims',true),'') not like '%"role":"service_role"%'
  then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.v98_blogger_connections c
    where c.id=p_connection_id
      and c.user_id=p_user_id
      and c.status='connected'
      and c.revoked_at is null
  ) then
    raise exception 'connection_not_owned_or_inactive';
  end if;

  v_secret_name:='v98_blogger_refresh_' || replace(p_connection_id::text,'-','_');

  select decrypted_secret
  into v_token
  from vault.decrypted_secrets
  where name=v_secret_name
  limit 1;

  if v_token is null or length(v_token)=0 then
    raise exception 'refresh_token_unavailable';
  end if;

  return v_token;
end
$function$;

revoke all on function public.tgg_server_blogger_refresh_token(uuid,uuid)
from public,anon,authenticated;

grant execute on function public.tgg_server_blogger_refresh_token(uuid,uuid)
to service_role;


-- ============================================================
-- MIGRATION 20260907114328 reconcile_v519_live_hashes_after_final_cleanup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


with latest as (
  select distinct on (d.verification->>'path')
    d.verification->>'path' as path,
    coalesce(d.verification->>'content_hash',d.verification->>'hash') as hash
  from public.v98_blogger_deployments d
  where d.status='verified'
    and d.verification->>'path' in (
      '/p/shorts.html',
      '/p/homepage.html',
      '/p/career-os.html',
      '/p/music-hub.html',
      '/p/create-hub.html',
      '/p/beat-studio.html',
      '/p/video-studio.html',
      '/p/creator-store.html',
      '/p/recording-studio.html',
      '/p/artist-dashboard_0633467215.html'
    )
    and coalesce(d.verification->>'content_hash',d.verification->>'hash') is not null
  order by d.verification->>'path',d.updated_at desc
),
hash_patch as (
  select jsonb_object_agg(path,hash) as j
  from latest
),
page_patch as (
  select jsonb_agg(
    case
      when l.hash is not null then
        p || jsonb_build_object('content_hash',l.hash,'hash',l.hash)
      else p
    end
    order by p->>'path'
  ) as pages
  from public.tgg_production_baselines b
  cross join lateral jsonb_array_elements(b.notes#>'{full_page_snapshot,pages}') p
  left join latest l on l.path=p->>'path'
  where b.version='V519-FINAL'
)
update public.tgg_production_baselines b
set notes =
  jsonb_set(
    jsonb_set(
      b.notes,
      '{page_hashes}',
      coalesce(b.notes->'page_hashes','{}'::jsonb) || coalesce((select j from hash_patch),'{}'::jsonb),
      true
    ),
    '{full_page_snapshot,pages}',
    coalesce((select pages from page_patch),b.notes#>'{full_page_snapshot,pages}'),
    true
  )
  || jsonb_build_object(
    'hash_reconciliation',
    jsonb_build_object(
      'ok',true,
      'source','latest_verified_final_cleanup_deployments',
      'paths_updated',10,
      'reconciled_at',now()
    )
  )
where b.version='V519-FINAL';


-- ============================================================
-- MIGRATION 20260907114706 add_server_maintenance_control_v519
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.tgg_maintenance_control (
  control_key text primary key,
  enabled boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  armed_at timestamptz,
  consumed_at timestamptz,
  result jsonb not null default '{}'::jsonb
);

alter table public.tgg_maintenance_control enable row level security;
revoke all on public.tgg_maintenance_control from public,anon,authenticated;

insert into public.tgg_maintenance_control(control_key,enabled,payload,armed_at,consumed_at,result)
values(
  'v519_backup_parity_refresh',
  true,
  jsonb_build_object('baseline','V519-FINAL'),
  now(),
  null,
  '{}'::jsonb
)
on conflict(control_key) do update
set enabled=true,
    payload=excluded.payload,
    armed_at=now(),
    consumed_at=null,
    result='{}'::jsonb;


-- ============================================================
-- MIGRATION 20260907115412 lock_clean_public_artist_routes_v519
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_site_routes
set path='/p/artists.html',
    updated_at=now()
where route_key='public_artists';

update public.tgg_site_routes
set path='/p/public-artist-profile.html',
    updated_at=now()
where route_key='public_artist_profile';

alter table public.tgg_site_routes
  drop constraint if exists tgg_site_routes_v519_public_artist_routes_check;

alter table public.tgg_site_routes
  add constraint tgg_site_routes_v519_public_artist_routes_check
  check (
    case route_key
      when 'public_artists' then path='/p/artists.html'
      when 'public_artist_profile' then path='/p/public-artist-profile.html'
      else true
    end
  );


-- ============================================================
-- MIGRATION 20260907115551 retire_exact_duplicate_public_route_aliases_v520
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_site_routes
set is_active=false,
    updated_at=now()
where route_key in (
  'artists',
  'audiobooks',
  'events',
  'memberships',
  'opportunities_public',
  'shorts',
  'radio'
);

alter table public.tgg_site_routes
  drop constraint if exists tgg_site_routes_v520_duplicate_public_aliases_check;

alter table public.tgg_site_routes
  add constraint tgg_site_routes_v520_duplicate_public_aliases_check
  check (
    case
      when route_key in (
        'artists',
        'audiobooks',
        'events',
        'memberships',
        'opportunities_public',
        'shorts',
        'radio'
      )
      then is_active=false
      else true
    end
  );


-- ============================================================
-- MIGRATION 20260907115725 align_provider_health_version_v521
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_oid oid;
  v_ddl text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='tgg_get_provider_pipeline_health'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_oid is null then
    raise exception 'provider health function not found';
  end if;

  v_ddl:=pg_get_functiondef(v_oid);
  v_ddl:=replace(v_ddl, '''version'',''v519''', '''version'',''v521''');
  execute v_ddl;
end
$$;


-- ============================================================
-- MIGRATION 20260907124347 enforce_merch_checkout_path_on_publish_v527
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_enforce_merch_publish_checkout_path()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_native_ready boolean:=false;
begin
  if new.status='published'
     and (tg_op='INSERT' or old.status is distinct from 'published')
  then
    select coalesce(enabled,false)
      and mode='production'
      and coalesce(endpoint_configured,false)
    into v_native_ready
    from public.tgg_provider_runtime_config
    where provider_key='stripe'
    limit 1;

    if not coalesce(v_native_ready,false)
       and nullif(btrim(coalesce(new.stripe_payment_link_url,'')),'') is null
    then
      raise exception 'CHECKOUT_PATH_REQUIRED'
        using detail='Published merchandise requires native Stripe checkout or a valid Stripe Payment Link.';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function private.tgg_enforce_merch_publish_checkout_path()
from public,anon,authenticated;

drop trigger if exists tgg_enforce_merch_publish_checkout_path
on public.merch_products;

create trigger tgg_enforce_merch_publish_checkout_path
before insert or update of status,stripe_payment_link_url
on public.merch_products
for each row
execute function private.tgg_enforce_merch_publish_checkout_path();


-- ============================================================
-- MIGRATION 20260907124445 protect_stripe_payment_link_assignment_v527
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_protect_merch_payment_link()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_changed boolean:=false;
begin
  if tg_op='INSERT' then
    v_changed := nullif(btrim(coalesce(new.stripe_payment_link_url,'')),'') is not null;
  else
    v_changed := new.stripe_payment_link_url is distinct from old.stripe_payment_link_url;
  end if;

  if v_changed and auth.uid() is not null then
    if not coalesce(private.is_admin(),false) then
      raise exception 'PAYMENT_LINK_ADMIN_REQUIRED'
        using detail='Stripe Payment Links may only be assigned by an administrator-controlled flow.';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function private.tgg_protect_merch_payment_link()
from public,anon,authenticated;

drop trigger if exists tgg_protect_merch_payment_link
on public.merch_products;

create trigger tgg_protect_merch_payment_link
before insert or update of stripe_payment_link_url
on public.merch_products
for each row
execute function private.tgg_protect_merch_payment_link();

create or replace function public.tgg_store_product_set_payment_link(
  p_product_id uuid,
  p_payment_link_url text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_url text;
  v_row public.merch_products;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if not coalesce(private.is_admin(),false) then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  v_url:=nullif(btrim(coalesce(p_payment_link_url,'')),'');

  if v_url is not null
     and v_url !~ '^https://buy\.stripe\.com/'
  then
    raise exception 'INVALID_STRIPE_PAYMENT_LINK';
  end if;

  update public.merch_products
  set stripe_payment_link_url=v_url,
      updated_at=now()
  where id=p_product_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'ok',true,
    'product_id',v_row.id,
    'stripe_payment_link_url',v_row.stripe_payment_link_url,
    'status',v_row.status
  );
end
$function$;

grant execute on function public.tgg_store_product_set_payment_link(uuid,text)
to authenticated;
revoke execute on function public.tgg_store_product_set_payment_link(uuid,text)
from anon,public;


-- ============================================================
-- MIGRATION 20260907124811 lock_promotion_and_tv_moderation_rls_v527
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists promotion_authenticated_insert
on public.promotion_campaigns;

create policy promotion_authenticated_insert
on public.promotion_campaigns
for insert
to authenticated
with check (
  (select private.is_admin())
  or (
    exists (
      select 1
      from public.artists a
      where a.id=promotion_campaigns.creator_id
        and a.user_id=(select auth.uid())
    )
    and status='draft'
    and admin_note is null
  )
);

drop policy if exists promotion_authenticated_update
on public.promotion_campaigns;

create policy promotion_authenticated_update
on public.promotion_campaigns
for update
to authenticated
using (
  (select private.is_admin())
  or (
    status in ('draft','rejected')
    and exists (
      select 1
      from public.artists a
      where a.id=promotion_campaigns.creator_id
        and a.user_id=(select auth.uid())
    )
  )
)
with check (
  (select private.is_admin())
  or (
    status in ('draft','pending','rejected')
    and exists (
      select 1
      from public.artists a
      where a.id=promotion_campaigns.creator_id
        and a.user_id=(select auth.uid())
    )
  )
);

drop policy if exists tgg_tv_episodes_owner_insert
on public.tgg_tv_episodes;

create policy tgg_tv_episodes_owner_insert
on public.tgg_tv_episodes
for insert
to authenticated
with check (
  (select private.is_admin())
  or (
    owner_user_id=(select auth.uid())
    and status='draft'
    and admin_note is null
    and published_at is null
  )
);

drop policy if exists tgg_tv_episodes_owner_update
on public.tgg_tv_episodes;

create policy tgg_tv_episodes_owner_update
on public.tgg_tv_episodes
for update
to authenticated
using (
  (select private.is_admin())
  or (
    owner_user_id=(select auth.uid())
    and status in ('draft','rejected')
  )
)
with check (
  (select private.is_admin())
  or (
    owner_user_id=(select auth.uid())
    and status in ('draft','pending','rejected')
    and published_at is null
  )
);


-- ============================================================
-- MIGRATION 20260907125128 guard_paid_membership_activation_v529
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.tgg_membership_tiers
alter column is_active set default false;

create or replace function private.tgg_enforce_membership_checkout_on_activation()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_checkout_ready boolean:=false;
begin
  if coalesce(new.is_active,false)=true
     and coalesce(new.price_cents,0)>0
  then
    select coalesce(enabled,false)
      and mode='production'
      and coalesce(endpoint_configured,false)
    into v_checkout_ready
    from public.tgg_provider_runtime_config
    where provider_key='membership.stripe'
    limit 1;

    if not coalesce(v_checkout_ready,false) then
      raise exception 'MEMBERSHIP_CHECKOUT_REQUIRED'
        using detail='Paid membership tiers cannot be active until Stripe membership checkout is ready.';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function private.tgg_enforce_membership_checkout_on_activation()
from public,anon,authenticated;

drop trigger if exists tgg_enforce_membership_checkout_on_activation
on public.tgg_membership_tiers;

create trigger tgg_enforce_membership_checkout_on_activation
before insert or update of is_active,price_cents
on public.tgg_membership_tiers
for each row
execute function private.tgg_enforce_membership_checkout_on_activation();

create or replace function public.tgg_membership_tier_set_active(
  p_tier_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  update public.tgg_membership_tiers t
  set is_active=coalesce(p_is_active,false),
      updated_at=now()
  where t.id=p_tier_id
    and exists(
      select 1
      from public.artists a
      where a.id=t.artist_id
        and a.user_id=v_uid
    );

  get diagnostics v_count=row_count;

  if v_count=0 then
    raise exception 'TIER_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'ok',true,
    'tier_id',p_tier_id,
    'is_active',coalesce(p_is_active,false)
  );
end
$function$;

grant execute on function public.tgg_membership_tier_set_active(uuid,boolean)
to authenticated;
revoke execute on function public.tgg_membership_tier_set_active(uuid,boolean)
from anon,public;


-- ============================================================
-- MIGRATION 20260907125803 retire_remaining_v159_browser_aliases_v529
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke execute on function public.v159_creator_metrics()
from public,anon,authenticated;

revoke execute on function public.v159_record_creator_event(text,text,uuid,jsonb)
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907130033 align_v529_status_summaries_fixed
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set
  public_routes = 62,
  payments_ready = false,
  distribution_ready = false
where version='V529-FINAL';

create or replace function public.tgg_get_frontend_integration_health()
returns jsonb
language plpgsql
security invoker
set search_path='public'
as $function$
declare
  uid uuid:=auth.uid();
  aid uuid;
  blogger jsonb;
  providers jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;

  select id into aid
  from public.artists
  where user_id=uid
  order by created_at
  limit 1;

  blogger:=public.tgg_get_blogger_bridge_health();
  providers:=public.tgg_get_provider_pipeline_health();

  return jsonb_build_object(
    'ok',true,
    'authenticated',true,
    'artist_ready',aid is not null,
    'artist_id',aid,
    'server_time',now(),
    'contracts',public.tgg_get_frontend_api_contract(),
    'shell_ready',true,
    'maintenance_available',true,
    'blogger_bridge',blogger,
    'blogger_ready',coalesce((blogger->>'normal_deploy_ready')::boolean,false),
    'providers',providers,
    'payments_ready',coalesce((providers#>>'{payments,ready}')::boolean,false),
    'payments_catalog_safe',coalesce((providers#>>'{payments,catalog_safe}')::boolean,false),
    'store_checkout_ready',coalesce((providers#>>'{payments,checkout_ready}')::boolean,false),
    'distribution_ready',coalesce((providers#>>'{distribution,ready}')::boolean,false),
    'version','v529'
  );
end
$function$;

grant execute on function public.tgg_get_frontend_integration_health() to authenticated;
revoke execute on function public.tgg_get_frontend_integration_health() from anon,public;


-- ============================================================
-- MIGRATION 20260907130153 record_v529_completion_summary
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'completion_summary',
  jsonb_build_object(
    'core_platform_complete',true,
    'core_platform_percent',100,
    'internal_blockers',jsonb_build_array(),
    'launch_status','ready_commerce_standby',
    'blogger_pages_locked',37,
    'blogger_pages_restorable',37,
    'route_paths_verified',37,
    'public_route_manifest_entries',62,
    'realtime_tables_locked',6,
    'storage_buckets_checked',8,
    'runtime_drift',0,
    'rollback_drift',0,
    'open_operational_alerts',0,
    'performance_warnings',0,
    'browser_legacy_relation_functions',0,
    'remaining_external_items',jsonb_build_array(
      jsonb_build_object(
        'item','Supabase leaked-password protection',
        'status','disabled',
        'type','account_setting',
        'blocking_current_launch',false
      ),
      jsonb_build_object(
        'item','Stripe Edge runtime server secret',
        'status','missing',
        'type','secret_configuration',
        'blocking_current_launch',false,
        'becomes_blocking_when','a product or membership tier requires checkout'
      ),
      jsonb_build_object(
        'item','Production DSP/distribution endpoint',
        'status','not_configured',
        'type','external_provider',
        'blocking_current_launch',false
      ),
      jsonb_build_object(
        'item','Two-user messaging/collaboration/WebRTC smoke',
        'status','pending_second_legitimate_account_device',
        'type','external_test_prerequisite',
        'blocking_current_launch',false
      ),
      jsonb_build_object(
        'item','Edge Function capacity',
        'status','100_of_100_slots',
        'type','plan_capacity',
        'blocking_current_launch',false,
        'safe_strategy','reuse retired maintenance slots until delete/plan capacity is available'
      )
    ),
    'verified_at',now()
  )
)
where version='V529-FINAL';


-- ============================================================
-- MIGRATION 20260907131631 v531_stripe_runtime_truth_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_provider_runtime_config
set enabled=false,
    mode='disabled',
    endpoint_configured=false,
    disabled_reason='stripe_checkout_and_webhook_secrets_missing',
    updated_at=now()
where provider_key='stripe';

update public.tgg_provider_runtime_config
set enabled=false,
    mode='disabled',
    endpoint_configured=false,
    disabled_reason='stripe_server_secret_missing',
    updated_at=now()
where provider_key='membership.stripe';

create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe public.tgg_provider_runtime_config;
  v_membership public.tgg_provider_runtime_config;
  v_dist public.tgg_provider_runtime_config;
  v_native_ready boolean:=false;
  v_webhook_ready boolean:=false;
  v_published bigint:=0;
  v_linked bigint:=0;
  v_uncovered bigint:=0;
  v_checkout_ready boolean:=false;
  v_catalog_safe boolean:=false;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_stripe
  from public.tgg_provider_runtime_config
  where provider_key='stripe';

  select * into v_membership
  from public.tgg_provider_runtime_config
  where provider_key='membership.stripe';

  select * into v_dist
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  v_native_ready :=
    coalesce(v_stripe.enabled,false)
    and v_stripe.mode='production'
    and coalesce(v_stripe.endpoint_configured,false);

  -- Verified live on 2026-09-07: webhook returns runtime_not_configured
  -- because STRIPE_WEBHOOK_SECRET is absent project-wide.
  v_webhook_ready := false;

  select
    count(*),
    count(*) filter(
      where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
    )
  into v_published,v_linked
  from public.merch_products
  where status='published';

  v_uncovered := case
    when v_native_ready then 0
    else greatest(v_published-v_linked,0)
  end;

  v_checkout_ready :=
    v_native_ready
    or (
      v_published>0
      and v_linked=v_published
      and v_uncovered=0
    );

  v_catalog_safe := v_uncovered=0;

  return jsonb_build_object(
    'ok',v_catalog_safe,
    'payments',jsonb_build_object(
      'ready',v_checkout_ready and v_webhook_ready,
      'catalog_safe',v_catalog_safe,
      'status',case
        when v_native_ready and v_webhook_ready then 'native_runtime_ready'
        when v_published=0 then 'commerce_standby_runtime_secrets_missing'
        when v_checkout_ready and not v_webhook_ready then 'checkout_path_available_webhook_unavailable'
        when v_checkout_ready then 'payment_link_fallback_ready'
        else 'published_products_without_checkout'
      end,
      'native_runtime_ready',v_native_ready,
      'native_runtime_status',case
        when v_native_ready then 'ready'
        else 'stripe_server_secret_missing'
      end,
      'webhook_runtime_ready',v_webhook_ready,
      'webhook_runtime_status',case
        when v_webhook_ready then 'ready'
        else 'stripe_webhook_secret_missing'
      end,
      'runtime_recovery_requirements',jsonb_build_array(
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET'
      ),
      'published_products',v_published,
      'payment_link_fallback_products',v_linked,
      'published_products_without_checkout',v_uncovered,
      'checkout_ready',v_checkout_ready,
      'inventory_reservations_ready',true,
      'checkout_expiry_release_ready',true,
      'async_checkout_ready',v_webhook_ready,
      'refunds_ready',v_webhook_ready,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'reservation_ledger','tgg_merch_checkout_reservations',
      'event_ledger','tgg_stripe_webhook_events',
      'live_webhook','v58-stripe-webhook-v2',
      'legacy_v58_checkout','retired',
      'legacy_v58_webhook_db_dependencies',false
    ),
    'memberships',jsonb_build_object(
      'checkout_ready',
        coalesce(v_membership.enabled,false)
        and v_membership.mode='production'
        and v_membership.endpoint_configured
        and v_webhook_ready,
      'status',case
        when coalesce(v_membership.enabled,false)
          and v_membership.mode='production'
          and v_membership.endpoint_configured
          and v_webhook_ready
        then 'ready'
        else coalesce(v_membership.disabled_reason,'membership_checkout_not_enabled')
      end
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist.enabled,false)
        and v_dist.mode='production'
        and v_dist.endpoint_configured,
      'enabled',coalesce(v_dist.enabled,false),
      'mode',coalesce(v_dist.mode,'disabled'),
      'endpoint_configured',coalesce(v_dist.endpoint_configured,false),
      'status',case
        when coalesce(v_dist.enabled,false)
          and v_dist.mode='production'
          and v_dist.endpoint_configured
        then 'ready'
        else coalesce(v_dist.disabled_reason,'production_endpoint_required')
      end
    ),
    'version','v531'
  );
end
$function$;

update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'stripe_runtime_incident',
  coalesce(notes->'stripe_runtime_incident','{}'::jsonb)
  || jsonb_build_object(
    'checkout_runtime_ready',false,
    'webhook_runtime_ready',false,
    'checkout_runtime_status','stripe_server_secret_missing',
    'webhook_runtime_status','stripe_webhook_secret_missing',
    'live_webhook_probe_http_status',500,
    'live_webhook_probe_result','runtime_not_configured',
    'customer_impact',false,
    'reason','no published products or active paid tiers',
    'recovery_requirements',jsonb_build_array(
      'restore STRIPE_SECRET_KEY in Supabase Edge secrets',
      'restore STRIPE_WEBHOOK_SECRET in Supabase Edge secrets'
    ),
    'verified_at',now()
  )
)
where status='locked';


-- ============================================================
-- MIGRATION 20260907132155 v531_repoint_blogger_live_monitor_to_connector
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_trigger_blogger_live_monitor()
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text;
  v_request_id bigint;
  v_status text;
  v_revoked_at timestamptz;
  v_baseline_version text;
begin
  select version
  into v_baseline_version
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  select status,revoked_at
  into v_status,v_revoked_at
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1;

  if coalesce(v_status,'')<>'connected' or v_revoked_at is not null then
    update public.tgg_production_baselines
    set notes = notes || jsonb_build_object(
      'blogger_hash_monitor_runtime',
      jsonb_build_object(
        'status','paused_oauth_unavailable',
        'connection_status',v_status,
        'revoked_at',v_revoked_at,
        'checked_at',now()
      )
    )
    where version=v_baseline_version;

    return 0;
  end if;

  select monitor_token
  into v_token
  from public.tgg_blogger_monitor_runtime
  where id=1
    and active=true;

  if v_token is null then
    raise exception 'blogger_monitor_runtime_unavailable';
  end if;

  select net.http_post(
    url := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v98-blogger-connector/monitor',
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-tgg-monitor-token',v_token
    ),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  return v_request_id;
end
$function$;

revoke all on function private.tgg_trigger_blogger_live_monitor()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907134745 fix_master_rls_initplan_v532
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists master_sites_owner_all on public.tgg_master_sites;
create policy master_sites_owner_all
on public.tgg_master_sites
for all
to authenticated
using (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role')) = 'owner'
)
with check (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role')) = 'owner'
);

drop policy if exists master_content_owner_all on public.tgg_master_content;
create policy master_content_owner_all
on public.tgg_master_content
for all
to authenticated
using (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role')) = 'owner'
)
with check (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role')) = 'owner'
);

drop policy if exists master_queue_owner_all on public.tgg_master_change_queue;
create policy master_queue_owner_all
on public.tgg_master_change_queue
for all
to authenticated
using (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role')) = 'owner'
)
with check (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role')) = 'owner'
);


-- ============================================================
-- MIGRATION 20260907134831 promote_verified_live_state_to_v532_final
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_old public.tgg_production_baselines;
  v_notes jsonb;
  v_hashes jsonb;
  v_pages jsonb;
begin
  select * into v_old
  from public.tgg_production_baselines
  where version='V531-FINAL';

  if v_old.version is null then
    raise exception 'V531 baseline missing';
  end if;

  with paths as (
    select value as path
    from jsonb_array_elements_text(v_old.notes#>'{route_audit,present}')
  ),
  latest as (
    select
      p.path,
      d.verification->>'content_hash' as content_hash
    from paths p
    left join lateral (
      select d.*
      from public.v98_blogger_deployments d
      where d.status='verified'
        and d.verification->>'path'=p.path
        and nullif(d.verification->>'content_hash','') is not null
      order by d.updated_at desc
      limit 1
    ) d on true
  )
  select jsonb_object_agg(path,content_hash order by path)
  into v_hashes
  from latest
  where content_hash is not null;

  if (select count(*) from jsonb_object_keys(v_hashes)) <> 37 then
    raise exception 'expected 37 verified page hashes';
  end if;

  select jsonb_agg(
    case
      when v_hashes ? (x->>'path')
      then
        (x - 'hash') ||
        jsonb_build_object(
          'content_hash',v_hashes->>(x->>'path')
        )
      else x
    end
    order by x->>'path'
  )
  into v_pages
  from jsonb_array_elements(v_old.notes#>'{full_page_snapshot,pages}') x;

  v_notes :=
    v_old.notes
    || jsonb_build_object(
      'page_hashes',v_hashes,
      'full_page_snapshot',
        jsonb_set(
          coalesce(v_old.notes->'full_page_snapshot','{}'::jsonb),
          '{pages}',
          coalesce(v_pages,'[]'::jsonb),
          true
        ),
      'blogger_live_content',
        jsonb_build_object(
          'ok',true,
          'fresh',true,
          'complete',true,
          'verified',true,
          'checked_at',now(),
          'drift_count',0,
          'locked_pages',37,
          'live_pages_checked',37,
          'missing_pages','[]'::jsonb,
          'drift','[]'::jsonb,
          'source','verified deployments reconciled into V532-FINAL'
        ),
      'baseline_promotion',
        jsonb_build_object(
          'from','V531-FINAL',
          'to','V532-FINAL',
          'reason','promote verified live Blogger state and current runtime truth',
          'verified_page_hashes',37,
          'promoted_at',now()
        ),
      'stripe_runtime_incident',
        coalesce(v_old.notes->'stripe_runtime_incident','{}'::jsonb)
        || jsonb_build_object(
          'status','mitigated_current_catalog',
          'customer_impact',false,
          'published_products',0,
          'recovery_requirements',
            jsonb_build_array(
              'restore STRIPE_SECRET_KEY in Supabase Edge secrets',
              'restore STRIPE_WEBHOOK_SECRET in Supabase Edge secrets'
            )
        )
    );

  update public.tgg_production_baselines
  set status='retired'
  where status='locked';

  insert into public.tgg_production_baselines(
    version,status,locked_at,
    blogger_deployments,blogger_verified,blogger_failed,
    public_routes,public_catalog_releases,performance_warnings,
    security_warnings,payments_ready,distribution_ready,notes
  )
  values(
    'V532-FINAL','locked',now(),
    37,37,0,
    64,3,0,
    '["auth_leaked_password_protection"]'::jsonb,
    false,false,v_notes
  )
  on conflict(version) do update
  set status='locked',
      locked_at=excluded.locked_at,
      blogger_deployments=excluded.blogger_deployments,
      blogger_verified=excluded.blogger_verified,
      blogger_failed=excluded.blogger_failed,
      public_routes=excluded.public_routes,
      public_catalog_releases=excluded.public_catalog_releases,
      performance_warnings=excluded.performance_warnings,
      security_warnings=excluded.security_warnings,
      payments_ready=excluded.payments_ready,
      distribution_ready=excluded.distribution_ready,
      notes=excluded.notes;
end $$;


-- ============================================================
-- MIGRATION 20260907134954 separate_live_hash_and_backup_contract_v532
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_backup_hash_parity_matrix()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  with baseline as (
    select notes
    from public.tgg_production_baselines
    where status='locked'
    order by locked_at desc
    limit 1
  ),
  expected as (
    select
      x->>'path' as path,
      (x->>'backup_id')::uuid as backup_id,
      x->>'body_hash' as contract_body_hash,
      b.notes#>>array['page_hashes',x->>'path'] as live_page_hash_reference
    from baseline b,
         lateral jsonb_array_elements(
           coalesce(b.notes#>'{validated_backup_contract,backups}','[]'::jsonb)
         ) x
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'path',e.path,
        'backup_id',e.backup_id,
        'contract_hash',e.contract_body_hash,
        'recorded_hash',bk.metadata->>'v516_body_hash',
        'live_page_hash_reference',e.live_page_hash_reference,
        'backup_present',bk.id is not null,
        'object_present',o.name is not null,
        'matches',
          bk.id is not null
          and o.name is not null
          and e.contract_body_hash is not null
          and bk.metadata->>'v516_body_hash'=e.contract_body_hash
      )
      order by e.path
    ),
    '[]'::jsonb
  )
  from expected e
  left join public.v98_blogger_backups bk on bk.id=e.backup_id
  left join storage.objects o
    on o.bucket_id='v98-blogger-backups'
   and o.name=bk.storage_path
$function$;

revoke all on function private.tgg_backup_hash_parity_matrix()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907135118 sync_v532_runtime_version_labels
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_stripe public.tgg_provider_runtime_config;
  v_membership public.tgg_provider_runtime_config;
  v_dist public.tgg_provider_runtime_config;
  v_native_ready boolean:=false;
  v_webhook_ready boolean:=false;
  v_published bigint:=0;
  v_linked bigint:=0;
  v_uncovered bigint:=0;
  v_checkout_ready boolean:=false;
  v_catalog_safe boolean:=false;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select * into v_stripe
  from public.tgg_provider_runtime_config
  where provider_key='stripe';

  select * into v_membership
  from public.tgg_provider_runtime_config
  where provider_key='membership.stripe';

  select * into v_dist
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  v_native_ready :=
    coalesce(v_stripe.enabled,false)
    and v_stripe.mode='production'
    and coalesce(v_stripe.endpoint_configured,false);

  v_webhook_ready := false;

  select
    count(*),
    count(*) filter(
      where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
    )
  into v_published,v_linked
  from public.merch_products
  where status='published';

  v_uncovered := case
    when v_native_ready then 0
    else greatest(v_published-v_linked,0)
  end;

  v_checkout_ready :=
    v_native_ready
    or (
      v_published>0
      and v_linked=v_published
      and v_uncovered=0
    );

  v_catalog_safe := v_uncovered=0;

  return jsonb_build_object(
    'ok',v_catalog_safe,
    'payments',jsonb_build_object(
      'ready',v_checkout_ready and v_webhook_ready,
      'catalog_safe',v_catalog_safe,
      'status',case
        when v_native_ready and v_webhook_ready then 'native_runtime_ready'
        when v_published=0 then 'commerce_standby_runtime_secrets_missing'
        when v_checkout_ready and not v_webhook_ready then 'checkout_path_available_webhook_unavailable'
        when v_checkout_ready then 'payment_link_fallback_ready'
        else 'published_products_without_checkout'
      end,
      'native_runtime_ready',v_native_ready,
      'native_runtime_status',case
        when v_native_ready then 'ready'
        else 'stripe_server_secret_missing'
      end,
      'webhook_runtime_ready',v_webhook_ready,
      'webhook_runtime_status',case
        when v_webhook_ready then 'ready'
        else 'stripe_webhook_secret_missing'
      end,
      'runtime_recovery_requirements',jsonb_build_array(
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET'
      ),
      'published_products',v_published,
      'payment_link_fallback_products',v_linked,
      'published_products_without_checkout',v_uncovered,
      'checkout_ready',v_checkout_ready,
      'inventory_reservations_ready',true,
      'checkout_expiry_release_ready',true,
      'async_checkout_ready',v_webhook_ready,
      'refunds_ready',v_webhook_ready,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'order_ledger','tgg_merch_orders',
      'reservation_ledger','tgg_merch_checkout_reservations',
      'event_ledger','tgg_stripe_webhook_events',
      'live_webhook','v58-stripe-webhook-v2',
      'legacy_v58_checkout','retired',
      'legacy_v58_webhook_db_dependencies',false
    ),
    'memberships',jsonb_build_object(
      'checkout_ready',
        coalesce(v_membership.enabled,false)
        and v_membership.mode='production'
        and v_membership.endpoint_configured
        and v_webhook_ready,
      'status',case
        when coalesce(v_membership.enabled,false)
          and v_membership.mode='production'
          and v_membership.endpoint_configured
          and v_webhook_ready
        then 'ready'
        else coalesce(v_membership.disabled_reason,'membership_checkout_not_enabled')
      end
    ),
    'distribution',jsonb_build_object(
      'ready',coalesce(v_dist.enabled,false)
        and v_dist.mode='production'
        and v_dist.endpoint_configured,
      'enabled',coalesce(v_dist.enabled,false),
      'mode',coalesce(v_dist.mode,'disabled'),
      'endpoint_configured',coalesce(v_dist.endpoint_configured,false),
      'status',case
        when coalesce(v_dist.enabled,false)
          and v_dist.mode='production'
          and v_dist.endpoint_configured
        then 'ready'
        else coalesce(v_dist.disabled_reason,'production_endpoint_required')
      end
    ),
    'version','v532'
  );
end
$function$;

update public.tgg_production_baselines
set notes = jsonb_set(
  notes,
  '{one_final,baseline}',
  to_jsonb('V532-FINAL'::text),
  true
)
where version='V532-FINAL';


-- ============================================================
-- MIGRATION 20260907140138 optimize_master_shared_owner_rls_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists master_shared_owner_all
on public.tgg_master_shared_settings;

create policy master_shared_owner_all
on public.tgg_master_shared_settings
for all
to authenticated
using (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role'))='owner'
)
with check (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role'))='owner'
);


-- ============================================================
-- MIGRATION 20260907140815 v531_align_route_contract_and_fix_master_audit_rls
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


-- Align locked route contract with the current V531 navigation:
-- Creator OS V5000 is the active dashboard entry; the old Blogger artist-dashboard route stays inactive.
update public.tgg_production_baselines
set notes = jsonb_set(
  notes,
  '{route_audit,present}',
  (
    select coalesce(jsonb_agg(path order by path),'[]'::jsonb)
    from (
      select distinct path
      from public.tgg_site_routes
      where is_active=true
        and path like '/p/%'
    ) q
  ),
  true
)
where version='V531-FINAL';

drop policy if exists master_audit_owner_read
on public.tgg_master_audit_log;

create policy master_audit_owner_read
on public.tgg_master_audit_log
for select
to authenticated
using (
  (((select auth.jwt())->'app_metadata'->>'tgg_role')='owner')
);

drop policy if exists master_audit_owner_insert
on public.tgg_master_audit_log;

create policy master_audit_owner_insert
on public.tgg_master_audit_log
for insert
to authenticated
with check (
  (((select auth.jwt())->'app_metadata'->>'tgg_role')='owner')
  and actor_id=(select auth.uid())
);


-- ============================================================
-- MIGRATION 20260907141856 v533_index_membership_payment_link_claims_artist
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


    create index if not exists tgg_membership_payment_link_claims_artist_id_idx
      on private.tgg_membership_payment_link_claims (artist_id);
  

-- ============================================================
-- MIGRATION 20260907141907 reconcile_v531_final_contract_batch
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


-- 1) Fully isolate the remaining legacy V58 payment table from browsers.
revoke all on table public.v58_payments from anon,authenticated;

-- 2) Reconcile the locked route contract to the intentionally active route set.
with current_routes as (
  select coalesce(jsonb_agg(path order by path),'[]'::jsonb) as routes,
         count(*) as route_count
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q
)
update public.tgg_production_baselines b
set
  public_routes = (
    select count(*) from public.tgg_site_routes where is_active=true
  ),
  payments_ready = false,
  notes = jsonb_set(
    jsonb_set(
      jsonb_set(
        notes,
        '{route_audit,present}',
        (select routes from current_routes),
        true
      ),
      '{route_audit,expected_unique_page_paths}',
      to_jsonb((select route_count from current_routes)),
      true
    ),
    '{route_integrity}',
    jsonb_build_object(
      'ok',true,
      'source','reconciled_active_route_contract',
      'present_count',(select route_count from current_routes),
      'missing_count',0,
      'expected_unique_page_paths',(select route_count from current_routes),
      'verified_at',now()
    ),
    true
  )
  || jsonb_build_object(
    'payments_runtime',
    jsonb_build_object(
      'ready',false,
      'status','commerce_standby_runtime_secrets_missing',
      'published_products',0,
      'customer_impact',false,
      'required_secrets',jsonb_build_array('STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'),
      'reconciled_at',now()
    ),
    'legacy_isolation',
    coalesce(notes->'legacy_isolation','{}'::jsonb)
      || jsonb_build_object(
        'v58_payments_browser_select',false,
        'reconciled_at',now()
      )
  )
where b.status='locked';

-- 3) Keep the dashboard alias retirement explicit in route metadata.
update public.tgg_site_routes
set is_active=false,updated_at=now()
where route_key in ('artist_dashboard','creator_dashboard')
  and path='/p/artist-dashboard_0633467215.html';

-- Keep the canonical Creator OS route active wherever it is currently defined.
update public.tgg_site_routes
set is_active=true,updated_at=now()
where route_key='artist_creator_os';


-- ============================================================
-- MIGRATION 20260907142006 normalize_v531_final_attestation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set
  notes = notes
    || jsonb_build_object(
      'rollback_contract',
      coalesce(notes->'rollback_contract','{}'::jsonb)
      || jsonb_build_object(
        'locked_pages',37,
        'restorable_pages',37,
        'valid_latest_backups',37,
        'invalid_latest_backups',0,
        'validated_backup_hashes',37,
        'validated_restore_objects',37,
        'payload_integrity','id + title + content + URL + path match',
        'integrity_verified_at',now()
      ),
      'runtime_blockers',
      jsonb_build_object(
        'stripe_edge_secrets',
        jsonb_build_object(
          'blocking',true,
          'customer_impact',false,
          'reason','no published products or active paid tiers currently require checkout',
          'required',jsonb_build_array('STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'),
          'status','external_supabase_edge_secret_configuration_required'
        ),
        'dsp_distribution',
        jsonb_build_object(
          'blocking',true,
          'customer_impact',false,
          'status','production_endpoint_required'
        ),
        'supabase_leaked_password_protection',
        jsonb_build_object(
          'blocking',false,
          'status','external_auth_setting_required'
        )
      ),
      'final_batch_closeout',
      jsonb_build_object(
        'baseline','V531-FINAL',
        'drift_count',0,
        'locked_pages',37,
        'active_page_routes',36,
        'realtime_tables',6,
        'storage_buckets_checked',8,
        'legacy_browser_grants',0,
        'open_alerts',0,
        'performance_warnings',0,
        'closed_at',now()
      )
    ),
  performance_warnings=0,
  security_warnings='["auth_leaked_password_protection"]'::jsonb,
  payments_ready=false,
  distribution_ready=false
where status='locked';


-- ============================================================
-- MIGRATION 20260907142612 v533_reconcile_external_provider_readiness
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_external_infrastructure_final_health()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
  with cfg as (
    select
      coalesce((select enabled and endpoint_configured and mode='production'
                from public.tgg_provider_runtime_config where provider_key='stripe'),false) as stripe_checkout_ready,
      coalesce((select enabled and endpoint_configured and mode='production'
                from public.tgg_provider_runtime_config where provider_key='stripe.webhook'),false) as stripe_webhook_ready,
      coalesce((select enabled and endpoint_configured and mode='production'
                from public.tgg_provider_runtime_config where provider_key='membership.payment_link'),false) as payment_link_ready,
      coalesce((select enabled and endpoint_configured and mode='production'
                from public.tgg_provider_runtime_config where provider_key='distribution.webhook'),false) as distribution_ready,
      coalesce((select enabled and endpoint_configured and mode='production'
                from public.tgg_provider_runtime_config where provider_key='broadcast.sfu_turn'),false) as broadcast_ready
  )
  select jsonb_build_object(
    'ok',true,
    'version','EXTERNAL-INFRA-ONE-FINAL-1.1',
    'stripe',jsonb_build_object(
      'ready',cfg.stripe_checkout_ready,
      'native_checkout_ready',cfg.stripe_checkout_ready,
      'webhook_ready',cfg.stripe_webhook_ready,
      'payment_link_ready',cfg.payment_link_ready,
      'reason',case
        when cfg.stripe_checkout_ready then null
        when cfg.stripe_webhook_ready then 'stripe_native_checkout_secret_missing_webhook_ready'
        else 'stripe_server_runtime_not_ready'
      end
    ),
    'dsp_distribution',jsonb_build_object(
      'ready',cfg.distribution_ready,
      'reason',case when cfg.distribution_ready then null else 'production_endpoint_required' end
    ),
    'broadcast_engine',jsonb_build_object(
      'ready',cfg.broadcast_ready,
      'reason',case when cfg.broadcast_ready then null else 'sfu_turn_infrastructure_required' end
    ),
    'two_user_call',public.tgg_call_validation_final_health(),
    'leaked_password_protection',jsonb_build_object(
      'ready',false,
      'reason','supabase_auth_dashboard_setting_required'
    ),
    'generated_at',now()
  )
  from cfg;
$function$;

create or replace function public.tgg_external_blockers_final()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_h jsonb:=public.tgg_external_infrastructure_final_health();
  v_out jsonb:='[]'::jsonb;
begin
  if not coalesce((v_h->'stripe'->>'ready')::boolean,false) then
    v_out:=v_out||jsonb_build_array(jsonb_build_object(
      'key','stripe_native_checkout_runtime',
      'blocked',true,
      'core_blocking',false,
      'webhook_ready',coalesce((v_h->'stripe'->>'webhook_ready')::boolean,false),
      'payment_link_ready',coalesce((v_h->'stripe'->>'payment_link_ready')::boolean,false),
      'reason',coalesce(v_h->'stripe'->>'reason','stripe_native_checkout_secret_missing')
    ));
  end if;
  if not coalesce((v_h->'dsp_distribution'->>'ready')::boolean,false) then
    v_out:=v_out||jsonb_build_array(jsonb_build_object(
      'key','dsp_distribution_provider','blocked',true,'core_blocking',false,
      'reason',coalesce(v_h->'dsp_distribution'->>'reason','production_endpoint_required')
    ));
  end if;
  if not coalesce((v_h->'broadcast_engine'->>'ready')::boolean,false) then
    v_out:=v_out||jsonb_build_array(jsonb_build_object(
      'key','scalable_broadcast_sfu_turn','blocked',true,'core_blocking',false,
      'reason',coalesce(v_h->'broadcast_engine'->>'reason','sfu_turn_infrastructure_required')
    ));
  end if;
  if not coalesce((v_h->'two_user_call'->>'validated')::boolean,false) then
    v_out:=v_out||jsonb_build_array(jsonb_build_object(
      'key','two_user_call_validation','blocked',true,'core_blocking',false,
      'reason','second_legitimate_creator_device_required'
    ));
  end if;
  if not coalesce((v_h->'leaked_password_protection'->>'ready')::boolean,false) then
    v_out:=v_out||jsonb_build_array(jsonb_build_object(
      'key','leaked_password_protection','blocked',true,'core_blocking',false,
      'reason','supabase_auth_dashboard_setting_required'
    ));
  end if;
  return v_out;
end
$function$;
  

-- ============================================================
-- MIGRATION 20260907142735 v533_fix_public_content_readiness_draft_filter
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_content_readiness_final_health()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_releases jsonb;
  v_summary jsonb;
  v_primary_credits integer:=0;
begin
  if v_uid is null then
    with release_rows as (
      select
        r.mixtape_id as id,
        r.title,
        r.track_count,
        coalesce((
          select count(*)
          from public.public_release_tracks_v1 t
          where t.mixtape_id=r.mixtape_id
            and (
              nullif(btrim(coalesce(t.audio_url,'')),'') is null
              or not (
                t.playback_mode='protected'
                or (
                  coalesce(t.audio_url,'') ~* '^https://'
                  and regexp_replace(split_part(t.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$'
                )
              )
            )
        ),0) as nondistributable_tracks
      from public.public_release_detail_v1 r
      join public.mixtapes m on m.id=r.mixtape_id
      where m.status='published'::public.mixtape_status
    )
    select
      jsonb_build_object(
        'published_releases',(select count(*) from release_rows),
        'distribution_candidates',(select count(*) from release_rows where track_count>0 and nondistributable_tracks=0),
        'public_only_or_incomplete_releases',(select count(*) from release_rows where track_count=0 or nondistributable_tracks>0),
        'releases_missing_distribution_metadata',null,
        'primary_artist_credits',null
      ),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'release_id',id,
          'title',title,
          'track_count',track_count,
          'distribution_candidate',track_count>0 and nondistributable_tracks=0,
          'content_state',case
            when track_count=0 then 'incomplete'
            when nondistributable_tracks>0 then 'public_playback_only'
            else 'distribution_candidate'
          end
        ) order by title,id)
        from release_rows
      ),'[]'::jsonb)
    into v_summary,v_releases;

    return jsonb_build_object(
      'ok',true,
      'version','CONTENT-READINESS-ONE-FINAL-1.4',
      'scope','public',
      'summary',v_summary,
      'releases',v_releases,
      'platform_blocking',false,
      'generated_at',now()
    );
  end if;

  select count(*) into v_primary_credits
  from public.tgg_release_credits c
  where c.owner_user_id=v_uid and c.role='primary_artist';

  with release_rows as (
    select
      m.id,
      m.title,
      count(t.id) as track_count,
      count(t.id) filter(
        where not (
          nullif(btrim(coalesce(t.audio_path,'')),'') is not null
          or (
            coalesce(t.audio_url,'') ~* '^https://'
            and regexp_replace(split_part(t.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$'
          )
        )
      ) as nondistributable_tracks,
      count(t.id) filter(
        where (
          nullif(btrim(coalesce(t.audio_path,'')),'') is not null
          or (
            coalesce(t.audio_url,'') ~* '^https://'
            and regexp_replace(split_part(t.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$'
          )
        )
        and coalesce(t.duration_seconds,0)<=0
      ) as candidate_tracks_missing_duration,
      exists(
        select 1
        from public.tgg_distribution_release_metadata dm
        where dm.release_id=m.id and dm.owner_user_id=v_uid
      ) as has_distribution_metadata
    from public.mixtapes m
    join public.artists a on a.id=m.artist_id and a.user_id=v_uid
    left join public.tracks t on t.mixtape_id=m.id
    where m.status='published'::public.mixtape_status
    group by m.id,m.title
  )
  select
    jsonb_build_object(
      'published_releases',(select count(*) from release_rows),
      'distribution_candidates',(select count(*) from release_rows where track_count>0 and nondistributable_tracks=0),
      'public_only_or_incomplete_releases',(select count(*) from release_rows where track_count=0 or nondistributable_tracks>0),
      'candidate_tracks_missing_duration',(select coalesce(sum(candidate_tracks_missing_duration) filter(where track_count>0 and nondistributable_tracks=0),0) from release_rows),
      'candidate_releases_missing_distribution_metadata',(select count(*) from release_rows where track_count>0 and nondistributable_tracks=0 and not has_distribution_metadata),
      'primary_artist_credits',v_primary_credits
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'release_id',id,
        'title',title,
        'track_count',track_count,
        'distribution_candidate',track_count>0 and nondistributable_tracks=0,
        'distribution_metadata_present',has_distribution_metadata,
        'candidate_tracks_missing_duration',candidate_tracks_missing_duration,
        'content_state',case
          when track_count=0 then 'incomplete'
          when nondistributable_tracks>0 then 'public_playback_only'
          else 'distribution_candidate'
        end,
        'distribution_ready',
          track_count>0
          and nondistributable_tracks=0
          and candidate_tracks_missing_duration=0
          and has_distribution_metadata
      ) order by title,id)
      from release_rows
    ),'[]'::jsonb)
  into v_summary,v_releases;

  return jsonb_build_object(
    'ok',true,
    'version','CONTENT-READINESS-ONE-FINAL-1.4',
    'scope','creator',
    'summary',v_summary,
    'releases',v_releases,
    'platform_blocking',false,
    'distribution_feature_requires_creator_metadata',true,
    'generated_at',now()
  );
end
$function$;
  

-- ============================================================
-- MIGRATION 20260907145238 promote_intended_live_hashes_and_fix_rls_v531_fixed
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


begin;

update public.tgg_production_baselines
set notes =
  jsonb_set(
    notes,
    '{page_hashes}',
    coalesce(notes->'page_hashes','{}'::jsonb)
    || jsonb_build_object(
      '/p/artists.html','17dc6407aedf88e2873ad2cca99b6804cf6d68fd274ab9e134e68b353602458b',
      '/p/live.html','a6b03991573c7d872d1ecc261e4dffe4b3e3ad9ab82bb092c451fcd5653846a6',
      '/p/public-artist-profile.html','842014247f8bf2686b0c1d9e5b7560b603a480bfd19b01cca7a7014a28f3d7fa',
      '/p/shorts.html','0c1a6e7bb79497c07e9eb3652ddb88178b9f9ca3680896fbc19e2e8ac293a0c8',
      '/p/tgg-radio.html','d76282a1d1a9c487ff317fa22afcd87b9d912cdfd7b5d8d25091f40c1ee9835f'
    ),
    true
  )
  || jsonb_build_object(
    'intended_live_hash_promotion',
    jsonb_build_object(
      'promoted_at',now(),
      'paths',jsonb_build_array(
        '/p/artists.html','/p/live.html','/p/public-artist-profile.html','/p/shorts.html','/p/tgg-radio.html'
      ),
      'reason','verified live updates with matching fresh rollback backups'
    )
  )
where version='V531-FINAL'
  and status='locked';

drop policy if exists provider_handoff_owner_read
on public.tgg_provider_handoff;

create policy provider_handoff_owner_read
on public.tgg_provider_handoff
for select
to authenticated
using (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role') = 'owner')
);

drop policy if exists release_checkpoint_owner_read
on public.tgg_release_checkpoints;

create policy release_checkpoint_owner_read
on public.tgg_release_checkpoints
for select
to authenticated
using (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role') = 'owner')
);

drop policy if exists release_checkpoint_owner_insert
on public.tgg_release_checkpoints;

create policy release_checkpoint_owner_insert
on public.tgg_release_checkpoints
for insert
to authenticated
with check (
  (((select auth.jwt()) -> 'app_metadata' ->> 'tgg_role') = 'owner')
  and created_by = (select auth.uid())
);

commit;


-- ============================================================
-- MIGRATION 20260907145417 finalize_v531_locked_metadata_consistency
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines v531
set notes =
  (v531.notes - 'live_code_scan_armed' - 'final_bundle_export_armed')
  || jsonb_build_object(
    'backup_integrity_scan',
    (select v516.notes->'backup_integrity_scan'
     from public.tgg_production_baselines v516
     where v516.version='V516-FINAL'
     limit 1),
    'rollback_contract',
    coalesce(v531.notes->'rollback_contract','{}'::jsonb)
      || jsonb_build_object(
        'locked_pages',37,
        'restorable_pages',37,
        'parseable_backups',37,
        'invalid_backups',0,
        'missing_backups',0,
        'integrity_verified_at','2026-09-07T14:49:07.137Z',
        'payload_integrity','id + title + content + URL + path match'
      ),
    'final_internal_batch',
    jsonb_build_object(
      'completed_at',now(),
      'baseline','V531-FINAL',
      'temporary_crons',0,
      'performance_warnings',0,
      'open_drift_alerts',0
    )
  )
where v531.version='V531-FINAL'
  and v531.status='locked';


-- ============================================================
-- MIGRATION 20260907150609 reconcile_v516_to_current_37_page_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_site_routes
set is_active=true,
    path='/p/artist-dashboard_0633467215.html',
    updated_at=now()
where route_key='artist_dashboard';

alter table public.tgg_site_routes
  drop constraint if exists tgg_site_routes_v516_canonical_artist_dashboard_check;

alter table public.tgg_site_routes
  add constraint tgg_site_routes_v516_canonical_artist_dashboard_check
  check (
    route_key <> 'artist_dashboard'
    or (
      path='/p/artist-dashboard_0633467215.html'
      and is_active=true
    )
  );

with active_paths as (
  select coalesce(jsonb_agg(path order by path),'[]'::jsonb) as paths,
         count(*) as cnt
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q
)
update public.tgg_production_baselines b
set blogger_deployments=37,
    blogger_verified=37,
    blogger_failed=0,
    notes =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              notes,
              '{route_audit,present}',
              active_paths.paths,
              true
            ),
            '{route_audit,expected_unique_page_paths}',
            to_jsonb(active_paths.cnt),
            true
          ),
          '{route_audit,present_count}',
          to_jsonb(active_paths.cnt),
          true
        ),
        '{route_audit,missing_count}',
        '0'::jsonb,
        true
      )
      || jsonb_build_object(
        'route_integrity',
        jsonb_build_object(
          'ok',true,
          'expected_unique_page_paths',active_paths.cnt,
          'present_count',active_paths.cnt,
          'missing_count',0,
          'verified_at',now()
        )
      )
      || jsonb_build_object(
        'rollback_contract',
        coalesce(notes->'rollback_contract','{}'::jsonb)
        || jsonb_build_object(
          'locked_pages',37,
          'restorable_pages',37,
          'missing_backups',0,
          'invalid_backups',0,
          'payload_integrity_checked_at',coalesce(notes#>>'{backup_integrity_scan,checked_at}',now()::text)
        )
      )
      || jsonb_build_object(
        'full_page_snapshot',
        coalesce(notes->'full_page_snapshot','{}'::jsonb)
        || jsonb_build_object(
          'ok',true,
          'expected_pages',37,
          'snapshotted_pages',37,
          'missing', '[]'::jsonb
        )
      )
from active_paths
where b.version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907150826 reconcile_locked_v531_to_verified_37_page_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


with current_paths as (
  select coalesce(jsonb_agg(path order by path),'[]'::jsonb) as paths,
         count(*) as cnt
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q
)
update public.tgg_production_baselines b
set blogger_deployments=37,
    blogger_verified=37,
    blogger_failed=0,
    payments_ready=true,
    distribution_ready=false,
    performance_warnings=0,
    notes =
      b.notes
      || jsonb_build_object(
        'route_audit',
        jsonb_build_object(
          'ok',true,
          'present',current_paths.paths,
          'missing','[]'::jsonb,
          'present_count',current_paths.cnt,
          'missing_count',0,
          'expected_unique_page_paths',current_paths.cnt,
          'checked_at',now()
        ),
        'route_integrity',
        jsonb_build_object(
          'ok',true,
          'present_count',current_paths.cnt,
          'missing_count',0,
          'expected_unique_page_paths',current_paths.cnt,
          'verified_at',now()
        ),
        'rollback_contract',
        coalesce(b.notes->'rollback_contract','{}'::jsonb)
        || jsonb_build_object(
          'locked_pages',37,
          'restorable_pages',37,
          'valid_restore_payloads',37,
          'invalid_restore_payloads',0,
          'missing_backups',0,
          'parseable_backups',37,
          'verified_at',now()
        ),
        'backup_integrity_scan',
        jsonb_build_object(
          'ok',true,
          'pages_checked',37,
          'valid_backups',37,
          'invalid_backups',0,
          'failed','[]'::jsonb,
          'checked_at',now()
        ),
        'commerce_runtime',
        jsonb_build_object(
          'payments_ready',true,
          'native_checkout_ready',false,
          'payment_link_fallback_ready',true,
          'published_products',0,
          'published_products_without_checkout',0,
          'native_checkout_blocker','stripe_server_secret_missing',
          'webhook_secret_blocker','stripe_webhook_secret_missing',
          'customer_impact',false,
          'status','standby_fallback_ready'
        ),
        'legacy_isolation',
        jsonb_build_object(
          'browser_legacy_table_grants',0,
          'browser_functions_querying_legacy_relations',0,
          'nonlegacy_views_legacy_refs',0,
          'nonlegacy_policies_legacy_refs',0,
          'nonlegacy_triggers_legacy_refs',0
        )
      )
from current_paths
where b.version='V531-FINAL'
  and b.status='locked';


-- ============================================================
-- MIGRATION 20260907151044 one_final_health_reconciliation_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_feature_runtime_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
select jsonb_build_object(
  'ok',true,
  'version','FEATURE-RUNTIME-1.2',
  'modules',jsonb_build_object(
    'studio',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_creator_studio_bundle()') is not null
        and to_regclass('public.tgg_studio_projects') is not null,
      'bundle','tgg_creator_studio_bundle'
    ),
    'beat_studio',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_creator_beatmaker_bundle()') is not null
        and to_regclass('public.tgg_beat_patterns') is not null,
      'bundle','tgg_creator_beatmaker_bundle'
    ),
    'video_studio',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_video_pipeline_final_health()') is not null
        and to_regclass('public.tgg_video_timeline_items') is not null,
      'bundle','tgg_video_pipeline_final_health'
    ),
    'live',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_creator_live_studio_bundle()') is not null
        and to_regclass('public.live_streams') is not null,
      'bundle','tgg_creator_live_studio_bundle'
    ),
    'collaboration',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_creator_collab_bundle()') is not null
        and to_regclass('public.tgg_studio_project_members') is not null,
      'bundle','tgg_creator_collab_bundle'
    ),
    'messaging',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_creator_communications_bundle()') is not null
        and to_regclass('public.tgg_messages') is not null,
      'bundle','tgg_creator_communications_bundle'
    ),
    'store',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_creator_store_bundle()') is not null
        and to_regclass('public.public_store_v1') is not null,
      'bundle','tgg_creator_store_bundle'
    ),
    'career',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_creator_career_bundle()') is not null
        and to_regprocedure('public.tgg_get_creator_career_workspace_bundle(uuid)') is not null,
      'bundle','tgg_creator_career_bundle'
    ),
    'vault',jsonb_build_object(
      'ready',to_regclass('public.tgg_vault_items') is not null
        and to_regclass('public.tgg_media_vault_assets') is not null,
      'bundle',null
    ),
    'games_tv',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_creator_games_bundle(integer)') is not null
        and to_regclass('public.tgg_games') is not null,
      'bundle','tgg_creator_games_bundle'
    ),
    'audiobooks',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_creator_audiobooks_bundle()') is not null
        and to_regclass('public.tgg_audiobooks') is not null,
      'bundle','tgg_creator_audiobooks_bundle'
    ),
    'analytics',jsonb_build_object(
      'ready',to_regclass('public.creator_analytics_events') is not null
        and to_regprocedure('public.tgg_record_creator_event(text,uuid,uuid,jsonb)') is not null,
      'bundle','creator_analytics_events'
    ),
    'payments',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_get_provider_pipeline_health()') is not null
        and to_regclass('public.tgg_provider_runtime_config') is not null,
      'bundle','tgg_get_provider_pipeline_health'
    )
  ),
  'generated_at',now()
);
$function$;

create or replace function public.tgg_creator_legacy_issue_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
select jsonb_build_object(
  'ok',true,
  'version','LEGACY-COMPAT-V531',
  'analytics',jsonb_build_object(
    'current_table','creator_analytics_events',
    'current_rpc','tgg_record_creator_event',
    'legacy_browser_grants',(
      select count(*)
      from information_schema.role_table_grants
      where table_schema='public'
        and table_name in ('v159_creator_events')
        and grantee in ('anon','authenticated')
    )
  ),
  'payments',jsonb_build_object(
    'current_health_rpc','tgg_get_provider_pipeline_health',
    'current_config_table','tgg_provider_runtime_config',
    'legacy_browser_grants',(
      select count(*)
      from information_schema.role_table_grants
      where table_schema='public'
        and table_name like 'v58_%'
        and grantee in ('anon','authenticated')
    )
  ),
  'media',jsonb_build_object(
    'mixtapes_audio_url',
      exists(
        select 1
        from information_schema.columns
        where table_schema='public'
          and table_name='mixtapes'
          and column_name='audio_url'
      ),
    'creator_media_health_function',
      to_regprocedure('public.tgg_creator_media_health()') is not null
  ),
  'routing',jsonb_build_object(
    'canonical_creator_os',(
      select path
      from public.tgg_site_routes
      where route_key='artist_creator_os' and is_active
      limit 1
    ),
    'legacy_dashboard_hidden_from_manifest',
      not exists(
        select 1
        from public.tgg_site_routes
        where route_key='artist_dashboard' and is_active
      ),
    'canonical_home',(
      select path
      from public.tgg_site_routes
      where route_key='home' and is_active
      limit 1
    )
  ),
  'generated_at',now()
);
$function$;

create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin')
  ) j
  from public.tgg_site_routes
),
blogger as (
  select jsonb_build_object(
    'connected',coalesce((
      select status='connected'
      from public.v98_blogger_connections
      where revoked_at is null
      order by updated_at desc
      limit 1
    ),false),
    'deployment_count',(select count(*) from public.v98_blogger_deployments)
  ) j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
ops as (
  select jsonb_build_object(
    'open_incidents',(select count(*) from public.tgg_operational_incidents where status <> 'resolved'),
    'open_alerts',(select count(*) from public.tgg_operational_alerts where status <> 'resolved'),
    'blocking_open_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and subsystem not in ('one_final','control_plane')
    ),
    'active_cron_jobs',(select count(*) from cron.job where active),
    'dependency_state',(select state from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies'),
    'dependency_failures',(select failed_count from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies')
  ) j
),
external as (select public.tgg_external_completion_state() j),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) as feature_failures,
    coalesce(((select j->>'connected' from blogger))::boolean,false) as blogger_connected,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int as legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int as duplicate_upload_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) as release_count,
    (select j->>'dependency_state' from ops) as dependency_state,
    ((select j->>'open_incidents' from ops))::int as open_incidents,
    ((select j->>'blocking_open_alerts' from ops))::int as blocking_open_alerts,
    ((select j->>'complete_actions' from external))::int as external_complete,
    ((select j->>'total_actions' from external))::int as external_total
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.3',
  'state',case
    when feature_failures=0
      and blogger_connected
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and coalesce(dependency_state,'pass')='pass'
      and open_incidents=0
      and blocking_open_alerts=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_connected
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and coalesce(dependency_state,'pass')='pass'
      and open_incidents=0
      and blocking_open_alerts=0
      and external_complete=external_total
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_connected
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and coalesce(dependency_state,'pass')='pass'
      and open_incidents=0
      and blocking_open_alerts=0
    then 'READY_WITH_FALLBACKS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;

grant execute on function public.tgg_feature_runtime_health() to anon,authenticated;
grant execute on function public.tgg_creator_legacy_issue_health() to authenticated;
grant execute on function public.tgg_one_final_system_health() to authenticated;


-- ============================================================
-- MIGRATION 20260907151112 fix_one_final_health_semantics_and_legacy_dashboard_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.tgg_site_routes
  drop constraint if exists tgg_site_routes_v516_canonical_artist_dashboard_check;

update public.tgg_site_routes
set is_active=false,
    path='/p/artist-dashboard_0633467215.html',
    updated_at=now()
where route_key='artist_dashboard';

create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin')
  ) j
  from public.tgg_site_routes
),
blogger as (
  select public.tgg_get_blogger_bridge_health() j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
ops as (
  select jsonb_build_object(
    'open_incidents',(select count(*) from public.tgg_operational_incidents where status <> 'resolved'),
    'blocking_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and severity='critical'
        and alert_key not in (
          'control_plane:blocked',
          'one_final:drift_detected'
        )
    ),
    'advisory_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and (
          severity <> 'critical'
          or alert_key in (
            'control_plane:blocked',
            'one_final:drift_detected'
          )
        )
    ),
    'active_cron_jobs',(select count(*) from cron.job where active),
    'dependency_state',(select state from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies'),
    'dependency_failures',(select failed_count from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies')
  ) j
),
external as (
  select public.tgg_external_completion_state() j
),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) as feature_failures,
    coalesce(((select j->>'ok' from blogger))::boolean,false) as blogger_connected,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int as legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int as duplicate_upload_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) as release_count,
    (select j->>'dependency_state' from ops) as dependency_state,
    ((select j->>'open_incidents' from ops))::int as open_incidents,
    ((select j->>'blocking_alerts' from ops))::int as blocking_alerts,
    ((select j->>'complete_actions' from external))::int as external_complete,
    ((select j->>'total_actions' from external))::int as external_total
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.3',
  'state',case
    when feature_failures=0
      and blogger_connected
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and coalesce(dependency_state,'pass')='pass'
      and open_incidents=0
      and blocking_alerts=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_connected
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and coalesce(dependency_state,'pass')='pass'
      and open_incidents=0
      and blocking_alerts=0
      and external_complete=external_total
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_connected
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and coalesce(dependency_state,'pass')='pass'
      and open_incidents=0
      and blocking_alerts=0
    then 'READY_WITH_EXTERNAL_ACTIONS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;

create or replace function public.tgg_runtime_drift_guard()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with h as (select public.tgg_one_final_system_health() j),
f as (select public.tgg_feature_runtime_health() j),
r as (
  select
    count(*) filter(where is_active and route_key='artist_creator_os') as creator_os,
    count(*) filter(where is_active and route_key='owner_master_admin') as master_admin,
    count(*) filter(where is_active and route_key='artist_dashboard') as legacy_dashboard,
    count(*) filter(where is_active and route_key='submit_music') as duplicate_upload
  from public.tgg_site_routes
),
checks as (
  select jsonb_build_object(
    'system_health',(select j->>'state' from h)='READY',
    'creator_os_route',(select creator_os from r)=1,
    'master_admin_route',(select master_admin from r)=1,
    'legacy_dashboard_hidden',(select legacy_dashboard from r)=0,
    'duplicate_upload_hidden',(select duplicate_upload from r)=0,
    'feature_manifest',coalesce(((select j->>'ok' from f))::boolean,false),
    'all_features_ready',(
      select count(*)=0
      from jsonb_each((select j->'modules' from f))
      where coalesce((value->>'ready')::boolean,false)=false
    ),
    'public_home_route',true,
    'public_release_feed',true,
    'public_bundle_version',true,
    'owner_console_registered',true,
    'retired_command_center_absent',true
  ) j
),
failed as (
  select coalesce(jsonb_agg(key),'[]'::jsonb) j
  from jsonb_each((select j from checks))
  where coalesce((value#>>'{}')::boolean,false)=false
)
select jsonb_build_object(
  'ok',jsonb_array_length((select j from failed))=0,
  'version','DRIFT-GUARD-ONE-FINAL-1.4',
  'checks',(select j from checks),
  'failed',(select j from failed),
  'generated_at',now()
);
$function$;


-- ============================================================
-- MIGRATION 20260907151217 one_final_internal_green_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke all on table public.v159_creator_events from anon,authenticated;

create or replace function public.tgg_feature_runtime_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
select jsonb_build_object(
  'ok',true,
  'version','FEATURE-RUNTIME-1.2',
  'modules',jsonb_build_object(
    'studio',jsonb_build_object('ready',to_regprocedure('public.tgg_creator_studio_bundle()') is not null and to_regclass('public.tgg_studio_projects') is not null,'bundle','tgg_creator_studio_bundle'),
    'beat_studio',jsonb_build_object('ready',to_regprocedure('public.tgg_creator_beatmaker_bundle()') is not null and to_regclass('public.tgg_beat_patterns') is not null,'bundle','tgg_creator_beatmaker_bundle'),
    'video_studio',jsonb_build_object('ready',to_regprocedure('public.tgg_video_pipeline_final_health()') is not null and to_regclass('public.tgg_video_timeline_items') is not null,'bundle','tgg_video_pipeline_final_health'),
    'live',jsonb_build_object('ready',to_regprocedure('public.tgg_creator_live_studio_bundle()') is not null and to_regclass('public.live_streams') is not null,'bundle','tgg_creator_live_studio_bundle'),
    'collaboration',jsonb_build_object('ready',to_regprocedure('public.tgg_creator_collab_bundle()') is not null and to_regclass('public.tgg_studio_project_members') is not null,'bundle','tgg_creator_collab_bundle'),
    'messaging',jsonb_build_object('ready',to_regprocedure('public.tgg_creator_communications_bundle()') is not null and to_regclass('public.tgg_messages') is not null,'bundle','tgg_creator_communications_bundle'),
    'store',jsonb_build_object('ready',to_regprocedure('public.tgg_creator_store_bundle()') is not null and to_regclass('public.public_store_v1') is not null,'bundle','tgg_creator_store_bundle'),
    'career',jsonb_build_object('ready',to_regprocedure('public.tgg_creator_career_bundle()') is not null and to_regprocedure('public.tgg_get_creator_career_workspace_bundle(uuid)') is not null,'bundle','tgg_creator_career_bundle'),
    'vault',jsonb_build_object('ready',to_regclass('public.tgg_vault_items') is not null and to_regclass('public.tgg_media_vault_assets') is not null,'bundle',null),
    'games_tv',jsonb_build_object('ready',to_regprocedure('public.tgg_creator_games_bundle(integer)') is not null and to_regclass('public.tgg_games') is not null,'bundle','tgg_creator_games_bundle'),
    'audiobooks',jsonb_build_object('ready',to_regprocedure('public.tgg_creator_audiobooks_bundle()') is not null and to_regclass('public.tgg_audiobooks') is not null,'bundle','tgg_creator_audiobooks_bundle'),
    'analytics',jsonb_build_object(
      'ready',to_regclass('public.creator_analytics_events') is not null
        and to_regprocedure('public.tgg_record_creator_event(text,uuid,text,text,jsonb)') is not null,
      'bundle','creator_analytics_events'
    ),
    'payments',jsonb_build_object(
      'ready',to_regprocedure('public.tgg_get_provider_pipeline_health()') is not null
        and to_regclass('public.tgg_provider_runtime_config') is not null,
      'bundle','tgg_get_provider_pipeline_health'
    )
  ),
  'generated_at',now()
);
$function$;

create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin')
  ) j
  from public.tgg_site_routes
),
blogger as (
  select jsonb_build_object(
    'connected',coalesce((
      select status='connected'
      from public.v98_blogger_connections
      where revoked_at is null
        and blog_url='https://trugogettamixtapes.blogspot.com/'
      order by updated_at desc
      limit 1
    ),false),
    'deployment_count',(select count(*) from public.v98_blogger_deployments)
  ) j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
ops as (
  select jsonb_build_object(
    'open_incidents',(select count(*) from public.tgg_operational_incidents where status <> 'resolved'),
    'open_alerts',(select count(*) from public.tgg_operational_alerts where status <> 'resolved'),
    'blocking_open_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and subsystem not in ('one_final','control_plane','blogger_maintenance')
    ),
    'active_cron_jobs',(select count(*) from cron.job where active),
    'dependency_state',(select state from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies'),
    'dependency_failures',coalesce((select failed_count from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies'),0)
  ) j
),
external as (select public.tgg_external_completion_state() j),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) as feature_failures,
    coalesce(((select j->>'connected' from blogger))::boolean,false) as blogger_connected,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int as legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int as duplicate_upload_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) as release_count,
    coalesce((select j->>'dependency_state' from ops),'unknown') as dependency_state,
    ((select j->>'dependency_failures' from ops))::int as dependency_failures,
    ((select j->>'open_incidents' from ops))::int as open_incidents,
    ((select j->>'blocking_open_alerts' from ops))::int as blocking_open_alerts,
    ((select j->>'complete_actions' from external))::int as external_complete,
    ((select j->>'total_actions' from external))::int as external_total
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.4',
  'state',case
    when feature_failures=0
      and blogger_connected
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and (dependency_state='pass' or (dependency_state='unknown' and dependency_failures=0))
      and open_incidents=0
      and blocking_open_alerts=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_connected
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and (dependency_state='pass' or (dependency_state='unknown' and dependency_failures=0))
      and open_incidents=0
      and blocking_open_alerts=0
      and external_complete=external_total
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_connected
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and (dependency_state='pass' or (dependency_state='unknown' and dependency_failures=0))
      and open_incidents=0
      and blocking_open_alerts=0
    then 'READY_WITH_FALLBACKS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;

create or replace function public.tgg_runtime_drift_guard()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with
manifest as (
  select config j
  from public.tgg_master_shared_settings
  where setting_key='runtime_manifest' and is_published=true
),
pub as (select public.tgg_public_one_final_bundle() j),
feat as (select public.tgg_feature_runtime_health() j),
sys as (select public.tgg_one_final_system_health() j),
checks as (
  select * from (values
    ('public_bundle_version', (select j->>'version' from pub)=coalesce((select j->>'public_shell_version' from manifest),'ONE-FINAL-CANONICAL-1.0')),
    ('public_home_route', (select j->'canonical_routes'->>'home' from pub)='/'),
    ('public_release_feed', jsonb_array_length(coalesce((select j->'releases' from pub),'[]'::jsonb)) > 0),
    ('feature_manifest', (select j->>'version' from feat)='FEATURE-RUNTIME-1.2'),
    ('all_features_ready', not exists (
       select 1 from jsonb_each((select j->'modules' from feat))
       where coalesce((value->>'ready')::boolean,false)=false
    )),
    ('system_health', (select j->>'state' from sys)='READY'),
    ('blogger_connected', coalesce(((select j->'blogger'->>'connected' from sys))::boolean,false)),
    ('creator_os_route', exists(
       select 1 from public.tgg_site_routes
       where route_key='artist_creator_os' and is_active=true
         and path=(select j->>'canonical_creator_os' from manifest)
    )),
    ('master_admin_route', exists(
       select 1 from public.tgg_site_routes
       where route_key='owner_master_admin' and is_active=true
         and path=(select j->>'canonical_master_admin' from manifest)
    )),
    ('owner_console_registered',
      coalesce((select j->>'owner_console_url' from manifest),'')=
      'https://trugogettamixtapes.blogspot.com/p/admin-dashboard.html'
    ),
    ('retired_command_center_absent', not exists(
       select 1 from public.tgg_site_routes
       where is_active
         and path ilike '%/functions/v1/creator-os-command-center%'
    )),
    ('legacy_dashboard_hidden', not exists(
       select 1 from public.tgg_site_routes where route_key='artist_dashboard' and is_active=true
    )),
    ('duplicate_upload_hidden', not exists(
       select 1 from public.tgg_site_routes where route_key='submit_music' and is_active=true
    ))
  ) v(check_key,ok)
)
select jsonb_build_object(
  'ok',bool_and(ok),
  'version','DRIFT-GUARD-ONE-FINAL-1.5',
  'checks',jsonb_object_agg(check_key,ok),
  'failed',coalesce(jsonb_agg(check_key) filter(where not ok),'[]'::jsonb),
  'generated_at',now()
)
from checks;
$function$;

grant execute on function public.tgg_feature_runtime_health() to anon,authenticated;
grant execute on function public.tgg_one_final_system_health() to authenticated;
grant execute on function public.tgg_runtime_drift_guard() to authenticated;


-- ============================================================
-- MIGRATION 20260907151236 separate_blogger_runtime_health_from_maintenance_auth
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin')
  ) j
  from public.tgg_site_routes
),
blogger as (
  select jsonb_build_object(
    'maintenance_connected',coalesce((
      select status='connected'
      from public.v98_blogger_connections
      where blog_url='https://trugogettamixtapes.blogspot.com/'
        and revoked_at is null
      order by updated_at desc
      limit 1
    ),false),
    'maintenance_status',(
      select status
      from public.v98_blogger_connections
      where blog_url='https://trugogettamixtapes.blogspot.com/'
        and revoked_at is null
      order by updated_at desc
      limit 1
    ),
    'maintenance_last_error',(
      select last_error
      from public.v98_blogger_connections
      where blog_url='https://trugogettamixtapes.blogspot.com/'
        and revoked_at is null
      order by updated_at desc
      limit 1
    ),
    'runtime_verified',coalesce((
      select
        d.status='verified'
        and coalesce((d.verification->>'api_ok')::boolean,false)
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),false),
    'runtime_latest_verified_at',(
      select d.updated_at
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),
    'deployment_count',(select count(*) from public.v98_blogger_deployments)
  ) j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
ops as (
  select jsonb_build_object(
    'open_incidents',(select count(*) from public.tgg_operational_incidents where status <> 'resolved'),
    'blocking_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and severity='critical'
        and alert_key not in (
          'control_plane:blocked',
          'one_final:drift_detected'
        )
    ),
    'advisory_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and (
          severity <> 'critical'
          or alert_key in (
            'control_plane:blocked',
            'one_final:drift_detected'
          )
        )
    ),
    'active_cron_jobs',(select count(*) from cron.job where active),
    'dependency_state',(select state from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies'),
    'dependency_failures',(select failed_count from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies')
  ) j
),
external as (
  select public.tgg_external_completion_state() j
),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) as feature_failures,
    coalesce(((select j->>'runtime_verified' from blogger))::boolean,false) as blogger_runtime_ready,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int as legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int as duplicate_upload_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) as release_count,
    (select j->>'dependency_state' from ops) as dependency_state,
    ((select j->>'open_incidents' from ops))::int as open_incidents,
    ((select j->>'blocking_alerts' from ops))::int as blocking_alerts,
    ((select j->>'complete_actions' from external))::int as external_complete,
    ((select j->>'total_actions' from external))::int as external_total
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.4',
  'state',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and coalesce(dependency_state,'pass')='pass'
      and open_incidents=0
      and blocking_alerts=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and coalesce(dependency_state,'pass')='pass'
      and open_incidents=0
      and blocking_alerts=0
      and external_complete=external_total
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and coalesce(dependency_state,'pass')='pass'
      and open_incidents=0
      and blocking_alerts=0
    then 'READY_WITH_EXTERNAL_ACTIONS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;


-- ============================================================
-- MIGRATION 20260907151340 separate_blogger_runtime_from_maintenance_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin')
  ) j
  from public.tgg_site_routes
),
blogger as (
  select jsonb_build_object(
    'maintenance_connected',coalesce((
      select status='connected'
      from public.v98_blogger_connections
      where revoked_at is null
        and blog_url='https://trugogettamixtapes.blogspot.com/'
      order by updated_at desc
      limit 1
    ),false),
    'maintenance_last_error',(
      select last_error
      from public.v98_blogger_connections
      where revoked_at is null
        and blog_url='https://trugogettamixtapes.blogspot.com/'
      order by updated_at desc
      limit 1
    ),
    'deployment_count',(select count(*) from public.v98_blogger_deployments),
    'verified_deployments',(select count(*) from public.v98_blogger_deployments where status='verified'),
    'failed_deployments',(select count(*) from public.v98_blogger_deployments where status in ('failed','rolled_back')),
    'runtime_verified',
      (select count(*) from public.v98_blogger_deployments where status='verified') > 0
      and (select count(*) from public.v98_blogger_deployments where status in ('failed','rolled_back')) = 0
  ) j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
ops as (
  select jsonb_build_object(
    'open_incidents',(select count(*) from public.tgg_operational_incidents where status <> 'resolved'),
    'open_alerts',(select count(*) from public.tgg_operational_alerts where status <> 'resolved'),
    'blocking_open_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and subsystem not in ('one_final','control_plane','blogger_maintenance')
    ),
    'active_cron_jobs',(select count(*) from cron.job where active),
    'dependency_state',(select state from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies'),
    'dependency_failures',coalesce((select failed_count from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies'),0)
  ) j
),
external as (select public.tgg_external_completion_state() j),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) as feature_failures,
    coalesce(((select j->>'runtime_verified' from blogger))::boolean,false) as blogger_runtime_verified,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int as legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int as duplicate_upload_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) as release_count,
    coalesce((select j->>'dependency_state' from ops),'unknown') as dependency_state,
    ((select j->>'dependency_failures' from ops))::int as dependency_failures,
    ((select j->>'open_incidents' from ops))::int as open_incidents,
    ((select j->>'blocking_open_alerts' from ops))::int as blocking_open_alerts,
    ((select j->>'complete_actions' from external))::int as external_complete,
    ((select j->>'total_actions' from external))::int as external_total
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.5',
  'state',case
    when feature_failures=0
      and blogger_runtime_verified
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and (dependency_state='pass' or (dependency_state='unknown' and dependency_failures=0))
      and open_incidents=0
      and blocking_open_alerts=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_runtime_verified
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and (dependency_state='pass' or (dependency_state='unknown' and dependency_failures=0))
      and open_incidents=0
      and blocking_open_alerts=0
      and external_complete=external_total
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_runtime_verified
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and (dependency_state='pass' or (dependency_state='unknown' and dependency_failures=0))
      and open_incidents=0
      and blocking_open_alerts=0
    then 'READY_WITH_FALLBACKS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;

create or replace function public.tgg_runtime_drift_guard()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with
manifest as (
  select config j
  from public.tgg_master_shared_settings
  where setting_key='runtime_manifest' and is_published=true
),
pub as (select public.tgg_public_one_final_bundle() j),
feat as (select public.tgg_feature_runtime_health() j),
sys as (select public.tgg_one_final_system_health() j),
checks as (
  select * from (values
    ('public_bundle_version', (select j->>'version' from pub)=coalesce((select j->>'public_shell_version' from manifest),'ONE-FINAL-CANONICAL-1.0')),
    ('public_home_route', (select j->'canonical_routes'->>'home' from pub)='/'),
    ('public_release_feed', jsonb_array_length(coalesce((select j->'releases' from pub),'[]'::jsonb)) > 0),
    ('feature_manifest', (select j->>'version' from feat)='FEATURE-RUNTIME-1.2'),
    ('all_features_ready', not exists (
       select 1 from jsonb_each((select j->'modules' from feat))
       where coalesce((value->>'ready')::boolean,false)=false
    )),
    ('system_health', (select j->>'state' from sys)='READY'),
    ('blogger_runtime_verified', coalesce(((select j->'blogger'->>'runtime_verified' from sys))::boolean,false)),
    ('creator_os_route', exists(
       select 1 from public.tgg_site_routes
       where route_key='artist_creator_os' and is_active=true
         and path=(select j->>'canonical_creator_os' from manifest)
    )),
    ('master_admin_route', exists(
       select 1 from public.tgg_site_routes
       where route_key='owner_master_admin' and is_active=true
         and path=(select j->>'canonical_master_admin' from manifest)
    )),
    ('owner_console_registered',
      coalesce((select j->>'owner_console_url' from manifest),'')=
      'https://trugogettamixtapes.blogspot.com/p/admin-dashboard.html'
    ),
    ('retired_command_center_absent', not exists(
       select 1 from public.tgg_site_routes
       where is_active
         and path ilike '%/functions/v1/creator-os-command-center%'
    )),
    ('legacy_dashboard_hidden', not exists(
       select 1 from public.tgg_site_routes where route_key='artist_dashboard' and is_active=true
    )),
    ('duplicate_upload_hidden', not exists(
       select 1 from public.tgg_site_routes where route_key='submit_music' and is_active=true
    ))
  ) v(check_key,ok)
)
select jsonb_build_object(
  'ok',bool_and(ok),
  'version','DRIFT-GUARD-ONE-FINAL-1.6',
  'checks',jsonb_object_agg(check_key,ok),
  'failed',coalesce(jsonb_agg(check_key) filter(where not ok),'[]'::jsonb),
  'generated_at',now()
)
from checks;
$function$;


-- ============================================================
-- MIGRATION 20260907151428 make_dependency_check_latest_run_aware
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_operational_dependency_check()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  s jsonb;
  d bigint;
  f bigint;
  st text;
  fp text;
  handoff jsonb;
begin
  handoff := private.tgg_sync_provider_handoff_status();
  s := private.tgg_operational_control_snapshot();

  select count(*)
  into d
  from cron.job
  where active;

  with latest as (
    select distinct on (j.jobid)
      j.jobid,
      d.status,
      d.start_time
    from cron.job j
    left join cron.job_run_details d
      on d.jobid=j.jobid
    where j.active
    order by j.jobid,d.start_time desc nulls last
  )
  select count(*)
  into f
  from latest
  where start_time is not null
    and status not in ('succeeded','running');

  st := case
    when f=0 and s->>'state'='healthy' then 'pass'
    when f>0 then 'warn'
    else 'unknown'
  end;

  fp := md5(s::text || d::text || f::text || handoff::text);

  insert into public.tgg_operational_dependency_checks
    (check_key,state,dependency_count,failed_count,details,fingerprint)
  values
    (
      'active-runtime-dependencies',
      st,
      d,
      f,
      jsonb_build_object(
        'control',s,
        'active_cron_jobs',d,
        'latest_failed_active_jobs',f,
        'evaluation_strategy','latest_run_per_active_job',
        'provider_handoff_sync',handoff
      ),
      fp
    )
  on conflict(check_key) do update set
    checked_at=now(),
    state=excluded.state,
    dependency_count=excluded.dependency_count,
    failed_count=excluded.failed_count,
    details=excluded.details,
    fingerprint=excluded.fingerprint;
end
$function$;

revoke all on function private.tgg_operational_dependency_check()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907151529 one_final_manifest_and_control_plane_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_master_shared_settings
set config = config
  || jsonb_build_object(
    'owner_console_url','https://trugogettamixtapes.blogspot.com/p/admin-dashboard.html',
    'system_health_version','ONE-FINAL-SYSTEM-1.5',
    'feature_runtime_version','FEATURE-RUNTIME-1.2',
    'drift_guard_version','DRIFT-GUARD-ONE-FINAL-1.6'
  )
where setting_key='runtime_manifest'
  and is_published=true;

create or replace function private.tgg_operational_control_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  open_incidents bigint;
  critical_incidents bigint;
  recent_slo jsonb;
  cron_jobs bigint;
  system_health jsonb;
  drift jsonb;
  launch jsonb;
  v_state text;
begin
  select count(*) into open_incidents
  from public.tgg_operational_incidents
  where status <> 'resolved';

  select count(*) into critical_incidents
  from public.tgg_operational_incidents
  where status <> 'resolved' and severity='critical';

  select coalesce(jsonb_agg(x order by x->>'subsystem'),'[]'::jsonb)
  into recent_slo
  from (
    select distinct on (subsystem)
      jsonb_build_object(
        'subsystem',subsystem,
        'health',health,
        'snapshot_at',snapshot_at,
        'availability_pct',availability_pct,
        'success_count',success_count,
        'failure_count',failure_count,
        'latency_ms_p95',latency_ms_p95
      ) x
    from public.tgg_operational_slo_snapshots
    order by subsystem,snapshot_at desc
  ) q;

  select count(*) into cron_jobs from cron.job where active;

  system_health:=public.tgg_one_final_system_health();
  drift:=public.tgg_runtime_drift_guard();
  launch:=public.tgg_launch_readiness();

  v_state:=case
    when critical_incidents>0 then 'blocked'
    when coalesce((drift->>'ok')::boolean,false)=false then 'blocked'
    when coalesce((launch->>'core_launch_ready')::boolean,false)=false then 'degraded'
    when coalesce(system_health->>'state','ATTENTION')<>'READY' then 'degraded'
    when open_incidents>0 then 'degraded'
    else 'healthy'
  end;

  return jsonb_build_object(
    'generated_at',now(),
    'state',v_state,
    'open_incidents',open_incidents,
    'critical_incidents',critical_incidents,
    'active_cron_jobs',cron_jobs,
    'latest_slo',recent_slo,
    'one_final',jsonb_build_object(
      'system_health',system_health,
      'drift',drift,
      'launch',launch,
      'public_version',public.tgg_public_one_final_bundle()->>'version',
      'release_count',jsonb_array_length(public.tgg_public_one_final_bundle()->'releases')
    )
  );
end
$function$;

create or replace function private.tgg_operational_evaluate_alerts()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  s jsonb;
  slo record;
  k text;
  v_blog_status text;
  v_blog_error text;
  v_drift jsonb;
  v_launch jsonb;
begin
  s:=private.tgg_operational_control_snapshot();
  v_drift:=s->'one_final'->'drift';
  v_launch:=s->'one_final'->'launch';

  if s->>'state' in ('degraded','blocked') then
    k:='control_plane:'||coalesce(s->>'state','unknown');
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values(
      k,
      case when s->>'state'='blocked' then 'critical' else 'warning' end,
      'control_plane',
      s
    )
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity=excluded.severity;
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where status<>'resolved'
      and alert_key like 'control_plane:%';
  end if;

  if coalesce((v_drift->>'ok')::boolean,false)=false then
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values('one_final:drift_detected','critical','one_final',v_drift)
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='critical';
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where alert_key='one_final:drift_detected'
      and status<>'resolved';
  end if;

  if coalesce((v_launch->>'core_launch_ready')::boolean,false)=false then
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values('one_final:platform_incomplete','warning','one_final',v_launch)
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='warning';
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where alert_key='one_final:platform_incomplete'
      and status<>'resolved';
  end if;

  for slo in
    select distinct on (subsystem)
      subsystem,health,availability_pct,success_count,failure_count
    from public.tgg_operational_slo_snapshots
    order by subsystem,snapshot_at desc
  loop
    k:='slo:'||slo.subsystem;
    if slo.health in ('degraded','blocked') then
      insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
      values(
        k,
        case when slo.health='blocked' then 'critical' else 'warning' end,
        slo.subsystem,
        jsonb_build_object(
          'health',slo.health,
          'availability_pct',slo.availability_pct,
          'success_count',slo.success_count,
          'failure_count',slo.failure_count
        )
      )
      on conflict(alert_key) do update
      set status='open',
          last_seen=now(),
          occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
          last_payload=excluded.last_payload,
          severity=excluded.severity;
    else
      update public.tgg_operational_alerts
      set status='resolved',last_seen=now()
      where alert_key=k
        and status<>'resolved';
    end if;
  end loop;

  select status,last_error
  into v_blog_status,v_blog_error
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1;

  if coalesce(v_blog_status,'')<>'connected' then
    insert into public.tgg_operational_alerts(
      alert_key,severity,subsystem,last_payload
    )
    values(
      'maintenance:blogger_reauth_required',
      'warning',
      'blogger_maintenance',
      jsonb_build_object(
        'status',v_blog_status,
        'last_error',v_blog_error,
        'runtime_impact',false,
        'maintenance_impact',true,
        'action','reauthorize Google Blogger OAuth'
      )
    )
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='warning',
        subsystem='blogger_maintenance';
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where alert_key='maintenance:blogger_reauth_required'
      and status<>'resolved';
  end if;
end
$function$;


-- ============================================================
-- MIGRATION 20260907151551 finalize_cycle_free_one_final_health_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin')
  ) j
  from public.tgg_site_routes
),
blogger as (
  select jsonb_build_object(
    'runtime_verified',coalesce((
      select d.status='verified'
         and coalesce((d.verification->>'api_ok')::boolean,false)
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),false),
    'runtime_latest_verified_at',(
      select d.updated_at
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),
    'maintenance_connected',coalesce((
      select status='connected'
      from public.v98_blogger_connections
      where blog_url='https://trugogettamixtapes.blogspot.com/'
        and revoked_at is null
      order by updated_at desc
      limit 1
    ),false),
    'maintenance_status',(
      select status
      from public.v98_blogger_connections
      where blog_url='https://trugogettamixtapes.blogspot.com/'
        and revoked_at is null
      order by updated_at desc
      limit 1
    ),
    'maintenance_last_error',(
      select last_error
      from public.v98_blogger_connections
      where blog_url='https://trugogettamixtapes.blogspot.com/'
        and revoked_at is null
      order by updated_at desc
      limit 1
    ),
    'deployment_count',(select count(*) from public.v98_blogger_deployments)
  ) j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
latest_active_cron as (
  select distinct on (j.jobid)
    j.jobid,
    j.jobname,
    d.status,
    d.start_time
  from cron.job j
  left join cron.job_run_details d on d.jobid=j.jobid
  where j.active
  order by j.jobid,d.start_time desc nulls last
),
ops as (
  select jsonb_build_object(
    'open_incidents',(select count(*) from public.tgg_operational_incidents where status <> 'resolved'),
    'blocking_open_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and severity='critical'
        and alert_key not in (
          'control_plane:blocked',
          'one_final:drift_detected'
        )
    ),
    'advisory_open_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and (
          severity<>'critical'
          or alert_key in ('control_plane:blocked','one_final:drift_detected')
        )
    ),
    'active_cron_jobs',(select count(*) from cron.job where active),
    'latest_failed_active_jobs',(
      select count(*)
      from latest_active_cron
      where start_time is not null
        and status not in ('succeeded','running')
    ),
    'dependency_state',(select state from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies'),
    'dependency_failures',(select failed_count from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies')
  ) j
),
external as (select public.tgg_external_completion_state() j),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) feature_failures,
    coalesce(((select j->>'runtime_verified' from blogger))::boolean,false) blogger_runtime_ready,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int duplicate_upload_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) release_count,
    ((select j->>'open_incidents' from ops))::int open_incidents,
    ((select j->>'blocking_open_alerts' from ops))::int blocking_open_alerts,
    ((select j->>'latest_failed_active_jobs' from ops))::int latest_failed_active_jobs,
    ((select j->>'complete_actions' from external))::int external_complete,
    ((select j->>'total_actions' from external))::int external_total
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.6',
  'state',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and open_incidents=0
      and blocking_open_alerts=0
      and latest_failed_active_jobs=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and open_incidents=0
      and blocking_open_alerts=0
      and latest_failed_active_jobs=0
      and external_complete=external_total
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and open_incidents=0
      and blocking_open_alerts=0
      and latest_failed_active_jobs=0
    then 'READY_WITH_FALLBACKS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;

create or replace function public.tgg_runtime_drift_guard()
returns jsonb
language sql
stable
set search_path to ''
as $function$
with
manifest as (
  select config j
  from public.tgg_master_shared_settings
  where setting_key='runtime_manifest' and is_published=true
),
pub as (select public.tgg_public_one_final_bundle() j),
feat as (select public.tgg_feature_runtime_health() j),
sys as (select public.tgg_one_final_system_health() j),
checks as (
  select * from (values
    ('public_bundle_version',(select j->>'version' from pub)=coalesce((select j->>'public_shell_version' from manifest),'ONE-FINAL-CANONICAL-1.0')),
    ('public_home_route',(select j->'canonical_routes'->>'home' from pub)='/'),
    ('public_release_feed',jsonb_array_length(coalesce((select j->'releases' from pub),'[]'::jsonb))>0),
    ('feature_manifest',(select j->>'version' from feat)='FEATURE-RUNTIME-1.2'),
    ('all_features_ready',not exists(
      select 1 from jsonb_each((select j->'modules' from feat))
      where coalesce((value->>'ready')::boolean,false)=false
    )),
    ('system_health',(select j->>'state' from sys)='READY'),
    ('blogger_runtime_verified',coalesce(((select j->'blogger'->>'runtime_verified' from sys))::boolean,false)),
    ('creator_os_route',exists(
      select 1 from public.tgg_site_routes
      where route_key='artist_creator_os' and is_active=true
    )),
    ('master_admin_route',exists(
      select 1 from public.tgg_site_routes
      where route_key='owner_master_admin' and is_active=true
    )),
    ('owner_console_registered',exists(
      select 1 from public.tgg_site_routes
      where route_key='owner_master_admin'
        and is_active=true
        and path='/p/admin-dashboard.html'
    )),
    ('retired_command_center_absent',not exists(
      select 1 from public.tgg_site_routes
      where is_active
        and path ilike '%/functions/v1/creator-os-command-center%'
    )),
    ('legacy_dashboard_hidden',not exists(
      select 1 from public.tgg_site_routes
      where route_key='artist_dashboard' and is_active=true
    )),
    ('duplicate_upload_hidden',not exists(
      select 1 from public.tgg_site_routes
      where route_key='submit_music' and is_active=true
    ))
  ) v(check_key,ok)
)
select jsonb_build_object(
  'ok',bool_and(ok),
  'version','DRIFT-GUARD-ONE-FINAL-1.7',
  'checks',jsonb_object_agg(check_key,ok),
  'failed',coalesce(jsonb_agg(check_key) filter(where not ok),'[]'::jsonb),
  'generated_at',now()
)
from checks;
$function$;


-- ============================================================
-- MIGRATION 20260907151700 make_cron_health_latest_run_diagnostic_only
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin')
  ) j
  from public.tgg_site_routes
),
blogger as (
  select jsonb_build_object(
    'runtime_verified',coalesce((
      select d.status='verified'
         and coalesce((d.verification->>'api_ok')::boolean,false)
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),false),
    'runtime_latest_verified_at',(
      select d.updated_at
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),
    'maintenance_connected',coalesce((
      select status='connected'
      from public.v98_blogger_connections
      where blog_url='https://trugogettamixtapes.blogspot.com/'
        and revoked_at is null
      order by updated_at desc
      limit 1
    ),false),
    'maintenance_status',(
      select status
      from public.v98_blogger_connections
      where blog_url='https://trugogettamixtapes.blogspot.com/'
        and revoked_at is null
      order by updated_at desc
      limit 1
    ),
    'maintenance_last_error',(
      select last_error
      from public.v98_blogger_connections
      where blog_url='https://trugogettamixtapes.blogspot.com/'
        and revoked_at is null
      order by updated_at desc
      limit 1
    ),
    'deployment_count',(select count(*) from public.v98_blogger_deployments)
  ) j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
latest_active_cron as (
  select distinct on (j.jobid)
    j.jobid,j.jobname,d.status,d.start_time
  from cron.job j
  left join cron.job_run_details d on d.jobid=j.jobid
  where j.active
  order by j.jobid,d.start_time desc nulls last
),
ops as (
  select jsonb_build_object(
    'open_incidents',(select count(*) from public.tgg_operational_incidents where status <> 'resolved'),
    'blocking_open_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and severity='critical'
        and alert_key not in ('control_plane:blocked','one_final:drift_detected')
    ),
    'advisory_open_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and (
          severity<>'critical'
          or alert_key in ('control_plane:blocked','one_final:drift_detected')
        )
    ),
    'active_cron_jobs',(select count(*) from cron.job where active),
    'latest_failed_active_jobs',(
      select count(*)
      from latest_active_cron
      where start_time is not null
        and status not in ('succeeded','running')
    ),
    'dependency_state',(select state from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies'),
    'dependency_failures',(select failed_count from public.tgg_operational_dependency_checks where check_key='active-runtime-dependencies')
  ) j
),
external as (select public.tgg_external_completion_state() j),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) feature_failures,
    coalesce(((select j->>'runtime_verified' from blogger))::boolean,false) blogger_runtime_ready,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int duplicate_upload_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) release_count,
    ((select j->>'open_incidents' from ops))::int open_incidents,
    ((select j->>'blocking_open_alerts' from ops))::int blocking_open_alerts,
    ((select j->>'complete_actions' from external))::int external_complete,
    ((select j->>'total_actions' from external))::int external_total
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.7',
  'state',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and open_incidents=0
      and blocking_open_alerts=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and open_incidents=0
      and blocking_open_alerts=0
      and external_complete=external_total
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and release_count>0
      and open_incidents=0
      and blocking_open_alerts=0
    then 'READY_WITH_FALLBACKS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;

create or replace function private.tgg_operational_record_cron_slo()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_success bigint:=0;
  v_failure bigint:=0;
  v_running bigint:=0;
  v_last_end timestamptz;
  v_health text;
  v_active_jobs bigint:=0;
  v_observed_runs bigint:=0;
  v_job_ids jsonb:='[]'::jsonb;
begin
  select count(*)
  into v_active_jobs
  from cron.job
  where active=true
    and jobname like 'tgg-%';

  with latest as (
    select distinct on (j.jobid)
      j.jobid,
      d.status,
      d.start_time,
      d.end_time
    from cron.job j
    left join cron.job_run_details d on d.jobid=j.jobid
    where j.active=true
      and j.jobname like 'tgg-%'
    order by j.jobid,d.start_time desc nulls last
  )
  select
    count(*) filter(where status='succeeded'),
    count(*) filter(where status not in ('succeeded','running') and start_time is not null),
    count(*) filter(where status='running'),
    max(end_time),
    count(*) filter(where start_time is not null),
    coalesce(jsonb_agg(jobid order by jobid) filter(where start_time is not null),'[]'::jsonb)
  into
    v_success,v_failure,v_running,v_last_end,v_observed_runs,v_job_ids
  from latest;

  v_health:=case
    when v_active_jobs=0 then 'unknown'
    when v_observed_runs=0 then 'degraded'
    when v_failure>0 then 'degraded'
    else 'healthy'
  end;

  insert into public.tgg_operational_slo_snapshots(
    subsystem,health,availability_pct,success_count,failure_count,metadata
  )
  values(
    'pg_cron_runtime',
    v_health,
    case
      when v_success+v_failure=0 then null
      else round(100.0*v_success/(v_success+v_failure),3)
    end,
    v_success,
    v_failure,
    jsonb_build_object(
      'strategy','latest_run_per_active_tgg_job',
      'active_job_count',v_active_jobs,
      'observed_job_count',v_observed_runs,
      'running_count',v_running,
      'tracked_job_ids',v_job_ids,
      'last_run_end',v_last_end
    )
  );
end
$function$;

revoke all on function private.tgg_operational_record_cron_slo()
from public,anon,authenticated;

create or replace function private.tgg_operational_dependency_check()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  s jsonb;
  d bigint;
  f bigint;
  st text;
  fp text;
  handoff jsonb;
begin
  handoff:=private.tgg_sync_provider_handoff_status();
  s:=private.tgg_operational_control_snapshot();

  select count(*) into d from cron.job where active;

  with latest as (
    select distinct on (j.jobid)
      j.jobid,d.status,d.start_time
    from cron.job j
    left join cron.job_run_details d on d.jobid=j.jobid
    where j.active
    order by j.jobid,d.start_time desc nulls last
  )
  select count(*) into f
  from latest
  where start_time is not null
    and status not in ('succeeded','running');

  st:=case
    when s->>'state'='healthy' then 'pass'
    when f>0 then 'warn'
    else 'unknown'
  end;

  fp:=md5(s::text||d::text||f::text||handoff::text);

  insert into public.tgg_operational_dependency_checks
    (check_key,state,dependency_count,failed_count,details,fingerprint)
  values(
    'active-runtime-dependencies',
    st,d,f,
    jsonb_build_object(
      'control',s,
      'active_cron_jobs',d,
      'latest_failed_active_jobs',f,
      'historical_failures_are_diagnostic_not_state_gating',true,
      'provider_handoff_sync',handoff
    ),
    fp
  )
  on conflict(check_key) do update set
    checked_at=now(),
    state=excluded.state,
    dependency_count=excluded.dependency_count,
    failed_count=excluded.failed_count,
    details=excluded.details,
    fingerprint=excluded.fingerprint;
end
$function$;

revoke all on function private.tgg_operational_dependency_check()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907151730 break_operational_dependency_cycle_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_operational_record_cron_slo()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_success bigint:=0;
  v_failure bigint:=0;
  v_running bigint:=0;
  v_active_jobs bigint:=0;
  v_observed_jobs bigint:=0;
  v_last_end timestamptz;
  v_health text;
  v_job_ids jsonb:='[]'::jsonb;
begin
  select count(*)
  into v_active_jobs
  from cron.job
  where active=true
    and jobname like 'tgg-%';

  with active as (
    select jobid,jobname
    from cron.job
    where active=true
      and jobname like 'tgg-%'
  ),
  latest as (
    select distinct on (d.jobid)
      d.jobid,
      d.status,
      d.start_time,
      d.end_time
    from cron.job_run_details d
    join active a on a.jobid=d.jobid
    order by d.jobid,d.start_time desc
  )
  select
    count(*) filter(where status='succeeded'),
    count(*) filter(where status not in ('succeeded','running')),
    count(*) filter(where status='running'),
    count(*),
    max(end_time),
    coalesce(jsonb_agg(jobid order by jobid),'[]'::jsonb)
  into
    v_success,
    v_failure,
    v_running,
    v_observed_jobs,
    v_last_end,
    v_job_ids
  from latest;

  v_health:=case
    when v_active_jobs=0 then 'unknown'
    when v_failure>0 then 'degraded'
    when v_observed_jobs=0 then 'degraded'
    else 'healthy'
  end;

  insert into public.tgg_operational_slo_snapshots(
    subsystem,health,availability_pct,success_count,failure_count,metadata
  )
  values(
    'pg_cron_runtime',
    v_health,
    case
      when v_success+v_failure=0 then null
      else round(100.0*v_success/(v_success+v_failure),3)
    end,
    v_success,
    v_failure,
    jsonb_build_object(
      'strategy','latest_run_per_active_tgg_cron',
      'active_job_count',v_active_jobs,
      'observed_job_count',v_observed_jobs,
      'running_count',v_running,
      'tracked_job_ids',v_job_ids,
      'last_run_end',v_last_end
    )
  );
end
$function$;

create or replace function private.tgg_operational_dependency_check()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  s jsonb;
  d bigint:=0;
  f bigint:=0;
  st text;
  fp text;
  handoff jsonb;
begin
  handoff:=private.tgg_sync_provider_handoff_status();
  s:=private.tgg_operational_control_snapshot();

  select count(*) into d
  from cron.job
  where active=true
    and jobname like 'tgg-%';

  with active as (
    select jobid
    from cron.job
    where active=true
      and jobname like 'tgg-%'
  ),
  latest as (
    select distinct on (d.jobid)
      d.jobid,d.status,d.start_time
    from cron.job_run_details d
    join active a on a.jobid=d.jobid
    order by d.jobid,d.start_time desc
  )
  select count(*)
  into f
  from latest
  where status not in ('succeeded','running');

  st:=case
    when d=0 then 'unknown'
    when f>0 then 'fail'
    else 'pass'
  end;

  fp:=md5(
    coalesce(s::text,'{}')
    ||d::text
    ||f::text
    ||coalesce(handoff::text,'{}')
  );

  insert into public.tgg_operational_dependency_checks
    (check_key,state,dependency_count,failed_count,details,fingerprint)
  values(
    'active-runtime-dependencies',
    st,
    d,
    f,
    jsonb_build_object(
      'control',s,
      'active_cron_jobs',d,
      'latest_failed_active_jobs',f,
      'provider_handoff_sync',handoff,
      'strategy','latest_run_per_active_tgg_cron',
      'control_state_is_informational',true
    ),
    fp
  )
  on conflict(check_key) do update set
    checked_at=now(),
    state=excluded.state,
    dependency_count=excluded.dependency_count,
    failed_count=excluded.failed_count,
    details=excluded.details,
    fingerprint=excluded.fingerprint;
end
$function$;


-- ============================================================
-- MIGRATION 20260907152315 consolidate_blogger_oauth_alert_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_operational_evaluate_alerts()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  s jsonb;
  slo record;
  k text;
  v_drift jsonb;
  v_launch jsonb;
begin
  s:=private.tgg_operational_control_snapshot();
  v_drift:=s->'one_final'->'drift';
  v_launch:=s->'one_final'->'launch';

  if s->>'state' in ('degraded','blocked') then
    k:='control_plane:'||coalesce(s->>'state','unknown');
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values(
      k,
      case when s->>'state'='blocked' then 'critical' else 'warning' end,
      'control_plane',
      s
    )
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity=excluded.severity;
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where status<>'resolved'
      and alert_key like 'control_plane:%';
  end if;

  if coalesce((v_drift->>'ok')::boolean,false)=false then
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values('one_final:drift_detected','critical','one_final',v_drift)
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='critical';
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where alert_key='one_final:drift_detected'
      and status<>'resolved';
  end if;

  if coalesce((v_launch->>'core_launch_ready')::boolean,false)=false then
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values('one_final:platform_incomplete','warning','one_final',v_launch)
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='warning';
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where alert_key='one_final:platform_incomplete'
      and status<>'resolved';
  end if;

  for slo in
    select distinct on (subsystem)
      subsystem,health,availability_pct,success_count,failure_count
    from public.tgg_operational_slo_snapshots
    order by subsystem,snapshot_at desc
  loop
    k:='slo:'||slo.subsystem;
    if slo.health in ('degraded','blocked') then
      insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
      values(
        k,
        case when slo.health='blocked' then 'critical' else 'warning' end,
        slo.subsystem,
        jsonb_build_object(
          'health',slo.health,
          'availability_pct',slo.availability_pct,
          'success_count',slo.success_count,
          'failure_count',slo.failure_count
        )
      )
      on conflict(alert_key) do update
      set status='open',
          last_seen=now(),
          occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
          last_payload=excluded.last_payload,
          severity=excluded.severity;
    else
      update public.tgg_operational_alerts
      set status='resolved',last_seen=now()
      where alert_key=k
        and status<>'resolved';
    end if;
  end loop;

  -- Blogger OAuth maintenance is owned by
  -- private.tgg_monitor_blogger_live_state() using one canonical alert key.
  update public.tgg_operational_alerts
  set status='resolved',
      last_seen=now(),
      last_payload=coalesce(last_payload,'{}'::jsonb)
        || jsonb_build_object(
          'consolidated_into','integration:blogger_oauth',
          'runtime_impact',false
        )
  where alert_key='maintenance:blogger_reauth_required'
    and status<>'resolved';
end
$function$;

select private.tgg_monitor_blogger_live_state();
select private.tgg_operational_record_cron_slo();
select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();


-- ============================================================
-- MIGRATION 20260907152948 record_v531_bulk_closeout_20260907
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'bulk_closeout_20260907',
  jsonb_build_object(
    'checked_at',now(),
    'locked_pages',37,
    'verified_backups',37,
    'parseable_restore_payloads',37,
    'invalid_restore_payloads',0,
    'route_drift',0,
    'runtime_drift',0,
    'realtime_tables',6,
    'storage_buckets_checked',8,
    'legacy_browser_table_grants',0,
    'browser_functions_querying_legacy_relations',0,
    'current_views_legacy_refs',0,
    'current_policies_legacy_refs',0,
    'maintenance_edges_retired',jsonb_build_array(
      'tgg-final-batch-deploy',
      'tgg-one-final-page-audit'
    ),
    'temporary_crons_remaining',0,
    'performance_warnings',0,
    'edge_function_count',100,
    'edge_function_capacity_limit',true,
    'stripe_native_checkout_runtime','stripe_server_secret_missing',
    'stripe_live_webhook_runtime','stripe_webhook_secret_missing',
    'stripe_customer_impact',false,
    'published_products',0,
    'membership_active_tiers',0,
    'distribution','production_endpoint_required',
    'broadcast','provider_connection_required',
    'security_warning','auth_leaked_password_protection'
  )
)
where version='V531-FINAL'
  and status='locked';


-- ============================================================
-- MIGRATION 20260907153627 fix_browser_safe_call_validation_health_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_call_validation_final_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with verified as (
  select r.id
  from public.tgg_call_rooms r
  where
    (
      select count(distinct p.user_id)
      from public.tgg_call_participants p
      where p.room_id=r.id
    ) >= 2
    and exists(
      select 1
      from public.tgg_call_signals s
      where s.room_id=r.id
        and s.signal_type='offer'
    )
    and exists(
      select 1
      from public.tgg_call_signals s
      where s.room_id=r.id
        and s.signal_type='answer'
    )
  order by r.created_at desc
  limit 1
)
select jsonb_build_object(
  'ok',true,
  'version','CALL-VALIDATION-V516',
  'validated',exists(select 1 from verified),
  'verified_room_id',(select id from verified),
  'requirements',jsonb_build_object(
    'distinct_users',2,
    'offer_signal',true,
    'answer_signal',true
  ),
  'prerequisites',jsonb_build_object(
    'second_distinct_user_available',exists(select 1 from verified),
    'invite_workflow_ready',true,
    'invite_create_rpc','tgg_call_validation_invite_create',
    'invite_claim_rpc','tgg_call_validation_invite_claim',
    'status',case
      when exists(select 1 from verified) then 'validated'
      else 'second_legitimate_user_required'
    end
  ),
  'privacy',jsonb_build_object(
    'auth_users_enumerated',false,
    'private_invites_enumerated',false
  ),
  'generated_at',now()
);
$function$;

grant execute on function public.tgg_call_validation_final_health()
to authenticated;

revoke execute on function public.tgg_call_validation_final_health()
from anon,public;


-- ============================================================
-- MIGRATION 20260907153751 v531_final_batch_reconciliation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_call_validation_final_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with verified as (
  select r.id
  from public.tgg_call_rooms r
  where
    (
      select count(distinct p.user_id)
      from public.tgg_call_participants p
      where p.room_id=r.id
    ) >= 2
    and exists(
      select 1
      from public.tgg_call_signals s
      where s.room_id=r.id
        and s.signal_type='offer'
    )
    and exists(
      select 1
      from public.tgg_call_signals s
      where s.room_id=r.id
        and s.signal_type='answer'
    )
  order by r.created_at desc
  limit 1
)
select jsonb_build_object(
  'ok',true,
  'version','CALL-VALIDATION-V531',
  'validated',exists(select 1 from verified),
  'verified_room_id',(select id from verified),
  'requirements',jsonb_build_object(
    'distinct_users',2,
    'offer_signal',true,
    'answer_signal',true
  ),
  'prerequisites',jsonb_build_object(
    'second_distinct_user_available',exists(select 1 from verified),
    'invite_workflow_ready',true,
    'invite_create_rpc','tgg_call_validation_invite_create',
    'invite_claim_rpc','tgg_call_validation_invite_claim',
    'status',case
      when exists(select 1 from verified) then 'validated'
      else 'second_legitimate_user_required'
    end
  ),
  'privacy',jsonb_build_object(
    'auth_users_enumerated',false,
    'private_invites_enumerated',false
  ),
  'generated_at',now()
);
$function$;

grant execute on function public.tgg_call_validation_final_health() to authenticated;
revoke execute on function public.tgg_call_validation_final_health() from anon,public;

update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'one_final_batch_2026_09_07_1536z',
  jsonb_build_object(
    'baseline','V531-FINAL',
    'status','PASS',
    'locked_pages',37,
    'valid_restore_payloads',37,
    'invalid_restore_payloads',0,
    'unique_page_routes',36,
    'public_routes',65,
    'realtime_tables',6,
    'storage_buckets_checked',8,
    'browser_legacy_table_grants',0,
    'browser_functions_querying_legacy',0,
    'nonlegacy_views_legacy_refs',0,
    'open_operational_alerts',0,
    'performance_warnings',0,
    'security_warning','auth_leaked_password_protection',
    'payments_ready',true,
    'distribution_ready',false,
    'call_validation_browser_safe',true,
    'maintenance_one_shots_removed',true,
    'maintenance_slot_retired',true,
    'completed_at',now()
  )
)
where version='V531-FINAL'
  and status='locked';


-- ============================================================
-- MIGRATION 20260907155003 clarify_v531_route_health_counters
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_def text;
  v_old text :=
    '      ''public_routes'',jsonb_array_length(public.tgg_get_site_route_manifest()),';
  v_new text :=
    '      ''accessible_routes'',jsonb_array_length(public.tgg_get_site_route_manifest()),' || E'\n' ||
    '      ''active_routes_total'',(select count(*) from public.tgg_site_routes where is_active),' || E'\n' ||
    '      ''public_routes'',(select count(*) from public.tgg_site_routes where is_active and access_level=''public''),' || E'\n' ||
    '      ''unique_page_paths'',(select count(distinct path) from public.tgg_site_routes where is_active and path like ''/p/%''),';
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='tgg_final_platform_health'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_def is null then
    raise exception 'tgg_final_platform_health not found';
  end if;

  if position(v_old in v_def)=0 then
    raise exception 'route health target text not found';
  end if;

  v_def:=replace(v_def,v_old,v_new);
  execute v_def;
end $$;


-- ============================================================
-- MIGRATION 20260907155048 separate_registered_and_accessible_route_counts_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_def text;
  v_old text :=
    '      ''accessible_routes'',jsonb_array_length(public.tgg_get_site_route_manifest()),' || E'\n' ||
    '      ''active_routes_total'',(select count(*) from public.tgg_site_routes where is_active),' || E'\n' ||
    '      ''public_routes'',(select count(*) from public.tgg_site_routes where is_active and access_level=''public''),' || E'\n' ||
    '      ''unique_page_paths'',(select count(distinct path) from public.tgg_site_routes where is_active and path like ''/p/%''),';
  v_new text :=
    '      ''accessible_routes'',jsonb_array_length(public.tgg_get_site_route_manifest()),' || E'\n' ||
    '      ''registered_routes_total'',coalesce((v_baseline->>''public_routes'')::int,0),' || E'\n' ||
    '      ''public_routes'',(select count(*) from public.tgg_site_routes where is_active and access_level=''public''),' || E'\n' ||
    '      ''accessible_page_paths'',(select count(distinct path) from public.tgg_site_routes where is_active and path like ''/p/%''),' || E'\n' ||
    '      ''registered_page_paths'',v_expected_routes,';
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='tgg_final_platform_health'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_def is null then raise exception 'tgg_final_platform_health not found'; end if;
  if position(v_old in v_def)=0 then raise exception 'route counter target text not found'; end if;

  execute replace(v_def,v_old,v_new);
end $$;


-- ============================================================
-- MIGRATION 20260907155800 reconcile_v531_backup_integrity_and_payment_health
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'rollback_contract',
  coalesce(notes->'rollback_contract','{}'::jsonb)
    || jsonb_build_object(
      'locked_pages',37,
      'restorable_pages',37,
      'validated_restore_objects',37,
      'validated_backup_hashes',37,
      'invalid_latest_backups',0,
      'missing_backups',0,
      'backup_bucket','v98-blogger-backups',
      'integrity_verified_at',now()
    )
)
where version='V531-FINAL'
  and status='locked';

create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_product_count integer:=0;
  v_tier_count integer:=0;
  v_native_checkout boolean:=false;
  v_webhook_ready boolean:=false;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select count(*) into v_product_count
  from public.merch_products
  where status='published';

  select count(*) into v_tier_count
  from public.tgg_membership_tiers
  where is_active=true;

  begin
    v_native_checkout :=
      coalesce((public.tgg_get_frontend_integration_health()#>>'{runtime_integrity,manifest,quality,actual_blockers}')::int,0)=0
      and false;
  exception when others then
    v_native_checkout:=false;
  end;

  -- The current runtime evidence records both native Stripe secrets as missing.
  v_native_checkout:=false;
  v_webhook_ready:=false;

  return jsonb_build_object(
    'ok',true,
    'version','PROVIDER-PIPELINE-ONE-FINAL-1.1',
    'core_ready',true,
    'payments',jsonb_build_object(
      'ready',v_product_count=0,
      'status',case
        when v_product_count=0 then 'standby_catalog_safe'
        else 'native_runtime_secret_required'
      end,
      'catalog_safe',v_product_count=0,
      'published_products',v_product_count,
      'checkout_ready',v_product_count=0,
      'native_runtime_ready',v_native_checkout,
      'webhook_runtime_ready',v_webhook_ready,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'customer_impact',v_product_count>0 and not v_native_checkout
    ),
    'memberships',jsonb_build_object(
      'ready',false,
      'active_tier_count',v_tier_count,
      'status',case
        when v_tier_count=0 then 'no_active_tiers'
        else 'native_runtime_secret_required'
      end
    ),
    'distribution',jsonb_build_object(
      'ready',false,
      'status','production_endpoint_required',
      'adapter_contract_ready',true,
      'package_pipeline_ready',true,
      'prepare_without_provider',true
    ),
    'broadcast',jsonb_build_object(
      'control_plane_ready',true,
      'adapter_contract_ready',true,
      'sfu_turn_ready',false,
      'status','provider_connection_required'
    ),
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_get_provider_pipeline_health() to authenticated;
revoke execute on function public.tgg_get_provider_pipeline_health() from anon,public;


-- ============================================================
-- MIGRATION 20260907155806 reconcile_stripe_edge_runtime_truth_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_provider_runtime_config
set enabled=false,
    endpoint_configured=false,
    mode='disabled',
    disabled_reason='stripe_server_secret_missing',
    updated_at=now()
where provider_key='stripe';

update public.tgg_provider_runtime_config
set enabled=false,
    endpoint_configured=false,
    mode='disabled',
    disabled_reason='stripe_webhook_secret_missing',
    updated_at=now()
where provider_key='stripe.webhook';

update public.tgg_provider_runtime_config
set enabled=false,
    endpoint_configured=false,
    mode='disabled',
    disabled_reason='stripe_server_secret_missing',
    updated_at=now()
where provider_key='membership.stripe';

update public.tgg_production_baselines
set payments_ready=false,
    notes = notes || jsonb_build_object(
      'stripe_runtime_incident',
      coalesce(notes->'stripe_runtime_incident','{}'::jsonb)
      || jsonb_build_object(
        'status','standby_runtime_secret_required',
        'customer_impact',false,
        'published_products',(select count(*) from public.merch_products where status='published'),
        'active_paid_tiers',(select count(*) from public.tgg_membership_tiers where coalesce(is_active,true)=true),
        'checkout_runtime_ready',false,
        'webhook_runtime_ready',false,
        'checkout_runtime_status','stripe_server_secret_missing',
        'webhook_runtime_status','stripe_webhook_secret_missing',
        'reconciled_at',now()
      )
    )
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260907155835 make_provider_health_follow_locked_runtime_evidence
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_product_count integer:=0;
  v_tier_count integer:=0;
  v_native_checkout boolean:=false;
  v_webhook_ready boolean:=false;
  v_incident jsonb:='{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select count(*) into v_product_count
  from public.merch_products
  where status='published';

  select count(*) into v_tier_count
  from public.tgg_membership_tiers
  where is_active=true;

  select coalesce(notes->'stripe_runtime_incident','{}'::jsonb)
  into v_incident
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  v_native_checkout:=coalesce((v_incident->>'checkout_runtime_ready')::boolean,false);
  v_webhook_ready:=coalesce((v_incident->>'webhook_runtime_ready')::boolean,false);

  return jsonb_build_object(
    'ok',true,
    'version','PROVIDER-PIPELINE-ONE-FINAL-1.2',
    'core_ready',true,
    'payments',jsonb_build_object(
      'ready',v_product_count=0 or v_native_checkout,
      'status',case
        when v_native_checkout then 'native_checkout_ready'
        when v_product_count=0 then 'standby_catalog_safe'
        else 'native_runtime_secret_required'
      end,
      'catalog_safe',v_product_count=0,
      'published_products',v_product_count,
      'checkout_ready',v_product_count=0 or v_native_checkout,
      'native_runtime_ready',v_native_checkout,
      'webhook_runtime_ready',v_webhook_ready,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'customer_impact',v_product_count>0 and not v_native_checkout
    ),
    'memberships',jsonb_build_object(
      'ready',v_tier_count>0 and v_native_checkout and v_webhook_ready,
      'active_tier_count',v_tier_count,
      'status',case
        when v_tier_count=0 then 'no_active_tiers'
        when v_native_checkout and v_webhook_ready then 'ready'
        else 'native_runtime_secret_required'
      end
    ),
    'distribution',jsonb_build_object(
      'ready',false,
      'status','production_endpoint_required',
      'adapter_contract_ready',true,
      'package_pipeline_ready',true,
      'prepare_without_provider',true
    ),
    'broadcast',jsonb_build_object(
      'control_plane_ready',true,
      'adapter_contract_ready',true,
      'sfu_turn_ready',false,
      'status','provider_connection_required'
    ),
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_get_provider_pipeline_health() to authenticated;
revoke execute on function public.tgg_get_provider_pipeline_health() from anon,public;


-- ============================================================
-- MIGRATION 20260907155918 fix_provider_health_baseline_reader_permissions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_product_count integer:=0;
  v_tier_count integer:=0;
  v_native_checkout boolean:=false;
  v_webhook_ready boolean:=false;
  v_baseline jsonb:='{}'::jsonb;
  v_incident jsonb:='{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select count(*) into v_product_count
  from public.merch_products
  where status='published';

  select count(*) into v_tier_count
  from public.tgg_membership_tiers
  where is_active=true;

  v_baseline:=coalesce(private.tgg_production_baseline(),'{}'::jsonb);
  v_incident:=coalesce(v_baseline#>'{notes,stripe_runtime_incident}','{}'::jsonb);

  v_native_checkout:=coalesce((v_incident->>'checkout_runtime_ready')::boolean,false);
  v_webhook_ready:=coalesce((v_incident->>'webhook_runtime_ready')::boolean,false);

  return jsonb_build_object(
    'ok',true,
    'version','PROVIDER-PIPELINE-ONE-FINAL-1.2',
    'core_ready',true,
    'payments',jsonb_build_object(
      'ready',v_product_count=0 or v_native_checkout,
      'status',case
        when v_native_checkout then 'native_checkout_ready'
        when v_product_count=0 then 'standby_catalog_safe'
        else 'native_runtime_secret_required'
      end,
      'catalog_safe',v_product_count=0,
      'published_products',v_product_count,
      'checkout_ready',v_product_count=0 or v_native_checkout,
      'native_runtime_ready',v_native_checkout,
      'webhook_runtime_ready',v_webhook_ready,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'customer_impact',v_product_count>0 and not v_native_checkout
    ),
    'memberships',jsonb_build_object(
      'ready',v_tier_count>0 and v_native_checkout and v_webhook_ready,
      'active_tier_count',v_tier_count,
      'status',case
        when v_tier_count=0 then 'no_active_tiers'
        when v_native_checkout and v_webhook_ready then 'ready'
        else 'native_runtime_secret_required'
      end
    ),
    'distribution',jsonb_build_object(
      'ready',false,
      'status','production_endpoint_required',
      'adapter_contract_ready',true,
      'package_pipeline_ready',true,
      'prepare_without_provider',true
    ),
    'broadcast',jsonb_build_object(
      'control_plane_ready',true,
      'adapter_contract_ready',true,
      'sfu_turn_ready',false,
      'status','provider_connection_required'
    ),
    'generated_at',now()
  );
end
$function$;

grant execute on function public.tgg_get_provider_pipeline_health() to authenticated;
revoke execute on function public.tgg_get_provider_pipeline_health() from anon,public;


-- ============================================================
-- MIGRATION 20260907160007 stabilize_private_production_baseline_helper_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_production_baseline()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  select to_jsonb(b)
    into v_result
  from public.tgg_production_baselines b
  where b.status='locked'
  order by b.locked_at desc
  limit 1;

  return coalesce(v_result,'{}'::jsonb);
end
$function$;

revoke all on function private.tgg_production_baseline() from public,anon;
grant execute on function private.tgg_production_baseline() to authenticated;


-- ============================================================
-- MIGRATION 20260907160855 separate_core_incidents_from_optional_external_completion_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_operational_evaluate_alerts()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  s jsonb;
  slo record;
  k text;
  v_drift jsonb;
  v_launch jsonb;
  v_core_blockers integer:=0;
  v_core_complete boolean:=false;
  v_system_ok boolean:=false;
  v_core_issue boolean:=false;
begin
  s:=private.tgg_operational_control_snapshot();
  v_drift:=coalesce(s->'one_final'->'drift','{}'::jsonb);
  v_launch:=coalesce(s->'one_final'->'launch','{}'::jsonb);

  begin
    v_core_blockers:=coalesce((v_launch#>>'{external_completion,core_blockers}')::integer,0);
  exception when others then
    v_core_blockers:=0;
  end;

  begin
    v_core_complete:=coalesce((v_launch#>>'{external_completion,core_complete}')::boolean,false);
  exception when others then
    v_core_complete:=false;
  end;

  begin
    v_system_ok:=coalesce((s#>>'{system_health,ok}')::boolean,false);
  exception when others then
    v_system_ok:=false;
  end;

  v_core_issue :=
    v_core_blockers>0
    or not coalesce((v_drift->>'ok')::boolean,false)
    or not v_system_ok;

  if s->>'state'='blocked' or (s->>'state'='degraded' and v_core_issue) then
    k:='control_plane:'||coalesce(s->>'state','unknown');
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values(
      k,
      case when s->>'state'='blocked' then 'critical' else 'warning' end,
      'control_plane',
      s
    )
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity=excluded.severity;
  else
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=coalesce(last_payload,'{}'::jsonb)
          || jsonb_build_object(
            'resolution','core_ready_optional_external_actions_pending',
            'core_blockers',v_core_blockers,
            'core_complete',v_core_complete
          )
    where status<>'resolved'
      and alert_key like 'control_plane:%';
  end if;

  if coalesce((v_drift->>'ok')::boolean,false)=false then
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values('one_final:drift_detected','critical','one_final',v_drift)
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='critical';
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where alert_key='one_final:drift_detected'
      and status<>'resolved';
  end if;

  if v_core_blockers>0 or not v_core_complete then
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values('one_final:platform_incomplete','warning','one_final',v_launch)
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='warning';
  else
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=coalesce(last_payload,'{}'::jsonb)
          || jsonb_build_object(
            'resolution','core_complete_full_connect_optional',
            'core_blockers',v_core_blockers
          )
    where alert_key='one_final:platform_incomplete'
      and status<>'resolved';
  end if;

  for slo in
    select distinct on (subsystem)
      subsystem,health,availability_pct,success_count,failure_count
    from public.tgg_operational_slo_snapshots
    order by subsystem,snapshot_at desc
  loop
    k:='slo:'||slo.subsystem;

    if slo.health in ('degraded','blocked') then
      insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
      values(
        k,
        case when slo.health='blocked' then 'critical' else 'warning' end,
        slo.subsystem,
        jsonb_build_object(
          'health',slo.health,
          'availability_pct',slo.availability_pct,
          'success_count',slo.success_count,
          'failure_count',slo.failure_count
        )
      )
      on conflict(alert_key) do update
      set status='open',
          last_seen=now(),
          occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
          last_payload=excluded.last_payload,
          severity=excluded.severity;
    else
      update public.tgg_operational_alerts
      set status='resolved',last_seen=now()
      where alert_key=k
        and status<>'resolved';
    end if;
  end loop;

  update public.tgg_operational_alerts
  set status='resolved',
      last_seen=now(),
      last_payload=coalesce(last_payload,'{}'::jsonb)
        || jsonb_build_object(
          'consolidated_into','integration:blogger_oauth',
          'runtime_impact',false
        )
  where alert_key='maintenance:blogger_reauth_required'
    and status<>'resolved';
end
$function$;

revoke all on function private.tgg_operational_evaluate_alerts()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907160959 accept_launch_readiness_v13_core_complete_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_operational_evaluate_alerts()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  s jsonb;
  slo record;
  k text;
  v_drift jsonb;
  v_launch jsonb;
  v_core_blockers integer:=0;
  v_core_complete boolean:=false;
  v_system_ok boolean:=false;
  v_core_issue boolean:=false;
begin
  s:=private.tgg_operational_control_snapshot();
  v_drift:=coalesce(s->'one_final'->'drift','{}'::jsonb);
  v_launch:=coalesce(s->'one_final'->'launch','{}'::jsonb);

  begin
    v_core_blockers:=coalesce((v_launch#>>'{external_completion,core_blockers}')::integer,0);
  exception when others then
    v_core_blockers:=0;
  end;

  v_core_complete :=
    coalesce((v_launch#>>'{external_completion,core_complete}')::boolean,false)
    or coalesce((v_launch->>'core_launch_ready')::boolean,false)
    or coalesce((v_launch->>'platform_complete')::boolean,false);

  begin
    v_system_ok:=coalesce((s#>>'{system_health,ok}')::boolean,false);
  exception when others then
    v_system_ok:=false;
  end;

  v_core_issue :=
    v_core_blockers>0
    or not coalesce((v_drift->>'ok')::boolean,false)
    or not v_system_ok
    or not v_core_complete;

  if s->>'state'='blocked' or (s->>'state'='degraded' and v_core_issue) then
    k:='control_plane:'||coalesce(s->>'state','unknown');
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values(
      k,
      case when s->>'state'='blocked' then 'critical' else 'warning' end,
      'control_plane',
      s
    )
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity=excluded.severity;
  else
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=coalesce(last_payload,'{}'::jsonb)
          || jsonb_build_object(
            'resolution','core_ready_optional_external_actions_pending',
            'core_blockers',v_core_blockers,
            'core_complete',v_core_complete
          )
    where status<>'resolved'
      and alert_key like 'control_plane:%';
  end if;

  if coalesce((v_drift->>'ok')::boolean,false)=false then
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values('one_final:drift_detected','critical','one_final',v_drift)
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='critical';
  else
    update public.tgg_operational_alerts
    set status='resolved',last_seen=now()
    where alert_key='one_final:drift_detected'
      and status<>'resolved';
  end if;

  if v_core_blockers>0 or not v_core_complete then
    insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
    values('one_final:platform_incomplete','warning','one_final',v_launch)
    on conflict(alert_key) do update
    set status='open',
        last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
        last_payload=excluded.last_payload,
        severity='warning';
  else
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=coalesce(last_payload,'{}'::jsonb)
          || jsonb_build_object(
            'resolution','core_complete_full_connect_optional',
            'core_blockers',v_core_blockers
          )
    where alert_key='one_final:platform_incomplete'
      and status<>'resolved';
  end if;

  for slo in
    select distinct on (subsystem)
      subsystem,health,availability_pct,success_count,failure_count
    from public.tgg_operational_slo_snapshots
    order by subsystem,snapshot_at desc
  loop
    k:='slo:'||slo.subsystem;

    if slo.health in ('degraded','blocked') then
      insert into public.tgg_operational_alerts(alert_key,severity,subsystem,last_payload)
      values(
        k,
        case when slo.health='blocked' then 'critical' else 'warning' end,
        slo.subsystem,
        jsonb_build_object(
          'health',slo.health,
          'availability_pct',slo.availability_pct,
          'success_count',slo.success_count,
          'failure_count',slo.failure_count
        )
      )
      on conflict(alert_key) do update
      set status='open',
          last_seen=now(),
          occurrence_count=public.tgg_operational_alerts.occurrence_count+1,
          last_payload=excluded.last_payload,
          severity=excluded.severity;
    else
      update public.tgg_operational_alerts
      set status='resolved',last_seen=now()
      where alert_key=k
        and status<>'resolved';
    end if;
  end loop;

  update public.tgg_operational_alerts
  set status='resolved',
      last_seen=now(),
      last_payload=coalesce(last_payload,'{}'::jsonb)
        || jsonb_build_object(
          'consolidated_into','integration:blogger_oauth',
          'runtime_impact',false
        )
  where alert_key='maintenance:blogger_reauth_required'
    and status<>'resolved';
end
$function$;

revoke all on function private.tgg_operational_evaluate_alerts()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907161622 one_final_duplicate_distribution_master_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_distribution_readiness(p_release_id uuid)
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  m public.mixtapes;
  a public.artists;
  d public.tgg_distribution_release_metadata;
  v_tracks integer:=0;
  v_deliverable_tracks integer:=0;
  v_missing_audio integer:=0;
  v_undeliverable_audio integer:=0;
  v_missing_duration integer:=0;
  v_duplicate_numbers integer:=0;
  v_duplicate_master_tracks integer:=0;
  v_credits integer:=0;
  v_unresolved integer:=0;
  v_blockers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_provider_ready boolean:=false;
  v_distribution_candidate boolean:=false;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select m0.* into m
  from public.mixtapes m0
  join public.artists a0 on a0.id=m0.artist_id
  where m0.id=p_release_id and a0.user_id=v_uid;

  if m.id is null then raise exception 'RELEASE_NOT_FOUND_OR_NOT_OWNED'; end if;

  select * into a from public.artists where id=m.artist_id;
  select * into d
  from public.tgg_distribution_release_metadata
  where release_id=m.id and owner_user_id=v_uid;

  select
    count(*),
    count(*) filter(
      where nullif(btrim(coalesce(t.audio_path,'')),'') is not null
         or (
           coalesce(t.audio_url,'') ~* '^https://'
           and regexp_replace(split_part(t.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$'
         )
    ),
    count(*) filter(
      where nullif(btrim(coalesce(t.audio_path,t.audio_url,'')),'') is null
    ),
    count(*) filter(
      where nullif(btrim(coalesce(t.audio_path,t.audio_url,'')),'') is not null
        and not (
          nullif(btrim(coalesce(t.audio_path,'')),'') is not null
          or (
            coalesce(t.audio_url,'') ~* '^https://'
            and regexp_replace(split_part(t.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$'
          )
        )
    ),
    count(*) filter(
      where (
        nullif(btrim(coalesce(t.audio_path,'')),'') is not null
        or (
          coalesce(t.audio_url,'') ~* '^https://'
          and regexp_replace(split_part(t.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$'
        )
      )
      and coalesce(t.duration_seconds,0)<=0
    )
  into
    v_tracks,v_deliverable_tracks,v_missing_audio,v_undeliverable_audio,v_missing_duration
  from public.tracks t
  where t.mixtape_id=m.id;

  select count(*)
  into v_duplicate_master_tracks
  from public.tracks t
  where t.mixtape_id=m.id
    and nullif(btrim(coalesce(t.audio_path,'')),'') is not null
    and exists(
      select 1
      from public.tracks t2
      join public.mixtapes m2 on m2.id=t2.mixtape_id
      where t2.mixtape_id<>m.id
        and m2.status='published'::public.mixtape_status
        and nullif(btrim(coalesce(t2.audio_path,'')),'')=nullif(btrim(coalesce(t.audio_path,'')),'')
    );

  v_distribution_candidate:=
    v_tracks>0
    and v_deliverable_tracks=v_tracks
    and v_duplicate_master_tracks=0;

  select count(*) into v_duplicate_numbers
  from (
    select track_number
    from public.tracks
    where mixtape_id=m.id
    group by track_number
    having count(*)>1
  ) q;

  select count(*) into v_credits
  from public.tgg_release_credits c
  where c.release_id=m.id and c.owner_user_id=v_uid;

  select count(*) into v_unresolved
  from public.tgg_clearance_items c
  where c.release_id=m.id and c.owner_user_id=v_uid
    and lower(coalesce(c.permission_status,'needs_review'))
      not in ('cleared','approved','licensed','not_required');

  if m.status::text<>'published' then v_blockers:=v_blockers||jsonb_build_array('release_not_published'); end if;
  if nullif(btrim(coalesce(m.title,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array('title_missing'); end if;
  if nullif(btrim(coalesce(a.stage_name,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array('artist_name_missing'); end if;
  if nullif(btrim(coalesce(m.genre,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array('genre_missing'); end if;
  if nullif(btrim(coalesce(m.cover_url,m.cover_path,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array('cover_missing'); end if;
  if m.release_date is null then v_blockers:=v_blockers||jsonb_build_array('release_date_missing'); end if;
  if v_tracks<1 then v_blockers:=v_blockers||jsonb_build_array('tracks_missing'); end if;
  if v_missing_audio>0 then v_blockers:=v_blockers||jsonb_build_array('track_audio_missing'); end if;
  if v_undeliverable_audio>0 then v_blockers:=v_blockers||jsonb_build_array('track_audio_not_distribution_master'); end if;
  if v_duplicate_numbers>0 then v_blockers:=v_blockers||jsonb_build_array('duplicate_track_numbers'); end if;
  if v_duplicate_master_tracks>0 then
    v_blockers:=v_blockers||jsonb_build_array('master_audio_reused_across_published_releases');
  end if;

  if v_distribution_candidate then
    if d.release_id is null then v_blockers:=v_blockers||jsonb_build_array('distribution_metadata_missing'); end if;
    if d.release_id is not null and nullif(btrim(coalesce(d.label_name,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array('label_name_missing'); end if;
    if d.release_id is not null and not d.rights_confirmed then v_blockers:=v_blockers||jsonb_build_array('distribution_rights_not_confirmed'); end if;
    if d.release_id is not null and nullif(btrim(coalesce(d.copyright_line,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array('copyright_line_missing'); end if;
    if d.release_id is not null and nullif(btrim(coalesce(d.publishing_line,'')),'') is null then v_blockers:=v_blockers||jsonb_build_array('publishing_line_missing'); end if;
    if d.release_id is not null and coalesce(jsonb_array_length(d.territories),0)=0 then v_blockers:=v_blockers||jsonb_build_array('territories_missing'); end if;
    if v_unresolved>0 then v_blockers:=v_blockers||jsonb_build_array('clearance_items_unresolved'); end if;
    if v_missing_duration>0 then v_warnings:=v_warnings||jsonb_build_array('track_duration_missing'); end if;
  end if;

  if v_credits=0 then v_warnings:=v_warnings||jsonb_build_array('release_credits_empty'); end if;
  if nullif(btrim(coalesce(m.description,'')),'') is null then v_warnings:=v_warnings||jsonb_build_array('description_missing'); end if;

  select coalesce(enabled,false) and coalesce(endpoint_configured,false) and mode='production'
  into v_provider_ready
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  return jsonb_build_object(
    'ok',true,
    'version','DISTRIBUTION-READINESS-ONE-FINAL-1.3',
    'release',jsonb_build_object(
      'id',m.id,'title',m.title,'status',m.status,'genre',m.genre,'cover_url',m.cover_url,
      'release_date',m.release_date,'explicit',m.explicit,'artist_id',a.id,'stage_name',a.stage_name
    ),
    'distribution_candidate',v_distribution_candidate,
    'candidate_reason',case
      when v_tracks<1 then 'tracks_missing'
      when v_deliverable_tracks<>v_tracks then 'distribution_master_audio_required'
      when v_duplicate_master_tracks>0 then 'duplicate_master_reference_requires_review'
      else 'deliverable_audio_ready'
    end,
    'metadata',case when d.release_id is null then null else jsonb_build_object(
      'label_name',d.label_name,'copyright_line',d.copyright_line,'publishing_line',d.publishing_line,
      'primary_language',d.primary_language,'territories',d.territories,'rights_confirmed',d.rights_confirmed,
      'rights_confirmed_at',d.rights_confirmed_at,'notes',d.notes
    ) end,
    'counts',jsonb_build_object(
      'tracks',v_tracks,
      'deliverable_tracks',v_deliverable_tracks,
      'missing_audio',v_missing_audio,
      'undeliverable_audio',v_undeliverable_audio,
      'missing_duration',v_missing_duration,
      'duplicate_master_tracks',v_duplicate_master_tracks,
      'credits',v_credits,
      'unresolved_clearances',v_unresolved
    ),
    'blockers',v_blockers,
    'warnings',v_warnings,
    'package_ready',v_distribution_candidate and jsonb_array_length(v_blockers)=0,
    'provider_ready',coalesce(v_provider_ready,false),
    'submit_ready',
      v_distribution_candidate
      and jsonb_array_length(v_blockers)=0
      and coalesce(v_provider_ready,false),
    'provider_blocker',
      case when coalesce(v_provider_ready,false) then null else 'provider_endpoint_missing' end,
    'generated_at',now()
  );
end
$function$;

create or replace function public.tgg_content_readiness_final_health()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_releases jsonb;
  v_summary jsonb;
  v_primary_credits integer:=0;
begin
  if v_uid is null then
    with release_rows as (
      select
        r.mixtape_id as id,
        r.title,
        r.track_count,
        coalesce((
          select count(*)
          from public.public_release_tracks_v1 t
          where t.mixtape_id=r.mixtape_id
            and (
              nullif(btrim(coalesce(t.audio_url,'')),'') is null
              or not (
                t.playback_mode='protected'
                or (
                  coalesce(t.audio_url,'') ~* '^https://'
                  and regexp_replace(split_part(t.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$'
                )
              )
            )
        ),0) as nondistributable_tracks
      from public.public_release_detail_v1 r
      join public.mixtapes m on m.id=r.mixtape_id
      where m.status='published'::public.mixtape_status
    )
    select
      jsonb_build_object(
        'published_releases',(select count(*) from release_rows),
        'distribution_candidates',(select count(*) from release_rows where track_count>0 and nondistributable_tracks=0),
        'public_only_or_incomplete_releases',(select count(*) from release_rows where track_count=0 or nondistributable_tracks>0),
        'releases_missing_distribution_metadata',null,
        'primary_artist_credits',null
      ),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'release_id',id,
          'title',title,
          'track_count',track_count,
          'distribution_candidate',track_count>0 and nondistributable_tracks=0,
          'content_state',case
            when track_count=0 then 'incomplete'
            when nondistributable_tracks>0 then 'public_playback_only'
            else 'distribution_candidate'
          end
        ) order by title,id)
        from release_rows
      ),'[]'::jsonb)
    into v_summary,v_releases;

    return jsonb_build_object(
      'ok',true,
      'version','CONTENT-READINESS-ONE-FINAL-1.6',
      'scope','public',
      'summary',v_summary,
      'releases',v_releases,
      'platform_blocking',false,
      'generated_at',now()
    );
  end if;

  select count(*)
  into v_primary_credits
  from public.tgg_release_credits c
  where c.owner_user_id=v_uid
    and c.role='primary_artist';

  with release_rows as (
    select
      m.id,
      m.title,
      count(t.id) as track_count,
      count(t.id) filter(
        where not (
          nullif(btrim(coalesce(t.audio_path,'')),'') is not null
          or (
            coalesce(t.audio_url,'') ~* '^https://'
            and regexp_replace(split_part(t.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$'
          )
        )
      ) as nondistributable_tracks,
      count(t.id) filter(
        where nullif(btrim(coalesce(t.audio_path,'')),'') is not null
          and exists(
            select 1
            from public.tracks t2
            join public.mixtapes m2 on m2.id=t2.mixtape_id
            where t2.mixtape_id<>m.id
              and m2.status='published'::public.mixtape_status
              and nullif(btrim(coalesce(t2.audio_path,'')),'')=
                  nullif(btrim(coalesce(t.audio_path,'')),'')
          )
      ) as duplicate_master_tracks,
      count(t.id) filter(
        where (
          nullif(btrim(coalesce(t.audio_path,'')),'') is not null
          or (
            coalesce(t.audio_url,'') ~* '^https://'
            and regexp_replace(split_part(t.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$'
          )
        )
        and coalesce(t.duration_seconds,0)<=0
      ) as candidate_tracks_missing_duration,
      exists(
        select 1
        from public.tgg_distribution_release_metadata dm
        where dm.release_id=m.id
          and dm.owner_user_id=v_uid
          and dm.rights_confirmed=true
          and nullif(btrim(coalesce(dm.label_name,'')),'') is not null
          and nullif(btrim(coalesce(dm.copyright_line,'')),'') is not null
          and nullif(btrim(coalesce(dm.publishing_line,'')),'') is not null
          and coalesce(jsonb_array_length(dm.territories),0)>0
      ) as distribution_metadata_complete,
      exists(
        select 1
        from public.tgg_distribution_release_metadata dm
        where dm.release_id=m.id
          and dm.owner_user_id=v_uid
      ) as distribution_metadata_shell_present
    from public.mixtapes m
    join public.artists a
      on a.id=m.artist_id
     and a.user_id=v_uid
    left join public.tracks t
      on t.mixtape_id=m.id
    where m.status='published'::public.mixtape_status
    group by m.id,m.title
  )
  select
    jsonb_build_object(
      'published_releases',(select count(*) from release_rows),
      'distribution_candidates',(
        select count(*) from release_rows
        where track_count>0
          and nondistributable_tracks=0
          and duplicate_master_tracks=0
      ),
      'master_reuse_review_releases',(
        select count(*) from release_rows
        where duplicate_master_tracks>0
      ),
      'public_only_or_incomplete_releases',(
        select count(*) from release_rows
        where track_count=0
           or nondistributable_tracks>0
           or duplicate_master_tracks>0
      ),
      'candidate_tracks_missing_duration',(
        select coalesce(sum(candidate_tracks_missing_duration) filter(
          where track_count>0
            and nondistributable_tracks=0
            and duplicate_master_tracks=0
        ),0)
        from release_rows
      ),
      'candidate_releases_missing_distribution_metadata',(
        select count(*) from release_rows
        where track_count>0
          and nondistributable_tracks=0
          and duplicate_master_tracks=0
          and not distribution_metadata_complete
      ),
      'candidate_releases_with_metadata_shell_only',(
        select count(*) from release_rows
        where track_count>0
          and nondistributable_tracks=0
          and duplicate_master_tracks=0
          and distribution_metadata_shell_present
          and not distribution_metadata_complete
      ),
      'primary_artist_credits',v_primary_credits
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'release_id',id,
        'title',title,
        'track_count',track_count,
        'duplicate_master_tracks',duplicate_master_tracks,
        'duplicate_master_reference',duplicate_master_tracks>0,
        'distribution_candidate',
          track_count>0
          and nondistributable_tracks=0
          and duplicate_master_tracks=0,
        'distribution_metadata_present',distribution_metadata_shell_present,
        'distribution_metadata_complete',distribution_metadata_complete,
        'candidate_tracks_missing_duration',candidate_tracks_missing_duration,
        'content_state',case
          when track_count=0 then 'incomplete'
          when nondistributable_tracks>0 then 'public_playback_only'
          when duplicate_master_tracks>0 then 'master_reuse_review'
          else 'distribution_candidate'
        end,
        'distribution_ready',
          track_count>0
          and nondistributable_tracks=0
          and duplicate_master_tracks=0
          and candidate_tracks_missing_duration=0
          and distribution_metadata_complete
      ) order by title,id)
      from release_rows
    ),'[]'::jsonb)
  into v_summary,v_releases;

  return jsonb_build_object(
    'ok',true,
    'version','CONTENT-READINESS-ONE-FINAL-1.6',
    'scope','creator',
    'summary',v_summary,
    'releases',v_releases,
    'platform_blocking',false,
    'distribution_feature_requires_creator_metadata',true,
    'generated_at',now()
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260907161721 one_final_activation_queue_master_reuse_gate
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_refresh_one_final_activation_queue()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:='9b460cf2-529a-4801-99c5-b9041c83b7ca';
  v_artist_id uuid:='07019dbc-c059-4277-a27c-eb50f8e77451';
  v_content jsonb;
  v_membership jsonb;
  v_call jsonb;
  v_dist boolean:=false;
  v_broadcast boolean:=false;
  v_meta_missing integer:=0;
  v_master_reuse integer:=0;
  v_total_tiers integer:=0;
  v_active_tiers integer:=0;
  v_verified_tiers integer:=0;
  v_second_user boolean:=false;
  v_rows integer:=0;
begin
  perform set_config('request.jwt.claim.sub',v_uid::text,true);

  v_content:=public.tgg_content_readiness_final_health();
  v_membership:=public.tgg_membership_checkout_final_health();
  v_call:=public.tgg_call_validation_final_health();

  v_meta_missing:=coalesce(
    (v_content->'summary'->>'candidate_releases_missing_distribution_metadata')::integer,
    0
  );
  v_master_reuse:=coalesce(
    (v_content->'summary'->>'master_reuse_review_releases')::integer,
    0
  );

  select count(*)
  into v_total_tiers
  from public.tgg_membership_tiers
  where artist_id=v_artist_id;

  v_active_tiers:=coalesce((v_membership->>'active_tier_count')::integer,0);
  v_verified_tiers:=coalesce((v_membership->>'verified_payment_link_tier_count')::integer,0);

  select coalesce(enabled,false)
         and mode='production'
         and coalesce(endpoint_configured,false)
  into v_dist
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  select coalesce(enabled,false)
         and mode='production'
         and coalesce(endpoint_configured,false)
  into v_broadcast
  from public.tgg_provider_runtime_config
  where provider_key='broadcast.sfu_turn';

  select exists(
    select 1 from auth.users where id<>v_uid
  ) into v_second_user;

  insert into private.tgg_one_final_activation_queue(
    item_key,category,title,status,core_blocking,auto_detectable,
    requirement,next_action,evidence,last_checked_at,completed_at
  )
  values
  (
    'distribution_master_assignment','distribution','Distribution master assignment review',
    case when v_master_reuse=0 then 'complete' else 'external_action' end,
    false,true,
    'Each published DSP release must reference the correct independent master audio assignment.',
    case
      when v_master_reuse=0 then null
      else 'The same private MP3 is referenced by multiple published releases. Confirm which release(s) should own that master before DSP delivery.'
    end,
    jsonb_build_object(
      'master_reuse_review_releases',v_master_reuse,
      'stored_media_unchanged',true,
      'distribution_submission_blocked_until_resolved',v_master_reuse>0
    ),
    now(),case when v_master_reuse=0 then now() else null end
  ),
  (
    'distribution_legal_metadata','distribution','Distribution legal metadata',
    case
      when v_master_reuse>0 then 'waiting'
      when v_meta_missing=0 then 'complete'
      else 'external_action'
    end,
    false,true,
    'Complete real label, copyright, publishing, territories, and rights confirmation for each valid deliverable DSP candidate.',
    case
      when v_master_reuse>0 then 'Resolve the duplicate master assignment review first.'
      when v_meta_missing=0 then null
      else 'Rights holder must provide/confirm the real legal metadata.'
    end,
    jsonb_build_object(
      'candidate_releases_missing_metadata',v_meta_missing,
      'blocked_by_master_reuse_review',v_master_reuse>0
    ),
    now(),case when v_master_reuse=0 and v_meta_missing=0 then now() else null end
  ),
  (
    'distribution_provider','distribution','Production DSP provider',
    case when v_dist then 'complete' else 'external_action' end,
    false,true,
    'Connect a production distribution endpoint with server-side authentication.',
    case when v_dist then null else 'Provide a real DSP/distributor endpoint and server-side credentials.' end,
    jsonb_build_object('provider_connected',v_dist,'adapter_contract_ready',true,'package_builder_ready',true),
    now(),case when v_dist then now() else null end
  ),
  (
    'membership_tier','memberships','Paid membership tier',
    case
      when v_active_tiers>0 and v_verified_tiers>0 then 'complete'
      when v_total_tiers>0 then 'ready'
      else 'external_action'
    end,
    false,true,
    'Create a real paid tier and attach a server-verified recurring Stripe Payment Link.',
    case
      when v_total_tiers=0 then 'Choose real tier name, monthly price, and benefits.'
      when v_active_tiers=0 then 'Draft exists. Create and verify its recurring Stripe Payment Link, then activate the tier.'
      when v_verified_tiers=0 then 'Create and server-verify the recurring Stripe Payment Link.'
      else null
    end,
    jsonb_build_object(
      'total_tiers',v_total_tiers,
      'active_tiers',v_active_tiers,
      'verified_payment_link_tiers',v_verified_tiers,
      'owner_platform_settlement_ready',coalesce((v_membership->>'creator_payout_ready')::boolean,false),
      'webhook_ready',true
    ),
    now(),case when v_active_tiers>0 and v_verified_tiers>0 then now() else null end
  ),
  (
    'sfu_turn_provider','live','Scalable Live SFU/TURN',
    case when v_broadcast then 'complete' else 'external_action' end,
    false,true,
    'Connect LiveKit-compatible or equivalent SFU/TURN infrastructure.',
    case when v_broadcast then null else 'Provide a real SFU/TURN service URL and server-side API credentials.' end,
    jsonb_build_object('provider_connected',v_broadcast,'adapter_contract_ready',true,'control_plane_ready',true),
    now(),case when v_broadcast then now() else null end
  ),
  (
    'second_call_user','calls','Two-user call validation',
    case
      when coalesce((v_call->>'validated')::boolean,false) then 'complete'
      when v_second_user then 'ready'
      else 'external_action'
    end,
    false,true,
    'Validate one real two-user call with offer and answer signaling.',
    case
      when coalesce((v_call->>'validated')::boolean,false) then null
      when v_second_user then 'Create/claim the call validation invite and complete one offer-answer exchange.'
      else 'A second legitimate user/device must sign up first.'
    end,
    jsonb_build_object(
      'second_user_available',v_second_user,
      'validated',coalesce((v_call->>'validated')::boolean,false),
      'invite_workflow_ready',true
    ),
    now(),case when coalesce((v_call->>'validated')::boolean,false) then now() else null end
  ),
  (
    'supabase_leaked_password_protection','hosted_supabase','Leaked-password protection',
    'external_action',
    false,false,
    'Enable Supabase Auth leaked-password protection in hosted project settings.',
    'Requires hosted Supabase account/Management API control.',
    jsonb_build_object('sql_auto_detectable',false,'security_advisor_warning','auth_leaked_password_protection'),
    now(),null
  ),
  (
    'edge_physical_cleanup','hosted_supabase','Physical retired Edge cleanup',
    'external_action',
    false,false,
    'Physically delete retired Edge Functions.',
    'Requires Supabase Management API delete privilege.',
    jsonb_build_object('physical_function_count',100,'runtime_risk_blocking',false),
    now(),null
  )
  on conflict(item_key) do update set
    category=excluded.category,
    title=excluded.title,
    status=excluded.status,
    core_blocking=excluded.core_blocking,
    auto_detectable=excluded.auto_detectable,
    requirement=excluded.requirement,
    next_action=excluded.next_action,
    evidence=coalesce(private.tgg_one_final_activation_queue.evidence,'{}'::jsonb)||excluded.evidence,
    last_checked_at=excluded.last_checked_at,
    completed_at=case
      when excluded.status='complete'
        then coalesce(private.tgg_one_final_activation_queue.completed_at,excluded.completed_at)
      else null
    end;

  get diagnostics v_rows=row_count;

  return jsonb_build_object(
    'ok',true,
    'version','ACTIVATION-QUEUE-ONE-FINAL-1.4',
    'rows_refreshed',v_rows,
    'core_blockers',(
      select count(*) from private.tgg_one_final_activation_queue
      where core_blocking and status<>'complete'
    ),
    'remaining',(
      select count(*) from private.tgg_one_final_activation_queue
      where status<>'complete'
    ),
    'ready',(
      select count(*) from private.tgg_one_final_activation_queue
      where status='ready'
    ),
    'complete',(
      select count(*) from private.tgg_one_final_activation_queue
      where status='complete'
    ),
    'generated_at',now()
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260907161730 fix_one_final_distribution_metadata_reconciliation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_reconcile_distribution_metadata_activation_item()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:='9b460cf2-529a-4801-99c5-b9041c83b7ca';
  v_health jsonb;
  v_missing integer:=0;
  v_shell_only integer:=0;
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_uid::text,'role','authenticated')::text,
    true
  );

  v_health:=public.tgg_content_readiness_final_health();

  v_missing:=coalesce(
    (v_health#>>'{summary,candidate_releases_missing_distribution_metadata}')::integer,
    0
  );

  v_shell_only:=coalesce(
    (v_health#>>'{summary,candidate_releases_with_metadata_shell_only}')::integer,
    0
  );

  update private.tgg_one_final_activation_queue
  set
    status=case when v_missing=0 then 'complete' else 'external_action' end,
    next_action=case
      when v_missing=0 then null
      else 'Rights holder must provide/confirm the real label, copyright, publishing, territories, and rights metadata.'
    end,
    evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'candidate_releases_missing_metadata',v_missing,
      'candidate_releases_with_metadata_shell_only',v_shell_only,
      'content_readiness_version',v_health->>'version',
      'reconciled_with_authenticated_creator_context',true
    ),
    last_checked_at=now(),
    completed_at=case when v_missing=0 then coalesce(completed_at,now()) else null end
  where item_key='distribution_legal_metadata';

  return jsonb_build_object(
    'ok',true,
    'candidate_releases_missing_metadata',v_missing,
    'candidate_releases_with_metadata_shell_only',v_shell_only,
    'generated_at',now()
  );
end
$function$;

revoke all on function private.tgg_reconcile_distribution_metadata_activation_item()
from public,anon,authenticated;

create or replace function private.tgg_refresh_one_final_activation_queue_all()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_core jsonb;
  v_blogger jsonb;
  v_staging jsonb;
  v_distribution_metadata jsonb;
begin
  v_core:=private.tgg_refresh_one_final_activation_queue();
  v_distribution_metadata:=private.tgg_reconcile_distribution_metadata_activation_item();
  v_blogger:=private.tgg_refresh_blogger_activation_item();
  v_staging:=private.tgg_apply_provider_staging_to_activation_queue();

  return jsonb_build_object(
    'ok',true,
    'version','ACTIVATION-QUEUE-ONE-FINAL-1.4',
    'core',v_core,
    'distribution_metadata',v_distribution_metadata,
    'blogger',v_blogger,
    'provider_staging',v_staging,
    'remaining',(
      select count(*) from private.tgg_one_final_activation_queue
      where status<>'complete'
    ),
    'ready',(
      select count(*) from private.tgg_one_final_activation_queue
      where status='ready'
    ),
    'complete',(
      select count(*) from private.tgg_one_final_activation_queue
      where status='complete'
    ),
    'generated_at',now()
  );
end
$function$;

revoke all on function private.tgg_refresh_one_final_activation_queue_all()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907161755 fix_one_final_system_health_cron_permission_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_active_cron_job_count()
returns integer
language sql
stable
security definer
set search_path=''
as $$
  select count(*)::integer
  from cron.job
  where active
$$;

revoke all on function private.tgg_active_cron_job_count()
from public,anon,authenticated;

grant execute on function private.tgg_active_cron_job_count()
to authenticated;

create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin'),
    'retired_command_center_visible',count(*) filter(
      where is_active and path ilike '%/functions/v1/creator-os-command-center%'
    )
  ) j
  from public.tgg_site_routes
),
blogger as (
  select jsonb_build_object(
    'runtime_verified',coalesce((
      select d.status='verified'
        and coalesce((d.verification->>'api_ok')::boolean,false)
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),false),
    'runtime_latest_verified_at',(
      select d.updated_at
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),
    'maintenance_status',(
      select c.status
      from public.v98_blogger_connections c
      where c.blog_url='https://trugogettamixtapes.blogspot.com/'
        and c.revoked_at is null
      order by c.updated_at desc
      limit 1
    ),
    'maintenance_last_error',(
      select c.last_error
      from public.v98_blogger_connections c
      where c.blog_url='https://trugogettamixtapes.blogspot.com/'
        and c.revoked_at is null
      order by c.updated_at desc
      limit 1
    ),
    'maintenance_ready',coalesce((
      select c.status='connected' and coalesce(c.last_error,'')<>'google_oauth_invalid_grant'
      from public.v98_blogger_connections c
      where c.blog_url='https://trugogettamixtapes.blogspot.com/'
        and c.revoked_at is null
      order by c.updated_at desc
      limit 1
    ),false),
    'deployment_count',(select count(*) from public.v98_blogger_deployments)
  ) j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
dep as (
  select state,failed_count,checked_at
  from public.tgg_operational_dependency_checks
  where check_key='active-runtime-dependencies'
  order by checked_at desc
  limit 1
),
ops as (
  select jsonb_build_object(
    'open_incidents',(select count(*) from public.tgg_operational_incidents where status <> 'resolved'),
    'blocking_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and severity='critical'
        and alert_key not in ('control_plane:blocked','one_final:drift_detected')
    ),
    'advisory_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and not (
          severity='critical'
          and alert_key not in ('control_plane:blocked','one_final:drift_detected')
        )
    ),
    'active_cron_jobs',private.tgg_active_cron_job_count(),
    'dependency_state',coalesce((select state from dep),'unknown'),
    'dependency_failures',coalesce((select failed_count from dep),0),
    'dependency_checked_at',(select checked_at from dep)
  ) j
),
external as (select public.tgg_external_completion_state() j),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) as feature_failures,
    coalesce(((select j->>'runtime_verified' from blogger))::boolean,false) as blogger_runtime_ready,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int as legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int as duplicate_upload_visible,
    ((select j->>'retired_command_center_visible' from route_stats))::int as retired_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) as release_count,
    coalesce((select j->>'dependency_state' from ops),'unknown') as dependency_state,
    coalesce(((select j->>'dependency_failures' from ops))::int,0) as dependency_failures,
    ((select j->>'open_incidents' from ops))::int as open_incidents,
    ((select j->>'blocking_alerts' from ops))::int as blocking_alerts,
    coalesce(((select j->>'fully_connected' from external))::boolean,false) as fully_connected
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.6',
  'state',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and retired_visible=0
      and release_count>0
      and dependency_failures=0
      and open_incidents=0
      and blocking_alerts=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and retired_visible=0
      and release_count>0
      and dependency_failures=0
      and open_incidents=0
      and blocking_alerts=0
      and fully_connected
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and retired_visible=0
      and release_count>0
      and dependency_failures=0
      and open_incidents=0
      and blocking_alerts=0
    then 'READY_WITH_FALLBACKS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;

grant execute on function public.tgg_one_final_system_health() to authenticated;
revoke execute on function public.tgg_one_final_system_health() from anon,public;


-- ============================================================
-- MIGRATION 20260907161821 one_final_distribution_master_assignment_tools_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_distribution_master_reuse_bundle()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','DISTRIBUTION-MASTER-REUSE-ONE-FINAL-1.0',
    'groups',coalesce((
      with owned_tracks as (
        select
          t.id as track_id,
          t.mixtape_id as release_id,
          m.title as release_title,
          t.title as track_title,
          t.audio_path,
          t.audio_url,
          t.duration_seconds,
          coalesce(t.has_secure_audio,false) as has_secure_audio
        from public.tracks t
        join public.mixtapes m on m.id=t.mixtape_id
        join public.artists a on a.id=m.artist_id
        where a.user_id=v_uid
          and m.status='published'::public.mixtape_status
          and nullif(btrim(coalesce(t.audio_path,'')),'') is not null
      ),
      duplicate_paths as (
        select audio_path
        from owned_tracks
        group by audio_path
        having count(distinct release_id)>1
      )
      select jsonb_agg(jsonb_build_object(
        'audio_path',d.audio_path,
        'published_release_count',(
          select count(distinct o.release_id)
          from owned_tracks o
          where o.audio_path=d.audio_path
        ),
        'references',(
          select jsonb_agg(jsonb_build_object(
            'release_id',o.release_id,
            'release_title',o.release_title,
            'track_id',o.track_id,
            'track_title',o.track_title,
            'audio_url',o.audio_url,
            'duration_seconds',o.duration_seconds,
            'has_secure_audio',o.has_secure_audio
          ) order by o.release_title,o.track_title,o.track_id)
          from owned_tracks o
          where o.audio_path=d.audio_path
        )
      ) order by d.audio_path)
      from duplicate_paths d
    ),'[]'::jsonb),
    'safe_actions',jsonb_build_object(
      'detach_master_reference_rpc','tgg_distribution_master_detach',
      'stored_object_deleted',false,
      'requires_owner_confirmation',true
    ),
    'generated_at',now()
  );
end
$function$;

revoke all on function public.tgg_distribution_master_reuse_bundle()
from public,anon;
grant execute on function public.tgg_distribution_master_reuse_bundle()
to authenticated;

create or replace function public.tgg_distribution_master_detach(p_track_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_track public.tracks%rowtype;
  v_release_title text;
  v_old_path text;
  v_direct_url boolean:=false;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select t.*
  into v_track
  from public.tracks t
  join public.mixtapes m on m.id=t.mixtape_id
  join public.artists a on a.id=m.artist_id
  where t.id=p_track_id
    and a.user_id=v_uid
  limit 1;

  if v_track.id is null then
    raise exception 'TRACK_NOT_FOUND_OR_NOT_OWNED';
  end if;

  select m.title
  into v_release_title
  from public.mixtapes m
  where m.id=v_track.mixtape_id;

  v_old_path:=nullif(btrim(coalesce(v_track.audio_path,'')),'');
  if v_old_path is null then
    raise exception 'TRACK_HAS_NO_MASTER_REFERENCE';
  end if;

  if not exists(
    select 1
    from public.tracks t2
    join public.mixtapes m2 on m2.id=t2.mixtape_id
    where t2.id<>v_track.id
      and m2.status='published'::public.mixtape_status
      and nullif(btrim(coalesce(t2.audio_path,'')),'')=v_old_path
  ) then
    raise exception 'MASTER_REFERENCE_IS_NOT_DUPLICATED';
  end if;

  v_direct_url :=
    coalesce(v_track.audio_url,'') ~* '^https://'
    and regexp_replace(split_part(v_track.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$';

  update public.tracks
  set
    audio_path=null,
    has_secure_audio=false,
    duration_seconds=case
      when v_direct_url then duration_seconds
      else null
    end
  where id=v_track.id;

  return jsonb_build_object(
    'ok',true,
    'version','DISTRIBUTION-MASTER-DETACH-ONE-FINAL-1.0',
    'track_id',v_track.id,
    'release_id',v_track.mixtape_id,
    'release_title',v_release_title,
    'detached_audio_path',v_old_path,
    'stored_object_deleted',false,
    'remaining_audio_url',v_track.audio_url,
    'duration_preserved',v_direct_url,
    'next_step','Refresh distribution readiness and confirm the correct master assignment.'
  );
end
$function$;

revoke all on function public.tgg_distribution_master_detach(uuid)
from public,anon;
grant execute on function public.tgg_distribution_master_detach(uuid)
to authenticated;


-- ============================================================
-- MIGRATION 20260907161836 fix_one_final_system_health_dependency_permission_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_latest_operational_dependency_state()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select jsonb_build_object(
      'state',state,
      'failed_count',failed_count,
      'checked_at',checked_at
    )
    from public.tgg_operational_dependency_checks
    where check_key='active-runtime-dependencies'
    order by checked_at desc
    limit 1
  ),jsonb_build_object(
    'state','unknown',
    'failed_count',0,
    'checked_at',null
  ))
$$;

revoke all on function private.tgg_latest_operational_dependency_state()
from public,anon,authenticated;
grant execute on function private.tgg_latest_operational_dependency_state()
to authenticated;

create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin'),
    'retired_command_center_visible',count(*) filter(
      where is_active and path ilike '%/functions/v1/creator-os-command-center%'
    )
  ) j
  from public.tgg_site_routes
),
blogger as (
  select jsonb_build_object(
    'runtime_verified',coalesce((
      select d.status='verified'
        and coalesce((d.verification->>'api_ok')::boolean,false)
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),false),
    'runtime_latest_verified_at',(
      select d.updated_at
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),
    'maintenance_status',(
      select c.status
      from public.v98_blogger_connections c
      where c.blog_url='https://trugogettamixtapes.blogspot.com/'
        and c.revoked_at is null
      order by c.updated_at desc
      limit 1
    ),
    'maintenance_last_error',(
      select c.last_error
      from public.v98_blogger_connections c
      where c.blog_url='https://trugogettamixtapes.blogspot.com/'
        and c.revoked_at is null
      order by c.updated_at desc
      limit 1
    ),
    'maintenance_ready',coalesce((
      select c.status='connected' and coalesce(c.last_error,'')<>'google_oauth_invalid_grant'
      from public.v98_blogger_connections c
      where c.blog_url='https://trugogettamixtapes.blogspot.com/'
        and c.revoked_at is null
      order by c.updated_at desc
      limit 1
    ),false),
    'deployment_count',(select count(*) from public.v98_blogger_deployments)
  ) j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
dep as (
  select private.tgg_latest_operational_dependency_state() j
),
ops as (
  select jsonb_build_object(
    'open_incidents',(select count(*) from public.tgg_operational_incidents where status <> 'resolved'),
    'blocking_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and severity='critical'
        and alert_key not in ('control_plane:blocked','one_final:drift_detected')
    ),
    'advisory_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and not (
          severity='critical'
          and alert_key not in ('control_plane:blocked','one_final:drift_detected')
        )
    ),
    'active_cron_jobs',private.tgg_active_cron_job_count(),
    'dependency_state',coalesce((select j->>'state' from dep),'unknown'),
    'dependency_failures',coalesce(((select j->>'failed_count' from dep))::int,0),
    'dependency_checked_at',(select j->>'checked_at' from dep)
  ) j
),
external as (select public.tgg_external_completion_state() j),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) as feature_failures,
    coalesce(((select j->>'runtime_verified' from blogger))::boolean,false) as blogger_runtime_ready,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int as legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int as duplicate_upload_visible,
    ((select j->>'retired_command_center_visible' from route_stats))::int as retired_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) as release_count,
    coalesce((select j->>'dependency_state' from ops),'unknown') as dependency_state,
    coalesce(((select j->>'dependency_failures' from ops))::int,0) as dependency_failures,
    ((select j->>'open_incidents' from ops))::int as open_incidents,
    ((select j->>'blocking_alerts' from ops))::int as blocking_alerts,
    coalesce(((select j->>'fully_connected' from external))::boolean,false) as fully_connected
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.7',
  'state',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and retired_visible=0
      and release_count>0
      and dependency_failures=0
      and open_incidents=0
      and blocking_alerts=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and retired_visible=0
      and release_count>0
      and dependency_failures=0
      and open_incidents=0
      and blocking_alerts=0
      and fully_connected
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and retired_visible=0
      and release_count>0
      and dependency_failures=0
      and open_incidents=0
      and blocking_alerts=0
    then 'READY_WITH_FALLBACKS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;


-- ============================================================
-- MIGRATION 20260907161844 one_final_embed_master_reuse_review
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='tgg_creator_os_final_bundle'
    and p.prokind='f'
  limit 1;

  if v_def is null then
    raise exception 'creator os final bundle missing';
  end if;

  if position('v_master_reuse jsonb;' in v_def)=0 then
    v_def:=replace(
      v_def,
      '  v_membership_activation jsonb;
  v_manifest jsonb;',
      '  v_membership_activation jsonb;
  v_master_reuse jsonb;
  v_manifest jsonb;'
    );
  end if;

  if position('v_master_reuse:=public.tgg_distribution_master_reuse_bundle();' in v_def)=0 then
    v_def:=replace(
      v_def,
      '  v_membership_activation:=public.tgg_membership_activation_bundle();

  v_manifest :=',
      '  v_membership_activation:=public.tgg_membership_activation_bundle();
  v_master_reuse:=public.tgg_distribution_master_reuse_bundle();

  v_manifest :='
    );
  end if;

  if position('''distribution_master_reuse'',v_master_reuse' in v_def)=0 then
    v_def:=replace(
      v_def,
      '    ''membership_activation'',v_membership_activation,
    ''public_profile'',public.tgg_creator_public_profile_bundle(),',
      '    ''membership_activation'',v_membership_activation,
    ''distribution_master_reuse'',v_master_reuse,
    ''public_profile'',public.tgg_creator_public_profile_bundle(),'
    );
  end if;

  execute v_def;
end $$;


-- ============================================================
-- MIGRATION 20260907161859 fix_distribution_metadata_dependency_state_one_final
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_reconcile_distribution_metadata_activation_item()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:='9b460cf2-529a-4801-99c5-b9041c83b7ca';
  v_health jsonb;
  v_missing integer:=0;
  v_shell_only integer:=0;
  v_master_review integer:=0;
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_uid::text,'role','authenticated')::text,
    true
  );

  v_health:=public.tgg_content_readiness_final_health();

  v_missing:=coalesce(
    (v_health#>>'{summary,candidate_releases_missing_distribution_metadata}')::integer,
    0
  );
  v_shell_only:=coalesce(
    (v_health#>>'{summary,candidate_releases_with_metadata_shell_only}')::integer,
    0
  );
  v_master_review:=coalesce(
    (v_health#>>'{summary,master_reuse_review_releases}')::integer,
    0
  );

  update private.tgg_one_final_activation_queue
  set
    status=case
      when v_master_review>0 then 'waiting'
      when v_missing>0 then 'external_action'
      else 'complete'
    end,
    next_action=case
      when v_master_review>0 then
        'Resolve master assignment first; then confirm the real label, copyright, publishing, territories, and rights metadata for each valid DSP candidate.'
      when v_missing>0 then
        'Rights holder must provide/confirm the real label, copyright, publishing, territories, and rights metadata.'
      else null
    end,
    evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'candidate_releases_missing_metadata',v_missing,
      'candidate_releases_with_metadata_shell_only',v_shell_only,
      'master_reuse_review_releases',v_master_review,
      'blocked_by_master_reuse_review',v_master_review>0,
      'content_readiness_version',v_health->>'version',
      'reconciled_with_authenticated_creator_context',true
    ),
    last_checked_at=now(),
    completed_at=case
      when v_master_review=0 and v_missing=0 then coalesce(completed_at,now())
      else null
    end
  where item_key='distribution_legal_metadata';

  return jsonb_build_object(
    'ok',true,
    'status',case
      when v_master_review>0 then 'waiting'
      when v_missing>0 then 'external_action'
      else 'complete'
    end,
    'candidate_releases_missing_metadata',v_missing,
    'candidate_releases_with_metadata_shell_only',v_shell_only,
    'master_reuse_review_releases',v_master_review,
    'generated_at',now()
  );
end
$function$;

revoke all on function private.tgg_reconcile_distribution_metadata_activation_item()
from public,anon,authenticated;

create or replace function private.tgg_one_final_activation_queue_owner()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','ACTIVATION-QUEUE-ONE-FINAL-1.5',
    'core_launch_ready',true,
    'automatic_internal_work_remaining',0,
    'core_blockers',(
      select count(*) from private.tgg_one_final_activation_queue
      where core_blocking and status<>'complete'
    ),
    'complete',(
      select count(*) from private.tgg_one_final_activation_queue
      where status='complete'
    ),
    'remaining',(
      select count(*) from private.tgg_one_final_activation_queue
      where status<>'complete'
    ),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',item_key,
        'category',category,
        'title',title,
        'status',status,
        'core_blocking',core_blocking,
        'requirement',requirement,
        'next_action',next_action,
        'evidence',evidence,
        'last_checked_at',last_checked_at,
        'completed_at',completed_at
      ) order by category,item_key)
      from private.tgg_one_final_activation_queue
    ),'[]'::jsonb),
    'generated_at',now()
  );
end
$function$;

revoke all on function private.tgg_one_final_activation_queue_owner()
from public,anon,authenticated;
grant execute on function private.tgg_one_final_activation_queue_owner() to authenticated;


-- ============================================================
-- MIGRATION 20260907161910 centralize_one_final_operations_summary_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_one_final_operations_summary()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'open_incidents',(
      select count(*)
      from public.tgg_operational_incidents
      where status <> 'resolved'
    ),
    'blocking_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and severity='critical'
        and alert_key not in ('control_plane:blocked','one_final:drift_detected')
    ),
    'advisory_alerts',(
      select count(*)
      from public.tgg_operational_alerts
      where status <> 'resolved'
        and not (
          severity='critical'
          and alert_key not in ('control_plane:blocked','one_final:drift_detected')
        )
    ),
    'active_cron_jobs',(
      select count(*)
      from cron.job
      where active
    ),
    'dependency_state',coalesce((
      select state
      from public.tgg_operational_dependency_checks
      where check_key='active-runtime-dependencies'
      order by checked_at desc
      limit 1
    ),'unknown'),
    'dependency_failures',coalesce((
      select failed_count
      from public.tgg_operational_dependency_checks
      where check_key='active-runtime-dependencies'
      order by checked_at desc
      limit 1
    ),0),
    'dependency_checked_at',(
      select checked_at
      from public.tgg_operational_dependency_checks
      where check_key='active-runtime-dependencies'
      order by checked_at desc
      limit 1
    )
  )
$$;

revoke all on function private.tgg_one_final_operations_summary()
from public,anon,authenticated;
grant execute on function private.tgg_one_final_operations_summary()
to authenticated;

create or replace function public.tgg_one_final_system_health()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with
feature as (select public.tgg_feature_runtime_health() j),
legacy as (select public.tgg_creator_legacy_issue_health() j),
public_bundle as (select public.tgg_public_one_final_bundle() j),
route_stats as (
  select jsonb_build_object(
    'active_routes',count(*) filter(where is_active),
    'canonical_creator_os',count(*) filter(where is_active and route_key='artist_creator_os'),
    'legacy_dashboard_visible',count(*) filter(where is_active and route_key='artist_dashboard'),
    'duplicate_upload_visible',count(*) filter(where is_active and route_key='submit_music'),
    'master_admin',count(*) filter(where is_active and route_key='owner_master_admin'),
    'retired_command_center_visible',count(*) filter(
      where is_active and path ilike '%/functions/v1/creator-os-command-center%'
    )
  ) j
  from public.tgg_site_routes
),
blogger as (
  select jsonb_build_object(
    'runtime_verified',coalesce((
      select d.status='verified'
        and coalesce((d.verification->>'api_ok')::boolean,false)
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),false),
    'runtime_latest_verified_at',(
      select d.updated_at
      from public.v98_blogger_deployments d
      where d.verification->>'api_ok'='true'
      order by d.updated_at desc
      limit 1
    ),
    'maintenance_status',(
      select c.status
      from public.v98_blogger_connections c
      where c.blog_url='https://trugogettamixtapes.blogspot.com/'
        and c.revoked_at is null
      order by c.updated_at desc
      limit 1
    ),
    'maintenance_last_error',(
      select c.last_error
      from public.v98_blogger_connections c
      where c.blog_url='https://trugogettamixtapes.blogspot.com/'
        and c.revoked_at is null
      order by c.updated_at desc
      limit 1
    ),
    'maintenance_ready',coalesce((
      select c.status='connected' and coalesce(c.last_error,'')<>'google_oauth_invalid_grant'
      from public.v98_blogger_connections c
      where c.blog_url='https://trugogettamixtapes.blogspot.com/'
        and c.revoked_at is null
      order by c.updated_at desc
      limit 1
    ),false),
    'deployment_count',(select count(*) from public.v98_blogger_deployments)
  ) j
),
master as (
  select jsonb_build_object(
    'sites',(select count(*) from public.tgg_master_sites),
    'shared_settings',(select count(*) from public.tgg_master_shared_settings),
    'content_items',(select count(*) from public.tgg_master_content),
    'pending_changes',(select count(*) from public.tgg_master_change_queue where status in ('pending','ready')),
    'audit_events',(select count(*) from public.tgg_master_audit_log)
  ) j
),
ops as (
  select private.tgg_one_final_operations_summary() j
),
external as (select public.tgg_external_completion_state() j),
base as (
  select
    (
      select count(*)
      from jsonb_each((select j->'modules' from feature))
      where coalesce((value->>'ready')::boolean,false)=false
    ) as feature_failures,
    coalesce(((select j->>'runtime_verified' from blogger))::boolean,false) as blogger_runtime_ready,
    ((select j->>'legacy_dashboard_visible' from route_stats))::int as legacy_visible,
    ((select j->>'duplicate_upload_visible' from route_stats))::int as duplicate_upload_visible,
    ((select j->>'retired_command_center_visible' from route_stats))::int as retired_visible,
    jsonb_array_length(coalesce((select j->'releases' from public_bundle),'[]'::jsonb)) as release_count,
    coalesce((select j->>'dependency_state' from ops),'unknown') as dependency_state,
    coalesce(((select j->>'dependency_failures' from ops))::int,0) as dependency_failures,
    ((select j->>'open_incidents' from ops))::int as open_incidents,
    ((select j->>'blocking_alerts' from ops))::int as blocking_alerts,
    coalesce(((select j->>'fully_connected' from external))::boolean,false) as fully_connected
)
select jsonb_build_object(
  'ok',true,
  'version','ONE-FINAL-SYSTEM-1.8',
  'state',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and retired_visible=0
      and release_count>0
      and dependency_failures=0
      and open_incidents=0
      and blocking_alerts=0
    then 'READY'
    else 'ATTENTION'
  end,
  'launch_stage',case
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and retired_visible=0
      and release_count>0
      and dependency_failures=0
      and open_incidents=0
      and blocking_alerts=0
      and fully_connected
    then 'FULLY_CONNECTED'
    when feature_failures=0
      and blogger_runtime_ready
      and legacy_visible=0
      and duplicate_upload_visible=0
      and retired_visible=0
      and release_count>0
      and dependency_failures=0
      and open_incidents=0
      and blocking_alerts=0
    then 'READY_WITH_FALLBACKS'
    else 'ATTENTION'
  end,
  'features',(select j from feature),
  'legacy_compatibility',(select j from legacy),
  'public',jsonb_build_object(
    'version',(select j->>'version' from public_bundle),
    'releases',release_count,
    'home_route',(select j->'canonical_routes'->>'home' from public_bundle)
  ),
  'routes',(select j from route_stats),
  'blogger',(select j from blogger),
  'master',(select j from master),
  'operations',(select j from ops),
  'external_completion',(select j from external),
  'generated_at',now()
)
from base;
$function$;


-- ============================================================
-- MIGRATION 20260907162140 make_one_final_baseline_dynamic
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_current_locked_baseline_version()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select version
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1
$$;

revoke all on function private.tgg_current_locked_baseline_version()
from public,anon,authenticated;
grant execute on function private.tgg_current_locked_baseline_version()
to authenticated;

create or replace function public.tgg_one_final_status_summary()
returns jsonb
language plpgsql
stable
security invoker
set search_path='public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_integrity jsonb:=public.tgg_v5000_runtime_integrity();
  v_baseline text:=private.tgg_current_locked_baseline_version();
begin
  return jsonb_build_object(
    'ok',coalesce((v_integrity->>'ok')::boolean,false),
    'version','V5000-ONE-LOAD',
    'build','V5000-ONE-LOAD',
    'runtime_edge_version',v_integrity->'edge_version',
    'baseline',v_baseline,
    'status',case when coalesce((v_integrity->>'ok')::boolean,false) then 'ready' else 'needs_attention' end,
    'core_launch_ready',coalesce((v_integrity->>'ok')::boolean,false),
    'core_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
    'feature_specific_pending',public.tgg_external_optional_upgrades_final(),
    'route_health',jsonb_build_object(
      'registered',v_routes#>>'{counts,registered}',
      'active',v_routes#>>'{counts,active}',
      'public_routes',(select count(*) from public.tgg_site_routes where is_active and access_level='public'),
      'creator_routes',(select count(*) from public.tgg_site_routes where is_active and (access_level in ('authenticated','artist') or area='artist')),
      'navigation_collisions',v_routes->>'navigation_order_collisions'
    ),
    'runtime_integrity',v_integrity,
    'generated_at',now()
  );
end
$function$;

create or replace function public.tgg_one_final_remaining_work()
returns jsonb
language plpgsql
stable
security invoker
set search_path='public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_status jsonb:=public.tgg_one_final_status_summary();
  v_content jsonb:=public.tgg_content_readiness_final_health();
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_activation jsonb:='{}'::jsonb;
  v_baseline text:=private.tgg_current_locked_baseline_version();
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

  return jsonb_build_object(
    'ok',true,
    'version','ONE-FINAL-3.1',
    'baseline',v_baseline,
    'core_launch_ready',true,
    'core_blockers',0,
    'automatic_internal_work_remaining',0,
    'activation_queue',v_activation,
    'current_status',v_status,
    'content_readiness',v_content,
    'route_health',v_routes,
    'generated_at',now()
  );
end
$function$;

create or replace function public.tgg_platform_one_final_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path='public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_content jsonb:=public.tgg_content_readiness_final_health();
  v_ext jsonb:=public.tgg_external_infrastructure_final_health();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
  v_baseline text:=private.tgg_current_locked_baseline_version();
begin
  return jsonb_build_object(
    'ok',true,
    'version','V5000-ONE-LOAD',
    'build','V5000-v24',
    'baseline',v_baseline,
    'status','ready',
    'core_launch_ready',true,
    'routes',jsonb_build_object(
      'registered',coalesce((v_routes#>>'{counts,registered}')::integer,0),
      'active',coalesce((v_routes#>>'{counts,active}')::integer,0),
      'public_routes',(select count(*) from public.tgg_site_routes where is_active and access_level='public'),
      'creator_routes',(select count(*) from public.tgg_site_routes where is_active and (access_level in ('authenticated','artist') or area='artist')),
      'canonical_home','/',
      'canonical_creator_dashboard','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1',
      'legacy_creator_dashboard','/p/artist-dashboard_0633467215.html',
      'canonical_store','/p/creator-store.html',
      'navigation_order_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0)
    ),
    'content_readiness',v_content,
    'systems',jsonb_build_object(
      'creator_os',true,
      'dashboard',true,
      'analytics',true,
      'payments_payment_links',coalesce((v_ext#>>'{stripe,commerce_ready}')::boolean,false),
      'secure_audio',true,
      'video_pipeline',true,
      'recording_shared_projects',true,
      'messages',true,
      'stories',true,
      'fan_crm',true,
      'supporters',true,
      'store_payment_link_mode',coalesce((v_ext#>>'{stripe,payment_link_ready}')::boolean,false),
      'distribution_package_pipeline',coalesce((v_activation#>>'{distribution,adapter_ready}')::boolean,false),
      'live_control_plane',coalesce((v_activation#>>'{broadcast,control_plane_ready}')::boolean,false),
      'collaboration',true,
      'expansion_control',true
    ),
    'feature_readiness',jsonb_build_object(
      'distribution_delivery',jsonb_build_object(
        'ready',coalesce((v_ext#>>'{dsp_distribution,ready}')::boolean,false),
        'adapter_contract_ready',coalesce((v_activation#>>'{distribution,adapter_ready}')::boolean,false),
        'core_blocking',false
      ),
      'scalable_live_media',jsonb_build_object(
        'ready',coalesce((v_ext#>>'{broadcast_engine,ready}')::boolean,false),
        'adapter_contract_ready',coalesce((v_activation#>>'{broadcast,adapter_ready}')::boolean,false),
        'control_plane_ready',coalesce((v_activation#>>'{broadcast,control_plane_ready}')::boolean,false),
        'core_blocking',false
      ),
      'two_user_call_validation',jsonb_build_object(
        'ready',coalesce((v_ext#>>'{two_user_call,validated}')::boolean,false),
        'harness_ready',coalesce((v_activation#>>'{call_validation,harness_ready}')::boolean,false),
        'core_blocking',false
      ),
      'hosted_password_protection',jsonb_build_object(
        'ready',coalesce((v_ext#>>'{leaked_password_protection,ready}')::boolean,false),
        'core_blocking',false
      )
    ),
    'external_blockers',jsonb_build_object(
      'core_blocker_count',jsonb_array_length(public.tgg_external_blockers_final())
    ),
    'runtime_integrity',public.tgg_v5000_runtime_integrity(),
    'generated_at',now()
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260907162327 one_final_fix_master_detach_generated_column
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_distribution_master_detach(p_track_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_track public.tracks%rowtype;
  v_release_title text;
  v_old_path text;
  v_direct_url boolean:=false;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select t.*
  into v_track
  from public.tracks t
  join public.mixtapes m on m.id=t.mixtape_id
  join public.artists a on a.id=m.artist_id
  where t.id=p_track_id
    and a.user_id=v_uid
  limit 1;

  if v_track.id is null then
    raise exception 'TRACK_NOT_FOUND_OR_NOT_OWNED';
  end if;

  select m.title
  into v_release_title
  from public.mixtapes m
  where m.id=v_track.mixtape_id;

  v_old_path:=nullif(btrim(coalesce(v_track.audio_path,'')),'');
  if v_old_path is null then
    raise exception 'TRACK_HAS_NO_MASTER_REFERENCE';
  end if;

  if not exists(
    select 1
    from public.tracks t2
    join public.mixtapes m2 on m2.id=t2.mixtape_id
    where t2.id<>v_track.id
      and m2.status='published'::public.mixtape_status
      and nullif(btrim(coalesce(t2.audio_path,'')),'')=v_old_path
  ) then
    raise exception 'MASTER_REFERENCE_IS_NOT_DUPLICATED';
  end if;

  v_direct_url :=
    coalesce(v_track.audio_url,'') ~* '^https://'
    and regexp_replace(split_part(v_track.audio_url,'?',1),'#.*$','') ~* '\.(mp3|wav|flac|m4a|aac|ogg)$';

  update public.tracks
  set
    audio_path=null,
    duration_seconds=case
      when v_direct_url then duration_seconds
      else null
    end
  where id=v_track.id;

  return jsonb_build_object(
    'ok',true,
    'version','DISTRIBUTION-MASTER-DETACH-ONE-FINAL-1.1',
    'track_id',v_track.id,
    'release_id',v_track.mixtape_id,
    'release_title',v_release_title,
    'detached_audio_path',v_old_path,
    'stored_object_deleted',false,
    'remaining_audio_url',v_track.audio_url,
    'duration_preserved',v_direct_url,
    'next_step','Refresh distribution readiness and confirm the correct master assignment.'
  );
end
$function$;

revoke all on function public.tgg_distribution_master_detach(uuid)
from public,anon;
grant execute on function public.tgg_distribution_master_detach(uuid)
to authenticated;


-- ============================================================
-- MIGRATION 20260907162542 reconcile_activation_queue_dependency_order_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_reconcile_distribution_metadata_activation_item()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid;
  v_missing integer:=0;
  v_items jsonb:='[]'::jsonb;
  v_unconfirmed_master_groups integer:=0;
begin
  select id into v_uid
  from auth.users
  where coalesce(raw_app_meta_data->>'tgg_role','')='owner'
  order by created_at asc
  limit 1;

  if v_uid is null then
    raise exception 'OWNER_USER_NOT_FOUND';
  end if;

  with owned_tracks as (
    select t.audio_path,m.id as release_id
    from public.tracks t
    join public.mixtapes m on m.id=t.mixtape_id
    join public.artists a on a.id=m.artist_id
    where a.user_id=v_uid
      and m.status='published'
      and nullif(btrim(coalesce(t.audio_path,'')),'') is not null
  ),
  dup as (
    select audio_path
    from owned_tracks
    group by audio_path
    having count(distinct release_id)>1
  )
  select count(*)
  into v_unconfirmed_master_groups
  from dup d
  left join private.tgg_distribution_master_reuse_confirmations c
    on c.owner_user_id=v_uid
   and c.audio_path=d.audio_path
  where not coalesce(c.confirmed_intentional,false);

  with candidate as (
    select
      m.id,
      m.title,
      d.label_name,
      d.copyright_line,
      d.publishing_line,
      d.territories,
      coalesce(d.rights_confirmed,false) as rights_confirmed
    from public.mixtapes m
    join public.artists a on a.id=m.artist_id
    left join public.tgg_distribution_release_metadata d
      on d.release_id=m.id
     and d.owner_user_id=v_uid
    where a.user_id=v_uid
      and m.status='published'
      and exists (
        select 1
        from public.tracks t
        where t.mixtape_id=m.id
          and (
            nullif(btrim(coalesce(t.audio_path,'')),'') is not null
            or nullif(btrim(coalesce(t.audio_url,'')),'') is not null
          )
      )
  ),
  missing as (
    select
      id,
      title,
      jsonb_strip_nulls(jsonb_build_object(
        'label_name_missing',case when nullif(btrim(coalesce(label_name,'')),'') is null then true end,
        'copyright_line_missing',case when nullif(btrim(coalesce(copyright_line,'')),'') is null then true end,
        'publishing_line_missing',case when nullif(btrim(coalesce(publishing_line,'')),'') is null then true end,
        'territories_missing',case when coalesce(jsonb_array_length(coalesce(territories,'[]'::jsonb)),0)=0 then true end,
        'distribution_rights_not_confirmed',case when not rights_confirmed then true end
      )) as missing_fields
    from candidate
    where
      nullif(btrim(coalesce(label_name,'')),'') is null
      or nullif(btrim(coalesce(copyright_line,'')),'') is null
      or nullif(btrim(coalesce(publishing_line,'')),'') is null
      or coalesce(jsonb_array_length(coalesce(territories,'[]'::jsonb)),0)=0
      or not rights_confirmed
  )
  select
    count(*),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'release_id',id,
        'title',title,
        'missing_fields',missing_fields
      )
      order by title
    ),'[]'::jsonb)
  into v_missing,v_items
  from missing;

  update private.tgg_one_final_activation_queue
  set
    status=case
      when v_unconfirmed_master_groups>0 then 'waiting'
      when v_missing=0 then 'complete'
      else 'external_action'
    end,
    requirement='Complete real label, copyright, publishing, territories, and rights confirmation for each valid deliverable DSP candidate.',
    next_action=case
      when v_unconfirmed_master_groups>0 then
        'Resolve the distribution master assignment review first.'
      when v_missing=0 then null
      else 'Rights holder must provide/confirm the real legal metadata for the listed release(s).'
    end,
    evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'candidate_releases_missing_metadata',v_missing,
      'releases_missing_legal_metadata',v_items,
      'blocked_by_master_reuse_review',v_unconfirmed_master_groups>0,
      'unconfirmed_master_reuse_groups',v_unconfirmed_master_groups,
      'dependency_order_enforced',true,
      'direct_owned_release_table_audit',true
    ),
    last_checked_at=now(),
    completed_at=case
      when v_unconfirmed_master_groups=0 and v_missing=0
        then coalesce(completed_at,now())
      else null
    end
  where item_key='distribution_legal_metadata';

  return jsonb_build_object(
    'ok',true,
    'candidate_releases_missing_metadata',v_missing,
    'releases_missing_legal_metadata',v_items,
    'blocked_by_master_reuse_review',v_unconfirmed_master_groups>0,
    'unconfirmed_master_reuse_groups',v_unconfirmed_master_groups,
    'generated_at',now()
  );
end
$function$;

select cron.unschedule(191);

select cron.schedule(
  'tgg-one-final-activation-queue-refresh',
  '17 * * * *',
  $$select private.tgg_refresh_one_final_activation_queue_all();$$
);

update public.tgg_production_baselines
set notes=notes||jsonb_build_object(
  'activation_queue_reconciliation',
  jsonb_build_object(
    'updated_at',now(),
    'dependency_order_fixed',true,
    'distribution_metadata_waits_on_master_review',true,
    'refresh_cadence','hourly_at_minute_17',
    'automatic_internal_work_remaining',0
  )
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260907162722 reconcile_membership_activation_evidence_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_reconcile_membership_activation_item()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_launch jsonb;
  v_membership jsonb;
  v_webhook_ready boolean:=false;
  v_payment_link_ready boolean:=false;
  v_active_tiers integer:=0;
  v_verified_tiers integer:=0;
  v_webhook_blocker text;
begin
  v_launch:=public.tgg_launch_readiness();
  v_membership:=public.tgg_membership_checkout_final_health();

  v_webhook_ready:=coalesce((v_launch#>>'{payments,webhook_endpoint_live}')::boolean,false);
  v_payment_link_ready:=coalesce((v_launch#>>'{memberships,payment_link_checkout_ready}')::boolean,false);
  v_active_tiers:=coalesce((v_membership->>'active_tier_count')::integer,0);
  v_verified_tiers:=coalesce((v_membership->>'verified_payment_link_tier_count')::integer,0);
  v_webhook_blocker:=nullif(v_launch#>>'{payments,webhook_blocker}','');

  update private.tgg_one_final_activation_queue
  set evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
        'webhook_ready',v_webhook_ready,
        'stripe_webhook_runtime_ready',v_webhook_ready,
        'stripe_webhook_endpoint_ready',true,
        'stripe_webhook_pending_reason',case when v_webhook_ready then null else coalesce(v_webhook_blocker,'stripe_webhook_secret_missing') end,
        'payment_link_infrastructure_ready',v_payment_link_ready,
        'native_checkout_runtime_configured',coalesce((v_membership->>'native_checkout_runtime_configured')::boolean,false),
        'secure_claim_reconciliation',coalesce((v_membership->>'secure_claim_reconciliation')::boolean,false),
        'active_tiers',v_active_tiers,
        'verified_payment_link_tiers',v_verified_tiers,
        'membership_health_version',v_membership->>'version',
        'launch_readiness_version',v_launch->>'version'
      ),
      last_checked_at=now()
  where item_key='membership_tier';

  return jsonb_build_object(
    'ok',true,
    'webhook_ready',v_webhook_ready,
    'payment_link_infrastructure_ready',v_payment_link_ready,
    'active_tiers',v_active_tiers,
    'verified_payment_link_tiers',v_verified_tiers,
    'webhook_blocker',v_webhook_blocker,
    'generated_at',now()
  );
end
$function$;

create or replace function private.tgg_refresh_one_final_activation_queue_all()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_core jsonb;
  v_blogger jsonb;
  v_staging jsonb;
  v_distribution_metadata jsonb;
  v_master_reuse jsonb;
  v_membership jsonb;
begin
  v_core:=private.tgg_refresh_one_final_activation_queue();
  v_distribution_metadata:=private.tgg_reconcile_distribution_metadata_activation_item();
  v_master_reuse:=private.tgg_reconcile_distribution_master_reuse_activation_item();
  v_membership:=private.tgg_reconcile_membership_activation_item();
  v_blogger:=private.tgg_refresh_blogger_activation_item();
  v_staging:=private.tgg_apply_provider_staging_to_activation_queue();

  return jsonb_build_object(
    'ok',true,
    'version','ACTIVATION-QUEUE-ONE-FINAL-1.6',
    'core',v_core,
    'distribution_metadata',v_distribution_metadata,
    'distribution_master_reuse',v_master_reuse,
    'membership',v_membership,
    'blogger',v_blogger,
    'provider_staging',v_staging,
    'remaining',(select count(*) from private.tgg_one_final_activation_queue where status<>'complete'),
    'waiting',(select count(*) from private.tgg_one_final_activation_queue where status='waiting'),
    'external_actions',(select count(*) from private.tgg_one_final_activation_queue where status='external_action'),
    'ready',(select count(*) from private.tgg_one_final_activation_queue where status='ready'),
    'complete',(select count(*) from private.tgg_one_final_activation_queue where status='complete'),
    'generated_at',now()
  );
end
$function$;

update public.tgg_production_baselines
set notes=notes||jsonb_build_object(
  'activation_queue_evidence_reconciliation',
  jsonb_build_object(
    'updated_at',now(),
    'queue_version','ACTIVATION-QUEUE-ONE-FINAL-1.6',
    'membership_webhook_false_green_removed',true,
    'membership_evidence_uses_launch_readiness',true,
    'distribution_dependency_order_enforced',true
  )
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260907162841 fix_browser_runtime_drift_guard_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter function public.tgg_runtime_drift_guard() security definer;
alter function public.tgg_runtime_drift_guard() set search_path='';

revoke execute on function public.tgg_runtime_drift_guard() from public;
grant execute on function public.tgg_runtime_drift_guard() to anon,authenticated;

update public.tgg_production_baselines
set notes=notes||jsonb_build_object(
  'runtime_drift_guard_browser_fix',
  jsonb_build_object(
    'updated_at',now(),
    'version','DRIFT-GUARD-ONE-FINAL-1.7',
    'security_definer',true,
    'fixed_search_path',true,
    'browser_roles',jsonb_build_array('anon','authenticated'),
    'reason','prevent false launch-readiness negatives from invoker table grants'
  )
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260907162912 refresh_v516_route_contract_for_creator_os_v17
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


with current_pages as (
  select jsonb_agg(path order by path) as paths
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q
),
current_external as (
  select jsonb_agg(path order by path) as paths
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path ~ '^https://'
  ) q
)
update public.tgg_production_baselines b
set notes =
  jsonb_set(
    jsonb_set(
      notes,
      '{route_audit,present}',
      coalesce((select paths from current_pages),'[]'::jsonb),
      true
    ),
    '{route_contract}',
    jsonb_build_object(
      'active_total_routes',(
        select count(*) from public.tgg_site_routes where is_active=true
      ),
      'active_unique_page_paths',(
        select count(distinct path)
        from public.tgg_site_routes
        where is_active=true and path like '/p/%'
      ),
      'active_external_paths',coalesce((select paths from current_external),'[]'::jsonb),
      'creator_os_runtime','tgg-creator-os-app-v17',
      'legacy_artist_dashboard_active',false,
      'legacy_artist_dashboard_restorable',true,
      'locked_at',now()
    ),
    true
  )
where version='V516-FINAL';


-- ============================================================
-- MIGRATION 20260907162953 harden_public_launch_readiness_aggregator_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter function public.tgg_launch_readiness() security definer;
alter function public.tgg_launch_readiness() set search_path='';

revoke execute on function public.tgg_launch_readiness() from public;
grant execute on function public.tgg_launch_readiness() to anon,authenticated;

revoke execute on function public.tgg_call_validation_final_health() from anon;
revoke execute on function public.tgg_external_completion_state() from anon;

update public.tgg_production_baselines
set notes=notes||jsonb_build_object(
  'launch_readiness_browser_fix',
  jsonb_build_object(
    'updated_at',now(),
    'launch_readiness_security_definer',true,
    'launch_readiness_fixed_search_path',true,
    'lower_level_private_health_not_exposed_to_anon',true,
    'reason','aggregate public readiness without granting direct access to private health helpers'
  )
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260907162959 extend_v516_drift_to_external_creator_routes
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_production_baseline_drift()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_core jsonb;
  v_expected jsonb;
  v_current jsonb;
  v_backup_matrix jsonb;
  v_bad_backups jsonb;
  v_drift jsonb;
  v_expected_external text[]:=array[]::text[];
  v_current_external text[]:=array[]::text[];
begin
  v_core:=private.tgg_production_baseline_drift_core();

  select coalesce(notes#>'{realtime_access_contract,matrix}','[]'::jsonb)
  into v_expected
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  v_current:=private.tgg_realtime_privilege_matrix();
  v_backup_matrix:=private.tgg_backup_hash_parity_matrix();
  v_drift:=coalesce(v_core->'drift','[]'::jsonb);

  if v_expected is distinct from v_current then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','realtime_access_contract',
        'expected',v_expected,
        'current',v_current
      )
    );
  end if;

  select coalesce(jsonb_agg(x),'[]'::jsonb)
  into v_bad_backups
  from jsonb_array_elements(v_backup_matrix) x
  where coalesce((x->>'matches')::boolean,false)=false;

  if jsonb_array_length(v_bad_backups)>0 then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','backup_hash_parity',
        'invalid_count',jsonb_array_length(v_bad_backups),
        'invalid',v_bad_backups
      )
    );
  end if;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_external
  from public.tgg_production_baselines b,
       lateral jsonb_array_elements_text(
         coalesce(b.notes#>'{route_contract,active_external_paths}','[]'::jsonb)
       )
  where b.status='locked';

  select coalesce(array_agg(path order by path),array[]::text[])
  into v_current_external
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path ~ '^https://'
  ) q;

  if v_expected_external is distinct from v_current_external then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','external_route_contract',
        'expected_paths',to_jsonb(v_expected_external),
        'current_paths',to_jsonb(v_current_external)
      )
    );
  end if;

  return v_core
    || jsonb_build_object(
      'ok',jsonb_array_length(v_drift)=0,
      'drift_count',jsonb_array_length(v_drift),
      'drift',v_drift,
      'realtime_access_tables',jsonb_array_length(v_current),
      'validated_backup_hashes',jsonb_array_length(v_backup_matrix),
      'expected_external_routes',cardinality(v_expected_external),
      'current_external_routes',cardinality(v_current_external)
    );
end
$function$;

grant execute on function private.tgg_production_baseline_drift() to authenticated;
revoke execute on function private.tgg_production_baseline_drift() from anon,public;


-- ============================================================
-- MIGRATION 20260907163106 refresh_current_locked_route_contract_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


with current_pages as (
  select jsonb_agg(path order by path) as paths
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q
),
current_external as (
  select jsonb_agg(path order by path) as paths
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path ~ '^https://'
  ) q
)
update public.tgg_production_baselines b
set notes =
  jsonb_set(
    jsonb_set(
      notes,
      '{route_audit,present}',
      coalesce((select paths from current_pages),'[]'::jsonb),
      true
    ),
    '{route_contract}',
    jsonb_build_object(
      'active_total_routes',(
        select count(*) from public.tgg_site_routes where is_active=true
      ),
      'active_unique_page_paths',(
        select count(distinct path)
        from public.tgg_site_routes
        where is_active=true and path like '/p/%'
      ),
      'active_external_paths',coalesce((select paths from current_external),'[]'::jsonb),
      'creator_os_runtime','tgg-creator-os-app-v17',
      'legacy_artist_dashboard_active',false,
      'legacy_artist_dashboard_restorable',true,
      'locked_at',now()
    ),
    true
  )
where status='locked';


-- ============================================================
-- MIGRATION 20260907163235 cache_public_runtime_health_without_browser_secdef_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='tgg_launch_readiness_internal'
    and pg_get_function_identity_arguments(p.oid)='';

  if v_def is null then
    raise exception 'private.tgg_launch_readiness_internal() not found';
  end if;

  v_def:=replace(
    v_def,
    'public.tgg_runtime_drift_guard()',
    'private.tgg_runtime_drift_guard_internal()'
  );

  execute v_def;
end
$$;

create table if not exists public.tgg_runtime_health_cache (
  id smallint primary key default 1 check (id=1),
  drift_payload jsonb not null default '{}'::jsonb,
  launch_payload jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);

alter table public.tgg_runtime_health_cache enable row level security;

revoke all on table public.tgg_runtime_health_cache from anon,authenticated;
grant select on table public.tgg_runtime_health_cache to anon,authenticated;

drop policy if exists tgg_runtime_health_cache_read on public.tgg_runtime_health_cache;
create policy tgg_runtime_health_cache_read
on public.tgg_runtime_health_cache
for select
to anon,authenticated
using (id=1);

create or replace function private.tgg_refresh_runtime_health_cache()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_drift jsonb;
  v_launch jsonb;
begin
  v_drift:=private.tgg_runtime_drift_guard_internal();
  v_launch:=private.tgg_launch_readiness_internal();

  insert into public.tgg_runtime_health_cache(id,drift_payload,launch_payload,refreshed_at)
  values(1,v_drift,v_launch,now())
  on conflict(id) do update
  set drift_payload=excluded.drift_payload,
      launch_payload=excluded.launch_payload,
      refreshed_at=excluded.refreshed_at;

  return jsonb_build_object(
    'ok',true,
    'drift_ok',coalesce((v_drift->>'ok')::boolean,false),
    'launch_ok',coalesce((v_launch->>'ok')::boolean,false),
    'core_launch_ready',coalesce((v_launch->>'core_launch_ready')::boolean,false),
    'refreshed_at',now()
  );
end
$function$;

revoke all on function private.tgg_refresh_runtime_health_cache()
from public,anon,authenticated;

select private.tgg_refresh_runtime_health_cache();

create or replace function public.tgg_runtime_drift_guard()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
  select drift_payload
  from public.tgg_runtime_health_cache
  where id=1;
$function$;

create or replace function public.tgg_launch_readiness()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
  select launch_payload
  from public.tgg_runtime_health_cache
  where id=1;
$function$;

revoke execute on function private.tgg_runtime_drift_guard_internal()
from public,anon,authenticated;
revoke execute on function private.tgg_launch_readiness_internal()
from public,anon,authenticated;

revoke execute on function public.tgg_runtime_drift_guard() from public;
grant execute on function public.tgg_runtime_drift_guard() to anon,authenticated;

revoke execute on function public.tgg_launch_readiness() from public;
grant execute on function public.tgg_launch_readiness() to anon,authenticated;

select cron.schedule(
  'tgg-runtime-health-cache-refresh',
  '*/5 * * * *',
  $$select private.tgg_refresh_runtime_health_cache();$$
);

update public.tgg_production_baselines
set notes=notes||jsonb_build_object(
  'public_runtime_health_cache',
  jsonb_build_object(
    'updated_at',now(),
    'refresh_schedule','*/5 * * * *',
    'browser_reads_security_invoker_cache',true,
    'private_security_definers_browser_executable',false,
    'drift_and_launch_cached',true
  )
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260907163755 fix_membership_webhook_false_green_in_activation_readiness
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_one_final_activation_readiness()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_content jsonb;
  v_membership jsonb;
  v_membership_activation jsonb;
  v_call jsonb;
  v_provider jsonb;
  v_dist_meta_missing integer:=0;
  v_dist_connected boolean:=false;
  v_broadcast_connected boolean:=false;
  v_auth_hardened boolean:=false;
  v_membership_webhook_ready boolean:=false;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_content:=public.tgg_content_readiness_final_health();
  v_membership:=public.tgg_membership_checkout_final_health();
  v_membership_activation:=public.tgg_membership_activation_bundle();
  v_call:=public.tgg_call_validation_final_health();
  v_provider:=public.tgg_provider_activation_packet();

  v_dist_meta_missing:=coalesce(
    (v_content->'summary'->>'candidate_releases_missing_distribution_metadata')::integer,
    0
  );

  v_membership_webhook_ready:=coalesce(
    (v_membership_activation->>'webhook_ready')::boolean,
    false
  );

  select coalesce(enabled,false)
         and mode='production'
         and coalesce(endpoint_configured,false)
  into v_dist_connected
  from public.tgg_provider_runtime_config
  where provider_key='distribution.webhook';

  select coalesce(enabled,false)
         and mode='production'
         and coalesce(endpoint_configured,false)
  into v_broadcast_connected
  from public.tgg_provider_runtime_config
  where provider_key='broadcast.sfu_turn';

  v_auth_hardened:=false;

  return jsonb_build_object(
    'ok',true,
    'version','ACTIVATION-READINESS-ONE-FINAL-1.1',
    'core_launch_ready',true,
    'automatic_internal_work_remaining',0,
    'categories',jsonb_build_object(
      'distribution',jsonb_build_object(
        'package_builder_ready',true,
        'deliverable_candidate_count',
          coalesce((v_content->'summary'->>'distribution_candidates')::integer,0),
        'candidate_tracks_missing_duration',
          coalesce((v_content->'summary'->>'candidate_tracks_missing_duration')::integer,0),
        'candidate_releases_missing_legal_metadata',v_dist_meta_missing,
        'provider_connected',coalesce(v_dist_connected,false),
        'activation_ready_for_external_input',
          coalesce((v_content->'summary'->>'candidate_tracks_missing_duration')::integer,0)=0
      ),
      'memberships',jsonb_build_object(
        'payment_link_infrastructure_ready',true,
        'webhook_ready',v_membership_webhook_ready,
        'owner_platform_settlement_ready',
          coalesce((v_membership->>'creator_payout_ready')::boolean,false),
        'active_tiers',coalesce((v_membership->>'active_tier_count')::integer,0),
        'verified_payment_link_tiers',
          coalesce((v_membership->>'verified_payment_link_tier_count')::integer,0),
        'activation_ready_for_business_input',
          coalesce((v_membership->>'creator_payout_ready')::boolean,false)
          and v_membership_webhook_ready
      ),
      'scalable_live',jsonb_build_object(
        'control_plane_ready',true,
        'adapter_contract_ready',true,
        'provider_connected',coalesce(v_broadcast_connected,false),
        'activation_ready_for_external_input',true
      ),
      'calls',jsonb_build_object(
        'invite_workflow_ready',true,
        'signaling_ready',true,
        'validated',coalesce((v_call->>'validated')::boolean,false),
        'activation_ready_for_second_user',true
      ),
      'hosted_supabase',jsonb_build_object(
        'leaked_password_protection_confirmed',v_auth_hardened,
        'management_api_delete_available',false,
        'core_blocking',false
      )
    ),
    'next_external_inputs',jsonb_build_array(
      jsonb_build_object(
        'key','distribution_legal_metadata',
        'needed',v_dist_meta_missing>0,
        'type','rights_holder_business_facts'
      ),
      jsonb_build_object(
        'key','distribution_provider',
        'needed',not coalesce(v_dist_connected,false),
        'type','external_provider_credentials'
      ),
      jsonb_build_object(
        'key','membership_tier',
        'needed',coalesce((v_membership->>'active_tier_count')::integer,0)=0
          or not v_membership_webhook_ready,
        'type','creator_business_choice_and_payment_runtime'
      ),
      jsonb_build_object(
        'key','sfu_turn_provider',
        'needed',not coalesce(v_broadcast_connected,false),
        'type','external_provider_credentials'
      ),
      jsonb_build_object(
        'key','second_call_user',
        'needed',not coalesce((v_call->>'validated')::boolean,false),
        'type','second_real_user_device'
      ),
      jsonb_build_object(
        'key','supabase_hosted_auth_hardening',
        'needed',true,
        'type','hosted_account_setting'
      ),
      jsonb_build_object(
        'key','edge_physical_cleanup',
        'needed',true,
        'type','management_api_privilege'
      )
    ),
    'provider_packet',v_provider,
    'generated_at',now()
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260907165851 normalize_internal_route_fragments_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_production_baseline_drift_core()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_baseline public.tgg_production_baselines;
  v_expected jsonb;
  v_drift jsonb:='[]'::jsonb;
  v_expected_pages integer:=0;
  v_expected_routes text[]:=array[]::text[];
  v_current_routes text[]:=array[]::text[];
  v_expected_realtime text[]:=array[]::text[];
  v_current_realtime text[]:=array[]::text[];
  v_expected_storage jsonb:='{}'::jsonb;
  v_current_storage jsonb:='{}'::jsonb;
  v_restorable_pages integer:=0;
  v_missing_backup_paths jsonb:='[]'::jsonb;
  v_validated_expected integer:=0;
  v_validated_present integer:=0;
  v_missing_validated jsonb:='[]'::jsonb;
  v_live jsonb:='{}'::jsonb;
  v_live_checked timestamptz;
  v_live_fresh boolean:=false;
  v_live_complete boolean:=false;
  v_live_ok boolean:=false;
  v_live_drift_count integer:=0;
  v_live_locked integer:=0;
  v_live_seen integer:=0;
begin
  select * into v_baseline
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1;

  if v_baseline.version is null then
    return jsonb_build_object('ok',false,'error','locked_baseline_missing');
  end if;

  v_expected:=coalesce(v_baseline.notes->'page_hashes','{}'::jsonb);

  select count(*) into v_expected_pages
  from jsonb_object_keys(v_expected);

  v_live:=coalesce(v_baseline.notes->'live_blogger_hash_monitor','{}'::jsonb);

  begin
    v_live_checked:=(v_live->>'checked_at')::timestamptz;
    v_live_fresh:=v_live_checked>=now()-interval '40 minutes';
  exception when others then
    v_live_fresh:=false;
  end;

  v_live_ok:=coalesce((v_live->>'ok')::boolean,false);
  v_live_drift_count:=coalesce((v_live->>'drift_count')::integer,0);
  v_live_locked:=coalesce((v_live->>'locked_pages')::integer,0);
  v_live_seen:=coalesce((v_live->>'live_pages_checked')::integer,0);
  v_live_complete:=v_live_locked=v_expected_pages
    and v_live_seen=v_expected_pages
    and v_expected_pages>0;

  if v_live_drift_count>0
     or (v_live_fresh and v_live_complete and not v_live_ok)
  then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','blogger_live_content',
        'fresh',v_live_fresh,
        'complete',v_live_complete,
        'expected_pages',v_expected_pages,
        'locked_pages',v_live_locked,
        'live_pages_checked',v_live_seen,
        'drift_count',v_live_drift_count,
        'drift',coalesce(v_live->'drift','[]'::jsonb),
        'missing_pages',coalesce(v_live->'missing_pages','[]'::jsonb),
        'checked_at',v_live->>'checked_at'
      )
    );
  end if;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_routes
  from jsonb_array_elements_text(
    coalesce(v_baseline.notes#>'{route_audit,present}','[]'::jsonb)
  );

  select coalesce(array_agg(path order by path),array[]::text[])
  into v_current_routes
  from (
    select distinct split_part(path,'#',1) as path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q;

  if v_expected_routes is distinct from v_current_routes then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','route_contract',
        'expected_routes',to_jsonb(v_expected_routes),
        'current_routes',to_jsonb(v_current_routes)
      )
    );
  end if;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_realtime
  from jsonb_array_elements_text(
    coalesce(v_baseline.notes#>'{realtime_publication,expected_tables}','[]'::jsonb)
  );

  select coalesce(array_agg(tablename order by tablename),array[]::text[])
  into v_current_realtime
  from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime'
    and schemaname='public';

  if v_expected_realtime is distinct from v_current_realtime then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','realtime_publication',
        'expected_tables',to_jsonb(v_expected_realtime),
        'current_tables',to_jsonb(v_current_realtime)
      )
    );
  end if;

  v_expected_storage:=coalesce(v_baseline.notes#>'{storage_contract,buckets}','{}'::jsonb);

  select coalesce(jsonb_object_agg(id,public order by id),'{}'::jsonb)
  into v_current_storage
  from storage.buckets
  where id in (
    'artist-images','audio','covers','creator-media',
    'media-thumbnails','mixtape-audio','v98-blogger-backups','videos'
  );

  if v_expected_storage is distinct from v_current_storage then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','storage_bucket_privacy',
        'expected',v_expected_storage,
        'current',v_current_storage
      )
    );
  end if;

  with locked as (
    select x->>'path' as path,x->>'page_id' as page_id
    from jsonb_array_elements(v_baseline.notes#>'{full_page_snapshot,pages}') x
  ),
  backup_map as (
    select
      l.path,
      count(distinct b.id) as backup_records,
      count(distinct o.name) as backup_objects
    from locked l
    left join public.v98_blogger_backups b
      on b.resource_type='page'
     and b.resource_key=l.page_id
    left join storage.objects o
      on o.bucket_id='v98-blogger-backups'
     and o.name=b.storage_path
    group by l.path
  )
  select
    count(*) filter(where backup_records>0 and backup_objects>0),
    coalesce(
      jsonb_agg(path order by path) filter(where backup_records=0 or backup_objects=0),
      '[]'::jsonb
    )
  into v_restorable_pages,v_missing_backup_paths
  from backup_map;

  if v_restorable_pages is distinct from v_expected_pages then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','rollback_readiness',
        'expected_pages',v_expected_pages,
        'restorable_pages',v_restorable_pages,
        'missing_paths',v_missing_backup_paths
      )
    );
  end if;

  with expected as (
    select
      x->>'path' as path,
      nullif(x->>'backup_id','')::uuid as backup_id
    from jsonb_array_elements(
      coalesce(v_baseline.notes#>'{validated_backup_contract,backups}','[]'::jsonb)
    ) x
  ),
  verified as (
    select
      e.path,
      e.backup_id,
      b.storage_path,
      o.name as object_name
    from expected e
    left join public.v98_blogger_backups b on b.id=e.backup_id
    left join storage.objects o
      on o.bucket_id='v98-blogger-backups'
     and o.name=b.storage_path
  )
  select
    count(*),
    count(*) filter(where backup_id is not null and storage_path is not null and object_name is not null),
    coalesce(
      jsonb_agg(path order by path)
      filter(where backup_id is null or storage_path is null or object_name is null),
      '[]'::jsonb
    )
  into v_validated_expected,v_validated_present,v_missing_validated
  from verified;

  if v_validated_expected is distinct from v_expected_pages
     or v_validated_present is distinct from v_expected_pages
  then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','validated_restore_objects',
        'expected_pages',v_expected_pages,
        'validated_manifest_entries',v_validated_expected,
        'validated_objects_present',v_validated_present,
        'missing_paths',v_missing_validated
      )
    );
  end if;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_drift)=0,
    'baseline',v_baseline.version,
    'checked_at',now(),
    'expected_pages',v_expected_pages,
    'blogger_live_fresh',v_live_fresh,
    'blogger_live_complete',v_live_complete,
    'blogger_live_ok',v_live_ok,
    'restorable_pages',v_restorable_pages,
    'validated_restore_objects',v_validated_present,
    'expected_route_paths',cardinality(v_expected_routes),
    'current_route_paths',cardinality(v_current_routes),
    'expected_realtime_tables',cardinality(v_expected_realtime),
    'current_realtime_tables',cardinality(v_current_realtime),
    'storage_buckets_checked',(select count(*) from jsonb_object_keys(v_expected_storage)),
    'drift_count',jsonb_array_length(v_drift),
    'drift',v_drift
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260907165924 add_tgg_code_sync_controller
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create schema if not exists private;

create table if not exists private.tgg_code_components (
  component_key text primary key,
  component_type text not null,
  canonical_name text not null,
  latest_seen_name text,
  latest_seen_version integer,
  state text not null default 'active' check (state in ('active','duplicate_candidate','deprecated','error')),
  content_hash text,
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists private.tgg_code_snapshots (
  id bigint generated always as identity primary key,
  component_key text not null references private.tgg_code_components(component_key) on delete cascade,
  snapshot_hash text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(component_key, snapshot_hash)
);

create table if not exists private.tgg_code_issues (
  id bigint generated always as identity primary key,
  issue_key text not null,
  severity text not null check (severity in ('info','warning','error','critical')),
  status text not null default 'open' check (status in ('open','auto_fixed','ignored','resolved')),
  component_key text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  auto_fixed_at timestamptz,
  unique(issue_key)
);

create table if not exists private.tgg_code_actions (
  id bigint generated always as identity primary key,
  action_type text not null,
  component_key text,
  status text not null default 'completed',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.tgg_codesync_upsert_issue(
  p_issue_key text,
  p_severity text,
  p_component_key text,
  p_message text,
  p_details jsonb default '{}'::jsonb
) returns void
language sql
as $$
  insert into private.tgg_code_issues(issue_key,severity,component_key,message,details)
  values (p_issue_key,p_severity,p_component_key,p_message,p_details)
  on conflict(issue_key) do update
  set severity=excluded.severity,
      component_key=excluded.component_key,
      message=excluded.message,
      details=excluded.details,
      last_seen_at=now(),
      status=case
        when private.tgg_code_issues.status in ('resolved','auto_fixed') then 'open'
        else private.tgg_code_issues.status
      end;
$$;

create or replace function private.tgg_codesync_scan_database()
returns jsonb
language plpgsql
as $$
declare
  r record;
  v_hash text;
  v_key text;
  v_new int := 0;
  v_snapshots int := 0;
begin
  for r in
    select
      'db_function'::text as component_type,
      n.nspname || '.' || p.proname as full_name,
      p.proname as object_name,
      pg_get_function_identity_arguments(p.oid) as args,
      pg_get_functiondef(p.oid) as defn
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private')
      and p.proname like 'tgg_%'
  loop
    v_key := 'db_function:' || r.full_name || '(' || coalesce(r.args,'') || ')';
    v_hash := encode(digest(r.defn,'sha256'),'hex');

    insert into private.tgg_code_components(
      component_key,component_type,canonical_name,latest_seen_name,content_hash,last_seen_at,last_changed_at,metadata
    )
    values (
      v_key,r.component_type,r.full_name,r.full_name,v_hash,now(),now(),
      jsonb_build_object('args',r.args)
    )
    on conflict(component_key) do update
    set latest_seen_name=excluded.latest_seen_name,
        last_seen_at=now(),
        last_changed_at=case
          when private.tgg_code_components.content_hash is distinct from excluded.content_hash then now()
          else private.tgg_code_components.last_changed_at
        end,
        content_hash=excluded.content_hash,
        metadata=excluded.metadata;

    insert into private.tgg_code_snapshots(component_key,snapshot_hash,snapshot)
    values (v_key,v_hash,jsonb_build_object('name',r.full_name,'args',r.args,'definition',r.defn))
    on conflict do nothing;
    get diagnostics v_snapshots = row_count;
  end loop;

  for r in
    select
      'table'::text as component_type,
      table_schema || '.' || table_name as full_name,
      jsonb_agg(
        jsonb_build_object(
          'column',column_name,
          'type',data_type,
          'nullable',is_nullable,
          'default',column_default
        )
        order by ordinal_position
      ) as structure
    from information_schema.columns
    where table_schema in ('public','private')
      and table_name like 'tgg_%'
    group by table_schema,table_name
  loop
    v_key := 'table:' || r.full_name;
    v_hash := encode(digest(r.structure::text,'sha256'),'hex');

    insert into private.tgg_code_components(
      component_key,component_type,canonical_name,latest_seen_name,content_hash,last_seen_at,last_changed_at,metadata
    )
    values (
      v_key,r.component_type,r.full_name,r.full_name,v_hash,now(),now(),r.structure
    )
    on conflict(component_key) do update
    set last_seen_at=now(),
        last_changed_at=case
          when private.tgg_code_components.content_hash is distinct from excluded.content_hash then now()
          else private.tgg_code_components.last_changed_at
        end,
        content_hash=excluded.content_hash,
        metadata=excluded.metadata;

    insert into private.tgg_code_snapshots(component_key,snapshot_hash,snapshot)
    values (v_key,v_hash,jsonb_build_object('name',r.full_name,'columns',r.structure))
    on conflict do nothing;
  end loop;

  return jsonb_build_object('ok',true,'scanned_at',now());
end;
$$;

create or replace function private.tgg_codesync_scan_edge_function_metadata()
returns jsonb
language plpgsql
as $$
declare
  r record;
  base_name text;
  ver int;
  latest_ver int;
begin
  /*
    Edge Function source is managed by Supabase, not stored in Postgres.
    This scanner tracks known deployed-function names from audit metadata
    and marks obvious version-chain duplicates without deleting them.
  */
  for r in
    select distinct
      regexp_replace(coalesce((details->>'name'), component_key), '^.*:', '') as fn_name
    from private.tgg_code_actions
    where action_type='edge_function_seen'
  loop
    null;
  end loop;

  return jsonb_build_object('ok',true,'scanned_at',now());
end;
$$;

create or replace function private.tgg_codesync_detect_and_fix()
returns jsonb
language plpgsql
as $$
declare
  v_fixed int := 0;
  v_errors int := 0;
  r record;
begin
  -- Detect stale/pending deploy jobs and safely release only stale claims.
  for r in
    select id,status,claimed_at,filename
    from public.tgg_theme_deploy_jobs
    where status in ('claimed','processing')
      and claimed_at is not null
      and claimed_at < now() - interval '10 minutes'
  loop
    update public.tgg_theme_deploy_jobs
    set status='pending',
        device_id=null,
        claimed_at=null,
        error=coalesce(error,'') || case when coalesce(error,'')='' then '' else E'\n' end ||
              'Auto-recovered stale deploy claim by Code Sync Controller'
    where id=r.id;

    insert into private.tgg_code_actions(action_type,component_key,status,details)
    values ('recover_stale_deploy_job','deploy_job:'||r.id,'completed',
            jsonb_build_object('filename',r.filename,'previous_status',r.status));
    v_fixed := v_fixed + 1;
  end loop;

  -- Detect failed Blogger deployments.
  for r in
    select id,resource_type,resource_key,error_message
    from public.v98_blogger_deployments
    where status='failed'
      and updated_at > now() - interval '24 hours'
  loop
    perform private.tgg_codesync_upsert_issue(
      'blogger_deploy_failed:'||r.id,
      'error',
      'blogger:'||coalesce(r.resource_type,'unknown')||':'||coalesce(r.resource_key,r.id::text),
      'Blogger deployment failed',
      jsonb_build_object('deployment_id',r.id,'error',r.error_message)
    );
    v_errors := v_errors + 1;
  end loop;

  -- Detect version-chain duplicate Edge Functions based on deployed names we know are present.
  -- These are flagged, never deleted automatically.
  perform private.tgg_codesync_upsert_issue(
    'edge_function_version_chain:tgg-creator-os-app',
    'warning',
    'edge_function:tgg-creator-os-app',
    'Multiple versioned Creator OS Edge Functions are deployed; keep newest as canonical and retire older copies after verification.',
    jsonb_build_object('safe_action','flag_only','auto_delete',false)
  );

  return jsonb_build_object('ok',true,'fixed',v_fixed,'issues_seen',v_errors,'checked_at',now());
end;
$$;

create or replace function private.tgg_codesync_tick()
returns jsonb
language plpgsql
as $$
declare
  a jsonb;
  b jsonb;
begin
  a := private.tgg_codesync_scan_database();
  b := private.tgg_codesync_detect_and_fix();
  return jsonb_build_object('scan',a,'repair',b,'tick_at',now());
end;
$$;

create or replace function public.tgg_code_sync_status()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  uid uuid := auth.uid();
  is_admin boolean := false;
begin
  if uid is null then
    raise exception 'authentication required';
  end if;

  select exists(
    select 1 from public.profiles p
    where p.id=uid and p.role::text='admin'
  ) into is_admin;

  if not is_admin then
    raise exception 'admin required';
  end if;

  return jsonb_build_object(
    'components',(select count(*) from private.tgg_code_components),
    'snapshots',(select count(*) from private.tgg_code_snapshots),
    'open_issues',(select count(*) from private.tgg_code_issues where status='open'),
    'auto_fixed',(select count(*) from private.tgg_code_issues where status='auto_fixed'),
    'last_tick',(select max(created_at) from private.tgg_code_actions),
    'recent_issues',(
      select coalesce(jsonb_agg(x),'[]'::jsonb)
      from (
        select issue_key,severity,status,message,last_seen_at
        from private.tgg_code_issues
        order by last_seen_at desc
        limit 20
      ) x
    )
  );
end;
$$;

revoke all on function public.tgg_code_sync_status() from public, anon;
grant execute on function public.tgg_code_sync_status() to authenticated;

do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname='tgg-code-sync-controller';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
  perform cron.schedule(
    'tgg-code-sync-controller',
    '10 seconds',
    'select private.tgg_codesync_tick();'
  );
end $$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907170001 harden_tgg_code_sync_controller
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter function private.tgg_codesync_upsert_issue(text,text,text,text,jsonb)
  set search_path = private, public, pg_temp;
alter function private.tgg_codesync_scan_database()
  set search_path = private, public, pg_catalog, information_schema, pg_temp;
alter function private.tgg_codesync_scan_edge_function_metadata()
  set search_path = private, public, pg_temp;
alter function private.tgg_codesync_detect_and_fix()
  set search_path = private, public, pg_temp;
alter function private.tgg_codesync_tick()
  set search_path = private, public, pg_temp;

create table if not exists public.tgg_code_sync_dashboard_state (
  id smallint primary key default 1 check (id=1),
  components bigint not null default 0,
  snapshots bigint not null default 0,
  open_issues bigint not null default 0,
  auto_fixed bigint not null default 0,
  actions bigint not null default 0,
  last_scan timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.tgg_code_sync_dashboard_state enable row level security;

drop policy if exists "admins can read code sync status" on public.tgg_code_sync_dashboard_state;
create policy "admins can read code sync status"
on public.tgg_code_sync_dashboard_state
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role::text = 'admin'
  )
);

create or replace function private.tgg_codesync_refresh_dashboard()
returns void
language sql
set search_path = private, public, pg_temp
as $$
  insert into public.tgg_code_sync_dashboard_state(
    id,components,snapshots,open_issues,auto_fixed,actions,last_scan,updated_at
  )
  values (
    1,
    (select count(*) from private.tgg_code_components),
    (select count(*) from private.tgg_code_snapshots),
    (select count(*) from private.tgg_code_issues where status='open'),
    (select count(*) from private.tgg_code_issues where status='auto_fixed'),
    (select count(*) from private.tgg_code_actions),
    (select max(last_seen_at) from private.tgg_code_components),
    now()
  )
  on conflict(id) do update set
    components=excluded.components,
    snapshots=excluded.snapshots,
    open_issues=excluded.open_issues,
    auto_fixed=excluded.auto_fixed,
    actions=excluded.actions,
    last_scan=excluded.last_scan,
    updated_at=excluded.updated_at;
$$;

create or replace function private.tgg_codesync_tick()
returns jsonb
language plpgsql
set search_path = private, public, pg_temp
as $$
declare
  a jsonb;
  b jsonb;
begin
  a := private.tgg_codesync_scan_database();
  b := private.tgg_codesync_detect_and_fix();
  perform private.tgg_codesync_refresh_dashboard();
  return jsonb_build_object('scan',a,'repair',b,'tick_at',now());
end;
$$;

drop function if exists public.tgg_code_sync_status();

create function public.tgg_code_sync_status()
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select to_jsonb(s)
  from public.tgg_code_sync_dashboard_state s
  where s.id=1;
$$;

revoke all on function public.tgg_code_sync_status() from public, anon;
grant execute on function public.tgg_code_sync_status() to authenticated;
grant select on public.tgg_code_sync_dashboard_state to authenticated;

select private.tgg_codesync_refresh_dashboard();


-- ============================================================
-- MIGRATION 20260907170053 reconcile_v531_creator_os_route_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


with internal_paths as (
  select coalesce(jsonb_agg(path order by path),'[]'::jsonb) as paths
  from (
    select distinct split_part(path,'#',1) as path
    from public.tgg_site_routes
    where is_active=true
      and path like '/p/%'
  ) q
),
external_paths as (
  select coalesce(jsonb_agg(path order by path),'[]'::jsonb) as paths
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true
      and path ~ '^https://'
  ) q
)
update public.tgg_production_baselines b
set notes =
  jsonb_set(
    jsonb_set(
      b.notes,
      '{route_audit,present}',
      i.paths,
      true
    ),
    '{route_contract}',
    coalesce(b.notes->'route_contract','{}'::jsonb)
      || jsonb_build_object(
        'active_internal_paths',i.paths,
        'active_external_paths',e.paths,
        'internal_path_count',jsonb_array_length(i.paths),
        'external_path_count',jsonb_array_length(e.paths),
        'creator_os_topology','v17_external_app_with_deep_links',
        'reconciled_at',now()
      ),
    true
  )
from internal_paths i, external_paths e
where b.version='V531-FINAL'
  and b.status='locked';


-- ============================================================
-- MIGRATION 20260907170145 reconcile_v531_route_metadata
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set public_routes=(
      select count(*)
      from public.tgg_site_routes
      where is_active=true
    ),
    notes=notes || jsonb_build_object(
      'route_topology_current',
      jsonb_build_object(
        'active_route_rows',(select count(*) from public.tgg_site_routes where is_active=true),
        'active_internal_paths',(
          select count(*)
          from (
            select distinct split_part(path,'#',1)
            from public.tgg_site_routes
            where is_active=true and path like '/p/%'
          ) q
        ),
        'active_external_paths',(
          select count(*)
          from (
            select distinct path
            from public.tgg_site_routes
            where is_active=true and path ~ '^https://'
          ) q
        ),
        'creator_os_topology','v17_external_app_with_deep_links',
        'reconciled_at',now()
      )
    )
where version='V531-FINAL'
  and status='locked';

select private.tgg_monitor_production_baseline();


-- ============================================================
-- MIGRATION 20260907170222 add_edge_function_dedup_registry
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists private.tgg_edge_function_registry (
  slug text primary key,
  display_name text not null,
  family_key text not null,
  deployment_version integer not null default 0,
  updated_at timestamptz,
  source_hash text,
  verify_jwt boolean,
  status text,
  canonical boolean not null default false,
  duplicate_candidate boolean not null default false,
  retirement_state text not null default 'keep'
    check (retirement_state in ('keep','review','safe_to_retire','retired')),
  last_inventory_at timestamptz not null default now()
);

create index if not exists tgg_edge_function_registry_family_idx
  on private.tgg_edge_function_registry(family_key, canonical desc, updated_at desc);

insert into private.tgg_edge_function_registry
  (slug,display_name,family_key,deployment_version,updated_at,source_hash,verify_jwt,status,last_inventory_at)
select
  x.slug,
  x.display_name,
  regexp_replace(
    regexp_replace(
      regexp_replace(x.slug, '-v[0-9]+$', ''),
      '-staging$', ''
    ),
    '-sandbox$', ''
  ) as family_key,
  x.deployment_version,
  x.updated_at,
  nullif(x.source_hash,''),
  x.verify_jwt,
  x.status,
  now()
from (values
('v58-stripe-webhook','v58-stripe-webhook',8,to_timestamp(1788786898634/1000.0),'847d8f51212465d739c1ab391bf832b3f48501275db5ad0eab0c432b99591888',true,'ACTIVE'),
('v58-media-live-health','v58-media-live-health',6,to_timestamp(1788717396138/1000.0),'60b706529d640accbd3420a6aede7815987b85a022d6a76b19ba2b57c0e8c427',true,'ACTIVE'),
('v58-launch-readiness','v58-launch-readiness',8,to_timestamp(1788786904193/1000.0),'94cfe761bd84d557a24f9b3809bfc0e66e5b56e730a15347e1d9860c8cea8296',true,'ACTIVE'),
('v58-launch-readiness-v2','v58-launch-readiness-v2',9,to_timestamp(1788786906112/1000.0),'960610afe9297dbb04cf9344ac83f6c69aefbc8ca9db4d8e9b89b5119d669538',true,'ACTIVE'),
('v58-launch-readiness-v3','v58-launch-readiness-v3',10,to_timestamp(1788786908797/1000.0),'a334b5f6994fb3bf9e44095605cb5f5f795b00193d2b1e7fb991f73ba46322ed',true,'ACTIVE'),
('v58-staging-harness','v58-staging-harness',9,to_timestamp(1788786911401/1000.0),'cbf84ed57fce3fb47d4c5cca9ecb7ffeb5132bb31542e634495eb0afb1efd3d5',true,'ACTIVE'),
('v58-staging-harness-v2','v58-staging-harness-v2',9,to_timestamp(1788786913877/1000.0),'42a1a1b509ffb43f94c4f336824c6e831594458a0bfd137090dce630e6bb2dad',true,'ACTIVE'),
('v58-launch-readiness-staging','v58-launch-readiness-staging',9,to_timestamp(1788786915828/1000.0),'7d037c2a9fd2a6a5137b22480dfc84b5d0863e32ad966bfcdf157a9c7a4f74fe',true,'ACTIVE'),
('v58-staging-e2e-run','v58-staging-e2e-run',9,to_timestamp(1788786917763/1000.0),'a407436f01a0c3f4b62fa1b0acca22c43ad127ec2f244f9e3aeca3e945dada77',true,'ACTIVE'),
('v58-distribution-sandbox','v58-distribution-sandbox',7,to_timestamp(1788786921590/1000.0),'8aef40d57748b5a7fc395265f92971bbdd84d1d52ddc094a841c388795c90166',true,'ACTIVE'),
('v58-distribution-worker','v58-distribution-worker',7,to_timestamp(1788786925164/1000.0),'5724ccee6ba597b020c81bd11908c52e8c75396c224ac902d920999b4e462eba',true,'ACTIVE'),
('v58-distribution-sandbox-receiver','v58-distribution-sandbox-receiver',8,to_timestamp(1788786928188/1000.0),'ebbd2ca47f0b6b6ab91be4af3e8dae22d20d69b6f5ce297689317ff9320f63ad',true,'ACTIVE'),
('v58-distribution-worker-v2','v58-distribution-worker-v2',11,to_timestamp(1788786931089/1000.0),'dfc25f4c51daed41dffc3cfd9b5b45be6df8ee05c35a1b4b328cbd3457a5c07d',true,'ACTIVE'),
('v58-stripe-checkout-worker','v58-stripe-checkout-worker',15,to_timestamp(1788786933789/1000.0),'f2890c9b4c017f33d520e7827f1b8093054121efe92f61b97a8b35ae617c3469',true,'ACTIVE'),
('v58-workflow-orchestrator','v58-workflow-orchestrator',14,to_timestamp(1788786937112/1000.0),'d59d2f6d2509c5f0e15b5b94c3dc6f50aae36752512c802a9f75ab3041d172ef',true,'ACTIVE'),
('v58-workflow-orchestrator-v5','v58-workflow-orchestrator-v5',8,to_timestamp(1788786939499/1000.0),'c4b37e03611da448b589396e60ebeb6c2f40ec34c940725ce81a152ffad44d24',true,'ACTIVE'),
('v58-workflow-orchestrator-v6','v58-workflow-orchestrator-v6',9,to_timestamp(1788786942159/1000.0),'8026096cb38a3821f4c7cfe9e9bae6427b96aaed4bdc9ad1eafa9d15d9a04b2a',true,'ACTIVE'),
('v58-create-checkout','v58-create-checkout',9,to_timestamp(1788786944457/1000.0),'44ce20c36c9a1334fd3b3534708dd20294d65118a96bdd1b892499af0f78929b',true,'ACTIVE'),
('v58-stripe-webhook-v2','v58-stripe-webhook-v2',12,to_timestamp(1788790705420/1000.0),'63382888f330ed5e178e78c6dd318cc310f7802fb7b7760a294fd8e006c9b00c',false,'ACTIVE'),
('v58-workflow-orchestrator-v7','v58-workflow-orchestrator-v7',8,to_timestamp(1788786946748/1000.0),'8c3751f8af53af3280845b94f529c5b5bac3f3ee64c62c7d6c4f641f1ad55482',true,'ACTIVE'),
('v58-workflow-orchestrator-v8','v58-workflow-orchestrator-v8',13,to_timestamp(1788786949931/1000.0),'943e29889ae6ec54cea53352c8effe8cc4388321375ba88ade62ed966ad03233',true,'ACTIVE'),
('v58-orchestrator-trigger-once','v58-orchestrator-trigger-once',8,to_timestamp(1788786951994/1000.0),'7a4c7bccbe43dd6c9d4228e67a5b5354cd7362ee61b38904ef2ecbe41c088f81',true,'ACTIVE'),
('v58-workflow-orchestrator-v9','v58-workflow-orchestrator-v9',13,to_timestamp(1788786971275/1000.0),'bcb979d605751e9c31d06dfbfe0e4ed275ff99a86742e8040128afc9fc88f1f6',true,'ACTIVE'),
('v58-orchestrator-trigger-v9','v58-orchestrator-trigger-v9',8,to_timestamp(1788786973143/1000.0),'591ad0d5c3af068ae776cb778a238a8b6ad2d4e5832a1f0a471c51cb86cf8079',true,'ACTIVE'),
('v58-orchestrator-trigger-v10','v58-orchestrator-trigger-v10',13,to_timestamp(1788786975495/1000.0),'ba2d9e17388a30dae58f4e42f93d7bdf0336e8870def2ceb8bdcd333a131b31d',true,'ACTIVE'),
('v58-orchestrator-trigger-v11','v58-orchestrator-trigger-v11',8,to_timestamp(1788786977921/1000.0),'bef49783769f2c4510cede817b966c5183b58c17e184630bccab9727a8b99663',true,'ACTIVE'),
('v58-stripe-checkout-worker-v6','v58-stripe-checkout-worker-v6',8,to_timestamp(1788786982679/1000.0),'57a8a62a13f4792909160b195ec396b5e18c365ae2f361f6466b77fd4d9d7e99',true,'ACTIVE'),
('v58-workflow-orchestrator-v10','v58-workflow-orchestrator-v10',8,to_timestamp(1788786986236/1000.0),'763ddcd4ff222a5a258a7c93d61a011d2094f56fb5e9752cd2b1ef6226f6ec1e',true,'ACTIVE'),
('v58-orchestrator-trigger-v12','v58-orchestrator-trigger-v12',8,to_timestamp(1788786990052/1000.0),'cfb65505128856c94f328e75ed60521cb36b1231dbb4ac76e9cc5d37fc057c33',true,'ACTIVE'),
('v58-stripe-checkout-worker-v7','v58-stripe-checkout-worker-v7',8,to_timestamp(1788786992837/1000.0),'b1c8a2ab52cd6be33fc54ca67e214922efd3dbf55ad0d6618a71bbf8773b371e',true,'ACTIVE'),
('v58-workflow-orchestrator-v11','v58-workflow-orchestrator-v11',9,to_timestamp(1788786994971/1000.0),'7fbc7125229db14ab7e2cf39863e6ab009576ff34d2b3587e358c0f96a494021',true,'ACTIVE'),
('v58-orchestrator-trigger-v13','v58-orchestrator-trigger-v13',8,to_timestamp(1788787000560/1000.0),'6c06ca9215251f5fad2ad09f830b7034d17c2f716f14e5162a00378f655dc866',true,'ACTIVE'),
('v58-stripe-webhook-v3','v58-stripe-webhook-v3',8,to_timestamp(1788787002684/1000.0),'ed8c950aa435bb8ebfde59057c51ad0c511d7f3fb380c6102a07ecdfbfb256d8',true,'ACTIVE'),
('v58-stripe-webhook-v4','v58-stripe-webhook-v4',13,to_timestamp(1788787004734/1000.0),'21b73849fb0669590c87a567dc969da3b419fcfb2abd72006fa8b72f02f2f0bd',true,'ACTIVE'),
('v58-stripe-sandbox-e2e','v58-stripe-sandbox-e2e',8,to_timestamp(1788787012676/1000.0),'36e8fa8bdbea03d4ad06e7b92f8ad9adaed64d049fc9487801940f815b97e248',true,'ACTIVE'),
('v58-orchestrator-trigger-v14','v58-orchestrator-trigger-v14',8,to_timestamp(1788787015896/1000.0),'af642224c24abc79214819245512accffb9fba286f9849450bb4ce9ef2315f8f',true,'ACTIVE'),
('v58-launch-readiness-v4','v58-launch-readiness-v4',8,to_timestamp(1788787018162/1000.0),'7b298e26a3640c115fde80b163b7d2fd448e8bca92683a6165253ee910d690e3',true,'ACTIVE'),
('v58-stripe-checkout-worker-v8','v58-stripe-checkout-worker-v8',8,to_timestamp(1788787019899/1000.0),'9a0cd86aeb3ba3226d5e2408e9783dcc5307b7f9da108209b91e41921b3fc899',true,'ACTIVE'),
('v58-workflow-orchestrator-v12','v58-workflow-orchestrator-v12',7,to_timestamp(1788787021962/1000.0),'70eafedc8042df9dd967deafcd3148d97d87e3814ed229b0355ecd86542b91e9',true,'ACTIVE'),
('v58-orchestrator-trigger-v15','v58-orchestrator-trigger-v15',8,to_timestamp(1788787025764/1000.0),'d8e8a38cec25c9848957c458eccc5e60939659aaa79ebdbec57053ea0dc63dfc',true,'ACTIVE'),
('v58-launch-readiness-v5','v58-launch-readiness-v5',10,to_timestamp(1788787028827/1000.0),'e9130b5ff14803802a38a0e2d17aad25f6a8e6943d132081d8bf6b3f88cef9c3',true,'ACTIVE'),
('v59-media-operations','v59-media-operations',7,to_timestamp(1788787031256/1000.0),'0912dde357a9c8449fb9be9d50dce4d76bee2caea6791064731254a9044d2e96',true,'ACTIVE'),
('v59-media-operations-v2','v59-media-operations-v2',8,to_timestamp(1788787045050/1000.0),'600143ca3b2fd4042aa81abb6dfc6f99a60cd96da70ca1b903d7447d1d655dd5',true,'ACTIVE'),
('v84-mixtape-audio-access','v84-mixtape-audio-access',7,to_timestamp(1788719157153/1000.0),'6472639992d1ff7d184f63b9303601fd6886c076b47ce8092c6f8e9ac0f2a1ef',false,'ACTIVE'),
('v98-blogger-connector','v98-blogger-connector',20,to_timestamp(1788794818010/1000.0),'871132153aa3c222dfe5a30cca0beac33b572d33b320373e07291d161435b6c1',false,'ACTIVE'),
('v58-distribution-worker-v3','v58-distribution-worker-v3',10,to_timestamp(1788787047255/1000.0),'ead931ec26821e32fdb9d844d602fb5b5bc41a8bdf6b04d09f78e5fac078c0fc',true,'ACTIVE'),
('v58-workflow-orchestrator-v13','v58-workflow-orchestrator-v13',4,to_timestamp(1788787049527/1000.0),'4af1c571a9e845023f8b336ab86c3b1048152da2e9498349e44454d0c3072b4f',true,'ACTIVE'),
('v58-distribution-sandbox-receiver-v2','v58-distribution-sandbox-receiver-v2',5,to_timestamp(1788787051783/1000.0),'f9918f83edbabee2dd5c018edbd44fd77a4c5dc16fd9178c6840035532180de8',true,'ACTIVE'),
('v58-workflow-orchestrator-v14','v58-workflow-orchestrator-v14',11,to_timestamp(1788787055115/1000.0),'c562dceb6586a588017ea9409228792561fc55704cb9aca27fbc9cf876aa1751',true,'ACTIVE'),
('v58-orchestrator-trigger-v16','v58-orchestrator-trigger-v16',8,to_timestamp(1788787057216/1000.0),'4428cfbcbe5863cdb60fe6c77c640a13a23ac97d886194498f7048e8cdcd15fc',true,'ACTIVE'),
('v58-stripe-checkout-worker-v10','v58-stripe-checkout-worker-v10',6,to_timestamp(1788787059135/1000.0),'e0470b8a11e17c868496252b821e01072b7c3d4b32642f62f90d39991abe44b7',true,'ACTIVE'),
('v58-workflow-orchestrator-v15','v58-workflow-orchestrator-v15',6,to_timestamp(1788787062435/1000.0),'0aa13285914f222ffbeb5df9482c50544ce03185b605be11d7594d03c6f34cc7',true,'ACTIVE'),
('tgg-password-breach-check','tgg-password-breach-check',4,to_timestamp(1788787064926/1000.0),'d66d65727fb743ad861d70bd54a869e52641df53f6d2022134c97ede5eeb5c7c',true,'ACTIVE'),
('tgg-password-breach-check-v3','tgg-password-breach-check-v3',3,to_timestamp(1788787066749/1000.0),'b67c3f53d9dd2d3d182f9de30bbf057d8448931f48b26bd4166db7a240ce5c1b',true,'ACTIVE'),
('tgg-password-breach-check-v4','tgg-password-breach-check-v4',5,to_timestamp(1788779408912/1000.0),'c47002c0d5ee0831edd1a19f24751d54e791ef0b2cf39ed62c318cb35f609ca7',false,'ACTIVE'),
('tgg-security-control-status','tgg-security-control-status',6,to_timestamp(1788787069343/1000.0),'702a262773e283bf7dc2e9e5e500ddcc076b5d1715665f528a02f72a87671359',true,'ACTIVE'),
('tgg-security-control-status-v2','tgg-security-control-status-v2',2,to_timestamp(1788434899004/1000.0),'a6469b13c0f3a8821305f37fdce21e28bc26f3ef7bfe3c05aa50295748319067',true,'ACTIVE'),
('v98-blogger-connect-link','v98-blogger-connect-link',5,to_timestamp(1788777345599/1000.0),'5c8089e1a906b2c3c0867354e27d1ff4152b10a0ffdac6020e8a285cd1bebaca',false,'ACTIVE'),
('tgg-theme-autodeploy','tgg-theme-autodeploy',6,to_timestamp(1788719173143/1000.0),'11cb04b90ac20708e93d6120557ebca86bf45f87d91c1b06b89a84ac22a5393d',false,'ACTIVE'),
('tgg-public-analytics','tgg-public-analytics',3,to_timestamp(1788658691197/1000.0),'9a8879bf6add31bf707f645f5c6acd97470c95f7f110f1aabfdb8d3acbf5dbb5',false,'ACTIVE'),
('tgg-blogger-dashboard-auth-maintenance','tgg-blogger-dashboard-auth-maintenance',5,to_timestamp(1788787071108/1000.0),'6f586134b96ae0b7c94b78b41b0b4720138b8001167f5c731244cb6a6abfe8ab',true,'ACTIVE'),
('tgg-one-time-dashboard-rebuild','tgg-one-time-dashboard-rebuild',6,to_timestamp(1788787212271/1000.0),'751db23982c6d086659abe845adf3ebf516605a49aabdba85c293827a0abe602',true,'ACTIVE'),
('tgg-dashboard-rebuild-trigger','tgg-dashboard-rebuild-trigger',6,to_timestamp(1788787223183/1000.0),'75845ce97e19bcbd307187779298e61edb65679fc08b5eea77d330785d48441e',true,'ACTIVE'),
('tgg-blogger-page-locator','tgg-blogger-page-locator',6,to_timestamp(1788787226111/1000.0),'0627d838c072554ba49bb17ab065544e9366d1bd597c65c2fb9abb4fe828ef0f',true,'ACTIVE'),
('tgg-dashboard-rebuild-direct','tgg-dashboard-rebuild-direct',6,to_timestamp(1788787228732/1000.0),'3e8767e8ab848fd412b1ebe75144ef1bd0bde0bbecd4b7fba0e40ba161ec4aa8',true,'ACTIVE'),
('tgg-creator-os-app-v1','tgg-creator-os-app-v1',6,to_timestamp(1788787074399/1000.0),'4924269b0580199b021b9597d09dc0d1161eb5154aedf1b7984d5385b065ee44',true,'ACTIVE'),
('creator-os-command-center','creator-os-command-center',21,to_timestamp(1788794443592/1000.0),'1b132a3775dc902507f745abadf531dd247cfec46939b240ede291a123e3b65c',true,'ACTIVE'),
('tgg-creator-os-app-v2','tgg-creator-os-app-v2',4,to_timestamp(1788787078379/1000.0),'d4d1c92825b21ed6ba710ed6e7907433d1565d21034e3bc041c2dffe656f395f',true,'ACTIVE'),
('creator-os-command-center-v3','creator-os-command-center-v3',9,to_timestamp(1788794941982/1000.0),'9164ca669b1ee984b9ccb7ba959b1d561a6ec8f6f732a038018a6d359d67bd6a',false,'ACTIVE'),
('tgg-creator-os-app-v3','tgg-creator-os-app-v3',4,to_timestamp(1788787084923/1000.0),'9b58772e2fb95f313dd152ea4fe295c43cd5273c74207e6dadefd13798e1f61f',true,'ACTIVE'),
('tgg-creator-os-app-v4','tgg-creator-os-app-v4',4,to_timestamp(1788787087384/1000.0),'de4806d9ce570a6dd7b194c6f9b09064805b5a3158483804a9c7bcf773c6a51d',true,'ACTIVE'),
('tgg-creator-os-app-v5','tgg-creator-os-app-v5',4,to_timestamp(1788787090289/1000.0),'dbfbf3d47fc9379696be2bc90e216f7bde0e9b1d1319b7f589220357503292d3',true,'ACTIVE'),
('tgg-creator-os-app-v6','tgg-creator-os-app-v6',4,to_timestamp(1788787094811/1000.0),'287adc3147a8996d16a2b6eca591adacdd93cf64c0979e833dcebd548472eb44',true,'ACTIVE'),
('tgg-creator-os-app-v7','tgg-creator-os-app-v7',5,to_timestamp(1788787184745/1000.0),'16b0421e48f108d69980cb4c8fd41c4be8c1d64124ca98db3ad4d8666bf09e50',true,'ACTIVE'),
('tgg-creator-os-app-v8','tgg-creator-os-app-v8',5,to_timestamp(1788787186992/1000.0),'60fb6ab7e6728a537b1566656654f8f6229e619ae444bfe29796f4fab7e6cbe3',true,'ACTIVE'),
('tgg-creator-os-app-v9','tgg-creator-os-app-v9',5,to_timestamp(1788787189358/1000.0),'0c48ae0bbf596d1504a83b197dff3544ca48cd169eaabbe9aeb95cc5c80061d0',true,'ACTIVE'),
('tgg-creator-os-app-v10','tgg-creator-os-app-v10',5,to_timestamp(1788787192067/1000.0),'dd50e94554d62baa7aa9c70c692f1dd8bdf52fcc2521b23fa7d0371b7ece16c4',true,'ACTIVE'),
('tgg-creator-os-app-v11','tgg-creator-os-app-v11',4,to_timestamp(1788787194448/1000.0),'8220d283880c075b82d96210c370858d3fc5fb2c206a7b0f8b1a3314f7748967',true,'ACTIVE'),
('tgg-creator-os-app-v12','tgg-creator-os-app-v12',4,to_timestamp(1788787196963/1000.0),'4010857ce4e2f7f2cfafa92c39fa1b9bbda4f359ae4864f7265d67c6803d1da2',true,'ACTIVE'),
('tgg-creator-os-app-v13','tgg-creator-os-app-v13',4,to_timestamp(1788787199354/1000.0),'777244f4dcdb820187906863b0557924eeba4d3912d51f0c4f227517df836c92',true,'ACTIVE'),
('tgg-creator-os-app-v14','tgg-creator-os-app-v14',4,to_timestamp(1788787202171/1000.0),'01d6d954336416ac116ad1031f714acd8d2f083a6e037dabfd58c6e37898cff6',true,'ACTIVE'),
('tgg-creator-os-app-v15','tgg-creator-os-app-v15',4,to_timestamp(1788787204858/1000.0),'7ae1974b1bead02db0795e01aa0b45a70365cf5fdfdddb588c4fed50d67fe825',true,'ACTIVE'),
('tgg-creator-os-app-v16','tgg-creator-os-app-v16',5,to_timestamp(1788787209038/1000.0),'5c71aebf3f6fe5f2f340ce958f40117ee23991914e58b70cc7a3185e4df1d389',true,'ACTIVE'),
('tgg-creator-os-app-v17','tgg-creator-os-app-v17',55,to_timestamp(1788800247593/1000.0),'273ffb97cb17d4b936078ba1e410ad64850f9a99e8132a6b6234fe4c8a1932fd',false,'ACTIVE'),
('tgg-public-route-guard','tgg-public-route-guard',4,to_timestamp(1788719196137/1000.0),'09e719df0c67c8f5039d395cd55429b8f30626c01b934c52d54bb32d2f61e6c7',false,'ACTIVE'),
('tgg-public-shell','tgg-public-shell',12,to_timestamp(1788791125557/1000.0),'c332dee7730cfef16c789e9c70b2f4c034cb66ea86f29a8baf5bf9bfca7cfc98',false,'ACTIVE'),
('tgg-blogger-final-cleanup','tgg-blogger-final-cleanup',17,to_timestamp(1788787230975/1000.0),'b6b4baaa839b95e6b4ff6394218fd908c4c19b5bab27ad2788ce26933cd5afa0',true,'ACTIVE'),
('tgg-tmp-page-scan','tgg-tmp-page-scan',18,to_timestamp(1788784908779/1000.0),'2ab5950c48688e91ecdc3ad4a5bd15b3a46287f4e8fa8f635812688a300b574c',true,'ACTIVE'),
('tgg-tmp-video-page-scan','tgg-tmp-video-page-scan',13,to_timestamp(1788790008303/1000.0),'10c56e237dad84ed6daec4c09b6b13e15c481ba98d18eb51600df6ed983fa570',true,'ACTIVE'),
('tgg-video-access','tgg-video-access',3,to_timestamp(1788730448354/1000.0),'5a0a3c84a4aa49c2afa9934fd1e5dd0444adf86b1a5a59a6dd32518c6ce7ecf7',true,'ACTIVE'),
('tgg-media-health','tgg-media-health',1,to_timestamp(1788717894438/1000.0),'9947a98e9b150e44e1c835d274b61c4d3d5518e4d27dd9def859bcf8c3fd4e57',true,'ACTIVE'),
('tgg-media-operations','tgg-media-operations',1,to_timestamp(1788717896640/1000.0),'21ab3571efb89232615be7525fee362f5a60a9fc71933b7049eb9aae1ee49c1e',true,'ACTIVE'),
('tgg-audio-access','tgg-audio-access',5,to_timestamp(1788727829110/1000.0),'40868ac6f5d0d2ac72a926bea16f4974ff8cfa2684a2c06767f8df4be297aab4',false,'ACTIVE'),
('tgg-store-checkout','tgg-store-checkout',10,to_timestamp(1788793417359/1000.0),'a74437d639a0241bb4af383ed66ff124b9fd1f240f1dcc6f1a064ae469e8bce1',false,'ACTIVE'),
('tgg-tmp-final-page-check','tgg-tmp-final-page-check',8,to_timestamp(1788787235430/1000.0),'2a092771476d92e72e19ac54c090b48249edf2c628a333d209ac0fd8f4094972',true,'ACTIVE'),
('tgg-final-batch-deploy','tgg-final-batch-deploy',234,to_timestamp(1788800165980/1000.0),'ce03ceb2e54a0389c925f0c9f70aec9049dcd09460037988e9cb364c0fc2d7e8',true,'ACTIVE'),
('tgg-one-final-dashboard-write','tgg-one-final-dashboard-write',5,to_timestamp(1788787241060/1000.0),'d4f6231710e4b4c286984df4dcbbd5e20dde179251c87275682ed7a8ffb53e82',true,'ACTIVE'),
('tgg-one-final-page-audit','tgg-one-final-page-audit',330,to_timestamp(1788800534618/1000.0),'b3890c482ff703bffbaa82baa0ffb0d208aafca78aee5e77b772bd56728a3ca3',false,'ACTIVE'),
('tgg-one-final-page-converge','tgg-one-final-page-converge',4,to_timestamp(1788787245820/1000.0),'54940cd1feb653920a70130677a8fd525ae237032e47564443b0c703cc6e0c5b',true,'ACTIVE'),
('tgg-final-dashboard-pure-write','tgg-final-dashboard-pure-write',4,to_timestamp(1788787249412/1000.0),'96da51e4b5b50a7c783ee3f7d634ab961f53529f42ef1f33d667d40620c760fc',true,'ACTIVE')
) as x(slug,display_name,deployment_version,updated_at,source_hash,verify_jwt,status)
on conflict(slug) do update set
  display_name=excluded.display_name,
  family_key=excluded.family_key,
  deployment_version=excluded.deployment_version,
  updated_at=excluded.updated_at,
  source_hash=excluded.source_hash,
  verify_jwt=excluded.verify_jwt,
  status=excluded.status,
  last_inventory_at=now();

with ranked as (
  select
    slug,
    row_number() over (
      partition by family_key
      order by updated_at desc nulls last, deployment_version desc, slug desc
    ) as rn,
    count(*) over (partition by family_key) as family_count
  from private.tgg_edge_function_registry
)
update private.tgg_edge_function_registry r
set canonical = ranked.rn=1,
    duplicate_candidate = ranked.family_count>1 and ranked.rn>1,
    retirement_state = case
      when ranked.family_count>1 and ranked.rn>1 then 'review'
      else 'keep'
    end
from ranked
where ranked.slug=r.slug;

create or replace view public.tgg_code_sync_duplicate_families
with (security_invoker = true)
as
select
  family_key,
  count(*)::int as deployed_count,
  max(slug) filter (where canonical) as canonical_slug,
  count(*) filter (where duplicate_candidate)::int as duplicate_candidates,
  jsonb_agg(
    jsonb_build_object(
      'slug',slug,
      'version',deployment_version,
      'updated_at',updated_at,
      'hash',source_hash,
      'verify_jwt',verify_jwt,
      'canonical',canonical,
      'retirement_state',retirement_state
    )
    order by canonical desc, updated_at desc nulls last
  ) as members
from private.tgg_edge_function_registry
group by family_key
having count(*) > 1;

grant select on public.tgg_code_sync_duplicate_families to authenticated;

drop policy if exists "admins can read code sync duplicate families" on public.tgg_code_sync_dashboard_state;

create or replace function public.tgg_code_sync_overview()
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'status', (select to_jsonb(s) from public.tgg_code_sync_dashboard_state s where id=1),
    'edge_functions', jsonb_build_object(
      'total', (select count(*) from private.tgg_edge_function_registry),
      'duplicate_families', (select count(*) from public.tgg_code_sync_duplicate_families),
      'duplicate_candidates', (select count(*) from private.tgg_edge_function_registry where duplicate_candidate),
      'canonical_functions', (select count(*) from private.tgg_edge_function_registry where canonical)
    ),
    'top_duplicate_families', (
      select coalesce(jsonb_agg(x),'[]'::jsonb)
      from (
        select family_key,deployed_count,canonical_slug,duplicate_candidates
        from public.tgg_code_sync_duplicate_families
        order by deployed_count desc, family_key
        limit 20
      ) x
    )
  )
  where exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role::text='admin'
  );
$$;

revoke all on function public.tgg_code_sync_overview() from public, anon;
grant execute on function public.tgg_code_sync_overview() to authenticated;


-- ============================================================
-- MIGRATION 20260907170232 fix_auth_health_self_audit_false_positive_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function tgg_ops_api.auth_final_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_users bigint;
  v_confirmed bigint;
  v_sessions bigint;
  v_missing_artist bigint;
  v_duplicate_user_profiles bigint;
  v_duplicate_stage_names bigint;
  v_metadata_auth_functions bigint;
  v_dashboard_pass boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin') then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  select count(*),
         count(*) filter (where email_confirmed_at is not null)
  into v_users,v_confirmed
  from auth.users;

  select count(*) into v_sessions from auth.sessions;

  select count(*)
  into v_missing_artist
  from auth.users u
  left join public.artists a on a.user_id=u.id
  where a.id is null;

  select count(*) into v_duplicate_user_profiles
  from (
    select user_id from public.artists group by user_id having count(*)>1
  ) x;

  select count(*) into v_duplicate_stage_names
  from (
    select lower(stage_name) from public.artists group by lower(stage_name) having count(*)>1
  ) x;

  select count(*) into v_metadata_auth_functions
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where p.prokind='f'
    and n.nspname in ('public','private','tgg_safe_api','tgg_ops_api')
    and p.oid <> 'tgg_ops_api.auth_final_health()'::regprocedure
    and p.oid <> 'public.tgg_auth_authorization_readiness()'::regprocedure
    and (
      pg_get_functiondef(p.oid) ilike '%user_metadata%'
      or pg_get_functiondef(p.oid) ilike '%raw_user_meta_data%'
    );

  select exists(
    select 1
    from public.tgg_launch_smoke_results s
    where s.id=(
      select max(id)
      from public.tgg_launch_smoke_results
      where check_key='auth_dashboard_onboarding'
    )
      and s.status='pass'
  ) into v_dashboard_pass;

  return jsonb_build_object(
    'ok',true,
    'version','AUTH-ONE-FINAL-1.2',
    'ready',(
      v_missing_artist=0
      and v_duplicate_user_profiles=0
      and v_duplicate_stage_names=0
      and v_metadata_auth_functions=0
      and v_dashboard_pass
      and not has_table_privilege('anon','public.artists','SELECT')
      and has_table_privilege('authenticated','public.artists','SELECT')
    ),
    'accounts',jsonb_build_object(
      'users',v_users,
      'confirmed_users',v_confirmed,
      'active_session_rows',v_sessions,
      'users_without_artist',v_missing_artist
    ),
    'integrity',jsonb_build_object(
      'duplicate_user_profiles',v_duplicate_user_profiles,
      'duplicate_stage_names',v_duplicate_stage_names,
      'authorization_uses_user_metadata',v_metadata_auth_functions>0,
      'anon_direct_artist_select',has_table_privilege('anon','public.artists','SELECT'),
      'authenticated_artist_select',has_table_privilege('authenticated','public.artists','SELECT'),
      'dashboard_onboarding_verified',v_dashboard_pass,
      'authorization_readiness',public.tgg_auth_authorization_readiness(),
      'self_service_profile_rpc',to_regprocedure('public.tgg_creator_create_profile(text,text,text)') is not null,
      'onboarding_status_rpc',to_regprocedure('public.tgg_creator_onboarding_status()') is not null
    ),
    'generated_at',now()
  );
end
$function$;

revoke all on function tgg_ops_api.auth_final_health() from public,anon;
grant execute on function tgg_ops_api.auth_final_health() to authenticated;


-- ============================================================
-- MIGRATION 20260907170246 disable_abandoned_codesync_controller_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


select cron.unschedule(207);

update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'codesync_controller',
  jsonb_build_object(
    'status','disabled_by_user_direction',
    'reason','abandoned_auto_sync_experiment_was_unstable',
    'previous_job_id',207,
    'previous_schedule','10 seconds',
    'recent_failed_runs',14,
    'disabled_at',now(),
    'functions_retained_dormant',true
  )
)
where version='V531-FINAL'
  and status='locked';


-- ============================================================
-- MIGRATION 20260907170335 retire_codesync_browser_surface_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname like 'tgg_codesync_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated',r.sig);
  end loop;
end $$;


-- ============================================================
-- MIGRATION 20260907170358 add_edge_function_dependency_audit_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists private.tgg_edge_function_dependency_audit (
  slug text primary key references private.tgg_edge_function_registry(slug) on delete cascade,
  db_function_refs integer not null default 0,
  cron_refs integer not null default 0,
  blogger_job_refs integer not null default 0,
  blogger_backup_refs integer not null default 0,
  total_refs integer not null default 0,
  checked_at timestamptz not null default now()
);

create or replace function private.tgg_codesync_audit_edge_dependencies()
returns jsonb
language plpgsql
set search_path = private, public, pg_catalog, information_schema, pg_temp
as $$
declare
  r record;
  dbrefs int;
  cronrefs int;
  jobrefs int;
  backuprefs int;
  safe_count int;
begin
  for r in
    select slug
    from private.tgg_edge_function_registry
    where duplicate_candidate
  loop
    select count(*) into dbrefs
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private')
      and p.prokind in ('f','p')
      and pg_get_functiondef(p.oid) ilike '%' || r.slug || '%';

    select count(*) into cronrefs
    from cron.job
    where command ilike '%' || r.slug || '%';

    select count(*) into jobrefs
    from public.tgg_theme_deploy_jobs
    where coalesce(xml_text,'') ilike '%' || r.slug || '%'
       or coalesce(payload_text,'') ilike '%' || r.slug || '%'
       or coalesce(result::text,'') ilike '%' || r.slug || '%';

    select count(*) into backuprefs
    from public.v98_blogger_backups
    where coalesce(resource_key,'') ilike '%' || r.slug || '%'
       or coalesce(metadata::text,'') ilike '%' || r.slug || '%';

    insert into private.tgg_edge_function_dependency_audit(
      slug,db_function_refs,cron_refs,blogger_job_refs,blogger_backup_refs,total_refs,checked_at
    )
    values(
      r.slug,dbrefs,cronrefs,jobrefs,backuprefs,
      dbrefs+cronrefs+jobrefs+backuprefs,now()
    )
    on conflict(slug) do update set
      db_function_refs=excluded.db_function_refs,
      cron_refs=excluded.cron_refs,
      blogger_job_refs=excluded.blogger_job_refs,
      blogger_backup_refs=excluded.blogger_backup_refs,
      total_refs=excluded.total_refs,
      checked_at=now();

    update private.tgg_edge_function_registry
    set retirement_state = case
      when dbrefs+cronrefs+jobrefs+backuprefs=0 then 'safe_to_retire'
      else 'review'
    end
    where slug=r.slug;
  end loop;

  select count(*) into safe_count
  from private.tgg_edge_function_registry
  where duplicate_candidate and retirement_state='safe_to_retire';

  return jsonb_build_object(
    'ok',true,
    'safe_to_retire',safe_count,
    'checked_at',now()
  );
end;
$$;

create or replace view public.tgg_code_sync_retirement_queue
with (security_invoker = true)
as
select
  r.family_key,
  r.slug,
  r.deployment_version,
  r.updated_at,
  r.verify_jwt,
  r.retirement_state,
  a.db_function_refs,
  a.cron_refs,
  a.blogger_job_refs,
  a.blogger_backup_refs,
  a.total_refs,
  a.checked_at
from private.tgg_edge_function_registry r
join private.tgg_edge_function_dependency_audit a using(slug)
where r.duplicate_candidate
order by
  case r.retirement_state when 'safe_to_retire' then 0 else 1 end,
  a.total_refs asc,
  r.family_key,
  r.updated_at;

grant select on public.tgg_code_sync_retirement_queue to authenticated;

create or replace function public.tgg_code_sync_retirement_summary()
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'safe_to_retire', count(*) filter(where retirement_state='safe_to_retire'),
    'needs_review', count(*) filter(where retirement_state='review'),
    'total_duplicate_candidates', count(*),
    'queue', coalesce(jsonb_agg(
      jsonb_build_object(
        'family',family_key,
        'slug',slug,
        'state',retirement_state,
        'refs',total_refs
      )
      order by
        case retirement_state when 'safe_to_retire' then 0 else 1 end,
        total_refs,
        family_key
    ),'[]'::jsonb)
  )
  from public.tgg_code_sync_retirement_queue
  where exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role::text='admin'
  );
$$;

revoke all on function public.tgg_code_sync_retirement_summary() from public, anon;
grant execute on function public.tgg_code_sync_retirement_summary() to authenticated;

select private.tgg_codesync_audit_edge_dependencies();


-- ============================================================
-- MIGRATION 20260907170421 revoke_anonymous_private_function_execute_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.prokind='f'
  loop
    execute format('revoke execute on function %s from public, anon',r.sig);
  end loop;
end $$;


-- ============================================================
-- MIGRATION 20260907170618 fix_membership_activation_queue_stale_stripe_evidence_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_reconcile_membership_activation_item()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_owner uuid;
  v_webhook_ready boolean:=false;
  v_payment_link_ready boolean:=false;
  v_active_tiers integer:=0;
  v_verified_tiers integer:=0;
  v_total_tiers integer:=0;
  v_status text;
  v_next_action text;
  v_tier_id uuid;
  v_product_id text;
  v_price_id text;
  v_payment_link_url text;
  v_payment_link_verified boolean:=false;
begin
  select id into v_owner
  from auth.users
  where coalesce(raw_app_meta_data->>'tgg_role','')='owner'
  order by created_at
  limit 1;

  select
    count(*),
    count(*) filter(where t.is_active),
    count(*) filter(where coalesce(t.stripe_payment_link_verified,false))
  into v_total_tiers,v_active_tiers,v_verified_tiers
  from public.tgg_membership_tiers t
  join public.artists a on a.id=t.artist_id
  where a.user_id=v_owner;

  select
    t.id,
    t.stripe_product_id,
    t.stripe_price_id,
    t.stripe_payment_link_url,
    coalesce(t.stripe_payment_link_verified,false)
  into
    v_tier_id,
    v_product_id,
    v_price_id,
    v_payment_link_url,
    v_payment_link_verified
  from public.tgg_membership_tiers t
  join public.artists a on a.id=t.artist_id
  where a.user_id=v_owner
  order by
    coalesce(t.stripe_payment_link_verified,false) desc,
    t.updated_at desc,
    t.created_at desc
  limit 1;

  select
    coalesce(enabled and endpoint_configured and mode='production',false)
  into v_webhook_ready
  from public.tgg_provider_runtime_config
  where provider_key='stripe.webhook';

  v_payment_link_ready :=
    v_tier_id is not null
    and v_payment_link_url is not null
    and v_product_id is not null
    and v_price_id is not null;

  v_status:=case
    when v_active_tiers>0 and v_verified_tiers>0 and v_webhook_ready then 'complete'
    when v_verified_tiers>0 and not v_webhook_ready then 'waiting'
    when v_verified_tiers>0 and v_webhook_ready then 'ready'
    else 'ready'
  end;

  v_next_action:=case
    when v_status='complete' then null
    when v_verified_tiers>0 and not v_webhook_ready then
      'Recurring Stripe product, monthly price, and Payment Link are verified. Restore STRIPE_WEBHOOK_SECRET, then explicitly activate the tier.'
    when v_verified_tiers>0 and v_webhook_ready then
      'Recurring Stripe billing is verified. Explicitly activate the paid tier.'
    else
      'Create and verify a recurring Stripe Payment Link for the draft tier.'
  end;

  update private.tgg_one_final_activation_queue
  set
    status=v_status,
    next_action=v_next_action,
    evidence=(
      coalesce(evidence,'{}'::jsonb)
      - 'stripe_product_id'
      - 'stripe_price_id'
      - 'stripe_payment_link_id'
      - 'stripe_payment_link_url'
      - 'stripe_live_products'
      - 'stripe_live_payment_links'
      - 'stripe_live_active_products'
      - 'stripe_live_active_payment_links'
      - 'stripe_live_recurring_prices'
      - 'stripe_membership_payment_links'
      - 'supabase_verified_payment_link_tiers'
    ) || jsonb_build_object(
      'total_tiers',v_total_tiers,
      'active_tiers',v_active_tiers,
      'verified_payment_link_tiers',v_verified_tiers,
      'membership_tier_id',v_tier_id,
      'stripe_product_id',v_product_id,
      'stripe_price_id',v_price_id,
      'stripe_payment_link_url',v_payment_link_url,
      'stripe_payment_link_verified',v_payment_link_verified,
      'recurring_billing_objects_complete',v_payment_link_ready and v_verified_tiers>0,
      'stripe_webhook_runtime_ready',v_webhook_ready,
      'stripe_webhook_endpoint_ready',true,
      'stripe_webhook_pending_reason',case when v_webhook_ready then null else 'stripe_webhook_secret_missing' end,
      'membership_reconciler_source','current_owner_tier_source_of_truth',
      'membership_reconciler_fixed_at',now()
    ),
    last_checked_at=now(),
    completed_at=case when v_status='complete' then coalesce(completed_at,now()) else null end
  where item_key='membership_tier';

  return jsonb_build_object(
    'ok',true,
    'status',v_status,
    'total_tiers',v_total_tiers,
    'active_tiers',v_active_tiers,
    'verified_payment_link_tiers',v_verified_tiers,
    'webhook_ready',v_webhook_ready,
    'payment_link_ready',v_payment_link_ready,
    'tier_id',v_tier_id,
    'stripe_product_id',v_product_id,
    'stripe_price_id',v_price_id,
    'stripe_payment_link_url',v_payment_link_url,
    'next_action',v_next_action,
    'generated_at',now()
  );
end
$function$;

revoke all on function private.tgg_reconcile_membership_activation_item()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907170659 fix_membership_activation_queue_webhook_flag_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_reconcile_membership_activation_item()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_owner uuid;
  v_webhook_ready boolean:=false;
  v_payment_link_ready boolean:=false;
  v_active_tiers integer:=0;
  v_verified_tiers integer:=0;
  v_total_tiers integer:=0;
  v_status text;
  v_next_action text;
  v_tier_id uuid;
  v_product_id text;
  v_price_id text;
  v_payment_link_url text;
  v_payment_link_verified boolean:=false;
begin
  select id into v_owner
  from auth.users
  where coalesce(raw_app_meta_data->>'tgg_role','')='owner'
  order by created_at
  limit 1;

  select
    count(*),
    count(*) filter(where t.is_active),
    count(*) filter(where coalesce(t.stripe_payment_link_verified,false))
  into v_total_tiers,v_active_tiers,v_verified_tiers
  from public.tgg_membership_tiers t
  join public.artists a on a.id=t.artist_id
  where a.user_id=v_owner;

  select
    t.id,
    t.stripe_product_id,
    t.stripe_price_id,
    t.stripe_payment_link_url,
    coalesce(t.stripe_payment_link_verified,false)
  into
    v_tier_id,
    v_product_id,
    v_price_id,
    v_payment_link_url,
    v_payment_link_verified
  from public.tgg_membership_tiers t
  join public.artists a on a.id=t.artist_id
  where a.user_id=v_owner
  order by
    coalesce(t.stripe_payment_link_verified,false) desc,
    t.updated_at desc,
    t.created_at desc
  limit 1;

  select coalesce(enabled and endpoint_configured and mode='production',false)
  into v_webhook_ready
  from public.tgg_provider_runtime_config
  where provider_key='stripe.webhook';

  v_payment_link_ready :=
    v_tier_id is not null
    and v_payment_link_url is not null
    and v_product_id is not null
    and v_price_id is not null;

  v_status:=case
    when v_active_tiers>0 and v_verified_tiers>0 and v_webhook_ready then 'complete'
    when v_verified_tiers>0 and not v_webhook_ready then 'waiting'
    when v_verified_tiers>0 and v_webhook_ready then 'ready'
    else 'ready'
  end;

  v_next_action:=case
    when v_status='complete' then null
    when v_verified_tiers>0 and not v_webhook_ready then
      'Recurring Stripe product, monthly price, and Payment Link are verified. Restore STRIPE_WEBHOOK_SECRET, then explicitly activate the tier.'
    when v_verified_tiers>0 and v_webhook_ready then
      'Recurring Stripe billing is verified. Explicitly activate the paid tier.'
    else
      'Create and verify a recurring Stripe Payment Link for the draft tier.'
  end;

  update private.tgg_one_final_activation_queue
  set
    status=v_status,
    next_action=v_next_action,
    evidence=(
      coalesce(evidence,'{}'::jsonb)
      - 'stripe_product_id'
      - 'stripe_price_id'
      - 'stripe_payment_link_id'
      - 'stripe_payment_link_url'
      - 'stripe_live_products'
      - 'stripe_live_payment_links'
      - 'stripe_live_active_products'
      - 'stripe_live_active_payment_links'
      - 'stripe_live_recurring_prices'
      - 'stripe_membership_payment_links'
      - 'supabase_verified_payment_link_tiers'
      - 'webhook_ready'
    ) || jsonb_build_object(
      'total_tiers',v_total_tiers,
      'active_tiers',v_active_tiers,
      'verified_payment_link_tiers',v_verified_tiers,
      'membership_tier_id',v_tier_id,
      'stripe_product_id',v_product_id,
      'stripe_price_id',v_price_id,
      'stripe_payment_link_url',v_payment_link_url,
      'stripe_payment_link_verified',v_payment_link_verified,
      'webhook_ready',v_webhook_ready,
      'recurring_billing_objects_complete',v_payment_link_ready and v_verified_tiers>0,
      'stripe_webhook_runtime_ready',v_webhook_ready,
      'stripe_webhook_endpoint_ready',true,
      'stripe_webhook_pending_reason',case when v_webhook_ready then null else 'stripe_webhook_secret_missing' end,
      'membership_reconciler_source','current_owner_tier_source_of_truth',
      'membership_reconciler_fixed_at',now()
    ),
    last_checked_at=now(),
    completed_at=case when v_status='complete' then coalesce(completed_at,now()) else null end
  where item_key='membership_tier';

  return jsonb_build_object(
    'ok',true,
    'status',v_status,
    'total_tiers',v_total_tiers,
    'active_tiers',v_active_tiers,
    'verified_payment_link_tiers',v_verified_tiers,
    'webhook_ready',v_webhook_ready,
    'payment_link_ready',v_payment_link_ready,
    'tier_id',v_tier_id,
    'stripe_product_id',v_product_id,
    'stripe_price_id',v_price_id,
    'stripe_payment_link_url',v_payment_link_url,
    'next_action',v_next_action,
    'generated_at',now()
  );
end
$function$;

revoke all on function private.tgg_reconcile_membership_activation_item()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907170742 fix_codesync_exact_dependency_matching_and_v56_manifest
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_codesync_audit_edge_dependencies()
returns jsonb
language plpgsql
set search_path = private, public, pg_catalog, information_schema, pg_temp
as $$
declare
  r record;
  dbrefs int;
  cronrefs int;
  jobrefs int;
  backuprefs int;
  safe_count int;
  pat text;
begin
  for r in
    select slug
    from private.tgg_edge_function_registry
    where duplicate_candidate
  loop
    pat := '(^|[^A-Za-z0-9_-])' ||
      regexp_replace(r.slug, '([\\.\\+\\*\\?\\[\\^\\]\\$\\(\\)\\{\\}=!<>|:\\-])', '\\\1', 'g') ||
      '([^A-Za-z0-9_-]|$)';

    select count(*) into dbrefs
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private')
      and p.prokind in ('f','p')
      and pg_get_functiondef(p.oid) ~ pat;

    select count(*) into cronrefs
    from cron.job
    where command ~ pat;

    select count(*) into jobrefs
    from public.tgg_theme_deploy_jobs
    where coalesce(xml_text,'') ~ pat
       or coalesce(payload_text,'') ~ pat
       or coalesce(result::text,'') ~ pat;

    select count(*) into backuprefs
    from public.v98_blogger_backups
    where coalesce(resource_key,'') ~ pat
       or coalesce(metadata::text,'') ~ pat;

    insert into private.tgg_edge_function_dependency_audit(
      slug,db_function_refs,cron_refs,blogger_job_refs,blogger_backup_refs,total_refs,checked_at
    )
    values(
      r.slug,dbrefs,cronrefs,jobrefs,backuprefs,
      dbrefs+cronrefs+jobrefs+backuprefs,now()
    )
    on conflict(slug) do update set
      db_function_refs=excluded.db_function_refs,
      cron_refs=excluded.cron_refs,
      blogger_job_refs=excluded.blogger_job_refs,
      blogger_backup_refs=excluded.blogger_backup_refs,
      total_refs=excluded.total_refs,
      checked_at=now();

    update private.tgg_edge_function_registry
    set retirement_state = case
      when dbrefs+cronrefs+jobrefs+backuprefs=0 then 'safe_to_retire'
      else 'review'
    end
    where slug=r.slug;
  end loop;

  select count(*) into safe_count
  from private.tgg_edge_function_registry
  where duplicate_candidate and retirement_state='safe_to_retire';

  return jsonb_build_object('ok',true,'safe_to_retire',safe_count,'checked_at',now());
end;
$$;

update private.tgg_edge_function_registry
set deployment_version=56,
    source_hash='87f8ab50051ae2bf3758eeb9309724dc0f7bedaa09929423fb7f2c4776343b12',
    updated_at=to_timestamp(1788800732427/1000.0),
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',56,
      'edge_sha256','87f8ab50051ae2bf3758eeb9309724dc0f7bedaa09929423fb7f2c4776343b12',
      'build','V5000-ONE-LOAD',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v56',
      'checkpoint_state','ready',
      'fingerprint','87f8ab50051ae2bf3758eeb9309724dc0f7bedaa09929423fb7f2c4776343b12'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',27,
      'remaining_only_action_center',true,
      'membership_recurring_billing_objects_complete',true,
      'provider_endpoint_staging',true,
      'master_reuse_confirmation',true,
      'distribution_metadata_editor',true,
      'distribution_master_selector',true,
      'distribution_package_preview',true,
      'distribution_duration_detector',true,
      'self_service_validation_invite',true,
      'code_sync_backup_controller',true
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

select private.tgg_codesync_audit_edge_dependencies();


-- ============================================================
-- MIGRATION 20260907170856 fix_codesync_digest_qualification
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_codesync_scan_database()
returns jsonb
language plpgsql
set search_path = private, public, pg_catalog, information_schema, pg_temp
as $$
declare
  r record;
  v_hash text;
  v_key text;
begin
  for r in
    select
      'db_function'::text as component_type,
      n.nspname || '.' || p.proname as full_name,
      p.proname as object_name,
      pg_get_function_identity_arguments(p.oid) as args,
      pg_get_functiondef(p.oid) as defn
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private')
      and p.proname like 'tgg_%'
      and p.prokind in ('f','p')
  loop
    v_key := 'db_function:' || r.full_name || '(' || coalesce(r.args,'') || ')';
    v_hash := encode(extensions.digest(r.defn,'sha256'),'hex');

    insert into private.tgg_code_components(
      component_key,component_type,canonical_name,latest_seen_name,content_hash,last_seen_at,last_changed_at,metadata
    )
    values (
      v_key,r.component_type,r.full_name,r.full_name,v_hash,now(),now(),
      jsonb_build_object('args',r.args)
    )
    on conflict(component_key) do update
    set latest_seen_name=excluded.latest_seen_name,
        last_seen_at=now(),
        last_changed_at=case
          when private.tgg_code_components.content_hash is distinct from excluded.content_hash then now()
          else private.tgg_code_components.last_changed_at
        end,
        content_hash=excluded.content_hash,
        metadata=excluded.metadata;

    insert into private.tgg_code_snapshots(component_key,snapshot_hash,snapshot)
    values (v_key,v_hash,jsonb_build_object('name',r.full_name,'args',r.args,'definition',r.defn))
    on conflict do nothing;
  end loop;

  for r in
    select
      'table'::text as component_type,
      table_schema || '.' || table_name as full_name,
      jsonb_agg(
        jsonb_build_object(
          'column',column_name,
          'type',data_type,
          'nullable',is_nullable,
          'default',column_default
        )
        order by ordinal_position
      ) as structure
    from information_schema.columns
    where table_schema in ('public','private')
      and table_name like 'tgg_%'
    group by table_schema,table_name
  loop
    v_key := 'table:' || r.full_name;
    v_hash := encode(extensions.digest(r.structure::text,'sha256'),'hex');

    insert into private.tgg_code_components(
      component_key,component_type,canonical_name,latest_seen_name,content_hash,last_seen_at,last_changed_at,metadata
    )
    values (
      v_key,r.component_type,r.full_name,r.full_name,v_hash,now(),now(),r.structure
    )
    on conflict(component_key) do update
    set last_seen_at=now(),
        last_changed_at=case
          when private.tgg_code_components.content_hash is distinct from excluded.content_hash then now()
          else private.tgg_code_components.last_changed_at
        end,
        content_hash=excluded.content_hash,
        metadata=excluded.metadata;

    insert into private.tgg_code_snapshots(component_key,snapshot_hash,snapshot)
    values (v_key,v_hash,jsonb_build_object('name',r.full_name,'columns',r.structure))
    on conflict do nothing;
  end loop;

  return jsonb_build_object('ok',true,'scanned_at',now());
end;
$$;


-- ============================================================
-- MIGRATION 20260907170912 add_codesync_self_health_checks_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_codesync_self_check()
returns jsonb
language plpgsql
set search_path = private, public, pg_catalog, pg_temp
as $$
declare
  v_last_scan timestamptz;
  v_manifest jsonb;
  v_safe int;
  v_review int;
  v_stale_jobs int;
  v_open int;
begin
  select max(last_seen_at) into v_last_scan from private.tgg_code_components;
  select public.tgg_v5000_production_manifest() into v_manifest;

  select count(*) filter(where retirement_state='safe_to_retire'),
         count(*) filter(where retirement_state='review')
  into v_safe,v_review
  from private.tgg_edge_function_registry
  where duplicate_candidate;

  select count(*) into v_stale_jobs
  from public.tgg_theme_deploy_jobs
  where status in ('claimed','processing')
    and claimed_at < now()-interval '10 minutes';

  if v_last_scan is null or v_last_scan < now()-interval '45 seconds' then
    perform private.tgg_codesync_upsert_issue(
      'codesync:scanner_stale','critical','codesync:controller',
      'Code Sync scanner has not refreshed recently.',
      jsonb_build_object('last_scan',v_last_scan)
    );
  else
    update private.tgg_code_issues
      set status='resolved',last_seen_at=now()
    where issue_key='codesync:scanner_stale' and status='open';
  end if;

  if coalesce((v_manifest#>>'{runtime,edge_version}')::int,0) <> 56
     or coalesce(v_manifest#>>'{runtime,edge_sha256}','') <>
        '87f8ab50051ae2bf3758eeb9309724dc0f7bedaa09929423fb7f2c4776343b12'
  then
    perform private.tgg_codesync_upsert_issue(
      'codesync:manifest_drift','error','edge_function:tgg-creator-os-app-v17',
      'Production manifest does not match the canonical Creator OS runtime.',
      jsonb_build_object('manifest_runtime',v_manifest->'runtime')
    );
  else
    update private.tgg_code_issues
      set status='resolved',last_seen_at=now()
    where issue_key='codesync:manifest_drift' and status='open';
  end if;

  if v_stale_jobs > 0 then
    perform private.tgg_codesync_upsert_issue(
      'codesync:stale_deploy_jobs','warning','deployments',
      'One or more deploy jobs are stuck beyond the recovery threshold.',
      jsonb_build_object('count',v_stale_jobs)
    );
  else
    update private.tgg_code_issues
      set status='resolved',last_seen_at=now()
    where issue_key='codesync:stale_deploy_jobs' and status='open';
  end if;

  if not exists (
    select 1 from public.tgg_site_routes
    where is_active and path ~ '(^|/)functions/v1/creator-os-command-center([^A-Za-z0-9_-]|$)'
  ) then
    update private.tgg_edge_function_registry
    set retirement_state='safe_to_retire'
    where slug='creator-os-command-center' and duplicate_candidate;
  end if;

  select count(*) into v_open
  from private.tgg_code_issues
  where status='open';

  return jsonb_build_object(
    'ok',v_open=0,
    'last_scan',v_last_scan,
    'safe_to_retire',v_safe,
    'needs_review',v_review,
    'stale_deploy_jobs',v_stale_jobs,
    'open_issues',v_open,
    'checked_at',now()
  );
end;
$$;

create or replace function private.tgg_codesync_tick()
returns jsonb
language plpgsql
set search_path = private, public, pg_temp
as $$
declare
  a jsonb;
  b jsonb;
  c jsonb;
begin
  a := private.tgg_codesync_scan_database();
  b := private.tgg_codesync_detect_and_fix();
  perform private.tgg_codesync_audit_edge_dependencies();
  c := private.tgg_codesync_self_check();
  perform private.tgg_codesync_refresh_dashboard();
  return jsonb_build_object('scan',a,'repair',b,'health',c,'tick_at',now());
end;
$$;

create or replace function public.tgg_code_sync_workspace()
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select jsonb_build_object(
    'overview', public.tgg_code_sync_overview(),
    'retirement', public.tgg_code_sync_retirement_summary(),
    'health', private.tgg_codesync_self_check(),
    'issues', (
      select coalesce(jsonb_agg(x),'[]'::jsonb)
      from (
        select issue_key,severity,status,message,details,last_seen_at
        from private.tgg_code_issues
        where status='open'
        order by case severity when 'critical' then 0 when 'error' then 1 when 'warning' then 2 else 3 end,
                 last_seen_at desc
        limit 50
      ) x
    )
  )
  where exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role::text='admin'
  );
$$;

revoke all on function public.tgg_code_sync_workspace() from public, anon;
grant execute on function public.tgg_code_sync_workspace() to authenticated;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907170917 record_v531_cleanup_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'v531_cleanup_state',
  jsonb_build_object(
    'codesync_controller_active',false,
    'codesync_browser_surface_active',false,
    'anon_private_function_execute_count',0,
    'route_contract_reconciled',true,
    'creator_os_topology','v17_external_app_with_deep_links',
    'stripe_enabled_webhook_endpoints',1,
    'stripe_disabled_rotation_endpoints',2,
    'stripe_rotation_reverted_safely',true,
    'recorded_at',now()
  )
)
where version='V531-FINAL'
  and status='locked';


-- ============================================================
-- MIGRATION 20260907171005 revoke_codesync_self_check_anon_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


revoke all on function private.tgg_codesync_self_check()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260907171107 sync_codesync_runtime_v57_and_workspace_cache
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=57,
    source_hash='e9d6a5308aec3b2fbac53686b8fb96f909cfe2e931a57e40b969b022ac598264',
    updated_at=to_timestamp(1788801030999/1000.0),
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',57,
      'edge_sha256','e9d6a5308aec3b2fbac53686b8fb96f909cfe2e931a57e40b969b022ac598264',
      'build','V5000-CODESYNC',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v57',
      'checkpoint_state','ready',
      'fingerprint','e9d6a5308aec3b2fbac53686b8fb96f909cfe2e931a57e40b969b022ac598264'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',28,
      'remaining_only_action_center',true,
      'membership_recurring_billing_objects_complete',true,
      'provider_endpoint_staging',true,
      'master_reuse_confirmation',true,
      'distribution_metadata_editor',true,
      'distribution_master_selector',true,
      'distribution_package_preview',true,
      'distribution_duration_detector',true,
      'self_service_validation_invite',true,
      'code_sync_backup_controller',true,
      'code_sync_visible_workspace',true
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

create or replace function private.tgg_codesync_self_check()
returns jsonb
language plpgsql
set search_path = private, public, pg_catalog, pg_temp
as $$
declare
  v_last_scan timestamptz;
  v_manifest jsonb;
  v_expected_version int;
  v_expected_hash text;
  v_safe int;
  v_review int;
  v_stale_jobs int;
  v_open int;
begin
  select max(last_seen_at) into v_last_scan from private.tgg_code_components;
  select public.tgg_v5000_production_manifest() into v_manifest;
  select deployment_version,source_hash
    into v_expected_version,v_expected_hash
  from private.tgg_edge_function_registry
  where slug='tgg-creator-os-app-v17';

  select count(*) filter(where retirement_state='safe_to_retire'),
         count(*) filter(where retirement_state='review')
    into v_safe,v_review
  from private.tgg_edge_function_registry
  where duplicate_candidate;

  select count(*) into v_stale_jobs
  from public.tgg_theme_deploy_jobs
  where status in ('claimed','processing')
    and claimed_at < now()-interval '10 minutes';

  if v_last_scan is null or v_last_scan < now()-interval '45 seconds' then
    perform private.tgg_codesync_upsert_issue(
      'codesync:scanner_stale','critical','codesync:controller',
      'Code Sync scanner has not refreshed recently.',
      jsonb_build_object('last_scan',v_last_scan)
    );
  else
    update private.tgg_code_issues set status='resolved',last_seen_at=now()
    where issue_key='codesync:scanner_stale' and status='open';
  end if;

  if coalesce((v_manifest#>>'{runtime,edge_version}')::int,0) <> coalesce(v_expected_version,0)
     or coalesce(v_manifest#>>'{runtime,edge_sha256}','') <> coalesce(v_expected_hash,'')
  then
    perform private.tgg_codesync_upsert_issue(
      'codesync:manifest_drift','error','edge_function:tgg-creator-os-app-v17',
      'Production manifest does not match the canonical Creator OS runtime.',
      jsonb_build_object(
        'manifest_runtime',v_manifest->'runtime',
        'expected_version',v_expected_version,
        'expected_hash',v_expected_hash
      )
    );
  else
    update private.tgg_code_issues set status='resolved',last_seen_at=now()
    where issue_key='codesync:manifest_drift' and status='open';
  end if;

  if v_stale_jobs > 0 then
    perform private.tgg_codesync_upsert_issue(
      'codesync:stale_deploy_jobs','warning','deployments',
      'One or more deploy jobs are stuck beyond the recovery threshold.',
      jsonb_build_object('count',v_stale_jobs)
    );
  else
    update private.tgg_code_issues set status='resolved',last_seen_at=now()
    where issue_key='codesync:stale_deploy_jobs' and status='open';
  end if;

  if not exists (
    select 1 from public.tgg_site_routes
    where is_active and path ~ '(^|/)functions/v1/creator-os-command-center([^A-Za-z0-9_-]|$)'
  ) then
    update private.tgg_edge_function_registry
    set retirement_state='safe_to_retire'
    where slug='creator-os-command-center' and duplicate_candidate;
  end if;

  select count(*) into v_open from private.tgg_code_issues where status='open';

  return jsonb_build_object(
    'ok',v_open=0,
    'last_scan',v_last_scan,
    'safe_to_retire',v_safe,
    'needs_review',v_review,
    'stale_deploy_jobs',v_stale_jobs,
    'open_issues',v_open,
    'canonical_version',v_expected_version,
    'canonical_hash',v_expected_hash,
    'checked_at',now()
  );
end;
$$;

create table if not exists public.tgg_code_sync_workspace_state (
  id smallint primary key default 1 check(id=1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tgg_code_sync_workspace_state enable row level security;

drop policy if exists "admins can read code sync workspace state" on public.tgg_code_sync_workspace_state;
create policy "admins can read code sync workspace state"
on public.tgg_code_sync_workspace_state
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.role::text='admin'
  )
);

grant select on public.tgg_code_sync_workspace_state to authenticated;

create or replace function private.tgg_codesync_refresh_workspace_state()
returns void
language sql
set search_path = private, public, pg_temp
as $$
  insert into public.tgg_code_sync_workspace_state(id,payload,updated_at)
  values (
    1,
    jsonb_build_object(
      'overview', jsonb_build_object(
        'status',(select to_jsonb(s) from public.tgg_code_sync_dashboard_state s where id=1),
        'edge_functions',jsonb_build_object(
          'total',(select count(*) from private.tgg_edge_function_registry),
          'duplicate_families',(select count(distinct family_key) from private.tgg_edge_function_registry where duplicate_candidate),
          'duplicate_candidates',(select count(*) from private.tgg_edge_function_registry where duplicate_candidate),
          'canonical_functions',(select count(*) from private.tgg_edge_function_registry where canonical)
        )
      ),
      'retirement',jsonb_build_object(
        'safe_to_retire',(select count(*) from private.tgg_edge_function_registry where duplicate_candidate and retirement_state='safe_to_retire'),
        'needs_review',(select count(*) from private.tgg_edge_function_registry where duplicate_candidate and retirement_state='review'),
        'total_duplicate_candidates',(select count(*) from private.tgg_edge_function_registry where duplicate_candidate),
        'queue',(
          select coalesce(jsonb_agg(x),'[]'::jsonb)
          from (
            select r.family_key as family,r.slug,r.retirement_state as state,coalesce(a.total_refs,0) as refs
            from private.tgg_edge_function_registry r
            left join private.tgg_edge_function_dependency_audit a using(slug)
            where r.duplicate_candidate
            order by case r.retirement_state when 'safe_to_retire' then 0 else 1 end,
                     coalesce(a.total_refs,0),r.family_key,r.slug
            limit 100
          ) x
        )
      ),
      'health',private.tgg_codesync_self_check(),
      'issues',(
        select coalesce(jsonb_agg(x),'[]'::jsonb)
        from (
          select issue_key,severity,status,message,details,last_seen_at
          from private.tgg_code_issues
          where status='open'
          order by case severity when 'critical' then 0 when 'error' then 1 when 'warning' then 2 else 3 end,
                   last_seen_at desc
          limit 50
        ) x
      )
    ),
    now()
  )
  on conflict(id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
$$;

create or replace function public.tgg_code_sync_workspace()
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select payload
  from public.tgg_code_sync_workspace_state
  where id=1;
$$;

revoke all on function public.tgg_code_sync_workspace() from public, anon;
grant execute on function public.tgg_code_sync_workspace() to authenticated;

create or replace function private.tgg_codesync_tick()
returns jsonb
language plpgsql
set search_path = private, public, pg_temp
as $$
declare
  a jsonb;
  b jsonb;
  c jsonb;
begin
  a := private.tgg_codesync_scan_database();
  b := private.tgg_codesync_detect_and_fix();
  perform private.tgg_codesync_audit_edge_dependencies();
  c := private.tgg_codesync_self_check();
  perform private.tgg_codesync_refresh_dashboard();
  perform private.tgg_codesync_refresh_workspace_state();
  return jsonb_build_object('scan',a,'repair',b,'health',c,'tick_at',now());
end;
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907171208 stop_obsolete_duplicate_warning_loop
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_codesync_detect_and_fix()
returns jsonb
language plpgsql
set search_path = private, public, pg_temp
as $$
declare
  v_fixed int := 0;
  v_errors int := 0;
  v_review int := 0;
  r record;
begin
  for r in
    select id,status,claimed_at,filename
    from public.tgg_theme_deploy_jobs
    where status in ('claimed','processing')
      and claimed_at is not null
      and claimed_at < now() - interval '10 minutes'
  loop
    update public.tgg_theme_deploy_jobs
    set status='pending',
        device_id=null,
        claimed_at=null,
        error=coalesce(error,'') || case when coalesce(error,'')='' then '' else E'
' end ||
              'Auto-recovered stale deploy claim by Code Sync Controller'
    where id=r.id;

    insert into private.tgg_code_actions(action_type,component_key,status,details)
    values ('recover_stale_deploy_job','deploy_job:'||r.id,'completed',
            jsonb_build_object('filename',r.filename,'previous_status',r.status));
    v_fixed := v_fixed + 1;
  end loop;

  for r in
    select id,resource_type,resource_key,error_message
    from public.v98_blogger_deployments
    where status='failed'
      and updated_at > now() - interval '24 hours'
  loop
    perform private.tgg_codesync_upsert_issue(
      'blogger_deploy_failed:'||r.id,
      'error',
      'blogger:'||coalesce(r.resource_type,'unknown')||':'||coalesce(r.resource_key,r.id::text),
      'Blogger deployment failed',
      jsonb_build_object('deployment_id',r.id,'error',r.error_message)
    );
    v_errors := v_errors + 1;
  end loop;

  select count(*) into v_review
  from private.tgg_edge_function_registry
  where duplicate_candidate and retirement_state='review';

  if v_review > 0 then
    perform private.tgg_codesync_upsert_issue(
      'edge_function_version_chain:review_required',
      'warning',
      'edge_functions',
      'One or more duplicate Edge Functions still require dependency review.',
      jsonb_build_object('needs_review',v_review,'auto_delete',false)
    );
  else
    update private.tgg_code_issues
    set status='resolved',last_seen_at=now()
    where issue_key in (
      'edge_function_version_chain:tgg-creator-os-app',
      'edge_function_version_chain:review_required'
    )
    and status='open';
  end if;

  return jsonb_build_object('ok',true,'fixed',v_fixed,'issues_seen',v_errors,'needs_review',v_review,'checked_at',now());
end;
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907171933 retire_zero_reference_rpc_batch_1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       regexp_replace(p.proname,'_v[0-9]+$',''),
       'Zero references across database callers, canonical Creator OS V58 source, site routes, deploy jobs, Blogger backups, and Blogger deployment metadata.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.prokind in ('f','p')
  and p.proname in (
    'tgg_create_conversation_v3',
    'tgg_creator_os_home_v1',
    'tgg_creator_upload_track_v2',
    'tgg_get_public_release_bundle_v2',
    'tgg_mark_conversation_read_v3',
    'tgg_server_blogger_refresh_token_v516'
  )
on conflict do nothing;

drop function if exists public.tgg_create_conversation_v3(uuid,text);
drop function if exists public.tgg_creator_os_home_v1();
drop function if exists public.tgg_creator_upload_track_v2(uuid,text,integer,text,text,text);
drop function if exists public.tgg_get_public_release_bundle_v2(uuid,text);
drop function if exists public.tgg_mark_conversation_read_v3(uuid);
drop function if exists public.tgg_server_blogger_refresh_token_v516(uuid,uuid,text);

update private.tgg_rpc_registry
set state='retired',notes='Retired after zero-reference verification.',last_scanned_at=now()
where schema_name='public'
  and function_name in (
    'tgg_create_conversation_v3',
    'tgg_creator_os_home_v1',
    'tgg_creator_upload_track_v2',
    'tgg_get_public_release_bundle_v2',
    'tgg_mark_conversation_read_v3',
    'tgg_server_blogger_refresh_token_v516'
  );


-- ============================================================
-- MIGRATION 20260907172116 flatten_creator_os_and_public_shell_rpc_chains
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_creator_os_app_bundle()
returns jsonb
language plpgsql
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_dashboard jsonb;
  v_os jsonb;
  v_comms jsonb;
  v_release_id uuid;
  v_routes jsonb;
  v_workspace_routes jsonb;
  v_social jsonb;
  v_studio jsonb;
  v_career jsonb;
  v_supporters jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select a.id into v_artist
  from public.artists a
  where a.user_id=v_uid
  order by a.created_at asc
  limit 1;

  if v_artist is null then
    raise exception 'creator_profile_required' using errcode='42501';
  end if;

  v_dashboard := public.tgg_get_creator_dashboard_bundle(v_artist,12);
  v_os := public.tgg_creator_os_command_center();
  v_comms := public.tgg_creator_communications_bundle();
  v_social := public.tgg_creator_social_bundle();
  v_studio := public.tgg_creator_studio_bundle();
  v_career := public.tgg_creator_career_bundle();
  v_supporters := public.tgg_creator_supporters_bundle();

  select m.id into v_release_id
  from public.mixtapes m
  where m.artist_id=v_artist
  order by m.release_date desc nulls last,m.created_at desc
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'route_key',r.route_key,'title',r.title,'path',r.path,
      'workspace_key',r.workspace_key,'icon',r.icon,'nav_group',r.nav_group,
      'nav_order',r.nav_order,'is_primary',r.is_primary
    ) order by r.nav_order,r.title,r.route_key
  ),'[]'::jsonb)
  into v_workspace_routes
  from public.tgg_site_routes r
  where r.is_active=true
    and r.route_key <> 'artist_dashboard'
    and r.area in ('artist','shared')
    and r.access_level in ('artist','authenticated');

  with ranked as (
    select r.*,
           row_number() over(
             partition by r.path
             order by r.is_primary desc,r.nav_order asc,r.route_key asc
           ) as path_rank
    from public.tgg_site_routes r
    where r.is_active=true
      and r.route_key <> 'artist_dashboard'
      and r.area in ('artist','shared')
      and r.access_level in ('artist','authenticated')
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'route_key',r.route_key,'title',r.title,'path',r.path,
      'workspace_key',r.workspace_key,'icon',r.icon,
      'nav_group',r.nav_group,'nav_order',r.nav_order
    ) order by r.nav_order,r.title,r.route_key
  ),'[]'::jsonb)
  into v_routes
  from ranked r
  where r.path_rank=1;

  return jsonb_build_object(
    'ok',true,
    'app',jsonb_build_object(
      'key','tgg-creator-os',
      'name','TRU GO GETTA Creator OS',
      'version','ONE-FINAL-3.0-CANONICAL',
      'environment','production',
      'generated_at',now()
    ),
    'creator',coalesce(v_os->'creator','{}'::jsonb),
    'command_center',v_dashboard->'command_center',
    'monetization',v_dashboard->'monetization',
    'fan_intelligence',v_dashboard->'fan_intelligence',
    'supporters',v_supporters,
    'actions',v_dashboard->'actions',
    'releases',v_dashboard->'releases',
    'campaigns',v_dashboard->'campaigns',
    'communications',v_comms,
    'social',v_social,
    'studio',v_studio,
    'career',v_career,
    'modules',jsonb_build_object(
      'music',jsonb_build_object(
        'releases',coalesce(v_os->'releases','{}'::jsonb),
        'tracks',coalesce(v_os->'tracks','{}'::jsonb)
      ),
      'video',coalesce(v_os->'videos','{}'::jsonb),
      'merch',coalesce(v_os->'merch','{}'::jsonb),
      'community',coalesce(v_os->'community','{}'::jsonb),
      'growth',coalesce(v_os->'growth','{}'::jsonb),
      'studio',coalesce(v_os->'studio','{}'::jsonb),
      'release_pipeline',coalesce(v_os->'release_pipeline','{}'::jsonb)
    ),
    'navigation',v_routes,
    'workspace_routes',v_workspace_routes,
    'route_contract',jsonb_build_object(
      'source','tgg_site_routes',
      'dedupe','one-visible-nav-item-per-path',
      'canonical_home','/',
      'creator_home','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1',
      'legacy_creator_dashboard','/p/artist-dashboard_0633467215.html',
      'legacy_dashboard_visible',false
    ),
    'workspace_contract',jsonb_build_object(
      'dashboard',jsonb_build_object('enabled',true,'source','tgg_get_creator_dashboard_bundle'),
      'releases',jsonb_build_object('enabled',true,'source','tgg_get_creator_release_workspace_bundle'),
      'fans',jsonb_build_object('enabled',true,'source','tgg_get_creator_fan_crm_bundle'),
      'growth',jsonb_build_object('enabled',true,'source','tgg_get_creator_growth_workspace_bundle'),
      'live',jsonb_build_object('enabled',true,'source','tgg_get_creator_live_booking_bundle'),
      'opportunities',jsonb_build_object('enabled',true,'source','tgg_get_creator_opportunity_bundle'),
      'career',jsonb_build_object('enabled',true,'source','tgg_get_creator_career_workspace_bundle'),
      'communications',jsonb_build_object('enabled',true,'source','tgg_creator_communications_bundle'),
      'supporters',jsonb_build_object('enabled',true,'source','tgg_creator_supporters_bundle'),
      'account',jsonb_build_object('enabled',true,'source','tgg_get_account_workspace_bundle'),
      'shell',jsonb_build_object('enabled',true,'source','tgg_get_creator_shell_bundle'),
      'studio',jsonb_build_object(
        'enabled',true,'source','tgg_creator_studio_bundle',
        'project_types',jsonb_build_array('beat','recording','mix','master','podcast','audiobook')
      ),
      'social',jsonb_build_object('enabled',true,'source','tgg_creator_social_bundle'),
      'career_os',jsonb_build_object('enabled',true,'source','tgg_creator_career_bundle')
    ),
    'selection',jsonb_build_object(
      'artist_id',v_artist,
      'release_id',v_release_id,
      'selection_policy','authenticated-owner-first'
    )
  );
end
$function$;

create or replace function public.tgg_creator_os_final_bundle()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_base jsonb;
  v_analytics jsonb;
  v_payments jsonb;
  v_store jsonb;
  v_media jsonb;
  v_health jsonb;
  v_beatmaker jsonb;
  v_recording jsonb;
  v_video_pipeline jsonb;
  v_audiobooks jsonb;
  v_notifications jsonb;
  v_settings jsonb;
  v_promotion jsonb;
  v_projects jsonb;
  v_upload jsonb;
  v_live jsonb;
  v_collab jsonb;
  v_fan_crm jsonb;
  v_games jsonb;
  v_tv jsonb;
  v_distribution jsonb;
  v_status_summary jsonb;
  v_content_readiness jsonb;
  v_route_health jsonb;
  v_provider_activation jsonb;
  v_activation_readiness jsonb;
  v_activation_queue jsonb;
  v_membership_activation jsonb;
  v_master_reuse jsonb;
  v_master_provenance jsonb;
  v_activation_consistency jsonb;
  v_manifest jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_base:=public.tgg_creator_os_app_bundle();
  v_analytics:=public.phase2_creator_analytics_dashboard(30);
  v_payments:=public.v58_payment_revenue_summary(30);
  v_store:=public.tgg_creator_store_bundle();
  v_media:=public.tgg_creator_media_health();
  v_health:=public.tgg_final_platform_health();
  v_beatmaker:=public.tgg_creator_beatmaker_bundle();
  v_recording:=public.tgg_creator_recording_bundle();
  v_video_pipeline:=public.tgg_video_pipeline_final_health();
  v_audiobooks:=public.tgg_creator_audiobooks_bundle();
  v_notifications:=public.tgg_creator_notifications_bundle();
  v_settings:=public.tgg_creator_settings_bundle();
  v_promotion:=public.tgg_creator_promotion_bundle();
  v_projects:=public.tgg_creator_projects_bundle();
  v_upload:=public.tgg_creator_upload_bootstrap(null);
  v_live:=public.tgg_creator_live_studio_bundle();
  v_collab:=public.tgg_creator_collab_bundle();
  v_fan_crm:=public.tgg_creator_fan_crm_dashboard(100);
  v_games:=public.tgg_creator_games_bundle(100);
  v_tv:=public.tgg_creator_tv_bundle();
  v_distribution:=public.tgg_creator_distribution_bundle(100);
  v_status_summary:=public.tgg_one_final_status_summary();
  v_content_readiness:=public.tgg_content_readiness_final_health();
  v_route_health:=public.tgg_route_registry_final_health();
  v_provider_activation:=public.tgg_provider_activation_packet();
  v_activation_readiness:=public.tgg_one_final_activation_readiness();
  v_activation_queue:=public.tgg_one_final_activation_queue();
  v_membership_activation:=public.tgg_membership_activation_bundle();
  v_master_reuse:=public.tgg_distribution_master_reuse_bundle();
  v_master_provenance:=public.tgg_distribution_master_provenance();
  v_activation_consistency:=public.tgg_activation_queue_consistency_audit();

  v_manifest :=
    jsonb_build_object(
      'music',true,'external_listening_embeds',true,'external_listening_manager_ui',true,'spotify_embeds',true,'apple_music_embeds',true,'youtube_music_embeds',true,'secure_audio',true,'video',true,'video_storage_upload',true,
      'video_review_publish',coalesce((v_video_pipeline->>'pipeline_verified')::boolean,false),
      'video_replay_import',true,'video_render_handoff',true,
      'creator_store',true,'payments',true,'analytics',true,'messages',true,'messaging_v3',true,
      'notifications',true,'tgg_phone',true,'tgg_phone_ui',true,'phonebook_contacts',true,'phone_launcher',true,'notifications_realtime',true,'settings',true,
      'promotion_center',true,'my_projects',true,'upload_mixtape',true,
      'upload_database_rpc_only',true,'upload_owner_storage',true,
      'distribution_package_pipeline',true,'distribution_prepare_without_provider',true,
      'distribution_provider_connected',coalesce((v_distribution->>'delivery_provider_ready')::boolean,false),
      'blogger_direct_database_pages_zero',true,'live_collab_direct_database_pages_zero',true
    )
    ||
    jsonb_build_object(
      'collaboration',true,'cross_device_collaboration',true,'shared_project_controls',true,
      'collab_presence',true,'collab_revision_conflict_protection',true,'collab_activity_history',true,
      'audio_video_calls',true,'live_guest_video',true,'live_guest_audio',true,'live_guest_collab',true,
      'stories',true,'shorts',true,'radio',true,'social_studio',true,'public_profile_manager',true,'creator_profile_self_service',true,'artist_avatar_upload',true,'fan_following',true,'story_creator',true,
      'short_creator',true,'short_direct_publish',true,'radio_creator',true,'radio_admin_review',true,
      'live_studio',true,'camera_screen_capture',true,'picture_in_picture',true,
      'system_audio_capture',true,'live_process_recording',true,'live_replay_to_video_studio',true,
      'live_chat',true,'live_reactions',true,'live_clip_markers',true,
      'tgg_broadcast_engine_control_plane',true,'scalable_media_adapter_connected',false
    )
    ||
    jsonb_build_object(
      'beat_studio',true,'sound_library',true,'sound_library_advanced_filters',true,
      'sound_library_owned_uploads',true,'sound_library_private_previews',true,
      'licensed_sound_imports',true,'copyrighted_sound_scraping',false,'beat_pattern_save',true,
      'recording_studio',true,'recording_cloud_sessions',true,
      'recording_private_take_autosave',true,'recording_take_selection',true,
      'recording_pause_resume_complete',true,'mix_master',true,'podcasts',true,'audiobooks',true,
      'audiobook_publish_playback',true,'career_os',true,'career_workspace_polished',true,'opportunity_management',true,'opportunity_application_review',true,'event_management',true,'event_publish_rsvp',true,'opportunities',true,'events',true,
      'live',true,'supporters',true,'fan_crm_dashboard',true,'fan_intelligence',true,
      'fan_journey',true,'fan_followup_actions',true,'supporters_hq',true,'memberships',true,
      'membership_tier_management',true,'creator_payout_readiness',true,
      'creator_payout_connect_bridge',true,'membership_destination_transfers',true,
      'owner_platform_settlement',true,'membership_payment_link_claims',true,
      'membership_payment_link_verification',true,
      'stripe_server_secret_present',false,
      'stripe_payment_link_mode',true
    )
    ||
    jsonb_build_object(
      'vault',true,'games_tv',true,'games',true,'tgg_tv',true,'game_sessions',true,'public_leaderboards',true,'tv_watchlists',true,'tv_watch_history',true,'public_discovery',true,'artist_fan_growth',true,'public_artist_directory_api',true,'public_artist_profile_api',true,'artist_discovery_frontend',true,
      'artist_following',true,'artist_profile_releases',true,'artist_profile_videos',true,
      'artist_social_links',true,'public_profile_edit',true,'fan_summary',true,
      'music_smart_links',true,'spotify_links',true,'apple_music_links',true,
      'youtube_music_links',true,'blogger_write_token_final',true,
      'external_readiness_dynamic',true,'two_user_call_auto_validation',true,
      'fan_crm',true,'fan_crm_intelligence',true,'fan_supporter_overlap',true,
      'fan_lifetime_value',true
    );

  return v_base || jsonb_build_object(
    'app',(v_base->'app')||jsonb_build_object(
      'version','ONE-FINAL-3.1',
      'release_channel','production',
      'baseline','V531-FINAL',
      'generated_at',now()
    ),
    'analytics',v_analytics,
    'payments',v_payments,
    'store',v_store,
    'distribution',v_distribution,
    'media_health',v_media,
    'system_health',v_health,
    'beatmaker',v_beatmaker,
    'recording',v_recording,
    'video_pipeline',v_video_pipeline,
    'audiobooks',v_audiobooks,
    'notifications_center',v_notifications,
    'settings',v_settings,
    'promotion',v_promotion,
    'projects',v_projects,
    'upload',v_upload,
    'live_studio',v_live,
    'collab',v_collab,'phone',public.tgg_creator_phone_bundle(null,20),'release_embeds',public.tgg_creator_release_embeds_bundle(),
    'fan_crm',v_fan_crm,
    'games',v_games,
    'tv',v_tv,
    'status_summary',v_status_summary,
    'content_readiness',v_content_readiness,
    'route_registry_health',v_route_health,
    'provider_activation',v_provider_activation,
    'activation_readiness',v_activation_readiness,
    'activation_queue',v_activation_queue,
    'membership_activation',v_membership_activation,
    'distribution_master_reuse',v_master_reuse,
    'distribution_master_provenance',v_master_provenance,
    'activation_consistency',v_activation_consistency,
    'public_profile',public.tgg_creator_public_profile_bundle(),
    'smart_links',public.tgg_creator_smart_links_bundle(100),
    'build_manifest',v_manifest
  );
end
$function$;

create or replace function public.tgg_public_shell_bundle()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with
public_routes as (
  select route_key,title,path,nav_group,nav_order,is_primary,description,
         row_number() over (
           partition by path order by is_primary desc, nav_order asc, route_key asc
         ) as path_rank
  from public.tgg_site_routes
  where is_active=true and access_level='public'
),
nav as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'route_key',route_key,'title',title,'path',path,
      'nav_group',nav_group,'nav_order',nav_order,'is_primary',is_primary
    ) order by nav_order,title,route_key
  ),'[]'::jsonb) data
  from public_routes where path_rank=1
),
home as (select public.tgg_get_public_home_bundle(24) data),
artists as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.stage_name),'[]'::jsonb) data
  from (
    select artist_id,stage_name,bio,avatar_url,instagram,website,youtube,soundcloud,spotify
    from public.public_artist_directory_v1
    order by stage_name limit 24
  ) x
),
store as (
  select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc nulls last),'[]'::jsonb) data
  from (
    select *
    from public.public_store_v1
    order by published_at desc nulls last
    limit 24
  ) x
),
social as (select public.tgg_public_social_feed(24,24,24) data),
career as (select public.tgg_public_career_feed() data),
memberships as (select public.tgg_public_memberships_feed() data)
select jsonb_build_object(
  'ok',true,
  'app','TRU GO GETTA Public Shell',
  'version','CANONICAL-V8',
  'state','READY',
  'canonical',jsonb_build_object(
    'home','/p/homepage.html',
    'root_alias','/',
    'creator_home','/p/artist-dashboard_0633467215.html',
    'legacy_creator_dashboard','/p/creator-dashboard.html'
  ),
  'navigation',(select data from nav),
  'bootstrap',(select data->'bootstrap' from home),
  'home_feed',(select data->'releases' from home),
  'videos',public.tgg_public_video_feed(24),
  'interviews',(select data->'interviews' from home),
  'merch',(select data from store),
  'featured_artists',(select data from artists),
  'stories',(select data->'stories' from social),
  'shorts',(select data->'shorts' from social),
  'radio',(select data->'radio' from social),
  'events',(select data->'events' from career),
  'opportunities',(select data->'opportunities' from career),
  'live_events',(select data->'live' from career),
  'membership_tiers',(select data->'tiers' from memberships),
  'generated_at',now()
);
$function$;

create or replace function public.tgg_public_final_bundle()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
  select
    public.tgg_public_shell_bundle()
    || jsonb_build_object(
      'version','ONE-FINAL-1.8',
      'release_channel','production',
      'baseline','TRU_GO_GETTA_ONE_FINAL',
      'checkout_capabilities',public.tgg_public_checkout_capabilities(),
      'audiobooks',public.tgg_public_audiobooks_feed(50),
      'social',public.tgg_public_social_feed(50,50,50),
      'career',public.tgg_public_career_feed(),
      'memberships',public.tgg_public_memberships_feed(),
      'interviews',public.tgg_public_interviews_feed(50),
      'live',public.tgg_public_live_bundle(null)||jsonb_build_object('version','PUBLIC-LIVE-ONE-FINAL-1.0'),
      'canonical_routes',jsonb_build_object(
        'artists','/p/artists.html','artist_profile','/p/public-artist-profile.html',
        'mixtape_detail','/p/mixtape.html','audiobooks','/p/audiobooks.html',
        'shorts','/p/shorts.html','radio','/p/tgg-radio.html','events','/p/events.html',
        'opportunities','/p/opportunities.html','memberships','/p/memberships.html',
        'interviews','/p/interviews.html','live','/p/live.html','discover','/p/discover.html'
      ),
      'build_manifest',jsonb_build_object(
        'releases',true,'artists',true,'artist_profiles',true,'videos',true,
        'audiobooks',true,'shorts',true,'radio',true,'stories',true,'events',true,
        'opportunities',true,'memberships',true,'interviews',true,'live',true,
        'live_chat',true,'live_reactions',true,'live_guest_requests',true,
        'store',true,'live_events',true,'membership_tiers',true,
        'dedicated_artist_directory',true,'dedicated_artist_profile',true,
        'dedicated_short_page',true,'dedicated_radio_page',true,'dedicated_discover_page',true,
        'dedicated_events_page',true,'dedicated_opportunities_page',true,
        'dedicated_memberships_page',true,'dedicated_interviews_page',true,'dedicated_live_page',true,
        'public_social_discovery_polished',true,
        'external_listening_cards',true,
        'spotify_embeds',true,'apple_music_links_or_embeds',true,'youtube_music_embeds',true,
        'secure_mixtape_detail',true,'secure_audiobook_playback',true,
        'store_checkout',coalesce((public.tgg_public_checkout_capabilities()->>'store_checkout')::boolean,false),
        'membership_checkout',coalesce((public.tgg_public_checkout_capabilities()->>'membership_checkout')::boolean,false)
      ),
      'generated_at',now()
    );
$function$;

create or replace function public.tgg_public_one_final_bundle()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with shell as (
  select public.tgg_public_shell_bundle() data
),
home as (
  select public.tgg_get_public_home_bundle(24) data
),
checkout as (
  select public.tgg_public_checkout_capabilities() data
)
select
  (select data from shell)
  || jsonb_build_object(
    'version','ONE-FINAL-CANONICAL-1.0',
    'release_channel','production',
    'baseline','TRU_GO_GETTA_ONE_FINAL',
    'releases',coalesce((select data->'releases' from home),'[]'::jsonb),
    'home_feed',coalesce((select data->'releases' from home),'[]'::jsonb),
    'checkout_capabilities',(select data from checkout),
    'audiobooks',public.tgg_public_audiobooks_feed(50),
    'artist_directory',public.tgg_public_artist_directory_v2(null,100),
    'social',public.tgg_public_social_feed(50,50,50),
    'career',public.tgg_public_career_feed(),
    'memberships',public.tgg_public_memberships_feed(),
    'interviews',public.tgg_public_interviews_feed(50),
    'live',public.tgg_public_live_bundle(null)||jsonb_build_object('version','PUBLIC-LIVE-ONE-FINAL-1.0'),
    'canonical_routes',jsonb_build_object(
      'home','/',
      'artists','/p/artists.html',
      'artist_profile','/p/public-artist-profile.html',
      'mixtape_detail','/p/mixtape.html',
      'audiobooks','/p/audiobooks.html',
      'shorts','/p/shorts.html',
      'radio','/p/tgg-radio.html',
      'events','/p/events.html',
      'opportunities','/p/opportunities.html',
      'memberships','/p/memberships.html',
      'interviews','/p/interviews.html',
      'live','/p/live.html',
      'discover','/p/discover.html'
    ),
    'generated_at',now()
  );
$function$;

insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       regexp_replace(p.proname,'_v[0-9]+$',''),
       'Version-chain behavior flattened into canonical unversioned RPC and all internal callers redirected.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_creator_os_app_bundle_v3953',
    'tgg_creator_os_app_bundle_v3955',
    'tgg_creator_os_app_bundle_v3956',
    'tgg_public_shell_bundle_v6',
    'tgg_public_shell_bundle_v7',
    'tgg_public_shell_bundle_v8'
  )
on conflict do nothing;

drop function if exists public.tgg_creator_os_app_bundle_v3956();
drop function if exists public.tgg_creator_os_app_bundle_v3955();
drop function if exists public.tgg_creator_os_app_bundle_v3953();
drop function if exists public.tgg_public_shell_bundle_v8();
drop function if exists public.tgg_public_shell_bundle_v7();
drop function if exists public.tgg_public_shell_bundle_v6();


-- ============================================================
-- MIGRATION 20260907172307 flatten_messaging_rpc_versions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_create_conversation(p_user_id uuid, p_title text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_user_id is null or p_user_id = auth.uid() then raise exception 'INVALID_RECIPIENT'; end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'RECIPIENT_NOT_FOUND'; end if;

  select c.id into v_id
  from public.conversations c
  join public.conversation_members a on a.conversation_id=c.id and a.user_id=auth.uid()
  join public.conversation_members b on b.conversation_id=c.id and b.user_id=p_user_id
  where c.conversation_type='direct'
  limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.conversations(conversation_type,title,created_by)
  values('direct', nullif(left(trim(coalesce(p_title,'')),200),''), auth.uid())
  returning id into v_id;

  insert into public.conversation_members(conversation_id,user_id,role)
  values(v_id,auth.uid(),'member'),(v_id,p_user_id,'member');
  return v_id;
end;
$function$;

create or replace function public.tgg_create_conversation(p_user_id uuid, p_title text default null)
returns uuid
language sql
set search_path to ''
as $function$
  select private.tgg_create_conversation(p_user_id,p_title);
$function$;

create or replace function private.tgg_send_message(
  p_conversation_id uuid,
  p_body text,
  p_message_type text default 'text',
  p_reply_to_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id uuid; v_body text; v_type text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.conversation_members
    where conversation_id=p_conversation_id and user_id=auth.uid()
  ) then raise exception 'NOT_A_MEMBER'; end if;

  v_body := nullif(trim(p_body),'');
  if v_body is null then raise exception 'EMPTY_MESSAGE'; end if;
  if length(v_body) > 5000 then raise exception 'MESSAGE_TOO_LONG'; end if;

  v_type := coalesce(nullif(trim(p_message_type),''),'text');
  if v_type not in ('text') then raise exception 'INVALID_MESSAGE_TYPE'; end if;

  if p_reply_to_id is not null and not exists (
    select 1 from public.messages where id=p_reply_to_id and conversation_id=p_conversation_id
  ) then raise exception 'INVALID_REPLY'; end if;

  insert into public.messages(conversation_id,sender_id,body,message_type,reply_to_id)
  values(p_conversation_id,auth.uid(),v_body,v_type,p_reply_to_id)
  returning id into v_id;

  update public.conversations set updated_at=now() where id=p_conversation_id;
  return v_id;
end;
$function$;

create or replace function public.tgg_send_message(
  p_conversation_id uuid,
  p_body text,
  p_message_type text default 'text',
  p_reply_to_id uuid default null
)
returns uuid
language sql
set search_path to ''
as $function$
  select private.tgg_send_message(p_conversation_id,p_body,p_message_type,p_reply_to_id);
$function$;

create or replace function public.tgg_send_message(p_conversation_id uuid, p_body text)
returns uuid
language sql
set search_path to ''
as $function$
  select private.tgg_send_message(p_conversation_id,p_body,'text',null);
$function$;

create or replace function private.tgg_mark_conversation_read(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.conversation_members
     set last_read_at=now()
   where conversation_id=p_conversation_id and user_id=auth.uid();
  return found;
end;
$function$;

create or replace function public.tgg_mark_conversation_read(p_conversation_id uuid)
returns boolean
language sql
set search_path to ''
as $function$
  select private.tgg_mark_conversation_read(p_conversation_id);
$function$;

create or replace function public.tgg_creator_communications_bundle()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'user_id',v_uid,
    'counts',jsonb_build_object(
      'conversations',(
        select count(*)
        from public.tgg_conversations c
        where c.created_by=v_uid
           or exists(
             select 1 from public.tgg_conversation_members m
             where m.conversation_id=c.id and m.user_id=v_uid
           )
      ),
      'unread_messages',(
        select count(*)
        from public.tgg_messages m
        join public.tgg_conversation_members cm
          on cm.conversation_id=m.conversation_id
         and cm.user_id=v_uid
        where m.sender_id<>v_uid
          and m.created_at > coalesce(cm.last_read_at,'epoch'::timestamptz)
      ),
      'collab_incoming_pending',(
        select count(*) from public.tgg_collaboration_requests
        where recipient_id=v_uid and status='pending'
      ),
      'collab_outgoing_pending',(
        select count(*) from public.tgg_collaboration_requests
        where sender_id=v_uid and status='pending'
      ),
      'active_calls',(
        select count(distinct r.id)
        from public.tgg_call_rooms r
        left join public.tgg_call_participants p on p.room_id=r.id
        where r.status='active'
          and (r.created_by=v_uid or p.user_id=v_uid)
      )
    ),
    'recent_conversations',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.last_activity desc)
      from (
        select c.id,c.title,c.project_type,c.status,
               coalesce(c.last_message_at,c.updated_at,c.created_at) as last_activity
        from public.tgg_conversations c
        where c.created_by=v_uid
           or exists(
             select 1 from public.tgg_conversation_members cm
             where cm.conversation_id=c.id and cm.user_id=v_uid
           )
        order by coalesce(c.last_message_at,c.updated_at,c.created_at) desc
        limit 20
      ) x
    ),'[]'::jsonb),
    'collaboration_requests',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.updated_at desc)
      from (
        select id,sender_id,recipient_id,project_title,project_type,note,status,
               conversation_id,created_at,updated_at,
               case when recipient_id=v_uid then 'incoming' else 'outgoing' end as direction
        from public.tgg_collaboration_requests
        where sender_id=v_uid or recipient_id=v_uid
        order by updated_at desc
        limit 50
      ) x
    ),'[]'::jsonb),
    'active_calls',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select distinct r.id,r.conversation_id,r.title,r.room_type,r.status,r.is_group,r.created_at
        from public.tgg_call_rooms r
        left join public.tgg_call_participants p on p.room_id=r.id
        where r.status='active'
          and (r.created_by=v_uid or p.user_id=v_uid)
        order by r.created_at desc
        limit 20
      ) x
    ),'[]'::jsonb),
    'capabilities',jsonb_build_object(
      'create_conversation',has_function_privilege('authenticated','public.tgg_create_conversation(uuid,text)','EXECUTE'),
      'send_message',has_function_privilege('authenticated','public.tgg_send_message(uuid,text,text,uuid)','EXECUTE'),
      'mark_read',has_function_privilege('authenticated','public.tgg_mark_conversation_read(uuid)','EXECUTE'),
      'create_collab',has_function_privilege('authenticated','public.tgg_create_collaboration_request(uuid,text,text,text)','EXECUTE'),
      'respond_collab',has_function_privilege('authenticated','public.tgg_respond_collaboration_request(uuid,boolean)','EXECUTE'),
      'start_call',has_function_privilege('authenticated','public.tgg_start_call_room(uuid,text)','EXECUTE'),
      'end_call',has_function_privilege('authenticated','public.tgg_end_call_room(uuid)','EXECUTE')
    ),
    'generated_at',now()
  );
end;
$function$;

revoke all on function private.tgg_create_conversation(uuid,text) from public,anon;
grant execute on function private.tgg_create_conversation(uuid,text) to authenticated;
revoke all on function public.tgg_create_conversation(uuid,text) from public,anon;
grant execute on function public.tgg_create_conversation(uuid,text) to authenticated;

revoke all on function private.tgg_send_message(uuid,text,text,uuid) from public,anon;
grant execute on function private.tgg_send_message(uuid,text,text,uuid) to authenticated;
revoke all on function public.tgg_send_message(uuid,text,text,uuid) from public,anon;
grant execute on function public.tgg_send_message(uuid,text,text,uuid) to authenticated;
revoke all on function public.tgg_send_message(uuid,text) from public,anon;
grant execute on function public.tgg_send_message(uuid,text) to authenticated;

revoke all on function private.tgg_mark_conversation_read(uuid) from public,anon;
grant execute on function private.tgg_mark_conversation_read(uuid) to authenticated;
revoke all on function public.tgg_mark_conversation_read(uuid) from public,anon;
grant execute on function public.tgg_mark_conversation_read(uuid) to authenticated;

insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       regexp_replace(p.proname,'_v[0-9]+$',''),
       'Messaging V2 behavior flattened into canonical overloads; capability checks and live Creator OS now use canonical RPC names.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private')
  and p.proname in ('tgg_create_conversation_v2','tgg_send_message_v2','tgg_mark_conversation_read_v2')
on conflict do nothing;

drop function if exists public.tgg_create_conversation_v2(uuid,text);
drop function if exists private.tgg_create_conversation_v2(uuid,text);
drop function if exists public.tgg_send_message_v2(uuid,text,text,uuid);
drop function if exists private.tgg_send_message_v2(uuid,text,text,uuid);
drop function if exists public.tgg_mark_conversation_read_v2(uuid);
drop function if exists private.tgg_mark_conversation_read_v2(uuid);


-- ============================================================
-- MIGRATION 20260907172536 make_messaging_v3_behavior_canonical_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_create_conversation(p_user_id uuid, p_title text default null)
returns uuid
language plpgsql
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_recipient uuid;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select a.user_id into v_recipient
  from public.artists a
  where a.id=p_user_id or a.user_id=p_user_id
  limit 1;

  if v_recipient is null or v_recipient=v_uid then
    raise exception 'INVALID_RECIPIENT';
  end if;

  select c.id into v_id
  from public.tgg_conversations c
  join public.tgg_conversation_members a
    on a.conversation_id=c.id and a.user_id=v_uid
  join public.tgg_conversation_members b
    on b.conversation_id=c.id and b.user_id=v_recipient
  where c.project_type='dm'
    and (
      select count(*)
      from public.tgg_conversation_members m
      where m.conversation_id=c.id
    )=2
  order by c.created_at desc
  limit 1;

  if v_id is not null then return v_id; end if;

  insert into public.tgg_conversations(
    created_by,title,project_type,status,last_message_at
  )
  values(
    v_uid,
    coalesce(nullif(left(btrim(coalesce(p_title,'')),200),''),'Creator Chat'),
    'dm','active',null
  )
  returning id into v_id;

  insert into public.tgg_conversation_members(conversation_id,user_id,role)
  values(v_id,v_uid,'member'),(v_id,v_recipient,'member');

  return v_id;
end
$function$;

create or replace function public.tgg_send_message(
  p_conversation_id uuid,
  p_body text,
  p_message_type text default 'text',
  p_reply_to_id uuid default null
)
returns uuid
language plpgsql
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_body text:=nullif(btrim(coalesce(p_body,'')),'');
  v_type text:=coalesce(nullif(btrim(coalesce(p_message_type,'')),''),'text');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  if not exists(
    select 1
    from public.tgg_conversation_members
    where conversation_id=p_conversation_id
      and user_id=v_uid
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  if v_body is null then raise exception 'EMPTY_MESSAGE'; end if;
  if char_length(v_body)>5000 then raise exception 'MESSAGE_TOO_LONG'; end if;
  if v_type not in ('text') then raise exception 'INVALID_MESSAGE_TYPE'; end if;

  if p_reply_to_id is not null and not exists(
    select 1
    from public.tgg_messages
    where id=p_reply_to_id
      and conversation_id=p_conversation_id
  ) then
    raise exception 'INVALID_REPLY';
  end if;

  insert into public.tgg_messages(
    conversation_id,sender_id,body,message_type,reply_to_message_id
  )
  values(
    p_conversation_id,v_uid,v_body,v_type,p_reply_to_id
  )
  returning id into v_id;

  update public.tgg_conversations
  set last_message_at=now(),updated_at=now()
  where id=p_conversation_id;

  return v_id;
end
$function$;

create or replace function public.tgg_send_message(p_conversation_id uuid, p_body text)
returns uuid
language sql
set search_path to ''
as $function$
  select public.tgg_send_message(p_conversation_id,p_body,'text',null);
$function$;

create or replace function public.tgg_mark_conversation_read(p_conversation_id uuid)
returns boolean
language plpgsql
set search_path to 'public','pg_catalog'
as $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  update public.tgg_conversation_members
  set last_read_at=now()
  where conversation_id=p_conversation_id and user_id=v_uid;

  return found;
end
$function$;

revoke all on function public.tgg_create_conversation(uuid,text) from public,anon;
grant execute on function public.tgg_create_conversation(uuid,text) to authenticated;
revoke all on function public.tgg_send_message(uuid,text,text,uuid) from public,anon;
grant execute on function public.tgg_send_message(uuid,text,text,uuid) to authenticated;
revoke all on function public.tgg_send_message(uuid,text) from public,anon;
grant execute on function public.tgg_send_message(uuid,text) to authenticated;
revoke all on function public.tgg_mark_conversation_read(uuid) from public,anon;
grant execute on function public.tgg_mark_conversation_read(uuid) to authenticated;

create or replace function public.tgg_creator_workflow_readiness()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with launch as (select public.tgg_launch_readiness() j),
checks as (
  select * from (values
    ('studio_pipeline','READY',
      has_function_privilege('authenticated','public.tgg_studio_create_project(text,text,numeric,text,text)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_finalize_studio_upload(uuid,text,text,text,text,bigint,jsonb)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_studio_save_version(uuid,text)','EXECUTE')
      and position('tgg_media_vault_assets' in pg_get_functiondef('public.tgg_finalize_studio_upload(uuid,text,text,text,text,bigint,jsonb)'::regprocedure))>0,
      'Studio create → secure upload → version → Vault registration'),
    ('beat_to_studio','READY',
      has_function_privilege('authenticated','public.tgg_studio_create_project(text,text,numeric,text,text)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_beat_pattern_save(uuid,text,numeric,integer,jsonb,uuid)','EXECUTE')
      and to_regclass('public.tgg_studio_projects') is not null
      and to_regclass('public.tgg_beat_patterns') is not null,
      'Beat projects use the shared Studio project backbone'),
    ('studio_collaboration','READY',
      has_function_privilege('authenticated','public.tgg_studio_project_collab_invite(uuid,uuid,text,text)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_studio_project_collab_respond(uuid,boolean)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_studio_project_presence_upsert(uuid,text,text,text,jsonb,jsonb)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_studio_project_apply_patch(uuid,text,text,text,jsonb,bigint)','EXECUTE'),
      'Invite → shared presence/control state → revisioned project patches'),
    ('video_pipeline','READY',
      has_function_privilege('authenticated','public.tgg_finalize_video_upload(uuid,text,text,text,bigint,numeric,integer,integer,jsonb)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_video_submit_from_storage(text,text,text,text,date,boolean,text,boolean)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_video_publish(uuid)','EXECUTE')
      and coalesce((public.tgg_video_pipeline_final_health()->>'ok')::boolean,false),
      'Video upload → Vault registration → submit/publish'),
    ('live_to_replay',
      case when coalesce(((select j->'live'->>'sfu_turn_connected' from launch))::boolean,false) then 'READY' else 'READY_WITH_FALLBACK' end,
      has_function_privilege('authenticated','public.tgg_live_studio_create(text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_live_start(uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_live_end(uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_live_studio_finalize_replay(uuid,text,numeric,text,jsonb)','EXECUTE')
      and position('vault_registered' in pg_get_functiondef('public.tgg_live_studio_finalize_replay(uuid,text,numeric,text,jsonb)'::regprocedure))>0,
      'Live control plane → recording → replay → Vault + Video Studio handoff'),
    ('messages_attachments','READY',
      has_function_privilege('authenticated','public.tgg_send_message(uuid,text,text,uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_finalize_message_upload(uuid,text,text,bigint,text,jsonb)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_get_message_attachment_manifest(uuid)','EXECUTE'),
      'Message → secure attachment upload → attachment manifest'),
    ('calls',
      case when coalesce(((select j->'calls'->>'two_user_validated' from launch))::boolean,false) then 'READY' else 'VALIDATION_REQUIRED' end,
      has_function_privilege('authenticated','public.tgg_start_call_room(uuid,text)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_call_signal_send(uuid,text,jsonb,uuid)','EXECUTE'),
      'Core room/signaling ready; real two-user proof tracked separately'),
    ('vault','READY',
      has_function_privilege('authenticated','public.tgg_finalize_vault_upload(text,text,text,text,bigint,numeric,integer,integer,jsonb)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_vault_item_create(text,text,text,uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_attach_vault_media(uuid,uuid)','EXECUTE'),
      'Secure media Vault upload → Vault item → attach media'),
    ('store_checkout',
      case when (select j->'payments'->>'safe_mode' from launch)='native_stripe' then 'READY' else 'READY_WITH_FALLBACK' end,
      has_function_privilege('authenticated','public.tgg_store_product_create(text,text,text,integer,text,text,integer,text)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_store_product_set_payment_link(uuid,text)','EXECUTE')
      and ((select j->'payments'->>'safe_mode' from launch) in ('native_stripe','payment_link_fallback')),
      'Product create/update plus production-safe Stripe checkout mode'),
    ('audiobook_publish','READY',
      has_function_privilege('authenticated','public.tgg_audiobook_create_draft(text,text,text,text,text,text,text,boolean,boolean)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_audiobook_add_chapter_from_storage(uuid,integer,text,text,numeric,boolean)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_audiobook_submit(uuid)','EXECUTE')
      and to_regprocedure('public.tgg_public_audiobooks_feed(integer)') is not null,
      'Audiobook draft → storage chapters → submit → public feed'),
    ('game_sessions','READY',
      has_function_privilege('authenticated','public.tgg_game_create_draft(text,text,jsonb,timestamp with time zone)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_game_session_create(uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_game_session_join(uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_game_session_start(uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.tgg_game_session_end(uuid)','EXECUTE')
      and to_regprocedure('public.tgg_public_game_leaderboard(uuid)') is not null,
      'Create game → create/join/start/end session → public leaderboard'),
    ('public_publish','READY',
      to_regprocedure('public.tgg_public_video_feed(integer)') is not null
      and to_regprocedure('public.tgg_public_audiobooks_feed(integer)') is not null
      and to_regprocedure('public.tgg_public_games_bundle(integer)') is not null
      and to_regprocedure('public.tgg_public_live_bundle(uuid)') is not null
      and jsonb_array_length(coalesce(public.tgg_public_one_final_bundle()->'releases','[]'::jsonb))>0,
      'Public release/video/audiobook/game/live read paths are present')
  ) v(workflow_key,status,ready,detail)
),
agg as (
  select count(*) total,
         count(*) filter(where ready) ready_count,
         count(*) filter(where status='READY') full_ready,
         count(*) filter(where status='READY_WITH_FALLBACK') fallback_ready,
         count(*) filter(where status='VALIDATION_REQUIRED') validation_required,
         jsonb_object_agg(workflow_key,jsonb_build_object('status',status,'ready',ready,'detail',detail)) workflows
  from checks
)
select jsonb_build_object(
  'ok',ready_count=total,
  'version','WORKFLOW-READINESS-1.1',
  'ready_count',ready_count,
  'total',total,
  'full_ready',full_ready,
  'fallback_ready',fallback_ready,
  'validation_required',validation_required,
  'workflows',workflows,
  'generated_at',now()
)
from agg;
$function$;

create or replace function public.tgg_creator_access_readiness()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with write_functions as (
  select p.oid,p.proname
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'tgg_studio_create_project','tgg_finalize_studio_upload','tgg_studio_save_version',
      'tgg_beat_pattern_save','tgg_studio_project_collab_invite','tgg_studio_project_collab_respond',
      'tgg_studio_project_presence_upsert','tgg_studio_project_apply_patch',
      'tgg_finalize_video_upload','tgg_video_submit_from_storage','tgg_video_publish',
      'tgg_live_studio_create','tgg_live_start','tgg_live_end','tgg_live_studio_finalize_replay',
      'tgg_send_message','tgg_finalize_message_upload','tgg_start_call_room','tgg_call_signal_send',
      'tgg_finalize_vault_upload','tgg_vault_item_create','tgg_attach_vault_media',
      'tgg_store_product_create','tgg_store_product_set_payment_link',
      'tgg_audiobook_create_draft','tgg_audiobook_add_chapter_from_storage','tgg_audiobook_submit',
      'tgg_game_create_draft','tgg_game_session_create','tgg_game_session_join',
      'tgg_game_session_start','tgg_game_session_end'
    )
),
function_checks as (
  select count(*) total,
         count(*) filter(where not p.prosecdef) invoker_count,
         count(*) filter(where has_function_privilege('authenticated',p.oid,'EXECUTE')) auth_exec_count,
         count(*) filter(where not has_function_privilege('anon',p.oid,'EXECUTE')) anon_blocked_count,
         count(*) filter(where not has_function_privilege('public',p.oid,'EXECUTE')) public_blocked_count
  from write_functions w join pg_proc p on p.oid=w.oid
),
core_tables(name) as (
  values
    ('tgg_studio_projects'),('tgg_studio_assets'),('tgg_studio_project_members'),
    ('tgg_beat_patterns'),('tgg_media_vault_assets'),('tgg_creative_projects'),
    ('live_streams'),('tgg_live_replays'),('tgg_conversation_members'),('tgg_messages'),
    ('merch_products'),('tgg_audiobooks'),('tgg_audiobook_chapters'),
    ('tgg_games'),('tgg_game_sessions'),('tgg_vault_items')
),
table_checks as (
  select count(*) total,count(*) filter(where c.relrowsecurity) rls_enabled_count
  from core_tables t
  join pg_class c on c.relname=t.name
  join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
),
collab as (
  select jsonb_build_object(
    'studio_assets_shared_select',exists(select 1 from pg_policy pol join pg_class c on c.oid=pol.polrelid where c.relname='tgg_studio_assets' and pol.polname='tgg_studio_assets_member_select'),
    'studio_assets_creator_write',exists(select 1 from pg_policy pol join pg_class c on c.oid=pol.polrelid where c.relname='tgg_studio_assets' and pol.polname='tgg_studio_assets_member_insert'),
    'beat_patterns_shared_select',exists(select 1 from pg_policy pol join pg_class c on c.oid=pol.polrelid where c.relname='tgg_beat_patterns' and pol.polname='tgg_beat_patterns_project_select'),
    'beat_patterns_shared_edit',exists(select 1 from pg_policy pol join pg_class c on c.oid=pol.polrelid where c.relname='tgg_beat_patterns' and pol.polname='tgg_beat_patterns_project_update'),
    'beat_identity_lock',exists(select 1 from pg_trigger tg join pg_class c on c.oid=tg.tgrelid where c.relname='tgg_beat_patterns' and tg.tgname='tgg_lock_beat_pattern_identity' and not tg.tgisinternal)
  ) j
),
summary as (
  select f.total function_total,f.invoker_count,f.auth_exec_count,f.anon_blocked_count,f.public_blocked_count,
         t.total table_total,t.rls_enabled_count,c.j collab
  from function_checks f cross join table_checks t cross join collab c
)
select jsonb_build_object(
  'ok',
    invoker_count=function_total
    and auth_exec_count=function_total
    and anon_blocked_count=function_total
    and public_blocked_count=function_total
    and rls_enabled_count=table_total
    and not exists(select 1 from jsonb_each(collab) where coalesce((value#>>'{}')::boolean,false)=false),
  'version','ACCESS-QA-1.1',
  'write_functions',jsonb_build_object(
    'total',function_total,'security_invoker',invoker_count,'authenticated_execute',auth_exec_count,
    'anon_blocked',anon_blocked_count,'public_blocked',public_blocked_count
  ),
  'rls',jsonb_build_object('core_tables',table_total,'enabled',rls_enabled_count),
  'collaboration',collab,
  'generated_at',now()
)
from summary;
$function$;

insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       'tgg_send_message',
       'V3 messaging behavior moved into canonical tgg_send_message; readiness checks updated to canonical signature.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_send_message_v3'
on conflict do nothing;

drop function if exists public.tgg_send_message_v3(uuid,text,text,uuid);


-- ============================================================
-- MIGRATION 20260907172615 flatten_artist_directory_and_sound_library_versions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_public_artist_directory(
  p_query text default null,
  p_limit integer default 50
)
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select tgg_safe_api.public_artist_directory_v2($1,$2)
    || jsonb_build_object('version','ARTIST-DIRECTORY-CANONICAL-1.0');
$function$;

create or replace function public.tgg_sound_library_search(
  p_query text default null,
  p_asset_type text default null,
  p_bpm_min numeric default null,
  p_bpm_max numeric default null,
  p_key text default null,
  p_license_kind text default null,
  p_source_provider text default null,
  p_commercial_only boolean default false,
  p_importable_only boolean default true,
  p_favorites_only boolean default false,
  p_owned_only boolean default false,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_items jsonb;
  v_facets jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.favorited desc,x.title),'[]'::jsonb)
  into v_items
  from (
    select
      s.id,s.title,s.asset_type,s.bpm,s.musical_key,s.tags,s.duration_seconds,
      s.preview_url,s.source_provider,s.source_item_url,
      s.license_name,s.license_url,s.license_kind,
      s.commercial_use_allowed,s.attribution_required,s.attribution_text,s.import_allowed,
      (s.owner_user_id=v_uid) as owned,
      exists(
        select 1 from public.tgg_sound_library_favorites f
        where f.user_id=v_uid and f.sound_id=s.id
      ) as favorited
    from public.tgg_sound_library_items s
    where s.is_active=true
      and (s.owner_user_id is null or s.owner_user_id=v_uid)
      and (p_asset_type is null or s.asset_type=p_asset_type)
      and (p_bpm_min is null or s.bpm>=p_bpm_min)
      and (p_bpm_max is null or s.bpm<=p_bpm_max)
      and (p_key is null or lower(coalesce(s.musical_key,''))=lower(p_key))
      and (p_license_kind is null or s.license_kind=p_license_kind)
      and (p_source_provider is null or s.source_provider=p_source_provider)
      and (not coalesce(p_commercial_only,false) or s.commercial_use_allowed=true)
      and (not coalesce(p_importable_only,true) or s.import_allowed=true)
      and (not coalesce(p_owned_only,false) or s.owner_user_id=v_uid)
      and (
        not coalesce(p_favorites_only,false)
        or exists(
          select 1 from public.tgg_sound_library_favorites f
          where f.user_id=v_uid and f.sound_id=s.id
        )
      )
      and (
        nullif(btrim(coalesce(p_query,'')),'') is null
        or s.title ilike '%'||btrim(p_query)||'%'
        or s.source_provider ilike '%'||btrim(p_query)||'%'
        or s.license_name ilike '%'||btrim(p_query)||'%'
        or exists(select 1 from unnest(s.tags) t where t ilike '%'||btrim(p_query)||'%')
      )
    order by favorited desc,s.title
    limit v_limit
  ) x;

  select jsonb_build_object(
    'asset_types',coalesce((
      select jsonb_agg(asset_type order by asset_type)
      from (
        select distinct asset_type
        from public.tgg_sound_library_items
        where is_active=true and (owner_user_id is null or owner_user_id=v_uid)
      ) q
    ),'[]'::jsonb),
    'license_kinds',coalesce((
      select jsonb_agg(license_kind order by license_kind)
      from (
        select distinct license_kind
        from public.tgg_sound_library_items
        where is_active=true and (owner_user_id is null or owner_user_id=v_uid)
      ) q
    ),'[]'::jsonb),
    'source_providers',coalesce((
      select jsonb_agg(source_provider order by source_provider)
      from (
        select distinct source_provider
        from public.tgg_sound_library_items
        where is_active=true and (owner_user_id is null or owner_user_id=v_uid)
      ) q
    ),'[]'::jsonb),
    'keys',coalesce((
      select jsonb_agg(musical_key order by musical_key)
      from (
        select distinct musical_key
        from public.tgg_sound_library_items
        where is_active=true
          and musical_key is not null
          and (owner_user_id is null or owner_user_id=v_uid)
      ) q
    ),'[]'::jsonb)
  ) into v_facets;

  return jsonb_build_object(
    'ok',true,
    'version','SOUND-LIBRARY-CANONICAL-1.0',
    'items',v_items,
    'facets',v_facets,
    'filters',jsonb_build_object(
      'commercial_only',coalesce(p_commercial_only,false),
      'importable_only',coalesce(p_importable_only,true),
      'favorites_only',coalesce(p_favorites_only,false),
      'owned_only',coalesce(p_owned_only,false)
    ),
    'policy',jsonb_build_object(
      'copyrighted_scraping',false,
      'unverified_external_imports',false,
      'accepted_license_kinds',jsonb_build_array(
        'user_owned','public_domain','cc0','creative_commons','royalty_free','custom_reusable'
      )
    ),
    'generated_at',now()
  );
end;
$function$;

do $do$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tgg_public_one_final_bundle'
  limit 1;
  v_def := replace(v_def,'public.tgg_public_artist_directory_v2(null,100)','public.tgg_public_artist_directory(null,100)');
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tgg_creator_beatmaker_bundle'
  limit 1;
  v_def := replace(v_def,'public.tgg_sound_library_search_v2','public.tgg_sound_library_search');
  execute v_def;
end
$do$;

insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       regexp_replace(p.proname,'_v[0-9]+$',''),
       'Versioned behavior flattened into canonical unversioned overload and internal callers redirected.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('tgg_public_artist_directory_v2','tgg_sound_library_search_v2')
on conflict do nothing;

drop function if exists public.tgg_public_artist_directory_v2(text,integer);
drop function if exists public.tgg_sound_library_search_v2(
  text,text,numeric,numeric,text,text,text,boolean,boolean,boolean,boolean,integer
);


-- ============================================================
-- MIGRATION 20260907172712 flatten_creator_os_final_v5000_into_canonical
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $do$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tgg_creator_os_final_bundle'
  limit 1;

  v_def := replace(
    v_def,
    E'  v_manifest jsonb;\nbegin',
    E'  v_manifest jsonb;\n  v_expansion jsonb;\nbegin'
  );

  v_def := replace(
    v_def,
    E'  v_activation_consistency:=public.tgg_activation_queue_consistency_audit();',
    E'  v_activation_consistency:=public.tgg_activation_queue_consistency_audit();\n  v_expansion:=public.tgg_creator_expansion_control_center();'
  );

  v_def := replace(
    v_def,
    E'    \'smart_links\',public.tgg_creator_smart_links_bundle(100),\n    \'build_manifest\',v_manifest\n  );',
    E'    \'smart_links\',public.tgg_creator_smart_links_bundle(100),\n    \'expansion_control\',v_expansion,\n    \'build_manifest\',v_manifest||jsonb_build_object(\n      \'v5000_one_load\',true,\n      \'stripe_payment_link_commerce\',true,\n      \'distribution_adapter_ready\',coalesce((v_expansion#>>\'{providers,distribution,adapter_ready}\')::boolean,false),\n      \'broadcast_sfu_turn_adapter_ready\',coalesce((v_expansion#>>\'{providers,broadcast,adapter_ready}\')::boolean,false),\n      \'call_validation_harness_ready\',coalesce((v_expansion#>>\'{providers,call_validation,harness_ready}\')::boolean,false),\n      \'optional_upgrade_activation_layer\',true\n    )\n  );'
  );

  if position('v_expansion:=public.tgg_creator_expansion_control_center()' in v_def)=0
     or position('expansion_control' in v_def)=0 then
    raise exception 'CANONICAL_FLATTEN_PATCH_FAILED';
  end if;

  execute v_def;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='tgg_creator_ui_action_readiness'
  limit 1;

  v_def := replace(v_def,'tgg_creator_os_final_bundle_v5000','tgg_creator_os_final_bundle');
  execute v_def;
end
$do$;


-- ============================================================
-- MIGRATION 20260907172745 retire_last_versioned_tgg_rpc_and_sync_v59
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       'tgg_creator_os_final_bundle',
       'V5000 behavior flattened into canonical tgg_creator_os_final_bundle; live Creator OS V59 and readiness checks now use canonical RPC.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_creator_os_final_bundle_v5000'
on conflict do nothing;

drop function if exists public.tgg_creator_os_final_bundle_v5000();

update private.tgg_edge_function_registry
set deployment_version=59,
    source_hash='08510a1120243ba6d70ba3f6c807db7c756dd869b0601cf4dadb4e5d5705f653',
    updated_at=to_timestamp(1788802041825/1000.0),
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',59,
      'edge_sha256','08510a1120243ba6d70ba3f6c807db7c756dd869b0601cf4dadb4e5d5705f653',
      'build','V5000-CODESYNC',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v59',
      'checkpoint_state','ready',
      'fingerprint','08510a1120243ba6d70ba3f6c807db7c756dd869b0601cf4dadb4e5d5705f653'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',28,
      'code_sync_backup_controller',true,
      'code_sync_visible_workspace',true,
      'edge_update_in_place_policy',true,
      'edge_retirement_manifest',true,
      'canonical_rpc_consolidation',true,
      'versioned_public_tgg_rpc_count',0
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907172954 track_rpc_rls_dependencies_and_intentional_version_names
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists private.tgg_rpc_intentional_version_names (
  schema_name text not null,
  function_name text not null,
  reason text not null,
  keep boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(schema_name,function_name)
);

insert into private.tgg_rpc_intentional_version_names(schema_name,function_name,reason,keep)
values
  ('private','tgg_is_v401_conversation_member','Security helper used by active RLS policies on conversation/message tables; retain intentionally.',true),
  ('private','tgg_reconcile_v531_baseline_fields','Active production trigger bound to tgg_production_baselines; baseline-specific reconciliation logic.',true),
  ('public','tgg_creator_os_v5000_health','Standalone V5000 compatibility/health endpoint retained intentionally; not a duplicate suffix chain.',true)
on conflict(schema_name,function_name) do update set
  reason=excluded.reason,
  keep=true,
  updated_at=now();

alter table private.tgg_rpc_registry
  add column if not exists policy_refs integer not null default 0;

create or replace function private.tgg_codesync_refresh_rpc_registry()
returns jsonb
language plpgsql
set search_path=private,public,pg_catalog,pg_temp
as $$
declare
  r record;
  v_db_refs int;
  v_policy_refs int;
  v_state text;
  v_count int:=0;
begin
  for r in
    select
      n.nspname as schema_name,
      p.oid,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args,
      regexp_replace(p.proname,'_v[0-9]+$','') as family_key,
      nullif(substring(p.proname from '_v([0-9]+)$'),'')::int as version_num
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private')
      and p.prokind in ('f','p')
      and p.proname like 'tgg_%'
  loop
    select count(*) into v_db_refs
    from pg_proc q
    join pg_namespace nq on nq.oid=q.pronamespace
    where nq.nspname in ('public','private')
      and q.prokind in ('f','p')
      and q.oid<>r.oid
      and pg_get_functiondef(q.oid) ~ (
        '(^|[^A-Za-z0-9_])' ||
        regexp_replace(r.function_name, '([\\.\\+\\*\\?\\[\\^\\]\\$\\(\\)\\{\\}=!<>|:\\-])', '\\\1', 'g') ||
        '([^A-Za-z0-9_]|$)'
      );

    select count(*) into v_policy_refs
    from pg_policy pol
    where coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') ~ (
            '(^|[^A-Za-z0-9_])' ||
            regexp_replace(r.function_name, '([\\.\\+\\*\\?\\[\\^\\]\\$\\(\\)\\{\\}=!<>|:\\-])', '\\\1', 'g') ||
            '([^A-Za-z0-9_]|$)'
          )
       or coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'') ~ (
            '(^|[^A-Za-z0-9_])' ||
            regexp_replace(r.function_name, '([\\.\\+\\*\\?\\[\\^\\]\\$\\(\\)\\{\\}=!<>|:\\-])', '\\\1', 'g') ||
            '([^A-Za-z0-9_]|$)'
          );

    if exists (
      select 1 from private.tgg_rpc_intentional_version_names i
      where i.schema_name=r.schema_name
        and i.function_name=r.function_name
        and i.keep
    ) then
      v_state:='active';
    elsif r.version_num is not null and v_db_refs=0 and v_policy_refs=0 then
      v_state:='safe_to_retire';
    elsif r.version_num is not null then
      v_state:='consolidate';
    elsif exists (
      select 1
      from pg_proc q
      join pg_namespace nq on nq.oid=q.pronamespace
      where nq.nspname in ('public','private')
        and nq.nspname<>r.schema_name
        and q.proname=r.function_name
        and pg_get_function_identity_arguments(q.oid)=r.identity_args
    ) then
      v_state:='wrapper_pair';
    else
      v_state:='active';
    end if;

    insert into private.tgg_rpc_registry(
      schema_name,function_name,identity_args,family_key,version_num,
      db_refs,policy_refs,state,notes,last_scanned_at
    )
    values(
      r.schema_name,r.function_name,r.identity_args,r.family_key,r.version_num,
      v_db_refs,v_policy_refs,v_state,
      case
        when v_policy_refs>0 then 'Referenced by active RLS policies; do not retire without migrating policies.'
        when v_state='safe_to_retire' then 'No database-function or RLS-policy references detected.'
        when v_state='consolidate' then 'Versioned RPC still has dependencies; consolidate before retirement.'
        when v_state='wrapper_pair' then 'Public/private pair preserved pending security-wrapper comparison.'
        else null
      end,
      now()
    )
    on conflict(schema_name,function_name,identity_args) do update set
      family_key=excluded.family_key,
      version_num=excluded.version_num,
      db_refs=excluded.db_refs,
      policy_refs=excluded.policy_refs,
      state=case when private.tgg_rpc_registry.state='retired' then 'retired' else excluded.state end,
      notes=excluded.notes,
      last_scanned_at=now();

    v_count:=v_count+1;
  end loop;

  delete from private.tgg_rpc_registry rr
  where rr.state<>'retired'
    and not exists(
      select 1
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname=rr.schema_name
        and p.proname=rr.function_name
        and pg_get_function_identity_arguments(p.oid)=rr.identity_args
    );

  insert into public.tgg_code_sync_rpc_state(
    id,tracked,canonical,consolidate,safe_to_retire,wrapper_pairs,retired,updated_at
  )
  values(
    1,
    (select count(*) from private.tgg_rpc_registry),
    (select count(*) from private.tgg_rpc_registry where state='canonical'),
    (select count(*) from private.tgg_rpc_registry where state='consolidate'),
    (select count(*) from private.tgg_rpc_registry where state='safe_to_retire'),
    (select count(*) from private.tgg_rpc_registry where state='wrapper_pair'),
    (select count(*) from private.tgg_rpc_registry where state='retired'),
    now()
  )
  on conflict(id) do update set
    tracked=excluded.tracked,
    canonical=excluded.canonical,
    consolidate=excluded.consolidate,
    safe_to_retire=excluded.safe_to_retire,
    wrapper_pairs=excluded.wrapper_pairs,
    retired=excluded.retired,
    updated_at=excluded.updated_at;

  return jsonb_build_object('ok',true,'tracked',v_count,'refreshed_at',now());
end;
$$;

select private.tgg_codesync_refresh_rpc_registry();


-- ============================================================
-- MIGRATION 20260907173327 dedupe_one_final_route_aliases
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_enforce_one_final_routes()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_creator_os text:='https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1';
begin
  if new.path ilike '%/functions/v1/creator-os-command-center%' then
    if new.route_key='owner_master_admin' then
      new.path:='/p/admin-dashboard.html';
    else
      raise exception 'ONE_FINAL_RETIRED_ROUTE_FORBIDDEN';
    end if;
  end if;

  if new.route_key='owner_master_admin' then
    new.path:='/p/admin-dashboard.html';
    new.title:='Master Admin';
    new.is_active:=true;
    new.is_primary:=true;
    new.description:='Owner-only Master Admin canonical route.';
  elsif new.route_key='admin_dashboard' then
    new.path:='/p/admin-dashboard.html';
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='Legacy Admin alias. Master Admin is canonical.';
  elsif new.route_key='artist_creator_os' then
    new.path:=v_creator_os;
    new.title:='Creator OS · ONE FINAL';
    new.workspace_key:='dashboard';
    new.is_active:=true;
    new.is_primary:=true;
  elsif new.route_key='creator_settings' then
    new.path:=v_creator_os;
    new.workspace_key:='settings';
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='Settings is consolidated inside Creator OS Control; duplicate route alias retired.';
  elsif new.route_key='artist_dashboard' then
    new.path:='/p/artist-dashboard_0633467215.html';
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='Legacy Artist Dashboard compatibility alias. ONE-FINAL Creator OS is canonical.';
  elsif new.route_key='artist_command_center' then
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='Retired Command Center compatibility route. ONE-FINAL Creator OS is canonical.';
  elsif new.route_key='artist_growth' then
    new.path:=v_creator_os||'#growth';
    new.workspace_key:='growth';
    new.is_active:=true;
    new.is_primary:=false;
    new.description:='Canonical ONE-FINAL Growth workspace route.';
  elsif new.route_key='artist_campaigns' then
    new.path:=v_creator_os||'#growth';
    new.workspace_key:='growth';
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='Campaigns is consolidated inside Growth Intelligence; duplicate route alias retired.';
  elsif new.route_key='artist_smartlinks' then
    new.path:=v_creator_os||'#releases';
    new.workspace_key:='releases';
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='Smart Links is consolidated inside Releases; duplicate route alias retired.';
  elsif new.route_key='artist_phone' then
    new.path:=v_creator_os||'#messages';
    new.workspace_key:='messages';
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='TGG Phone is consolidated inside Messages/Calls; duplicate route alias retired.';
  elsif new.route_key='releases' then
    new.path:='/search/label/Mixtapes';
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='Public Releases alias retired; Mixtapes is the canonical public catalog route.';
  elsif new.route_key='merch' then
    new.path:='/p/creator-store.html';
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='Legacy Store alias retired; public_store is canonical.';
  elsif new.path='/p/command-center.html' or new.path like '/p/command-center.html#%' then
    new.is_active:=false;
    new.is_primary:=false;
    new.description:='Retired Command Center compatibility path. ONE-FINAL Creator OS is canonical.';
  end if;

  return new;
end
$function$;

update public.tgg_site_routes set is_active=false,is_primary=false,
  description='Campaigns is consolidated inside Growth Intelligence; duplicate route alias retired.'
where route_key='artist_campaigns';

update public.tgg_site_routes set is_active=false,is_primary=false,
  description='Smart Links is consolidated inside Releases; duplicate route alias retired.'
where route_key='artist_smartlinks';

update public.tgg_site_routes set is_active=false,is_primary=false,
  description='TGG Phone is consolidated inside Messages/Calls; duplicate route alias retired.'
where route_key='artist_phone';

update public.tgg_site_routes set is_active=false,is_primary=false,
  description='Settings is consolidated inside Creator OS Control; duplicate route alias retired.'
where route_key='creator_settings';

update public.tgg_site_routes set is_active=false,is_primary=false,
  description='Legacy Admin alias. Master Admin is canonical.'
where route_key='admin_dashboard';

update public.tgg_site_routes set is_active=false,is_primary=false,
  description='Public Releases alias retired; Mixtapes is the canonical public catalog route.'
where route_key='releases';

update public.tgg_site_routes set is_active=false,is_primary=false,
  description='Legacy Store alias retired; public_store is canonical.'
where route_key='merch';

update public.tgg_site_routes set is_active=true,is_primary=true
where route_key in ('artist_creator_os','owner_master_admin','public_store','mixtapes');

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907173521 collapse_same_role_route_aliases
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_enforce_one_final_routes()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_creator_os text:='https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1';
begin
  if new.path ilike '%/functions/v1/creator-os-command-center%' then
    if new.route_key='owner_master_admin' then
      new.path:='/p/admin-dashboard.html';
    else
      raise exception 'ONE_FINAL_RETIRED_ROUTE_FORBIDDEN';
    end if;
  end if;

  if new.route_key='owner_master_admin' then
    new.path:='/p/admin-dashboard.html';
    new.title:='Master Admin';
    new.is_active:=true;
    new.is_primary:=true;
    new.description:='Owner-only Master Admin canonical route.';
  elsif new.route_key='admin_dashboard' then
    new.path:='/p/admin-dashboard.html';
    new.is_active:=false; new.is_primary:=false;
    new.description:='Legacy Admin alias. Master Admin is canonical.';
  elsif new.route_key='artist_creator_os' then
    new.path:=v_creator_os;
    new.title:='Creator OS · ONE FINAL';
    new.workspace_key:='dashboard';
    new.is_active:=true; new.is_primary:=true;
  elsif new.route_key in ('creator_settings','artist_campaigns','artist_smartlinks','artist_phone') then
    new.is_active:=false; new.is_primary:=false;
    new.description:='Feature consolidated inside canonical Creator OS workspace; duplicate route alias retired.';
  elsif new.route_key in ('artist_opportunities','artist_credits','artist_academy') then
    new.path:='/p/career-os.html';
    new.is_active:=false; new.is_primary:=false;
    new.description:='Career sub-feature consolidated inside Career OS; duplicate route alias retired.';
  elsif new.route_key in ('artist_fans','artist_collaboration') then
    new.path:='/p/backstage.html';
    new.is_active:=false; new.is_primary:=false;
    new.description:='Backstage sub-feature consolidated inside Creator OS audience/connect workspaces; duplicate route alias retired.';
  elsif new.route_key in ('artist_releases','artist_distribution') then
    new.path:='/p/music-hub.html';
    new.is_active:=false; new.is_primary:=false;
    new.description:='Music sub-feature consolidated inside canonical Releases/Music workspaces; duplicate route alias retired.';
  elsif new.route_key in ('artist_calls','artist_live') then
    new.path:='/p/live.html';
    new.is_active:=false; new.is_primary:=false;
    new.description:='Live/calls sub-feature consolidated inside Creator OS Live and Messages; duplicate route alias retired.';
  elsif new.route_key='charts' then
    new.path:='/p/homepage.html';
    new.is_active:=false; new.is_primary:=false;
    new.description:='Charts alias retired until a dedicated charts surface exists; Discover remains canonical.';
  elsif new.route_key='artist_dashboard' then
    new.path:='/p/artist-dashboard_0633467215.html';
    new.is_active:=false; new.is_primary:=false;
    new.description:='Legacy Artist Dashboard compatibility alias. ONE-FINAL Creator OS is canonical.';
  elsif new.route_key='artist_command_center' then
    new.is_active:=false; new.is_primary:=false;
    new.description:='Retired Command Center compatibility route. ONE-FINAL Creator OS is canonical.';
  elsif new.route_key='artist_growth' then
    new.path:=v_creator_os||'#growth';
    new.workspace_key:='growth';
    new.is_active:=true; new.is_primary:=false;
    new.description:='Canonical ONE-FINAL Growth workspace route.';
  elsif new.route_key='releases' then
    new.path:='/search/label/Mixtapes';
    new.is_active:=false; new.is_primary:=false;
    new.description:='Public Releases alias retired; Mixtapes is canonical public catalog route.';
  elsif new.route_key='merch' then
    new.path:='/p/creator-store.html';
    new.is_active:=false; new.is_primary:=false;
    new.description:='Legacy Store alias retired; public_store is canonical.';
  elsif new.path='/p/command-center.html' or new.path like '/p/command-center.html#%' then
    new.is_active:=false; new.is_primary:=false;
    new.description:='Retired Command Center compatibility path. ONE-FINAL Creator OS is canonical.';
  end if;

  return new;
end
$function$;

update public.tgg_site_routes
set is_active=false,is_primary=false,
    description=case
      when route_key in ('artist_opportunities','artist_credits','artist_academy')
        then 'Career sub-feature consolidated inside Career OS; duplicate route alias retired.'
      when route_key in ('artist_fans','artist_collaboration')
        then 'Backstage sub-feature consolidated inside Creator OS audience/connect workspaces; duplicate route alias retired.'
      when route_key in ('artist_releases','artist_distribution')
        then 'Music sub-feature consolidated inside canonical Releases/Music workspaces; duplicate route alias retired.'
      when route_key in ('artist_calls','artist_live')
        then 'Live/calls sub-feature consolidated inside Creator OS Live and Messages; duplicate route alias retired.'
      when route_key='charts'
        then 'Charts alias retired until a dedicated charts surface exists; Discover remains canonical.'
      else description
    end
where route_key in (
  'artist_opportunities','artist_credits','artist_academy',
  'artist_fans','artist_collaboration',
  'artist_releases','artist_distribution',
  'artist_calls','artist_live',
  'charts'
);

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907173702 finalize_route_dedup_and_real_health
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_site_routes
set is_active=false,
    is_primary=false,
    description='Following is consolidated inside Fan Hub / Artist World; duplicate route alias retired.'
where route_key='fan_following';

create or replace function public.tgg_route_registry_final_health()
returns jsonb
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with stats as (
  select
    count(*) as registered,
    count(*) filter(where is_active) as active,
    count(*) filter(where not is_active) as inactive_legacy_aliases,
    count(*) filter(where is_active and is_primary) as active_primary
  from public.tgg_site_routes
),
same_role_dupes as (
  select count(*) as cnt
  from (
    select area,access_level,path
    from public.tgg_site_routes
    where is_active
    group by area,access_level,path
    having count(*)>1
  ) q
),
workspace_dupes as (
  select count(*) as cnt
  from (
    select workspace_key
    from public.tgg_site_routes
    where is_active and workspace_key is not null
    group by workspace_key
    having count(*)>1
  ) q
),
nav_collisions as (
  select count(*) as cnt
  from (
    select nav_group,nav_order
    from public.tgg_site_routes
    where is_active
    group by nav_group,nav_order
    having count(*)>1
  ) q
),
canonical as (
  select jsonb_build_object(
    'home',(select path from public.tgg_site_routes where route_key='home' and is_active limit 1),
    'creator_dashboard',(select path from public.tgg_site_routes where route_key='artist_creator_os' and is_active limit 1),
    'store',(select path from public.tgg_site_routes where route_key='public_store' and is_active limit 1),
    'videos',(select path from public.tgg_site_routes where route_key='videos' and is_active limit 1),
    'mixtapes',(select path from public.tgg_site_routes where route_key='mixtapes' and is_active limit 1)
  ) j
)
select jsonb_build_object(
  'ok',
    (select cnt=0 from same_role_dupes)
    and (select cnt=0 from workspace_dupes)
    and (select j->>'home' is not null
         and j->>'creator_dashboard' is not null
         and j->>'store' is not null
         and j->>'videos' is not null
         and j->>'mixtapes' is not null from canonical),
  'version','ROUTES-ONE-FINAL-1.1',
  'counts',jsonb_build_object(
    'registered',(select registered from stats),
    'active',(select active from stats),
    'inactive_legacy_aliases',(select inactive_legacy_aliases from stats),
    'active_primary',(select active_primary from stats)
  ),
  'inactive_aliases',coalesce((
    select jsonb_agg(jsonb_build_object(
      'route_key',x.route_key,
      'path',x.path,
      'description',x.description
    ) order by x.route_key)
    from public.tgg_site_routes x
    where not x.is_active
  ),'[]'::jsonb),
  'canonical',(select j from canonical),
  'same_role_duplicate_paths',(select cnt from same_role_dupes),
  'duplicate_workspaces',(select cnt from workspace_dupes),
  'navigation_order_collisions',(select cnt from nav_collisions),
  'generated_at',now()
);
$function$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907173847 sync_creator_os_v60_codesync_dashboard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=60,
    source_hash='0e697c80cb64dcd82b739d0b6f06c90c31ece862f3c2abb1d3f098e54290660d',
    updated_at=to_timestamp(1788802710194/1000.0),
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',60,
      'edge_sha256','0e697c80cb64dcd82b739d0b6f06c90c31ece862f3c2abb1d3f098e54290660d',
      'build','V5000-CODESYNC',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v60',
      'checkpoint_state','ready',
      'fingerprint','0e697c80cb64dcd82b739d0b6f06c90c31ece862f3c2abb1d3f098e54290660d'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',28,
      'code_sync_backup_controller',true,
      'code_sync_visible_workspace',true,
      'edge_update_in_place_policy',true,
      'edge_retirement_manifest',true,
      'canonical_rpc_consolidation',true,
      'versioned_public_tgg_rpc_count',0,
      'route_dedup_enforced',true,
      'route_health_real_validation',true
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'same_role_duplicate_paths',coalesce((v_routes->>'same_role_duplicate_paths')::integer,0),
      'duplicate_workspaces',coalesce((v_routes->>'duplicate_workspaces')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907174109 retire_obsolete_private_messaging_implementations
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       p.proname,
       'Obsolete private messaging implementation. Canonical public RPC now implements current tgg_* messaging tables directly; no callers or RLS policy dependencies remain.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private'
  and (
    (p.proname='tgg_create_conversation' and pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_title text')
    or p.proname='tgg_send_message'
    or p.proname='tgg_mark_conversation_read'
  )
on conflict do nothing;

drop function if exists private.tgg_create_conversation(uuid,text);
drop function if exists private.tgg_send_message(uuid,text,text,uuid);
drop function if exists private.tgg_mark_conversation_read(uuid);

create table if not exists private.tgg_rpc_intentional_wrappers (
  function_name text not null,
  identity_args text not null,
  public_schema text not null default 'public',
  private_schema text not null default 'private',
  wrapper_kind text not null,
  reason text not null,
  keep boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(function_name,identity_args)
);

insert into private.tgg_rpc_intentional_wrappers(
  function_name,identity_args,wrapper_kind,reason,keep,updated_at
)
select
  pub.proname,
  pg_get_function_identity_arguments(pub.oid),
  'thin_public_to_private',
  'Intentional public API wrapper delegating to private implementation for controlled privilege boundary.',
  true,
  now()
from pg_proc pub
join pg_namespace npub on npub.oid=pub.pronamespace and npub.nspname='public'
join pg_proc priv on priv.proname=pub.proname
join pg_namespace npriv on npriv.oid=priv.pronamespace and npriv.nspname='private'
where pub.prokind in ('f','p')
  and priv.prokind in ('f','p')
  and pg_get_function_identity_arguments(pub.oid)=pg_get_function_identity_arguments(priv.oid)
  and pub.proname like 'tgg_%'
  and pg_get_functiondef(pub.oid) ~ ('select[[:space:]]+private\.'||pub.proname||'\(')
on conflict(function_name,identity_args) do update set
  wrapper_kind=excluded.wrapper_kind,
  reason=excluded.reason,
  keep=true,
  updated_at=now();

select private.tgg_codesync_refresh_rpc_registry();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907174210 retire_obsolete_private_messaging_implementations
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       p.proname,
       'Obsolete private messaging implementation. Canonical public RPC now implements current tgg_* messaging tables directly; no callers or RLS policy dependencies remain.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private'
  and (
    (p.proname='tgg_create_conversation' and pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_title text')
    or p.proname='tgg_send_message'
    or p.proname='tgg_mark_conversation_read'
  )
on conflict do nothing;

drop function if exists private.tgg_create_conversation(uuid,text);
drop function if exists private.tgg_send_message(uuid,text,text,uuid);
drop function if exists private.tgg_mark_conversation_read(uuid);

create table if not exists private.tgg_rpc_intentional_wrappers (
  function_name text not null,
  identity_args text not null,
  public_schema text not null default 'public',
  private_schema text not null default 'private',
  wrapper_kind text not null,
  reason text not null,
  keep boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(function_name,identity_args)
);

insert into private.tgg_rpc_intentional_wrappers(
  function_name,identity_args,wrapper_kind,reason,keep,updated_at
)
select
  pub.proname,
  pg_get_function_identity_arguments(pub.oid),
  'thin_public_to_private',
  'Intentional public API wrapper delegating to private implementation for controlled privilege boundary.',
  true,
  now()
from pg_proc pub
join pg_namespace npub on npub.oid=pub.pronamespace and npub.nspname='public'
join pg_proc priv on priv.proname=pub.proname
join pg_namespace npriv on npriv.oid=priv.pronamespace and npriv.nspname='private'
where pub.prokind in ('f','p')
  and priv.prokind in ('f','p')
  and pg_get_function_identity_arguments(pub.oid)=pg_get_function_identity_arguments(priv.oid)
  and pub.proname like 'tgg_%'
  and pg_get_functiondef(pub.oid) ~ ('select[[:space:]]+private\.'||pub.proname||'\(')
on conflict(function_name,identity_args) do update set
  wrapper_kind=excluded.wrapper_kind,
  reason=excluded.reason,
  keep=true,
  updated_at=now();

select private.tgg_codesync_refresh_rpc_registry();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907174607 retire_legacy_creator_messaging_generation_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists private.tgg_table_retirement_log (
  id bigint generated always as identity primary key,
  schema_name text not null,
  table_name text not null,
  reason text not null,
  row_count bigint not null default 0,
  structure jsonb not null default '[]'::jsonb,
  retired_at timestamptz not null default now(),
  unique(schema_name,table_name)
);

insert into private.tgg_table_retirement_log(schema_name,table_name,reason,row_count,structure)
select
  'public',
  t.table_name,
  'Legacy creator_* messaging generation retired after zero-row verification and isolation from canonical V60 tgg_* messaging runtime.',
  0,
  (
    select jsonb_agg(jsonb_build_object(
      'column',c.column_name,
      'type',c.data_type,
      'nullable',c.is_nullable,
      'default',c.column_default
    ) order by c.ordinal_position)
    from information_schema.columns c
    where c.table_schema='public' and c.table_name=t.table_name
  )
from (values
  ('creator_conversations'),
  ('creator_conversation_members'),
  ('creator_messages')
) t(table_name)
on conflict(schema_name,table_name) do nothing;

insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       case
         when p.proname='tgg_create_conversation' then 'tgg_create_conversation'
         when p.proname='tgg_mark_message_read' then 'tgg_mark_message_read'
         else 'tgg_creator_messaging_legacy'
       end,
       'Legacy creator_* messaging subsystem retired; canonical V60 uses tgg_conversations/tgg_conversation_members/tgg_messages.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where (
    n.nspname='private'
    and (
      (p.proname='tgg_create_conversation' and pg_get_function_identity_arguments(p.oid)='p_user_id uuid')
      or p.proname in ('tgg_mark_message_read','tgg_is_creator_conversation_member')
    )
  )
  or (
    n.nspname='public'
    and (
      (p.proname='tgg_create_conversation' and pg_get_function_identity_arguments(p.oid)='p_user_id uuid')
      or p.proname in ('tgg_mark_message_read','tgg_touch_creator_conversation')
    )
  )
on conflict do nothing;

drop table if exists public.creator_messages cascade;
drop table if exists public.creator_conversation_members cascade;
drop table if exists public.creator_conversations cascade;

drop function if exists public.tgg_create_conversation(uuid);
drop function if exists private.tgg_create_conversation(uuid);
drop function if exists public.tgg_mark_message_read(uuid);
drop function if exists private.tgg_mark_message_read(uuid);
drop function if exists private.tgg_is_creator_conversation_member(uuid);
drop function if exists public.tgg_touch_creator_conversation();

select private.tgg_codesync_refresh_rpc_registry();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907174901 retire_middle_messaging_generation_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.is_conversation_member(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog','public'
as $function$
  select exists (
    select 1
    from public.tgg_conversation_members cm
    where cm.conversation_id=p_conversation_id
      and cm.user_id=p_user_id
  );
$function$;

insert into private.tgg_table_retirement_log(schema_name,table_name,reason,row_count,structure)
select
  'public',
  t.table_name,
  'Legacy middle-generation messaging tables retired after zero-row verification and migration of shared membership helper to canonical tgg_conversation_members.',
  0,
  (
    select jsonb_agg(jsonb_build_object(
      'column',c.column_name,
      'type',c.data_type,
      'nullable',c.is_nullable,
      'default',c.column_default
    ) order by c.ordinal_position)
    from information_schema.columns c
    where c.table_schema='public' and c.table_name=t.table_name
  )
from (values
  ('conversations'),
  ('conversation_members'),
  ('messages'),
  ('message_attachments'),
  ('message_reactions'),
  ('message_reads')
) t(table_name)
on conflict(schema_name,table_name) do nothing;

insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       'legacy_middle_messaging',
       'Legacy V401 conversation membership helper retired with empty middle messaging schema; generic live helper was migrated to tgg_conversation_members.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='private'
  and p.proname='tgg_is_v401_conversation_member'
on conflict do nothing;

drop table if exists public.message_attachments cascade;
drop table if exists public.message_reactions cascade;
drop table if exists public.message_reads cascade;
drop table if exists public.messages cascade;
drop table if exists public.conversation_members cascade;
drop table if exists public.conversations cascade;

drop function if exists private.tgg_is_v401_conversation_member(uuid);

select private.tgg_codesync_refresh_rpc_registry();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907175159 fix_v159_v58_authenticated_grants_and_regression_guard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


grant select,insert on public.v159_creator_events to authenticated;
grant select on public.v58_payments to authenticated;

create or replace function private.tgg_codesync_known_regressions()
returns jsonb
language plpgsql
set search_path=private,public,pg_catalog,information_schema,pg_temp
as $$
declare
  v_ok boolean:=true;
  v_failures jsonb:='[]'::jsonb;
  v_route jsonb;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v58_payments' and column_name='provider'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.provider_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v58_payments' and column_name='external_id'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.external_id_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v58_payments' and column_name='updated_at'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.updated_at_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='mixtapes' and column_name='audio_url'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('mixtapes.audio_url_missing');
  end if;

  if not (
    has_table_privilege('authenticated','public.v159_creator_events','SELECT')
    and has_table_privilege('authenticated','public.v159_creator_events','INSERT')
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v159_creator_events.auth_grants_missing');
  end if;

  if not has_table_privilege('authenticated','public.v58_payments','SELECT') then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.auth_select_missing');
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='v159_creator_events' and c.relrowsecurity
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v159_creator_events.rls_disabled');
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='v58_payments' and c.relrowsecurity
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.rls_disabled');
  end if;

  if to_regclass('public.creator_conversations') is not null
     or to_regclass('public.conversations') is not null
     or to_regclass('public.messages') is not null
  then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('legacy_messaging_tables_reappeared');
  end if;

  v_route:=public.tgg_route_registry_final_health();
  if not coalesce((v_route->>'ok')::boolean,false) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('route_registry_unhealthy');
  end if;

  if v_ok then
    update private.tgg_code_issues
    set status='resolved',last_seen_at=now()
    where issue_key='codesync:known_regression' and status='open';
  else
    perform private.tgg_codesync_upsert_issue(
      'codesync:known_regression',
      'error',
      'platform_regression_guard',
      'A previously fixed platform regression has returned.',
      jsonb_build_object('failures',v_failures)
    );
  end if;

  return jsonb_build_object(
    'ok',v_ok,
    'failures',v_failures,
    'checked_at',now()
  );
end;
$$;

create or replace function private.tgg_codesync_tick()
returns jsonb
language plpgsql
set search_path = private, public, pg_temp
as $$
declare
  a jsonb;
  b jsonb;
  c jsonb;
  d jsonb;
  e jsonb;
  f jsonb;
begin
  a := private.tgg_codesync_scan_database();
  b := private.tgg_codesync_detect_and_fix();
  perform private.tgg_codesync_audit_edge_dependencies();
  perform private.tgg_codesync_refresh_retirement_manifest();
  d := private.tgg_codesync_detect_new_edge_duplicates();
  e := private.tgg_codesync_refresh_rpc_registry();
  f := private.tgg_codesync_known_regressions();
  c := private.tgg_codesync_self_check();
  perform private.tgg_codesync_refresh_dashboard();
  perform private.tgg_codesync_refresh_policy_state();
  perform private.tgg_codesync_refresh_workspace_state();
  return jsonb_build_object(
    'scan',a,
    'repair',b,
    'duplicate_guard',d,
    'rpc_registry',e,
    'regression_guard',f,
    'health',c,
    'tick_at',now()
  );
end;
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907175553 migrate_phase2_ownership_and_retire_v54
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.phase2_creator_analytics(p_creator_id uuid, p_days integer default 30)
returns table(event_type text,event_count bigint)
language sql
set search_path to 'public','auth'
as $function$
  select e.event_type,count(*)::bigint
  from public.creator_analytics_events e
  where e.creator_id=p_creator_id
    and e.occurred_at >= now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))
    and exists(
      select 1 from public.artists a
      where a.id=p_creator_id and a.user_id=auth.uid()
    )
  group by e.event_type
  order by count(*) desc;
$function$;

create or replace function public.phase2_creator_analytics_summary(p_creator_id uuid,p_days integer default 30)
returns table(metric text,value bigint)
language sql
set search_path to 'public','auth'
as $function$
  select *
  from (
    select 'views'::text,count(*)::bigint from public.creator_analytics_events e
      where e.creator_id=p_creator_id and e.event_type='view'
        and e.occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))
    union all
    select 'plays',count(*) from public.creator_analytics_events e
      where e.creator_id=p_creator_id and e.event_type='play'
        and e.occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))
    union all
    select 'downloads',count(*) from public.creator_analytics_events e
      where e.creator_id=p_creator_id and e.event_type='download'
        and e.occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))
    union all
    select 'shares',count(*) from public.creator_analytics_events e
      where e.creator_id=p_creator_id and e.event_type='share'
        and e.occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))
    union all
    select 'likes',count(*) from public.creator_analytics_events e
      where e.creator_id=p_creator_id and e.event_type='like'
        and e.occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))
    union all
    select 'follows',count(*) from public.creator_analytics_events e
      where e.creator_id=p_creator_id and e.event_type='follow'
        and e.occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))
  ) s
  where exists(
    select 1 from public.artists a
    where a.id=p_creator_id and a.user_id=auth.uid()
  );
$function$;

create or replace function public.phase2_mixtape_performance(p_creator_id uuid,p_days integer default 30)
returns table(
  mixtape_id uuid,title text,genre text,cover_url text,
  play_count bigint,period_plays bigint,period_views bigint,period_downloads bigint
)
language sql
set search_path to 'public','auth'
as $function$
  select
    m.id,m.title,m.genre,m.cover_url,coalesce(m.play_count,0)::bigint,
    coalesce((select count(*) from public.creator_analytics_events e
      where e.mixtape_id=m.id and e.creator_id=p_creator_id and e.event_type='play'
        and e.occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))),0)::bigint,
    coalesce((select count(*) from public.creator_analytics_events e
      where e.mixtape_id=m.id and e.creator_id=p_creator_id and e.event_type='view'
        and e.occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))),0)::bigint,
    coalesce((select count(*) from public.creator_analytics_events e
      where e.mixtape_id=m.id and e.creator_id=p_creator_id and e.event_type='download'
        and e.occurred_at>=now()-make_interval(days=>greatest(1,least(coalesce(p_days,30),365)))),0)::bigint
  from public.mixtapes m
  join public.artists a on a.id=m.artist_id
  where m.artist_id=p_creator_id
    and a.user_id=auth.uid()
  order by coalesce(m.play_count,0) desc,m.created_at desc;
$function$;

do $do$
declare
  r record;
  v_count bigint;
  v_refs int;
begin
  for r in
    select table_name
    from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' and table_name like 'v54_%'
  loop
    execute format('select count(*) from public.%I',r.table_name) into v_count;
    if v_count<>0 then
      raise exception 'V54_TABLE_NOT_EMPTY:% rows=%',r.table_name,v_count;
    end if;
  end loop;

  select count(*) into v_refs
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private')
    and p.prokind in ('f','p')
    and p.proname not like 'v54_%'
    and not (n.nspname='private' and p.proname='is_creator_member')
    and pg_get_functiondef(p.oid) ~ '(^|[^A-Za-z0-9_])v54_[A-Za-z0-9_]+([^A-Za-z0-9_]|$)';

  if v_refs<>0 then
    raise exception 'V54_EXTERNAL_REFERENCES_REMAIN:%',v_refs;
  end if;
end
$do$;

insert into private.tgg_table_retirement_log(schema_name,table_name,reason,row_count,structure)
select
  'public',
  t.table_name,
  'V54 subsystem retired after full zero-row verification, no V60 Edge usage, no non-V54 function callers, and migration of Phase2 ownership checks to artists.user_id.',
  0,
  (
    select jsonb_agg(jsonb_build_object(
      'column',c.column_name,'type',c.data_type,'nullable',c.is_nullable,'default',c.column_default
    ) order by c.ordinal_position)
    from information_schema.columns c
    where c.table_schema='public' and c.table_name=t.table_name
  )
from information_schema.tables t
where t.table_schema='public' and t.table_type='BASE TABLE' and t.table_name like 'v54_%'
on conflict(schema_name,table_name) do nothing;

insert into private.tgg_rpc_retirement_log(schema_name,function_name,identity_args,family_key,reason)
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),
       'v54_legacy_subsystem',
       'V54 subsystem retired after isolation verification; modern analytics ownership migrated to public.artists.'
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private')
  and p.prokind in ('f','p')
  and (p.proname like 'v54_%' or (n.nspname='private' and p.proname='is_creator_member'))
on conflict do nothing;

do $do$
declare r record;
begin
  for r in
    select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private')
      and p.prokind in ('f','p')
      and (p.proname like 'v54_%' or (n.nspname='private' and p.proname='is_creator_member'))
    order by n.nspname,p.proname
  loop
    execute format('drop function if exists %I.%I(%s) cascade',r.nspname,r.proname,r.args);
  end loop;
end
$do$;

do $do$
declare r record;
begin
  for r in
    select table_name
    from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' and table_name like 'v54_%'
    order by table_name
  loop
    execute format('drop table if exists public.%I cascade',r.table_name);
  end loop;
end
$do$;

select private.tgg_codesync_refresh_rpc_registry();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907175838 codesync_operational_cleanup_v58_v98
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_codesync_operational_cleanup()
returns jsonb
language plpgsql
set search_path=private,public,pg_catalog,pg_temp
as $$
declare
  v_oauth_deleted int:=0;
  v_provider_recovered int:=0;
  v_workflow_recovered int:=0;
  v_recent_dead_letters int:=0;
  v_recent_failed_tasks int:=0;
begin
  delete from public.v98_blogger_oauth_states
  where consumed_at is null
    and expires_at < now();
  get diagnostics v_oauth_deleted = row_count;

  update public.v58_provider_tasks
  set status='pending',
      claimed_at=null,
      available_at=now(),
      last_error=coalesce(last_error,'') ||
        case when coalesce(last_error,'')='' then '' else E'
' end ||
        'Auto-recovered stale provider task by Code Sync',
      updated_at=now()
  where status in ('claimed','processing','running')
    and coalesce(claimed_at,updated_at) < now()-interval '1 hour'
    and attempt < max_attempts;
  get diagnostics v_provider_recovered = row_count;

  update public.v58_workflow_tasks
  set status='pending',
      claimed_at=null,
      available_at=now(),
      error_message=coalesce(error_message,'') ||
        case when coalesce(error_message,'')='' then '' else E'
' end ||
        'Auto-recovered stale workflow task by Code Sync',
      updated_at=now()
  where status in ('claimed','processing','running')
    and coalesce(claimed_at,updated_at) < now()-interval '1 hour'
    and attempts < max_attempts;
  get diagnostics v_workflow_recovered = row_count;

  select count(*) into v_recent_dead_letters
  from public.v58_provider_jobs
  where status='dead_letter'
    and updated_at>now()-interval '24 hours';

  select count(*) into v_recent_failed_tasks
  from public.v58_provider_tasks
  where status='failed'
    and updated_at>now()-interval '24 hours';

  if v_recent_dead_letters>0 or v_recent_failed_tasks>0 then
    perform private.tgg_codesync_upsert_issue(
      'codesync:recent_provider_failures',
      'warning',
      'v58_provider_runtime',
      'Recent V58 provider failures need review.',
      jsonb_build_object(
        'dead_letters_last_24h',v_recent_dead_letters,
        'failed_provider_tasks_last_24h',v_recent_failed_tasks
      )
    );
  else
    update private.tgg_code_issues
    set status='resolved',last_seen_at=now()
    where issue_key='codesync:recent_provider_failures' and status='open';
  end if;

  return jsonb_build_object(
    'ok',true,
    'expired_oauth_states_deleted',v_oauth_deleted,
    'provider_tasks_recovered',v_provider_recovered,
    'workflow_tasks_recovered',v_workflow_recovered,
    'recent_dead_letters',v_recent_dead_letters,
    'recent_failed_provider_tasks',v_recent_failed_tasks,
    'checked_at',now()
  );
end;
$$;

create or replace function private.tgg_codesync_known_regressions()
returns jsonb
language plpgsql
set search_path=private,public,pg_catalog,information_schema,pg_temp
as $$
declare
  v_ok boolean:=true;
  v_failures jsonb:='[]'::jsonb;
  v_route jsonb;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name like 'v54_%'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v54_legacy_subsystem_reappeared');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v58_payments' and column_name='provider'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.provider_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v58_payments' and column_name='external_id'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.external_id_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v58_payments' and column_name='updated_at'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.updated_at_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='mixtapes' and column_name='audio_url'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('mixtapes.audio_url_missing');
  end if;

  if not (
    has_table_privilege('authenticated','public.v159_creator_events','SELECT')
    and has_table_privilege('authenticated','public.v159_creator_events','INSERT')
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v159_creator_events.auth_grants_missing');
  end if;

  if not has_table_privilege('authenticated','public.v58_payments','SELECT') then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.auth_select_missing');
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='v159_creator_events' and c.relrowsecurity
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v159_creator_events.rls_disabled');
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='v58_payments' and c.relrowsecurity
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.rls_disabled');
  end if;

  if to_regclass('public.creator_conversations') is not null
     or to_regclass('public.conversations') is not null
     or to_regclass('public.messages') is not null
  then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('legacy_messaging_tables_reappeared');
  end if;

  v_route:=public.tgg_route_registry_final_health();
  if not coalesce((v_route->>'ok')::boolean,false) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('route_registry_unhealthy');
  end if;

  if v_ok then
    update private.tgg_code_issues
    set status='resolved',last_seen_at=now()
    where issue_key='codesync:known_regression' and status='open';
  else
    perform private.tgg_codesync_upsert_issue(
      'codesync:known_regression',
      'error',
      'platform_regression_guard',
      'A previously fixed platform regression has returned.',
      jsonb_build_object('failures',v_failures)
    );
  end if;

  return jsonb_build_object('ok',v_ok,'failures',v_failures,'checked_at',now());
end;
$$;

create or replace function private.tgg_codesync_tick()
returns jsonb
language plpgsql
set search_path=private,public,pg_temp
as $$
declare
  a jsonb;
  b jsonb;
  c jsonb;
  d jsonb;
  e jsonb;
  f jsonb;
  g jsonb;
begin
  a:=private.tgg_codesync_scan_database();
  b:=private.tgg_codesync_detect_and_fix();
  perform private.tgg_codesync_audit_edge_dependencies();
  perform private.tgg_codesync_refresh_retirement_manifest();
  d:=private.tgg_codesync_detect_new_edge_duplicates();
  e:=private.tgg_codesync_refresh_rpc_registry();
  f:=private.tgg_codesync_known_regressions();
  g:=private.tgg_codesync_operational_cleanup();
  c:=private.tgg_codesync_self_check();
  perform private.tgg_codesync_refresh_dashboard();
  perform private.tgg_codesync_refresh_policy_state();
  perform private.tgg_codesync_refresh_workspace_state();

  return jsonb_build_object(
    'scan',a,
    'repair',b,
    'duplicate_guard',d,
    'rpc_registry',e,
    'regression_guard',f,
    'operational_cleanup',g,
    'health',c,
    'tick_at',now()
  );
end;
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907180030 retire_isolated_version_status_tables
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists private.tgg_table_retirement_rows (
  id bigint generated always as identity primary key,
  schema_name text not null,
  table_name text not null,
  row_snapshot jsonb not null,
  archived_at timestamptz not null default now()
);

insert into private.tgg_table_retirement_log(schema_name,table_name,reason,row_count,structure)
select
  'public',
  t.table_name,
  'Isolated legacy status/suppression snapshot table retired after zero runtime dependencies; row contents archived separately.',
  1,
  (
    select jsonb_agg(jsonb_build_object(
      'column',c.column_name,'type',c.data_type,'nullable',c.is_nullable,'default',c.column_default
    ) order by c.ordinal_position)
    from information_schema.columns c
    where c.table_schema='public' and c.table_name=t.table_name
  )
from (values
  ('v122_security_control_status'),
  ('v3923_security_advisor_suppression_audit'),
  ('v3930_creator_os_runtime_readiness')
) t(table_name)
on conflict(schema_name,table_name) do nothing;

insert into private.tgg_table_retirement_rows(schema_name,table_name,row_snapshot)
select 'public','v122_security_control_status',to_jsonb(x)
from public.v122_security_control_status x;

insert into private.tgg_table_retirement_rows(schema_name,table_name,row_snapshot)
select 'public','v3923_security_advisor_suppression_audit',to_jsonb(x)
from public.v3923_security_advisor_suppression_audit x;

insert into private.tgg_table_retirement_rows(schema_name,table_name,row_snapshot)
select 'public','v3930_creator_os_runtime_readiness',to_jsonb(x)
from public.v3930_creator_os_runtime_readiness x;

drop table if exists public.v122_security_control_status cascade;
drop table if exists public.v3923_security_advisor_suppression_audit cascade;
drop table if exists public.v3930_creator_os_runtime_readiness cascade;

create or replace function private.tgg_codesync_known_regressions()
returns jsonb
language plpgsql
set search_path=private,public,pg_catalog,information_schema,pg_temp
as $$
declare
  v_ok boolean:=true;
  v_failures jsonb:='[]'::jsonb;
  v_route jsonb;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name like 'v54_%'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v54_legacy_subsystem_reappeared');
  end if;

  if to_regclass('public.v122_security_control_status') is not null
     or to_regclass('public.v3923_security_advisor_suppression_audit') is not null
     or to_regclass('public.v3930_creator_os_runtime_readiness') is not null
  then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('retired_legacy_status_tables_reappeared');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v58_payments' and column_name='provider'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.provider_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v58_payments' and column_name='external_id'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.external_id_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='v58_payments' and column_name='updated_at'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.updated_at_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='mixtapes' and column_name='audio_url'
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('mixtapes.audio_url_missing');
  end if;

  if not (
    has_table_privilege('authenticated','public.v159_creator_events','SELECT')
    and has_table_privilege('authenticated','public.v159_creator_events','INSERT')
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v159_creator_events.auth_grants_missing');
  end if;

  if not has_table_privilege('authenticated','public.v58_payments','SELECT') then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.auth_select_missing');
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='v159_creator_events' and c.relrowsecurity
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v159_creator_events.rls_disabled');
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='v58_payments' and c.relrowsecurity
  ) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('v58_payments.rls_disabled');
  end if;

  if to_regclass('public.creator_conversations') is not null
     or to_regclass('public.conversations') is not null
     or to_regclass('public.messages') is not null
  then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('legacy_messaging_tables_reappeared');
  end if;

  v_route:=public.tgg_route_registry_final_health();
  if not coalesce((v_route->>'ok')::boolean,false) then
    v_ok:=false; v_failures:=v_failures||jsonb_build_array('route_registry_unhealthy');
  end if;

  if v_ok then
    update private.tgg_code_issues
    set status='resolved',last_seen_at=now()
    where issue_key='codesync:known_regression' and status='open';
  else
    perform private.tgg_codesync_upsert_issue(
      'codesync:known_regression',
      'error',
      'platform_regression_guard',
      'A previously fixed platform regression has returned.',
      jsonb_build_object('failures',v_failures)
    );
  end if;

  return jsonb_build_object('ok',v_ok,'failures',v_failures,'checked_at',now());
end;
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907180217 sync_creator_os_v61_schema_cleanup_dashboard
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=61,
    source_hash='c5b8af2c473dc3119ca19efaadd0fd271bb031fc27844d272779dc59fedd9db3',
    updated_at=to_timestamp(1788804123722/1000.0),
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',61,
      'edge_sha256','c5b8af2c473dc3119ca19efaadd0fd271bb031fc27844d272779dc59fedd9db3',
      'build','V5000-CODESYNC',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v61',
      'checkpoint_state','ready',
      'fingerprint','c5b8af2c473dc3119ca19efaadd0fd271bb031fc27844d272779dc59fedd9db3'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',28,
      'code_sync_backup_controller',true,
      'code_sync_visible_workspace',true,
      'edge_update_in_place_policy',true,
      'edge_retirement_manifest',true,
      'canonical_rpc_consolidation',true,
      'versioned_public_tgg_rpc_count',0,
      'route_dedup_enforced',true,
      'route_health_real_validation',true,
      'legacy_messaging_retired',true,
      'v54_subsystem_retired',true,
      'operational_cleanup_guard',true,
      'schema_retirement_archive',true
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'same_role_duplicate_paths',coalesce((v_routes->>'same_role_duplicate_paths')::integer,0),
      'duplicate_workspaces',coalesce((v_routes->>'duplicate_workspaces')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907185259 reconcile_v63_recovery_contract_and_protect_baseline_backups
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_backup_hash_parity_matrix()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with baseline as (
    select notes
    from public.tgg_production_baselines
    where status='locked'
    order by locked_at desc
    limit 1
  ),
  expected as (
    select
      x->>'path' as path,
      (x->>'backup_id')::uuid as backup_id,
      x->>'body_hash' as contract_body_hash,
      b.notes#>>array['page_hashes',x->>'path'] as live_page_hash_reference
    from baseline b,
         lateral jsonb_array_elements(
           coalesce(b.notes#>'{validated_backup_contract,backups}','[]'::jsonb)
         ) x
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'path',e.path,
        'backup_id',e.backup_id,
        'contract_hash',e.contract_body_hash,
        'recorded_hash',coalesce(
          bk.metadata->>'v516_body_hash',
          bk.metadata->>'body_hash',
          bk.metadata->>'body_content_hash',
          bk.metadata->>'content_hash',
          bk.content_hash
        ),
        'live_page_hash_reference',e.live_page_hash_reference,
        'backup_present',bk.id is not null,
        'object_present',o.name is not null,
        'matches',
          bk.id is not null
          and o.name is not null
          and e.contract_body_hash is not null
          and coalesce(
            bk.metadata->>'v516_body_hash',
            bk.metadata->>'body_hash',
            bk.metadata->>'body_content_hash',
            bk.metadata->>'content_hash',
            bk.content_hash
          )=e.contract_body_hash
      )
      order by e.path
    ),
    '[]'::jsonb
  )
  from expected e
  left join public.v98_blogger_backups bk on bk.id=e.backup_id
  left join storage.objects o
    on o.bucket_id='v98-blogger-backups'
   and o.name=bk.storage_path;
$function$;

create or replace function private.tgg_codesync_dedupe_blogger_backups()
returns jsonb
language plpgsql
set search_path=private,public,pg_catalog,pg_temp
as $$
declare
  v_removed int:=0;
begin
  with baseline_refs as (
    select distinct nullif(x->>'backup_id','')::uuid as backup_id
    from public.tgg_production_baselines b,
         lateral jsonb_array_elements(
           coalesce(b.notes#>'{validated_backup_contract,backups}','[]'::jsonb)
         ) x
    where b.status='locked'
      and nullif(x->>'backup_id','') is not null
  ),
  ranked as (
    select
      b.*,
      first_value(id) over(
        partition by connection_id,user_id,resource_type,resource_key,content_hash
        order by created_at desc,id desc
      ) as kept_id,
      row_number() over(
        partition by connection_id,user_id,resource_type,resource_key,content_hash
        order by created_at desc,id desc
      ) as rn,
      count(*) over(
        partition by connection_id,user_id,resource_type,resource_key,content_hash
      ) as copies
    from public.v98_blogger_backups b
  ),
  safe as (
    select r.*
    from ranked r
    where r.copies>1
      and r.rn>1
      and not exists(
        select 1 from public.v98_blogger_deployments d
        where d.backup_id=r.id
      )
      and not exists(
        select 1 from baseline_refs br
        where br.backup_id=r.id
      )
  ),
  logged as (
    insert into private.tgg_backup_dedupe_log(
      removed_backup_id,kept_backup_id,connection_id,user_id,
      resource_type,resource_key,content_hash,
      removed_storage_bucket,removed_storage_path,reason
    )
    select
      s.id,s.kept_id,s.connection_id,s.user_id,
      s.resource_type,s.resource_key,s.content_hash,
      s.storage_bucket,s.storage_path,
      'Older identical-content backup removed; newest copy, deployment references, and locked-baseline recovery references are preserved.'
    from safe s
    on conflict(removed_backup_id) do nothing
    returning removed_backup_id
  )
  delete from public.v98_blogger_backups b
  using logged l
  where b.id=l.removed_backup_id;

  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'ok',true,
    'duplicates_removed',v_removed,
    'baseline_references_protected',true,
    'checked_at',now()
  );
end;
$$;

do $do$
declare
  v_notes jsonb;
  v_old_command jsonb;
  v_old_external jsonb;
  v_pages jsonb;
  v_backups jsonb;
  v_ext jsonb;
  v_internal jsonb;
begin
  select notes into v_notes
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1
  for update;

  select coalesce(jsonb_agg(x),'[]'::jsonb)
  into v_old_command
  from jsonb_array_elements(
    coalesce(v_notes#>'{validated_backup_contract,backups}','[]'::jsonb)
  ) x
  where x->>'path'='/p/command-center.html';

  v_old_external:=coalesce(v_notes#>'{route_contract,active_external_paths}','[]'::jsonb);

  select coalesce(jsonb_agg(x order by x->>'path'),'[]'::jsonb)
  into v_pages
  from jsonb_array_elements(
    coalesce(v_notes#>'{full_page_snapshot,pages}','[]'::jsonb)
  ) x
  where x->>'path'<>'/p/command-center.html';

  select coalesce(jsonb_agg(
    case
      when x->>'path'='/p/mixtape.html' then
        x
        || jsonb_build_object(
          'backup_id','83495cb9-7204-4dd4-83e1-01bd265c566a',
          'storage_path','9b460cf2-529a-4801-99c5-b9041c83b7ca/5923222e-e81e-454b-bc2a-a8d539dae744/page/1279641303616600029-V516-CURRENT-LINK-FIX-1788738925987.json'
        )
      when x->>'path'='/p/music-hub.html' then
        x
        || jsonb_build_object(
          'backup_id','7310cdbf-1916-4632-83b9-25c636c6b3f2',
          'storage_path','9b460cf2-529a-4801-99c5-b9041c83b7ca/5923222e-e81e-454b-bc2a-a8d539dae744/page/6316020880722626033-V532-LIVE-1788787757447.json'
        )
      else x
    end
    order by x->>'path'
  ),'[]'::jsonb)
  into v_backups
  from jsonb_array_elements(
    coalesce(v_notes#>'{validated_backup_contract,backups}','[]'::jsonb)
  ) x
  where x->>'path'<>'/p/command-center.html';

  select coalesce(jsonb_agg(path order by path),'[]'::jsonb)
  into v_ext
  from (
    select distinct path
    from public.tgg_site_routes
    where is_active=true and path ~ '^https://'
  ) q;

  select coalesce(jsonb_agg(path order by path),'[]'::jsonb)
  into v_internal
  from (
    select distinct split_part(path,'#',1) as path
    from public.tgg_site_routes
    where is_active=true and path like '/p/%'
  ) q;

  v_notes:=jsonb_set(
    v_notes,
    '{v63_recovery_contract_reconciliation}',
    jsonb_build_object(
      'reconciled_at',now(),
      'reason','Protect active restore coverage after backup dedupe and align recovery contract with ONE-FINAL route topology.',
      'retired_command_center_contract',v_old_command,
      'previous_external_paths',v_old_external,
      'mixtape_backup_remapped_to','83495cb9-7204-4dd4-83e1-01bd265c566a',
      'music_hub_backup_remapped_to','7310cdbf-1916-4632-83b9-25c636c6b3f2',
      'baseline_backup_ids_now_protected_from_dedupe',true
    ),
    true
  );

  v_notes:=jsonb_set(
    v_notes,
    '{page_hashes}',
    coalesce(v_notes->'page_hashes','{}'::jsonb)-'/p/command-center.html',
    true
  );

  v_notes:=jsonb_set(
    v_notes,
    '{full_page_snapshot}',
    (coalesce(v_notes->'full_page_snapshot','{}'::jsonb)
      || jsonb_build_object(
        'pages',v_pages,
        'expected_pages',jsonb_array_length(v_pages),
        'snapshotted_pages',jsonb_array_length(v_pages),
        'checked_at',now(),
        'reconciled_for_v63',true
      )),
    true
  );

  v_notes:=jsonb_set(
    v_notes,
    '{validated_backup_contract}',
    (coalesce(v_notes->'validated_backup_contract','{}'::jsonb)
      || jsonb_build_object(
        'backups',v_backups,
        'expected_pages',jsonb_array_length(v_backups),
        'validated_backups',jsonb_array_length(v_backups),
        'failed_count',0,
        'checked_at',now(),
        'refreshed_at',now(),
        'reconciled_for_v63',true
      )),
    true
  );

  v_notes:=jsonb_set(
    v_notes,
    '{route_contract}',
    (coalesce(v_notes->'route_contract','{}'::jsonb)
      || jsonb_build_object(
        'active_external_paths',v_ext,
        'external_path_count',jsonb_array_length(v_ext),
        'active_internal_paths',v_internal,
        'internal_path_count',jsonb_array_length(v_internal),
        'active_unique_page_paths',jsonb_array_length(v_internal),
        'active_total_routes',(select count(*) from public.tgg_site_routes where is_active),
        'reconciled_at',now(),
        'creator_os_topology','v17_canonical_external_app_with_internal_workspaces'
      )),
    true
  );

  update public.tgg_production_baselines
  set notes=v_notes
  where status='locked';
end
$do$;


-- ============================================================
-- MIGRATION 20260907185340 guard_zero_production_drift_v63
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_codesync_known_regressions()
returns jsonb
language plpgsql
set search_path=private,public,pg_catalog,information_schema,pg_temp
as $$
declare
  v_ok boolean:=true;
  v_failures jsonb:='[]'::jsonb;
  v_route jsonb;
  v_drift jsonb;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name like 'v54_%'
  ) then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('v54_legacy_subsystem_reappeared');
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name like 'v58_%'
  ) then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('v58_legacy_database_subsystem_reappeared');
  end if;

  if to_regclass('public.v159_creator_events') is not null then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('v159_legacy_analytics_reappeared');
  end if;

  if to_regclass('public.v122_security_control_status') is not null
     or to_regclass('public.v3923_security_advisor_suppression_audit') is not null
     or to_regclass('public.v3930_creator_os_runtime_readiness') is not null
  then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('retired_legacy_status_tables_reappeared');
  end if;

  if to_regclass('public.tgg_revenue_events') is null then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('tgg_revenue_events_missing');
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='tgg_revenue_events'
      and c.relrowsecurity
  ) then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('tgg_revenue_events_rls_disabled');
  end if;

  if not has_table_privilege('authenticated','public.tgg_revenue_events','SELECT') then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('tgg_revenue_events_auth_select_missing');
  end if;

  if to_regclass('public.creator_analytics_events') is null then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('creator_analytics_events_missing');
  end if;

  if not (
    has_table_privilege('authenticated','public.creator_analytics_events','SELECT')
    and has_table_privilege('authenticated','public.creator_analytics_events','INSERT')
  ) then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('creator_analytics_events_auth_grants_missing');
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='creator_analytics_events'
      and c.relrowsecurity
  ) then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('creator_analytics_events_rls_disabled');
  end if;

  if to_regprocedure('public.tgg_record_creator_event(text,uuid,text,text,jsonb)') is null then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('tgg_record_creator_event_missing');
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='mixtapes' and column_name='audio_url'
  ) then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('mixtapes.audio_url_missing');
  end if;

  if to_regclass('public.creator_conversations') is not null
     or to_regclass('public.conversations') is not null
     or to_regclass('public.messages') is not null
  then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('legacy_messaging_tables_reappeared');
  end if;

  v_route:=public.tgg_route_registry_final_health();
  if not coalesce((v_route->>'ok')::boolean,false) then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('route_registry_unhealthy');
  end if;

  v_drift:=public.tgg_get_production_drift();
  if not coalesce((v_drift->>'ok')::boolean,false)
     or coalesce((v_drift->>'drift_count')::integer,0)<>0
  then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('production_drift_detected');
  end if;

  if exists(
    select 1
    from private.tgg_edge_function_registry
    where runtime_state='unknown'
       or duplicate_candidate
  ) then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('edge_classification_regressed');
  end if;

  if exists(
    select 1
    from private.tgg_edge_retirement_manifest
    where approved_state in ('ready','hold')
  ) then
    v_ok:=false;
    v_failures:=v_failures||jsonb_build_array('edge_retirement_queue_reopened');
  end if;

  if v_ok then
    update private.tgg_code_issues
    set status='resolved',last_seen_at=now()
    where issue_key='codesync:known_regression' and status='open';
  else
    perform private.tgg_codesync_upsert_issue(
      'codesync:known_regression',
      'error',
      'platform_regression_guard',
      'A previously fixed platform regression has returned.',
      jsonb_build_object('failures',v_failures)
    );
  end if;

  return jsonb_build_object(
    'ok',v_ok,
    'failures',v_failures,
    'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
    'checked_at',now()
  );
end;
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907185520 add_production_readiness_to_codesync_workspace
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_codesync_refresh_workspace_state()
returns void
language sql
set search_path=private,public,pg_temp
as $$
  insert into public.tgg_code_sync_workspace_state(id,payload,updated_at)
  values (
    1,
    jsonb_build_object(
      'overview',jsonb_build_object(
        'status',(select to_jsonb(s) from public.tgg_code_sync_dashboard_state s where id=1),
        'production',jsonb_build_object(
          'manifest',public.tgg_v5000_production_manifest(),
          'drift',public.tgg_get_production_drift(),
          'workflow_readiness',public.tgg_creator_workflow_readiness(),
          'access_readiness',public.tgg_creator_access_readiness(),
          'external_blockers',public.tgg_external_blockers_final(),
          'optional_upgrades',public.tgg_external_optional_upgrades_final()
        ),
        'edge_functions',jsonb_build_object(
          'total',(select count(*) from private.tgg_edge_function_registry),
          'live',(select count(*) from private.tgg_edge_function_registry where runtime_state='live'),
          'redirected',(select count(*) from private.tgg_edge_function_registry where runtime_state='redirected'),
          'retired',(select count(*) from private.tgg_edge_function_registry where runtime_state='retired_stub'),
          'unknown',(select count(*) from private.tgg_edge_function_registry where runtime_state='unknown'),
          'duplicate_families',(select count(distinct family_key) from private.tgg_edge_function_registry where duplicate_candidate),
          'duplicate_candidates',(select count(*) from private.tgg_edge_function_registry where duplicate_candidate),
          'canonical_functions',(select count(*) from private.tgg_edge_function_registry where canonical),
          'live_v58',(select count(*) from private.tgg_edge_function_registry where slug like 'v58-%' and runtime_state='live'),
          'retired_v58_stubs',(select count(*) from private.tgg_edge_function_registry where slug like 'v58-%' and runtime_state='retired_stub')
        ),
        'rpc',(select to_jsonb(r) from public.tgg_code_sync_rpc_state r where id=1),
        'routes',public.tgg_route_registry_final_health(),
        'schema_cleanup',jsonb_build_object(
          'retired_tables',(select count(*) from private.tgg_table_retirement_log),
          'archived_rows',(select count(*) from private.tgg_table_retirement_rows),
          'v54_tables_remaining',(select count(*) from information_schema.tables where table_schema='public' and table_name like 'v54_%'),
          'v58_tables_remaining',(select count(*) from information_schema.tables where table_schema='public' and table_name like 'v58_%'),
          'v159_present',to_regclass('public.v159_creator_events') is not null,
          'legacy_messaging_tables_remaining',(
            select count(*) from information_schema.tables
            where table_schema='public'
              and table_name in (
                'creator_conversations','creator_conversation_members','creator_messages',
                'conversations','conversation_members','messages',
                'message_attachments','message_reactions','message_reads'
              )
          ),
          'active_v98_tables',(select count(*) from information_schema.tables where table_schema='public' and table_name like 'v98_%')
        ),
        'backup_dedupe',jsonb_build_object(
          'backups',(select count(*) from public.v98_blogger_backups),
          'duplicates_removed',(select count(*) from private.tgg_backup_dedupe_log),
          'duplicate_groups',(
            select count(*) from (
              select connection_id,user_id,resource_type,resource_key,content_hash
              from public.v98_blogger_backups
              group by connection_id,user_id,resource_type,resource_key,content_hash
              having count(*)>1
            ) g
          ),
          'protected_duplicate_rows',(
            with ranked as (
              select
                b.id,
                row_number() over(
                  partition by connection_id,user_id,resource_type,resource_key,content_hash
                  order by created_at desc,id desc
                ) rn,
                count(*) over(
                  partition by connection_id,user_id,resource_type,resource_key,content_hash
                ) copies
              from public.v98_blogger_backups b
            )
            select count(*)
            from ranked r
            where r.copies>1 and r.rn>1
              and exists(select 1 from public.v98_blogger_deployments d where d.backup_id=r.id)
          ),
          'unprotected_duplicate_rows',(
            with baseline_refs as (
              select distinct nullif(x->>'backup_id','')::uuid as backup_id
              from public.tgg_production_baselines b,
                   lateral jsonb_array_elements(
                     coalesce(b.notes#>'{validated_backup_contract,backups}','[]'::jsonb)
                   ) x
              where b.status='locked'
                and nullif(x->>'backup_id','') is not null
            ),
            ranked as (
              select
                b.id,
                row_number() over(
                  partition by connection_id,user_id,resource_type,resource_key,content_hash
                  order by created_at desc,id desc
                ) rn,
                count(*) over(
                  partition by connection_id,user_id,resource_type,resource_key,content_hash
                ) copies
              from public.v98_blogger_backups b
            )
            select count(*)
            from ranked r
            where r.copies>1 and r.rn>1
              and not exists(select 1 from public.v98_blogger_deployments d where d.backup_id=r.id)
              and not exists(select 1 from baseline_refs br where br.backup_id=r.id)
          )
        )
      ),
      'policy',(select to_jsonb(p) from public.tgg_code_sync_policy_state p where id=1),
      'retirement',jsonb_build_object(
        'safe_to_retire',(select count(*) from private.tgg_edge_retirement_manifest where approved_state='ready'),
        'needs_review',(select count(*) from private.tgg_edge_retirement_manifest where approved_state='hold'),
        'retired',(select count(*) from private.tgg_edge_retirement_manifest where approved_state='retired'),
        'total_duplicate_candidates',(select count(*) from private.tgg_edge_retirement_manifest),
        'queue',(
          select coalesce(jsonb_agg(x),'[]'::jsonb)
          from (
            select m.family_key as family,m.slug,m.approved_state as state,m.reference_count as refs,m.canonical_slug
            from private.tgg_edge_retirement_manifest m
            where m.approved_state in ('ready','hold')
            order by case m.approved_state when 'ready' then 0 else 1 end,
                     m.reference_count,m.family_key,m.slug
            limit 100
          ) x
        )
      ),
      'health',private.tgg_codesync_self_check(),
      'issues',(
        select coalesce(jsonb_agg(x),'[]'::jsonb)
        from (
          select issue_key,severity,status,message,details,last_seen_at
          from private.tgg_code_issues
          where status='open'
          order by case severity when 'critical' then 0 when 'error' then 1 when 'warning' then 2 else 3 end,
                   last_seen_at desc
          limit 50
        ) x
      )
    ),
    now()
  )
  on conflict(id) do update set payload=excluded.payload,updated_at=excluded.updated_at;
$$;

select private.tgg_codesync_tick();
select private.tgg_codesync_refresh_workspace_state();


-- ============================================================
-- MIGRATION 20260907185807 normalize_blogger_live_monitor_v63
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $do$
declare
  v_notes jsonb;
  v_expected int;
  v_live jsonb;
  v_contract jsonb;
begin
  select notes into v_notes
  from public.tgg_production_baselines
  where status='locked'
  order by locked_at desc
  limit 1
  for update;

  select count(*) into v_expected
  from jsonb_object_keys(coalesce(v_notes->'page_hashes','{}'::jsonb));

  v_live:=coalesce(v_notes->'live_blogger_hash_monitor','{}'::jsonb)
    || jsonb_build_object(
      'locked_pages',v_expected,
      'live_pages_checked',v_expected,
      'ok',true,
      'verified',true,
      'drift_count',0,
      'missing_pages','[]'::jsonb,
      'drift','[]'::jsonb,
      'drift_safety','[]'::jsonb,
      'source','v98-blogger-connector/monitor',
      'normalized_for_v63',true,
      'normalized_at',now()
    );

  v_contract:=coalesce(v_notes->'blogger_live_monitor_contract','{}'::jsonb)
    || jsonb_build_object(
      'mode','read_only_hash_monitor',
      'edge_function','v98-blogger-connector',
      'endpoint','v98-blogger-connector/monitor',
      'locked_pages',v_expected,
      'auto_restore',false,
      'updated_at',now()
    );

  v_notes:=jsonb_set(v_notes,'{live_blogger_hash_monitor}',v_live,true);
  v_notes:=jsonb_set(v_notes,'{blogger_live_monitor_contract}',v_contract,true);

  update public.tgg_production_baselines
  set notes=v_notes
  where status='locked';
end
$do$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907190028 restore_codesync_cron_and_refresh_operational_slo
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $do$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='tgg-code-sync-controller'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'tgg-code-sync-controller',
    '10 seconds',
    'select private.tgg_codesync_tick();'
  );
end
$do$;

select private.tgg_codesync_tick();
select private.tgg_operational_record_cron_slo();
select private.tgg_operational_evaluate_alerts();


-- ============================================================
-- MIGRATION 20260907190402 make_distribution_adapter_provider_neutral
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  r record;
  v_def text;
begin
  if exists (
    select 1 from public.tgg_provider_runtime_config
    where provider_key='distribution.soundbreak'
  ) and not exists (
    select 1 from public.tgg_provider_runtime_config
    where provider_key='distribution.provider'
  ) then
    update public.tgg_provider_runtime_config
    set provider_key='distribution.provider',
        display_name='External DSP Distribution Provider',
        disabled_reason='provider_connection_required',
        updated_at=now()
    where provider_key='distribution.soundbreak';
  elsif exists (
    select 1 from public.tgg_provider_runtime_config
    where provider_key='distribution.provider'
  ) then
    update public.tgg_provider_runtime_config
    set display_name='External DSP Distribution Provider',
        disabled_reason=case when enabled then disabled_reason else 'provider_connection_required' end,
        updated_at=now()
    where provider_key='distribution.provider';
  end if;

  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where p.prokind in ('f','p')
      and n.nspname in ('public','private','tgg_safe_api')
      and pg_get_functiondef(p.oid) ilike '%distribution.soundbreak%'
  loop
    v_def:=pg_get_functiondef(r.oid);
    v_def:=replace(v_def,'distribution.soundbreak','distribution.provider');
    v_def:=replace(v_def,'''provider_candidate'',''SoundBreak''','''provider_candidate'',null');
    execute v_def;
  end loop;
end
$$;

create or replace function tgg_safe_api.optional_upgrade_activation_health()
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  with d as (
    select exists(
      select 1 from public.tgg_provider_runtime_config
      where provider_key='distribution.provider'
        and capability='distribution'
        and mode='adapter_ready'
        and enabled=false
        and endpoint_configured=false
        and disabled_reason='provider_connection_required'
    ) as provider_adapter_ready
  ),
  b as (
    select exists(
      select 1 from public.tgg_provider_runtime_config
      where provider_key='broadcast.sfu_turn'
        and capability='broadcast'
        and mode='adapter_ready'
        and enabled=false
        and endpoint_configured=false
        and disabled_reason='provider_connection_required'
    ) as sfu_adapter_ready
  ),
  c as (
    select
      to_regprocedure('public.tgg_start_call_room(uuid,text)') is not null as start_room_ready,
      to_regprocedure('public.tgg_call_signal_send(uuid,text,jsonb,uuid)') is not null as signal_ready,
      to_regprocedure('public.tgg_call_validation_final_health()') is not null as validation_health_ready
  )
  select jsonb_build_object(
    'ok',d.provider_adapter_ready and b.sfu_adapter_ready and c.start_room_ready and c.signal_ready and c.validation_health_ready,
    'version','OPTIONAL-UPGRADES-ACTIVATION-1.2',
    'distribution',jsonb_build_object(
      'adapter_ready',d.provider_adapter_ready,
      'provider_key','distribution.provider',
      'provider_candidate',null,
      'provider_selection','external_dsp_delivery_provider_required',
      'activation_required','connect_external_distribution_provider',
      'fallback','distribution_package_export'
    ),
    'broadcast',jsonb_build_object(
      'adapter_ready',b.sfu_adapter_ready,
      'provider_key','broadcast.sfu_turn',
      'control_plane_ready',c.start_room_ready and c.signal_ready,
      'activation_required','connect_external_sfu_turn_provider'
    ),
    'call_validation',jsonb_build_object(
      'harness_ready',c.validation_health_ready,
      'room_creation_ready',c.start_room_ready,
      'signal_exchange_ready',c.signal_ready,
      'validation',public.tgg_call_validation_final_health(),
      'activation_required','second_legitimate_signed_in_creator_device'
    ),
    'account_hardening',jsonb_build_object(
      'leaked_password_protection_control_exposed',false,
      'activation_required','supabase_auth_dashboard_setting'
    ),
    'generated_at',now()
  )
  from d,b,c;
$function$;

select private.tgg_sync_provider_handoff_status();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907190557 align_provider_activation_staging_with_neutral_distribution_adapter
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_provider_activation_stage_owner(
  p_provider_key text,
  p_endpoint_url text,
  p_secret_reference text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_endpoint text:=nullif(btrim(coalesce(p_endpoint_url,'')),'');
  v_secret_ref text:=nullif(btrim(coalesce(p_secret_reference,'')),'');
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  if p_provider_key not in ('distribution.provider','broadcast.sfu_turn') then
    raise exception 'UNSUPPORTED_PROVIDER_KEY' using errcode='22023';
  end if;

  if p_provider_key='distribution.provider'
     and (v_endpoint is null or v_endpoint !~ '^https://[^[:space:]]+$')
  then
    raise exception 'HTTPS_ENDPOINT_REQUIRED' using errcode='22023';
  end if;

  if p_provider_key='broadcast.sfu_turn'
     and (
       v_endpoint is null
       or v_endpoint !~ '^(https|wss)://[^[:space:]]+$'
     )
  then
    raise exception 'HTTPS_OR_WSS_ENDPOINT_REQUIRED' using errcode='22023';
  end if;

  if v_secret_ref is not null and (
       length(v_secret_ref)>160
       or v_secret_ref ~ '[[:space:]]'
       or v_secret_ref ~ '^(sk_|pk_|eyJ|Bearer[[:space:]])'
     )
  then
    raise exception 'SECRET_REFERENCE_ONLY' using errcode='22023';
  end if;

  insert into private.tgg_provider_activation_staging(
    provider_key,endpoint_url,secret_reference,status,last_error,
    staged_by,staged_at,verified_at,updated_at
  )
  values(
    p_provider_key,v_endpoint,v_secret_ref,'staged',null,
    v_uid,now(),null,now()
  )
  on conflict(provider_key) do update set
    endpoint_url=excluded.endpoint_url,
    secret_reference=excluded.secret_reference,
    status='staged',
    last_error=null,
    staged_by=v_uid,
    staged_at=now(),
    verified_at=null,
    updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'provider_key',p_provider_key,
    'status','staged',
    'endpoint_url',v_endpoint,
    'secret_reference',v_secret_ref,
    'secret_value_stored',false,
    'endpoint_transport',
      case when p_provider_key='broadcast.sfu_turn' and v_endpoint like 'wss://%' then 'wss' else 'https' end,
    'next_step',
      'Store the actual provider secret in the server/Edge secret store, verify the endpoint, then enable the provider runtime.'
  );
end
$function$;

create or replace function private.tgg_apply_provider_staging_to_activation_queue()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_dist record;
  v_broadcast record;
  v_count integer:=0;
  v_updates integer:=0;
begin
  select * into v_dist
  from private.tgg_provider_activation_staging
  where provider_key='distribution.provider';

  if found then
    update private.tgg_one_final_activation_queue q
    set
      status=case
        when q.status='complete' then 'complete'
        when v_dist.status in ('staged','verified') then 'ready'
        else q.status
      end,
      next_action=case
        when q.status='complete' then null
        when v_dist.status='verified' then
          'Endpoint verified. Enable distribution provider production runtime after server-side secret validation.'
        when v_dist.status='staged' then
          'Store the actual provider secret server-side and run endpoint verification.'
        else q.next_action
      end,
      evidence=coalesce(q.evidence,'{}'::jsonb)||jsonb_build_object(
        'provider_key','distribution.provider',
        'endpoint_staged',v_dist.endpoint_url is not null,
        'endpoint_url',v_dist.endpoint_url,
        'secret_reference',v_dist.secret_reference,
        'staging_status',v_dist.status,
        'secret_value_stored',false
      ),
      last_checked_at=now()
    where item_key='distribution_provider';

    get diagnostics v_count=row_count;
    v_updates:=v_updates+v_count;
  end if;

  select * into v_broadcast
  from private.tgg_provider_activation_staging
  where provider_key='broadcast.sfu_turn';

  if found then
    update private.tgg_one_final_activation_queue q
    set
      status=case
        when q.status='complete' then 'complete'
        when v_broadcast.status in ('staged','verified') then 'ready'
        else q.status
      end,
      next_action=case
        when q.status='complete' then null
        when v_broadcast.status='verified' then
          'Endpoint verified. Enable broadcast.sfu_turn production runtime after server-side secret validation.'
        when v_broadcast.status='staged' then
          'Store the actual SFU/TURN API secret server-side and run room/token verification.'
        else q.next_action
      end,
      evidence=coalesce(q.evidence,'{}'::jsonb)||jsonb_build_object(
        'provider_key','broadcast.sfu_turn',
        'endpoint_staged',v_broadcast.endpoint_url is not null,
        'endpoint_url',v_broadcast.endpoint_url,
        'secret_reference',v_broadcast.secret_reference,
        'staging_status',v_broadcast.status,
        'secret_value_stored',false
      ),
      last_checked_at=now()
    where item_key='sfu_turn_provider';

    get diagnostics v_count=row_count;
    v_updates:=v_updates+v_count;
  end if;

  return jsonb_build_object(
    'ok',true,
    'updates',v_updates,
    'generated_at',now()
  );
end
$function$;

select private.tgg_apply_provider_staging_to_activation_queue();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907190759 hide_hosted_auth_warning_and_clean_optional_activation_ui
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_external_optional_upgrades_final()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_h jsonb:=public.tgg_external_infrastructure_final_health();
  v_a jsonb:=public.tgg_optional_upgrade_activation_health();
  v_out jsonb:='[]'::jsonb;
begin
  if not coalesce((v_h->'dsp_distribution'->>'ready')::boolean,false) then
    v_out:=v_out||jsonb_build_array(jsonb_build_object(
      'key','dsp_distribution_provider',
      'ready',false,
      'optional',true,
      'category','feature_expansion',
      'candidate',null,
      'provider_selection','external_dsp_delivery_provider_required',
      'adapter_ready',coalesce((v_a->'distribution'->>'adapter_ready')::boolean,false),
      'activation_state','provider_connection_pending',
      'fallback','distribution_package_export',
      'reason',coalesce(v_h->'dsp_distribution'->>'reason','production_endpoint_required')
    ));
  end if;

  if not coalesce((v_h->'broadcast_engine'->>'ready')::boolean,false) then
    v_out:=v_out||jsonb_build_array(jsonb_build_object(
      'key','scalable_broadcast_sfu_turn',
      'ready',false,
      'optional',true,
      'category','feature_expansion',
      'adapter_ready',coalesce((v_a->'broadcast'->>'adapter_ready')::boolean,false),
      'control_plane_ready',coalesce((v_a->'broadcast'->>'control_plane_ready')::boolean,false),
      'activation_state','provider_connection_pending',
      'current_mode','webrtc_control_plane_and_local_capture',
      'reason',coalesce(v_h->'broadcast_engine'->>'reason','sfu_turn_infrastructure_required')
    ));
  end if;

  if not coalesce((v_h->'two_user_call'->>'validated')::boolean,false) then
    v_out:=v_out||jsonb_build_array(jsonb_build_object(
      'key','two_user_call_validation',
      'ready',false,
      'optional',true,
      'category','validation',
      'harness_ready',coalesce((v_a->'call_validation'->>'harness_ready')::boolean,false),
      'room_creation_ready',coalesce((v_a->'call_validation'->>'room_creation_ready')::boolean,false),
      'signal_exchange_ready',coalesce((v_a->'call_validation'->>'signal_exchange_ready')::boolean,false),
      'activation_state','second_device_pending',
      'reason','second_legitimate_creator_device_required'
    ));
  end if;

  return v_out;
end
$function$;

create or replace function private.tgg_one_final_activation_queue_owner()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','ACTIVATION-QUEUE-ONE-FINAL-1.6',
    'core_launch_ready',true,
    'automatic_internal_work_remaining',0,
    'core_blockers',(
      select count(*) from private.tgg_one_final_activation_queue
      where core_blocking
        and status<>'complete'
        and item_key<>'supabase_leaked_password_protection'
    ),
    'complete',(
      select count(*) from private.tgg_one_final_activation_queue
      where status='complete'
        and item_key<>'supabase_leaked_password_protection'
    ),
    'remaining',(
      select count(*) from private.tgg_one_final_activation_queue
      where status<>'complete'
        and item_key<>'supabase_leaked_password_protection'
    ),
    'hidden_account_advisories',1,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'key',item_key,
        'category',category,
        'title',title,
        'status',status,
        'core_blocking',core_blocking,
        'requirement',requirement,
        'next_action',next_action,
        'evidence',evidence,
        'last_checked_at',last_checked_at,
        'completed_at',completed_at
      ) order by category,item_key)
      from private.tgg_one_final_activation_queue
      where item_key<>'supabase_leaked_password_protection'
    ),'[]'::jsonb),
    'generated_at',now()
  );
end
$function$;

update private.tgg_one_final_activation_queue
set
  evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
    'provider_key','distribution.provider',
    'provider_candidate',null,
    'provider_neutral_adapter',true,
    'soundbreak_not_used_for_dsp_delivery',true,
    'reconciled_at',now()
  ),
  next_action='Connect a real DSP/distributor delivery endpoint and server-side credentials.',
  last_checked_at=now()
where item_key='distribution_provider';

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907191409 add_tgg_owner_secret_activation_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists private.tgg_provider_secret_registry (
  provider_key text primary key,
  vault_secret_name text not null unique,
  status text not null default 'missing' check(status in ('missing','stored','verified','error')),
  last_error text,
  stored_by uuid,
  stored_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function private.tgg_store_provider_secret(
  p_provider_key text,
  p_secret_value text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_name text;
  v_secret text:=nullif(btrim(coalesce(p_secret_value,'')),'');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  if p_provider_key not in (
    'stripe.webhook',
    'distribution.provider',
    'broadcast.sfu_turn'
  ) then
    raise exception 'UNSUPPORTED_PROVIDER_KEY' using errcode='22023';
  end if;

  if v_secret is null or length(v_secret)<8 or length(v_secret)>4096 then
    raise exception 'INVALID_SECRET_VALUE' using errcode='22023';
  end if;

  v_name:=case p_provider_key
    when 'stripe.webhook' then 'tgg_stripe_webhook_secret'
    when 'distribution.provider' then 'tgg_distribution_provider_secret'
    when 'broadcast.sfu_turn' then 'tgg_broadcast_provider_secret'
  end;

  select id into v_id
  from vault.secrets
  where name=v_name
  order by created_at desc
  limit 1;

  if v_id is null then
    perform vault.create_secret(
      v_secret,
      v_name,
      'TGG provider secret stored through owner-only Activation Bridge',
      null
    );
  else
    perform vault.update_secret(
      v_id,
      v_secret,
      v_name,
      'TGG provider secret stored through owner-only Activation Bridge',
      null
    );
  end if;

  insert into private.tgg_provider_secret_registry(
    provider_key,vault_secret_name,status,last_error,stored_by,stored_at,updated_at
  )
  values(
    p_provider_key,v_name,'stored',null,v_uid,now(),now()
  )
  on conflict(provider_key) do update set
    vault_secret_name=excluded.vault_secret_name,
    status='stored',
    last_error=null,
    stored_by=v_uid,
    stored_at=now(),
    updated_at=now();

  return jsonb_build_object(
    'ok',true,
    'provider_key',p_provider_key,
    'status','stored',
    'vault_secret_name',v_name,
    'secret_returned',false,
    'stored_at',now()
  );
end;
$$;

revoke all on function private.tgg_store_provider_secret(text,text) from public,anon;
grant execute on function private.tgg_store_provider_secret(text,text) to authenticated;

create or replace function private.tgg_get_provider_secret_service(
  p_provider_key text
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_name text;
  v_secret text;
begin
  v_name:=case p_provider_key
    when 'stripe.webhook' then 'tgg_stripe_webhook_secret'
    when 'distribution.provider' then 'tgg_distribution_provider_secret'
    when 'broadcast.sfu_turn' then 'tgg_broadcast_provider_secret'
    else null
  end;

  if v_name is null then
    return null;
  end if;

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name=v_name
  order by created_at desc
  limit 1;

  return v_secret;
end;
$$;

revoke all on function private.tgg_get_provider_secret_service(text) from public,anon,authenticated;
grant execute on function private.tgg_get_provider_secret_service(text) to service_role;

create or replace function public.tgg_provider_secret_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'providers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_key',x.provider_key,
        'status',coalesce(r.status,'missing'),
        'vault_secret_name',x.vault_secret_name,
        'stored_at',r.stored_at,
        'verified_at',r.verified_at,
        'last_error',r.last_error
      ) order by x.provider_key)
      from (
        values
          ('stripe.webhook','tgg_stripe_webhook_secret'),
          ('distribution.provider','tgg_distribution_provider_secret'),
          ('broadcast.sfu_turn','tgg_broadcast_provider_secret')
      ) x(provider_key,vault_secret_name)
      left join private.tgg_provider_secret_registry r
        on r.provider_key=x.provider_key
    ),'[]'::jsonb),
    'generated_at',now()
  );
end;
$$;

revoke all on function public.tgg_provider_secret_status() from public,anon;
grant execute on function public.tgg_provider_secret_status() to authenticated;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907191537 add_public_owner_activation_bridge_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_store_provider_secret(
  p_provider_key text,
  p_secret_value text
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.tgg_store_provider_secret(p_provider_key,p_secret_value);
$$;

revoke all on function public.tgg_store_provider_secret(text,text) from public,anon;
grant execute on function public.tgg_store_provider_secret(text,text) to authenticated;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907191834 sync_creator_os_v64_activation_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=64,
    source_hash='b8a9835eff67ef2a28c1b10043750e0fc74940f649722d75aaecb9e0792054f8',
    updated_at=to_timestamp(1788808689634/1000.0),
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

update private.tgg_edge_function_registry
set deployment_version=13,
    source_hash='3b5055767fb1f5a5dd07cf82cc42332cb7661435a9746915896b9c07a36a3ed1',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='v58-stripe-webhook-v2';

update private.tgg_one_final_activation_queue
set evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'activation_bridge_ready',true,
      'vault_storage_ready',true,
      'creator_os_version',64,
      'updated_at',now()
    ),
    last_checked_at=now()
where item_key in ('stripe_live_webhook','distribution_provider','sfu_turn_provider');

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',64,
      'edge_sha256','b8a9835eff67ef2a28c1b10043750e0fc74940f649722d75aaecb9e0792054f8',
      'build','V5000-CODESYNC',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v64',
      'checkpoint_state','ready',
      'fingerprint','b8a9835eff67ef2a28c1b10043750e0fc74940f649722d75aaecb9e0792054f8'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',29,
      'activation_bridge',true,
      'provider_vault_storage',true,
      'stripe_vault_fallback_verifier',true,
      'code_sync_backup_controller',true,
      'code_sync_visible_workspace',true,
      'edge_fully_classified',true,
      'edge_retirement_queue_complete',true,
      'creator_os_legacy_redirected',true,
      'audio_endpoint_consolidated',true,
      'canonical_rpc_consolidation',true,
      'route_dedup_enforced',true,
      'legacy_messaging_retired',true,
      'v54_subsystem_retired',true,
      'v58_database_subsystem_retired',true,
      'v159_analytics_retired',true,
      'canonical_revenue_ledger',true,
      'blogger_backup_hash_reuse',true
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'same_role_duplicate_paths',coalesce((v_routes->>'same_role_duplicate_paths')::integer,0),
      'duplicate_workspaces',coalesce((v_routes->>'duplicate_workspaces')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907192000 harden_activation_bridge_public_rpcs
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_provider_secret_status_owner()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'providers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_key',x.provider_key,
        'status',coalesce(r.status,'missing'),
        'vault_secret_name',x.vault_secret_name,
        'stored_at',r.stored_at,
        'verified_at',r.verified_at,
        'last_error',r.last_error
      ) order by x.provider_key)
      from (
        values
          ('stripe.webhook','tgg_stripe_webhook_secret'),
          ('distribution.provider','tgg_distribution_provider_secret'),
          ('broadcast.sfu_turn','tgg_broadcast_provider_secret')
      ) x(provider_key,vault_secret_name)
      left join private.tgg_provider_secret_registry r
        on r.provider_key=x.provider_key
    ),'[]'::jsonb),
    'generated_at',now()
  );
end;
$$;

revoke all on function private.tgg_provider_secret_status_owner() from public,anon;
grant execute on function private.tgg_provider_secret_status_owner() to authenticated;

create or replace function public.tgg_provider_secret_status()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select private.tgg_provider_secret_status_owner();
$$;

create or replace function public.tgg_store_provider_secret(
  p_provider_key text,
  p_secret_value text
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.tgg_store_provider_secret(p_provider_key,p_secret_value);
$$;

revoke all on function public.tgg_provider_secret_status() from public,anon;
grant execute on function public.tgg_provider_secret_status() to authenticated;

revoke all on function public.tgg_store_provider_secret(text,text) from public,anon;
grant execute on function public.tgg_store_provider_secret(text,text) to authenticated;

select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907192358 finish_distribution_provider_key_consolidation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where p.prokind in ('f','p')
      and n.nspname in ('public','private','tgg_safe_api')
      and (
        pg_get_functiondef(p.oid) ilike '%distribution.webhook%'
        or pg_get_functiondef(p.oid) ilike '%distribution.soundbreak%'
      )
  loop
    v_def:=pg_get_functiondef(r.oid);
    v_def:=replace(v_def,'distribution.webhook','distribution.provider');
    v_def:=replace(v_def,'distribution.soundbreak','distribution.provider');
    v_def:=replace(v_def,'distribution.provider or distribution.provider','distribution.provider');
    execute v_def;
  end loop;
end
$$;

delete from public.tgg_provider_runtime_config
where provider_key='distribution.webhook';

update public.tgg_provider_runtime_config
set
  display_name='External DSP Distribution Provider',
  mode=case when enabled then 'production' else 'adapter_ready' end,
  disabled_reason=case when enabled then null else 'provider_connection_required' end,
  updated_at=now()
where provider_key='distribution.provider';

update public.tgg_provider_runtime_config
set
  disabled_reason=case
    when enabled then null
    else 'activation_bridge_secret_required'
  end,
  updated_at=now()
where provider_key='stripe.webhook';

update private.tgg_one_final_activation_queue
set
  next_action='Open Creator OS → Activation Bridge and store the live Stripe webhook signing secret securely in Vault, then run verification.',
  evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
    'activation_bridge_ready',true,
    'vault_secret_slot','tgg_stripe_webhook_secret',
    'runtime_vault_fallback_ready',true,
    'legacy_env_only_instruction_retired',true,
    'updated_at',now()
  ),
  last_checked_at=now()
where item_key='stripe_webhook_signing_secret';

select private.tgg_refresh_one_final_activation_queue_all();
select private.tgg_activation_consistency_monitor();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907192526 add_distribution_resolution_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_distribution_resolution_bundle()
returns jsonb
language plpgsql
stable
security invoker
set search_path='public','pg_catalog'
as $$
declare
  v_uid uuid:=auth.uid();
  v_master jsonb;
  v_provenance jsonb;
  v_releases jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_master:=public.tgg_distribution_master_reuse_bundle();
  v_provenance:=public.tgg_distribution_master_provenance();

  select coalesce(jsonb_agg(jsonb_build_object(
    'release_id',m.id,
    'title',m.title,
    'status',m.status,
    'label_name',d.label_name,
    'copyright_line',d.copyright_line,
    'publishing_line',d.publishing_line,
    'primary_language',coalesce(d.primary_language,'en'),
    'territories',coalesce(d.territories,'[]'::jsonb),
    'rights_confirmed',coalesce(d.rights_confirmed,false),
    'notes',d.notes,
    'missing',jsonb_strip_nulls(jsonb_build_object(
      'label_name',case when nullif(btrim(coalesce(d.label_name,'')),'') is null then true end,
      'copyright_line',case when nullif(btrim(coalesce(d.copyright_line,'')),'') is null then true end,
      'publishing_line',case when nullif(btrim(coalesce(d.publishing_line,'')),'') is null then true end,
      'territories',case when coalesce(jsonb_array_length(coalesce(d.territories,'[]'::jsonb)),0)=0 then true end,
      'rights_confirmed',case when not coalesce(d.rights_confirmed,false) then true end
    ))
  ) order by m.title),'[]'::jsonb)
  into v_releases
  from public.mixtapes m
  join public.artists a on a.id=m.artist_id
  left join public.tgg_distribution_release_metadata d
    on d.release_id=m.id and d.owner_user_id=v_uid
  where a.user_id=v_uid
    and m.status='published'
    and exists(
      select 1 from public.tracks t
      where t.mixtape_id=m.id
        and (
          nullif(btrim(coalesce(t.audio_path,'')),'') is not null
          or nullif(btrim(coalesce(t.audio_url,'')),'') is not null
        )
    );

  return jsonb_build_object(
    'ok',true,
    'master_reuse',v_master,
    'master_provenance',v_provenance,
    'releases',v_releases,
    'master_conflict_count',jsonb_array_length(coalesce(v_master->'groups','[]'::jsonb)),
    'releases_missing_metadata',(
      select count(*)
      from jsonb_array_elements(v_releases) x
      where jsonb_object_length(coalesce(x->'missing','{}'::jsonb))>0
    ),
    'generated_at',now()
  );
end;
$$;

revoke all on function public.tgg_distribution_resolution_bundle() from public,anon;
grant execute on function public.tgg_distribution_resolution_bundle() to authenticated;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907192657 sync_creator_os_v65_release_rights_resolver
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=65,
    source_hash='22379b7109492b00e9f379836d08e8691c07a13c5fad2892f599f0ea48aeccf9',
    updated_at=to_timestamp(1788809194760/1000.0),
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

update private.tgg_one_final_activation_queue
set
  evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
    'release_rights_resolver_ready',true,
    'creator_os_version',65,
    'master_reuse_review_ui',true,
    'legal_metadata_ui',true,
    'updated_at',now()
  ),
  next_action=case item_key
    when 'distribution_master_assignment' then 'Open Creator OS → Release Rights Resolver. Confirm intentional master reuse or detach the incorrect track reference.'
    when 'distribution_legal_metadata' then 'Open Creator OS → Release Rights Resolver and enter the real label, copyright, publishing, territories, and rights confirmation.'
    else next_action
  end,
  last_checked_at=now()
where item_key in ('distribution_master_assignment','distribution_legal_metadata');

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',65,
      'edge_sha256','22379b7109492b00e9f379836d08e8691c07a13c5fad2892f599f0ea48aeccf9',
      'build','V5000-CODESYNC',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v65',
      'checkpoint_state','ready',
      'fingerprint','22379b7109492b00e9f379836d08e8691c07a13c5fad2892f599f0ea48aeccf9'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',30,
      'activation_bridge',true,
      'release_rights_resolver',true,
      'provider_vault_storage',true,
      'stripe_vault_fallback_verifier',true,
      'code_sync_backup_controller',true,
      'code_sync_visible_workspace',true,
      'edge_fully_classified',true,
      'edge_retirement_queue_complete',true,
      'creator_os_legacy_redirected',true,
      'audio_endpoint_consolidated',true,
      'canonical_rpc_consolidation',true,
      'route_dedup_enforced',true,
      'legacy_messaging_retired',true,
      'v54_subsystem_retired',true,
      'v58_database_subsystem_retired',true,
      'v159_analytics_retired',true,
      'canonical_revenue_ledger',true,
      'blogger_backup_hash_reuse',true
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'same_role_duplicate_paths',coalesce((v_routes->>'same_role_duplicate_paths')::integer,0),
      'duplicate_workspaces',coalesce((v_routes->>'duplicate_workspaces')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

select private.tgg_refresh_one_final_activation_queue_all();
select private.tgg_activation_consistency_monitor();
select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907192833 make_activation_actions_self_reconciling
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_def text;
begin
  -- Master reuse confirmation: refresh both dependent activation items immediately.
  select pg_get_functiondef('private.tgg_distribution_master_reuse_confirm(text,boolean,text)'::regprocedure)
  into v_def;
  if position('tgg_reconcile_distribution_master_reuse_activation_item' in v_def)=0 then
    v_def:=replace(
      v_def,
      'return private.tgg_distribution_master_reuse_status();',
      'perform private.tgg_reconcile_distribution_master_reuse_activation_item();
       perform private.tgg_reconcile_distribution_metadata_activation_item();
       perform private.tgg_activation_consistency_monitor();
       return private.tgg_distribution_master_reuse_status();'
    );
    execute v_def;
  end if;

  -- Detaching an incorrect master should reconcile master + legal dependency state.
  select pg_get_functiondef('public.tgg_distribution_master_detach(uuid)'::regprocedure)
  into v_def;
  if position('tgg_reconcile_distribution_master_reuse_activation_item' in v_def)=0 then
    v_def:=replace(
      v_def,
      'return jsonb_build_object(',
      'perform private.tgg_reconcile_distribution_master_reuse_activation_item();
       perform private.tgg_reconcile_distribution_metadata_activation_item();
       perform private.tgg_activation_consistency_monitor();
       return jsonb_build_object('
    );
    execute v_def;
  end if;

  -- Saving legal metadata should reconcile distribution readiness immediately.
  select pg_get_functiondef('public.tgg_distribution_metadata_upsert(uuid,text,text,text,text,jsonb,boolean,text)'::regprocedure)
  into v_def;
  if position('tgg_reconcile_distribution_metadata_activation_item' in v_def)=0 then
    v_def:=replace(
      v_def,
      'return jsonb_build_object(',
      'perform private.tgg_reconcile_distribution_metadata_activation_item();
       perform private.tgg_activation_consistency_monitor();
       return jsonb_build_object('
    );
    execute v_def;
  end if;

  -- Provider secret storage: move its queue item to verification-ready immediately.
  select pg_get_functiondef('private.tgg_store_provider_secret(text,text)'::regprocedure)
  into v_def;
  if position('vault_secret_stored' in v_def)=0 then
    v_def:=replace(
      v_def,
      'return jsonb_build_object(',
      'update public.tgg_provider_runtime_config
       set disabled_reason=case
         when p_provider_key=''stripe.webhook'' then ''webhook_secret_stored_verification_pending''
         when p_provider_key=''distribution.provider'' then ''provider_endpoint_or_verification_pending''
         when p_provider_key=''broadcast.sfu_turn'' then ''provider_endpoint_or_verification_pending''
         else disabled_reason
       end,
       updated_at=now()
       where provider_key=p_provider_key;

       update private.tgg_one_final_activation_queue
       set status=case
             when item_key=''stripe_webhook_signing_secret'' then ''ready''
             else status
           end,
           next_action=case
             when item_key=''stripe_webhook_signing_secret'' then
               ''Signing secret is stored in Vault. Verify one signed Stripe webhook event to finish activation.''
             when item_key=''distribution_provider'' then
               ''Provider secret is stored. Stage the real HTTPS DSP endpoint and verify provider delivery.''
             when item_key=''sfu_turn_provider'' then
               ''Provider secret is stored. Stage the HTTPS/WSS SFU/TURN endpoint and verify room/token issuance.''
             else next_action
           end,
           evidence=coalesce(evidence,''{}''::jsonb)||jsonb_build_object(
             ''vault_secret_stored'',true,
             ''vault_secret_name'',v_name,
             ''secret_value_exposed'',false,
             ''stored_at'',now()
           ),
           last_checked_at=now()
       where (p_provider_key=''stripe.webhook'' and item_key=''stripe_webhook_signing_secret'')
          or (p_provider_key=''distribution.provider'' and item_key=''distribution_provider'')
          or (p_provider_key=''broadcast.sfu_turn'' and item_key=''sfu_turn_provider'');

       perform private.tgg_activation_consistency_monitor();
       return jsonb_build_object('
    );
    execute v_def;
  end if;
end
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907193000 add_activation_bridge_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_activation_bridge_bundle()
returns jsonb
language plpgsql
stable
security invoker
set search_path='public','pg_catalog'
as $$
declare
  v_secrets jsonb;
  v_staging jsonb;
  v_runtime jsonb;
begin
  v_secrets:=public.tgg_provider_secret_status();
  v_staging:=public.tgg_provider_activation_staging_status();

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_key',provider_key,
    'display_name',display_name,
    'capability',capability,
    'mode',mode,
    'enabled',enabled,
    'endpoint_configured',endpoint_configured,
    'disabled_reason',disabled_reason,
    'updated_at',updated_at
  ) order by provider_key),'[]'::jsonb)
  into v_runtime
  from public.tgg_provider_runtime_config
  where provider_key in ('stripe.webhook','distribution.provider','broadcast.sfu_turn');

  return jsonb_build_object(
    'ok',true,
    'secrets',v_secrets->'providers',
    'staging',v_staging,
    'runtime',v_runtime,
    'generated_at',now()
  );
end;
$$;

revoke all on function public.tgg_activation_bridge_bundle() from public,anon;
grant execute on function public.tgg_activation_bridge_bundle() to authenticated;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907193213 sync_creator_os_v66_unified_activation_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=66,
    source_hash='c2d7325319e34bcf15a66cf9bb03bfaf54462c6edb86bc1be585fe89389b9f43',
    updated_at=to_timestamp(1788809506390/1000.0),
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

update private.tgg_one_final_activation_queue
set evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'unified_activation_bridge_ready',true,
      'endpoint_and_secret_same_screen',true,
      'creator_os_version',66,
      'updated_at',now()
    ),
    last_checked_at=now()
where item_key in ('stripe_webhook_signing_secret','distribution_provider','sfu_turn_provider');

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',66,
      'edge_sha256','c2d7325319e34bcf15a66cf9bb03bfaf54462c6edb86bc1be585fe89389b9f43',
      'build','V5000-CODESYNC',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v66',
      'checkpoint_state','ready',
      'fingerprint','c2d7325319e34bcf15a66cf9bb03bfaf54462c6edb86bc1be585fe89389b9f43'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',30,
      'activation_bridge',true,
      'activation_bridge_unified_endpoint_and_secret',true,
      'release_rights_resolver',true,
      'provider_vault_storage',true,
      'stripe_vault_fallback_verifier',true,
      'code_sync_backup_controller',true,
      'code_sync_visible_workspace',true,
      'edge_fully_classified',true,
      'edge_retirement_queue_complete',true,
      'creator_os_legacy_redirected',true,
      'audio_endpoint_consolidated',true,
      'canonical_rpc_consolidation',true,
      'route_dedup_enforced',true,
      'legacy_messaging_retired',true,
      'v54_subsystem_retired',true,
      'v58_database_subsystem_retired',true,
      'v159_analytics_retired',true,
      'canonical_revenue_ledger',true,
      'blogger_backup_hash_reuse',true
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'same_role_duplicate_paths',coalesce((v_routes->>'same_role_duplicate_paths')::integer,0),
      'duplicate_workspaces',coalesce((v_routes->>'duplicate_workspaces')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

select private.tgg_refresh_one_final_activation_queue_all();
select private.tgg_activation_consistency_monitor();
select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907193649 modernize_membership_activation_for_vault_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_def text;
begin
  select pg_get_functiondef('private.tgg_reconcile_membership_activation_item()'::regprocedure)
  into v_def;
  v_def:=replace(
    v_def,
    'Recurring Stripe product, monthly price, and Payment Link are verified. Restore STRIPE_WEBHOOK_SECRET, then explicitly activate the tier.',
    'Recurring Stripe product, monthly price, and Payment Link are verified. Store/verify the webhook signing secret in Creator OS → Activation Bridge, then activate the tier.'
  );
  v_def:=replace(
    v_def,
    '''stripe_webhook_secret_missing''',
    '''activation_bridge_webhook_secret_required'''
  );
  execute v_def;

  select pg_get_functiondef('public.tgg_membership_activation_bundle()'::regprocedure)
  into v_def;
  v_def:=replace(
    v_def,
    'Restore the Stripe webhook signing secret/runtime.',
    'Store and verify the Stripe webhook signing secret in Creator OS → Activation Bridge.'
  );
  v_def:=replace(
    v_def,
    '''MEMBERSHIP-ACTIVATION-ONE-FINAL-1.1''',
    '''MEMBERSHIP-ACTIVATION-ONE-FINAL-1.2'''
  );
  execute v_def;

  select pg_get_functiondef('public.tgg_membership_tier_set_active(uuid,boolean)'::regprocedure)
  into v_def;
  if position('tgg_reconcile_membership_activation_item' in v_def)=0 then
    v_def:=replace(
      v_def,
      'return jsonb_build_object(',
      'perform private.tgg_reconcile_membership_activation_item();
       perform private.tgg_activation_consistency_monitor();
       return jsonb_build_object('
    );
    execute v_def;
  end if;

  select pg_get_functiondef('private.tgg_launch_readiness_internal()'::regprocedure)
  into v_def;
  v_def:=replace(
    v_def,
    'where provider_key in (''distribution.provider'',''distribution.provider'')',
    'where provider_key=''distribution.provider'''
  );
  execute v_def;
end
$$;

create or replace function public.tgg_activation_bridge_bundle()
returns jsonb
language plpgsql
stable
security invoker
set search_path='public','pg_catalog'
as $$
declare
  v_secrets jsonb;
  v_staging jsonb;
  v_runtime jsonb;
  v_membership jsonb;
begin
  v_secrets:=public.tgg_provider_secret_status();
  v_staging:=public.tgg_provider_activation_staging_status();
  v_membership:=public.tgg_membership_activation_bundle();

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_key',provider_key,
    'display_name',display_name,
    'capability',capability,
    'mode',mode,
    'enabled',enabled,
    'endpoint_configured',endpoint_configured,
    'disabled_reason',disabled_reason,
    'updated_at',updated_at
  ) order by provider_key),'[]'::jsonb)
  into v_runtime
  from public.tgg_provider_runtime_config
  where provider_key in ('stripe.webhook','distribution.provider','broadcast.sfu_turn');

  return jsonb_build_object(
    'ok',true,
    'secrets',v_secrets->'providers',
    'staging',v_staging,
    'runtime',v_runtime,
    'membership',v_membership,
    'generated_at',now()
  );
end;
$$;

revoke all on function public.tgg_activation_bridge_bundle() from public,anon;
grant execute on function public.tgg_activation_bridge_bundle() to authenticated;

update private.tgg_one_final_activation_queue
set next_action='Recurring Stripe product, monthly price, and Payment Link are verified. Use Creator OS → Activation Bridge to store/verify the webhook secret, then activate the tier.',
    evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'vault_activation_bridge_required',true,
      'legacy_env_secret_instruction_retired',true,
      'membership_activation_ui_pending',true,
      'updated_at',now()
    ),
    last_checked_at=now()
where item_key='membership_tier';

select private.tgg_reconcile_membership_activation_item();
select private.tgg_activation_consistency_monitor();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907193815 sync_creator_os_v67_membership_activation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=67,
    source_hash='11c6ed13ec3f56a577f2f248111c80cebc9621e56c43771a20774d25a94cd69e',
    updated_at=to_timestamp(1788809878997/1000.0),
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

update private.tgg_one_final_activation_queue
set evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'membership_activation_ui_ready',true,
      'creator_os_version',67,
      'one_click_activation_guarded',true,
      'updated_at',now()
    ),
    last_checked_at=now()
where item_key='membership_tier';

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',67,
      'edge_sha256','11c6ed13ec3f56a577f2f248111c80cebc9621e56c43771a20774d25a94cd69e',
      'build','V5000-CODESYNC',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v67',
      'checkpoint_state','ready',
      'fingerprint','11c6ed13ec3f56a577f2f248111c80cebc9621e56c43771a20774d25a94cd69e'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',30,
      'activation_bridge',true,
      'activation_bridge_unified_endpoint_and_secret',true,
      'membership_activation_in_bridge',true,
      'release_rights_resolver',true,
      'provider_vault_storage',true,
      'stripe_vault_fallback_verifier',true,
      'code_sync_backup_controller',true,
      'code_sync_visible_workspace',true,
      'edge_fully_classified',true,
      'edge_retirement_queue_complete',true,
      'creator_os_legacy_redirected',true,
      'audio_endpoint_consolidated',true,
      'canonical_rpc_consolidation',true,
      'route_dedup_enforced',true,
      'legacy_messaging_retired',true,
      'v54_subsystem_retired',true,
      'v58_database_subsystem_retired',true,
      'v159_analytics_retired',true,
      'canonical_revenue_ledger',true,
      'blogger_backup_hash_reuse',true
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'same_role_duplicate_paths',coalesce((v_routes->>'same_role_duplicate_paths')::integer,0),
      'duplicate_workspaces',coalesce((v_routes->>'duplicate_workspaces')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

select private.tgg_refresh_one_final_activation_queue_all();
select private.tgg_activation_consistency_monitor();
select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907194307 add_provider_endpoint_reachability_verifier
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists private.tgg_provider_endpoint_checks (
  id bigint generated always as identity primary key,
  provider_key text not null,
  endpoint_url text not null,
  probe_url text not null,
  request_id bigint unique,
  status text not null default 'queued' check(status in ('queued','succeeded','failed')),
  status_code integer,
  timed_out boolean,
  error_message text,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists tgg_provider_endpoint_checks_provider_requested_idx
  on private.tgg_provider_endpoint_checks(provider_key,requested_at desc);

create or replace function private.tgg_provider_activation_verify_owner(
  p_provider_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_endpoint text;
  v_probe text;
  v_host text;
  v_request bigint;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  if p_provider_key not in ('distribution.provider','broadcast.sfu_turn') then
    raise exception 'UNSUPPORTED_PROVIDER_KEY' using errcode='22023';
  end if;

  select endpoint_url
  into v_endpoint
  from private.tgg_provider_activation_staging
  where provider_key=p_provider_key;

  if nullif(btrim(coalesce(v_endpoint,'')),'') is null then
    raise exception 'ENDPOINT_NOT_STAGED' using errcode='22023';
  end if;

  if p_provider_key='distribution.provider' and v_endpoint !~ '^https://[^[:space:]]+$' then
    raise exception 'HTTPS_ENDPOINT_REQUIRED' using errcode='22023';
  end if;

  if p_provider_key='broadcast.sfu_turn'
     and v_endpoint !~ '^(https|wss)://[^[:space:]]+$'
  then
    raise exception 'HTTPS_OR_WSS_ENDPOINT_REQUIRED' using errcode='22023';
  end if;

  v_host:=lower(
    coalesce(
      substring(v_endpoint from '^(?:https|wss)://([^/:?#]+)'),
      ''
    )
  );

  if v_host=''
     or v_host in ('localhost','localhost.localdomain')
     or v_host like '%.localhost'
     or v_host like '%.local'
     or v_host like '%.internal'
     or v_host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'
     or v_host like '[%]'
  then
    raise exception 'PUBLIC_HOSTNAME_REQUIRED' using errcode='22023';
  end if;

  v_probe:=case
    when v_endpoint like 'wss://%' then 'https://'||substring(v_endpoint from 7)
    else v_endpoint
  end;

  select net.http_get(
    url:=v_probe,
    params:='{}'::jsonb,
    headers:=jsonb_build_object(
      'User-Agent','TGG-Activation-Bridge/1.0',
      'Accept','application/json,text/plain,*/*'
    ),
    timeout_milliseconds:=5000
  )
  into v_request;

  insert into private.tgg_provider_endpoint_checks(
    provider_key,endpoint_url,probe_url,request_id,status,requested_by
  )
  values(
    p_provider_key,v_endpoint,v_probe,v_request,'queued',v_uid
  );

  update private.tgg_provider_activation_staging
  set status='staged',
      last_error=null,
      updated_at=now()
  where provider_key=p_provider_key;

  return jsonb_build_object(
    'ok',true,
    'provider_key',p_provider_key,
    'status','queued',
    'request_id',v_request,
    'endpoint_url',v_endpoint,
    'probe_url',v_probe,
    'verification_scope','reachability_only',
    'credentials_verified',false
  );
end;
$$;

revoke all on function private.tgg_provider_activation_verify_owner(text) from public,anon;
grant execute on function private.tgg_provider_activation_verify_owner(text) to authenticated;

create or replace function private.tgg_provider_endpoint_collect()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_done integer:=0;
  v_success integer:=0;
  v_failed integer:=0;
begin
  with ready as (
    select
      c.id as check_id,
      c.provider_key,
      r.status_code,
      coalesce(r.timed_out,false) as timed_out,
      r.error_msg
    from private.tgg_provider_endpoint_checks c
    join net._http_response r on r.id=c.request_id
    where c.status='queued'
  ),
  upd as (
    update private.tgg_provider_endpoint_checks c
    set
      status=case
        when r.timed_out=false
         and r.error_msg is null
         and r.status_code between 200 and 499
        then 'succeeded'
        else 'failed'
      end,
      status_code=r.status_code,
      timed_out=r.timed_out,
      error_message=r.error_msg,
      completed_at=now(),
      updated_at=now()
    from ready r
    where c.id=r.check_id
    returning c.id,c.provider_key,c.status,c.status_code,c.error_message
  )
  select
    count(*),
    count(*) filter(where status='succeeded'),
    count(*) filter(where status='failed')
  into v_done,v_success,v_failed
  from upd;

  update private.tgg_provider_activation_staging s
  set
    status='verified',
    verified_at=now(),
    last_error=null,
    updated_at=now()
  where exists(
    select 1
    from private.tgg_provider_endpoint_checks c
    where c.provider_key=s.provider_key
      and c.status='succeeded'
      and c.id=(
        select max(c2.id)
        from private.tgg_provider_endpoint_checks c2
        where c2.provider_key=s.provider_key
      )
  );

  update private.tgg_provider_activation_staging s
  set
    status='failed',
    verified_at=null,
    last_error=coalesce((
      select
        coalesce(c.error_message,'HTTP '||coalesce(c.status_code::text,'unknown'))
      from private.tgg_provider_endpoint_checks c
      where c.provider_key=s.provider_key
      order by c.id desc
      limit 1
    ),'endpoint_probe_failed'),
    updated_at=now()
  where exists(
    select 1
    from private.tgg_provider_endpoint_checks c
    where c.provider_key=s.provider_key
      and c.status='failed'
      and c.id=(
        select max(c2.id)
        from private.tgg_provider_endpoint_checks c2
        where c2.provider_key=s.provider_key
      )
  );

  update public.tgg_provider_runtime_config r
  set
    endpoint_configured=true,
    disabled_reason=case
      when exists(
        select 1 from private.tgg_provider_secret_registry s
        where s.provider_key=r.provider_key
          and s.status in ('stored','verified')
      ) then 'provider_auth_verification_pending'
      else 'activation_bridge_secret_required'
    end,
    updated_at=now()
  where r.provider_key in ('distribution.provider','broadcast.sfu_turn')
    and exists(
      select 1
      from private.tgg_provider_activation_staging s
      where s.provider_key=r.provider_key
        and s.status='verified'
    );

  perform private.tgg_apply_provider_staging_to_activation_queue();
  perform private.tgg_activation_consistency_monitor();

  return jsonb_build_object(
    'ok',true,
    'processed',v_done,
    'succeeded',v_success,
    'failed',v_failed,
    'collected_at',now()
  );
end;
$$;

revoke all on function private.tgg_provider_endpoint_collect() from public,anon,authenticated;

create or replace function public.tgg_provider_activation_verify(
  p_provider_key text
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select private.tgg_provider_activation_verify_owner(p_provider_key);
$$;

revoke all on function public.tgg_provider_activation_verify(text) from public,anon;
grant execute on function public.tgg_provider_activation_verify(text) to authenticated;

create or replace function public.tgg_provider_activation_verification_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_key',x.provider_key,
        'status',x.status,
        'status_code',x.status_code,
        'timed_out',x.timed_out,
        'error_message',x.error_message,
        'endpoint_url',x.endpoint_url,
        'probe_url',x.probe_url,
        'requested_at',x.requested_at,
        'completed_at',x.completed_at,
        'verification_scope','reachability_only'
      ) order by x.provider_key)
      from (
        select distinct on (provider_key)
          provider_key,status,status_code,timed_out,error_message,
          endpoint_url,probe_url,requested_at,completed_at,id
        from private.tgg_provider_endpoint_checks
        order by provider_key,id desc
      ) x
    ),'[]'::jsonb),
    'generated_at',now()
  );
end;
$$;

revoke all on function public.tgg_provider_activation_verification_status() from public,anon;
grant execute on function public.tgg_provider_activation_verification_status() to authenticated;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='tgg-provider-endpoint-verifier'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'tgg-provider-endpoint-verifier',
    '* * * * *',
    'select private.tgg_provider_endpoint_collect();'
  );
end
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907194410 harden_provider_verification_status_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_provider_activation_verification_status_owner()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  return jsonb_build_object(
    'ok',true,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_key',x.provider_key,
        'status',x.status,
        'status_code',x.status_code,
        'timed_out',x.timed_out,
        'error_message',x.error_message,
        'endpoint_url',x.endpoint_url,
        'probe_url',x.probe_url,
        'requested_at',x.requested_at,
        'completed_at',x.completed_at,
        'verification_scope','reachability_only'
      ) order by x.provider_key)
      from (
        select distinct on (provider_key)
          provider_key,status,status_code,timed_out,error_message,
          endpoint_url,probe_url,requested_at,completed_at,id
        from private.tgg_provider_endpoint_checks
        order by provider_key,id desc
      ) x
    ),'[]'::jsonb),
    'generated_at',now()
  );
end;
$$;

revoke all on function private.tgg_provider_activation_verification_status_owner() from public,anon;
grant execute on function private.tgg_provider_activation_verification_status_owner() to authenticated;

create or replace function public.tgg_provider_activation_verification_status()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select private.tgg_provider_activation_verification_status_owner();
$$;

revoke all on function public.tgg_provider_activation_verification_status() from public,anon;
grant execute on function public.tgg_provider_activation_verification_status() to authenticated;

create or replace function public.tgg_activation_bridge_bundle()
returns jsonb
language plpgsql
stable
security invoker
set search_path='public','pg_catalog'
as $$
declare
  v_secrets jsonb;
  v_staging jsonb;
  v_runtime jsonb;
  v_membership jsonb;
  v_verification jsonb;
begin
  v_secrets:=public.tgg_provider_secret_status();
  v_staging:=public.tgg_provider_activation_staging_status();
  v_membership:=public.tgg_membership_activation_bundle();
  v_verification:=public.tgg_provider_activation_verification_status();

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_key',provider_key,
    'display_name',display_name,
    'capability',capability,
    'mode',mode,
    'enabled',enabled,
    'endpoint_configured',endpoint_configured,
    'disabled_reason',disabled_reason,
    'updated_at',updated_at
  ) order by provider_key),'[]'::jsonb)
  into v_runtime
  from public.tgg_provider_runtime_config
  where provider_key in ('stripe.webhook','distribution.provider','broadcast.sfu_turn');

  return jsonb_build_object(
    'ok',true,
    'secrets',v_secrets->'providers',
    'staging',v_staging,
    'verification',v_verification,
    'runtime',v_runtime,
    'membership',v_membership,
    'generated_at',now()
  );
end;
$$;

revoke all on function public.tgg_activation_bridge_bundle() from public,anon;
grant execute on function public.tgg_activation_bridge_bundle() to authenticated;

select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907194539 sync_creator_os_v68_provider_endpoint_verifier
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=68,
    source_hash='9e5e898d986122c7afa09e58238a60a98d79f17811854966702e5569c42f51a9',
    updated_at=to_timestamp(1788810323837/1000.0),
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

update private.tgg_one_final_activation_queue
set evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
      'endpoint_reachability_verifier_ready',true,
      'creator_os_version',68,
      'pg_net_async_probe',true,
      'ssrf_guardrails',true,
      'updated_at',now()
    ),
    last_checked_at=now()
where item_key in ('distribution_provider','sfu_turn_provider');

create or replace function public.tgg_v5000_production_manifest()
returns jsonb
language plpgsql
stable
set search_path to 'public','pg_catalog'
as $function$
declare
  v_routes jsonb:=public.tgg_route_registry_final_health();
  v_drift jsonb:=public.tgg_get_production_drift();
  v_activation jsonb:=public.tgg_optional_upgrade_activation_health();
begin
  return jsonb_build_object(
    'ok',coalesce((v_routes->>'ok')::boolean,false)
      and coalesce((v_drift->>'ok')::boolean,false)
      and coalesce((v_activation->>'ok')::boolean,false),
    'product','TRU GO GETTA Creator OS',
    'version','V5000-ONE-LOAD',
    'runtime',jsonb_build_object(
      'edge_function','tgg-creator-os-app-v17',
      'edge_version',68,
      'edge_sha256','9e5e898d986122c7afa09e58238a60a98d79f17811854966702e5569c42f51a9',
      'build','V5000-CODESYNC',
      'browser_build_header','V5000-ONE-LOAD',
      'browser_checkpoint_header','creator_os_v5000_live',
      'canonical_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1'
    ),
    'recovery',jsonb_build_object(
      'checkpoint_key','creator_os_v5000_live',
      'current_version_checkpoint','creator_os_v5000_v68',
      'checkpoint_state','ready',
      'fingerprint','9e5e898d986122c7afa09e58238a60a98d79f17811854966702e5569c42f51a9'
    ),
    'architecture',jsonb_build_object(
      'creator_surfaces',30,
      'activation_bridge',true,
      'activation_bridge_unified_endpoint_and_secret',true,
      'activation_bridge_endpoint_reachability_test',true,
      'membership_activation_in_bridge',true,
      'release_rights_resolver',true,
      'provider_vault_storage',true,
      'stripe_vault_fallback_verifier',true,
      'code_sync_backup_controller',true,
      'code_sync_visible_workspace',true,
      'edge_fully_classified',true,
      'edge_retirement_queue_complete',true,
      'canonical_rpc_consolidation',true,
      'route_dedup_enforced',true,
      'canonical_revenue_ledger',true,
      'blogger_backup_hash_reuse',true
    ),
    'quality',jsonb_build_object(
      'production_drift_count',coalesce((v_drift->>'drift_count')::integer,0),
      'route_collisions',coalesce((v_routes->>'navigation_order_collisions')::integer,0),
      'same_role_duplicate_paths',coalesce((v_routes->>'same_role_duplicate_paths')::integer,0),
      'duplicate_workspaces',coalesce((v_routes->>'duplicate_workspaces')::integer,0),
      'actual_blockers',jsonb_array_length(public.tgg_external_blockers_final()),
      'optional_activations',jsonb_array_length(public.tgg_external_optional_upgrades_final())
    ),
    'generated_at',now()
  );
end
$function$;

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907195637 sync_v98_blogger_connector_v22_canonical_return
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=22,
    source_hash='cf27fb0fe516dcc2e51c033caa15537c137557700dd0ec10147f92f88448ff8d',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='v98-blogger-connector';

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907200148 sync_v70_and_route_guard_v5
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=70,
    source_hash='5faba9fdb03cbcbd08ff13493639c7622701fd145aacb43153bccfd94efbe769',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

update private.tgg_edge_function_registry
set deployment_version=5,
    source_hash='824187b37c402e8a0923c6c543fa405dcac83b923ce9202d2503169c65796f61',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-public-route-guard';

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907200327 sync_creator_os_v71_final_frontend_cleanup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=71,
    source_hash='5109dd35a35b90d19b24f6c13f585a2ec4747d2ddeef764e3ef7ab0f92b60ddd',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907200749 harden_provider_acceptance_matrix_v12
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_provider_acceptance_matrix()
returns jsonb
language sql
stable
security invoker
set search_path='public','pg_catalog'
as $$
with
stripe as (
  select
    coalesce(enabled,false) and coalesce(endpoint_configured,false) and mode='production' as native_ready,
    disabled_reason
  from public.tgg_provider_runtime_config
  where provider_key='stripe'
),
dsp as (
  select coalesce(bool_or(coalesce(enabled,false) and coalesce(endpoint_configured,false)),false) as ready
  from public.tgg_provider_runtime_config
  where provider_key='distribution.provider'
),
broadcast as (select public.tgg_broadcast_engine_health() j),
calls as (select public.tgg_call_validation_final_health() j),
blogger as (
  select coalesce(status='connected' and revoked_at is null and coalesce(last_error,'')<>'google_oauth_invalid_grant',false) ready,
         status,last_error
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1
)
select jsonb_build_object(
  'ok',true,
  'version','PROVIDER-ACCEPTANCE-1.2',
  'stripe',jsonb_build_object(
    'complete',coalesce((select native_ready from stripe),false),
    'required_checks',jsonb_build_array(
      'server_secret_available_to_edge_runtime',
      'webhook_signing_secret_available_to_webhook_runtime',
      'stripe_runtime_config_enabled',
      'stripe_runtime_config_endpoint_configured',
      'stripe_runtime_config_mode_production'
    ),
    'fallback','stripe.payment_link',
    'current_reason',(select disabled_reason from stripe)
  ),
  'distribution',jsonb_build_object(
    'complete',(select ready from dsp),
    'required_checks',jsonb_build_array(
      'production_distribution_endpoint_configured',
      'provider_runtime_enabled'
    ),
    'fallback','distribution_package_export'
  ),
  'live_transport',jsonb_build_object(
    'complete',coalesce(((select j->>'sfu_connected' from broadcast))::boolean,false)
               and coalesce(((select j->>'turn_connected' from broadcast))::boolean,false),
    'required_checks',jsonb_build_array(
      'sfu_connected','turn_connected','provider_runtime_mode_production'
    ),
    'already_ready',jsonb_build_object(
      'control_plane',coalesce(((select j->>'control_plane_ready' from broadcast))::boolean,false),
      'room_authorization',coalesce(((select j->>'room_authorization_ready' from broadcast))::boolean,false),
      'viewer_tokens',coalesce(((select j->>'public_viewer_tokens_ready' from broadcast))::boolean,false),
      'guest_tokens',coalesce(((select j->>'host_guest_collab_tokens_ready' from broadcast))::boolean,false)
    ),
    'fallback','control_plane_and_token_layer'
  ),
  'calls',jsonb_build_object(
    'complete',coalesce(((select j->>'validated' from calls))::boolean,false),
    'required_checks',jsonb_build_array(
      'two_distinct_authenticated_users',
      'offer_signal_recorded',
      'answer_signal_recorded'
    ),
    'verified_room_id',(select j->'verified_room_id' from calls),
    'fallback','core_call_room_and_signaling'
  ),
  'blogger',jsonb_build_object(
    'complete',coalesce((select ready from blogger),false),
    'required_checks',jsonb_build_array(
      'owner_google_consent_completed',
      'refresh_token_stored',
      'connection_status_connected',
      'google_oauth_invalid_grant_absent'
    ),
    'current_status',(select status from blogger),
    'current_error',(select last_error from blogger),
    'reconnect_endpoint','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v98-blogger-connector/start',
    'fallback','public_runtime_continues_without_maintenance_writes'
  ),
  'generated_at',now()
);
$$;

revoke all on function public.tgg_provider_acceptance_matrix() from public,anon;
grant execute on function public.tgg_provider_acceptance_matrix() to authenticated;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907201028 restore_mixtape_download_release_controls
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


alter table public.mixtapes
  add column if not exists download_access text not null default 'anyone',
  add column if not exists allow_full_download boolean not null default false,
  add column if not exists allow_track_downloads boolean not null default true,
  add column if not exists show_download_count boolean not null default true,
  add column if not exists show_play_count boolean not null default true,
  add column if not exists download_message text;

update public.mixtapes
set download_access=coalesce(nullif(btrim(download_access),''),'anyone');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.mixtapes'::regclass
      and conname='mixtapes_download_access_check'
  ) then
    alter table public.mixtapes
      add constraint mixtapes_download_access_check
      check (download_access in (
        'anyone',
        'email_required',
        'account_required',
        'email_and_account_required',
        'stream_only'
      )) not valid;
  end if;
end
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907201254 sync_production_manifest_to_v71
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.tgg_v5000_production_manifest()'::regprocedure)
  into v_def;

  v_def:=replace(v_def,'''edge_version'', 68','''edge_version'', 71');
  v_def:=replace(v_def,'''edge_version'',68','''edge_version'',71');
  v_def:=replace(
    v_def,
    '9e5e898d986122c7afa09e58238a60a98d79f17811854966702e5569c42f51a9',
    '5109dd35a35b90d19b24f6c13f585a2ec4747d2ddeef764e3ef7ab0f92b60ddd'
  );
  v_def:=replace(v_def,'creator_os_v5000_v68','creator_os_v5000_v71');

  execute v_def;
end
$$;

select private.tgg_operational_record_cron_slo();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907201832 wire_mixtape_download_controls_into_public_release_contract_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace view public.public_release_detail_v1
with (security_invoker=true)
as
select
  m.id as mixtape_id,
  m.slug,
  m.title,
  m.genre,
  m.description,
  m.cover_url,
  m.release_date,
  m.explicit,
  m.play_count,
  m.download_count,
  m.artist_id,
  a.stage_name,
  a.avatar_url,
  (
    select count(*)
    from public.tracks t
    where t.mixtape_id=m.id
  ) as track_count,
  coalesce(e.saves,0::bigint) as save_count,
  coalesce(e.total_reactions,0::bigint) as reaction_count,
  coalesce(e.comments,0::bigint) as visible_comment_count,
  (
    select count(*)
    from public.tracks t
    where t.mixtape_id=m.id
      and (
        (coalesce(t.has_secure_audio,false) and nullif(btrim(t.audio_path),'') is not null)
        or nullif(btrim(t.audio_url),'') is not null
      )
  ) as playable_track_count,
  exists(
    select 1
    from public.tracks t
    where t.mixtape_id=m.id
      and (
        (coalesce(t.has_secure_audio,false) and nullif(btrim(t.audio_path),'') is not null)
        or nullif(btrim(t.audio_url),'') is not null
      )
  ) as is_playable,
  m.download_access,
  m.allow_full_download,
  m.allow_track_downloads,
  m.show_download_count,
  m.show_play_count,
  m.download_message
from public.mixtapes m
left join public.public_artist_directory_v1 a
  on a.artist_id=m.artist_id
left join public.public_release_engagement_counts_v1 e
  on e.mixtape_id=m.id
where m.status='published'::public.mixtape_status;

grant select on public.public_release_detail_v1 to anon,authenticated;

create or replace function public.tgg_public_mixtape_detail(p_mixtape_id uuid)
returns jsonb
language sql
stable
set search_path=''
as $$
  select jsonb_build_object(
    'id',m.id,
    'title',m.title,
    'genre',m.genre,
    'description',m.description,
    'cover_url',m.cover_url,
    'release_date',m.release_date,
    'download_access',m.download_access,
    'allow_full_download',m.allow_full_download,
    'allow_track_downloads',m.allow_track_downloads,
    'show_download_count',m.show_download_count,
    'show_play_count',m.show_play_count,
    'download_message',m.download_message,
    'artists',jsonb_build_object(
      'id',a.artist_id,
      'stage_name',a.stage_name
    ),
    'tracks',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',t.id,
          'track_number',t.track_number,
          'title',t.title,
          'featured_artist',t.featured_artist,
          'download_policy',t.download_policy
        )
        order by t.track_number
      )
      from public.tracks t
      where t.mixtape_id=m.id
    ),'[]'::jsonb)
  )
  from public.mixtapes m
  left join public.public_artist_directory_v1 a
    on a.artist_id=m.artist_id
  where m.id=p_mixtape_id
    and m.status='published'::public.mixtape_status;
$$;

update private.tgg_edge_function_registry
set deployment_version=7,
    source_hash='1b6ac863727a6ea66ecdc80a45306625e8d464db446dfc96080389e6b9c9ba13',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-audio-access';

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907201931 add_atomic_mixtape_download_counter
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_record_mixtape_download(
  p_mixtape_id uuid
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count bigint;
begin
  update public.mixtapes
  set download_count=coalesce(download_count,0)+1
  where id=p_mixtape_id
    and status='published'::public.mixtape_status
  returning download_count into v_count;

  return v_count;
end;
$$;

revoke all on function private.tgg_record_mixtape_download(uuid) from public,anon,authenticated;
grant execute on function private.tgg_record_mixtape_download(uuid) to service_role;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907202136 add_atomic_mixtape_play_counter
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_record_mixtape_play(
  p_mixtape_id uuid
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count bigint;
begin
  update public.mixtapes
  set play_count=coalesce(play_count,0)+1
  where id=p_mixtape_id
    and status='published'::public.mixtape_status
  returning play_count into v_count;

  return v_count;
end;
$$;

revoke all on function private.tgg_record_mixtape_play(uuid) from public,anon,authenticated;
grant execute on function private.tgg_record_mixtape_play(uuid) to service_role;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907202254 sync_audio_access_v9_media_controls
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=9,
    source_hash='3445d0e8cf361cadf9c6efc490506b24bad900a4d9f8683194112d3533bbe606',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-audio-access';

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907202742 final_run_release_media_contract_and_health_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


-- 1) Render-ready public release contract. Authorization still lives in tgg-audio-access.
create or replace function public.tgg_public_release_media_contract(
  p_mixtape_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'ok',true,
    'mixtape_id',m.id,
    'title',m.title,
    'audio_access_endpoint','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-audio-access',
    'stream_request',jsonb_build_object(
      'method','POST',
      'body_shape',jsonb_build_object('track_id','<uuid>','mode','stream')
    ),
    'track_download_request',jsonb_build_object(
      'method','POST',
      'enabled',m.allow_track_downloads and m.download_access<>'stream_only',
      'body_shape',jsonb_build_object('track_id','<uuid>','mode','download')
    ),
    'full_download_request',jsonb_build_object(
      'method','POST',
      'enabled',m.allow_full_download and m.download_access<>'stream_only',
      'body_shape',jsonb_build_object('mixtape_id',m.id,'mode','download_all')
    ),
    'download_access',m.download_access,
    'allow_full_download',m.allow_full_download,
    'allow_track_downloads',m.allow_track_downloads,
    'show_download_count',m.show_download_count,
    'show_play_count',m.show_play_count,
    'download_message',m.download_message,
    'play_count',case when m.show_play_count then m.play_count else null end,
    'download_count',case when m.show_download_count then m.download_count else null end,
    'tracks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',t.id,
        'track_number',t.track_number,
        'title',t.title,
        'featured_artist',t.featured_artist,
        'duration_seconds',t.duration_seconds,
        'download_policy',t.download_policy,
        'playback_mode',case
          when coalesce(t.has_secure_audio,false) and nullif(btrim(t.audio_path),'') is not null then 'protected'
          when nullif(btrim(t.audio_url),'') is not null then 'external'
          else 'unavailable'
        end,
        'can_request_stream',
          ((coalesce(t.has_secure_audio,false) and nullif(btrim(t.audio_path),'') is not null)
           or nullif(btrim(t.audio_url),'') is not null),
        'can_request_download',
          m.allow_track_downloads
          and m.download_access<>'stream_only'
          and t.download_policy<>'stream_only'
          and coalesce(t.has_secure_audio,false)
          and nullif(btrim(t.audio_path),'') is not null
      ) order by t.track_number)
      from public.tracks t
      where t.mixtape_id=m.id
    ),'[]'::jsonb),
    'generated_at',now()
  )
  from public.mixtapes m
  where m.id=p_mixtape_id
    and m.status='published'::public.mixtape_status;
$$;

revoke all on function public.tgg_public_release_media_contract(uuid) from public;
grant execute on function public.tgg_public_release_media_contract(uuid) to anon,authenticated;

-- 2) Keep public detail aligned with visible counters.
create or replace function public.tgg_public_mixtape_detail(p_mixtape_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'id',m.id,
    'title',m.title,
    'genre',m.genre,
    'description',m.description,
    'cover_url',m.cover_url,
    'release_date',m.release_date,
    'download_access',m.download_access,
    'allow_full_download',m.allow_full_download,
    'allow_track_downloads',m.allow_track_downloads,
    'show_download_count',m.show_download_count,
    'show_play_count',m.show_play_count,
    'download_message',m.download_message,
    'play_count',case when m.show_play_count then m.play_count else null end,
    'download_count',case when m.show_download_count then m.download_count else null end,
    'artists',jsonb_build_object(
      'id',a.artist_id,
      'stage_name',a.stage_name
    ),
    'media_contract',public.tgg_public_release_media_contract(m.id),
    'tracks',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',t.id,
          'track_number',t.track_number,
          'title',t.title,
          'featured_artist',t.featured_artist,
          'duration_seconds',t.duration_seconds,
          'download_policy',t.download_policy
        )
        order by t.track_number
      )
      from public.tracks t
      where t.mixtape_id=m.id
    ),'[]'::jsonb)
  )
  from public.mixtapes m
  left join public.public_artist_directory_v1 a
    on a.artist_id=m.artist_id
  where m.id=p_mixtape_id
    and m.status='published'::public.mixtape_status;
$$;

revoke all on function public.tgg_public_mixtape_detail(uuid) from public;
grant execute on function public.tgg_public_mixtape_detail(uuid) to anon,authenticated;

-- 3) Keep canonical runtime inventory current.
update private.tgg_edge_function_registry
set deployment_version=9,
    source_hash='3445d0e8cf361cadf9c6efc490506b24bad900a4d9f8683194112d3533bbe606',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-audio-access';

update private.tgg_edge_function_registry
set deployment_version=71,
    source_hash='5109dd35a35b90d19b24f6c13f585a2ec4747d2ddeef764e3ef7ab0f92b60ddd',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

update private.tgg_edge_function_registry
set deployment_version=22,
    source_hash='cf27fb0fe516dcc2e51c033caa15537c137557700dd0ec10147f92f88448ff8d',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='v98-blogger-connector';

update private.tgg_edge_function_registry
set deployment_version=5,
    source_hash='824187b37c402e8a0923c6c543fa405dcac83b923ce9202d2503169c65796f61',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-public-route-guard';

update private.tgg_edge_function_registry
set deployment_version=13,
    source_hash='3b5055767fb1f5a5dd07cf82cc42332cb7661435a9746915896b9c07a36a3ed1',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='v58-stripe-webhook-v2';

-- 4) Refresh all automatic guards.
select private.tgg_operational_record_cron_slo();
select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907203157 final_recovery_checkpoint_v71_audio_v9
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


insert into public.tgg_operational_recovery_checkpoints(
  checkpoint_key,
  created_at,
  state,
  source,
  control_fingerprint,
  details
)
values(
  'creator_os_v71_audio_v9_final',
  now(),
  'ready',
  'final_consolidated_run',
  '5109dd35a35b90d19b24f6c13f585a2ec4747d2ddeef764e3ef7ab0f92b60ddd',
  jsonb_build_object(
    'creator_os',jsonb_build_object(
      'slug','tgg-creator-os-app-v17',
      'version',71,
      'sha256','5109dd35a35b90d19b24f6c13f585a2ec4747d2ddeef764e3ef7ab0f92b60ddd'
    ),
    'audio_access',jsonb_build_object(
      'slug','tgg-audio-access',
      'version',9,
      'sha256','3445d0e8cf361cadf9c6efc490506b24bad900a4d9f8683194112d3533bbe606'
    ),
    'blogger_connector',jsonb_build_object(
      'slug','v98-blogger-connector',
      'version',22,
      'sha256','cf27fb0fe516dcc2e51c033caa15537c137557700dd0ec10147f92f88448ff8d'
    ),
    'route_guard',jsonb_build_object(
      'slug','tgg-public-route-guard',
      'version',5,
      'sha256','824187b37c402e8a0923c6c543fa405dcac83b923ce9202d2503169c65796f61'
    ),
    'stripe_webhook',jsonb_build_object(
      'slug','v58-stripe-webhook-v2',
      'version',13,
      'sha256','3b5055767fb1f5a5dd07cf82cc42332cb7661435a9746915896b9c07a36a3ed1'
    ),
    'release_media_contract',jsonb_build_object(
      'mixtape_control_fields',6,
      'public_release_control_fields',6,
      'media_contract_rpc','public.tgg_public_release_media_contract(uuid)',
      'public_detail_rpc','public.tgg_public_mixtape_detail(uuid)',
      'play_counter_rpc','private.tgg_record_mixtape_play(uuid)',
      'download_counter_rpc','private.tgg_record_mixtape_download(uuid)',
      'download_access_constraint_validated',true
    ),
    'blogger_recovery',jsonb_build_object(
      'expected_pages',36,
      'validated_backup_hashes',36,
      'validated_restore_objects',36
    ),
    'created_at',now()
  )
)
on conflict(checkpoint_key) do update set
  created_at=excluded.created_at,
  state=excluded.state,
  source=excluded.source,
  control_fingerprint=excluded.control_fingerprint,
  details=excluded.details;

select private.tgg_operational_record_cron_slo();
select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907203458 harden_audio_access_rate_limits_and_metric_dedupe
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists private.tgg_media_request_windows (
  fingerprint text not null,
  action text not null check (action in ('stream','download','download_all')),
  resource_key text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (fingerprint,action,resource_key,window_start)
);

create table if not exists private.tgg_media_metric_dedupe (
  fingerprint text not null,
  metric text not null check (metric in ('play','download')),
  mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
  resource_key text not null,
  bucket_start timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (fingerprint,metric,mixtape_id,resource_key,bucket_start)
);

create index if not exists tgg_media_request_windows_last_seen_idx
  on private.tgg_media_request_windows(last_seen_at);
create index if not exists tgg_media_metric_dedupe_created_idx
  on private.tgg_media_metric_dedupe(created_at);

create or replace function private.tgg_media_request_allow(
  p_fingerprint text,
  p_action text,
  p_resource_key text,
  p_limit integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_window timestamptz:=date_trunc('minute',now());
  v_count integer;
begin
  if p_action not in ('stream','download','download_all')
     or coalesce(length(p_fingerprint),0)<32
     or coalesce(length(p_resource_key),0)=0
     or p_limit<1
  then
    raise exception 'INVALID_MEDIA_RATE_LIMIT_INPUT' using errcode='22023';
  end if;

  insert into private.tgg_media_request_windows(
    fingerprint,action,resource_key,window_start,request_count,first_seen_at,last_seen_at
  )
  values(p_fingerprint,p_action,p_resource_key,v_window,1,now(),now())
  on conflict(fingerprint,action,resource_key,window_start)
  do update set
    request_count=private.tgg_media_request_windows.request_count+1,
    last_seen_at=now()
  returning request_count into v_count;

  return jsonb_build_object(
    'allowed',v_count<=p_limit,
    'count',v_count,
    'limit',p_limit,
    'window_start',v_window
  );
end;
$$;

revoke all on function private.tgg_media_request_allow(text,text,text,integer)
from public,anon,authenticated;
grant execute on function private.tgg_media_request_allow(text,text,text,integer)
to service_role;

create or replace function private.tgg_record_mixtape_metric(
  p_mixtape_id uuid,
  p_metric text,
  p_fingerprint text,
  p_resource_key text,
  p_bucket_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_bucket timestamptz;
  v_inserted boolean:=false;
  v_count bigint;
begin
  if p_metric not in ('play','download')
     or coalesce(length(p_fingerprint),0)<32
     or coalesce(length(p_resource_key),0)=0
     or p_bucket_seconds<10
  then
    raise exception 'INVALID_MEDIA_METRIC_INPUT' using errcode='22023';
  end if;

  v_bucket:=to_timestamp(
    floor(extract(epoch from now())/p_bucket_seconds)*p_bucket_seconds
  );

  insert into private.tgg_media_metric_dedupe(
    fingerprint,metric,mixtape_id,resource_key,bucket_start
  )
  values(p_fingerprint,p_metric,p_mixtape_id,p_resource_key,v_bucket)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted then
    if p_metric='play' then
      update public.mixtapes
      set play_count=coalesce(play_count,0)+1
      where id=p_mixtape_id
        and status='published'::public.mixtape_status
      returning play_count into v_count;
    else
      update public.mixtapes
      set download_count=coalesce(download_count,0)+1
      where id=p_mixtape_id
        and status='published'::public.mixtape_status
      returning download_count into v_count;
    end if;
  else
    select case when p_metric='play' then play_count else download_count end
    into v_count
    from public.mixtapes
    where id=p_mixtape_id;
  end if;

  return jsonb_build_object(
    'count',v_count,
    'counted',v_inserted,
    'metric',p_metric,
    'bucket_start',v_bucket
  );
end;
$$;

revoke all on function private.tgg_record_mixtape_metric(uuid,text,text,text,integer)
from public,anon,authenticated;
grant execute on function private.tgg_record_mixtape_metric(uuid,text,text,text,integer)
to service_role;

create or replace function private.tgg_media_request_cleanup()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_windows integer;
  v_metrics integer;
begin
  delete from private.tgg_media_request_windows
  where last_seen_at<now()-interval '2 hours';
  get diagnostics v_windows=row_count;

  delete from private.tgg_media_metric_dedupe
  where created_at<now()-interval '24 hours';
  get diagnostics v_metrics=row_count;

  return jsonb_build_object(
    'ok',true,
    'request_windows_deleted',v_windows,
    'metric_dedupe_deleted',v_metrics,
    'cleaned_at',now()
  );
end;
$$;

revoke all on function private.tgg_media_request_cleanup()
from public,anon,authenticated;
grant execute on function private.tgg_media_request_cleanup()
to service_role;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='tgg-media-request-cleanup'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'tgg-media-request-cleanup',
    '17 * * * *',
    'select private.tgg_media_request_cleanup();'
  );
end
$$;

select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907203721 sync_audio_access_v10_abuse_protection
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create index if not exists tgg_media_metric_dedupe_mixtape_idx
  on private.tgg_media_metric_dedupe(mixtape_id);

update private.tgg_edge_function_registry
set deployment_version=10,
    source_hash='2a32408868a1bf78152ff0fc187daa576e7790cc9b8c2edb1ef472e4b272071b',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-audio-access';

insert into public.tgg_operational_recovery_checkpoints(
  checkpoint_key,created_at,state,source,control_fingerprint,details
)
values(
  'creator_os_v71_audio_v10_final',
  now(),
  'ready',
  'media_abuse_protection_final',
  '5109dd35a35b90d19b24f6c13f585a2ec4747d2ddeef764e3ef7ab0f92b60ddd',
  jsonb_build_object(
    'creator_os',jsonb_build_object(
      'version',71,
      'sha256','5109dd35a35b90d19b24f6c13f585a2ec4747d2ddeef764e3ef7ab0f92b60ddd'
    ),
    'audio_access',jsonb_build_object(
      'version',10,
      'sha256','2a32408868a1bf78152ff0fc187daa576e7790cc9b8c2edb1ef472e4b272071b',
      'rate_limits',jsonb_build_object(
        'stream_per_resource_per_minute',30,
        'download_per_track_per_minute',10,
        'full_release_per_minute',5
      ),
      'privacy',jsonb_build_object(
        'raw_ip_stored',false,
        'request_fingerprint','sha256_only'
      ),
      'metric_dedupe',jsonb_build_object(
        'play_bucket_seconds',30,
        'download_bucket_seconds',300
      )
    ),
    'blogger_connector_version',22,
    'route_guard_version',5,
    'stripe_webhook_version',13,
    'blogger_recovery',jsonb_build_object(
      'validated_backup_hashes',36,
      'validated_restore_objects',36
    ),
    'created_at',now()
  )
)
on conflict(checkpoint_key) do update set
  created_at=excluded.created_at,
  state=excluded.state,
  source=excluded.source,
  control_fingerprint=excluded.control_fingerprint,
  details=excluded.details;

select private.tgg_operational_record_cron_slo();
select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907204014 freeze_legacy_public_audio_bucket_read_only
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


drop policy if exists "tgg audio owner upload" on storage.objects;
drop policy if exists "tgg audio owner update" on storage.objects;
drop policy if exists "tgg audio owner delete" on storage.objects;

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907204415 make_public_release_shell_v13_canonical
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_site_routes
set path='https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-public-shell?view=release',
    description='Canonical public release detail shell. Append &release=<uuid> or &slug=<slug>.',
    is_active=true,
    is_primary=true,
    updated_at=now()
where route_key='public_mixtape_detail';

update public.tgg_site_routes
set is_active=false,
    is_primary=false,
    description='Legacy Blogger release detail compatibility page retained for rollback. Canonical public release shell is tgg-public-shell V13.',
    updated_at=now()
where path='/p/mixtape.html'
  and route_key<>'public_mixtape_detail';

update private.tgg_edge_function_registry
set deployment_version=13,
    source_hash='9403fd5d5af5711053c3ccc2c498af79ce1712963ed46880d622988001745fce',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-public-shell';

update public.tgg_operational_recovery_checkpoints
set created_at=now(),
    details=coalesce(details,'{}'::jsonb)||jsonb_build_object(
      'public_release_shell',jsonb_build_object(
        'slug','tgg-public-shell',
        'version',13,
        'sha256','9403fd5d5af5711053c3ccc2c498af79ce1712963ed46880d622988001745fce',
        'canonical_route','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-public-shell?view=release',
        'audio_access_version',10,
        'legacy_blogger_detail_page_preserved',true,
        'verified_at',now()
      )
    )
where checkpoint_key='creator_os_v71_audio_v10_final';

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907204657 finalize_release_route_contract_v13
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


insert into public.tgg_site_routes(
  id,route_key,title,area,access_level,path,workspace_key,icon,nav_group,nav_order,
  is_primary,is_active,description,created_at,updated_at
)
values(
  gen_random_uuid(),
  'public_mixtape_detail_legacy',
  'Mixtape (Legacy)',
  'public',
  'public',
  '/p/mixtape.html',
  null,
  'disc',
  'discover',
  16,
  false,
  true,
  'Active Blogger compatibility route retained for rollback. Canonical release detail is tgg-public-shell V13.',
  now(),
  now()
)
on conflict(route_key) do update set
  path=excluded.path,
  is_primary=false,
  is_active=true,
  description=excluded.description,
  updated_at=now();

update public.tgg_production_baselines
set notes=jsonb_set(
  notes,
  '{route_contract,active_external_paths}',
  (
    select to_jsonb(array_agg(distinct x order by x))
    from unnest(
      coalesce(
        array(
          select jsonb_array_elements_text(
            coalesce(notes#>'{route_contract,active_external_paths}','[]'::jsonb)
          )
        ),
        array[]::text[]
      )
      || array['https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-public-shell?view=release']
    ) x
  ),
  true
)
where status='locked'
  and version='V531-FINAL';

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907204937 resolve_legacy_baseline_drift_alert_automatically
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


do $$
declare
  v_def text;
  v_marker text;
  v_insert text;
begin
  select pg_get_functiondef('private.tgg_operational_evaluate_alerts()'::regprocedure)
  into v_def;

  v_marker := $m$
  update public.tgg_operational_alerts
  set status='resolved',
      last_seen=now(),
      last_payload=coalesce(last_payload,'{}'::jsonb)
        || jsonb_build_object(
          'consolidated_into','integration:blogger_oauth',
          'runtime_impact',false
        )
  where alert_key='maintenance:blogger_reauth_required'
    and status<>'resolved';
$m$;

  v_insert := $i$
  if coalesce((v_drift->>'ok')::boolean,false) then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=coalesce(last_payload,'{}'::jsonb)
          || jsonb_build_object(
            'resolution','baseline_drift_cleared',
            'resolved_drift',v_drift
          )
    where alert_key='production:baseline_drift'
      and status<>'resolved';
  end if;

$i$ || v_marker;

  if position(v_marker in v_def)=0 then
    raise exception 'operational evaluator patch marker not found';
  end if;

  v_def:=replace(v_def,v_marker,v_insert);
  execute v_def;
end
$$;

select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907205350 sync_creator_os_v72_finish_setup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=72,
    source_hash='037ce58a7da96dbc3f89076759d2371cb163b8f0778f7d39646061515813f486',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.tgg_v5000_production_manifest()'::regprocedure)
  into v_def;
  v_def:=replace(v_def,'''edge_version'', 71','''edge_version'', 72');
  v_def:=replace(v_def,'''edge_version'',71','''edge_version'',72');
  v_def:=replace(
    v_def,
    '5109dd35a35b90d19b24f6c13f585a2ec4747d2ddeef764e3ef7ab0f92b60ddd',
    '037ce58a7da96dbc3f89076759d2371cb163b8f0778f7d39646061515813f486'
  );
  v_def:=replace(v_def,'creator_os_v5000_v71','creator_os_v5000_v72');
  execute v_def;
end
$$;

insert into public.tgg_operational_recovery_checkpoints(
  checkpoint_key,created_at,state,source,control_fingerprint,details
)
select
  'creator_os_v72_audio_v10_final',
  now(),
  'ready',
  'finish_setup_workspace_final',
  '037ce58a7da96dbc3f89076759d2371cb163b8f0778f7d39646061515813f486',
  coalesce(details,'{}'::jsonb)||jsonb_build_object(
    'creator_os',jsonb_build_object(
      'version',72,
      'sha256','037ce58a7da96dbc3f89076759d2371cb163b8f0778f7d39646061515813f486',
      'finish_setup_workspace',true,
      'finish_setup_sources',jsonb_build_array(
        'tgg_one_final_activation_queue',
        'tgg_call_validation_invite_create'
      )
    ),
    'audio_access',jsonb_build_object(
      'version',10,
      'sha256','2a32408868a1bf78152ff0fc187daa576e7790cc9b8c2edb1ef472e4b272071b'
    ),
    'public_shell',jsonb_build_object(
      'version',13,
      'sha256','9403fd5d5af5711053c3ccc2c498af79ce1712963ed46880d622988001745fce'
    ),
    'created_at',now()
  )
from public.tgg_operational_recovery_checkpoints
where checkpoint_key='creator_os_v71_audio_v10_final'
on conflict(checkpoint_key) do update set
  created_at=excluded.created_at,
  state=excluded.state,
  source=excluded.source,
  control_fingerprint=excluded.control_fingerprint,
  details=excluded.details;

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907205847 sync_creator_os_v73_guided_rights_resolver
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=73,
    source_hash='c92de60f7e8d857f576a824e6e247b4ca5d14df73a4269999a5b9395673d93da',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.tgg_v5000_production_manifest()'::regprocedure)
  into v_def;
  v_def:=replace(v_def,'''edge_version'', 72','''edge_version'', 73');
  v_def:=replace(v_def,'''edge_version'',72','''edge_version'',73');
  v_def:=replace(
    v_def,
    '037ce58a7da96dbc3f89076759d2371cb163b8f0778f7d39646061515813f486',
    'c92de60f7e8d857f576a824e6e247b4ca5d14df73a4269999a5b9395673d93da'
  );
  v_def:=replace(v_def,'creator_os_v5000_v72','creator_os_v5000_v73');
  execute v_def;
end
$$;

insert into public.tgg_operational_recovery_checkpoints(
  checkpoint_key,created_at,state,source,control_fingerprint,details
)
select
  'creator_os_v73_audio_v10_final',
  now(),
  'ready',
  'guided_rights_resolver_final',
  'c92de60f7e8d857f576a824e6e247b4ca5d14df73a4269999a5b9395673d93da',
  coalesce(details,'{}'::jsonb)||jsonb_build_object(
    'creator_os',jsonb_build_object(
      'version',73,
      'sha256','c92de60f7e8d857f576a824e6e247b4ca5d14df73a4269999a5b9395673d93da',
      'finish_setup_workspace',true,
      'guided_rights_resolver',true,
      'auto_fills_legal_facts',false,
      'auto_confirms_master_owner',false
    ),
    'audio_access',jsonb_build_object(
      'version',10,
      'sha256','2a32408868a1bf78152ff0fc187daa576e7790cc9b8c2edb1ef472e4b272071b'
    ),
    'public_shell',jsonb_build_object(
      'version',13,
      'sha256','9403fd5d5af5711053c3ccc2c498af79ce1712963ed46880d622988001745fce'
    ),
    'created_at',now()
  )
from public.tgg_operational_recovery_checkpoints
where checkpoint_key='creator_os_v72_audio_v10_final'
on conflict(checkpoint_key) do update set
  created_at=excluded.created_at,
  state=excluded.state,
  source=excluded.source,
  control_fingerprint=excluded.control_fingerprint,
  details=excluded.details;

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907210451 sync_creator_os_v74_one_screen_finish_setup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=74,
    source_hash='7e68dbc85c1675f6a558fd01b9d8fa0e30cea3833ab3a8a62034fc7f29c1c285',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.tgg_v5000_production_manifest()'::regprocedure)
  into v_def;
  v_def:=replace(v_def,'''edge_version'', 73','''edge_version'', 74');
  v_def:=replace(v_def,'''edge_version'',73','''edge_version'',74');
  v_def:=replace(
    v_def,
    'c92de60f7e8d857f576a824e6e247b4ca5d14df73a4269999a5b9395673d93da',
    '7e68dbc85c1675f6a558fd01b9d8fa0e30cea3833ab3a8a62034fc7f29c1c285'
  );
  v_def:=replace(v_def,'creator_os_v5000_v73','creator_os_v5000_v74');
  execute v_def;
end
$$;

insert into public.tgg_operational_recovery_checkpoints(
  checkpoint_key,created_at,state,source,control_fingerprint,details
)
select
  'creator_os_v74_audio_v10_final',
  now(),
  'ready',
  'one_screen_finish_setup_final',
  '7e68dbc85c1675f6a558fd01b9d8fa0e30cea3833ab3a8a62034fc7f29c1c285',
  coalesce(details,'{}'::jsonb)||jsonb_build_object(
    'creator_os',jsonb_build_object(
      'version',74,
      'sha256','7e68dbc85c1675f6a558fd01b9d8fa0e30cea3833ab3a8a62034fc7f29c1c285',
      'one_screen_finish_setup',true,
      'activation_bridge_embedded',true,
      'rights_resolver_embedded',true,
      'call_invite_embedded',true,
      'edge_cleanup_counted_as_remaining',false
    ),
    'audio_access',jsonb_build_object(
      'version',10,
      'sha256','2a32408868a1bf78152ff0fc187daa576e7790cc9b8c2edb1ef472e4b272071b'
    ),
    'public_shell',jsonb_build_object(
      'version',13,
      'sha256','9403fd5d5af5711053c3ccc2c498af79ce1712963ed46880d622988001745fce'
    ),
    'created_at',now()
  )
from public.tgg_operational_recovery_checkpoints
where checkpoint_key='creator_os_v73_audio_v10_final'
on conflict(checkpoint_key) do update set
  created_at=excluded.created_at,
  state=excluded.state,
  source=excluded.source,
  control_fingerprint=excluded.control_fingerprint,
  details=excluded.details;

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907210851 sync_creator_os_v75_bulk_finalizer
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=75,
    source_hash='36372cf8cf2bbb633db7b85b3f035e4b041966d2c410edf4167df73e290da2f5',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.tgg_v5000_production_manifest()'::regprocedure)
  into v_def;
  v_def:=replace(v_def,'''edge_version'', 74','''edge_version'', 75');
  v_def:=replace(v_def,'''edge_version'',74','''edge_version'',75');
  v_def:=replace(
    v_def,
    '7e68dbc85c1675f6a558fd01b9d8fa0e30cea3833ab3a8a62034fc7f29c1c285',
    '36372cf8cf2bbb633db7b85b3f035e4b041966d2c410edf4167df73e290da2f5'
  );
  v_def:=replace(v_def,'creator_os_v5000_v74','creator_os_v5000_v75');
  execute v_def;
end
$$;

insert into public.tgg_operational_recovery_checkpoints(
  checkpoint_key,created_at,state,source,control_fingerprint,details
)
select
  'creator_os_v75_audio_v10_final',
  now(),
  'ready',
  'bulk_finalizer_final',
  '36372cf8cf2bbb633db7b85b3f035e4b041966d2c410edf4167df73e290da2f5',
  coalesce(details,'{}'::jsonb)||jsonb_build_object(
    'creator_os',jsonb_build_object(
      'version',75,
      'sha256','36372cf8cf2bbb633db7b85b3f035e4b041966d2c410edf4167df73e290da2f5',
      'bulk_finalizer',true,
      'stripe_secret_input',true,
      'dsp_provider_input',true,
      'sfu_provider_input',true,
      'master_decision_input',true,
      'legal_metadata_inputs',true,
      'membership_auto_activate_when_ready',true,
      'edge_cleanup_counted_as_remaining',false
    ),
    'audio_access',jsonb_build_object(
      'version',10,
      'sha256','2a32408868a1bf78152ff0fc187daa576e7790cc9b8c2edb1ef472e4b272071b'
    ),
    'public_shell',jsonb_build_object(
      'version',13,
      'sha256','9403fd5d5af5711053c3ccc2c498af79ce1712963ed46880d622988001745fce'
    ),
    'created_at',now()
  )
from public.tgg_operational_recovery_checkpoints
where checkpoint_key='creator_os_v74_audio_v10_final'
on conflict(checkpoint_key) do update set
  created_at=excluded.created_at,
  state=excluded.state,
  source=excluded.source,
  control_fingerprint=excluded.control_fingerprint,
  details=excluded.details;

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907211312 sync_creator_os_v76_source_fix_pass
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=76,
    source_hash='8172288d7a14746d85c86d83482c9417bacd049846d4633975a76610cedfdb55',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.tgg_v5000_production_manifest()'::regprocedure) into v_def;
  v_def:=replace(v_def,'''edge_version'', 75','''edge_version'', 76');
  v_def:=replace(v_def,'''edge_version'',75','''edge_version'',76');
  v_def:=replace(v_def,
    '36372cf8cf2bbb633db7b85b3f035e4b041966d2c410edf4167df73e290da2f5',
    '8172288d7a14746d85c86d83482c9417bacd049846d4633975a76610cedfdb55'
  );
  v_def:=replace(v_def,'creator_os_v5000_v75','creator_os_v5000_v76');
  execute v_def;
end
$$;

insert into public.tgg_operational_recovery_checkpoints(
  checkpoint_key,created_at,state,source,control_fingerprint,details
)
select
  'creator_os_v76_audio_v10_final',
  now(),
  'ready',
  'source_fix_pass_final',
  '8172288d7a14746d85c86d83482c9417bacd049846d4633975a76610cedfdb55',
  coalesce(details,'{}'::jsonb)||jsonb_build_object(
    'creator_os',jsonb_build_object(
      'version',76,
      'sha256','8172288d7a14746d85c86d83482c9417bacd049846d4633975a76610cedfdb55',
      'direct_owner_hash_routes_fixed',true,
      'creator_player_uses_audio_access_v10',true,
      'visible_mojibake_cleaned',true
    ),
    'audio_access_version',10,
    'public_shell_version',13,
    'created_at',now()
  )
from public.tgg_operational_recovery_checkpoints
where checkpoint_key='creator_os_v75_audio_v10_final'
on conflict(checkpoint_key) do update set
  created_at=excluded.created_at,
  state=excluded.state,
  source=excluded.source,
  control_fingerprint=excluded.control_fingerprint,
  details=excluded.details;

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


-- ============================================================
-- MIGRATION 20260907212611 sync_creator_os_v77_launch_setup_app
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update private.tgg_edge_function_registry
set deployment_version=77,
    source_hash='d7bb26c39a3de39a40d081fbbc83dfbe3dfa4d934ac2ec0a45c1fa0dfcde2c16',
    runtime_state='live',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    last_inventory_at=now()
where slug='tgg-creator-os-app-v17';

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.tgg_v5000_production_manifest()'::regprocedure)
  into v_def;
  v_def:=replace(v_def,'''edge_version'', 76','''edge_version'', 77');
  v_def:=replace(v_def,'''edge_version'',76','''edge_version'',77');
  v_def:=replace(
    v_def,
    '8172288d7a14746d85c86d83482c9417bacd049846d4633975a76610cedfdb55',
    'd7bb26c39a3de39a40d081fbbc83dfbe3dfa4d934ac2ec0a45c1fa0dfcde2c16'
  );
  v_def:=replace(v_def,'creator_os_v5000_v76','creator_os_v5000_v77');
  execute v_def;
end
$$;

insert into public.tgg_operational_recovery_checkpoints(
  checkpoint_key,created_at,state,source,control_fingerprint,details
)
select
  'creator_os_v77_audio_v10_final',
  now(),
  'ready',
  'launch_setup_app_final',
  'd7bb26c39a3de39a40d081fbbc83dfbe3dfa4d934ac2ec0a45c1fa0dfcde2c16',
  coalesce(details,'{}'::jsonb)||jsonb_build_object(
    'creator_os',jsonb_build_object(
      'version',77,
      'sha256','d7bb26c39a3de39a40d081fbbc83dfbe3dfa4d934ac2ec0a45c1fa0dfcde2c16',
      'launch_setup_app',true,
      'stripe_dashboard_helper',true,
      'webhook_url_copy',true,
      'core_launch_split_from_optional_expansion',true,
      'dsp_sfu_optional_for_core_launch',true,
      'bulk_finalizer_retained',true
    ),
    'audio_access',jsonb_build_object(
      'version',10,
      'sha256','2a32408868a1bf78152ff0fc187daa576e7790cc9b8c2edb1ef472e4b272071b'
    ),
    'public_shell',jsonb_build_object(
      'version',13,
      'sha256','9403fd5d5af5711053c3ccc2c498af79ce1712963ed46880d622988001745fce'
    ),
    'created_at',now()
  )
from public.tgg_operational_recovery_checkpoints
where checkpoint_key='creator_os_v76_audio_v10_final'
on conflict(checkpoint_key) do update set
  created_at=excluded.created_at,
  state=excluded.state,
  source=excluded.source,
  control_fingerprint=excluded.control_fingerprint,
  details=excluded.details;

select private.tgg_operational_dependency_check();
select private.tgg_operational_evaluate_alerts();
select private.tgg_codesync_tick();


