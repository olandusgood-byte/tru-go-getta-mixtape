-- TRU GO GETTA production migration history archive
-- Date bucket: 20260915
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260915025439 fix_recording_session_completed_status
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.tgg_recording_sessions
  drop constraint if exists tgg_recording_sessions_status_check;

alter table public.tgg_recording_sessions
  add constraint tgg_recording_sessions_status_check
  check (status = any (array['open'::text,'paused'::text,'completed'::text,'archived'::text]));

-- ============================================================
-- MIGRATION 20260915040547 add_server_only_livekit_vault_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_server_livekit_credentials()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role',true),'');
  v_claims text := coalesce(current_setting('request.jwt.claims',true),'');
  v_endpoint text;
  v_secret_text text;
  v_secret jsonb;
begin
  if v_role <> 'service_role' and v_claims not like '%"role":"service_role"%' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select s.endpoint_url
    into v_endpoint
  from private.tgg_provider_activation_staging s
  where s.provider_key='broadcast.sfu_turn'
  limit 1;

  if nullif(btrim(coalesce(v_endpoint,'')),'') is null then
    raise exception 'livekit_endpoint_unavailable';
  end if;

  if not exists (
    select 1
    from private.tgg_provider_secret_registry r
    where r.provider_key='broadcast.sfu_turn'
      and r.status in ('stored','verified','runtime_verified')
  ) then
    raise exception 'livekit_secret_unavailable';
  end if;

  select d.decrypted_secret
    into v_secret_text
  from vault.decrypted_secrets d
  where d.name='tgg_broadcast_provider_secret'
  order by d.created_at desc
  limit 1;

  if nullif(v_secret_text,'') is null then
    raise exception 'livekit_secret_unavailable';
  end if;

  begin
    v_secret := v_secret_text::jsonb;
  exception when others then
    raise exception 'livekit_secret_invalid';
  end;

  if nullif(btrim(coalesce(v_secret->>'api_key','')),'') is null
     or length(coalesce(v_secret->>'api_key','')) < 8
     or nullif(btrim(coalesce(v_secret->>'api_secret','')),'') is null
     or length(coalesce(v_secret->>'api_secret','')) < 16 then
    raise exception 'livekit_secret_invalid';
  end if;

  return jsonb_build_object(
    'server_url',v_endpoint,
    'api_key',v_secret->>'api_key',
    'api_secret',v_secret->>'api_secret'
  );
end
$$;

revoke all on function public.tgg_server_livekit_credentials() from public;
revoke execute on function public.tgg_server_livekit_credentials() from anon, authenticated;
grant execute on function public.tgg_server_livekit_credentials() to service_role;

-- ============================================================
-- MIGRATION 20260915040948 require_livekit_key_secret_pair_in_provider_vault
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_store_provider_secret(p_provider_key text, p_secret_value text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_name text;
  v_secret text:=nullif(btrim(coalesce(p_secret_value,'')),'');
  v_id uuid;
  v_livekit jsonb;
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

  if p_provider_key='broadcast.sfu_turn' then
    begin
      v_livekit:=v_secret::jsonb;
    exception when others then
      raise exception 'LIVEKIT_API_KEY_AND_SECRET_REQUIRED' using errcode='22023';
    end;
    if jsonb_typeof(v_livekit)<>'object'
       or nullif(btrim(coalesce(v_livekit->>'api_key','')),'') is null
       or length(coalesce(v_livekit->>'api_key',''))<8
       or nullif(btrim(coalesce(v_livekit->>'api_secret','')),'') is null
       or length(coalesce(v_livekit->>'api_secret',''))<16 then
      raise exception 'LIVEKIT_API_KEY_AND_SECRET_REQUIRED' using errcode='22023';
    end if;
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
             'LiveKit API key + API secret are stored. Verify room/token issuance through the LiveKit gateway.'
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

-- ============================================================
-- MIGRATION 20260915041505 revelator_credential_pair_and_service_bridge
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_store_provider_secret(p_provider_key text, p_secret_value text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text;
  v_name text;
  v_secret text:=nullif(btrim(coalesce(p_secret_value,'')),'');
  v_id uuid;
  v_livekit jsonb;
  v_revelator jsonb;
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

  if p_provider_key='broadcast.sfu_turn' then
    begin
      v_livekit:=v_secret::jsonb;
    exception when others then
      raise exception 'LIVEKIT_API_KEY_AND_SECRET_REQUIRED' using errcode='22023';
    end;
    if jsonb_typeof(v_livekit)<>'object'
       or nullif(btrim(coalesce(v_livekit->>'api_key','')),'') is null
       or length(coalesce(v_livekit->>'api_key',''))<8
       or nullif(btrim(coalesce(v_livekit->>'api_secret','')),'') is null
       or length(coalesce(v_livekit->>'api_secret',''))<16 then
      raise exception 'LIVEKIT_API_KEY_AND_SECRET_REQUIRED' using errcode='22023';
    end if;
  end if;

  if p_provider_key='distribution.provider' then
    begin
      v_revelator:=v_secret::jsonb;
    exception when others then
      raise exception 'REVELATOR_PARTNER_KEY_AND_USER_ID_REQUIRED' using errcode='22023';
    end;
    if jsonb_typeof(v_revelator)<>'object'
       or nullif(btrim(coalesce(v_revelator->>'partner_api_key','')),'') is null
       or (v_revelator->>'partner_api_key') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or nullif(btrim(coalesce(v_revelator->>'partner_user_id','')),'') is null
       or length(v_revelator->>'partner_user_id')>256 then
      raise exception 'REVELATOR_PARTNER_KEY_AND_USER_ID_REQUIRED' using errcode='22023';
    end if;
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
       when p_provider_key='distribution.provider' then 'provider_auth_verification_pending'
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
             'Revelator partner API key + partner user ID are stored in Vault. Run authenticated provider login verification before enabling delivery.'
           when item_key='sfu_turn_provider' then
             'LiveKit API key + API secret are stored. Verify room/token issuance through the LiveKit gateway.'
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

create or replace function public.tgg_revelator_credentials_save(
  p_partner_api_key text,
  p_partner_user_id text,
  p_endpoint_url text default 'https://api.revelator.com'
)
returns jsonb
language plpgsql
set search_path to 'public','pg_catalog'
as $$
declare
  v_uid uuid:=auth.uid();
  v_role text:=coalesce(auth.jwt()->'app_metadata'->>'tgg_role','');
  v_endpoint text:=nullif(btrim(coalesce(p_endpoint_url,'')),'');
  v_key text:=nullif(btrim(coalesce(p_partner_api_key,'')),'');
  v_user text:=nullif(btrim(coalesce(p_partner_user_id,'')),'');
  v_bundle text;
  v_stage jsonb;
  v_store jsonb;
  v_probe jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_role<>'owner' then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  if v_endpoint is null or v_endpoint !~ '^https://api\.revelator\.com/?$' then
    raise exception 'REVELATOR_API_ENDPOINT_REQUIRED' using errcode='22023';
  end if;
  if v_key is null or v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'REVELATOR_PARTNER_API_KEY_REQUIRED' using errcode='22023';
  end if;
  if v_user is null or length(v_user)>256 then
    raise exception 'REVELATOR_PARTNER_USER_ID_REQUIRED' using errcode='22023';
  end if;

  v_bundle:=jsonb_build_object('partner_api_key',v_key,'partner_user_id',v_user)::text;
  v_stage:=public.tgg_provider_activation_stage('distribution.provider',v_endpoint,'tgg_distribution_provider_secret');
  v_store:=public.tgg_store_provider_secret('distribution.provider',v_bundle);
  v_probe:=public.tgg_provider_activation_verify('distribution.provider');

  return jsonb_build_object(
    'ok',true,
    'provider_key','distribution.provider',
    'endpoint_url',v_endpoint,
    'secret_stored',coalesce((v_store->>'ok')::boolean,false),
    'secret_value_returned',false,
    'credential_shape','partner_api_key_plus_partner_user_id',
    'credentials_verified',false,
    'reachability_verification',v_probe,
    'next_step','Run authenticated Revelator login verification.'
  );
end;
$$;

revoke all on function public.tgg_revelator_credentials_save(text,text,text) from public;
revoke execute on function public.tgg_revelator_credentials_save(text,text,text) from anon;
grant execute on function public.tgg_revelator_credentials_save(text,text,text) to authenticated;

create or replace function public.tgg_server_distribution_credentials()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
  v_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
  v_endpoint text;
  v_secret_text text;
  v_secret jsonb;
begin
  if v_role<>'service_role' and v_claims not like '%"role":"service_role"%' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  select endpoint_url into v_endpoint
  from private.tgg_provider_activation_staging
  where provider_key='distribution.provider'
  limit 1;

  if nullif(btrim(coalesce(v_endpoint,'')),'') is null then
    raise exception 'distribution_endpoint_unavailable';
  end if;

  if not exists(
    select 1 from private.tgg_provider_secret_registry
    where provider_key='distribution.provider'
      and status in ('stored','verified','runtime_verified')
  ) then
    raise exception 'distribution_secret_unavailable';
  end if;

  select decrypted_secret into v_secret_text
  from vault.decrypted_secrets
  where name='tgg_distribution_provider_secret'
  order by created_at desc
  limit 1;

  if nullif(v_secret_text,'') is null then raise exception 'distribution_secret_unavailable'; end if;
  begin v_secret:=v_secret_text::jsonb;
  exception when others then raise exception 'distribution_secret_invalid'; end;

  if jsonb_typeof(v_secret)<>'object'
     or nullif(btrim(coalesce(v_secret->>'partner_api_key','')),'') is null
     or nullif(btrim(coalesce(v_secret->>'partner_user_id','')),'') is null then
    raise exception 'distribution_secret_invalid';
  end if;

  return jsonb_build_object(
    'endpoint_url',v_endpoint,
    'partner_api_key',v_secret->>'partner_api_key',
    'partner_user_id',v_secret->>'partner_user_id'
  );
end;
$$;

revoke all on function public.tgg_server_distribution_credentials() from public;
revoke execute on function public.tgg_server_distribution_credentials() from anon,authenticated;
grant execute on function public.tgg_server_distribution_credentials() to service_role;

-- ============================================================
-- MIGRATION 20260915041553 correct_provider_activation_guidance_for_livekit_and_revelator
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('private.tgg_apply_provider_staging_to_activation_queue()'::regprocedure)
  into v_def;

  v_def:=replace(v_def,
    'Open Creator OS → Finish Setup, enter the real DSP production credential, save it to Vault, and complete authenticated provider verification.',
    'Open Creator OS → Expansion Control → Provider Endpoint Staging. Enter the Revelator partner API key and partner user ID, save them to Vault, then complete authenticated provider login verification.'
  );
  v_def:=replace(v_def,
    'DSP credential is stored. Complete authenticated provider verification before enabling production delivery.',
    'Revelator partner credentials are stored. Complete authenticated provider login verification before enabling production delivery.'
  );
  v_def:=replace(v_def,
    'DSP endpoint is staged. Open Creator OS → Finish Setup, enter the real production credential, save it to Vault, and run verification.',
    'DSP endpoint is staged. Open Creator OS → Expansion Control → Provider Endpoint Staging, enter the Revelator partner API key and partner user ID, save them to Vault, then run verification.'
  );
  v_def:=replace(v_def,
    'Open Creator OS → Finish Setup, enter the real LiveKit credentials, save them to Vault, and complete authenticated SFU/TURN verification.',
    'Open Creator OS → Expansion Control → Provider Endpoint Staging. Enter the LiveKit WSS URL, API key, and API secret, then use Save + Verify LiveKit.'
  );
  v_def:=replace(v_def,
    'LiveKit credential is stored. Complete authenticated SFU/TURN verification before enabling production transport.',
    'LiveKit API key + API secret are stored. Complete authenticated token/SFU/TURN verification before enabling production transport.'
  );
  v_def:=replace(v_def,
    'LiveKit endpoint is staged. Open Creator OS → Finish Setup, enter the real production credentials, save them to Vault, and run verification.',
    'LiveKit endpoint is staged. Open Creator OS → Expansion Control → Provider Endpoint Staging, enter the API key and API secret, save them to Vault, and run token/SFU/TURN verification.'
  );

  execute v_def;
end
$$;

select private.tgg_schema_attestation_reconcile(
  'Correct provider activation guidance for Revelator credential pair and LiveKit key/secret pair',
  array['private.tgg_apply_provider_staging_to_activation_queue()']::text[]
);

-- ============================================================
-- MIGRATION 20260915041731 add_distribution_provider_verification_runtime
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_distribution_provider_worker_runtime(
  id integer primary key check(id=1),
  monitor_token text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_distribution_provider_worker_runtime enable row level security;
revoke all on table public.tgg_distribution_provider_worker_runtime from anon,authenticated;

insert into public.tgg_distribution_provider_worker_runtime(id,monitor_token,active)
values(1,encode(extensions.gen_random_bytes(32),'hex'),true)
on conflict(id) do update set active=true,updated_at=now();

create or replace function public.tgg_server_distribution_verification_record(
  p_authenticated boolean,
  p_write_allowed boolean,
  p_permissions_count integer,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
  v_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
  v_status text;
begin
  if v_role<>'service_role' and v_claims not like '%"role":"service_role"%' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  v_status:=case
    when coalesce(p_authenticated,false) and coalesce(p_write_allowed,false) then 'verified'
    when coalesce(p_authenticated,false) then 'stored'
    else 'error'
  end;

  update private.tgg_provider_secret_registry
  set status=v_status,
      verified_at=case when v_status='verified' then now() else verified_at end,
      last_error=case
        when v_status='verified' then null
        when coalesce(p_authenticated,false) then 'revelator_distribution_write_permission_required'
        else coalesce(nullif(p_error_code,''),'revelator_authentication_failed')
      end,
      updated_at=now()
  where provider_key='distribution.provider';

  update public.tgg_provider_runtime_config
  set enabled=false,
      mode=case when v_status='verified' then 'credentials_verified' else 'adapter_ready' end,
      endpoint_configured=true,
      disabled_reason=case
        when v_status='verified' then 'provider_delivery_validation_pending'
        when coalesce(p_authenticated,false) then 'provider_distribution_write_permission_required'
        else 'provider_authentication_required'
      end,
      updated_at=now()
  where provider_key='distribution.provider';

  update private.tgg_one_final_activation_queue
  set status=case when v_status='verified' then 'ready' else 'external_action' end,
      next_action=case
        when v_status='verified' then 'Revelator login and distribution write permission are verified. Complete one provider delivery validation after release legal metadata is ready.'
        when coalesce(p_authenticated,false) then 'Revelator login succeeded, but the selected account does not expose distribution write permission. Confirm the production account/permissions.'
        else 'Enter the real Revelator partner API key and partner user ID, then rerun authenticated provider verification.'
      end,
      evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object(
        'provider_authentication_verified',coalesce(p_authenticated,false),
        'provider_distribution_write_allowed',coalesce(p_write_allowed,false),
        'provider_permissions_count',greatest(coalesce(p_permissions_count,0),0),
        'credentials_verified',v_status='verified',
        'provider_delivery_validated',false,
        'secret_value_exposed',false,
        'verification_error_code',p_error_code,
        'provider_verification_recorded_at',now()
      ),
      last_checked_at=now()
  where item_key='distribution_provider';

  return jsonb_build_object(
    'ok',true,
    'provider_key','distribution.provider',
    'credential_status',v_status,
    'authenticated',coalesce(p_authenticated,false),
    'distribution_write_allowed',coalesce(p_write_allowed,false),
    'permissions_count',greatest(coalesce(p_permissions_count,0),0),
    'runtime_enabled',false,
    'delivery_validation_pending',v_status='verified',
    'secret_value_returned',false,
    'recorded_at',now()
  );
end;
$$;

revoke all on function public.tgg_server_distribution_verification_record(boolean,boolean,integer,text) from public;
revoke execute on function public.tgg_server_distribution_verification_record(boolean,boolean,integer,text) from anon,authenticated;
grant execute on function public.tgg_server_distribution_verification_record(boolean,boolean,integer,text) to service_role;

-- ============================================================
-- MIGRATION 20260915041820 grant_distribution_worker_runtime_to_service_role
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

grant select on table public.tgg_distribution_provider_worker_runtime to service_role;

-- ============================================================
-- MIGRATION 20260915042514 remove_dormant_video_ai_edit_sessions_from_realtime
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter publication supabase_realtime drop table public.tgg_video_studio_ai_edit_sessions;

-- ============================================================
-- MIGRATION 20260915042640 make_blogger_oauth_manifest_status_live
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.tgg_v5000_production_manifest()'::regprocedure)
  into v_def;

  v_def:=replace(
    v_def,
    '''blogger_maintenance_oauth_recovered'',true,',
    '''blogger_maintenance_oauth_recovered'',(select coalesce(bool_or(c.status=''connected'' and c.revoked_at is null and c.last_error is null),false) from public.v98_blogger_connections c where c.blog_url=''https://trugogettamixtapes.blogspot.com/''),'
  );

  if v_def not like '%blogger_maintenance_oauth_recovered%' or v_def like '%''blogger_maintenance_oauth_recovered'',true,%' then
    raise exception 'manifest_blogger_status_patch_failed';
  end if;

  execute v_def;
end
$$;

select private.tgg_schema_attestation_reconcile(
  'Make production manifest Blogger OAuth recovery status derive from canonical live connection state',
  array['public.tgg_v5000_production_manifest()']::text[]
);

-- ============================================================
-- MIGRATION 20260915051633 harden_public_analytics_and_discovery_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Public analytics already has an anon-safe INSERT policy, so it does not need elevated privileges.
ALTER FUNCTION public.tgg_record_public_analytics_event(text,text,uuid,text,text,jsonb) SECURITY INVOKER;

-- Keep discovery public, but bound arbitrary search input before it reaches ILIKE scans.
CREATE OR REPLACE FUNCTION public.tgg_public_discovery_growth_feed(p_limit integer DEFAULT 12, p_query text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,12),24));
  v_query text := nullif(btrim(coalesce(p_query,'')), '');
  v_items jsonb;
begin
  if v_query is not null and char_length(v_query) > 120 then
    raise exception 'DISCOVERY_QUERY_TOO_LONG' using errcode='22023';
  end if;

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

-- ============================================================
-- MIGRATION 20260915051740 fix_public_analytics_invoker_returning
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE OR REPLACE FUNCTION public.tgg_record_public_analytics_event(
  p_event_type text,
  p_entity_type text DEFAULT NULL::text,
  p_entity_id uuid DEFAULT NULL::uuid,
  p_session_id text DEFAULT NULL::text,
  p_referrer text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
declare
  v_id uuid := gen_random_uuid();
  v_type text := lower(trim(coalesce(p_event_type,'')));
  v_meta jsonb := coalesce(p_metadata,'{}'::jsonb);
begin
  if v_type not in ('page_view','discovery_view','mixtape_view','track_view','player_start','player_progress','player_complete','next_track','share','save','download','outbound_click') then
    raise exception 'ANALYTICS_EVENT_INVALID' using errcode='22023';
  end if;
  if p_entity_type is not null and char_length(p_entity_type)>80 then
    raise exception 'ANALYTICS_ENTITY_TYPE_TOO_LONG' using errcode='22023';
  end if;
  if p_session_id is not null and char_length(p_session_id)>128 then
    raise exception 'ANALYTICS_SESSION_TOO_LONG' using errcode='22023';
  end if;
  if p_referrer is not null and char_length(p_referrer)>2048 then
    raise exception 'ANALYTICS_REFERRER_TOO_LONG' using errcode='22023';
  end if;
  if jsonb_typeof(v_meta)<>'object' or octet_length(v_meta::text)>8192 then
    raise exception 'ANALYTICS_METADATA_INVALID' using errcode='22023';
  end if;

  insert into public.analytics_events(id,user_id,session_id,event_type,entity_type,entity_id,referrer,metadata)
  values(
    v_id,
    auth.uid(),
    nullif(left(trim(coalesce(p_session_id,'')),128),''),
    v_type,
    nullif(left(trim(coalesce(p_entity_type,'')),80),''),
    p_entity_id,
    nullif(left(p_referrer,2048),''),
    v_meta
  );

  return v_id;
end
$function$;

-- ============================================================
-- MIGRATION 20260915051821 index_active_v58_workflow_foreign_keys
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE INDEX IF NOT EXISTS v58_launch_milestones_creator_id_idx
  ON public.v58_launch_milestones (creator_id);

CREATE INDEX IF NOT EXISTS v58_provider_jobs_creator_id_idx
  ON public.v58_provider_jobs (creator_id);

CREATE INDEX IF NOT EXISTS v58_provider_jobs_workflow_step_id_idx
  ON public.v58_provider_jobs (workflow_step_id);

CREATE INDEX IF NOT EXISTS v58_required_actions_workflow_run_id_idx
  ON public.v58_required_actions (workflow_run_id);

CREATE INDEX IF NOT EXISTS v58_required_actions_workflow_step_id_idx
  ON public.v58_required_actions (workflow_step_id);

CREATE INDEX IF NOT EXISTS v58_workflow_events_workflow_step_id_idx
  ON public.v58_workflow_events (workflow_step_id);

-- ============================================================
-- MIGRATION 20260915051954 index_active_creator_media_merch_foreign_keys
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE INDEX IF NOT EXISTS tgg_live_clip_render_jobs_replay_id_idx
  ON public.tgg_live_clip_render_jobs (replay_id);

CREATE INDEX IF NOT EXISTS tgg_media_vault_events_actor_user_id_idx
  ON public.tgg_media_vault_events (actor_user_id);

CREATE INDEX IF NOT EXISTS tgg_media_vault_items_parent_item_id_idx
  ON public.tgg_media_vault_items (parent_item_id);

CREATE INDEX IF NOT EXISTS tgg_media_vault_items_supersedes_item_id_idx
  ON public.tgg_media_vault_items (supersedes_item_id);

CREATE INDEX IF NOT EXISTS tgg_merch_creator_sales_product_id_idx
  ON public.tgg_merch_creator_sales (product_id);

-- ============================================================
-- MIGRATION 20260915052044 index_active_public_queue_growth_foreign_keys
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE INDEX IF NOT EXISTS tgg_public_content_queue_owner_user_id_idx
  ON public.tgg_public_content_queue (owner_user_id);

CREATE INDEX IF NOT EXISTS tgg_creator_growth_badges_artist_id_idx
  ON public.tgg_creator_growth_badges (artist_id);

CREATE INDEX IF NOT EXISTS tgg_growth_autopilot_progress_artist_id_idx
  ON public.tgg_growth_autopilot_progress (artist_id);

-- ============================================================
-- MIGRATION 20260915053429 harden_livekit_credentials_owner_gate
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

CREATE OR REPLACE FUNCTION public.tgg_livekit_credentials_save(
  p_endpoint_url text,
  p_api_key text,
  p_api_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.jwt()->'app_metadata'->>'tgg_role','');
  v_endpoint text := nullif(btrim(coalesce(p_endpoint_url,'')),'');
  v_key text := nullif(btrim(coalesce(p_api_key,'')),'');
  v_secret text := nullif(btrim(coalesce(p_api_secret,'')),'');
  v_packed text;
  v_stage jsonb;
  v_store jsonb;
  v_verify jsonb;
  v_refresh jsonb;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  if v_role <> 'owner' then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  if v_endpoint is null or v_endpoint !~ '^wss://[^[:space:]]+$' then
    raise exception 'LIVEKIT_WSS_URL_REQUIRED' using errcode='22023';
  end if;

  if v_key is null or length(v_key) < 8 then
    raise exception 'LIVEKIT_API_KEY_REQUIRED' using errcode='22023';
  end if;

  if v_secret is null or length(v_secret) < 16 then
    raise exception 'LIVEKIT_API_SECRET_REQUIRED' using errcode='22023';
  end if;

  v_packed := jsonb_build_object(
    'api_key', v_key,
    'api_secret', v_secret
  )::text;

  v_stage := public.tgg_provider_activation_stage(
    'broadcast.sfu_turn',
    v_endpoint,
    'tgg_broadcast_provider_secret'
  );

  v_store := public.tgg_store_provider_secret(
    'broadcast.sfu_turn',
    v_packed
  );

  v_verify := public.tgg_provider_activation_verify('broadcast.sfu_turn');
  v_refresh := public.tgg_one_final_activation_queue_refresh();

  return jsonb_build_object(
    'ok', true,
    'provider_key', 'broadcast.sfu_turn',
    'endpoint_url', v_endpoint,
    'secret_stored', coalesce((v_store->>'ok')::boolean,false),
    'verification_queued', coalesce((v_verify->>'ok')::boolean,false),
    'secret_value_returned', false,
    'stage', v_stage,
    'activation_refreshed', coalesce((v_refresh->>'ok')::boolean,false)
  );
end;
$function$;

