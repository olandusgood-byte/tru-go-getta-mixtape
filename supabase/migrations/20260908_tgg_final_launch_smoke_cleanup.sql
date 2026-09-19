-- TGG final launch smoke cleanup
-- 1) Completed Blogger OAuth does not require an action URL.


-- 2) Normalize THE ONE hierarchy to exact sequential 1..58.
update public.tgg_one_layers set layer_order=9000+layer_order where active=true;

with ordered(layer_key,layer_order) as (
  values
  ('senses',1),('vision',2),('ears',3),('reflexes',4),('animal',5),('scout',6),('kat',7),('gps',8),
  ('hunter',9),('jack',10),('shadow',11),('head',12),('mind',13),('oracle',14),('heart',15),('magic',16),
  ('genome',17),('bones',18),('circulation',19),('nervous',20),('curse',21),('immune',22),('bear',23),
  ('lungs',24),('metabolism',25),('detox',26),('muscle',27),('stamina',28),('legs',29),('balance',30),
  ('chicken',31),('hands',32),('body',33),('skin',34),('spirit',35),('soul',36),('dream',37),('hair',38),
  ('partner',39),('children',40),('family',41),('choice',42),('mask',43),('veil',44),('matrix_gateway',45),
  ('elevator',46),('exit',47),('lewis_portal',48),('chester',49),('journey4',50),('planet',51),('universe',52),
  ('dimensions',53),('veil_audit',54),('black_box',55),('double_matrix_breaker',56),('mirror',57),('the_one',58)
)
update public.tgg_one_layers l
set layer_order=o.layer_order,updated_at=now()
from ordered o
where l.layer_key=o.layer_key and l.active=true;

-- 3) Refresh only migration-hygiene attestation metadata after approved intentional changes.
-- Protected checkpoint identity/runtime recovery fields remain untouched.
with fn as (
  select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as object_key,
         md5(pg_get_functiondef(p.oid)) as definition_md5
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname,p.proname) in (
    ('private','tgg_launch_closeout_ops_snapshot'),('public','tgg_launch_closeout_summary'),
    ('public','tgg_livekit_credentials_save'),('private','tgg_apply_provider_staging_to_activation_queue'),
    ('private','tgg_reconcile_distribution_metadata_activation_item'),('private','tgg_reconcile_call_validation_activation_item'),
    ('private','tgg_enforce_one_final_routes'),('private','tgg_runtime_drift_guard_internal'),
    ('public','tgg_v5000_production_manifest'),('private','tgg_refresh_migration_hygiene_runtime_inventory'),
    ('private','tgg_operational_dependency_check'),('private','tgg_post_migration_schema_attestation_check'),
    ('private','tgg_release_download_policy_consistency_check'),('public','tgg_public_one_final_bundle'),
    ('private','tgg_public_route_contract_consistency_check'),('tgg_safe_api','public_memberships_feed'),
    ('private','tgg_membership_public_join_consistency_check'),('private','tgg_sync_provider_handoff_status'),
    ('private','tgg_completed_provider_handoff_consistency_check'),('private','tgg_call_validation_invite_freshness_check'),
    ('private','tgg_distribution_metadata_coverage_check'),('private','tgg_legacy_public_route_retirement_check'),
    ('private','tgg_call_invite_expiry_watch')
  )
), cons as (
  select 'constraint:'||conname object_key,md5(pg_get_constraintdef(oid)) definition_md5
  from pg_constraint where conrelid='public.tgg_site_routes'::regclass
    and conname='tgg_site_routes_master_admin_canonical'
), route_state as (
  select 'route:'||route_key object_key,
         md5(jsonb_build_object('path',path,'active',is_active,'primary',is_primary,'workspace',workspace_key,'access',access_level)::text) definition_md5
  from public.tgg_site_routes
  where route_key in ('owner_master_admin','artist_creator_os','creator_expansion_control','public_mixtape_detail_legacy')
), handoff_state as (
  select 'handoff:'||provider_key object_key,
         md5(jsonb_build_object('status',status,'required_action',required_action,'verification_check',verification_check,'target_runtime',target_runtime)::text) definition_md5
  from public.tgg_provider_handoff
  where provider_key in ('distribution.provider','broadcast.sfu_turn','calls.two_user_validation','stripe.native','blogger.oauth')
), all_items as (
  select * from fn union all select * from cons union all select * from route_state union all select * from handoff_state
), agg as (
  select md5(string_agg(object_key||':'||definition_md5,E'\n' order by object_key)) current_md5,
         count(*) current_count,
         jsonb_object_agg(object_key,definition_md5 order by object_key) object_map
  from all_items
)
update public.tgg_operational_recovery_checkpoints c
set details=jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(c.details,'{schema_attestation_md5}',to_jsonb(a.current_md5),true),
                  '{schema_attestation_object_count}',to_jsonb(a.current_count),true),
                '{schema_attestation_objects}',a.object_map,true),
              '{schema_attestation_refreshed_at}',to_jsonb(now()),true)
    || jsonb_build_object(
      'schema_attestation_reason','launch smoke reconciliation: approved intentional changes; protected runtime/recovery identity unchanged',
      'schema_attestation_refresh_reason','final launch smoke approved intentional schema reconciliation')
from agg a
where c.checkpoint_key='migration_hygiene_live';
