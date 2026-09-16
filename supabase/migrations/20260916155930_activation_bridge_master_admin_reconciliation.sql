-- Persist the verified 2026-09-16 Activation Bridge / Master Admin production state.
-- Reuses the existing tgg-one-final-page-audit Edge slot; no new Edge function capacity required.

create or replace function private.tgg_enforce_one_final_routes()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_creator_os text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1';
  v_master_admin text := 'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit';
begin
 if new.route_key='owner_master_admin' then
   new.path:=v_master_admin;
   new.title:='Master Admin · Activation Bridge';
   new.workspace_key:='master_admin';
   new.is_active:=true;
   new.is_primary:=true;
   new.description:='Owner-only Master Admin and Full Connect Activation Bridge. Secrets are stored through owner-guarded RPCs and Vault.';
 elsif new.route_key='admin_dashboard' then
   new.path:='/p/admin-dashboard.html'; new.is_active:=false; new.is_primary:=false; new.description:='Legacy Admin alias.';
 elsif new.route_key='artist_creator_os' then
   new.path:=v_creator_os; new.title:='Creator OS · ONE FINAL'; new.workspace_key:='dashboard'; new.is_active:=true; new.is_primary:=true;
 elsif new.route_key='artist_dashboard' then
   new.path:='/p/artist-dashboard_0633467215.html'; new.is_active:=false; new.is_primary:=false; new.description:='Legacy Blogger Artist Dashboard compatibility route. Canonical ONE-FINAL Creator OS is artist_creator_os.';
 elsif new.route_key='artist_settings' then
   new.path:='/p/artist-dashboard_0633467215.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('creator_settings','artist_campaigns','artist_smartlinks','artist_phone') then
   new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_opportunities','artist_credits','artist_academy') then
   new.path:='/p/career-os.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_fans','artist_collaboration') then
   new.path:='/p/backstage.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_releases','artist_distribution') then
   new.path:='/p/music-hub.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key in ('artist_calls','artist_live') then
   new.path:='/p/live.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='charts' then
   new.path:='/p/homepage.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='artist_command_center' then
   new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='artist_growth' then
   new.path:=v_creator_os||'#growth'; new.workspace_key:='growth'; new.is_active:=true; new.is_primary:=false;
 elsif new.route_key='releases' then
   new.path:='/search/label/Mixtapes'; new.is_active:=false; new.is_primary:=false;
 elsif new.route_key='merch' then
   new.path:='/p/creator-store.html'; new.is_active:=false; new.is_primary:=false;
 elsif new.path='/p/command-center.html' or new.path like '/p/command-center.html#%' then
   new.is_active:=false; new.is_primary:=false;
 end if;
 return new;
end
$function$;

alter table public.tgg_site_routes
  drop constraint if exists tgg_site_routes_master_admin_canonical;

update public.tgg_site_routes
set path='https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit',
    title='Master Admin · Activation Bridge',
    workspace_key='master_admin',
    is_active=true,
    is_primary=true,
    description='Owner-only Master Admin and Full Connect Activation Bridge. Secrets are stored through owner-guarded RPCs and Vault.'
where route_key='owner_master_admin';

alter table public.tgg_site_routes
  add constraint tgg_site_routes_master_admin_canonical
  check (
    route_key <> 'owner_master_admin'
    or not is_active
    or path='https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit'
  );

update public.tgg_master_shared_settings
set config = config || jsonb_build_object(
      'canonical_master_admin','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit',
      'owner_console_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit',
      'direct_owner_console_url','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit',
      'canonical_owner_route','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit',
      'master_admin_edge','tgg-one-final-page-audit',
      'owner_console_strategy','dedicated_owner_activation_bridge',
      'updated_at',now()
    )
where setting_key='runtime_manifest';

update private.tgg_edge_function_registry
set display_name='TGG Activation Bridge',
    family_key='tgg-one-final-page-audit',
    status='ACTIVE',
    canonical=true,
    duplicate_candidate=false,
    retirement_state='keep',
    runtime_state='owner_activation_bridge',
    updated_at=now()
where slug='tgg-one-final-page-audit';

update private.tgg_edge_retirement_manifest
set family_key='tgg-one-final-page-audit',
    canonical_slug='tgg-one-final-page-audit',
    reference_count=1,
    approved_state='hold',
    reason='Repurposed as the canonical owner-only Activation Bridge / Master Admin surface; zero-reference retired audit behavior has been replaced.',
    verified_at=now(),
    retired_at=null
where slug='tgg-one-final-page-audit';

create or replace function private.tgg_edge_physical_cleanup_candidates()
returns table(
  slug text,
  family_key text,
  canonical_slug text,
  reference_count integer,
  runtime_class text,
  runtime_status text,
  active_reference_expected boolean,
  cleanup_action text,
  eligible boolean,
  reason text
)
language sql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
  select
    m.slug,
    m.family_key,
    m.canonical_slug,
    m.reference_count,
    i.runtime_class,
    i.status as runtime_status,
    i.active_reference_expected,
    case when coalesce(r.canonical,false) or r.retirement_state='keep' then 'keep' else i.cleanup_action end as cleanup_action,
    (
      not coalesce(r.canonical,false)
      and coalesce(r.retirement_state,'review') <> 'keep'
      and m.approved_state='retired'
      and m.reference_count=0
      and coalesce(i.active_reference_expected,false)=false
      and coalesce(i.cleanup_action,'')='audit_before_retire'
      and m.slug<>m.canonical_slug
    ) as eligible,
    case
      when coalesce(r.canonical,false) or r.retirement_state='keep' then 'registry_keep_canonical'
      when m.approved_state<>'retired' then 'manifest_not_retired'
      when m.reference_count<>0 then 'manifest_reference_count_nonzero'
      when coalesce(i.active_reference_expected,false) then 'runtime_reference_expected'
      when coalesce(i.cleanup_action,'')<>'audit_before_retire' then 'runtime_cleanup_not_approved'
      when m.slug=m.canonical_slug then 'canonical_slug_self_protection'
      else 'eligible_after_external_management_api_delete_capability'
    end as reason
  from private.tgg_edge_retirement_manifest m
  left join public.tgg_edge_function_runtime_inventory i on i.function_slug=m.slug
  left join private.tgg_edge_function_registry r on r.slug=m.slug
  where i.function_slug is not null;
$function$;

create or replace function private.tgg_runtime_drift_guard_internal()
returns jsonb
language sql
stable
set search_path to ''
as $function$
with manifest as (
  select config j
  from public.tgg_master_shared_settings
  where setting_key='runtime_manifest' and is_published=true
),
pub as (select public.tgg_public_one_final_bundle() j),
feat as (select public.tgg_feature_runtime_health() j),
blogger as (
  select coalesce((
    select d.status='verified'
      and coalesce((d.verification->>'api_ok')::boolean,false)
    from public.v98_blogger_deployments d
    where d.verification->>'api_ok'='true'
    order by d.updated_at desc
    limit 1
  ),false) runtime_verified
),
checks as (
 select * from (values
  ('public_bundle_version',(select j->>'version' from pub)=coalesce((select j->>'public_shell_version' from manifest),'ONE-FINAL-CANONICAL-1.0')),
  ('public_home_route',(select j->'canonical_routes'->>'home' from pub)='/'),
  ('public_release_feed',jsonb_array_length(coalesce((select j->'releases' from pub),'[]'::jsonb))>0),
  ('feature_manifest',(select j->>'version' from feat) in ('FEATURE-RUNTIME-1.1','FEATURE-RUNTIME-1.2')),
  ('all_features_ready',not exists(select 1 from jsonb_each((select j->'modules' from feat)) where coalesce((value->>'ready')::boolean,false)=false)),
  ('blogger_runtime_verified',(select runtime_verified from blogger)),
  ('creator_os_route',exists(select 1 from public.tgg_site_routes where route_key='artist_creator_os' and is_active=true and path=(select j->>'canonical_creator_os' from manifest))),
  ('master_admin_route',exists(select 1 from public.tgg_site_routes where route_key='owner_master_admin' and is_active=true and path=(select j->>'canonical_master_admin' from manifest))),
  ('owner_console_registered',coalesce((select j->>'owner_console_url' from manifest),'')=coalesce((select j->>'canonical_master_admin' from manifest),'')),
  ('retired_command_center_absent',not exists(select 1 from public.tgg_site_routes where is_active and path ilike '%/functions/v1/creator-os-command-center%')),
  ('legacy_dashboard_hidden',not exists(select 1 from public.tgg_site_routes where route_key='artist_dashboard' and is_active=true)),
  ('duplicate_upload_hidden',not exists(select 1 from public.tgg_site_routes where route_key='submit_music' and is_active=true))
 ) v(check_key,ok)
)
select jsonb_build_object(
  'ok',bool_and(ok),
  'version','DRIFT-GUARD-ONE-FINAL-2.0',
  'checks',jsonb_object_agg(check_key,ok),
  'failed',coalesce(jsonb_agg(check_key) filter(where not ok),'[]'::jsonb),
  'generated_at',now()
)
from checks;
$function$;

create or replace function public.tgg_launch_closeout_summary()
returns jsonb
language sql
stable
set search_path to 'public', 'pg_catalog'
as $function$
with
sys as (select public.tgg_one_final_system_health() j),
drift as (select public.tgg_runtime_drift_guard() j),
launch as (select public.tgg_launch_readiness() j),
wf as (select public.tgg_creator_workflow_readiness() j),
access as (select public.tgg_creator_access_readiness() j),
ext as (select public.tgg_external_completion_state() j),
ops as (select private.tgg_launch_closeout_ops_snapshot() j),
summary as (
 select
   (select j->>'state' from sys) system_state,
   (select j->>'launch_stage' from sys) launch_stage,
   coalesce(((select j->>'ok' from drift))::boolean,false) drift_ok,
   coalesce(((select j->>'platform_complete' from launch))::boolean,false) platform_complete,
   coalesce(((select j->>'ok' from wf))::boolean,false) workflows_ok,
   coalesce(((select j->>'ok' from access))::boolean,false) access_ok,
   coalesce(((select j->>'core_complete' from ext))::boolean,false) core_complete,
   coalesce(((select j->>'fully_connected' from ext))::boolean,false) fully_connected,
   coalesce(((select j->>'complete_actions' from ext))::int,0) ext_complete,
   coalesce(((select j->>'total_actions' from ext))::int,0) ext_total,
   (select j->>'dependency_state' from ops) dependency_state,
   coalesce(((select j->>'dependency_failures' from ops))::int,0) dependency_failures,
   coalesce(((select j->>'blocking_alerts' from ops))::int,0) blocking_alerts,
   coalesce(((select j->>'advisory_alerts' from ops))::int,0) advisory_alerts,
   coalesce(((select j->>'open_incidents' from ops))::int,0) open_incidents
)
select jsonb_build_object(
 'ok',system_state='READY' and drift_ok and platform_complete and workflows_ok and access_ok and core_complete and dependency_state='pass' and dependency_failures=0 and blocking_alerts=0 and open_incidents=0,
 'version','LAUNCH-CLOSEOUT-1.3',
 'status',case
   when system_state='READY' and drift_ok and platform_complete and workflows_ok and access_ok and core_complete and dependency_state='pass' and dependency_failures=0 and blocking_alerts=0 and open_incidents=0 and fully_connected then 'FULLY_CONNECTED'
   when system_state='READY' and drift_ok and platform_complete and workflows_ok and access_ok and core_complete and dependency_state='pass' and dependency_failures=0 and blocking_alerts=0 and open_incidents=0 then 'CORE_LAUNCH_READY'
   else 'ATTENTION'
 end,
 'system_state',system_state,
 'launch_stage',launch_stage,
 'core_launch_ready',system_state='READY' and drift_ok and platform_complete and workflows_ok and access_ok and core_complete and dependency_state='pass' and dependency_failures=0 and blocking_alerts=0 and open_incidents=0,
 'fully_connected',fully_connected,
 'external_completion',jsonb_build_object('complete',ext_complete,'total',ext_total,'pending',greatest(ext_total-ext_complete,0),'items',(select j->'items' from ext)),
 'workflows',jsonb_build_object('ready',(select j->'ready_count' from wf),'total',(select j->'total' from wf),'full_ready',(select j->'full_ready' from wf),'fallback_ready',(select j->'fallback_ready' from wf),'validation_required',(select j->'validation_required' from wf)),
 'access_qa',jsonb_build_object('ok',access_ok,'write_functions',(select j->'write_functions' from access),'rls',(select j->'rls' from access),'collaboration',(select j->'collaboration' from access)),
 'fallbacks',jsonb_build_object('payments',(select j->'payments'->>'safe_mode' from launch),'memberships',(select j->'memberships'->>'safe_mode' from launch),'distribution',(select j->'distribution'->>'safe_mode' from launch),'live',(select j->'live'->>'safe_mode' from launch),'calls',(select j->'calls'->>'safe_mode' from launch)),
 'operations',(select j from ops),
 'canonical_urls',jsonb_build_object(
   'creator_os','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-creator-os-app-v17?app=1',
   'master_admin','https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-one-final-page-audit',
   'public_site','https://trugogettamixtapes.blogspot.com/'
 ),
 'generated_at',now()
)
from summary;
$function$;
