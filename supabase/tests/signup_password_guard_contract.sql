-- TGG signup password guard contract test
-- Rollback-only: exercises the real trigger with enforcement enabled, then restores state.

begin;

update private.tgg_signup_password_guard_config
set enforcement_enabled=true
where id=1;

create temp table tgg_signup_guard_canary(
  email text,
  encrypted_password text,
  raw_user_meta_data jsonb
) on commit drop;

create trigger tgg_signup_guard_canary_trigger
before insert or update on tgg_signup_guard_canary
for each row execute function private.tgg_signup_password_guard();

do $canary$
declare
  v_token uuid;
  v_meta jsonb;
  v_hash text := encode(extensions.digest(lower('guard-canary@example.invalid'),'sha256'),'hex');
begin
  v_token := gen_random_uuid();
  perform public.tgg_signup_approval_issue_service(v_token,v_hash,'creator_os_direct');

  insert into tgg_signup_guard_canary(email,encrypted_password,raw_user_meta_data)
  values(
    'guard-canary@example.invalid',
    'encrypted-placeholder',
    jsonb_build_object(
      'signup_source','creator_os_direct',
      'tgg_signup_approval',v_token::text
    )
  )
  returning raw_user_meta_data into v_meta;

  if v_meta ? 'tgg_signup_approval' then
    raise exception 'CANARY_FAIL_TOKEN_NOT_STRIPPED';
  end if;

  if exists(select 1 from private.tgg_signup_password_approvals where token=v_token) then
    raise exception 'CANARY_FAIL_TOKEN_NOT_CONSUMED';
  end if;

  begin
    insert into tgg_signup_guard_canary(email,encrypted_password,raw_user_meta_data)
    values(
      'guard-canary-invalid@example.invalid',
      'encrypted-placeholder',
      jsonb_build_object(
        'signup_source','creator_os_direct',
        'tgg_signup_approval',gen_random_uuid()::text
      )
    );
    raise exception 'CANARY_FAIL_INVALID_TOKEN_ALLOWED';
  exception when others then
    if sqlerrm <> 'TGG_PASSWORD_APPROVAL_REQUIRED' then
      raise;
    end if;
  end;

  insert into tgg_signup_guard_canary(email,encrypted_password,raw_user_meta_data)
  values('guard-repair@example.invalid','', '{}'::jsonb);

  v_token := gen_random_uuid();
  v_hash := encode(extensions.digest(lower('guard-repair@example.invalid'),'sha256'),'hex');
  perform public.tgg_signup_approval_issue_service(v_token,v_hash,'call_validation_invite');

  update tgg_signup_guard_canary
  set encrypted_password='encrypted-placeholder-2',
      raw_user_meta_data=jsonb_build_object(
        'signup_source','call_validation_invite',
        'repaired_unconfirmed_account',true,
        'tgg_signup_approval',v_token::text
      )
  where email='guard-repair@example.invalid'
  returning raw_user_meta_data into v_meta;

  if v_meta ? 'tgg_signup_approval' then
    raise exception 'CANARY_FAIL_REPAIR_TOKEN_NOT_STRIPPED';
  end if;

  if exists(select 1 from private.tgg_signup_password_approvals where token=v_token) then
    raise exception 'CANARY_FAIL_REPAIR_TOKEN_NOT_CONSUMED';
  end if;
end
$canary$;

rollback;
