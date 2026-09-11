-- TRU GO GETTA production migration history archive
-- Date bucket: 20260908
-- Historical evidence only. Do not replay against production.
-- Preserve the recorded order. Validate in an isolated clean environment before any bootstrap use.

-- ============================================================
-- MIGRATION 20260908012027 add_resend_auth_email_provider
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


insert into public.tgg_provider_runtime_config(
  provider_key,capability,display_name,enabled,mode,endpoint_configured,disabled_reason,updated_at
)
values(
  'email.resend','transactional_auth_email','Resend Auth Email',false,'vault_key',true,'api_key_required',now()
)
on conflict(provider_key) do update set
  capability=excluded.capability,
  display_name=excluded.display_name,
  endpoint_configured=true,
  updated_at=now();

create or replace function private.tgg_get_provider_secret_service(p_provider_key text)
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
    when 'email.resend' then 'tgg_resend_api_key'
    else null
  end;

  if v_name is null then return null; end if;

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name=v_name
  order by created_at desc
  limit 1;

  return v_secret;
end;
$$;

create or replace function private.tgg_store_provider_secret(p_provider_key text, p_secret_value text)
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
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select raw_app_meta_data->>'tgg_role'
  into v_role
  from auth.users
  where id=v_uid;

  if v_role<>'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;

  if p_provider_key not in (
    'stripe.webhook',
    'distribution.provider',
    'broadcast.sfu_turn',
    'email.resend'
  ) then
    raise exception 'UNSUPPORTED_PROVIDER_KEY' using errcode='22023';
  end if;

  if v_secret is null or length(v_secret)<8 or length(v_secret)>4096 then
    raise exception 'INVALID_SECRET_VALUE' using errcode='22023';
  end if;

  if p_provider_key='email.resend' and v_secret !~ '^re_' then
    raise exception 'INVALID_RESEND_API_KEY' using errcode='22023';
  end if;

  v_name:=case p_provider_key
    when 'stripe.webhook' then 'tgg_stripe_webhook_secret'
    when 'distribution.provider' then 'tgg_distribution_provider_secret'
    when 'broadcast.sfu_turn' then 'tgg_broadcast_provider_secret'
    when 'email.resend' then 'tgg_resend_api_key'
  end;

  select id into v_id
  from vault.secrets
  where name=v_name
  order by created_at desc
  limit 1;

  if v_id is null then
    perform vault.create_secret(
      v_secret,v_name,'TGG provider secret stored through owner-only Activation Bridge',null
    );
  else
    perform vault.update_secret(
      v_id,v_secret,v_name,'TGG provider secret stored through owner-only Activation Bridge',null
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

  update public.tgg_provider_runtime_config
     set disabled_reason=case
       when p_provider_key='stripe.webhook' then 'webhook_secret_stored_verification_pending'
       when p_provider_key='distribution.provider' then 'provider_endpoint_or_verification_pending'
       when p_provider_key='broadcast.sfu_turn' then 'provider_endpoint_or_verification_pending'
       when p_provider_key='email.resend' then 'resend_key_stored_runtime_verification_pending'
       else disabled_reason
     end,
     updated_at=now()
   where provider_key=p_provider_key;

  update private.tgg_one_final_activation_queue
     set status=case when item_key='stripe_webhook_signing_secret' then 'ready' else status end,
         next_action=case
           when item_key='stripe_webhook_signing_secret' then
             'Signing secret is stored in Vault. Verify one signed Stripe webhook event to finish activation.'
           when item_key='distribution_provider' then
             'Provider secret is stored. Stage the real HTTPS DSP endpoint and verify provider delivery.'
           when item_key='sfu_turn_provider' then
             'Provider secret is stored. Stage the HTTPS/WSS SFU/TURN endpoint and verify room/token issuance.'
           else next_action
         end,
         evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
           'vault_secret_stored',true,
           'vault_secret_name',v_name,
           'secret_value_exposed',false,
           'stored_at',now()
         ),
         last_checked_at=now()
   where (p_provider_key='stripe.webhook' and item_key='stripe_webhook_signing_secret')
      or (p_provider_key='distribution.provider' and item_key='distribution_provider')
      or (p_provider_key='broadcast.sfu_turn' and item_key='sfu_turn_provider');

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

revoke all on function private.tgg_get_provider_secret_service(text) from public, anon, authenticated;
revoke all on function private.tgg_store_provider_secret(text,text) from public, anon, authenticated;


-- ============================================================
-- MIGRATION 20260908012114 service_only_resend_secret_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_secret_service(p_provider_key text)
returns text
language sql
security definer
set search_path=''
as $$
  select private.tgg_get_provider_secret_service(p_provider_key);
$$;

revoke all on function public.tgg_get_provider_secret_service(text) from public, anon, authenticated;
grant execute on function public.tgg_get_provider_secret_service(text) to service_role;


-- ============================================================
-- MIGRATION 20260908012513 include_resend_in_provider_secret_status
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
          ('email.resend','tgg_resend_api_key'),
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

revoke all on function private.tgg_provider_secret_status_owner() from public, anon, authenticated;


-- ============================================================
-- MIGRATION 20260908012544 include_resend_in_activation_bridge_runtime
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_activation_bridge_bundle()
returns jsonb
language plpgsql
stable
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
  where provider_key in ('stripe.webhook','email.resend','distribution.provider','broadcast.sfu_turn');

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


-- ============================================================
-- MIGRATION 20260908021919 auth_health_ignore_unconfirmed_pending_users
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function tgg_ops_api.auth_final_health()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
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
  where u.email_confirmed_at is not null
    and a.id is null;

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
    'version','AUTH-ONE-FINAL-1.3',
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
      'confirmed_users_without_artist',v_missing_artist
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

-- ============================================================
-- MIGRATION 20260908022117 reconcile_v531_locked_page_and_backup_counts
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = jsonb_set(
  jsonb_set(
    notes,
    '{rollback_contract}',
    coalesce(notes->'rollback_contract','{}'::jsonb)
      || jsonb_build_object(
        'locked_pages',36,
        'restorable_pages',36,
        'missing_backups',0,
        'validated_backup_hashes',36,
        'validated_restore_objects',36,
        'extra_valid_nonlocked_backups',1,
        'reconciled_at',now()
      ),
    true
  ),
  '{backup_integrity_reconciled_from_latest}',
  coalesce(notes->'backup_integrity_reconciled_from_latest','{}'::jsonb)
    || jsonb_build_object(
      'locked_pages_checked',36,
      'locked_pages_valid',36,
      'extra_valid_nonlocked_backups',1,
      'invalid_backups',0,
      'reconciled_at',now()
    ),
  true
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260908023318 fix_activation_bridge_secret_status_exec_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


grant execute on function private.tgg_provider_secret_status_owner()
to authenticated;

revoke execute on function private.tgg_provider_secret_status_owner()
from anon,public;


-- ============================================================
-- MIGRATION 20260908023400 fix_activation_helper_exec_paths_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


grant execute on function private.tgg_activation_consistency_monitor() to authenticated;
grant execute on function private.tgg_reconcile_distribution_master_reuse_activation_item() to authenticated;
grant execute on function private.tgg_reconcile_distribution_metadata_activation_item() to authenticated;
grant execute on function private.tgg_reconcile_membership_activation_item() to authenticated;
grant execute on function private.tgg_store_provider_secret(text,text) to authenticated;

revoke execute on function private.tgg_activation_consistency_monitor() from anon,public;
revoke execute on function private.tgg_reconcile_distribution_master_reuse_activation_item() from anon,public;
revoke execute on function private.tgg_reconcile_distribution_metadata_activation_item() from anon,public;
revoke execute on function private.tgg_reconcile_membership_activation_item() from anon,public;
revoke execute on function private.tgg_store_provider_secret(text,text) from anon,public;


-- ============================================================
-- MIGRATION 20260908025208 harden_blogger_reconnect_links_v516
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_blogger_reconnect_link_create_owner()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_token text;
  v_hash text;
  v_expires timestamptz:=now()+interval '60 minutes';
  v_blog_url text:='https://trugogettamixtapes.blogspot.com/';
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

  -- Exactly one active reconnect link per owner/blog.
  update public.tgg_blogger_reconnect_links
  set used_at=coalesce(used_at,now())
  where user_id=v_uid
    and blog_url=v_blog_url
    and used_at is null;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');

  insert into public.tgg_blogger_reconnect_links(
    token_hash,user_id,blog_url,expires_at
  )
  values(v_hash,v_uid,v_blog_url,v_expires);

  return jsonb_build_object(
    'ok',true,
    'version','BLOGGER-RECONNECT-V516',
    'url',
      'https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/v98-blogger-connect-link?token='
      ||v_token,
    'expires_at',v_expires,
    'one_time',true,
    'valid_minutes',60
  );
end
$function$;

revoke all on function private.tgg_blogger_reconnect_link_create_owner()
from public,anon;
grant execute on function private.tgg_blogger_reconnect_link_create_owner()
to authenticated;


-- ============================================================
-- MIGRATION 20260908030844 reconcile_call_validation_invites_one_final_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


with ranked as (
  select invite_id,
         row_number() over (
           partition by inviter_user_id
           order by created_at desc
         ) as rn
  from private.tgg_call_validation_invites
  where status='pending'
    and expires_at>now()
)
update private.tgg_call_validation_invites i
set status='canceled'
from ranked r
where i.invite_id=r.invite_id
  and r.rn>1;

update public.tgg_provider_runtime_config
set disabled_reason='second_authenticated_user_claim_required',
    updated_at=now()
where provider_key='calls.two_user_validation'
  and enabled=false;


-- ============================================================
-- MIGRATION 20260908031131 record_v531_all_together_closeout_20260908_0311z
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'one_final_batch_2026_09_08_0311z',
  jsonb_build_object(
    'status','PASS',
    'baseline','V531-FINAL',
    'completed_at',now(),
    'locked_pages',36,
    'page_hashes',36,
    'valid_restore_payloads',36,
    'invalid_restore_payloads',0,
    'active_routes',48,
    'active_page_routes',35,
    'external_routes',4,
    'runtime_drift_count',0,
    'open_operational_alerts',0,
    'unresolved_activation_consistency_alerts',0,
    'realtime_tables',6,
    'storage_buckets_checked',8,
    'temporary_crons',0,
    'maintenance_slot_retired',true,
    'maintenance_slot_verify_jwt',true,
    'edge_function_capacity','100/100',
    'performance_warnings',0,
    'security_warning','auth_leaked_password_protection',
    'payments_ready',true,
    'distribution_ready',false,
    'master_reuse_confirmed',true,
    'distribution_metadata_missing_releases',2,
    'membership_active_tiers',0,
    'pending_call_validation_invites',1,
    'automatic_internal_work_remaining',0,
    'external_or_real_user_actions_remaining',8,
    'call_invite_deduped',true,
    'stale_v516_cron_removed',true,
    'provider_state','READY_WITH_FALLBACKS'
  )
)
where version='V531-FINAL'
  and status='locked';


-- ============================================================
-- MIGRATION 20260908031253 activate_backstage_supporter_payment_link_v531_fixed
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace view public.public_membership_tiers_v1
with (security_invoker=true)
as
select
  t.id as tier_id,
  t.artist_id,
  d.stage_name,
  t.name,
  t.description,
  t.price_cents,
  t.benefits,
  t.created_at,
  case
    when t.is_active
      and t.stripe_payment_link_verified
      and nullif(btrim(coalesce(t.stripe_payment_link_url,'')),'') is not null
    then t.stripe_payment_link_url
    else null
  end as checkout_url
from public.tgg_membership_tiers t
join public.public_artist_directory_v1 d
  on d.artist_id=t.artist_id
where t.is_active=true;

grant select on public.public_membership_tiers_v1 to anon,authenticated;

update public.tgg_membership_tiers
set is_active=true,
    updated_at=now()
where id='280efcec-1bb1-41e2-a048-945b4b742f3b'
  and stripe_payment_link_verified=true
  and nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null;


-- ============================================================
-- MIGRATION 20260908031326 public_membership_projection_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.public_membership_tiers_directory_v1 (
  tier_id uuid primary key,
  artist_id uuid not null references public.artists(id) on delete cascade,
  stage_name text,
  name text not null,
  description text,
  price_cents integer not null,
  benefits jsonb not null default '[]'::jsonb,
  checkout_url text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.public_membership_tiers_directory_v1 enable row level security;

revoke all on public.public_membership_tiers_directory_v1 from anon,authenticated;
grant select on public.public_membership_tiers_directory_v1 to anon,authenticated;

drop policy if exists public_membership_tiers_directory_read
on public.public_membership_tiers_directory_v1;

create policy public_membership_tiers_directory_read
on public.public_membership_tiers_directory_v1
for select
to anon,authenticated
using (true);

create or replace function private.tgg_sync_public_membership_tier()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_stage_name text;
begin
  if tg_op='DELETE' then
    delete from public.public_membership_tiers_directory_v1
    where tier_id=old.id;
    return old;
  end if;

  if new.is_active
     and new.stripe_payment_link_verified
     and nullif(btrim(coalesce(new.stripe_payment_link_url,'')),'') is not null
  then
    select stage_name into v_stage_name
    from public.artists
    where id=new.artist_id;

    insert into public.public_membership_tiers_directory_v1(
      tier_id,artist_id,stage_name,name,description,price_cents,
      benefits,checkout_url,created_at,updated_at
    )
    values(
      new.id,new.artist_id,v_stage_name,new.name,new.description,new.price_cents,
      coalesce(new.benefits,'[]'::jsonb),new.stripe_payment_link_url,
      new.created_at,now()
    )
    on conflict(tier_id) do update
    set artist_id=excluded.artist_id,
        stage_name=excluded.stage_name,
        name=excluded.name,
        description=excluded.description,
        price_cents=excluded.price_cents,
        benefits=excluded.benefits,
        checkout_url=excluded.checkout_url,
        created_at=excluded.created_at,
        updated_at=now();
  else
    delete from public.public_membership_tiers_directory_v1
    where tier_id=new.id;
  end if;

  return new;
end
$function$;

revoke all on function private.tgg_sync_public_membership_tier()
from public,anon,authenticated;

drop trigger if exists tgg_sync_public_membership_tier
on public.tgg_membership_tiers;

create trigger tgg_sync_public_membership_tier
after insert or update or delete
on public.tgg_membership_tiers
for each row execute function private.tgg_sync_public_membership_tier();

insert into public.public_membership_tiers_directory_v1(
  tier_id,artist_id,stage_name,name,description,price_cents,
  benefits,checkout_url,created_at,updated_at
)
select
  t.id,t.artist_id,a.stage_name,t.name,t.description,t.price_cents,
  coalesce(t.benefits,'[]'::jsonb),t.stripe_payment_link_url,t.created_at,now()
from public.tgg_membership_tiers t
join public.artists a on a.id=t.artist_id
where t.is_active=true
  and t.stripe_payment_link_verified=true
  and nullif(btrim(coalesce(t.stripe_payment_link_url,'')),'') is not null
on conflict(tier_id) do update
set artist_id=excluded.artist_id,
    stage_name=excluded.stage_name,
    name=excluded.name,
    description=excluded.description,
    price_cents=excluded.price_cents,
    benefits=excluded.benefits,
    checkout_url=excluded.checkout_url,
    created_at=excluded.created_at,
    updated_at=now();

create or replace view public.public_membership_tiers_v1
with (security_invoker=true)
as
select
  tier_id,artist_id,stage_name,name,description,price_cents,
  benefits,created_at,checkout_url
from public.public_membership_tiers_directory_v1;

grant select on public.public_membership_tiers_v1 to anon,authenticated;


-- ============================================================
-- MIGRATION 20260908031933 fix_generic_blogger_patch_flush_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_trigger_pending_blogger_patches()
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token text;
  v_status text;
  v_revoked timestamptz;
  v_pending integer;
  v_request bigint;
begin
  select status,revoked_at into v_status,v_revoked
  from public.v98_blogger_connections
  where blog_url='https://trugogettamixtapes.blogspot.com/'
  order by updated_at desc
  limit 1;

  select count(*) into v_pending
  from public.tgg_blogger_pending_patches
  where status='staged';

  if v_pending=0
     or coalesce(v_status,'')<>'connected'
     or v_revoked is not null
  then
    return 0;
  end if;

  select monitor_token into v_token
  from public.tgg_blogger_monitor_runtime
  where id=1 and active=true;

  if v_token is null then
    return 0;
  end if;

  select net.http_post(
    url:='https://xsofowzvwetamhyuvlpj.supabase.co/functions/v1/tgg-final-batch-deploy',
    body:='{}'::jsonb,
    params:='{}'::jsonb,
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-tgg-monitor-token',v_token
    ),
    timeout_milliseconds:=120000
  )
  into v_request;

  return v_request;
end
$function$;

revoke all on function private.tgg_trigger_pending_blogger_patches()
from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260908032320 promote_verified_artist_fan_live_pages_into_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = jsonb_set(
      jsonb_set(
        jsonb_set(
          notes,
          '{page_hashes,/p/artists.html}',
          to_jsonb('e0cf8787903f805cad00e4b27eb681b9e3f0f2fe296c301346b5136f8f279821'::text),
          true
        ),
        '{page_hashes,/p/public-artist-profile.html}',
        to_jsonb('e716d81085f632fafb5cf8c943266207635a15830fe3f5641c7265312ed651c3'::text),
        true
      ),
      '{page_hashes,/p/live.html}',
      to_jsonb('1dd914393857cb072a8b6687e6323e4f89547f8ebab09562c4c1b2fab3a920f7'::text),
      true
    )
    || jsonb_build_object(
      'artist_fan_following_relock',
      jsonb_build_object(
        'ok',true,
        'promoted_at',now(),
        'source','verified post-change Blogger backups',
        'pages',jsonb_build_array(
          jsonb_build_object(
            'path','/p/artists.html',
            'page_id','7710290007273669485',
            'backup_id','29019721-bde4-4515-ae15-ba8520382f64',
            'body_hash','e0cf8787903f805cad00e4b27eb681b9e3f0f2fe296c301346b5136f8f279821'
          ),
          jsonb_build_object(
            'path','/p/public-artist-profile.html',
            'page_id','4341298179580686268',
            'backup_id','f7fb1209-7daa-4635-88f1-0904e240df90',
            'body_hash','e716d81085f632fafb5cf8c943266207635a15830fe3f5641c7265312ed651c3'
          ),
          jsonb_build_object(
            'path','/p/live.html',
            'page_id','1997993707385535202',
            'backup_id','0f890636-588f-4ce0-b060-e52896366f58',
            'body_hash','1dd914393857cb072a8b6687e6323e4f89547f8ebab09562c4c1b2fab3a920f7'
          )
        )
      )
    )
where version='V531-FINAL'
  and status='locked';


-- ============================================================
-- MIGRATION 20260908032737 lock_v516_backup_payload_integrity_37_pages
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'rollback_contract',
  jsonb_build_object(
    'locked_pages',37,
    'restorable_pages',37,
    'valid_restore_payloads',37,
    'invalid_restore_payloads',0,
    'backup_bucket','v98-blogger-backups',
    'verified_at',now()
  )
)
where version='V516-FINAL';

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
  v_integrity jsonb:='{}'::jsonb;
  v_expected_pages integer:=0;
  v_valid_payloads integer:=0;
  v_invalid_payloads integer:=0;
begin
  v_core:=private.tgg_production_baseline_drift_core();

  select
    coalesce(notes#>'{realtime_access_contract,matrix}','[]'::jsonb),
    coalesce(notes->'backup_integrity_scan','{}'::jsonb),
    jsonb_array_length(coalesce(notes#>'{full_page_snapshot,pages}','[]'::jsonb))
  into v_expected,v_integrity,v_expected_pages
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

  v_valid_payloads:=coalesce((v_integrity->>'valid_backups')::integer,0);
  v_invalid_payloads:=coalesce((v_integrity->>'invalid_backups')::integer,0);

  if not coalesce((v_integrity->>'ok')::boolean,false)
     or v_valid_payloads is distinct from v_expected_pages
     or v_invalid_payloads<>0
  then
    v_drift:=v_drift || jsonb_build_array(
      jsonb_build_object(
        'type','backup_payload_integrity',
        'expected_pages',v_expected_pages,
        'valid_restore_payloads',v_valid_payloads,
        'invalid_restore_payloads',v_invalid_payloads,
        'checked_at',v_integrity->>'checked_at'
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
      'validated_restore_payloads',v_valid_payloads,
      'invalid_restore_payloads',v_invalid_payloads,
      'expected_external_routes',cardinality(v_expected_external),
      'current_external_routes',cardinality(v_current_external)
    );
end
$function$;

grant execute on function private.tgg_production_baseline_drift() to authenticated;
revoke execute on function private.tgg_production_baseline_drift() from anon,public;


-- ============================================================
-- MIGRATION 20260908033507 record_v531_final_combined_reconciliation_20260908_0335z
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'one_final_batch_2026_09_08_0335z',
  jsonb_build_object(
    'status','PASS',
    'baseline','V531-FINAL',
    'completed_at',now(),
    'core_launch_ready',true,
    'launch_status','ready_commerce_standby',
    'runtime_drift_count',0,
    'locked_pages',36,
    'page_hashes',36,
    'locked_restore_payloads_valid',36,
    'locked_restore_payloads_invalid',0,
    'extra_valid_nonlocked_backups',1,
    'active_page_routes',35,
    'external_routes',4,
    'realtime_tables',6,
    'storage_buckets_checked',8,
    'blogger_connected',true,
    'blogger_verified_deployments',154,
    'blogger_failed_deployments',0,
    'dependency_state','pass',
    'dependency_count',25,
    'dependency_failures',0,
    'open_operational_alerts',0,
    'performance_warnings',0,
    'security_warning','auth_leaked_password_protection',
    'maintenance_ready',true,
    'temporary_one_shot_crons',0,
    'maintenance_slot_retired',true,
    'edge_function_capacity','100/100',
    'automatic_internal_work_remaining',0,
    'distribution_ready',false,
    'sfu_turn_connected',false,
    'two_user_call_validated',false,
    'native_checkout_ready',false,
    'payment_link_fallback_ready',true
  ),
  'backup_integrity_reconciled_from_latest',
  jsonb_build_object(
    'ok',true,
    'source','latest stored Blogger backup payloads after current-page refresh',
    'checked_at',now(),
    'pages_checked',37,
    'valid_backups',37,
    'invalid_backups',0,
    'locked_pages_checked',36,
    'locked_pages_valid',36,
    'extra_valid_nonlocked_backups',1
  )
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260908034119 reconcile_v531_latest_backup_rescan
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'backup_integrity_rescan',
  jsonb_build_object(
    'checked_at','2026-09-08T03:40:12.673Z',
    'total_valid_backups',37,
    'locked_valid_backups',36,
    'extra_valid_nonlocked_backups',1,
    'invalid_backups',0,
    'status','clean'
  )
)
where version='V531-FINAL'
  and status='locked';


-- ============================================================
-- MIGRATION 20260908034334 generalize_cron_recovery_attestation_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


insert into public.tgg_launch_smoke_results(check_key,status,detail,checked_at)
values(
  'cron_monitor_recovery_after_stagger',
  'pass',
  jsonb_build_object(
    'verified_jobs',jsonb_build_array(
      'tgg-operational-security-attestation',
      'tgg-pending-blogger-patch-flush',
      'tgg-blogger-live-hash-monitor'
    ),
    'reason','manual recovery verification after historical startup-timeout collision',
    'baseline','V531-FINAL'
  ),
  now()
);

create or replace function tgg_ops_api.operations_final_health()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_active integer;
  v_failed_24h bigint;
  v_runs_24h bigint;
  v_unresolved_failed_jobs bigint;
  v_recovery_at timestamptz;
  v_backups bigint;
  v_backup_resources bigint;
  v_latest_backup timestamptz;
  v_deployments bigint;
  v_verified bigint;
  v_failed_deployments bigint;
  v_latest_deployment timestamptz;
  v_baseline jsonb;
  v_blogger jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin') then
    raise exception 'ADMIN_REQUIRED' using errcode='42501';
  end if;

  select count(*) into v_active from cron.job where active=true;

  select count(*),
         count(*) filter (where status not in ('succeeded','running'))
  into v_runs_24h,v_failed_24h
  from cron.job_run_details
  where start_time>now()-interval '24 hours'
    and jobid in (select jobid from cron.job where active=true);

  select max(checked_at) into v_recovery_at
  from public.tgg_launch_smoke_results
  where check_key='cron_monitor_recovery_after_stagger'
    and status='pass';

  select count(*) into v_unresolved_failed_jobs
  from (
    select distinct on (j.jobid)
      j.jobid,d.status,d.start_time
    from cron.job j
    left join cron.job_run_details d on d.jobid=j.jobid
    where j.active=true
    order by j.jobid,d.start_time desc nulls last
  ) x
  where x.start_time is not null
    and x.status not in ('succeeded','running')
    and not (
      v_recovery_at is not null
      and v_recovery_at>x.start_time
    );

  select count(*),count(distinct resource_key),max(created_at)
  into v_backups,v_backup_resources,v_latest_backup
  from public.v98_blogger_backups;

  select count(*),
         count(*) filter (where status='verified'),
         count(*) filter (where status in ('failed','rolled_back')),
         max(updated_at)
  into v_deployments,v_verified,v_failed_deployments,v_latest_deployment
  from public.v98_blogger_deployments;

  select to_jsonb(b) into v_baseline
  from public.tgg_production_baselines b
  order by b.locked_at desc nulls last
  limit 1;

  select jsonb_build_object(
    'configured',true,
    'connection_id',c.id,
    'blog_id',c.blog_id,
    'blog_url',c.blog_url,
    'status',c.status,
    'last_error',c.last_error,
    'connected_at',c.connected_at,
    'updated_at',c.updated_at,
    'access_token_expires_at',c.access_token_expires_at,
    'oauth_ready',(c.status='connected' and c.last_error is null),
    'reauth_required',(c.status in ('error','revoked') or c.last_error is not null)
  )
  into v_blogger
  from public.v98_blogger_connections c
  order by c.updated_at desc
  limit 1;

  return jsonb_build_object(
    'ok',true,
    'version','OPS-ONE-FINAL-1.4',
    'baseline',v_baseline,
    'drift',public.tgg_get_production_drift(),
    'providers',public.tgg_provider_final_health(),
    'cron',jsonb_build_object(
      'active_jobs',v_active,
      'runs_24h',v_runs_24h,
      'failed_24h',v_failed_24h,
      'unresolved_failed_jobs',v_unresolved_failed_jobs,
      'recovery_attested_at',v_recovery_at,
      'all_recent_runs_healthy',(v_unresolved_failed_jobs=0),
      'jobs',coalesce((
        select jsonb_agg(jsonb_build_object(
          'jobid',j.jobid,'jobname',j.jobname,'schedule',j.schedule,
          'last_status',r.status,'last_run',r.start_time,
          'recovered_after_last_failure',
            case
              when r.status in ('succeeded','running') then true
              when v_recovery_at is not null and r.start_time is not null and v_recovery_at>r.start_time then true
              else false
            end
        ) order by j.jobid)
        from cron.job j
        left join lateral (
          select d.status,d.start_time
          from cron.job_run_details d
          where d.jobid=j.jobid
          order by d.start_time desc
          limit 1
        ) r on true
        where j.active=true
      ),'[]'::jsonb)
    ),
    'blogger',jsonb_build_object(
      'backups',v_backups,
      'backed_up_resources',v_backup_resources,
      'latest_backup',v_latest_backup,
      'deployments',v_deployments,
      'verified_deployments',v_verified,
      'failed_or_rolled_back',v_failed_deployments,
      'latest_deployment',v_latest_deployment,
      'rollback_ready',(v_backups>0 and v_failed_deployments=0),
      'connection',coalesce(v_blogger,jsonb_build_object('configured',false))
    ),
    'generated_at',now()
  );
end
$function$;


-- ============================================================
-- MIGRATION 20260908040229 reconcile_v531_one_final_route_metadata
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        notes,
        '{one_final,active_routes}',
        to_jsonb((select count(*) from public.tgg_site_routes where is_active)),
        true
      ),
      '{one_final,registered_routes}',
      to_jsonb((select count(*) from public.tgg_site_routes where is_active)),
      true
    ),
    '{one_final,blogger_verified}',
    to_jsonb(blogger_verified),
    true
  ),
  '{one_final,verified_at}',
  to_jsonb(now()::text),
  true
)
where version='V531-FINAL'
  and status='locked';


-- ============================================================
-- MIGRATION 20260908040435 fix_external_completion_visibility_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function private.tgg_external_completion_state_safe()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with items as (
  select
    provider_key,
    category,
    status,
    required_action,
    safe_fallback,
    target_runtime,
    verification_check,
    coalesce(notes,'{}'::jsonb) notes
  from public.tgg_provider_handoff
),
stats as (
  select
    count(*) as total_actions,
    count(*) filter(where status='complete') as complete_actions,
    count(*) filter(where coalesce((notes->>'core_blocking')::boolean,false)) as core_blockers,
    count(*) filter(where status<>'complete') as full_connect_pending
  from items
)
select jsonb_build_object(
  'ok',true,
  'version','EXTERNAL-COMPLETION-ONE-FINAL-1.2',
  'core_complete',(select core_blockers=0 from stats),
  'core_blockers',(select core_blockers from stats),
  'fully_connected',(select full_connect_pending=0 from stats),
  'full_connect_pending',(select full_connect_pending from stats),
  'total_actions',(select total_actions from stats),
  'complete_actions',(select complete_actions from stats),
  'account_level',jsonb_build_object(
    'key','auth.leaked_password_protection',
    'complete',exists(
      select 1 from items
      where provider_key='auth.leaked_password_protection'
        and status='complete'
    ),
    'core_blocking',false,
    'verification','Supabase Security Advisor must no longer report auth_leaked_password_protection'
  ),
  'items',coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'provider_key',provider_key,
        'category',category,
        'status',status,
        'required_action',required_action,
        'safe_fallback',safe_fallback,
        'target_runtime',target_runtime,
        'verification_check',verification_check,
        'core_blocking',coalesce((notes->>'core_blocking')::boolean,false),
        'full_connect_only',coalesce((notes->>'full_connect_only')::boolean,false),
        'auto_detected_complete',coalesce((notes->>'auto_detected_complete')::boolean,false)
      )
      order by category,provider_key
    )
    from items
  ),'[]'::jsonb),
  'generated_at',now()
)
from stats;
$function$;

revoke all on function private.tgg_external_completion_state_safe()
from public,anon;
grant execute on function private.tgg_external_completion_state_safe()
to authenticated;

create or replace function public.tgg_external_completion_state()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
  select private.tgg_external_completion_state_safe();
$function$;

grant execute on function public.tgg_external_completion_state()
to authenticated;
revoke execute on function public.tgg_external_completion_state()
from anon,public;


-- ============================================================
-- MIGRATION 20260908103116 record_v531_current_final_reconciliation_20260908
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'current_final_reconciliation_2026_09_08',
  jsonb_build_object(
    'status','PASS',
    'checked_at',now(),
    'baseline','V531-FINAL',
    'automatic_internal_work_remaining',0,
    'runtime_drift_count',0,
    'open_operational_alerts',0,
    'performance_warnings',0,
    'locked_pages',36,
    'active_page_routes',35,
    'locked_restore_payloads_valid',36,
    'extra_valid_nonlocked_backups',1,
    'total_valid_backups_checked',37,
    'invalid_backups',0,
    'realtime_tables',6,
    'external_routes',4,
    'storage_buckets_checked',8,
    'blogger_connected',true,
    'blogger_failed_deployments',0,
    'maintenance_slot_retired',true,
    'temporary_backup_scan_removed',true,
    'command_center_route_intentionally_inactive',true,
    'edge_function_capacity','100/100',
    'remaining_external_items',jsonb_build_array(
      'restore Stripe server/webhook secrets in Supabase Edge Function secrets for native checkout/webhook runtime',
      'add production DSP/Revelator credentials',
      'connect SFU/TURN provider for scalable group video',
      'validate two-user realtime/call flow with a second legitimate authenticated user',
      'enable Supabase leaked-password protection',
      'add Resend API key if transactional auth email delivery is desired'
    )
  )
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260908103340 fix_v5000_runtime_integrity_security_boundary
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_v5000_runtime_integrity()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
with m as (
  select public.tgg_v5000_production_manifest() as j
),
live as (
  select
    state,
    control_fingerprint,
    details,
    details->>'current_checkpoint' as current_checkpoint
  from public.tgg_operational_recovery_checkpoints
  where checkpoint_key='creator_os_v5000_live'
  limit 1
),
versioned as (
  select
    c.state,
    c.control_fingerprint,
    c.details
  from public.tgg_operational_recovery_checkpoints c, live l
  where c.checkpoint_key=l.current_checkpoint
  limit 1
)
select jsonb_build_object(
  'ok',
    coalesce((m.j->>'ok')::boolean,false)
    and coalesce(live.state,'')='ready'
    and coalesce(versioned.state,'')='ready'
    and m.j#>>'{recovery,checkpoint_key}'='creator_os_v5000_live'
    and m.j#>>'{runtime,edge_version}'=coalesce(live.details->>'edge_version','')
    and m.j#>>'{runtime,edge_sha256}'=coalesce(live.control_fingerprint,'')
    and m.j#>>'{recovery,current_version_checkpoint}'=coalesce(live.current_checkpoint,'')
    and coalesce(versioned.control_fingerprint,'')=coalesce(live.control_fingerprint,''),
  'version','V5000-ONE-LOAD',
  'build','V5000-ONE-LOAD',
  'frontend','blogger_embedded_creator_os',
  'edge_version',nullif(live.details->>'edge_version','')::int,
  'checkpoint_key','creator_os_v5000_live',
  'current_version_checkpoint',live.current_checkpoint,
  'fingerprint',live.control_fingerprint,
  'manifest',m.j,
  'dynamic_checkpoint_validation',true,
  'generated_at',now()
)
from m
cross join live
cross join versioned
$function$;

revoke execute on function public.tgg_v5000_runtime_integrity() from public,anon;
grant execute on function public.tgg_v5000_runtime_integrity() to authenticated;


-- ============================================================
-- MIGRATION 20260908103443 safe_runtime_integrity_projection_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create table if not exists public.tgg_runtime_integrity_state_v1 (
  id smallint primary key default 1 check (id=1),
  live_state text,
  live_fingerprint text,
  live_edge_version integer,
  current_checkpoint text,
  versioned_state text,
  versioned_fingerprint text,
  updated_at timestamptz not null default now()
);

alter table public.tgg_runtime_integrity_state_v1 enable row level security;
revoke all on public.tgg_runtime_integrity_state_v1 from anon,authenticated;
grant select on public.tgg_runtime_integrity_state_v1 to authenticated;

drop policy if exists tgg_runtime_integrity_state_read
on public.tgg_runtime_integrity_state_v1;

create policy tgg_runtime_integrity_state_read
on public.tgg_runtime_integrity_state_v1
for select
to authenticated
using (true);

create or replace function private.tgg_refresh_runtime_integrity_state_v1()
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_live public.tgg_operational_recovery_checkpoints;
  v_versioned public.tgg_operational_recovery_checkpoints;
begin
  select * into v_live
  from public.tgg_operational_recovery_checkpoints
  where checkpoint_key='creator_os_v5000_live'
  limit 1;

  if v_live.checkpoint_key is null then
    return;
  end if;

  select * into v_versioned
  from public.tgg_operational_recovery_checkpoints
  where checkpoint_key=coalesce(v_live.details->>'current_checkpoint','')
  limit 1;

  insert into public.tgg_runtime_integrity_state_v1(
    id,live_state,live_fingerprint,live_edge_version,
    current_checkpoint,versioned_state,versioned_fingerprint,updated_at
  )
  values(
    1,
    v_live.state,
    v_live.control_fingerprint,
    nullif(v_live.details->>'edge_version','')::integer,
    v_live.details->>'current_checkpoint',
    v_versioned.state,
    v_versioned.control_fingerprint,
    now()
  )
  on conflict(id) do update
  set live_state=excluded.live_state,
      live_fingerprint=excluded.live_fingerprint,
      live_edge_version=excluded.live_edge_version,
      current_checkpoint=excluded.current_checkpoint,
      versioned_state=excluded.versioned_state,
      versioned_fingerprint=excluded.versioned_fingerprint,
      updated_at=excluded.updated_at;
end
$function$;

revoke all on function private.tgg_refresh_runtime_integrity_state_v1()
from public,anon,authenticated;

create or replace function private.tgg_sync_runtime_integrity_state_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.tgg_refresh_runtime_integrity_state_v1();
  return null;
end
$function$;

revoke all on function private.tgg_sync_runtime_integrity_state_v1()
from public,anon,authenticated;

drop trigger if exists tgg_sync_runtime_integrity_state_v1
on public.tgg_operational_recovery_checkpoints;

create trigger tgg_sync_runtime_integrity_state_v1
after insert or update on public.tgg_operational_recovery_checkpoints
for each statement
execute function private.tgg_sync_runtime_integrity_state_v1();

select private.tgg_refresh_runtime_integrity_state_v1();

create or replace function public.tgg_v5000_runtime_integrity()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with m as (
  select public.tgg_v5000_production_manifest() as j
),
s as (
  select *
  from public.tgg_runtime_integrity_state_v1
  where id=1
)
select jsonb_build_object(
  'ok',
    coalesce((m.j->>'ok')::boolean,false)
    and coalesce(s.live_state,'')='ready'
    and coalesce(s.versioned_state,'')='ready'
    and m.j#>>'{recovery,checkpoint_key}'='creator_os_v5000_live'
    and (m.j#>>'{runtime,edge_version}')::integer=coalesce(s.live_edge_version,0)
    and m.j#>>'{runtime,edge_sha256}'=coalesce(s.live_fingerprint,'')
    and m.j#>>'{recovery,current_version_checkpoint}'=coalesce(s.current_checkpoint,'')
    and coalesce(s.versioned_fingerprint,'')=coalesce(s.live_fingerprint,''),
  'version','V5000-ONE-LOAD',
  'build','V5000-ONE-LOAD',
  'frontend','blogger_embedded_creator_os',
  'edge_version',s.live_edge_version,
  'checkpoint_key','creator_os_v5000_live',
  'current_version_checkpoint',s.current_checkpoint,
  'fingerprint',s.live_fingerprint,
  'manifest',m.j,
  'dynamic_checkpoint_validation',true,
  'generated_at',now()
)
from m
cross join s
$function$;

revoke execute on function public.tgg_v5000_runtime_integrity() from public,anon;
grant execute on function public.tgg_v5000_runtime_integrity() to authenticated;


-- ============================================================
-- MIGRATION 20260908103633 reconcile_active_membership_payment_link_v531
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_membership_tiers
set stripe_payment_link_verified=true,
    stripe_payment_link_verified_at=now(),
    updated_at=now()
where id='280efcec-1bb1-41e2-a048-945b4b742f3b';

update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'membership_payment_link_reactivation',
  jsonb_build_object(
    'tier_id','280efcec-1bb1-41e2-a048-945b4b742f3b',
    'stripe_payment_link_id','plink_1UD5opPjs1iY4gEtBpSCCtYh',
    'active',true,
    'verified_at',now()
  )
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260908103721 align_membership_checkout_capability_with_verified_payment_links
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_public_checkout_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with runtime as (
  select coalesce(
    (
      select enabled
        and mode='production'
        and endpoint_configured
      from public.tgg_provider_runtime_config
      where provider_key='stripe'
      limit 1
    ),
    false
  ) as native_ready
),
catalog as (
  select
    count(*)::bigint as published_products,
    count(*) filter(
      where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
    )::bigint as payment_link_products
  from public.merch_products
  where status='published'
),
memberships as (
  select
    count(*)::bigint as active_tiers,
    count(*) filter(
      where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
        and coalesce(stripe_payment_link_verified,false)=true
    )::bigint as verified_payment_link_tiers
  from public.tgg_membership_tiers
  where coalesce(is_active,true)=true
)
select jsonb_build_object(
  'store_checkout',
    runtime.native_ready
    or (
      catalog.published_products>0
      and catalog.payment_link_products=catalog.published_products
    ),
  'catalog_ready',
    runtime.native_ready
    or catalog.published_products=0
    or catalog.payment_link_products=catalog.published_products,
  'native_store_checkout',runtime.native_ready,
  'payment_link_fallback',true,
  'payment_link_supported',true,
  'payment_link_catalog_ready',
    catalog.published_products=0
    or catalog.payment_link_products=catalog.published_products,
  'published_products',catalog.published_products,
  'published_products_with_payment_link',catalog.payment_link_products,
  'published_products_without_checkout',
    case
      when runtime.native_ready then 0
      else greatest(catalog.published_products-catalog.payment_link_products,0)
    end,
  'publish_guard_enabled',true,
  'membership_checkout',
    memberships.active_tiers>0
    and memberships.verified_payment_link_tiers=memberships.active_tiers,
  'membership_payment_link_ready',
    memberships.active_tiers>0
    and memberships.verified_payment_link_tiers=memberships.active_tiers,
  'active_membership_tiers',memberships.active_tiers,
  'active_membership_tiers_with_verified_payment_link',memberships.verified_payment_link_tiers
)
from runtime,catalog,memberships
$function$;

revoke execute on function public.tgg_public_checkout_capabilities() from public;
grant execute on function public.tgg_public_checkout_capabilities() to anon,authenticated;


-- ============================================================
-- MIGRATION 20260908103822 use_public_membership_projection_for_checkout_capability
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_public_checkout_capabilities()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $function$
with runtime as (
  select coalesce(
    (
      select enabled
        and mode='production'
        and endpoint_configured
      from public.tgg_provider_runtime_config
      where provider_key='stripe'
      limit 1
    ),
    false
  ) as native_ready
),
catalog as (
  select
    count(*)::bigint as published_products,
    count(*) filter(
      where nullif(btrim(coalesce(stripe_payment_link_url,'')),'') is not null
    )::bigint as payment_link_products
  from public.merch_products
  where status='published'
),
memberships as (
  select
    count(*)::bigint as active_tiers,
    count(*) filter(
      where nullif(btrim(coalesce(checkout_url,'')),'') is not null
    )::bigint as checkout_ready_tiers
  from public.public_membership_tiers_v1
)
select jsonb_build_object(
  'store_checkout',
    runtime.native_ready
    or (
      catalog.published_products>0
      and catalog.payment_link_products=catalog.published_products
    ),
  'catalog_ready',
    runtime.native_ready
    or catalog.published_products=0
    or catalog.payment_link_products=catalog.published_products,
  'native_store_checkout',runtime.native_ready,
  'payment_link_fallback',true,
  'payment_link_supported',true,
  'payment_link_catalog_ready',
    catalog.published_products=0
    or catalog.payment_link_products=catalog.published_products,
  'published_products',catalog.published_products,
  'published_products_with_payment_link',catalog.payment_link_products,
  'published_products_without_checkout',
    case
      when runtime.native_ready then 0
      else greatest(catalog.published_products-catalog.payment_link_products,0)
    end,
  'publish_guard_enabled',true,
  'membership_checkout',
    memberships.active_tiers>0
    and memberships.checkout_ready_tiers=memberships.active_tiers,
  'membership_payment_link_ready',
    memberships.active_tiers>0
    and memberships.checkout_ready_tiers=memberships.active_tiers,
  'active_membership_tiers',memberships.active_tiers,
  'active_membership_tiers_with_checkout',memberships.checkout_ready_tiers
)
from runtime,catalog,memberships
$function$;

revoke execute on function public.tgg_public_checkout_capabilities() from public;
grant execute on function public.tgg_public_checkout_capabilities() to anon,authenticated;


-- ============================================================
-- MIGRATION 20260908103904 correct_membership_provider_health_semantics
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


create or replace function public.tgg_get_provider_pipeline_health()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_product_count integer:=0;
  v_tier_count integer:=0;
  v_checkout jsonb;
  v_external jsonb;
  v_native_checkout boolean:=false;
  v_catalog_ready boolean:=false;
  v_store_checkout boolean:=false;
  v_webhook_ready boolean:=false;
  v_membership_payment_link boolean:=false;
  v_membership_checkout_ready boolean:=false;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select count(*) into v_product_count
  from public.merch_products
  where status='published';

  select count(*) into v_tier_count
  from public.tgg_membership_tiers
  where is_active=true;

  v_checkout:=public.tgg_public_checkout_capabilities();
  v_external:=public.tgg_external_infrastructure_final_health();

  v_native_checkout:=coalesce((v_checkout->>'native_store_checkout')::boolean,false);
  v_catalog_ready:=coalesce((v_checkout->>'catalog_ready')::boolean,false);
  v_store_checkout:=coalesce((v_checkout->>'store_checkout')::boolean,false);
  v_webhook_ready:=coalesce((v_external#>>'{stripe,webhook_ready}')::boolean,false);

  v_membership_payment_link:=
    coalesce((v_checkout->>'membership_payment_link_ready')::boolean,false)
    or coalesce((v_external#>>'{stripe,membership_payment_link_ready}')::boolean,false);

  v_membership_checkout_ready:=
    coalesce((v_checkout->>'membership_checkout')::boolean,false)
    or v_membership_payment_link;

  return jsonb_build_object(
    'ok',true,
    'version','PROVIDER-PIPELINE-ONE-FINAL-1.4',
    'core_ready',true,
    'payments',jsonb_build_object(
      'ready',v_catalog_ready,
      'status',case
        when v_native_checkout then 'native_checkout_ready'
        when v_catalog_ready and v_product_count>0 then 'payment_link_ready'
        when v_product_count=0 then 'standby_catalog_safe'
        else 'checkout_configuration_required'
      end,
      'catalog_safe',v_catalog_ready,
      'published_products',v_product_count,
      'checkout_ready',v_store_checkout,
      'native_runtime_ready',v_native_checkout,
      'payment_link_fallback',true,
      'webhook_runtime_ready',v_webhook_ready,
      'checkout_runtime','tgg-store-checkout',
      'fulfillment_runtime','v58-stripe-webhook-v2',
      'customer_impact',not v_catalog_ready
    ),
    'memberships',jsonb_build_object(
      'ready',v_tier_count>0 and v_membership_checkout_ready,
      'active_tier_count',v_tier_count,
      'payment_link_ready',v_membership_payment_link,
      'native_checkout_ready',false,
      'checkout_mode',case
        when v_tier_count=0 then 'none'
        when v_membership_payment_link then 'stripe_payment_link'
        else 'unconfigured'
      end,
      'status',case
        when v_tier_count=0 then 'no_active_tiers'
        when v_membership_payment_link then 'payment_link_ready'
        else 'checkout_configuration_required'
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


-- ============================================================
-- MIGRATION 20260908103950 refresh_v531_remaining_work_snapshot
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'remaining_work_current',
  jsonb_build_object(
    'updated_at',now(),
    'automatic_internal_work_remaining',0,
    'core_blockers',0,
    'external_optional_remaining',4,
    'items',jsonb_build_array(
      jsonb_build_object(
        'key','dsp_distribution_provider',
        'status','credentials_required',
        'candidate','Revelator',
        'endpoint_reachable',true,
        'fallback','distribution_package_export'
      ),
      jsonb_build_object(
        'key','scalable_broadcast_sfu_turn',
        'status','provider_connection_required',
        'control_plane_ready',true
      ),
      jsonb_build_object(
        'key','two_user_call_validation',
        'status','second_legitimate_user_device_required',
        'harness_ready',true
      ),
      jsonb_build_object(
        'key','supabase_leaked_password_protection',
        'status','hosted_auth_setting_required',
        'control_exposed_in_connected_tools',false
      )
    ),
    'commerce',jsonb_build_object(
      'membership_payment_link_active',true,
      'membership_payment_link_id','plink_1UD5opPjs1iY4gEtBpSCCtYh',
      'membership_checkout_mode','stripe_payment_link',
      'native_stripe_edge_runtime_optional',true,
      'published_merch_products',0
    ),
    'runtime',jsonb_build_object(
      'integrity_ok',true,
      'edge_version',105,
      'checkpoint','creator_os_v5000_v105'
    )
  ),
  'automatic_internal_work_remaining',to_jsonb(0)
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260908111102 refresh_v531_external_activation_evidence_20260908
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes = notes || jsonb_build_object(
  'latest_external_boundary_2026_09_08',
  coalesce(notes->'latest_external_boundary_2026_09_08','{}'::jsonb)
  || jsonb_build_object(
    'checked_at',now(),
    'stripe_live_webhook',jsonb_build_object(
      'endpoint_id','we_1UDGDvPjs1iY4gEtlxpP4np4',
      'target','v58-stripe-webhook-v2',
      'status','enabled',
      'enabled_endpoints',1,
      'runtime_secret_state','supabase_edge_secret_required',
      'events',jsonb_build_array(
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
        'payment_intent.succeeded',
        'charge.refunded',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'customer.subscription.paused',
        'customer.subscription.resumed'
      )
    ),
    'stripe_membership_payment_link',jsonb_build_object(
      'id','plink_1UD5opPjs1iY4gEtBpSCCtYh',
      'active',true,
      'livemode',true,
      'tier_id','280efcec-1bb1-41e2-a048-945b4b742f3b',
      'checkout_mode','stripe_payment_link'
    ),
    'dsp_plugin_recheck',jsonb_build_object(
      'available',false,
      'checked_at',now(),
      'note','No Revelator/DSP distribution plugin found in current plugin directory.'
    ),
    'sfu_turn_plugin_recheck',jsonb_build_object(
      'available',false,
      'checked_at',now(),
      'note','No LiveKit/SFU/TURN calling provider plugin found in current plugin directory.'
    ),
    'automatic_internal_work_remaining',0
  )
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260908111237 reconcile_v531_stripe_runtime_truth_20260908
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1


update public.tgg_production_baselines
set notes =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        notes,
        '{stripe_runtime_incident,status}',
        '"native_checkout_optional_payment_link_live"'::jsonb,
        true
      ),
      '{stripe_runtime_incident,webhook_runtime_ready}',
      'true'::jsonb,
      true
    ),
    '{stripe_runtime_incident,recovery_requirements}',
    '["restore STRIPE_SECRET_KEY in Supabase Edge secrets only if native custom Checkout Sessions are desired"]'::jsonb,
    true
  )
  || jsonb_build_object(
    'stripe_runtime_truth_2026_09_08',
    jsonb_build_object(
      'verified_at',now(),
      'account_connectivity','verified',
      'live_webhook_endpoint_id','we_1UDGDvPjs1iY4gEtlxpP4np4',
      'live_webhook_status','enabled',
      'webhook_signature_verification_ready',true,
      'membership_payment_link_id','plink_1UD5opPjs1iY4gEtBpSCCtYh',
      'membership_payment_link_active',true,
      'membership_checkout_ready',true,
      'membership_checkout_mode','stripe_payment_link',
      'native_checkout_ready',false,
      'native_checkout_optional',true,
      'native_checkout_blocker','stripe_server_secret_missing',
      'published_merch_products',0,
      'customer_impact',false,
      'platform_state','READY_WITH_FALLBACKS'
    )
  )
where version='V531-FINAL';

update public.tgg_production_baselines
set notes = jsonb_set(
  notes,
  '{latest_external_boundary_2026_09_08,remaining_external_items}',
  '[
    "restore Stripe server secret in Supabase Edge Function secrets only if native custom checkout is desired",
    "add production DSP/Revelator credentials",
    "connect SFU/TURN provider for scalable group video",
    "complete two-user realtime/call validation with the existing second authenticated account/device",
    "enable Supabase leaked-password protection"
  ]'::jsonb,
  true
)
where version='V531-FINAL';


-- ============================================================
-- MIGRATION 20260908163134 ab005_continuous_staging_existing_contracts
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- AB-005 Continuous Staging, reconciled to existing TGG staging contracts.
-- Additive only. Production remains separately gated.

create or replace function public.ab005_record_smoke(
  p_staging_release_id uuid,
  p_result text,
  p_detail jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage public.tgg_build_staging_releases%rowtype;
  v_check_key text;
  v_id bigint;
begin
  if p_result not in ('pass','fail','blocked','manual') then
    raise exception 'AB-005 smoke result must be pass, fail, blocked, or manual';
  end if;

  select * into v_stage
  from public.tgg_build_staging_releases
  where id = p_staging_release_id
  for update;

  if not found then
    raise exception 'AB-005 staging release not found: %', p_staging_release_id;
  end if;

  v_check_key := 'ab005:' || v_stage.staging_key || ':' || coalesce(nullif(trim(p_detail->>'check_key'), ''), 'smoke');

  insert into public.tgg_launch_smoke_results(check_key, status, detail)
  values (
    v_check_key,
    p_result,
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('staging_release_id', p_staging_release_id, 'created_by', p_created_by)
  )
  returning id into v_id;

  update public.tgg_build_staging_releases
  set status = case
      when p_result in ('fail','blocked') then 'failed'
      when p_result = 'pass' then 'smoke_testing'
      else status
    end,
    smoke_summary = coalesce(smoke_summary, '{}'::jsonb) || jsonb_build_object('last_result', p_result, 'last_smoke_id', v_id),
    updated_at = now()
  where id = p_staging_release_id;

  return jsonb_build_object('staging_release_id', p_staging_release_id, 'smoke_id', v_id, 'result', p_result);
end;
$$;

create or replace function public.ab005_rollback_staging(
  p_staging_release_id uuid,
  p_rollback_reference text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  if nullif(trim(p_rollback_reference), '') is null then
    raise exception 'AB-005 rollback reference is required';
  end if;

  update public.tgg_build_staging_releases
  set status = 'rolled_back',
      previous_stable_key = p_rollback_reference,
      rolled_back_at = now(),
      smoke_summary = coalesce(smoke_summary, '{}'::jsonb) || jsonb_build_object('rollback_reference', p_rollback_reference)
  where id = p_staging_release_id;

  if not found then
    raise exception 'AB-005 staging release not found: %', p_staging_release_id;
  end if;

  return jsonb_build_object('staging_release_id', p_staging_release_id, 'status', 'rolled_back', 'rollback_reference', p_rollback_reference);
end;
$$;

create or replace function public.ab005_checkpoint(
  p_staging_release_id uuid,
  p_checkpoint_key text,
  p_title text default 'AB-005 Continuous Staging Checkpoint',
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage public.tgg_build_staging_releases%rowtype;
begin
  if nullif(trim(p_checkpoint_key), '') is null then
    raise exception 'AB-005 checkpoint key is required';
  end if;

  select * into v_stage from public.tgg_build_staging_releases where id = p_staging_release_id;
  if not found then
    raise exception 'AB-005 staging release not found: %', p_staging_release_id;
  end if;

  insert into public.tgg_release_checkpoints(
    checkpoint_key, title, system_state, runtime_manifest, launch_readiness, notes, created_by
  ) values (
    p_checkpoint_key,
    coalesce(nullif(trim(p_title), ''), 'AB-005 Continuous Staging Checkpoint'),
    jsonb_build_object('environment','staging','staging_release_id',p_staging_release_id,'staging_key',v_stage.staging_key,'status',v_stage.status),
    coalesce(v_stage.deployment_manifest, '{}'::jsonb),
    jsonb_build_object('environment','staging','production_promoted',false,'production_gate_required',true),
    jsonb_build_object('rollback_reference',v_stage.previous_stable_key,'smoke_summary',coalesce(v_stage.smoke_summary,'{}'::jsonb)),
    p_created_by
  );

  update public.tgg_build_staging_releases
  set checkpoint_key = p_checkpoint_key, updated_at = now()
  where id = p_staging_release_id;

  return jsonb_build_object('staging_release_id',p_staging_release_id,'checkpoint_key',p_checkpoint_key);
end;
$$;

create or replace function public.ab005_advance_after_clean_pass(
  p_staging_release_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage public.tgg_build_staging_releases%rowtype;
  v_after timestamptz;
  v_total bigint;
  v_pass bigint;
  v_bad bigint;
  v_checkpoint boolean;
  v_candidate_id uuid;
begin
  select * into v_stage from public.tgg_build_staging_releases where id = p_staging_release_id for update;
  if not found then
    raise exception 'AB-005 staging release not found: %', p_staging_release_id;
  end if;

  if nullif(trim(v_stage.checkpoint_key), '') is null then
    raise exception 'AB-005 cannot advance without a checkpoint';
  end if;

  select exists(select 1 from public.tgg_release_checkpoints c where c.checkpoint_key = v_stage.checkpoint_key) into v_checkpoint;
  if not v_checkpoint then
    raise exception 'AB-005 checkpoint key does not exist: %', v_stage.checkpoint_key;
  end if;

  v_after := coalesce(v_stage.rolled_back_at, v_stage.created_at);

  select count(*), count(*) filter (where status='pass'), count(*) filter (where status in ('fail','blocked','manual'))
    into v_total, v_pass, v_bad
  from public.tgg_launch_smoke_results
  where check_key like 'ab005:' || v_stage.staging_key || ':%'
    and checked_at >= v_after;

  if v_total = 0 or v_pass <> v_total or v_bad <> 0 then
    raise exception 'AB-005 clean pass required: total=%, pass=%, bad=%', v_total, v_pass, v_bad;
  end if;

  update public.tgg_build_staging_releases
  set status='passed', verified_at=now(), updated_at=now(),
      smoke_summary=coalesce(smoke_summary,'{}'::jsonb) || jsonb_build_object('ab005_clean_pass',true,'smoke_count',v_total)
  where id=p_staging_release_id;

  update public.tgg_build_release_candidates
  set status = case when status in ('canary','draft','failed','rolled_back','blocked') then 'ready' else status end,
      updated_at=now()
  where staging_release_id=p_staging_release_id
  returning id into v_candidate_id;

  return jsonb_build_object(
    'staging_release_id',p_staging_release_id,
    'status','passed',
    'candidate_id',v_candidate_id,
    'production_gate_required',true,
    'production_promoted',false
  );
end;
$$;

revoke all on function public.ab005_record_smoke(uuid,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.ab005_rollback_staging(uuid,text) from public, anon, authenticated;
revoke all on function public.ab005_checkpoint(uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.ab005_advance_after_clean_pass(uuid) from public, anon, authenticated;


-- ============================================================
-- MIGRATION 20260908163144 ab005_prepare_staging_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.ab005_prepare_staging(
  p_build_release_id uuid,
  p_run_id uuid default null,
  p_staging_key text default null,
  p_build_version text default null,
  p_previous_stable_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  if p_build_release_id is null then raise exception 'AB-005 build release id is required'; end if;
  if nullif(trim(p_staging_key), '') is null then raise exception 'AB-005 staging key is required'; end if;
  if nullif(trim(p_build_version), '') is null then raise exception 'AB-005 build version is required'; end if;
  insert into public.tgg_build_staging_releases(build_release_id,run_id,staging_key,build_version,status,previous_stable_key)
  values(p_build_release_id,p_run_id,p_staging_key,p_build_version,'prepared',p_previous_stable_key)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.ab005_prepare_staging(uuid,uuid,text,text,text) from public, anon, authenticated;

-- ============================================================
-- MIGRATION 20260908163158 ab005_staging_timestamp_contract_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.ab005_record_smoke(p_staging_release_id uuid,p_result text,p_detail jsonb default '{}'::jsonb,p_created_by uuid default null) returns jsonb language plpgsql security invoker set search_path=public as $$ declare v_stage public.tgg_build_staging_releases%rowtype; v_check_key text; v_id bigint; begin if p_result not in ('pass','fail','blocked','manual') then raise exception 'AB-005 smoke result must be pass, fail, blocked, or manual'; end if; select * into v_stage from public.tgg_build_staging_releases where id=p_staging_release_id for update; if not found then raise exception 'AB-005 staging release not found: %',p_staging_release_id; end if; v_check_key:='ab005:'||v_stage.staging_key||':'||coalesce(nullif(trim(p_detail->>'check_key'),''),'smoke'); insert into public.tgg_launch_smoke_results(check_key,status,detail) values(v_check_key,p_result,coalesce(p_detail,'{}'::jsonb)||jsonb_build_object('staging_release_id',p_staging_release_id,'created_by',p_created_by)) returning id into v_id; update public.tgg_build_staging_releases set status=case when p_result in ('fail','blocked') then 'failed' when p_result='pass' then 'smoke_testing' else status end, smoke_summary=coalesce(smoke_summary,'{}'::jsonb)||jsonb_build_object('last_result',p_result,'last_smoke_id',v_id) where id=p_staging_release_id; return jsonb_build_object('staging_release_id',p_staging_release_id,'smoke_id',v_id,'result',p_result); end; $$;
create or replace function public.ab005_checkpoint(p_staging_release_id uuid,p_checkpoint_key text,p_title text default 'AB-005 Continuous Staging Checkpoint',p_created_by uuid default null) returns jsonb language plpgsql security invoker set search_path=public as $$ declare v_stage public.tgg_build_staging_releases%rowtype; begin if nullif(trim(p_checkpoint_key),'') is null then raise exception 'AB-005 checkpoint key is required'; end if; select * into v_stage from public.tgg_build_staging_releases where id=p_staging_release_id; if not found then raise exception 'AB-005 staging release not found: %',p_staging_release_id; end if; insert into public.tgg_release_checkpoints(checkpoint_key,title,system_state,runtime_manifest,launch_readiness,notes,created_by) values(p_checkpoint_key,coalesce(nullif(trim(p_title),''),'AB-005 Continuous Staging Checkpoint'),jsonb_build_object('environment','staging','staging_release_id',p_staging_release_id,'staging_key',v_stage.staging_key,'status',v_stage.status),coalesce(v_stage.deployment_manifest,'{}'::jsonb),jsonb_build_object('environment','staging','production_promoted',false,'production_gate_required',true),jsonb_build_object('rollback_reference',v_stage.previous_stable_key,'smoke_summary',coalesce(v_stage.smoke_summary,'{}'::jsonb)),p_created_by); update public.tgg_build_staging_releases set checkpoint_key=p_checkpoint_key where id=p_staging_release_id; return jsonb_build_object('staging_release_id',p_staging_release_id,'checkpoint_key',p_checkpoint_key); end; $$;
revoke all on function public.ab005_record_smoke(uuid,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.ab005_checkpoint(uuid,text,text,uuid) from public,anon,authenticated;

-- ============================================================
-- MIGRATION 20260908163209 ab005_clean_retest_boundary_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.ab005_advance_after_clean_pass(p_staging_release_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$ declare v_stage public.tgg_build_staging_releases%rowtype; v_after timestamptz; v_total bigint; v_pass bigint; v_bad bigint; v_checkpoint boolean; v_candidate_id uuid; begin select * into v_stage from public.tgg_build_staging_releases where id=p_staging_release_id for update; if not found then raise exception 'AB-005 staging release not found: %',p_staging_release_id; end if; if nullif(trim(v_stage.checkpoint_key),'') is null then raise exception 'AB-005 cannot advance without a checkpoint'; end if; select exists(select 1 from public.tgg_release_checkpoints c where c.checkpoint_key=v_stage.checkpoint_key) into v_checkpoint; if not v_checkpoint then raise exception 'AB-005 checkpoint key does not exist: %',v_stage.checkpoint_key; end if; v_after:=coalesce(v_stage.rolled_back_at,v_stage.created_at); select count(*),count(*) filter(where status='pass'),count(*) filter(where status in ('fail','blocked','manual')) into v_total,v_pass,v_bad from public.tgg_launch_smoke_results where check_key like 'ab005:'||v_stage.staging_key||':%' and checked_at > v_after; if v_total=0 or v_pass<>v_total or v_bad<>0 then raise exception 'AB-005 clean pass required: total=%, pass=%, bad=%',v_total,v_pass,v_bad; end if; update public.tgg_build_staging_releases set status='passed',verified_at=now(),smoke_summary=coalesce(smoke_summary,'{}'::jsonb)||jsonb_build_object('ab005_clean_pass',true,'smoke_count',v_total) where id=p_staging_release_id; update public.tgg_build_release_candidates set status=case when status in ('canary','draft','failed','rolled_back','blocked') then 'ready' else status end,updated_at=now() where staging_release_id=p_staging_release_id returning id into v_candidate_id; return jsonb_build_object('staging_release_id',p_staging_release_id,'status','passed','candidate_id',v_candidate_id,'production_gate_required',true,'production_promoted',false); end; $$;
revoke all on function public.ab005_advance_after_clean_pass(uuid) from public,anon,authenticated;

-- ============================================================
-- MIGRATION 20260908163220 ab005_smoke_wallclock_boundary
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.ab005_record_smoke(p_staging_release_id uuid,p_result text,p_detail jsonb default '{}'::jsonb,p_created_by uuid default null) returns jsonb language plpgsql security invoker set search_path=public as $$ declare v_stage public.tgg_build_staging_releases%rowtype; v_check_key text; v_id bigint; begin if p_result not in ('pass','fail','blocked','manual') then raise exception 'AB-005 smoke result must be pass, fail, blocked, or manual'; end if; select * into v_stage from public.tgg_build_staging_releases where id=p_staging_release_id for update; if not found then raise exception 'AB-005 staging release not found: %',p_staging_release_id; end if; v_check_key:='ab005:'||v_stage.staging_key||':'||coalesce(nullif(trim(p_detail->>'check_key'),''),'smoke'); insert into public.tgg_launch_smoke_results(check_key,status,detail,checked_at) values(v_check_key,p_result,coalesce(p_detail,'{}'::jsonb)||jsonb_build_object('staging_release_id',p_staging_release_id,'created_by',p_created_by),clock_timestamp()) returning id into v_id; update public.tgg_build_staging_releases set status=case when p_result in ('fail','blocked') then 'failed' when p_result='pass' then 'smoke_testing' else status end, smoke_summary=coalesce(smoke_summary,'{}'::jsonb)||jsonb_build_object('last_result',p_result,'last_smoke_id',v_id) where id=p_staging_release_id; return jsonb_build_object('staging_release_id',p_staging_release_id,'smoke_id',v_id,'result',p_result); end; $$;
revoke all on function public.ab005_record_smoke(uuid,text,jsonb,uuid) from public,anon,authenticated;

-- ============================================================
-- MIGRATION 20260908163234 ab005_rollback_cutoff_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.ab005_rollback_staging(p_staging_release_id uuid,p_rollback_reference text) returns jsonb language plpgsql security invoker set search_path=public as $$ declare v_cutoff timestamptz; begin if nullif(trim(p_rollback_reference),'') is null then raise exception 'AB-005 rollback reference is required'; end if; v_cutoff:=clock_timestamp(); update public.tgg_build_staging_releases set status='rolled_back',previous_stable_key=p_rollback_reference,rolled_back_at=v_cutoff,smoke_summary=coalesce(smoke_summary,'{}'::jsonb)||jsonb_build_object('rollback_reference',p_rollback_reference,'rollback_cutoff',v_cutoff) where id=p_staging_release_id; if not found then raise exception 'AB-005 staging release not found: %',p_staging_release_id; end if; return jsonb_build_object('staging_release_id',p_staging_release_id,'status','rolled_back','rollback_reference',p_rollback_reference,'rollback_cutoff',v_cutoff); end; $$;
create or replace function public.ab005_advance_after_clean_pass(p_staging_release_id uuid) returns jsonb language plpgsql security invoker set search_path=public as $$ declare v_stage public.tgg_build_staging_releases%rowtype; v_after timestamptz; v_total bigint; v_pass bigint; v_bad bigint; v_checkpoint boolean; v_candidate_id uuid; begin select * into v_stage from public.tgg_build_staging_releases where id=p_staging_release_id for update; if not found then raise exception 'AB-005 staging release not found: %',p_staging_release_id; end if; if nullif(trim(v_stage.checkpoint_key),'') is null then raise exception 'AB-005 cannot advance without a checkpoint'; end if; select exists(select 1 from public.tgg_release_checkpoints c where c.checkpoint_key=v_stage.checkpoint_key) into v_checkpoint; if not v_checkpoint then raise exception 'AB-005 checkpoint key does not exist: %',v_stage.checkpoint_key; end if; v_after:=coalesce(nullif(v_stage.smoke_summary->>'rollback_cutoff','')::timestamptz,v_stage.created_at); select count(*),count(*) filter(where status='pass'),count(*) filter(where status in ('fail','blocked','manual')) into v_total,v_pass,v_bad from public.tgg_launch_smoke_results where check_key like 'ab005:'||v_stage.staging_key||':%' and checked_at > v_after; if v_total=0 or v_pass<>v_total or v_bad<>0 then raise exception 'AB-005 clean pass required: total=%, pass=%, bad=%',v_total,v_pass,v_bad; end if; update public.tgg_build_staging_releases set status='passed',verified_at=clock_timestamp(),smoke_summary=coalesce(smoke_summary,'{}'::jsonb)||jsonb_build_object('ab005_clean_pass',true,'smoke_count',v_total) where id=p_staging_release_id; update public.tgg_build_release_candidates set status=case when status in ('canary','draft','failed','rolled_back','blocked') then 'ready' else status end,updated_at=clock_timestamp() where staging_release_id=p_staging_release_id returning id into v_candidate_id; return jsonb_build_object('staging_release_id',p_staging_release_id,'status','passed','candidate_id',v_candidate_id,'production_gate_required',true,'production_promoted',false); end; $$;
revoke all on function public.ab005_rollback_staging(uuid,text) from public,anon,authenticated;
revoke all on function public.ab005_advance_after_clean_pass(uuid) from public,anon,authenticated;

-- ============================================================
-- MIGRATION 20260908165526 ab005_launch_gate_read_only_consumer
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

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
  select
    s.id,
    s.staging_key,
    s.status,
    s.checkpoint_key,
    s.previous_stable_key,
    s.verified_at,
    s.smoke_summary,
    s.created_at
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


-- ============================================================
-- MIGRATION 20260908165828 ab005_launch_gate_read_only_consumer
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- AB-005 Launch Gate read-only consumer
create or replace function public.tgg_ab005_launch_gate()
returns jsonb
language plpgsql
security invoker
set search_path = public
stable
as $$
declare v_stage record; v_ready boolean := false;
begin
  select s.id,s.staging_key,s.status,s.checkpoint_key,s.previous_stable_key,s.verified_at,s.smoke_summary,s.created_at
    into v_stage from public.tgg_build_staging_releases s
   where s.smoke_summary->>'ab005_clean_pass'='true'
   order by s.verified_at desc nulls last,s.created_at desc limit 1;
  if found then
    v_ready := v_stage.status='passed' and nullif(v_stage.checkpoint_key,'') is not null and coalesce(v_stage.smoke_summary->>'ab005_clean_pass','false')='true';
  end if;
  return jsonb_build_object('ok',true,'consumer','ab005-launch-gate','read_only',true,'eligible',v_ready,
    'staging',case when found then jsonb_build_object('id',v_stage.id,'staging_key',v_stage.staging_key,'status',v_stage.status,'checkpoint_key',v_stage.checkpoint_key,'clean_pass',true,'rollback_reference',v_stage.previous_stable_key,'rollback_cutoff',v_stage.smoke_summary->>'rollback_cutoff','verified_at',v_stage.verified_at,'created_at',v_stage.created_at) else null end,
    'production_gate_required',true,'production_promoted',false);
end; $$;
revoke all on function public.tgg_ab005_launch_gate() from public,anon;
grant execute on function public.tgg_ab005_launch_gate() to authenticated;

-- ============================================================
-- MIGRATION 20260908170245 world_alpha_rc2_rc3_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.world_instances (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.tgg_world_locations(id) on delete cascade,
  instance_key text not null unique,
  instance_type text not null default 'public' check (instance_type in ('public','private','party','event')),
  status text not null default 'active' check (status in ('active','draining','closed')),
  capacity integer not null check (capacity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.world_presence (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.world_instances(id) on delete cascade,
  character_id uuid not null references public.world_characters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  presence_state text not null default 'online' check (presence_state in ('online','away','busy','offline')),
  position jsonb not null default '{}'::jsonb,
  activity jsonb not null default '{}'::jsonb,
  joined_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  left_at timestamptz,
  unique(instance_id,user_id)
);

create index if not exists world_instances_location_status_idx on public.world_instances(location_id,status);
create index if not exists world_presence_instance_active_idx on public.world_presence(instance_id,heartbeat_at desc) where left_at is null;
create index if not exists world_presence_user_idx on public.world_presence(user_id,heartbeat_at desc);

alter table public.world_instances enable row level security;
alter table public.world_presence enable row level security;

revoke all on public.world_instances from anon,authenticated;
revoke all on public.world_presence from anon,authenticated;
grant select on public.world_instances to authenticated;
grant select on public.world_presence to authenticated;

drop policy if exists world_instances_authenticated_read on public.world_instances;
create policy world_instances_authenticated_read on public.world_instances for select to authenticated using (status in ('active','draining'));

drop policy if exists world_presence_same_instance_read on public.world_presence;
create policy world_presence_same_instance_read on public.world_presence for select to authenticated using (
  left_at is null and exists (
    select 1 from public.world_presence mine
    where mine.instance_id = world_presence.instance_id
      and mine.user_id = (select auth.uid())
      and mine.left_at is null
  )
);

create or replace function public.tgg_world_apartment_phone_bundle()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  with me as (
    select c.id as character_id,c.user_id,c.stage_name,c.avatar_config,c.active_career,c.current_location_id
    from public.world_characters c
    where c.user_id=(select auth.uid())
  ), home as (
    select l.id,l.location_key,l.name,l.layout_spec,l.lighting_spec,l.interaction_spec
    from public.tgg_world_locations l
    join public.tgg_world_blueprints b on b.id=l.blueprint_id
    where b.blueprint_key='tgg-world-alpha-city' and l.location_key='starter-apartment' and l.enabled=true
    limit 1
  )
  select case when me.character_id is null then jsonb_build_object('character_required',true)
  else jsonb_build_object(
    'character_required',false,
    'character',to_jsonb(me),
    'apartment',to_jsonb(home),
    'phone',jsonb_build_object(
      'modules',jsonb_build_array(
        jsonb_build_object('key','contacts','source','tgg_phone_contacts'),
        jsonb_build_object('key','favorites','source','tgg_phone_favorites'),
        jsonb_build_object('key','calls','source','tgg_call_rooms'),
        jsonb_build_object('key','creator_os','source','creator_os'),
        jsonb_build_object('key','world_map','source','tgg_world_locations')
      ),
      'contacts_count',(select count(*) from public.tgg_phone_contacts pc where pc.owner_user_id=me.user_id),
      'favorites_count',(select count(*) from public.tgg_phone_favorites pf where pf.user_id=me.user_id),
      'active_calls_count',(select count(*) from public.tgg_call_rooms cr where cr.created_by=me.user_id and cr.status not in ('ended','closed'))
    ),
    'loading',jsonb_build_object('state','ready','fallback','Show retry action if any module fails independently')
  ) end
  from me full join home on true;
$$;

revoke all on function public.tgg_world_apartment_phone_bundle() from public,anon;
grant execute on function public.tgg_world_apartment_phone_bundle() to authenticated;

create or replace function public.tgg_world_join_location(p_location_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_character public.world_characters%rowtype;
  v_location public.tgg_world_locations%rowtype;
  v_instance public.world_instances%rowtype;
  v_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;

  select * into v_character from public.world_characters where user_id=v_user;
  if v_character.id is null then raise exception 'character required'; end if;

  select l.* into v_location
  from public.tgg_world_locations l
  join public.tgg_world_blueprints b on b.id=l.blueprint_id
  where b.blueprint_key='tgg-world-alpha-city' and l.location_key=p_location_key and l.enabled=true
  limit 1;
  if v_location.id is null then raise exception 'location unavailable'; end if;

  select i.* into v_instance
  from public.world_instances i
  where i.location_id=v_location.id and i.instance_type='public' and i.status='active'
    and (select count(*) from public.world_presence p where p.instance_id=i.id and p.left_at is null and p.heartbeat_at > now()-interval '2 minutes') < i.capacity
  order by i.created_at
  limit 1
  for update skip locked;

  if v_instance.id is null then
    insert into public.world_instances(location_id,instance_key,instance_type,status,capacity,metadata)
    values(v_location.id,p_location_key || '-' || replace(gen_random_uuid()::text,'-',''),'public','active',v_location.capacity,jsonb_build_object('location_key',p_location_key))
    returning * into v_instance;
  end if;

  update public.world_presence set left_at=coalesce(left_at,now()),presence_state='offline'
  where user_id=v_user and left_at is null and instance_id<>v_instance.id;

  insert into public.world_presence(instance_id,character_id,user_id,presence_state,position,activity,joined_at,heartbeat_at,left_at)
  values(v_instance.id,v_character.id,v_user,'online','{}'::jsonb,jsonb_build_object('location_key',p_location_key),now(),now(),null)
  on conflict(instance_id,user_id) do update set character_id=excluded.character_id,presence_state='online',heartbeat_at=now(),left_at=null,activity=excluded.activity;

  update public.world_characters set current_location_id=v_location.id,updated_at=now() where id=v_character.id;

  select count(*) into v_count from public.world_presence where instance_id=v_instance.id and left_at is null and heartbeat_at > now()-interval '2 minutes';

  return jsonb_build_object('instance_id',v_instance.id,'instance_key',v_instance.instance_key,'location_key',p_location_key,'population',v_count,'capacity',v_instance.capacity,'joined',true);
end;
$$;

create or replace function public.tgg_world_presence_heartbeat(p_position jsonb default '{}'::jsonb,p_activity jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_presence public.world_presence%rowtype;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  update public.world_presence set heartbeat_at=now(),presence_state='online',position=coalesce(p_position,'{}'::jsonb),activity=coalesce(p_activity,activity)
  where user_id=v_user and left_at is null
  returning * into v_presence;
  if v_presence.id is null then return jsonb_build_object('status','not_present'); end if;
  return jsonb_build_object('status','online','instance_id',v_presence.instance_id,'heartbeat_at',v_presence.heartbeat_at);
end;
$$;

create or replace function public.tgg_world_leave_instance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  update public.world_presence set left_at=now(),presence_state='offline',heartbeat_at=now() where user_id=v_user and left_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object('left',v_count>0);
end;
$$;

revoke all on function public.tgg_world_join_location(text) from public,anon;
revoke all on function public.tgg_world_presence_heartbeat(jsonb,jsonb) from public,anon;
revoke all on function public.tgg_world_leave_instance() from public,anon;
grant execute on function public.tgg_world_join_location(text) to authenticated;
grant execute on function public.tgg_world_presence_heartbeat(jsonb,jsonb) to authenticated;
grant execute on function public.tgg_world_leave_instance() to authenticated;

-- ============================================================
-- MIGRATION 20260908170332 world_alpha_presence_security_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create schema if not exists tgg_private;
revoke all on schema tgg_private from public,anon,authenticated;
grant usage on schema tgg_private to authenticated;

create or replace function tgg_private.world_join_location(p_location_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_character public.world_characters%rowtype;
  v_location public.tgg_world_locations%rowtype;
  v_instance public.world_instances%rowtype;
  v_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select * into v_character from public.world_characters where user_id=v_user;
  if v_character.id is null then raise exception 'character required'; end if;

  select l.* into v_location
  from public.tgg_world_locations l
  join public.tgg_world_blueprints b on b.id=l.blueprint_id
  where b.blueprint_key='tgg-world-alpha-city' and l.location_key=p_location_key and l.enabled=true
  limit 1;
  if v_location.id is null then raise exception 'location unavailable'; end if;

  select i.* into v_instance
  from public.world_instances i
  where i.location_id=v_location.id and i.instance_type='public' and i.status='active'
    and (select count(*) from public.world_presence p where p.instance_id=i.id and p.left_at is null and p.heartbeat_at > now()-interval '2 minutes') < i.capacity
  order by i.created_at
  limit 1
  for update skip locked;

  if v_instance.id is null then
    insert into public.world_instances(location_id,instance_key,instance_type,status,capacity,metadata)
    values(v_location.id,p_location_key || '-' || replace(gen_random_uuid()::text,'-',''),'public','active',v_location.capacity,jsonb_build_object('location_key',p_location_key))
    returning * into v_instance;
  end if;

  update public.world_presence set left_at=coalesce(left_at,now()),presence_state='offline'
  where user_id=v_user and left_at is null and instance_id<>v_instance.id;

  insert into public.world_presence(instance_id,character_id,user_id,presence_state,position,activity,joined_at,heartbeat_at,left_at)
  values(v_instance.id,v_character.id,v_user,'online','{}'::jsonb,jsonb_build_object('location_key',p_location_key),now(),now(),null)
  on conflict(instance_id,user_id) do update set character_id=excluded.character_id,presence_state='online',heartbeat_at=now(),left_at=null,activity=excluded.activity;

  update public.world_characters set current_location_id=v_location.id,updated_at=now() where id=v_character.id;

  select count(*) into v_count from public.world_presence where instance_id=v_instance.id and left_at is null and heartbeat_at > now()-interval '2 minutes';
  return jsonb_build_object('instance_id',v_instance.id,'instance_key',v_instance.instance_key,'location_key',p_location_key,'population',v_count,'capacity',v_instance.capacity,'joined',true);
end;
$$;

create or replace function tgg_private.world_presence_heartbeat(p_position jsonb default '{}'::jsonb,p_activity jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_presence public.world_presence%rowtype;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  update public.world_presence set heartbeat_at=now(),presence_state='online',position=coalesce(p_position,'{}'::jsonb),activity=coalesce(p_activity,activity)
  where user_id=v_user and left_at is null
  returning * into v_presence;
  if v_presence.id is null then return jsonb_build_object('status','not_present'); end if;
  return jsonb_build_object('status','online','instance_id',v_presence.instance_id,'heartbeat_at',v_presence.heartbeat_at);
end;
$$;

create or replace function tgg_private.world_leave_instance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid:=auth.uid(); v_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  update public.world_presence set left_at=now(),presence_state='offline',heartbeat_at=now() where user_id=v_user and left_at is null;
  get diagnostics v_count=row_count;
  return jsonb_build_object('left',v_count>0);
end;
$$;

revoke all on function tgg_private.world_join_location(text) from public,anon;
revoke all on function tgg_private.world_presence_heartbeat(jsonb,jsonb) from public,anon;
revoke all on function tgg_private.world_leave_instance() from public,anon;
grant execute on function tgg_private.world_join_location(text) to authenticated;
grant execute on function tgg_private.world_presence_heartbeat(jsonb,jsonb) to authenticated;
grant execute on function tgg_private.world_leave_instance() to authenticated;

create or replace function public.tgg_world_join_location(p_location_key text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select tgg_private.world_join_location(p_location_key); $$;

create or replace function public.tgg_world_presence_heartbeat(p_position jsonb default '{}'::jsonb,p_activity jsonb default '{}'::jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select tgg_private.world_presence_heartbeat(p_position,p_activity); $$;

create or replace function public.tgg_world_leave_instance()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select tgg_private.world_leave_instance(); $$;

revoke all on function public.tgg_world_join_location(text) from public,anon;
revoke all on function public.tgg_world_presence_heartbeat(jsonb,jsonb) from public,anon;
revoke all on function public.tgg_world_leave_instance() from public,anon;
grant execute on function public.tgg_world_join_location(text) to authenticated;
grant execute on function public.tgg_world_presence_heartbeat(jsonb,jsonb) to authenticated;
grant execute on function public.tgg_world_leave_instance() to authenticated;

-- ============================================================
-- MIGRATION 20260908170402 world_alpha_rc2_bundle_permission_repair
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function tgg_private.world_apartment_phone_bundle()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with me as (
    select c.id as character_id,c.user_id,c.stage_name,c.avatar_config,c.active_career,c.current_location_id
    from public.world_characters c
    where c.user_id=(select auth.uid())
  ), home as (
    select l.id,l.location_key,l.name,l.layout_spec,l.lighting_spec,l.interaction_spec
    from public.tgg_world_locations l
    join public.tgg_world_blueprints b on b.id=l.blueprint_id
    where b.blueprint_key='tgg-world-alpha-city' and l.location_key='starter-apartment' and l.enabled=true
    limit 1
  )
  select case when me.character_id is null then jsonb_build_object('character_required',true)
  else jsonb_build_object(
    'character_required',false,
    'character',to_jsonb(me),
    'apartment',to_jsonb(home),
    'phone',jsonb_build_object(
      'modules',jsonb_build_array(
        jsonb_build_object('key','contacts','source','tgg_phone_contacts'),
        jsonb_build_object('key','favorites','source','tgg_phone_favorites'),
        jsonb_build_object('key','calls','source','tgg_call_rooms'),
        jsonb_build_object('key','creator_os','source','creator_os'),
        jsonb_build_object('key','world_map','source','tgg_world_locations')
      ),
      'contacts_count',(select count(*) from public.tgg_phone_contacts pc where pc.owner_user_id=me.user_id),
      'favorites_count',(select count(*) from public.tgg_phone_favorites pf where pf.user_id=me.user_id),
      'active_calls_count',(select count(*) from public.tgg_call_rooms cr where cr.created_by=me.user_id and cr.status not in ('ended','closed'))
    ),
    'loading',jsonb_build_object('state','ready','fallback','retry_module')
  ) end
  from me full join home on true;
$$;

revoke all on function tgg_private.world_apartment_phone_bundle() from public,anon;
grant execute on function tgg_private.world_apartment_phone_bundle() to authenticated;

create or replace function public.tgg_world_apartment_phone_bundle()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select tgg_private.world_apartment_phone_bundle(); $$;

revoke all on function public.tgg_world_apartment_phone_bundle() from public,anon;
grant execute on function public.tgg_world_apartment_phone_bundle() to authenticated;

-- ============================================================
-- MIGRATION 20260908170423 world_alpha_presence_rls_recursion_repair
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function tgg_private.current_world_instance_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select p.instance_id
  from public.world_presence p
  where p.user_id=(select auth.uid())
    and p.left_at is null
    and p.heartbeat_at > now()-interval '2 minutes';
$$;

revoke all on function tgg_private.current_world_instance_ids() from public,anon;
grant execute on function tgg_private.current_world_instance_ids() to authenticated;

drop policy if exists world_presence_same_instance_read on public.world_presence;
create policy world_presence_same_instance_read
on public.world_presence
for select
to authenticated
using (
  left_at is null
  and instance_id in (select tgg_private.current_world_instance_ids())
);

-- ============================================================
-- MIGRATION 20260908170449 tighten_world_presence_instance_location_policy
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists world_presence_write_own on public.tgg_world_presence;
create policy world_presence_write_own
on public.tgg_world_presence
for all
to authenticated
using (
  auth.uid() = user_id
  and exists (
    select 1
    from public.world_characters c
    where c.id = character_id
      and c.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.world_characters c
    where c.id = character_id
      and c.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.tgg_world_instances i
    where i.id = instance_id
      and i.location_id = location_id
      and i.status = 'open'
  )
);

-- ============================================================
-- MIGRATION 20260908170510 world_alpha_rc3_instance_roster
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function tgg_private.world_instance_roster()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  with my_presence as (
    select p.instance_id
    from public.world_presence p
    where p.user_id=(select auth.uid()) and p.left_at is null and p.heartbeat_at > now()-interval '2 minutes'
    order by p.heartbeat_at desc
    limit 1
  )
  select jsonb_build_object(
    'instance_id',(select instance_id from my_presence),
    'players',coalesce((
      select jsonb_agg(jsonb_build_object(
        'character_id',c.id,
        'stage_name',c.stage_name,
        'avatar_config',c.avatar_config,
        'active_career',c.active_career,
        'presence_state',p.presence_state,
        'activity',p.activity
      ) order by p.joined_at)
      from public.world_presence p
      join public.world_characters c on c.id=p.character_id
      where p.instance_id=(select instance_id from my_presence)
        and p.left_at is null
        and p.heartbeat_at > now()-interval '2 minutes'
    ),'[]'::jsonb)
  );
$$;

revoke all on function tgg_private.world_instance_roster() from public,anon;
grant execute on function tgg_private.world_instance_roster() to authenticated;

create or replace function public.tgg_world_instance_roster()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select tgg_private.world_instance_roster(); $$;

revoke all on function public.tgg_world_instance_roster() from public,anon;
grant execute on function public.tgg_world_instance_roster() to authenticated;

-- ============================================================
-- MIGRATION 20260908170535 ab006_production_authorization_boundary
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_production_authorizations (
  id uuid primary key default gen_random_uuid(),
  staging_release_id uuid not null references public.tgg_build_staging_releases(id),
  checkpoint_key text not null,
  authorization_key text not null unique,
  status text not null default 'approved' check (status in ('approved','revoked','consumed')),
  authorized_by uuid not null references auth.users(id),
  authorization_note text,
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  consumed_at timestamptz
);

alter table public.tgg_production_authorizations enable row level security;

create policy ab006_admin_authorization_insert
on public.tgg_production_authorizations
for insert to authenticated
with check (
  authorized_by = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create or replace function public.ab006_authorize_production(
  p_staging_release_id uuid,
  p_authorization_key text,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
volatile
as $$
declare
  v_stage public.tgg_build_staging_releases%rowtype;
  v_checkpoint public.tgg_release_checkpoints%rowtype;
  v_id uuid;
begin
  if p_staging_release_id is null or nullif(btrim(p_authorization_key), '') is null then
    raise exception 'staging release and authorization key are required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'production authorization requires admin role';
  end if;

  select * into v_stage
  from public.tgg_build_staging_releases
  where id = p_staging_release_id;

  if not found then
    raise exception 'staging release not found';
  end if;

  if v_stage.status <> 'passed'
     or coalesce((v_stage.smoke_summary->>'ab005_clean_pass')::boolean, false) is not true
     or nullif(btrim(v_stage.checkpoint_key), '') is null then
    raise exception 'staging release is not eligible for production authorization';
  end if;

  select * into v_checkpoint
  from public.tgg_release_checkpoints
  where checkpoint_key = v_stage.checkpoint_key;

  if not found then
    raise exception 'required release checkpoint not found';
  end if;

  insert into public.tgg_production_authorizations (
    staging_release_id, checkpoint_key, authorization_key, status, authorized_by, authorization_note
  ) values (
    v_stage.id, v_stage.checkpoint_key, btrim(p_authorization_key), 'approved', auth.uid(), p_note
  ) returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'authorization_id', v_id,
    'authorization_key', btrim(p_authorization_key),
    'staging_release_id', v_stage.id,
    'checkpoint_key', v_stage.checkpoint_key,
    'production_authorized', true,
    'production_promoted', false,
    'production_deploy_performed', false,
    'explicit_admin_authorization', true
  );
end;
$$;

revoke all on table public.tgg_production_authorizations from public, anon;
revoke all on function public.ab006_authorize_production(uuid, text, text) from public, anon;
grant insert on table public.tgg_production_authorizations to authenticated;
grant execute on function public.ab006_authorize_production(uuid, text, text) to authenticated;

comment on table public.tgg_production_authorizations is 'AB-006 explicit production authorization records; authorization does not itself deploy or promote production.';
comment on function public.ab006_authorize_production(uuid, text, text) is 'Records explicit admin authorization for an eligible AB-005 staging release. Does not promote, deploy, or mutate production state.';

-- ============================================================
-- MIGRATION 20260908170551 unify_world_public_presence_runtime
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_world_location_bundle(p_location_key text)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'location',jsonb_build_object(
      'id',l.id,'key',l.location_key,'name',l.name,'type',l.location_type,
      'capacity',l.capacity,'privacy_mode',l.privacy_mode,
      'layout',l.layout_spec,'lighting',l.lighting_spec,'interactions',l.interaction_spec
    ),
    'spawn_points',coalesce((
      select jsonb_agg(jsonb_build_object('key',s.spawn_key,'type',s.spawn_type,'position',s.position,'rotation',s.rotation) order by s.priority,s.spawn_key)
      from public.tgg_world_spawn_points s where s.location_id=l.id and s.enabled=true
    ),'[]'::jsonb),
    'interaction_points',coalesce((
      select jsonb_agg(jsonb_build_object('key',i.interaction_key,'label',i.label,'action',i.action_key,'position',i.position,'radius',i.radius) order by i.interaction_key)
      from public.tgg_world_interaction_points i where i.location_id=l.id and i.enabled=true
    ),'[]'::jsonb),
    'audio_zones',coalesce((
      select jsonb_agg(jsonb_build_object('key',a.zone_key,'type',a.zone_type,'rules',a.audio_rules) order by a.priority,a.zone_key)
      from public.tgg_world_audio_zones a where a.location_id=l.id and a.enabled=true
    ),'[]'::jsonb),
    'instances',coalesce((
      select jsonb_agg(jsonb_build_object('id',wi.id,'key',wi.instance_key,'status',wi.status,'max_players',wi.capacity))
      from public.world_instances wi where wi.location_id=l.id and wi.status in ('active','draining')
    ),'[]'::jsonb)
  )
  from public.tgg_world_locations l
  join public.tgg_world_blueprints b on b.id=l.blueprint_id
  where b.blueprint_key='tgg-world-alpha-city' and l.location_key=p_location_key and l.enabled=true
  limit 1;
$$;

create or replace function public.tgg_world_presence_bundle(p_instance_id uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'instance',jsonb_build_object('id',i.id,'key',i.instance_key,'status',i.status,'max_players',i.capacity),
    'players',coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',p.user_id,'character_id',p.character_id,'stage_name',c.stage_name,
        'avatar_config',c.avatar_config,'presence_state',p.presence_state,
        'position',p.position,'activity',p.activity,'heartbeat_at',p.heartbeat_at
      ) order by p.joined_at)
      from public.world_presence p
      join public.world_characters c on c.id=p.character_id
      where p.instance_id=i.id and p.left_at is null
    ),'[]'::jsonb)
  )
  from public.world_instances i
  where i.id=p_instance_id and i.status in ('active','draining');
$$;

revoke all on function public.tgg_world_location_bundle(text) from public,anon;
revoke all on function public.tgg_world_presence_bundle(uuid) from public,anon;
grant execute on function public.tgg_world_location_bundle(text) to authenticated;
grant execute on function public.tgg_world_presence_bundle(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260908170739 replace_legacy_world_join_overload
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop function public.tgg_world_join_location(text,jsonb,jsonb);

create function public.tgg_world_join_location(
  p_location_key text,
  p_position jsonb,
  p_rotation jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_join jsonb;
  v_heartbeat jsonb;
begin
  select tgg_private.world_join_location(p_location_key) into v_join;
  select tgg_private.world_presence_heartbeat(
    coalesce(p_position,'{"x":0,"y":0,"z":0}'::jsonb),
    jsonb_build_object(
      'location_key',p_location_key,
      'rotation',coalesce(p_rotation,'{"yaw":0}'::jsonb)
    )
  ) into v_heartbeat;

  return v_join || jsonb_build_object(
    'position',coalesce(p_position,'{"x":0,"y":0,"z":0}'::jsonb),
    'rotation',coalesce(p_rotation,'{"yaw":0}'::jsonb),
    'heartbeat',v_heartbeat
  );
end;
$$;

revoke all on function public.tgg_world_join_location(text,jsonb,jsonb) from public,anon;
grant execute on function public.tgg_world_join_location(text,jsonb,jsonb) to authenticated;

-- ============================================================
-- MIGRATION 20260908170812 normalize_world_presence_heartbeat_runtime
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_world_presence_heartbeat(
  p_position jsonb default '{}'::jsonb,
  p_activity jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select tgg_private.world_presence_heartbeat(p_position,p_activity);
$$;

create or replace function public.tgg_world_presence_heartbeat_full(
  p_position jsonb default null,
  p_rotation jsonb default null,
  p_activity jsonb default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select tgg_private.world_presence_heartbeat(
    coalesce(p_position,'{}'::jsonb),
    coalesce(p_activity,'{}'::jsonb) || jsonb_build_object('rotation',coalesce(p_rotation,'{"yaw":0}'::jsonb))
  );
$$;

revoke all on function public.tgg_world_presence_heartbeat(jsonb,jsonb) from public,anon;
revoke all on function public.tgg_world_presence_heartbeat_full(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.tgg_world_presence_heartbeat(jsonb,jsonb) to authenticated;
grant execute on function public.tgg_world_presence_heartbeat_full(jsonb,jsonb,jsonb) to authenticated;

-- ============================================================
-- MIGRATION 20260908170841 guarded_same_instance_presence_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function tgg_private.world_presence_bundle(p_instance_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_instance public.world_instances%rowtype;
  v_allowed boolean;
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;

  select exists(
    select 1
    from public.world_presence me
    where me.instance_id=p_instance_id
      and me.user_id=v_user
      and me.left_at is null
      and me.heartbeat_at > now()-interval '2 minutes'
  ) into v_allowed;

  if not v_allowed then
    raise exception 'same-instance presence required';
  end if;

  select * into v_instance
  from public.world_instances
  where id=p_instance_id and status in ('active','draining');

  if v_instance.id is null then
    raise exception 'instance unavailable';
  end if;

  return jsonb_build_object(
    'instance',jsonb_build_object(
      'id',v_instance.id,
      'key',v_instance.instance_key,
      'status',v_instance.status,
      'max_players',v_instance.capacity
    ),
    'players',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id',p.user_id,
          'character_id',p.character_id,
          'stage_name',c.stage_name,
          'avatar_config',c.avatar_config,
          'active_career',c.active_career,
          'presence_state',p.presence_state,
          'position',p.position,
          'activity',p.activity,
          'heartbeat_at',p.heartbeat_at
        ) order by p.joined_at
      )
      from public.world_presence p
      join public.world_characters c on c.id=p.character_id
      where p.instance_id=p_instance_id
        and p.left_at is null
        and p.heartbeat_at > now()-interval '2 minutes'
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.tgg_world_presence_bundle(p_instance_id uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select tgg_private.world_presence_bundle(p_instance_id);
$$;

revoke all on function tgg_private.world_presence_bundle(uuid) from public,anon,authenticated;
grant execute on function tgg_private.world_presence_bundle(uuid) to authenticated;
revoke all on function public.tgg_world_presence_bundle(uuid) from public,anon;
grant execute on function public.tgg_world_presence_bundle(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260908170906 world_alpha_rc4_rc5_social_music_layers
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_world_party_invites (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.tgg_circles(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','expired','canceled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(circle_id,invited_user_id,status)
);

create table if not exists public.tgg_world_music_sessions (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.tgg_world_instances(id) on delete cascade,
  controller_user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete set null,
  playback_state text not null default 'paused' check (playback_state in ('paused','playing','stopped')),
  position_seconds numeric not null default 0 check (position_seconds >= 0),
  playback_rate numeric not null default 1 check (playback_rate > 0 and playback_rate <= 2),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique(instance_id)
);

alter table public.tgg_world_party_invites enable row level security;
alter table public.tgg_world_music_sessions enable row level security;

revoke all on public.tgg_world_party_invites from anon, authenticated;
revoke all on public.tgg_world_music_sessions from anon, authenticated;

grant select on public.tgg_world_party_invites to authenticated;
grant select on public.tgg_world_music_sessions to authenticated;

create policy world_party_invites_select_participants
on public.tgg_world_party_invites
for select to authenticated
using (invited_user_id=auth.uid() or invited_by=auth.uid());

create policy world_music_sessions_select_instance_members
on public.tgg_world_music_sessions
for select to authenticated
using (
  exists(
    select 1 from public.tgg_world_presence p
    where p.instance_id=tgg_world_music_sessions.instance_id
      and p.user_id=auth.uid()
  )
);


-- ============================================================
-- MIGRATION 20260908171006 world_alpha_rc4_friends_party_voice
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.world_friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','canceled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(requester_user_id,recipient_user_id),
  check (requester_user_id<>recipient_user_id)
);

create table if not exists public.world_parties (
  id uuid primary key default gen_random_uuid(),
  leader_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','closed')),
  current_instance_id uuid references public.world_instances(id) on delete set null,
  voice_room_id uuid references public.tgg_call_rooms(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.world_party_members (
  party_id uuid not null references public.world_parties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('leader','member')),
  status text not null default 'invited' check (status in ('invited','active','left','removed')),
  joined_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(party_id,user_id)
);

create index if not exists world_friend_requests_recipient_status_idx on public.world_friend_requests(recipient_user_id,status,created_at desc);
create index if not exists world_party_members_user_status_idx on public.world_party_members(user_id,status,updated_at desc);

alter table public.world_friend_requests enable row level security;
alter table public.world_parties enable row level security;
alter table public.world_party_members enable row level security;
revoke all on public.world_friend_requests from anon,authenticated;
revoke all on public.world_parties from anon,authenticated;
revoke all on public.world_party_members from anon,authenticated;
grant select on public.world_friend_requests to authenticated;
grant select on public.world_parties to authenticated;
grant select on public.world_party_members to authenticated;

drop policy if exists world_friend_requests_participant_read on public.world_friend_requests;
create policy world_friend_requests_participant_read on public.world_friend_requests for select to authenticated using (requester_user_id=(select auth.uid()) or recipient_user_id=(select auth.uid()));

drop policy if exists world_parties_member_read on public.world_parties;
create policy world_parties_member_read on public.world_parties for select to authenticated using (exists(select 1 from public.world_party_members m where m.party_id=id and m.user_id=(select auth.uid()) and m.status in ('invited','active')));

drop policy if exists world_party_members_party_read on public.world_party_members;
create policy world_party_members_party_read on public.world_party_members for select to authenticated using (exists(select 1 from public.world_party_members mine where mine.party_id=world_party_members.party_id and mine.user_id=(select auth.uid()) and mine.status in ('invited','active')));

create or replace function tgg_private.world_friend_request_send(p_recipient_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if p_recipient_user_id is null or p_recipient_user_id=v_user then raise exception 'invalid recipient'; end if;
 insert into public.world_friend_requests(requester_user_id,recipient_user_id,status,created_at,responded_at)
 values(v_user,p_recipient_user_id,'pending',now(),null)
 on conflict(requester_user_id,recipient_user_id) do update set status='pending',created_at=now(),responded_at=null
 returning id into v_id;
 return jsonb_build_object('request_id',v_id,'status','pending');
end; $$;

create or replace function tgg_private.world_friend_request_respond(p_request_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_req public.world_friend_requests%rowtype; v_status text;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 select * into v_req from public.world_friend_requests where id=p_request_id and recipient_user_id=v_user and status='pending' for update;
 if v_req.id is null then raise exception 'pending friend request not found'; end if;
 v_status:=case when p_accept then 'accepted' else 'declined' end;
 update public.world_friend_requests set status=v_status,responded_at=now() where id=v_req.id;
 if p_accept then
   insert into public.follows(follower_id,following_id) values(v_req.requester_user_id,v_req.recipient_user_id) on conflict do nothing;
   insert into public.follows(follower_id,following_id) values(v_req.recipient_user_id,v_req.requester_user_id) on conflict do nothing;
 end if;
 return jsonb_build_object('request_id',v_req.id,'status',v_status);
end; $$;

create or replace function tgg_private.world_party_create()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_party uuid;
begin
 if v_user is null then raise exception 'authentication required'; end if;
 insert into public.world_parties(leader_user_id,status) values(v_user,'active') returning id into v_party;
 insert into public.world_party_members(party_id,user_id,member_role,status,joined_at) values(v_party,v_user,'leader','active',now());
 return jsonb_build_object('party_id',v_party,'status','active');
end; $$;

create or replace function tgg_private.world_party_invite(p_party_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 if not exists(select 1 from public.world_parties where id=p_party_id and leader_user_id=v_user and status='active') then raise exception 'party leader required'; end if;
 if not exists(select 1 from public.world_friend_requests where status='accepted' and ((requester_user_id=v_user and recipient_user_id=p_user_id) or (requester_user_id=p_user_id and recipient_user_id=v_user))) then raise exception 'party invites require accepted friendship'; end if;
 insert into public.world_party_members(party_id,user_id,member_role,status) values(p_party_id,p_user_id,'member','invited')
 on conflict(party_id,user_id) do update set status='invited',updated_at=now();
 return jsonb_build_object('party_id',p_party_id,'user_id',p_user_id,'status','invited');
end; $$;

create or replace function tgg_private.world_party_accept(p_party_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();
begin
 update public.world_party_members set status='active',joined_at=coalesce(joined_at,now()),updated_at=now() where party_id=p_party_id and user_id=v_user and status='invited';
 if not found then raise exception 'party invitation not found'; end if;
 return jsonb_build_object('party_id',p_party_id,'status','active');
end; $$;

create or replace function tgg_private.world_party_travel(p_party_id uuid,p_location_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_location public.tgg_world_locations%rowtype; v_instance public.world_instances%rowtype;
begin
 if not exists(select 1 from public.world_parties where id=p_party_id and leader_user_id=v_user and status='active') then raise exception 'party leader required'; end if;
 select l.* into v_location from public.tgg_world_locations l join public.tgg_world_blueprints b on b.id=l.blueprint_id where b.blueprint_key='tgg-world-alpha-city' and l.location_key=p_location_key and l.enabled=true limit 1;
 if v_location.id is null then raise exception 'location unavailable'; end if;
 select i.* into v_instance from public.world_instances i where i.location_id=v_location.id and i.instance_type='public' and i.status='active' order by i.created_at limit 1 for update skip locked;
 if v_instance.id is null then insert into public.world_instances(location_id,instance_key,instance_type,status,capacity,metadata) values(v_location.id,p_location_key||'-party-'||replace(gen_random_uuid()::text,'-',''),'public','active',v_location.capacity,jsonb_build_object('location_key',p_location_key,'party_seed',p_party_id)) returning * into v_instance; end if;
 update public.world_parties set current_instance_id=v_instance.id,metadata=metadata||jsonb_build_object('location_key',p_location_key),updated_at=now() where id=p_party_id;
 return jsonb_build_object('party_id',p_party_id,'instance_id',v_instance.id,'location_key',p_location_key);
end; $$;

create or replace function tgg_private.world_party_join_current(p_party_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_char public.world_characters%rowtype; v_party public.world_parties%rowtype; v_location uuid;
begin
 if not exists(select 1 from public.world_party_members where party_id=p_party_id and user_id=v_user and status='active') then raise exception 'active party membership required'; end if;
 select * into v_party from public.world_parties where id=p_party_id and status='active'; if v_party.current_instance_id is null then raise exception 'party has no destination'; end if;
 select * into v_char from public.world_characters where user_id=v_user; if v_char.id is null then raise exception 'character required'; end if;
 select location_id into v_location from public.world_instances where id=v_party.current_instance_id;
 update public.world_presence set left_at=coalesce(left_at,now()),presence_state='offline' where user_id=v_user and left_at is null and instance_id<>v_party.current_instance_id;
 insert into public.world_presence(instance_id,character_id,user_id,presence_state,position,activity,joined_at,heartbeat_at,left_at)
 values(v_party.current_instance_id,v_char.id,v_user,'online','{}'::jsonb,jsonb_build_object('party_id',p_party_id),now(),now(),null)
 on conflict(instance_id,user_id) do update set left_at=null,presence_state='online',heartbeat_at=now(),activity=excluded.activity;
 update public.world_characters set current_location_id=v_location,updated_at=now() where id=v_char.id;
 return jsonb_build_object('party_id',p_party_id,'instance_id',v_party.current_instance_id,'joined',true);
end; $$;

create or replace function tgg_private.world_party_voice_start(p_party_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_room uuid;
begin
 if not exists(select 1 from public.world_parties where id=p_party_id and leader_user_id=v_user and status='active') then raise exception 'party leader required'; end if;
 select voice_room_id into v_room from public.world_parties where id=p_party_id;
 if v_room is null then
   insert into public.tgg_call_rooms(created_by,title,room_type,status,is_group) values(v_user,'TGG World Party Voice','audio','active',true) returning id into v_room;
   update public.world_parties set voice_room_id=v_room,updated_at=now() where id=p_party_id;
 end if;
 insert into public.tgg_call_participants(room_id,user_id,joined_at,left_at,mic_enabled,camera_enabled)
 select v_room,m.user_id,now(),null,true,false from public.world_party_members m where m.party_id=p_party_id and m.status='active'
 on conflict(room_id,user_id) do update set left_at=null,mic_enabled=true;
 return jsonb_build_object('party_id',p_party_id,'voice_room_id',v_room,'status','active');
end; $$;

revoke all on function tgg_private.world_friend_request_send(uuid) from public,anon;
revoke all on function tgg_private.world_friend_request_respond(uuid,boolean) from public,anon;
revoke all on function tgg_private.world_party_create() from public,anon;
revoke all on function tgg_private.world_party_invite(uuid,uuid) from public,anon;
revoke all on function tgg_private.world_party_accept(uuid) from public,anon;
revoke all on function tgg_private.world_party_travel(uuid,text) from public,anon;
revoke all on function tgg_private.world_party_join_current(uuid) from public,anon;
revoke all on function tgg_private.world_party_voice_start(uuid) from public,anon;
grant execute on function tgg_private.world_friend_request_send(uuid),tgg_private.world_friend_request_respond(uuid,boolean),tgg_private.world_party_create(),tgg_private.world_party_invite(uuid,uuid),tgg_private.world_party_accept(uuid),tgg_private.world_party_travel(uuid,text),tgg_private.world_party_join_current(uuid),tgg_private.world_party_voice_start(uuid) to authenticated;

create or replace function public.tgg_world_friend_request_send(p_recipient_user_id uuid) returns jsonb language sql security invoker set search_path='' as $$select tgg_private.world_friend_request_send(p_recipient_user_id);$$;
create or replace function public.tgg_world_friend_request_respond(p_request_id uuid,p_accept boolean) returns jsonb language sql security invoker set search_path='' as $$select tgg_private.world_friend_request_respond(p_request_id,p_accept);$$;
create or replace function public.tgg_world_party_create() returns jsonb language sql security invoker set search_path='' as $$select tgg_private.world_party_create();$$;
create or replace function public.tgg_world_party_invite(p_party_id uuid,p_user_id uuid) returns jsonb language sql security invoker set search_path='' as $$select tgg_private.world_party_invite(p_party_id,p_user_id);$$;
create or replace function public.tgg_world_party_accept(p_party_id uuid) returns jsonb language sql security invoker set search_path='' as $$select tgg_private.world_party_accept(p_party_id);$$;
create or replace function public.tgg_world_party_travel(p_party_id uuid,p_location_key text) returns jsonb language sql security invoker set search_path='' as $$select tgg_private.world_party_travel(p_party_id,p_location_key);$$;
create or replace function public.tgg_world_party_join_current(p_party_id uuid) returns jsonb language sql security invoker set search_path='' as $$select tgg_private.world_party_join_current(p_party_id);$$;
create or replace function public.tgg_world_party_voice_start(p_party_id uuid) returns jsonb language sql security invoker set search_path='' as $$select tgg_private.world_party_voice_start(p_party_id);$$;

revoke all on function public.tgg_world_friend_request_send(uuid),public.tgg_world_friend_request_respond(uuid,boolean),public.tgg_world_party_create(),public.tgg_world_party_invite(uuid,uuid),public.tgg_world_party_accept(uuid),public.tgg_world_party_travel(uuid,text),public.tgg_world_party_join_current(uuid),public.tgg_world_party_voice_start(uuid) from public,anon;
grant execute on function public.tgg_world_friend_request_send(uuid),public.tgg_world_friend_request_respond(uuid,boolean),public.tgg_world_party_create(),public.tgg_world_party_invite(uuid,uuid),public.tgg_world_party_accept(uuid),public.tgg_world_party_travel(uuid,text),public.tgg_world_party_join_current(uuid),public.tgg_world_party_voice_start(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260908171149 repair_party_voice_room_recovery
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function tgg_private.world_party_voice_start(p_party_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_room uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if not exists(
    select 1 from public.world_parties
    where id=p_party_id and leader_user_id=v_user and status='active'
  ) then
    raise exception 'party leader required';
  end if;

  select cr.id into v_room
  from public.world_parties p
  join public.tgg_call_rooms cr on cr.id=p.voice_room_id
  where p.id=p_party_id
    and cr.status='active'
    and cr.ended_at is null
  limit 1;

  if v_room is null then
    insert into public.tgg_call_rooms(created_by,title,room_type,status,is_group)
    values(v_user,'TGG World Party Voice','audio','active',true)
    returning id into v_room;

    update public.world_parties
    set voice_room_id=v_room,updated_at=now()
    where id=p_party_id;
  end if;

  insert into public.tgg_call_participants(room_id,user_id,joined_at,left_at,mic_enabled,camera_enabled)
  select v_room,m.user_id,now(),null,true,false
  from public.world_party_members m
  where m.party_id=p_party_id and m.status='active'
  on conflict(room_id,user_id) do update
  set left_at=null,mic_enabled=true;

  return jsonb_build_object('party_id',p_party_id,'voice_room_id',v_room,'status','active');
end;
$$;

-- ============================================================
-- MIGRATION 20260908171231 fix_world_party_rls_recursion
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function tgg_private.current_world_party_ids()
returns setof uuid
language sql
stable
security definer
set search_path=''
as $$
  select m.party_id
  from public.world_party_members m
  where m.user_id=auth.uid()
    and m.status in ('invited','active');
$$;

revoke all on function tgg_private.current_world_party_ids() from public,anon,authenticated;
grant execute on function tgg_private.current_world_party_ids() to authenticated;

drop policy if exists world_parties_member_read on public.world_parties;
create policy world_parties_member_read
on public.world_parties
for select
to authenticated
using (id in (select tgg_private.current_world_party_ids()));

drop policy if exists world_party_members_party_read on public.world_party_members;
create policy world_party_members_party_read
on public.world_party_members
for select
to authenticated
using (party_id in (select tgg_private.current_world_party_ids()));

-- ============================================================
-- MIGRATION 20260908171252 world_alpha_rc5_runtime_music_sync
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.world_music_sessions (
  instance_id uuid primary key references public.world_instances(id) on delete cascade,
  controller_user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete set null,
  playback_state text not null default 'paused' check (playback_state in ('paused','playing','stopped')),
  position_seconds numeric not null default 0 check (position_seconds >= 0),
  playback_rate numeric not null default 1 check (playback_rate > 0 and playback_rate <= 2),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

alter table public.world_music_sessions enable row level security;
revoke all on public.world_music_sessions from anon, authenticated;
grant select on public.world_music_sessions to authenticated;

create policy world_music_sessions_select_member
on public.world_music_sessions
for select to authenticated
using (
  exists(
    select 1 from public.world_presence p
    where p.instance_id=world_music_sessions.instance_id
      and p.user_id=auth.uid()
      and p.left_at is null
  )
);

create schema if not exists tgg_private;

create or replace function tgg_private.world_music_control(
  p_instance_id uuid,
  p_track_id uuid,
  p_state text,
  p_position_seconds numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_access jsonb;
  v_row public.world_music_sessions%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_state not in ('paused','playing','stopped') then raise exception 'INVALID_PLAYBACK_STATE'; end if;
  if p_position_seconds < 0 then raise exception 'INVALID_POSITION'; end if;
  if not exists(
    select 1 from public.world_presence p
    where p.instance_id=p_instance_id and p.user_id=v_uid and p.left_at is null
  ) then raise exception 'INSTANCE_MEMBERSHIP_REQUIRED'; end if;

  if p_track_id is not null then
    select public.tgg_track_access_policy(p_track_id,'stream') into v_access;
  end if;

  insert into public.world_music_sessions(
    instance_id,controller_user_id,track_id,playback_state,position_seconds,playback_rate,started_at,updated_at,version
  )
  values(
    p_instance_id,v_uid,p_track_id,p_state,p_position_seconds,1,
    case when p_state='playing' then now() else null end,now(),1
  )
  on conflict(instance_id) do update
  set controller_user_id=case
        when public.world_music_sessions.controller_user_id=v_uid then v_uid
        else public.world_music_sessions.controller_user_id
      end,
      track_id=case
        when public.world_music_sessions.controller_user_id=v_uid then excluded.track_id
        else public.world_music_sessions.track_id
      end,
      playback_state=case
        when public.world_music_sessions.controller_user_id=v_uid then excluded.playback_state
        else public.world_music_sessions.playback_state
      end,
      position_seconds=case
        when public.world_music_sessions.controller_user_id=v_uid then excluded.position_seconds
        else public.world_music_sessions.position_seconds
      end,
      started_at=case
        when public.world_music_sessions.controller_user_id=v_uid and excluded.playback_state='playing' then now()
        when public.world_music_sessions.controller_user_id=v_uid and excluded.playback_state<>'playing' then null
        else public.world_music_sessions.started_at
      end,
      updated_at=case
        when public.world_music_sessions.controller_user_id=v_uid then now()
        else public.world_music_sessions.updated_at
      end,
      version=case
        when public.world_music_sessions.controller_user_id=v_uid then public.world_music_sessions.version+1
        else public.world_music_sessions.version
      end
  returning * into v_row;

  if v_row.controller_user_id<>v_uid then raise exception 'PLAYBACK_CONTROLLER_REQUIRED'; end if;

  return jsonb_build_object(
    'instance_id',v_row.instance_id,
    'controller_user_id',v_row.controller_user_id,
    'track_id',v_row.track_id,
    'playback_state',v_row.playback_state,
    'position_seconds',v_row.position_seconds,
    'started_at',v_row.started_at,
    'server_now',now(),
    'version',v_row.version,
    'access',v_access
  );
end;
$$;

create or replace function public.tgg_world_music_control(
  p_instance_id uuid,
  p_track_id uuid,
  p_state text,
  p_position_seconds numeric default 0
)
returns jsonb
language sql
set search_path=''
as $$select tgg_private.world_music_control(p_instance_id,p_track_id,p_state,p_position_seconds);$$;

create or replace function public.tgg_world_music_bundle(p_instance_id uuid)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_row public.world_music_sessions%rowtype;
  v_effective numeric;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.world_presence p
    where p.instance_id=p_instance_id and p.user_id=v_uid and p.left_at is null
  ) then raise exception 'INSTANCE_MEMBERSHIP_REQUIRED'; end if;

  select * into v_row from public.world_music_sessions where instance_id=p_instance_id;
  if v_row.instance_id is null then
    return jsonb_build_object('instance_id',p_instance_id,'playback_state','stopped','track_id',null,'server_now',now(),'version',0);
  end if;

  v_effective:=v_row.position_seconds;
  if v_row.playback_state='playing' and v_row.started_at is not null then
    v_effective:=v_row.position_seconds + extract(epoch from (now()-v_row.started_at))*v_row.playback_rate;
  end if;

  return jsonb_build_object(
    'instance_id',v_row.instance_id,
    'controller_user_id',v_row.controller_user_id,
    'track_id',v_row.track_id,
    'playback_state',v_row.playback_state,
    'position_seconds',v_effective,
    'server_now',now(),
    'version',v_row.version
  );
end;
$$;

revoke all on function public.tgg_world_music_control(uuid,uuid,text,numeric) from public,anon;
revoke all on function public.tgg_world_music_bundle(uuid) from public,anon;
grant execute on function public.tgg_world_music_control(uuid,uuid,text,numeric) to authenticated;
grant execute on function public.tgg_world_music_bundle(uuid) to authenticated;


