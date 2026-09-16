create or replace function private.tgg_browser_cert_worker_version_matches(p_worker_metadata jsonb, p_job_spec jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select case
    when nullif(btrim(coalesce(p_job_spec->>'required_worker_version','')), '') is null then true
    else coalesce(p_worker_metadata->>'version','') = p_job_spec->>'required_worker_version'
  end
$$;

revoke all on function private.tgg_browser_cert_worker_version_matches(jsonb,jsonb) from public, anon, authenticated;

create or replace function public.tgg_browser_cert_worker_claim(p_worker_id uuid, p_token text, p_lease_seconds integer default 300)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_job public.tgg_browser_cert_jobs%rowtype;
  v_lease uuid := gen_random_uuid();
  v_secs integer := greatest(60,least(coalesce(p_lease_seconds,300),1800));
  v_payload jsonb;
  v_worker_metadata jsonb;
begin
  if not private.tgg_browser_cert_worker_valid(p_worker_id,p_token) then
    raise exception 'WORKER_AUTH_FAILED' using errcode='42501';
  end if;

  select coalesce(w.metadata,'{}'::jsonb)
    into v_worker_metadata
    from public.tgg_browser_cert_workers w
   where w.id=p_worker_id;

  update public.tgg_browser_cert_jobs
     set status='queued',leased_by=null,lease_token=null,lease_expires_at=null,updated_at=now()
   where status='leased' and lease_expires_at<now() and attempt_count<max_attempts;

  select * into v_job
    from public.tgg_browser_cert_jobs j
   where j.status='queued'
     and j.attempt_count<j.max_attempts
     and private.tgg_browser_cert_worker_version_matches(v_worker_metadata,j.spec)
   order by j.priority desc,j.created_at
   for update skip locked
   limit 1;

  if v_job.id is null then
    return jsonb_build_object('ok',true,'job',null);
  end if;

  update public.tgg_browser_cert_jobs
     set status='leased',leased_by=p_worker_id,lease_token=v_lease,
         lease_expires_at=now()+make_interval(secs=>v_secs),
         attempt_count=attempt_count+1,updated_at=now()
   where id=v_job.id
   returning * into v_job;

  update public.tgg_browser_cert_workers
     set last_seen_at=now(),updated_at=now()
   where id=p_worker_id;

  v_payload := jsonb_build_object(
    'id',v_job.id,
    'flow_key',v_job.flow_key,
    'job_type',v_job.job_type,
    'url',v_job.url,
    'auth_mode',v_job.auth_mode,
    'spec',v_job.spec,
    'attempt_count',v_job.attempt_count,
    'max_attempts',v_job.max_attempts,
    'lease_token',v_job.lease_token,
    'lease_expires_at',v_job.lease_expires_at
  );

  return jsonb_build_object('ok',true,'job',v_payload) || v_payload;
end;
$function$;
