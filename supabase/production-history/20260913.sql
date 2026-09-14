-- TRU GO GETTA production migration history archive
-- Date bucket: 20260913
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260913024415 optimize_v58_rls_auth_uid_initplans
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

alter policy v58_events_select_own on public.v58_workflow_events
  using (exists (select 1 from public.v58_workflow_runs r where r.id = v58_workflow_events.workflow_run_id and r.creator_id = (select auth.uid())));

alter policy v58_runs_select_own on public.v58_workflow_runs
  using (creator_id = (select auth.uid()));

alter policy v58_steps_select_own on public.v58_workflow_steps
  using (exists (select 1 from public.v58_workflow_runs r where r.id = v58_workflow_steps.workflow_run_id and r.creator_id = (select auth.uid())));

commit;

-- ============================================================
-- MIGRATION 20260913051107 reconcile_verified_blogger_patch_hashes_in_live_monitor
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_actionable_blogger_live_state(p_live jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_drift jsonb:='[]'::jsonb;
  v_missing jsonb:='[]'::jsonb;
  v_drift_count integer:=0;
  v_missing_count integer:=0;
  v_effective_hashes jsonb:=coalesce(public.tgg_effective_blogger_page_hashes(),'{}'::jsonb);
  v_out jsonb;
begin
  select coalesce(jsonb_agg(x),'[]'::jsonb)
  into v_drift
  from jsonb_array_elements(coalesce(p_live->'drift','[]'::jsonb)) x
  where
    not (
      nullif(x->>'path','') is not null
      and nullif(x->>'live_hash','') is not null
      and coalesce(v_effective_hashes->>(x->>'path'),'')=x->>'live_hash'
    )
    and (
      not exists(
        select 1
        from public.tgg_site_routes r
        where split_part(r.path,'#',1)=x->>'path'
      )
      or exists(
        select 1
        from public.tgg_site_routes r
        where split_part(r.path,'#',1)=x->>'path'
          and r.is_active=true
      )
    );

  select coalesce(jsonb_agg(x),'[]'::jsonb)
  into v_missing
  from jsonb_array_elements(coalesce(p_live->'missing_pages','[]'::jsonb)) x
  where
    not exists(
      select 1
      from public.tgg_site_routes r
      where split_part(r.path,'#',1)=coalesce(x->>'path',x#>>'{}')
    )
    or exists(
      select 1
      from public.tgg_site_routes r
      where split_part(r.path,'#',1)=coalesce(x->>'path',x#>>'{}')
        and r.is_active=true
    );

  v_drift_count:=jsonb_array_length(v_drift);
  v_missing_count:=jsonb_array_length(v_missing);

  v_out:=coalesce(p_live,'{}'::jsonb)
    || jsonb_build_object(
      'raw_drift_count',coalesce((p_live->>'drift_count')::integer,0),
      'raw_ok',coalesce((p_live->>'ok')::boolean,false),
      'drift',v_drift,
      'drift_count',v_drift_count,
      'missing_pages',v_missing,
      'suppressed_inactive_legacy_drift',
        greatest(coalesce((p_live->>'drift_count')::integer,0)-v_drift_count,0),
      'effective_hash_overrides',true,
      'ok',(v_drift_count=0 and v_missing_count=0),
      'classification','active_or_unknown_routes_only'
    );

  return v_out;
end;
$function$;

-- ============================================================
-- MIGRATION 20260913051129 use_effective_blogger_hashes_in_baseline_drift_core
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_production_baseline_drift_core()
returns jsonb
language plpgsql
security definer
set search_path to ''
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
  v_storage_regressions jsonb:='{}'::jsonb;
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
  select count(*) into v_expected_pages from jsonb_object_keys(v_expected);
  v_live:=private.tgg_actionable_blogger_live_state(coalesce(v_baseline.notes->'live_blogger_hash_monitor','{}'::jsonb));

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
  v_live_complete:=v_live_locked=v_expected_pages and v_live_seen=v_expected_pages and v_expected_pages>0;

  if v_live_drift_count>0 or (v_live_fresh and v_live_complete and not v_live_ok) then
    v_drift:=v_drift || jsonb_build_array(jsonb_build_object(
      'type','blogger_live_content','fresh',v_live_fresh,'complete',v_live_complete,
      'expected_pages',v_expected_pages,'locked_pages',v_live_locked,
      'live_pages_checked',v_live_seen,'drift_count',v_live_drift_count,
      'drift',coalesce(v_live->'drift','[]'::jsonb),
      'missing_pages',coalesce(v_live->'missing_pages','[]'::jsonb),
      'checked_at',v_live->>'checked_at',
      'effective_hash_overrides',coalesce((v_live->>'effective_hash_overrides')::boolean,false)
    ));
  end if;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_routes
  from jsonb_array_elements_text(coalesce(v_baseline.notes#>'{route_audit,present}','[]'::jsonb));

  select coalesce(array_agg(path order by path),array[]::text[])
  into v_current_routes
  from (
    select distinct split_part(path,'#',1) as path
    from public.tgg_site_routes
    where is_active=true and path like '/p/%'
  ) q;

  if not (v_expected_routes <@ v_current_routes) then
    v_drift:=v_drift || jsonb_build_array(jsonb_build_object(
      'type','route_contract','expected_routes',to_jsonb(v_expected_routes),
      'current_routes',to_jsonb(v_current_routes)));
  end if;

  select coalesce(array_agg(value order by value),array[]::text[])
  into v_expected_realtime
  from jsonb_array_elements_text(coalesce(v_baseline.notes#>'{realtime_publication,expected_tables}','[]'::jsonb));

  select coalesce(array_agg(tablename order by tablename),array[]::text[])
  into v_current_realtime
  from pg_catalog.pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public';

  if not (v_expected_realtime <@ v_current_realtime) then
    v_drift:=v_drift || jsonb_build_array(jsonb_build_object(
      'type','realtime_publication','expected_tables',to_jsonb(v_expected_realtime),
      'current_tables',to_jsonb(v_current_realtime)));
  end if;

  v_expected_storage:=coalesce(v_baseline.notes#>'{storage_contract,buckets}','{}'::jsonb);

  select coalesce(jsonb_object_agg(id,public order by id),'{}'::jsonb)
  into v_current_storage
  from storage.buckets
  where id in ('artist-images','audio','covers','creator-media','media-thumbnails','mixtape-audio','v98-blogger-backups','videos');

  select coalesce(jsonb_object_agg(e.key,jsonb_build_object('expected',e.value,'current',v_current_storage->e.key)),'{}'::jsonb)
  into v_storage_regressions
  from jsonb_each(v_expected_storage) e
  where not (v_current_storage ? e.key)
     or (coalesce((e.value #>> '{}')::boolean,false)=false and coalesce((v_current_storage->>e.key)::boolean,false)=true);

  if v_storage_regressions <> '{}'::jsonb then
    v_drift:=v_drift || jsonb_build_array(jsonb_build_object(
      'type','storage_bucket_privacy','regressions',v_storage_regressions,
      'expected',v_expected_storage,'current',v_current_storage));
  end if;

  with locked as (
    select x->>'path' as path,x->>'page_id' as page_id
    from jsonb_array_elements(v_baseline.notes#>'{full_page_snapshot,pages}') x
  ), backup_map as (
    select l.path,count(distinct b.id) as backup_records,count(distinct o.name) as backup_objects
    from locked l
    left join public.v98_blogger_backups b on b.resource_type='page' and b.resource_key=l.page_id
    left join storage.objects o on o.bucket_id='v98-blogger-backups' and o.name=b.storage_path
    group by l.path
  )
  select count(*) filter(where backup_records>0 and backup_objects>0),
         coalesce(jsonb_agg(path order by path) filter(where backup_records=0 or backup_objects=0),'[]'::jsonb)
  into v_restorable_pages,v_missing_backup_paths
  from backup_map;

  if v_restorable_pages is distinct from v_expected_pages then
    v_drift:=v_drift || jsonb_build_array(jsonb_build_object(
      'type','rollback_readiness','expected_pages',v_expected_pages,
      'restorable_pages',v_restorable_pages,'missing_paths',v_missing_backup_paths));
  end if;

  with expected as (
    select x->>'path' as path,nullif(x->>'backup_id','')::uuid as backup_id
    from jsonb_array_elements(coalesce(v_baseline.notes#>'{validated_backup_contract,backups}','[]'::jsonb)) x
  ), verified as (
    select e.path,e.backup_id,b.storage_path,o.name as object_name
    from expected e
    left join public.v98_blogger_backups b on b.id=e.backup_id
    left join storage.objects o on o.bucket_id='v98-blogger-backups' and o.name=b.storage_path
  )
  select count(*),count(*) filter(where backup_id is not null and storage_path is not null and object_name is not null),
         coalesce(jsonb_agg(path order by path) filter(where backup_id is null or storage_path is null or object_name is null),'[]'::jsonb)
  into v_validated_expected,v_validated_present,v_missing_validated
  from verified;

  if v_validated_expected is distinct from v_expected_pages or v_validated_present is distinct from v_expected_pages then
    v_drift:=v_drift || jsonb_build_array(jsonb_build_object(
      'type','validated_restore_objects','expected_pages',v_expected_pages,
      'validated_manifest_entries',v_validated_expected,'validated_objects_present',v_validated_present,
      'missing_paths',v_missing_validated));
  end if;

  return jsonb_build_object(
    'ok',jsonb_array_length(v_drift)=0,'baseline',v_baseline.version,'checked_at',now(),
    'expected_pages',v_expected_pages,'blogger_live_fresh',v_live_fresh,
    'blogger_live_complete',v_live_complete,'blogger_live_ok',v_live_ok,
    'restorable_pages',v_restorable_pages,'validated_restore_objects',v_validated_present,
    'expected_route_paths',cardinality(v_expected_routes),'current_route_paths',cardinality(v_current_routes),
    'expected_realtime_tables',cardinality(v_expected_realtime),'current_realtime_tables',cardinality(v_current_realtime),
    'storage_buckets_checked',(select count(*) from jsonb_object_keys(v_expected_storage)),
    'drift_count',jsonb_array_length(v_drift),'drift',v_drift);
end;
$function$;

-- ============================================================
-- MIGRATION 20260913051334 clear_stale_completed_call_invite_alert
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_call_invite_expiry_watch()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text:='missing';
  v_expires_at timestamptz;
  v_claimed boolean:=false;
  v_seconds bigint;
  v_level text;
  v_payload jsonb;
begin
  select
    i.status,
    i.expires_at,
    i.claimed_by_user_id is not null
  into v_status,v_expires_at,v_claimed
  from private.tgg_call_validation_invites i
  order by i.created_at desc
  limit 1;

  if v_status='pending' and v_expires_at<=now() then
    v_status:='expired';
  end if;

  if v_expires_at is not null then
    v_seconds:=greatest(extract(epoch from (v_expires_at-now()))::bigint,0);
  end if;

  v_level:=case
    when v_claimed then 'clear'
    when v_status='expired' then 'clear'
    when v_status='pending' and coalesce(v_seconds,0)<=7200 then 'advisory'
    else 'clear'
  end;

  v_payload:=jsonb_build_object(
    'ok',true,
    'version','CALL-INVITE-EXPIRY-WATCH-1.2',
    'status',v_status,
    'claimed',v_claimed,
    'expires_at',v_expires_at,
    'expires_in_seconds',v_seconds,
    'warning_window_seconds',7200,
    'level',v_level,
    'core_blocking',false,
    'checked_at',now()
  );

  if v_level in ('clear','advisory') then
    update public.tgg_operational_alerts
    set status='resolved',
        last_seen=now(),
        last_payload=v_payload
    where alert_key='calls:validation_invite_expiry'
      and status<>'resolved';
  else
    insert into public.tgg_operational_alerts(alert_key,status,severity,subsystem,first_seen,last_seen,occurrence_count,last_payload)
    values('calls:validation_invite_expiry','open','warning','calls',now(),now(),1,v_payload)
    on conflict(alert_key) do update
    set status='open',severity='warning',subsystem='calls',last_seen=now(),
        occurrence_count=public.tgg_operational_alerts.occurrence_count+1,last_payload=excluded.last_payload;
  end if;

  return v_payload;
end
$function$;

-- ============================================================
-- MIGRATION 20260913051534 reconcile_schema_attestation_after_approved_runtime_watch_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

update public.tgg_operational_recovery_checkpoints set details = details || jsonb_build_object('schema_attestation_md5','8e7e48fdabc0f5ec1ee32ddb6bd0a00a','schema_attestation_object_count',33,'schema_attestation_refreshed_at',now(),'schema_attestation_reason','Approved runtime watch reconciliation: call-invite expiry alert handling was intentionally corrected; runtime/recovery identity and protected controls remain unchanged.') where checkpoint_key='migration_hygiene_live';

-- ============================================================
-- MIGRATION 20260913135256 fix_architecture_stale_component_retirement
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_brain_architecture_refresh()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tables integer := 0;
  v_functions integer := 0;
  v_verified integer := 0;
  v_now timestamptz := now();
begin
  with src as (
    select
      'dbtable:'||c.table_name as component_key,
      c.table_name as name,
      case when c.table_name like 'tgg_world_%' then 'game' when c.table_name like 'tgg_brain_%' then 'brain' when c.table_name like 'tgg_build_%' or c.table_name like 'tgg_autobuilder_%' then 'build' when c.table_name like 'tgg_creator_%' then 'creator_platform' else 'platform' end as owner_domain,
      case when c.table_name like 'tgg_brain_%' then 'medium' when c.table_name like 'tgg_world_%' then 'medium' when c.table_name like 'tgg_build_%' or c.table_name like 'tgg_autobuilder_%' then 'high' else 'medium' end as risk_level
    from information_schema.tables c
    where c.table_schema='public' and (c.table_name like 'tgg_world_%' or c.table_name like 'tgg_brain_%' or c.table_name like 'tgg_build_%' or c.table_name like 'tgg_autobuilder_%' or c.table_name like 'tgg_creator_%')
  ), upserted as (
    insert into public.tgg_brain_components(component_key,component_type,name,environment,source_ref,canonical,active,risk_level,owner_domain,capabilities,constraints,metadata,health_status,last_verified_at,updated_at)
    select s.component_key,'database_table',s.name,'shared','table:public.'||s.name,false,true,s.risk_level,s.owner_domain,jsonb_build_array('database_storage'),jsonb_build_array('internal_component'),jsonb_build_object('auto_discovered',true,'schema','public'),'healthy',v_now,v_now from src s
    on conflict(component_key) do update set component_type='database_table',name=excluded.name,source_ref=excluded.source_ref,active=true,risk_level=excluded.risk_level,owner_domain=excluded.owner_domain,metadata=public.tgg_brain_components.metadata || excluded.metadata,health_status='healthy',last_verified_at=v_now,updated_at=v_now returning 1
  ) select count(*) into v_tables from upserted;

  with src as (
    select 'dbfn:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as component_key,p.proname as name,n.nspname as schema_name,
      case when p.proname like 'tgg_world_%' then 'game' when p.proname like 'tgg_brain_%' then 'brain' when p.proname like 'tgg_build_%' or p.proname like 'tgg_autobuilder_%' then 'build' when p.proname like 'tgg_creator_%' then 'creator_platform' else 'platform' end as owner_domain,
      case when p.prosecdef then 'high' when p.proname like 'tgg_build_%' or p.proname like 'tgg_autobuilder_%' then 'high' else 'medium' end as risk_level,p.prosecdef as security_definer
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and (p.proname like 'tgg_world_%' or p.proname like 'tgg_brain_%' or p.proname like 'tgg_build_%' or p.proname like 'tgg_autobuilder_%' or p.proname like 'tgg_creator_%')
  ), upserted as (
    insert into public.tgg_brain_components(component_key,component_type,name,environment,source_ref,canonical,active,risk_level,owner_domain,capabilities,constraints,metadata,health_status,last_verified_at,updated_at)
    select s.component_key,'database_function',s.name,'shared','function:'||s.schema_name||'.'||s.name,false,true,s.risk_level,s.owner_domain,jsonb_build_array('database_rpc'),case when s.security_definer then jsonb_build_array('security_definer','internal_review_required') else jsonb_build_array('internal_component') end,jsonb_build_object('auto_discovered',true,'schema',s.schema_name,'security_definer',s.security_definer),'healthy',v_now,v_now from src s
    on conflict(component_key) do update set component_type='database_function',name=excluded.name,source_ref=excluded.source_ref,active=true,risk_level=excluded.risk_level,owner_domain=excluded.owner_domain,constraints=excluded.constraints,metadata=public.tgg_brain_components.metadata || excluded.metadata,health_status='healthy',last_verified_at=v_now,updated_at=v_now returning 1
  ) select count(*) into v_functions from upserted;

  update public.tgg_brain_components c
  set health_status='retired',active=false,updated_at=v_now,metadata=c.metadata || jsonb_build_object('retired_at',v_now,'retirement_reason','auto_discovered_component_missing_from_catalog','stale_detected_at',v_now)
  where coalesce((c.metadata->>'auto_discovered')::boolean,false)=true
    and c.component_type in ('database_table','database_function')
    and c.last_verified_at < v_now
    and not exists (select 1 from information_schema.tables t where c.component_type='database_table' and c.component_key='dbtable:'||t.table_name and t.table_schema='public')
    and not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where c.component_type='database_function' and c.component_key='dbfn:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' and n.nspname in ('public','private'));

  select count(*) into v_verified from public.tgg_brain_components where active=true and last_verified_at=v_now;
  return jsonb_build_object('ok',true,'refreshed_at',v_now,'tables_seen',v_tables,'functions_seen',v_functions,'components_verified',v_verified,'auto_retire_manual_components',false);
end $function$;

create or replace function public.tgg_brain_architecture_scan()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_refresh jsonb; v_lineage jsonb; v_now timestamptz := now(); v_active integer := 0; v_tables integer := 0; v_functions integer := 0; v_stale integer := 0; v_prev public.tgg_brain_architecture_scans%rowtype; v_new integer := 0; v_missing integer := 0; v_status text := 'clean'; v_key text; v_id uuid;
begin
  v_refresh := public.tgg_brain_architecture_refresh();
  v_lineage := public.tgg_brain_lineage_refresh();
  select count(*) filter(where active=true),count(*) filter(where active=true and component_type='database_table'),count(*) filter(where active=true and component_type='database_function'),count(*) filter(where active=false and coalesce((metadata->>'auto_discovered')::boolean,false)=true and health_status in ('warning','degraded','blocked')) into v_active,v_tables,v_functions,v_stale from public.tgg_brain_components;
  select * into v_prev from public.tgg_brain_architecture_scans order by scanned_at desc limit 1;
  if found then v_new:=greatest(v_active-v_prev.active_components,0); v_missing:=greatest(v_prev.active_components-v_active,0); end if;
  if v_missing>0 or v_stale>0 then v_status:='warning'; elsif v_new>0 then v_status:='changed'; else v_status:='clean'; end if;
  v_key:='archscan:'||replace(gen_random_uuid()::text,'-','');
  insert into public.tgg_brain_architecture_scans(scan_key,scanned_at,active_components,active_tables,active_functions,stale_components,new_since_previous,missing_since_previous,drift_status,summary) values(v_key,v_now,v_active,v_tables,v_functions,v_stale,v_new,v_missing,v_status,jsonb_build_object('refresh',v_refresh,'lineage',v_lineage,'production_auto_publish',false,'high_risk_auto_execute',false,'canonical_boundary','AB-006','canonical_source_version','V223')) returning id into v_id;
  return jsonb_build_object('ok',true,'scan_id',v_id,'drift_status',v_status,'active_components',v_active,'active_tables',v_tables,'active_functions',v_functions,'stale_components',v_stale,'new_since_previous',v_new,'missing_since_previous',v_missing,'lineage',v_lineage);
end $function$;

-- ============================================================
-- MIGRATION 20260913140435 canonicalize_artist_dashboard_login_route
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

update public.tgg_site_routes set is_active = false, is_primary = false where path = '/p/admin-dashboard.html';
update public.tgg_site_routes set is_active = false, is_primary = false where path = '/p/artist-dashboard_0633467215.html';
update public.tgg_site_routes set is_active = true, is_primary = true where route_key = 'artist_dashboard' and path = '/p/artist-dashboard_0633467215.html';

-- ============================================================
-- MIGRATION 20260913140545 make_artist_dashboard_trigger_canonical
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_enforce_one_final_routes()
returns trigger
language plpgsql
set search_path to ''
as $$
declare v_creator_os text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1';
begin
 if new.route_key='owner_master_admin' then new.path:=v_creator_os||'#master-admin'; new.title:='Master Admin'; new.workspace_key:='master_admin'; new.is_active:=true; new.is_primary:=true; new.description:='Owner-only Master Admin canonical Creator OS workspace.';
 elsif new.route_key='admin_dashboard' then new.path:='/p/admin-dashboard.html'; new.is_active:=false; new.is_primary:=false; new.description:='Legacy Admin alias.';
 elsif new.route_key='artist_creator_os' then new.path:=v_creator_os; new.title:='Creator OS · ONE FINAL'; new.workspace_key:='dashboard'; new.is_active:=true; new.is_primary:=true;
 elsif new.route_key='artist_dashboard' then new.path:='/p/artist-dashboard_0633467215.html'; new.is_active:=true; new.is_primary:=true; new.description:='Canonical artist login destination and Artist Dashboard.';
 elsif new.route_key='artist_settings' then new.path:='/p/artist-dashboard_0633467215.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('creator_settings','artist_campaigns','artist_smartlinks','artist_phone') then new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_opportunities','artist_credits','artist_academy') then new.path:='/p/career-os.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_fans','artist_collaboration') then new.path:='/p/backstage.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_releases','artist_distribution') then new.path:='/p/music-hub.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_calls','artist_live') then new.path:='/p/live.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='charts' then new.path:='/p/homepage.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='artist_command_center' then new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='artist_growth' then new.path:=v_creator_os||'#growth'; new.workspace_key:='growth'; new.is_active:=true; new.is_primary:=false;
 elsif new.route_key='releases' then new.path:='/search/label/Mixtapes'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='merch' then new.path:='/p/creator-store.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.path='/p/command-center.html' or new.path like '/p/command-center.html#%' then new.is_active:=false; new.is_primary:=false;
 end if;
 return new;
end $$;

-- ============================================================
-- MIGRATION 20260913140558 finalize_artist_dashboard_route_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.tgg_site_routes drop constraint if exists tgg_site_routes_one_final_legacy_dashboard_hidden;
alter table public.tgg_site_routes add constraint tgg_site_routes_one_final_legacy_dashboard_hidden check (route_key <> 'artist_dashboard' or (path = '/p/artist-dashboard_0633467215.html' and is_active = true and is_primary = true)) not valid;
update public.tgg_site_routes set is_active=false,is_primary=false where route_key='artist_settings';
update public.tgg_site_routes set is_active=true,is_primary=true,path='/p/artist-dashboard_0633467215.html' where route_key='artist_dashboard';
alter table public.tgg_site_routes validate constraint tgg_site_routes_one_final_legacy_dashboard_hidden;

-- ============================================================
-- MIGRATION 20260913141456 repair_one_final_legacy_dashboard_guard_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

ALTER TABLE public.tgg_site_routes
DROP CONSTRAINT IF EXISTS tgg_site_routes_one_final_legacy_dashboard_hidden;

CREATE OR REPLACE FUNCTION private.tgg_enforce_one_final_routes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
declare v_creator_os text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1';
begin
 if new.route_key='owner_master_admin' then new.path:=v_creator_os||'#master-admin'; new.title:='Master Admin'; new.workspace_key:='master_admin'; new.is_active:=true; new.is_primary:=true; new.description:='Owner-only Master Admin canonical Creator OS workspace.';
 elsif new.route_key='admin_dashboard' then new.path:='/p/admin-dashboard.html'; new.is_active:=false; new.is_primary:=false; new.description:='Legacy Admin alias.';
 elsif new.route_key='artist_creator_os' then new.path:=v_creator_os; new.title:='Creator OS · ONE FINAL'; new.workspace_key:='dashboard'; new.is_active:=true; new.is_primary:=true;
 elsif new.route_key='artist_dashboard' then new.path:='/p/artist-dashboard_0633467215.html'; new.is_active:=false; new.is_primary:=false; new.description:='Legacy Blogger Artist Dashboard compatibility route. Canonical ONE-FINAL Creator OS is artist_creator_os.';
 elsif new.route_key='artist_settings' then new.path:='/p/artist-dashboard_0633467215.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('creator_settings','artist_campaigns','artist_smartlinks','artist_phone') then new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_opportunities','artist_credits','artist_academy') then new.path:='/p/career-os.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_fans','artist_collaboration') then new.path:='/p/backstage.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_releases','artist_distribution') then new.path:='/p/music-hub.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_calls','artist_live') then new.path:='/p/live.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='charts' then new.path:='/p/homepage.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='artist_command_center' then new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='artist_growth' then new.path:=v_creator_os||'#growth'; new.workspace_key:='growth'; new.is_active:=true; new.is_primary:=false;
 elsif new.route_key='releases' then new.path:='/search/label/Mixtapes'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='merch' then new.path:='/p/creator-store.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.path='/p/command-center.html' or new.path like '/p/command-center.html#%' then new.is_active:=false; new.is_primary:=false;
 end if;
 return new;
end $function$;

UPDATE public.tgg_site_routes
SET is_active=false,
    is_primary=false,
    description='Legacy Blogger Artist Dashboard compatibility route. Canonical ONE-FINAL Creator OS is artist_creator_os.'
WHERE route_key='artist_dashboard';

ALTER TABLE public.tgg_site_routes
ADD CONSTRAINT tgg_site_routes_one_final_legacy_dashboard_hidden
CHECK (
  route_key <> 'artist_dashboard'
  OR (
    path = '/p/artist-dashboard_0633467215.html'
    AND is_active = false
    AND is_primary = false
  )
);

-- ============================================================
-- MIGRATION 20260913144421 harden_v58_release_launch_owner_boundary
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.v58_create_release_launch_workflow(p_release_id text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  rid uuid;
  d jsonb;
  s jsonb;
  release_owner uuid;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select a.user_id
    into release_owner
  from public.mixtapes m
  join public.artists a on a.id = m.artist_id
  where m.id = nullif(p_release_id,'')::uuid
  limit 1;

  if release_owner is null then
    raise exception 'Release not found' using errcode='P0002';
  end if;

  if release_owner <> uid then
    raise exception 'Release not owned by current creator' using errcode='42501';
  end if;

  select id into rid
  from public.v58_workflow_runs
  where creator_id=uid
    and release_id=p_release_id
    and workflow_key='release_launch'
    and workflow_version=58
    and status in ('pending','running','blocked')
  order by created_at desc
  limit 1;

  if rid is not null then return rid; end if;

  select public.v58_auto_builder_load('release_launch',58) into d;

  insert into public.v58_workflow_runs(creator_id,release_id,workflow_key,workflow_version,status)
  values(uid,p_release_id,'release_launch',58,'pending')
  returning id into rid;

  for s in select * from jsonb_array_elements(coalesce(d->'steps','[]')) loop
    insert into public.v58_workflow_steps(workflow_run_id,key,title,description,type,status,required,sequence,max_attempts,depends_on)
    values(
      rid,
      s->>'key',
      coalesce(s->>'title',s->>'key'),
      s->>'description',
      coalesce(s->>'type','automation'),
      'pending',
      coalesce((s->>'required')::boolean,true),
      coalesce((s->>'sequence')::int,0),
      coalesce((s->>'max_attempts')::int,3),
      coalesce(array(select jsonb_array_elements_text(coalesce(s->'depends_on','[]'))),'{}')
    );
  end loop;

  perform public.v58_emit_event(
    rid,null,'workflow.created','Release Launch workflow created',
    'Workflow seeded from Auto Builder configuration.','info','release',p_release_id,
    jsonb_build_object('workflow_version',58),'workflow-created'
  );

  return rid;
end;
$$;

-- ============================================================
-- MIGRATION 20260913150853 tgg_media_vault_tracker_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_media_vault_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text not null check (file_type in ('xml','html','audio','video','image','screenshot','evidence','archive','document','other')),
  source_provider text not null default 'manual' check (source_provider in ('manual','google_drive','google_photos','dropbox','supabase_storage','other')),
  source_path text,
  external_url text,
  version_label text,
  build_label text,
  status text not null default 'untracked' check (status in ('untracked','received','reviewing','verified','approved','archived','superseded')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','failed')),
  related_flow_key text,
  notes text,
  file_size_bytes bigint,
  checksum text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tgg_media_vault_items_owner_idx on public.tgg_media_vault_items(owner_user_id);
create index if not exists tgg_media_vault_items_status_idx on public.tgg_media_vault_items(status, verification_status);
create index if not exists tgg_media_vault_items_version_idx on public.tgg_media_vault_items(version_label, build_label);

alter table public.tgg_media_vault_items enable row level security;
revoke all on table public.tgg_media_vault_items from anon, authenticated;
grant select, insert, update, delete on table public.tgg_media_vault_items to authenticated;

drop policy if exists "TGG media vault owner select" on public.tgg_media_vault_items;
drop policy if exists "TGG media vault owner insert" on public.tgg_media_vault_items;
drop policy if exists "TGG media vault owner update" on public.tgg_media_vault_items;
drop policy if exists "TGG media vault owner delete" on public.tgg_media_vault_items;

create policy "TGG media vault owner select" on public.tgg_media_vault_items for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy "TGG media vault owner insert" on public.tgg_media_vault_items for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy "TGG media vault owner update" on public.tgg_media_vault_items for update to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy "TGG media vault owner delete" on public.tgg_media_vault_items for delete to authenticated using ((select auth.uid()) = owner_user_id);

create table if not exists public.tgg_media_vault_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.tgg_media_vault_items(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created','moved','renamed','verified','approved','superseded','linked','note_added')),
  from_status text,
  to_status text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tgg_media_vault_events_item_idx on public.tgg_media_vault_events(item_id, created_at desc);

alter table public.tgg_media_vault_events enable row level security;
revoke all on table public.tgg_media_vault_events from anon, authenticated;
grant select, insert on table public.tgg_media_vault_events to authenticated;

drop policy if exists "TGG media vault events owner select" on public.tgg_media_vault_events;
drop policy if exists "TGG media vault events owner insert" on public.tgg_media_vault_events;
create policy "TGG media vault events owner select" on public.tgg_media_vault_events for select to authenticated using (exists (select 1 from public.tgg_media_vault_items i where i.id = item_id and i.owner_user_id = (select auth.uid())));
create policy "TGG media vault events owner insert" on public.tgg_media_vault_events for insert to authenticated with check ((select auth.uid()) = actor_user_id and exists (select 1 from public.tgg_media_vault_items i where i.id = item_id and i.owner_user_id = (select auth.uid())));


-- ============================================================
-- MIGRATION 20260913151448 tgg_media_vault_intake_pipeline_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_media_vault_sources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_drive','google_photos','dropbox','supabase_storage','local_upload','other')),
  name text not null,
  status text not null default 'pending_connection' check (status in ('pending_connection','connected','paused','error','disconnected')),
  external_account_ref text,
  external_root_ref text,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_media_vault_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.tgg_media_vault_sources(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','cancelled')),
  cursor_ref text,
  started_at timestamptz,
  completed_at timestamptz,
  scanned_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tgg_media_vault_sources_owner on public.tgg_media_vault_sources(owner_user_id);
create index if not exists idx_tgg_media_vault_sources_provider_status on public.tgg_media_vault_sources(provider,status);
create index if not exists idx_tgg_media_vault_sync_jobs_owner on public.tgg_media_vault_sync_jobs(owner_user_id);
create index if not exists idx_tgg_media_vault_sync_jobs_source on public.tgg_media_vault_sync_jobs(source_id,created_at desc);

alter table public.tgg_media_vault_sources enable row level security;
alter table public.tgg_media_vault_sync_jobs enable row level security;

drop policy if exists tgg_media_vault_sources_owner_select on public.tgg_media_vault_sources;
drop policy if exists tgg_media_vault_sources_owner_insert on public.tgg_media_vault_sources;
drop policy if exists tgg_media_vault_sources_owner_update on public.tgg_media_vault_sources;
drop policy if exists tgg_media_vault_sources_owner_delete on public.tgg_media_vault_sources;
create policy tgg_media_vault_sources_owner_select on public.tgg_media_vault_sources for select to authenticated using (owner_user_id = auth.uid());
create policy tgg_media_vault_sources_owner_insert on public.tgg_media_vault_sources for insert to authenticated with check (owner_user_id = auth.uid());
create policy tgg_media_vault_sources_owner_update on public.tgg_media_vault_sources for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy tgg_media_vault_sources_owner_delete on public.tgg_media_vault_sources for delete to authenticated using (owner_user_id = auth.uid());

drop policy if exists tgg_media_vault_sync_jobs_owner_select on public.tgg_media_vault_sync_jobs;
drop policy if exists tgg_media_vault_sync_jobs_owner_insert on public.tgg_media_vault_sync_jobs;
drop policy if exists tgg_media_vault_sync_jobs_owner_update on public.tgg_media_vault_sync_jobs;
create policy tgg_media_vault_sync_jobs_owner_select on public.tgg_media_vault_sync_jobs for select to authenticated using (owner_user_id = auth.uid());
create policy tgg_media_vault_sync_jobs_owner_insert on public.tgg_media_vault_sync_jobs for insert to authenticated with check (owner_user_id = auth.uid());
create policy tgg_media_vault_sync_jobs_owner_update on public.tgg_media_vault_sync_jobs for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

grant select, insert, update, delete on public.tgg_media_vault_sources to authenticated;
grant select, insert, update on public.tgg_media_vault_sync_jobs to authenticated;


-- ============================================================
-- MIGRATION 20260913151552 tgg_media_vault_classification_versioning_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.tgg_media_vault_items add column if not exists source_item_ref text;
alter table public.tgg_media_vault_items add column if not exists mime_type text;
alter table public.tgg_media_vault_items add column if not exists classification text;
alter table public.tgg_media_vault_items add column if not exists parent_item_id uuid references public.tgg_media_vault_items(id) on delete set null;
alter table public.tgg_media_vault_items add column if not exists supersedes_item_id uuid references public.tgg_media_vault_items(id) on delete set null;
alter table public.tgg_media_vault_items add column if not exists is_current boolean not null default true;
alter table public.tgg_media_vault_items add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_tgg_media_vault_items_source_ref on public.tgg_media_vault_items(source_provider,source_item_ref);
create index if not exists idx_tgg_media_vault_items_checksum on public.tgg_media_vault_items(owner_user_id,checksum);
create index if not exists idx_tgg_media_vault_items_current on public.tgg_media_vault_items(owner_user_id,is_current,classification);

create or replace function public.tgg_media_vault_classify_file(p_file_name text, p_mime_type text default null)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_mime_type,'')) like 'audio/%' or lower(p_file_name) ~ '\.(mp3|wav|m4a|aac|flac|ogg)$' then 'audio'
    when lower(coalesce(p_mime_type,'')) like 'video/%' or lower(p_file_name) ~ '\.(mp4|mov|webm|m4v|avi|mkv)$' then 'video'
    when lower(coalesce(p_mime_type,'')) like 'image/%' or lower(p_file_name) ~ '\.(jpg|jpeg|png|gif|webp|svg|heic)$' then 'image'
    when lower(p_file_name) ~ '\.(xml)$' then 'xml'
    when lower(p_file_name) ~ '\.(html|htm|css|js)$' then 'code'
    when lower(p_file_name) ~ '\.(zip|tar|gz|7z|rar)$' then 'archive'
    when lower(p_file_name) ~ '\.(pdf|doc|docx|txt|rtf|md)$' then 'document'
    when lower(p_file_name) ~ '(screenshot|screen[_ -]?shot|capture)' then 'screenshot'
    when lower(p_file_name) ~ '(evidence|qa|verification|audit|certification)' then 'evidence'
    else 'other'
  end;
$$;

grant execute on function public.tgg_media_vault_classify_file(text,text) to authenticated;


-- ============================================================
-- MIGRATION 20260913151603 tgg_media_vault_classification_priority_fix_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_media_vault_classify_file(p_file_name text, p_mime_type text default null)
returns text
language sql
immutable
as $$
  select case
    when lower(p_file_name) ~ '(screenshot|screen[_ -]?shot|capture)' then 'screenshot'
    when lower(p_file_name) ~ '(evidence|qa|verification|audit|certification)' then 'evidence'
    when lower(coalesce(p_mime_type,'')) like 'audio/%' or lower(p_file_name) ~ '\.(mp3|wav|m4a|aac|flac|ogg)$' then 'audio'
    when lower(coalesce(p_mime_type,'')) like 'video/%' or lower(p_file_name) ~ '\.(mp4|mov|webm|m4v|avi|mkv)$' then 'video'
    when lower(coalesce(p_mime_type,'')) like 'image/%' or lower(p_file_name) ~ '\.(jpg|jpeg|png|gif|webp|svg|heic)$' then 'image'
    when lower(p_file_name) ~ '\.(xml)$' then 'xml'
    when lower(p_file_name) ~ '\.(html|htm|css|js)$' then 'code'
    when lower(p_file_name) ~ '\.(zip|tar|gz|7z|rar)$' then 'archive'
    when lower(p_file_name) ~ '\.(pdf|doc|docx|txt|rtf|md)$' then 'document'
    else 'other'
  end;
$$;

-- ============================================================
-- MIGRATION 20260913151616 tgg_media_vault_classification_xml_priority_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_media_vault_classify_file(p_file_name text, p_mime_type text default null)
returns text
language sql
immutable
as $$
  select case
    when lower(p_file_name) ~ '(screenshot|screen[_ -]?shot|capture)' then 'screenshot'
    when lower(p_file_name) ~ '\.xml$' then 'xml'
    when lower(p_file_name) ~ '(evidence|qa|verification|audit|certification)' then 'evidence'
    when lower(coalesce(p_mime_type,'')) like 'audio/%' or lower(p_file_name) ~ '\.(mp3|wav|m4a|aac|flac|ogg)$' then 'audio'
    when lower(coalesce(p_mime_type,'')) like 'video/%' or lower(p_file_name) ~ '\.(mp4|mov|webm|m4v|avi|mkv)$' then 'video'
    when lower(coalesce(p_mime_type,'')) like 'image/%' or lower(p_file_name) ~ '\.(jpg|jpeg|png|gif|webp|svg|heic)$' then 'image'
    when lower(p_file_name) ~ '\.(html|htm|css|js)$' then 'code'
    when lower(p_file_name) ~ '\.(zip|tar|gz|7z|rar)$' then 'archive'
    when lower(p_file_name) ~ '\.(pdf|doc|docx|txt|rtf|md)$' then 'document'
    else 'other'
  end;
$$;

-- ============================================================
-- MIGRATION 20260913151751 tgg_media_vault_reconciliation_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_media_vault_reconcile_item(p_item_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_item public.tgg_media_vault_items%rowtype;
  v_duplicate_id uuid;
  v_action text := 'current';
begin
  select * into v_item from public.tgg_media_vault_items where id=p_item_id and owner_user_id=auth.uid();
  if not found then return jsonb_build_object('ok',false,'reason','not_found_or_not_owner'); end if;

  if v_item.checksum is not null then
    select id into v_duplicate_id
    from public.tgg_media_vault_items
    where owner_user_id=v_item.owner_user_id
      and id<>v_item.id
      and checksum=v_item.checksum
    order by created_at desc limit 1;
  end if;

  if v_duplicate_id is not null then
    update public.tgg_media_vault_items set is_current=false, supersedes_item_id=v_duplicate_id, status=case when status='active' then 'duplicate' else status end, updated_at=now() where id=v_item.id;
    insert into public.tgg_media_vault_events(item_id,actor_user_id,event_type,from_status,to_status,details)
    values(v_item.id,auth.uid(),'duplicate_detected',v_item.status,'duplicate',jsonb_build_object('matched_item_id',v_duplicate_id,'checksum',v_item.checksum));
    return jsonb_build_object('ok',true,'action','duplicate','matched_item_id',v_duplicate_id);
  end if;

  update public.tgg_media_vault_items
  set classification=coalesce(classification,public.tgg_media_vault_classify_file(file_name,mime_type)),
      is_current=true,
      updated_at=now()
  where id=v_item.id;

  insert into public.tgg_media_vault_events(item_id,actor_user_id,event_type,from_status,to_status,details)
  values(v_item.id,auth.uid(),'classified',v_item.status,v_item.status,jsonb_build_object('classification',coalesce(v_item.classification,public.tgg_media_vault_classify_file(v_item.file_name,v_item.mime_type))));

  return jsonb_build_object('ok',true,'action','current','classification',coalesce(v_item.classification,public.tgg_media_vault_classify_file(v_item.file_name,v_item.mime_type)));
end;
$$;

grant execute on function public.tgg_media_vault_reconcile_item(uuid) to authenticated;


-- ============================================================
-- MIGRATION 20260913151759 tgg_media_vault_reconciliation_reports_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.tgg_media_vault_reconciliation_report as
select
  i.owner_user_id,
  i.classification,
  i.status,
  i.verification_status,
  count(*) as item_count,
  count(*) filter (where i.is_current) as current_count,
  count(*) filter (where not i.is_current) as superseded_count,
  count(*) filter (where i.checksum is null) as missing_checksum_count,
  count(*) filter (where i.verification_status is distinct from 'verified') as unverified_count
from public.tgg_media_vault_items i
group by i.owner_user_id,i.classification,i.status,i.verification_status;

create or replace view public.tgg_media_vault_source_health as
select
  s.id,
  s.owner_user_id,
  s.provider,
  s.name,
  s.status,
  s.last_sync_at,
  s.last_sync_status,
  s.last_sync_error,
  coalesce(j.total_jobs,0) as total_jobs,
  coalesce(j.failed_jobs,0) as failed_jobs,
  coalesce(j.last_job_at,null) as last_job_at
from public.tgg_media_vault_sources s
left join lateral (
  select count(*) total_jobs,
         count(*) filter(where status='failed') failed_jobs,
         max(created_at) last_job_at
  from public.tgg_media_vault_sync_jobs x where x.source_id=s.id and x.owner_user_id=s.owner_user_id
) j on true;

grant select on public.tgg_media_vault_reconciliation_report to authenticated;
grant select on public.tgg_media_vault_source_health to authenticated;


-- ============================================================
-- MIGRATION 20260913151914 tgg_media_vault_links_only_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_media_vault_links (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, item_id uuid not null references public.tgg_media_vault_items(id) on delete cascade, link_type text not null check (link_type in ('production_build','evidence','release','runtime_flow','dashboard','blogger_page','supabase_asset','source_reference')), target_ref text not null, target_label text, is_primary boolean not null default false, created_at timestamptz not null default now(), unique(item_id,link_type,target_ref)); create index if not exists idx_tgg_media_vault_links_owner on public.tgg_media_vault_links(owner_user_id); create index if not exists idx_tgg_media_vault_links_item on public.tgg_media_vault_links(item_id); alter table public.tgg_media_vault_links enable row level security; create policy tgg_media_vault_links_owner_select on public.tgg_media_vault_links for select to authenticated using (owner_user_id=auth.uid()); create policy tgg_media_vault_links_owner_insert on public.tgg_media_vault_links for insert to authenticated with check (owner_user_id=auth.uid()); create policy tgg_media_vault_links_owner_update on public.tgg_media_vault_links for update to authenticated using (owner_user_id=auth.uid()) with check (owner_user_id=auth.uid()); create policy tgg_media_vault_links_owner_delete on public.tgg_media_vault_links for delete to authenticated using (owner_user_id=auth.uid()); grant select,insert,update,delete on public.tgg_media_vault_links to authenticated;

-- ============================================================
-- MIGRATION 20260913151922 tgg_media_vault_readiness_view_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.tgg_media_vault_production_readiness as select i.owner_user_id, count(*) as total_items, count(*) filter(where i.is_current) as current_items, count(*) filter(where i.verification_status='verified') as verified_items, count(*) filter(where i.checksum is not null) as checksummed_items, count(*) filter(where exists(select 1 from public.tgg_media_vault_links l where l.item_id=i.id and l.link_type='production_build')) as build_linked_items, count(*) filter(where exists(select 1 from public.tgg_media_vault_links l where l.item_id=i.id and l.link_type='evidence')) as evidence_linked_items, count(*) filter(where i.is_current and i.verification_status='verified' and i.checksum is not null) as production_candidate_items from public.tgg_media_vault_items i group by i.owner_user_id; grant select on public.tgg_media_vault_production_readiness to authenticated;

-- ============================================================
-- MIGRATION 20260913152218 tgg_media_vault_provider_manifest_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_media_vault_provider_manifest (id uuid primary key default gen_random_uuid(), provider text not null check (provider in ('google_drive','google_photos','dropbox','supabase_storage','local_upload','other')), provider_label text not null, connection_status text not null default 'unavailable' check (connection_status in ('unavailable','pending','connected','error')), capabilities jsonb not null default '{}'::jsonb, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(provider)); alter table public.tgg_media_vault_provider_manifest enable row level security; create policy tgg_media_vault_provider_manifest_authenticated_select on public.tgg_media_vault_provider_manifest for select to authenticated using (true); grant select on public.tgg_media_vault_provider_manifest to authenticated;

-- ============================================================
-- MIGRATION 20260913155911 harden_media_vault_security_invoker_and_search_path
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter view public.tgg_media_vault_reconciliation_report set (security_invoker = true);
alter view public.tgg_media_vault_source_health set (security_invoker = true);
alter view public.tgg_media_vault_production_readiness set (security_invoker = true);

alter function public.tgg_media_vault_classify_file(text,text) set search_path = pg_catalog, public;
alter function public.tgg_media_vault_reconcile_item(uuid) set search_path = pg_catalog, public;

-- ============================================================
-- MIGRATION 20260913194954 add_render_job_request_key_idempotency
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create unique index if not exists uq_tgg_render_jobs_active_request_key on public.tgg_video_studio_render_jobs (project_id, user_id, ((request_payload->>'render_request_key'))) where status in ('queued','processing') and (request_payload->>'render_request_key') is not null;

-- ============================================================
-- MIGRATION 20260913203536 add_tgg_broadcast_media_health_control
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_broadcast_media_health (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  owner_user_id uuid not null,
  control_state text not null default 'CONTROL_READY',
  sfu_state text not null default 'NOT_CONFIGURED',
  turn_state text not null default 'NOT_CONFIGURED',
  ice_state text not null default 'NEW',
  publisher_state text not null default 'DISCONNECTED',
  viewer_state text not null default 'NO_VIEWERS',
  stream_state text not null default 'OFFLINE',
  large_audience_state text not null default 'LOCKED',
  reconnect_count integer not null default 0,
  last_rtt_ms numeric,
  last_packet_loss_pct numeric,
  last_jitter_ms numeric,
  last_bitrate_kbps numeric,
  last_telemetry_at timestamptz,
  provider text,
  provider_session_id text,
  provider_playback_id text,
  provider_ingest_id text,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(stream_id)
);

create index if not exists idx_tgg_broadcast_media_health_owner on public.tgg_broadcast_media_health(owner_user_id);
create index if not exists idx_tgg_broadcast_media_health_state on public.tgg_broadcast_media_health(large_audience_state,stream_state);
create index if not exists idx_tgg_broadcast_media_health_updated on public.tgg_broadcast_media_health(updated_at desc);

alter table public.tgg_broadcast_media_health enable row level security;

create policy "tgg broadcast media health owner read" on public.tgg_broadcast_media_health
for select to authenticated using (owner_user_id = auth.uid());

create policy "tgg broadcast media health owner insert" on public.tgg_broadcast_media_health
for insert to authenticated with check (owner_user_id = auth.uid());

create policy "tgg broadcast media health owner update" on public.tgg_broadcast_media_health
for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create or replace function public.tgg_broadcast_media_health_touch()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tgg_broadcast_media_health_touch on public.tgg_broadcast_media_health;
create trigger trg_tgg_broadcast_media_health_touch
before update on public.tgg_broadcast_media_health
for each row execute function public.tgg_broadcast_media_health_touch();

-- ============================================================
-- MIGRATION 20260913203629 add_broadcast_media_health_gate
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_broadcast_media_health_gate(p_stream_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare h public.tgg_broadcast_media_health%rowtype;
begin
 select * into h from public.tgg_broadcast_media_health where stream_id=p_stream_id;
 if not found then
  return jsonb_build_object('ready',false,'state','NO_HEALTH_RECORD','stream_id',p_stream_id);
 end if;
 return jsonb_build_object(
  'ready', h.control_state='CONTROL_READY'
    and h.sfu_state='CONNECTED'
    and h.turn_state='AVAILABLE'
    and h.ice_state='CONNECTED'
    and h.publisher_state='SENDING'
    and h.viewer_state='RECEIVING'
    and h.stream_state='HEALTHY',
  'state', case when h.control_state='CONTROL_READY' and h.sfu_state='CONNECTED' and h.turn_state='AVAILABLE' and h.ice_state='CONNECTED' and h.publisher_state='SENDING' and h.viewer_state='RECEIVING' and h.stream_state='HEALTHY' then 'LARGE_AUDIENCE_READY' else 'MEDIA_NOT_READY' end,
  'stream_id',h.stream_id,
  'control_state',h.control_state,'sfu_state',h.sfu_state,'turn_state',h.turn_state,'ice_state',h.ice_state,
  'publisher_state',h.publisher_state,'viewer_state',h.viewer_state,'stream_state',h.stream_state,
  'large_audience_state',h.large_audience_state,
  'last_telemetry_at',h.last_telemetry_at
 );
end;
$$;

revoke all on function public.tgg_broadcast_media_health_gate(uuid) from public;
grant execute on function public.tgg_broadcast_media_health_gate(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260913203655 add_broadcast_media_health_transition
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_broadcast_media_health_transition(p_stream_id uuid,p_control_state text default null,p_sfu_state text default null,p_turn_state text default null,p_ice_state text default null,p_publisher_state text default null,p_viewer_state text default null,p_stream_state text default null,p_reconnect_count integer default null,p_rtt_ms numeric default null,p_packet_loss_pct numeric default null,p_jitter_ms numeric default null,p_bitrate_kbps numeric default null,p_provider text default null,p_provider_session_id text default null,p_provider_playback_id text default null,p_provider_ingest_id text default null,p_failure_code text default null,p_failure_message text default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare h public.tgg_broadcast_media_health%rowtype; ready boolean;
begin
 select * into h from public.tgg_broadcast_media_health where stream_id=p_stream_id for update;
 if not found then return jsonb_build_object('ok',false,'state','NO_HEALTH_RECORD'); end if;
 update public.tgg_broadcast_media_health set
 control_state=coalesce(p_control_state,control_state),sfu_state=coalesce(p_sfu_state,sfu_state),turn_state=coalesce(p_turn_state,turn_state),ice_state=coalesce(p_ice_state,ice_state),publisher_state=coalesce(p_publisher_state,publisher_state),viewer_state=coalesce(p_viewer_state,viewer_state),stream_state=coalesce(p_stream_state,stream_state),reconnect_count=coalesce(p_reconnect_count,reconnect_count),last_rtt_ms=coalesce(p_rtt_ms,last_rtt_ms),last_packet_loss_pct=coalesce(p_packet_loss_pct,last_packet_loss_pct),last_jitter_ms=coalesce(p_jitter_ms,last_jitter_ms),last_bitrate_kbps=coalesce(p_bitrate_kbps,last_bitrate_kbps),last_telemetry_at=case when p_rtt_ms is not null or p_packet_loss_pct is not null or p_jitter_ms is not null or p_bitrate_kbps is not null then now() else last_telemetry_at end,provider=coalesce(p_provider,provider),provider_session_id=coalesce(p_provider_session_id,provider_session_id),provider_playback_id=coalesce(p_provider_playback_id,provider_playback_id),provider_ingest_id=coalesce(p_provider_ingest_id,provider_ingest_id),failure_code=p_failure_code,failure_message=p_failure_message,metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb)
 where stream_id=p_stream_id returning * into h;
 ready=h.control_state='CONTROL_READY' and h.sfu_state='CONNECTED' and h.turn_state='AVAILABLE' and h.ice_state='CONNECTED' and h.publisher_state='SENDING' and h.viewer_state='RECEIVING' and h.stream_state='HEALTHY';
 update public.tgg_broadcast_media_health set large_audience_state=case when ready then 'READY' else 'LOCKED' end where stream_id=p_stream_id;
 return jsonb_build_object('ok',true,'state',case when ready then 'LARGE_AUDIENCE_READY' else 'MEDIA_NOT_READY' end,'large_audience_state',case when ready then 'READY' else 'LOCKED' end,'stream_id',p_stream_id);
end; $$;
revoke all on function public.tgg_broadcast_media_health_transition(uuid,text,text,text,text,text,text,text,integer,numeric,numeric,numeric,numeric,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.tgg_broadcast_media_health_transition(uuid,text,text,text,text,text,text,text,integer,numeric,numeric,numeric,numeric,text,text,text,text,text,text,jsonb) to authenticated;

-- ============================================================
-- MIGRATION 20260913204936 wire_broadcast_health_into_live_lifecycle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_studio_create(p_title text, p_description text default null, p_category text default 'studio', p_broadcast_mode text default 'camera_screen', p_audience text default 'everyone', p_recording_enabled boolean default true, p_camera_enabled boolean default true, p_screen_enabled boolean default true, p_mic_enabled boolean default true, p_system_audio_enabled boolean default true, p_chat_enabled boolean default true, p_reactions_enabled boolean default true, p_pip_position text default 'bottom_right') returns jsonb language plpgsql set search_path='public','pg_catalog' as $$ declare v_uid uuid:=auth.uid(); v_content_id uuid; v_stream_id uuid; v_visibility text; v_title text:=btrim(coalesce(p_title,'')); begin if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if; if char_length(v_title)<2 or char_length(v_title)>160 then raise exception 'TITLE_INVALID'; end if; if p_broadcast_mode not in ('camera_screen','screen_only','camera_only','studio_process') then raise exception 'BROADCAST_MODE_INVALID'; end if; if p_audience not in ('everyone','followers','supporters','private') then raise exception 'AUDIENCE_INVALID'; end if; if p_pip_position not in ('top_left','top_right','bottom_left','bottom_right') then raise exception 'PIP_POSITION_INVALID'; end if; v_visibility:=case when p_audience='everyone' then 'PUBLIC' else 'PRIVATE' end; insert into public.content_items(creator_id,content_type,status,visibility,published_at) values(v_uid,'LIVE','PUBLISHED',v_visibility,now()) returning id into v_content_id; insert into public.live_streams(content_id,creator_id,title,description,category,status,recording_enabled,broadcast_mode,audience,camera_enabled,screen_enabled,mic_enabled,system_audio_enabled,chat_enabled,reactions_enabled,pip_position,replay_status) values(v_content_id,v_uid,v_title,nullif(btrim(coalesce(p_description,'')),''),nullif(btrim(coalesce(p_category,'')),'studio'),'SCHEDULED',coalesce(p_recording_enabled,true),p_broadcast_mode,p_audience,coalesce(p_camera_enabled,true),coalesce(p_screen_enabled,true),coalesce(p_mic_enabled,true),coalesce(p_system_audio_enabled,true),coalesce(p_chat_enabled,true),coalesce(p_reactions_enabled,true),p_pip_position,case when coalesce(p_recording_enabled,true) then 'recording' else 'none' end) returning id into v_stream_id; insert into public.tgg_broadcast_media_health(stream_id,owner_user_id,control_state,sfu_state,turn_state,ice_state,publisher_state,viewer_state,stream_state,large_audience_state,metadata) values(v_stream_id,v_uid,'CONTROL_READY','NOT_CONFIGURED','NOT_CONFIGURED','NEW','DISCONNECTED','NO_VIEWERS','OFFLINE','LOCKED',jsonb_build_object('lifecycle','studio_create','provider_contract','livekit_compatible_sfu_turn')); return jsonb_build_object('ok',true,'stream_id',v_stream_id,'content_id',v_content_id,'status','SCHEDULED','broadcast_mode',p_broadcast_mode,'audience',p_audience,'media_health_initialized',true); end; $$;

create or replace function public.tgg_live_start(p_stream_id uuid) returns public.live_streams language plpgsql set search_path='' as $$ declare v_row public.live_streams; begin select * into v_row from private.tgg_live_start(p_stream_id); update public.tgg_broadcast_media_health set control_state='CONTROL_READY',stream_state='LIVE',failure_code=null,failure_message=null where stream_id=p_stream_id and owner_user_id=auth.uid(); return v_row; end; $$;

create or replace function public.tgg_live_end(p_stream_id uuid) returns public.live_streams language plpgsql set search_path='' as $$ declare v_row public.live_streams; begin select * into v_row from private.tgg_live_end(p_stream_id); update public.tgg_broadcast_media_health set stream_state='STOPPED',publisher_state='DISCONNECTED',viewer_state='NO_VIEWERS',large_audience_state='LOCKED' where stream_id=p_stream_id and owner_user_id=auth.uid(); return v_row; end; $$;

-- ============================================================
-- MIGRATION 20260913205049 add_broadcast_recording_replay_gate
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_broadcast_recording_replay_gate(p_stream_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare s public.live_streams%rowtype; h public.tgg_broadcast_media_health%rowtype; recording_ok boolean; replay_ok boolean;
begin
 select * into s from public.live_streams where id=p_stream_id;
 if not found then return jsonb_build_object('ready',false,'state','NO_STREAM'); end if;
 select * into h from public.tgg_broadcast_media_health where stream_id=p_stream_id;
 recording_ok=coalesce(s.recording_enabled,false) and s.status in ('ENDED','COMPLETED','RECORDED') and nullif(s.recording_path,'') is not null;
 replay_ok=recording_ok and coalesce(s.replay_status,'') in ('ready','READY','published','PUBLISHED','completed','COMPLETED');
 return jsonb_build_object('stream_id',p_stream_id,'recording_ready',recording_ok,'replay_ready',replay_ok,'recording_enabled',coalesce(s.recording_enabled,false),'recording_path_present',nullif(s.recording_path,'') is not null,'stream_status',s.status,'replay_status',s.replay_status,'media_health_state',coalesce(h.stream_state,'NO_HEALTH_RECORD'),'large_audience_state',coalesce(h.large_audience_state,'LOCKED'));
end; $$;
revoke all on function public.tgg_broadcast_recording_replay_gate(uuid) from public;
grant execute on function public.tgg_broadcast_recording_replay_gate(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260913205524 add_broadcast_provider_adapter_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_broadcast_provider_contract(p_stream_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare h public.tgg_broadcast_media_health%rowtype; cfg record;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into h from public.tgg_broadcast_media_health where stream_id=p_stream_id and owner_user_id=auth.uid();
 if not found then return jsonb_build_object('ok',false,'state','NO_HEALTH_RECORD'); end if;
 select enabled,mode,endpoint_configured into cfg from public.tgg_provider_runtime_config where provider_key='broadcast.sfu_turn';
 return jsonb_build_object(
  'ok',true,
  'provider','livekit_compatible_sfu_turn',
  'adapter_version','TGG-BROADCAST-ADAPTER-1',
  'stream_id',h.stream_id,
  'configured',coalesce(cfg.enabled,false) and coalesce(cfg.mode,'')='production' and coalesce(cfg.endpoint_configured,false),
  'sfu_state',h.sfu_state,
  'turn_state',h.turn_state,
  'ice_state',h.ice_state,
  'publisher_state',h.publisher_state,
  'viewer_state',h.viewer_state,
  'stream_state',h.stream_state,
  'large_audience_state',h.large_audience_state,
  'required_events',jsonb_build_array('provider_connected','turn_available','ice_connected','publisher_sending','viewer_receiving','stream_healthy'),
  'telemetry_fields',jsonb_build_array('rtt_ms','packet_loss_pct','jitter_ms','bitrate_kbps'),
  'secrets_exposed',false
 );
end; $$;
revoke all on function public.tgg_broadcast_provider_contract(uuid) from public;
grant execute on function public.tgg_broadcast_provider_contract(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260913205620 add_broadcast_telemetry_event_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_broadcast_media_events (id uuid primary key default gen_random_uuid(),stream_id uuid not null references public.live_streams(id) on delete cascade,owner_user_id uuid not null,event_type text not null,event_id text not null,payload jsonb not null default '{}'::jsonb,received_at timestamptz not null default now(),created_at timestamptz not null default now(),unique(stream_id,event_id));
create index if not exists idx_tgg_broadcast_media_events_stream_time on public.tgg_broadcast_media_events(stream_id,received_at desc);
alter table public.tgg_broadcast_media_events enable row level security;
drop policy if exists tgg_broadcast_media_events_select_owner on public.tgg_broadcast_media_events;
create policy tgg_broadcast_media_events_select_owner on public.tgg_broadcast_media_events for select to authenticated using(owner_user_id=auth.uid());
create or replace function public.tgg_broadcast_media_event(p_stream_id uuid,p_event_type text,p_event_id text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_owner uuid; v_inserted boolean:=false;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select creator_id into v_owner from public.live_streams where id=p_stream_id;
 if v_owner is null then return jsonb_build_object('ok',false,'state','STREAM_NOT_FOUND'); end if;
 if v_owner<>v_uid then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if nullif(btrim(coalesce(p_event_type,'')),'') is null or nullif(btrim(coalesce(p_event_id,'')),'') is null then raise exception 'EVENT_ID_REQUIRED' using errcode='22023'; end if;
 insert into public.tgg_broadcast_media_events(stream_id,owner_user_id,event_type,event_id,payload) values(p_stream_id,v_uid,btrim(p_event_type),btrim(p_event_id),coalesce(p_payload,'{}'::jsonb)) on conflict(stream_id,event_id) do nothing;
 get diagnostics v_inserted = row_count;
 return jsonb_build_object('ok',true,'accepted',v_inserted,'event_type',btrim(p_event_type),'event_id',btrim(p_event_id),'stream_id',p_stream_id);
end; $$;
revoke all on function public.tgg_broadcast_media_event(uuid,text,text,jsonb) from public;
grant execute on function public.tgg_broadcast_media_event(uuid,text,text,jsonb) to authenticated;

-- ============================================================
-- MIGRATION 20260913205750 add_broadcast_media_state_matrix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_broadcast_media_apply_event(p_stream_id uuid,p_event_type text,p_event_id text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare h public.tgg_broadcast_media_health%rowtype; v_uid uuid:=auth.uid(); v_exists boolean; v_result jsonb;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select exists(select 1 from public.live_streams where id=p_stream_id and creator_id=v_uid) into v_exists;
 if not v_exists then raise exception 'STREAM_ACCESS_DENIED' using errcode='42501'; end if;
 select * into h from public.tgg_broadcast_media_health where stream_id=p_stream_id for update;
 if not found then raise exception 'MEDIA_HEALTH_NOT_INITIALIZED' using errcode='22023'; end if;
 if nullif(btrim(coalesce(p_event_id,'')),'') is null then raise exception 'EVENT_ID_REQUIRED' using errcode='22023'; end if;
 if exists(select 1 from public.tgg_broadcast_media_events where stream_id=p_stream_id and event_id=p_event_id) then return jsonb_build_object('ok',true,'duplicate',true,'state',h.stream_state,'large_audience_state',h.large_audience_state); end if;
 insert into public.tgg_broadcast_media_events(stream_id,owner_user_id,event_id,event_type,payload) values(p_stream_id,v_uid,p_event_id,p_event_type,coalesce(p_payload,'{}'::jsonb));
 case p_event_type
 when 'SFU_CONNECTED' then update public.tgg_broadcast_media_health set sfu_state='CONNECTED',failure_code=null,failure_message=null where stream_id=p_stream_id;
 when 'TURN_AVAILABLE' then update public.tgg_broadcast_media_health set turn_state='AVAILABLE' where stream_id=p_stream_id;
 when 'ICE_CONNECTED' then update public.tgg_broadcast_media_health set ice_state='CONNECTED' where stream_id=p_stream_id;
 when 'ICE_FAILED' then update public.tgg_broadcast_media_health set ice_state='FAILED',stream_state='DEGRADED',failure_code='ICE_FAILED',failure_message=coalesce(p_payload->>'message','ICE connection failed') where stream_id=p_stream_id;
 when 'PUBLISHER_CONNECTED' then update public.tgg_broadcast_media_health set publisher_state='SENDING' where stream_id=p_stream_id;
 when 'PUBLISHER_DISCONNECTED' then update public.tgg_broadcast_media_health set publisher_state='DISCONNECTED',stream_state='DEGRADED',large_audience_state='LOCKED' where stream_id=p_stream_id;
 when 'VIEWER_RECEIVING' then update public.tgg_broadcast_media_health set viewer_state='RECEIVING' where stream_id=p_stream_id;
 when 'VIEWER_STALLED' then update public.tgg_broadcast_media_health set viewer_state='STALLED',stream_state='DEGRADED',large_audience_state='LOCKED' where stream_id=p_stream_id;
 when 'RECONNECT_STARTED' then update public.tgg_broadcast_media_health set reconnect_count=reconnect_count+1,stream_state='DEGRADED',large_audience_state='LOCKED' where stream_id=p_stream_id;
 when 'RECONNECT_COMPLETE' then update public.tgg_broadcast_media_health set failure_code=null,failure_message=null where stream_id=p_stream_id;
 when 'STREAM_DEGRADED' then update public.tgg_broadcast_media_health set stream_state='DEGRADED',large_audience_state='LOCKED',failure_code=coalesce(p_payload->>'code',failure_code),failure_message=coalesce(p_payload->>'message',failure_message) where stream_id=p_stream_id;
 when 'STREAM_HEALTHY' then update public.tgg_broadcast_media_health set stream_state='HEALTHY',failure_code=null,failure_message=null where stream_id=p_stream_id;
 else null;
 end case;
 select * into h from public.tgg_broadcast_media_health where stream_id=p_stream_id;
 update public.tgg_broadcast_media_health set large_audience_state=case when h.control_state='CONTROL_READY' and h.sfu_state='CONNECTED' and h.turn_state='AVAILABLE' and h.ice_state='CONNECTED' and h.publisher_state='SENDING' and h.viewer_state='RECEIVING' and h.stream_state='HEALTHY' then 'READY' else 'LOCKED' end where stream_id=p_stream_id;
 select * into h from public.tgg_broadcast_media_health where stream_id=p_stream_id;
 return jsonb_build_object('ok',true,'duplicate',false,'event_type',p_event_type,'stream_id',p_stream_id,'stream_state',h.stream_state,'large_audience_state',h.large_audience_state,'reconnect_count',h.reconnect_count);
end; $$;
revoke all on function public.tgg_broadcast_media_apply_event(uuid,text,text,jsonb) from public;
grant execute on function public.tgg_broadcast_media_apply_event(uuid,text,text,jsonb) to authenticated;

-- ============================================================
-- MIGRATION 20260913205904 add_live_recording_replay_transition
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_recording_replay_transition(p_stream_id uuid,p_recording_path text default null,p_replay_storage_path text default null,p_duration_seconds numeric default null,p_aspect_ratio text default null,p_source_modes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare s public.live_streams%rowtype; r public.tgg_live_replays%rowtype; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 select * into s from public.live_streams where id=p_stream_id and creator_id=uid;
 if not found then raise exception 'STREAM_ACCESS_DENIED' using errcode='42501'; end if;
 if s.status not in ('ENDED','COMPLETED','RECORDED') and s.actual_end is null then raise exception 'STREAM_NOT_ENDED' using errcode='22023'; end if;
 if p_recording_path is not null then
  if not coalesce(s.recording_enabled,false) then raise exception 'RECORDING_DISABLED' using errcode='22023'; end if;
  update public.live_streams set recording_path=p_recording_path,replay_status='recorded',replay_duration_seconds=coalesce(p_duration_seconds,replay_duration_seconds),updated_at=now() where id=p_stream_id;
 end if;
 if p_replay_storage_path is null or btrim(p_replay_storage_path)='' then
  return jsonb_build_object('ok',true,'recording_ready',p_recording_path is not null,'replay_ready',false,'reason','REPLAY_STORAGE_REQUIRED');
 end if;
 insert into public.tgg_live_replays(stream_id,creator_id,storage_path,title,duration_seconds,aspect_ratio,status,edit_status,source_modes)
 values(p_stream_id,uid,p_replay_storage_path,s.title,coalesce(p_duration_seconds,s.replay_duration_seconds),coalesce(p_aspect_ratio,'16:9'),'READY','SOURCE_READY',coalesce(p_source_modes,'{}'::jsonb))
 on conflict do nothing;
 select * into r from public.tgg_live_replays where stream_id=p_stream_id and creator_id=uid order by created_at desc limit 1;
 update public.live_streams set replay_status='ready',replay_duration_seconds=coalesce(r.duration_seconds,replay_duration_seconds),updated_at=now() where id=p_stream_id;
 return jsonb_build_object('ok',true,'recording_ready',coalesce(s.recording_path,p_recording_path) is not null,'replay_ready',r.id is not null,'replay_id',r.id,'storage_path',r.storage_path);
end; $$;
revoke all on function public.tgg_live_recording_replay_transition(uuid,text,text,numeric,text,jsonb) from public;
grant execute on function public.tgg_live_recording_replay_transition(uuid,text,text,numeric,text,jsonb) to authenticated;

-- ============================================================
-- MIGRATION 20260913205931 add_live_verified_clip_gate
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_verified_clip_gate(p_stream_id uuid,p_title text,p_start_seconds numeric,p_end_seconds numeric,p_clip_kind text default 'highlight') returns jsonb language plpgsql security invoker set search_path=public as $$ declare v_uid uuid:=auth.uid(); v_replay public.tgg_live_replays%rowtype; v_clip_id uuid; v_duration numeric; begin if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if; if p_start_seconds is null or p_end_seconds is null or p_start_seconds < 0 or p_end_seconds <= p_start_seconds then raise exception 'CLIP_RANGE_INVALID' using errcode='22023'; end if; select * into v_replay from public.tgg_live_replays where stream_id=p_stream_id and creator_id=v_uid and status='READY' and storage_path is not null order by created_at desc limit 1; if not found then raise exception 'VERIFIED_REPLAY_REQUIRED' using errcode='22023'; end if; v_duration:=coalesce(v_replay.duration_seconds,0); if v_duration > 0 and p_end_seconds > v_duration then raise exception 'CLIP_RANGE_EXCEEDS_REPLAY' using errcode='22023'; end if; if nullif(btrim(coalesce(p_title,'')),'') is null then raise exception 'CLIP_TITLE_REQUIRED' using errcode='22023'; end if; insert into public.tgg_live_clips(stream_id,replay_id,creator_id,title,start_seconds,end_seconds,clip_kind,status) values(p_stream_id,v_replay.id,v_uid,btrim(p_title),p_start_seconds,p_end_seconds,nullif(btrim(coalesce(p_clip_kind,'')),'highlight'),'QUEUED') returning id into v_clip_id; return jsonb_build_object('ok',true,'clip_id',v_clip_id,'replay_id',v_replay.id,'status','QUEUED','start_seconds',p_start_seconds,'end_seconds',p_end_seconds); end; $$; revoke all on function public.tgg_live_verified_clip_gate(uuid,text,numeric,numeric,text) from public; grant execute on function public.tgg_live_verified_clip_gate(uuid,text,numeric,numeric,text) to authenticated;

-- ============================================================
-- MIGRATION 20260913210000 add_live_clip_render_queue
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_live_clip_render_jobs (id uuid primary key default gen_random_uuid(), clip_id uuid not null references public.tgg_live_clips(id) on delete cascade, replay_id uuid not null references public.tgg_live_replays(id) on delete cascade, creator_id uuid not null, status text not null default 'queued', output_path text, output_url text, provider text, provider_job_id text, request_key text not null, error_code text, error_message text, progress integer not null default 0, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(request_key)); create index if not exists idx_tgg_live_clip_render_jobs_creator_status on public.tgg_live_clip_render_jobs(creator_id,status); create index if not exists idx_tgg_live_clip_render_jobs_clip on public.tgg_live_clip_render_jobs(clip_id); alter table public.tgg_live_clip_render_jobs enable row level security; drop policy if exists tgg_live_clip_render_jobs_owner_select on public.tgg_live_clip_render_jobs; create policy tgg_live_clip_render_jobs_owner_select on public.tgg_live_clip_render_jobs for select using (creator_id=auth.uid());

-- ============================================================
-- MIGRATION 20260913210113 harden_live_clip_render_dispatch
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create unique index if not exists uq_tgg_live_clip_render_active_request on public.tgg_live_clip_render_jobs(request_key) where status in ('queued','processing');

create or replace function public.tgg_live_clip_dispatch_render(p_clip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  uid uuid := auth.uid();
  c public.tgg_live_clips%rowtype;
  r public.tgg_live_replays%rowtype;
  j public.tgg_live_clip_render_jobs%rowtype;
  v_request_key text;
  v_object_exists boolean := false;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select * into c
  from public.tgg_live_clips
  where id = p_clip_id and creator_id = uid;
  if not found then raise exception 'CLIP_NOT_FOUND_OR_NOT_OWNED' using errcode='42501'; end if;

  if c.replay_id is null then raise exception 'REPLAY_REQUIRED' using errcode='22023'; end if;

  select * into r
  from public.tgg_live_replays
  where id = c.replay_id and stream_id = c.stream_id and creator_id = uid;
  if not found then raise exception 'REPLAY_NOT_FOUND_OR_NOT_OWNED' using errcode='42501'; end if;

  if r.status <> 'READY' then raise exception 'REPLAY_NOT_READY' using errcode='22023'; end if;
  if r.storage_path is null or btrim(r.storage_path) = '' then raise exception 'REPLAY_STORAGE_REQUIRED' using errcode='22023'; end if;

  select exists(
    select 1 from storage.objects o
    where o.bucket_id = 'creator-media' and o.name = r.storage_path
  ) into v_object_exists;
  if not v_object_exists then raise exception 'REPLAY_STORAGE_OBJECT_MISSING' using errcode='22023'; end if;

  if c.start_seconds is null or c.start_seconds < 0 then raise exception 'INVALID_CLIP_START' using errcode='22023'; end if;
  if c.end_seconds is null or c.end_seconds <= c.start_seconds then raise exception 'INVALID_CLIP_RANGE' using errcode='22023'; end if;
  if r.duration_seconds is not null and c.end_seconds > r.duration_seconds then raise exception 'CLIP_EXCEEDS_REPLAY_DURATION' using errcode='22023'; end if;

  v_request_key := encode(digest(
    concat_ws('|', c.id::text, r.id::text, c.start_seconds::text, c.end_seconds::text, coalesce(c.clip_kind,'moment')),
    'sha256'
  ), 'hex');

  select * into j
  from public.tgg_live_clip_render_jobs
  where request_key = v_request_key and status in ('queued','processing')
  order by created_at desc
  limit 1;

  if j.id is not null then
    update public.tgg_live_clips set status='queued' where id=c.id and status <> 'completed';
    return jsonb_build_object('ok',true,'idempotent',true,'clip_id',c.id,'render_job_id',j.id,'status',j.status,'request_key',v_request_key);
  end if;

  insert into public.tgg_live_clip_render_jobs(
    clip_id,replay_id,creator_id,status,provider,request_key,progress,metadata
  ) values (
    c.id,r.id,uid,'queued','github.ffmpeg.v1',v_request_key,0,
    jsonb_build_object(
      'source_storage_path',r.storage_path,
      'start_seconds',c.start_seconds,
      'end_seconds',c.end_seconds,
      'clip_kind',c.clip_kind,
      'source_replay_id',r.id,
      'pipeline','LIVE→REPLAY→CLIP→MP4'
    )
  ) returning * into j;

  update public.tgg_live_clips
  set status='queued'
  where id=c.id;

  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'clip_id',c.id,
    'render_job_id',j.id,
    'status',j.status,
    'request_key',v_request_key,
    'source_verified',true
  );
end;
$$;

grant execute on function public.tgg_live_clip_dispatch_render(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260913210252 wire_live_clip_queue_to_render_jobs
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_clip_dispatch_render(p_clip_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c record;
  r record;
  j record;
  v_key text;
  v_job_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  select c.* into c
  from public.tgg_live_clips c
  where c.id = p_clip_id and c.creator_id = v_uid
  for update;
  if not found then raise exception 'clip_not_found_or_denied'; end if;

  select r.* into r
  from public.tgg_live_replays r
  where r.id = c.replay_id and r.stream_id = c.stream_id and r.creator_id = v_uid;
  if not found then raise exception 'replay_not_found_or_denied'; end if;
  if coalesce(r.status,'') <> 'READY' then raise exception 'replay_not_ready'; end if;
  if nullif(r.storage_path,'') is null then raise exception 'replay_storage_required'; end if;

  if c.start_seconds is null or c.end_seconds is null or c.start_seconds < 0 or c.end_seconds <= c.start_seconds then
    raise exception 'invalid_clip_range';
  end if;
  if r.duration_seconds is not null and c.end_seconds > r.duration_seconds then
    raise exception 'clip_exceeds_replay_duration';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'creator-media' and o.name = r.storage_path
  ) then
    raise exception 'replay_storage_object_missing';
  end if;

  v_key := encode(digest(concat(c.replay_id::text,'|',c.start_seconds::text,'|',c.end_seconds::text,'|',coalesce(c.clip_kind,''),'|',v_uid::text),'sha256'),'hex');

  select j.* into j
  from public.tgg_live_clip_render_jobs j
  where j.clip_id = c.id
    and j.request_key = v_key
    and j.status in ('queued','processing')
  order by j.created_at desc limit 1;
  if found then
    return jsonb_build_object('ok',true,'reused',true,'clip_id',c.id,'render_job_id',j.id,'request_key',v_key,'status',j.status);
  end if;

  insert into public.tgg_live_clip_render_jobs
    (clip_id,stream_id,replay_id,creator_id,request_key,status,progress,provider,metadata)
  values
    (c.id,c.stream_id,c.replay_id,v_uid,v_key,'queued',0,'github.ffmpeg.v1',
     jsonb_build_object('source_storage_path',r.storage_path,'storage_bucket','creator-media','mode','master_transcode','source_in_seconds',c.start_seconds,'duration_seconds',c.end_seconds-c.start_seconds,'clip_kind',c.clip_kind,'source_replay_id',r.id))
  returning id into v_job_id;

  update public.tgg_live_clips
  set status = 'QUEUED'
  where id = c.id;

  return jsonb_build_object('ok',true,'reused',false,'clip_id',c.id,'render_job_id',v_job_id,'request_key',v_key,'status','queued');
end;
$$;

revoke all on function public.tgg_live_clip_dispatch_render(uuid) from public;
grant execute on function public.tgg_live_clip_dispatch_render(uuid) to authenticated;

create or replace function public.tgg_live_clip_complete_render(p_clip_render_job_id uuid,p_storage_path text,p_duration_seconds numeric default null,p_aspect_ratio text default '16:9')
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  j record;
  c record;
  r record;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select j.* into j from public.tgg_live_clip_render_jobs j where j.id=p_clip_render_job_id and j.creator_id=v_uid for update;
  if not found then raise exception 'render_job_not_found_or_denied'; end if;
  select c.* into c from public.tgg_live_clips c where c.id=j.clip_id and c.creator_id=v_uid for update;
  if not found then raise exception 'clip_not_found_or_denied'; end if;
  select r.* into r from public.tgg_live_replays r where r.id=c.replay_id and r.creator_id=v_uid;
  if not found then raise exception 'replay_not_found_or_denied'; end if;
  if j.status not in ('queued','processing','completed') then raise exception 'render_job_not_completable'; end if;
  if nullif(p_storage_path,'') is null or p_storage_path like '%..%' or p_storage_path not like v_uid::text || '/video/%/server-renders/%' then raise exception 'invalid_output_path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='creator-media' and o.name=p_storage_path) then raise exception 'render_output_object_missing'; end if;

  update public.tgg_live_clip_render_jobs
  set status='completed',progress=100,output_storage_path=p_storage_path,completed_at=coalesce(completed_at,now()),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('aspect_ratio',p_aspect_ratio,'duration_seconds',p_duration_seconds)
  where id=j.id;

  update public.tgg_live_clips
  set status='RENDERED',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('render_job_id',j.id,'output_storage_path',p_storage_path,'render_verified_at',now())
  where id=c.id;

  return jsonb_build_object('ok',true,'clip_id',c.id,'render_job_id',j.id,'status','RENDERED','storage_path',p_storage_path);
end;
$$;

revoke all on function public.tgg_live_clip_complete_render(uuid,text,numeric,text) from public;
grant execute on function public.tgg_live_clip_complete_render(uuid,text,numeric,text) to authenticated;


-- ============================================================
-- MIGRATION 20260913210348 tgg_live_clip_playback_verification_gate
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_clip_playback_gate(p_clip_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid := auth.uid();
  c record;
  r record;
  o record;
  exists_object boolean := false;
begin
  if u is null then raise exception 'authentication_required'; end if;
  select * into c from public.tgg_live_clips where id=p_clip_id and creator_id=u;
  if not found then raise exception 'clip_not_found_or_denied'; end if;
  select * into r from public.tgg_live_replays where id=c.replay_id and creator_id=u and stream_id=c.stream_id;
  if not found then raise exception 'replay_not_found_or_denied'; end if;
  if coalesce(r.status,'') <> 'READY' then
    return jsonb_build_object('ok',false,'state','BLOCKED','reason','REPLAY_NOT_READY');
  end if;
  if nullif(trim(coalesce(r.storage_path,'')),'') is null then
    return jsonb_build_object('ok',false,'state','BLOCKED','reason','REPLAY_STORAGE_PATH_REQUIRED');
  end if;
  select exists(select 1 from storage.objects so where so.bucket_id='creator-media' and so.name=r.storage_path) into exists_object;
  if not exists_object then
    return jsonb_build_object('ok',false,'state','BLOCKED','reason','REPLAY_STORAGE_OBJECT_MISSING');
  end if;
  if c.start_seconds is null or c.end_seconds is null or c.start_seconds < 0 or c.end_seconds <= c.start_seconds then
    return jsonb_build_object('ok',false,'state','BLOCKED','reason','INVALID_CLIP_RANGE');
  end if;
  if r.duration_seconds is not null and c.end_seconds > r.duration_seconds then
    return jsonb_build_object('ok',false,'state','BLOCKED','reason','CLIP_EXCEEDS_REPLAY_DURATION');
  end if;
  if coalesce(c.status,'') not in ('RENDERED','READY','PUBLISHED') then
    return jsonb_build_object('ok',false,'state','BLOCKED','reason','CLIP_OUTPUT_NOT_READY');
  end if;
  if coalesce(c.metadata->>'render_storage_path','') = '' then
    return jsonb_build_object('ok',false,'state','BLOCKED','reason','CLIP_OUTPUT_STORAGE_PATH_REQUIRED');
  end if;
  select exists(select 1 from storage.objects so where so.bucket_id='creator-media' and so.name=(c.metadata->>'render_storage_path')) into exists_object;
  if not exists_object then
    return jsonb_build_object('ok',false,'state','BLOCKED','reason','CLIP_OUTPUT_STORAGE_OBJECT_MISSING');
  end if;
  return jsonb_build_object('ok',true,'state','PLAYBACK_VERIFICATION_REQUIRED','clip_id',c.id,'replay_id',r.id,'source_storage_path',r.storage_path,'output_storage_path',c.metadata->>'render_storage_path','duration_seconds',case when r.duration_seconds is null then null else greatest(0,c.end_seconds-c.start_seconds) end,'signed_url_required',true,'playback_probe_required',true);
end;
$$;
grant execute on function public.tgg_live_clip_playback_gate(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260913210455 tgg_live_clip_playback_verification_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_live_clip_playback_verifications (id uuid primary key default gen_random_uuid(), clip_id uuid not null references public.tgg_live_clips(id) on delete cascade, owner_user_id uuid not null, verification_token uuid not null default gen_random_uuid(), status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','FAILED','EXPIRED')), signed_url_issued_at timestamptz, verified_at timestamptz, failed_at timestamptz, probe_kind text, probe_event_id text, media_duration_seconds numeric, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(clip_id), unique(verification_token));
create index if not exists idx_tgg_live_clip_playback_verifications_owner on public.tgg_live_clip_playback_verifications(owner_user_id);
create index if not exists idx_tgg_live_clip_playback_verifications_status on public.tgg_live_clip_playback_verifications(status);
alter table public.tgg_live_clip_playback_verifications enable row level security;
drop policy if exists tgg_live_clip_playback_verifications_select_owner on public.tgg_live_clip_playback_verifications;
create policy tgg_live_clip_playback_verifications_select_owner on public.tgg_live_clip_playback_verifications for select to authenticated using (owner_user_id = auth.uid());
create or replace function public.tgg_live_clip_playback_issue(p_clip_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.tgg_live_clips%rowtype; g jsonb; v public.tgg_live_clip_playback_verifications%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 select * into c from public.tgg_live_clips where id=p_clip_id and creator_id=auth.uid();
 if not found then raise exception 'clip_not_found_or_denied'; end if;
 g:=public.tgg_live_clip_playback_gate(p_clip_id);
 if coalesce(g->>'state','') <> 'PLAYBACK_VERIFICATION_REQUIRED' then
   if coalesce(g->>'ready', 'false') <> 'true' then raise exception 'clip_not_ready_for_playback'; end if;
 end if;
 insert into public.tgg_live_clip_playback_verifications(clip_id,owner_user_id,status,metadata,updated_at) values(p_clip_id,auth.uid(),'PENDING',jsonb_build_object('issued_by','live_clip_playback_bridge'),now()) on conflict(clip_id) do update set status='PENDING',verification_token=gen_random_uuid(),signed_url_issued_at=now(),verified_at=null,failed_at=null,probe_event_id=null,metadata=excluded.metadata,updated_at=now() returning * into v;
 return jsonb_build_object('ok',true,'clip_id',p_clip_id,'verification_id',v.id,'verification_token',v.verification_token,'status',v.status,'storage_path',c.storage_path,'expires_in',120);
end $$;
grant execute on function public.tgg_live_clip_playback_issue(uuid) to authenticated;
create or replace function public.tgg_live_clip_playback_record(p_verification_token uuid,p_status text,p_probe_kind text default 'html_media',p_probe_event_id text default null,p_media_duration_seconds numeric default null,p_metadata jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare v public.tgg_live_clip_playback_verifications%rowtype;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 select * into v from public.tgg_live_clip_playback_verifications where verification_token=p_verification_token and owner_user_id=auth.uid() for update;
 if not found then raise exception 'verification_not_found_or_denied'; end if;
 if v.status <> 'PENDING' then return jsonb_build_object('ok',true,'status',v.status,'verification_id',v.id); end if;
 if p_status not in ('VERIFIED','FAILED') then raise exception 'invalid_probe_status'; end if;
 update public.tgg_live_clip_playback_verifications set status=p_status,probe_kind=left(coalesce(p_probe_kind,'html_media'),80),probe_event_id=left(coalesce(p_probe_event_id,''),200),media_duration_seconds=p_media_duration_seconds,verified_at=case when p_status='VERIFIED' then now() else null end,failed_at=case when p_status='FAILED' then now() else null end,metadata=coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=v.id returning * into v;
 if p_status='VERIFIED' then update public.tgg_live_clips set status='VERIFIED',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('playback_verified_at',now(),'playback_verification_id',v.id),updated_at=now() where id=v.clip_id and creator_id=auth.uid() and status in ('RENDERED','VERIFIED'); end if;
 return jsonb_build_object('ok',true,'status',v.status,'verification_id',v.id,'clip_id',v.clip_id,'verified_at',v.verified_at);
end $$;
grant execute on function public.tgg_live_clip_playback_record(uuid,text,text,text,numeric,jsonb) to authenticated;


-- ============================================================
-- MIGRATION 20260913210540 bridge_live_clip_verified_publish
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_clip_prepare_publish(p_clip_id uuid, p_destination_type text default 'homepage') returns jsonb language plpgsql security invoker set search_path=public as $$ declare v_uid uuid:=auth.uid(); c public.tgg_live_clips%rowtype; j public.tgg_live_clip_render_jobs%rowtype; v_pub_id uuid; v_event_id uuid; begin if v_uid is null then raise exception 'AUTH_REQUIRED'; end if; select * into c from public.tgg_live_clips where id=p_clip_id and creator_id=v_uid; if not found then raise exception 'CLIP_NOT_FOUND'; end if; if c.status <> 'VERIFIED' then raise exception 'CLIP_NOT_PLAYBACK_VERIFIED'; end if; select * into j from public.tgg_live_clip_render_jobs where clip_id=c.id and status='completed' order by updated_at desc limit 1; if not found or j.output_path is null then raise exception 'RENDERED_OUTPUT_REQUIRED'; end if; if not exists(select 1 from storage.objects where bucket_id='creator-media' and name=j.output_path) then raise exception 'OUTPUT_STORAGE_OBJECT_MISSING'; end if; select id into v_pub_id from public.tgg_video_publish_jobs where user_id=v_uid and destination_type=p_destination_type and destination_id=c.id and status in ('queued','processing','published') order by created_at desc limit 1; if v_pub_id is null then insert into public.tgg_video_publish_jobs(project_id,user_id,destination_type,destination_id,payload,status) values(null,v_uid,p_destination_type,c.id,jsonb_build_object('source','live_clip','clip_id',c.id,'stream_id',c.stream_id,'replay_id',c.replay_id,'storage_path',j.output_path,'playback_verified',true,'verified_at',now()),'queued') returning id into v_pub_id; end if; insert into public.tgg_homepage_publish_events(actor_id,event_type,content_type,content_id,payload) values(v_uid,'LIVE_CLIP_READY','video_clip',c.id,jsonb_build_object('clip_id',c.id,'stream_id',c.stream_id,'storage_path',j.output_path,'playback_verified',true,'publish_job_id',v_pub_id)) returning id into v_event_id; return jsonb_build_object('ok',true,'clip_id',c.id,'publish_job_id',v_pub_id,'homepage_event_id',v_event_id,'status','queued'); end; $$; grant execute on function public.tgg_live_clip_prepare_publish(uuid,text) to authenticated;

-- ============================================================
-- MIGRATION 20260913210721 auto_live_clip_worker_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.tgg_live_clips add column if not exists project_id uuid references public.tgg_studio_projects(id) on delete set null;

create index if not exists idx_tgg_live_clips_project_id on public.tgg_live_clips(project_id);

create or replace function public.tgg_live_clip_dispatch_render(p_clip_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$
declare
 v_uid uuid:=auth.uid(); c public.tgg_live_clips%rowtype; r public.tgg_live_replays%rowtype; lj public.tgg_live_clip_render_jobs%rowtype; p public.tgg_studio_projects%rowtype; v_video_job uuid; v_key text; v_rev bigint; v_path text;
begin
 if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select * into c from public.tgg_live_clips where id=p_clip_id and creator_id=v_uid for update;
 if not found then raise exception 'CLIP_NOT_FOUND'; end if;
 select * into r from public.tgg_live_replays where id=c.replay_id and creator_id=v_uid;
 if not found or r.status <> 'READY' or nullif(btrim(r.storage_path),'') is null then raise exception 'READY_REPLAY_REQUIRED'; end if;
 if not exists(select 1 from storage.objects where bucket_id='creator-media' and name=r.storage_path) then raise exception 'REPLAY_STORAGE_OBJECT_MISSING'; end if;
 if c.start_seconds < 0 or c.end_seconds <= c.start_seconds or (r.duration_seconds is not null and c.end_seconds > r.duration_seconds) then raise exception 'CLIP_RANGE_INVALID'; end if;
 if c.project_id is null then
   insert into public.tgg_studio_projects(user_id,title,bpm,status,project_data,project_type,description,duration_seconds,revision)
   values(v_uid,left(coalesce(nullif(c.title,''),'Live Clip')||' · Auto Render',200),120,'draft',jsonb_build_object('source','live_clip','live_clip_id',c.id,'stream_id',c.stream_id,'replay_id',c.replay_id),'video','AUTO BUILDER managed live clip render project',c.end_seconds-c.start_seconds,0)
   returning * into p;
   update public.tgg_live_clips set project_id=p.id where id=c.id returning * into c;
 else
   select * into p from public.tgg_studio_projects where id=c.project_id and user_id=v_uid;
   if not found then raise exception 'CLIP_PROJECT_NOT_FOUND'; end if;
 end if;
 select * into lj from public.tgg_live_clip_render_jobs where clip_id=c.id and status in ('queued','processing') order by updated_at desc limit 1;
 if found then return jsonb_build_object('ok',true,'status',lj.status,'live_clip_render_job_id',lj.id,'video_render_job_id',lj.provider_job_id,'reused',true); end if;
 v_key:=encode(digest(c.replay_id::text||'|'||c.start_seconds::text||'|'||c.end_seconds::text||'|'||coalesce(c.clip_kind,'')||'|'||v_uid::text,'sha256'),'hex');
 select id into v_video_job from public.tgg_video_studio_render_jobs where user_id=v_uid and status in ('queued','processing','ready') and request_payload->>'live_clip_request_key'=v_key order by created_at desc limit 1;
 if v_video_job is null then
   v_rev:=coalesce(p.revision,0);
   v_path:=r.storage_path;
   insert into public.tgg_video_studio_render_jobs(project_id,user_id,job_type,output_format,output_preset,source_revision,request_payload,status,progress,provider_key,priority)
   values(p.id,v_uid,'live_clip_render','mp4','1080p',v_rev,jsonb_build_object('live_clip_request_key',v_key,'live_clip_id',c.id,'live_clip_render_job_id',null,'source_storage_path',v_path,'storage_bucket','creator-media','mode','master_transcode','source_in_seconds',c.start_seconds,'duration_seconds',c.end_seconds-c.start_seconds,'clip_kind',c.clip_kind,'source_replay_id',c.replay_id),'queued',0,'github.ffmpeg.v1',150)
   returning id into v_video_job;
 end if;
 update public.tgg_video_studio_render_jobs set request_payload=request_payload||jsonb_build_object('live_clip_render_job_id',lj.id) where id=v_video_job and lj.id is not null;
 if lj.id is null then
   insert into public.tgg_live_clip_render_jobs(clip_id,replay_id,creator_id,status,provider_job_id,request_key,progress,metadata)
   values(c.id,c.replay_id,v_uid,'queued',v_video_job::text,v_key,0,jsonb_build_object('adapter','tgg_live_clip_auto_builder','video_render_job_id',v_video_job,'source_storage_path',v_path,'storage_bucket','creator-media','output_preset','1080p')) returning * into lj;
   update public.tgg_video_studio_render_jobs set request_payload=request_payload||jsonb_build_object('live_clip_render_job_id',lj.id) where id=v_video_job;
 end if;
 update public.tgg_live_clips set status='QUEUED' where id=c.id;
 return jsonb_build_object('ok',true,'status','queued','live_clip_render_job_id',lj.id,'video_render_job_id',v_video_job,'project_id',p.id,'request_key',v_key,'auto_builder',true);
end; $$;
grant execute on function public.tgg_live_clip_dispatch_render(uuid) to authenticated;

create or replace function public.tgg_live_clip_bridge_render_output()
returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$
declare v_live_job_id uuid; v_clip_id uuid; v_duration numeric; v_aspect text; v_bucket text:='creator-media';
begin
 select nullif(request_payload->>'live_clip_render_job_id','')::uuid into v_live_job_id from public.tgg_video_studio_render_jobs where id=new.render_job_id;
 if v_live_job_id is null then return new; end if;
 if new.status <> 'ready' or nullif(btrim(new.storage_path),'') is null then return new; end if;
 if not exists(select 1 from storage.objects where bucket_id=v_bucket and name=new.storage_path) then return new; end if;
 select clip_id into v_clip_id from public.tgg_live_clip_render_jobs where id=v_live_job_id for update;
 if v_clip_id is null then return new; end if;
 update public.tgg_live_clip_render_jobs set status='completed',progress=100,output_path=new.storage_path,updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('video_render_job_id',new.render_job_id,'render_output_id',new.id,'bridge_verified',true) where id=v_live_job_id;
 select coalesce(duration_seconds,0), '16:9' into v_duration,v_aspect from public.tgg_live_clips c where c.id=v_clip_id;
 update public.tgg_live_clips set status='RENDERED' where id=v_clip_id;
 return new;
end; $$;

drop trigger if exists trg_tgg_live_clip_bridge_render_output on public.tgg_video_studio_render_outputs;
create trigger trg_tgg_live_clip_bridge_render_output after insert or update of status,storage_path on public.tgg_video_studio_render_outputs for each row execute function public.tgg_live_clip_bridge_render_output();

-- ============================================================
-- MIGRATION 20260913210821 tgg_live_clip_full_auto_builder
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_clip_auto_build(p_clip_id uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$ declare v_uid uuid:=auth.uid(); c public.tgg_live_clips%rowtype; r public.tgg_live_replays%rowtype; j public.tgg_live_clip_render_jobs%rowtype; p public.tgg_studio_projects%rowtype; v_project_id uuid; v_video_job_id uuid; v_request_key text; v_payload jsonb; begin if v_uid is null then raise exception 'AUTH_REQUIRED'; end if; select * into c from public.tgg_live_clips where id=p_clip_id and creator_id=v_uid; if not found then raise exception 'CLIP_NOT_FOUND'; end if; if c.status not in ('QUEUED','READY_FOR_RENDER','RENDERED','VERIFIED') then raise exception 'CLIP_NOT_RENDERABLE'; end if; select * into r from public.tgg_live_replays where id=c.replay_id and creator_id=v_uid and status='READY'; if not found then raise exception 'READY_REPLAY_REQUIRED'; end if; select * into j from public.tgg_live_clip_render_jobs where clip_id=c.id order by created_at desc limit 1; if not found then raise exception 'LIVE_CLIP_RENDER_JOB_REQUIRED'; end if; if j.status='completed' then return jsonb_build_object('ok',true,'state','RENDER_COMPLETE','clip_id',c.id,'live_render_job_id',j.id,'output_path',j.output_path); end if; if j.status in ('queued','processing') and j.provider_job_id is not null then return jsonb_build_object('ok',true,'state','WORKER_ALREADY_ACTIVE','clip_id',c.id,'live_render_job_id',j.id,'provider_job_id',j.provider_job_id); end if; v_request_key:=j.request_key; select * into p from public.tgg_studio_projects where user_id=v_uid and project_type='video' and coalesce((project_data->>'auto_builder_owner'),'')=c.id::text order by updated_at desc limit 1; if not found then insert into public.tgg_studio_projects(user_id,title,status,project_data,project_type,description,revision) values(v_uid,left(coalesce(c.title,'Live Clip')||' · AUTO BUILDER',255),'draft',jsonb_build_object('auto_builder_owner',c.id::text,'source','live_clip','clip_id',c.id,'replay_id',c.replay_id,'storage_path',r.storage_path,'start_seconds',c.start_seconds,'end_seconds',c.end_seconds,'clip_kind',c.clip_kind,'request_key',v_request_key),'video', 'Auto-generated Live Clip render project',1) returning * into p; end if; v_project_id:=p.id; select id into v_video_job_id from public.tgg_video_studio_render_jobs where project_id=v_project_id and user_id=v_uid and status in ('queued','processing') and request_payload->>'live_clip_id'=c.id::text order by created_at desc limit 1; if v_video_job_id is not null then return jsonb_build_object('ok',true,'state','VIDEO_WORKER_JOB_ALREADY_QUEUED','clip_id',c.id,'project_id',v_project_id,'video_render_job_id',v_video_job_id); end if; v_payload:=jsonb_build_object('live_clip_id',c.id,'live_clip_render_job_id',j.id,'replay_id',c.replay_id,'source_bucket','creator-media','source_storage_path',r.storage_path,'source_in_seconds',c.start_seconds,'duration_seconds',(c.end_seconds-c.start_seconds),'clip_kind',c.clip_kind,'mode','master_transcode','live_clip_autobuilder',true,'request_key',v_request_key); insert into public.tgg_video_studio_render_jobs(project_id,user_id,job_type,output_format,output_preset,source_revision,request_payload,result_payload,status,progress,provider_key,priority,attempt_count) values(v_project_id,v_uid,'live_clip_render','mp4','master',p.revision,v_payload,'{}'::jsonb,'queued',0,'github.ffmpeg.v1',150,0) returning id into v_video_job_id; update public.tgg_live_clip_render_jobs set provider_job_id=v_video_job_id::text, metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('auto_builder','tgg_live_clip_auto_build','video_render_job_id',v_video_job_id,'project_id',v_project_id),updated_at=now() where id=j.id; return jsonb_build_object('ok',true,'state','AUTO_BUILT_AND_QUEUED','clip_id',c.id,'project_id',v_project_id,'live_render_job_id',j.id,'video_render_job_id',v_video_job_id,'request_key',v_request_key); end; $$; grant execute on function public.tgg_live_clip_auto_build(uuid) to authenticated; create or replace function public.tgg_live_clip_auto_builder_trigger() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$ declare v_live_job uuid; v_clip uuid; v_path text; begin if new.status<>'ready' or old.status='ready' then return new; end if; v_clip:=nullif(new.request_payload->>'live_clip_id','')::uuid; if v_clip is null then return new; end if; v_path:=nullif(new.result_payload->>'storage_path',''); if v_path is null then return new; end if; select id into v_live_job from public.tgg_live_clip_render_jobs where clip_id=v_clip and provider_job_id=new.id::text order by updated_at desc limit 1; if v_live_job is null then return new; end if; if not exists(select 1 from storage.objects where bucket_id='creator-media' and name=v_path) then return new; end if; update public.tgg_live_clip_render_jobs set status='completed',progress=100,output_path=v_path,updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('video_render_job_id',new.id,'auto_completion','storage_verified','completed_at',now()) where id=v_live_job; update public.tgg_live_clips set status='RENDERED' where id=v_clip and status<>'VERIFIED'; return new; end; $$; drop trigger if exists trg_tgg_live_clip_auto_builder on public.tgg_video_studio_render_jobs; create trigger trg_tgg_live_clip_auto_builder after update of status,result_payload on public.tgg_video_studio_render_jobs for each row execute function public.tgg_live_clip_auto_builder_trigger(); grant execute on function public.tgg_live_clip_auto_builder_trigger() to authenticated;

-- ============================================================
-- MIGRATION 20260913210829 tgg_live_clip_auto_pipeline_entrypoint
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_clip_start_auto_pipeline(p_clip_id uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$ declare v_dispatch jsonb; v_build jsonb; begin v_dispatch:=public.tgg_live_clip_dispatch_render(p_clip_id); v_build:=public.tgg_live_clip_auto_build(p_clip_id); return jsonb_build_object('ok',true,'pipeline','AUTO','dispatch',v_dispatch,'build',v_build,'flow','CLIP → AUTO BUILDER → VIDEO WORKER → MP4 → STORAGE → PLAYBACK → PUBLISH'); end; $$; grant execute on function public.tgg_live_clip_start_auto_pipeline(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260913210928 unify_live_auto_builder_orchestration
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_clip_auto_orchestrate(p_clip_id uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$ declare v_uid uuid:=auth.uid(); c public.tgg_live_clips%rowtype; j public.tgg_live_clip_render_jobs%rowtype; v_video_job uuid; v_project uuid; v_revision bigint:=0; v_key text; v_existing uuid; begin if v_uid is null then raise exception 'AUTH_REQUIRED'; end if; select * into c from public.tgg_live_clips where id=p_clip_id and creator_id=v_uid; if not found then raise exception 'CLIP_NOT_FOUND'; end if; if c.status not in ('QUEUED','RENDERED','VERIFIED') then raise exception 'CLIP_NOT_READY_FOR_AUTO_PIPELINE'; end if; select * into j from public.tgg_live_clip_render_jobs where clip_id=c.id order by created_at desc limit 1; if j.id is null then raise exception 'LIVE_CLIP_RENDER_JOB_REQUIRED'; end if; if j.status not in ('queued','processing','completed') then raise exception 'RENDER_JOB_NOT_ACTIVE'; end if; select id,revision into v_project,v_revision from public.tgg_studio_projects where user_id=v_uid and project_type='video' order by updated_at desc limit 1; if v_project is null then insert into public.tgg_studio_projects(user_id,title,project_type,status,project_data) values(v_uid,coalesce(nullif(c.title,''),'Live Clip Auto Render'),'video','draft',jsonb_build_object('auto_builder',true,'source_live_clip_id',c.id,'source_replay_id',c.replay_id)) returning id,revision into v_project,v_revision; end if; v_key:=encode(extensions.digest(c.id::text||':'||j.request_key||':'||v_uid::text,'sha256'),'hex'); select id into v_existing from public.tgg_video_studio_render_jobs where user_id=v_uid and project_id=v_project and status in ('queued','processing') and request_payload->>'live_clip_bridge_key'=v_key limit 1; if v_existing is not null then v_video_job:=v_existing; else insert into public.tgg_video_studio_render_jobs(project_id,user_id,job_type,output_format,output_preset,source_revision,request_payload,status,progress,provider_key,priority) values(v_project,v_uid,'live_clip_render','mp4','master',v_revision,jsonb_build_object('live_clip_id',c.id,'live_clip_render_job_id',j.id,'replay_id',c.replay_id,'live_clip_bridge_key',v_key,'source_storage_path',j.metadata->>'source_storage_path','source_in_seconds',j.metadata->>'source_in_seconds','duration_seconds',j.metadata->>'duration_seconds','clip_kind',c.clip_kind,'mode','master_transcode','auto_builder',true),'queued',0,'github.ffmpeg.v1',100) returning id into v_video_job; end if; update public.tgg_live_clip_render_jobs set provider_job_id=v_video_job::text, metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('auto_builder_video_job_id',v_video_job,'auto_orchestrated_at',now()) where id=j.id; return jsonb_build_object('ok',true,'auto_builder',true,'live_clip_id',c.id,'live_clip_render_job_id',j.id,'video_render_job_id',v_video_job,'project_id',v_project,'status','queued'); end; $$; grant execute on function public.tgg_live_clip_auto_orchestrate(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260913210936 add_live_clip_auto_completion_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_clip_auto_completion_bridge(p_video_job_id uuid,p_storage_path text,p_format text default 'mp4',p_aspect_ratio text default '16:9',p_resolution text default null,p_duration_seconds numeric default null,p_metadata jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$ declare v_uid uuid:=auth.uid(); j public.tgg_video_studio_render_jobs; c public.tgg_live_clips%rowtype; lj public.tgg_live_clip_render_jobs%rowtype; begin if v_uid is null then raise exception 'AUTH_REQUIRED'; end if; select * into j from public.tgg_video_studio_render_jobs where id=p_video_job_id and user_id=v_uid; if not found then raise exception 'VIDEO_RENDER_JOB_NOT_FOUND'; end if; if j.status <> 'ready' then raise exception 'VIDEO_RENDER_NOT_READY'; end if; if nullif(btrim(coalesce(p_storage_path,'')),'') is null then raise exception 'OUTPUT_STORAGE_PATH_REQUIRED'; end if; if not exists(select 1 from storage.objects where bucket_id='creator-media' and name=p_storage_path) then raise exception 'OUTPUT_STORAGE_OBJECT_MISSING'; end if; select * into lj from public.tgg_live_clip_render_jobs where provider_job_id=j.id::text order by created_at desc limit 1; if lj.id is null then raise exception 'LIVE_CLIP_BRIDGE_NOT_FOUND'; end if; select * into c from public.tgg_live_clips where id=lj.clip_id and creator_id=v_uid; if not found then raise exception 'LIVE_CLIP_NOT_FOUND'; end if; update public.tgg_live_clip_render_jobs set status='completed',progress=100,output_path=p_storage_path,output_url=null,error_code=null,error_message=null,updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('video_render_output_bridge',true,'video_job_id',j.id,'completed_at',now()) where id=lj.id; update public.tgg_live_clips set status='RENDERED' where id=c.id; return jsonb_build_object('ok',true,'live_clip_id',c.id,'live_clip_render_job_id',lj.id,'video_job_id',j.id,'status','RENDERED','storage_verified',true); end; $$; grant execute on function public.tgg_live_clip_auto_completion_bridge(uuid,text,text,text,text,numeric,jsonb) to authenticated;

-- ============================================================
-- MIGRATION 20260913210945 add_live_auto_continuation_queue
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_live_auto_continuation_queue(id uuid primary key default gen_random_uuid(),video_job_id uuid not null,clip_id uuid,action text not null,status text not null default 'queued',attempts integer not null default 0,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(video_job_id,action)); alter table public.tgg_live_auto_continuation_queue enable row level security; drop policy if exists tgg_live_auto_queue_owner_select on public.tgg_live_auto_continuation_queue; create policy tgg_live_auto_queue_owner_select on public.tgg_live_auto_continuation_queue for select to authenticated using (exists(select 1 from public.tgg_video_studio_render_jobs j where j.id=video_job_id and j.user_id=auth.uid())); create or replace function public.tgg_live_auto_enqueue_completion() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$ begin if new.status='ready' and (old.status is distinct from new.status) and coalesce(new.request_payload->>'live_clip_id','')<>'' then insert into public.tgg_live_auto_continuation_queue(video_job_id,clip_id,action) values(new.id,(new.request_payload->>'live_clip_id')::uuid,'CLIP_RENDER_COMPLETE') on conflict(video_job_id,action) do nothing; end if; return new; end; $$; drop trigger if exists trg_tgg_live_auto_enqueue_completion on public.tgg_video_studio_render_jobs; create trigger trg_tgg_live_auto_enqueue_completion after update of status on public.tgg_video_studio_render_jobs for each row execute function public.tgg_live_auto_enqueue_completion(); grant select on public.tgg_live_auto_continuation_queue to authenticated;

-- ============================================================
-- MIGRATION 20260913211121 add_live_clip_auto_continuation_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_live_clip_auto_continuations (id uuid primary key default gen_random_uuid(), clip_id uuid not null references public.tgg_live_clips(id) on delete cascade, owner_user_id uuid not null, stage text not null default 'WAITING_RENDER' check(stage in ('WAITING_RENDER','WAITING_PLAYBACK','WAITING_PUBLISH','COMPLETE','BLOCKED')), status text not null default 'pending' check(status in ('pending','processing','complete','blocked')), attempt_count integer not null default 0, last_error text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(clip_id)); create index if not exists idx_tgg_live_clip_auto_cont_owner_stage on public.tgg_live_clip_auto_continuations(owner_user_id,stage,status); alter table public.tgg_live_clip_auto_continuations enable row level security; drop policy if exists tgg_live_clip_auto_cont_owner on public.tgg_live_clip_auto_continuations; create policy tgg_live_clip_auto_cont_owner on public.tgg_live_clip_auto_continuations for all to authenticated using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid()); create or replace function public.tgg_live_clip_auto_continue(p_clip_id uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$ declare v_uid uuid:=auth.uid(); c public.tgg_live_clips%rowtype; v_stage text; v_status text; begin if v_uid is null then raise exception 'AUTH_REQUIRED'; end if; select * into c from public.tgg_live_clips where id=p_clip_id and creator_id=v_uid; if not found then raise exception 'CLIP_NOT_FOUND'; end if; if c.status='VERIFIED' then v_stage:='WAITING_PUBLISH'; elsif c.status='RENDERED' then v_stage:='WAITING_PLAYBACK'; elsif c.status='QUEUED' then v_stage:='WAITING_RENDER'; else v_stage:='BLOCKED'; end if; v_status:=case when v_stage='BLOCKED' then 'blocked' else 'pending' end; insert into public.tgg_live_clip_auto_continuations(clip_id,owner_user_id,stage,status,attempt_count,metadata,updated_at) values(c.id,v_uid,v_stage,v_status,1,jsonb_build_object('auto_builder',true,'source_status',c.status,'checkpoint_continued_at',now()),now()) on conflict(clip_id) do update set stage=excluded.stage,status=excluded.status,attempt_count=public.tgg_live_clip_auto_continuations.attempt_count+1,metadata=public.tgg_live_clip_auto_continuations.metadata||excluded.metadata,updated_at=now(); return jsonb_build_object('ok',true,'auto_builder',true,'clip_id',c.id,'stage',v_stage,'status',v_status); end; $$; grant execute on function public.tgg_live_clip_auto_continue(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260913211159 wire_live_clip_auto_continuation_triggers
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_live_clip_auto_refresh_continuation() returns trigger language plpgsql security definer set search_path=public,pg_catalog as $$ begin if new.status='RENDERED' then insert into public.tgg_live_clip_auto_continuations(clip_id,owner_user_id,stage,status,metadata) values(new.id,new.creator_id,'WAITING_PLAYBACK','pending',jsonb_build_object('auto_builder',true,'trigger','clip_rendered','at',now())) on conflict(clip_id) do update set stage='WAITING_PLAYBACK',status='pending',last_error=null,metadata=public.tgg_live_clip_auto_continuations.metadata||jsonb_build_object('trigger','clip_rendered','at',now()),updated_at=now(); elsif new.status='VERIFIED' then insert into public.tgg_live_clip_auto_continuations(clip_id,owner_user_id,stage,status,metadata) values(new.id,new.creator_id,'WAITING_PUBLISH','pending',jsonb_build_object('auto_builder',true,'trigger','clip_verified','at',now())) on conflict(clip_id) do update set stage='WAITING_PUBLISH',status='pending',last_error=null,metadata=public.tgg_live_clip_auto_continuations.metadata||jsonb_build_object('trigger','clip_verified','at',now()),updated_at=now(); end if; return new; end; $$; drop trigger if exists trg_tgg_live_clip_auto_refresh_continuation on public.tgg_live_clips; create trigger trg_tgg_live_clip_auto_refresh_continuation after update of status on public.tgg_live_clips for each row when (new.status is distinct from old.status) execute function public.tgg_live_clip_auto_refresh_continuation(); revoke all on function public.tgg_live_clip_auto_refresh_continuation() from public; create or replace function public.tgg_live_clip_auto_queue_publish_if_verified(p_clip_id uuid) returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$ declare v_uid uuid:=auth.uid(); c public.tgg_live_clips%rowtype; v_job jsonb; begin if v_uid is null then raise exception 'AUTH_REQUIRED'; end if; select * into c from public.tgg_live_clips where id=p_clip_id and creator_id=v_uid; if not found then raise exception 'CLIP_NOT_FOUND'; end if; if c.status<>'VERIFIED' then return jsonb_build_object('ok',false,'stage','WAITING_PLAYBACK','reason','PLAYBACK_NOT_VERIFIED'); end if; v_job:=public.tgg_live_clip_prepare_publish(p_clip_id,'homepage'); update public.tgg_live_clip_auto_continuations set stage='COMPLETE',status='complete',metadata=metadata||jsonb_build_object('publish_queued_at',now(),'publish_result',v_job),updated_at=now() where clip_id=p_clip_id; return jsonb_build_object('ok',true,'stage','COMPLETE','publish',v_job); end; $$; grant execute on function public.tgg_live_clip_auto_queue_publish_if_verified(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260913212048 harden_live_trigger_rpc_exposure_and_broadcast_touch_search_path
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

REVOKE EXECUTE ON FUNCTION public.tgg_live_auto_enqueue_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tgg_live_clip_auto_builder_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tgg_live_clip_bridge_render_output() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tgg_live_auto_enqueue_completion() TO service_role;
GRANT EXECUTE ON FUNCTION public.tgg_live_clip_auto_builder_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION public.tgg_live_clip_bridge_render_output() TO service_role;

REVOKE EXECUTE ON FUNCTION public.tgg_live_clip_playback_gate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tgg_live_clip_playback_gate(uuid) TO authenticated, service_role;

ALTER FUNCTION public.tgg_broadcast_media_health_touch() SET search_path = pg_catalog, public;

-- ============================================================
-- MIGRATION 20260913225916 harden_public_discovery_audio_exposure
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_public_discovery_growth_feed(p_limit integer default 12, p_query text default null::text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,12),24));
  v_query text := nullif(btrim(coalesce(p_query,'')), '');
  v_items jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank_score desc, x.release_date desc nulls last, x.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select m.id as release_id, m.artist_id, a.stage_name, m.title, m.genre, m.description,
           m.cover_url, m.slug, m.release_date, m.created_at,
           coalesce(r.score,0)::numeric as rank_score,
           coalesce(r.ranking_reasons,'[]'::jsonb) as ranking_reasons,
           ft.track_id as first_track_id, ft.track_title as first_track_title
    from public.tgg_discovery_rankings r
    join public.mixtapes m on m.id=r.content_id and m.status='published'
    join public.artists a on a.id=m.artist_id
    left join lateral (
      select t.id as track_id,t.title as track_title
      from public.tracks t
      where t.mixtape_id=m.id
      order by t.track_number,t.created_at
      limit 1
    ) ft on true
    where r.feed_mode='trending'
      and r.content_type='release'
      and (r.expires_at is null or r.expires_at > now())
      and (v_query is null or m.title ilike '%'||v_query||'%' or coalesce(m.genre,'') ilike '%'||v_query||'%' or a.stage_name ilike '%'||v_query||'%')
    order by r.score desc, m.release_date desc nulls last, m.created_at desc
    limit v_limit
  ) x;

  if jsonb_array_length(v_items)=0 then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.rank_score desc, x.release_date desc nulls last, x.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select m.id as release_id, m.artist_id, a.stage_name, m.title, m.genre, m.description,
             m.cover_url, m.slug, m.release_date, m.created_at,
             (case when coalesce(m.featured,false) then 1000 else 0 end
              + least(coalesce(m.play_count,0),100000)
              + least(coalesce(m.download_count,0),10000)*3
              + greatest(0,120-floor(extract(epoch from (now()-coalesce(m.release_date,m.created_at)))/86400)))::numeric as rank_score,
             jsonb_build_array('fallback_latest_activity') as ranking_reasons,
             ft.track_id as first_track_id, ft.track_title as first_track_title
      from public.mixtapes m
      join public.artists a on a.id=m.artist_id
      left join lateral (
        select t.id as track_id,t.title as track_title
        from public.tracks t
        where t.mixtape_id=m.id
        order by t.track_number,t.created_at
        limit 1
      ) ft on true
      where m.status='published'
        and (v_query is null or m.title ilike '%'||v_query||'%' or coalesce(m.genre,'') ilike '%'||v_query||'%' or a.stage_name ilike '%'||v_query||'%')
      order by rank_score desc, m.release_date desc nulls last, m.created_at desc
      limit v_limit
    ) x;
  end if;

  return jsonb_build_object('ok',true,'version','GROWTH-006','feed_mode','trending','items',v_items,'count',jsonb_array_length(v_items),'generated_at',now());
end
$function$;

