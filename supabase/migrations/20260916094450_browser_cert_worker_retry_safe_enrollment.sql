create unique index if not exists tgg_browser_cert_workers_owner_name_uidx
on public.tgg_browser_cert_workers(created_by,worker_name);

create or replace function public.tgg_browser_cert_worker_enroll(
  p_worker_name text,
  p_capabilities jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_id uuid;
  v_token text;
  v_name text:=left(btrim(coalesce(p_worker_name,'')),160);
begin
  if v_uid is null or not private.tgg_is_owner_fresh() then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;
  if char_length(v_name)<2 then
    raise exception 'WORKER_NAME_INVALID';
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');

  insert into public.tgg_browser_cert_workers(
    worker_name,token_hash,status,capabilities,metadata,created_by,last_seen_at,updated_at
  ) values(
    v_name,
    extensions.digest(v_token,'sha256'),
    'active',
    coalesce(p_capabilities,'{}'::jsonb),
    coalesce(p_metadata,'{}'::jsonb),
    v_uid,
    now(),
    now()
  )
  on conflict (created_by,worker_name) do update set
    token_hash=excluded.token_hash,
    status='active',
    capabilities=excluded.capabilities,
    metadata=excluded.metadata,
    last_seen_at=now(),
    updated_at=now()
  returning id into v_id;

  return jsonb_build_object(
    'ok',true,
    'worker_id',v_id,
    'worker_token',v_token,
    'token_display_policy','show_once',
    'retry_policy','same_owner_worker_rotates_token'
  );
end;
$$;

revoke all on function public.tgg_browser_cert_worker_enroll(text,jsonb,jsonb) from public;
revoke execute on function public.tgg_browser_cert_worker_enroll(text,jsonb,jsonb) from anon;
grant execute on function public.tgg_browser_cert_worker_enroll(text,jsonb,jsonb) to authenticated;
