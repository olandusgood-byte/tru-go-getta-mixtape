-- AB-005 Continuous Staging
-- Additive only. Production advancement remains separately gated.

create table if not exists public.release_staging_records (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null,
  environment text not null default 'staging' check (environment = 'staging'),
  status text not null default 'prepared' check (status in ('prepared','smoke_failed','rolled_back','staging_passed','ready_for_production')),
  rollback_reference text,
  source_checkpoint_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists release_staging_records_release_idx
  on public.release_staging_records (release_id, created_at desc);

create table if not exists public.release_staging_smoke_results (
  id uuid primary key default gen_random_uuid(),
  staging_record_id uuid not null references public.release_staging_records(id) on delete cascade,
  result text not null check (result in ('pass','fail','blocked','manual')),
  details jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists release_staging_smoke_results_record_idx
  on public.release_staging_smoke_results (staging_record_id, created_at desc);

create table if not exists public.release_checkpoints (
  id uuid primary key default gen_random_uuid(),
  staging_record_id uuid not null references public.release_staging_records(id) on delete cascade,
  checkpoint_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (staging_record_id, checkpoint_key)
);

create index if not exists release_checkpoints_record_idx
  on public.release_checkpoints (staging_record_id, created_at desc);

-- One staging release record per release may be active at a time.
create unique index if not exists release_staging_one_active_idx
  on public.release_staging_records (release_id)
  where status in ('prepared','smoke_failed','rolled_back','staging_passed','ready_for_production');

create or replace function public.ab005_prepare_staging(
  p_release_id uuid,
  p_created_by uuid default null,
  p_rollback_reference text default null
) returns public.release_staging_records
language plpgsql security definer set search_path = public
as $$
declare r public.release_staging_records;
begin
  insert into public.release_staging_records(release_id, created_by, rollback_reference)
  values(p_release_id, p_created_by, p_rollback_reference)
  returning * into r;
  return r;
end;
$$;

create or replace function public.ab005_record_smoke(
  p_staging_record_id uuid,
  p_result text,
  p_details jsonb default '{}'::jsonb,
  p_created_by uuid default null
) returns public.release_staging_smoke_results
language plpgsql security definer set search_path = public
as $$
declare r public.release_staging_smoke_results;
begin
  if p_result not in ('pass','fail','blocked','manual') then
    raise exception 'Invalid smoke result: %', p_result;
  end if;
  insert into public.release_staging_smoke_results(staging_record_id,result,details,created_by)
  values(p_staging_record_id,p_result,coalesce(p_details,'{}'::jsonb),p_created_by)
  returning * into r;
  update public.release_staging_records
    set status = case p_result when 'fail' then 'smoke_failed' when 'blocked' then 'smoke_failed' else status end,
        updated_at = now()
  where id = p_staging_record_id;
  return r;
end;
$$;

create or replace function public.ab005_rollback_staging(
  p_staging_record_id uuid,
  p_rollback_reference text
) returns public.release_staging_records
language plpgsql security definer set search_path = public
as $$
declare r public.release_staging_records;
begin
  update public.release_staging_records
     set status='rolled_back', rollback_reference=p_rollback_reference, updated_at=now()
   where id=p_staging_record_id
  returning * into r;
  if not found then raise exception 'Staging record not found: %', p_staging_record_id; end if;
  return r;
end;
$$;

create or replace function public.ab005_checkpoint(
  p_staging_record_id uuid,
  p_checkpoint_key text,
  p_created_by uuid default null
) returns public.release_checkpoints
language plpgsql security definer set search_path = public
as $$
declare r public.release_checkpoints;
begin
  if nullif(trim(p_checkpoint_key),'') is null then raise exception 'Checkpoint key is required'; end if;
  insert into public.release_checkpoints(staging_record_id,checkpoint_key,created_by)
  values(p_staging_record_id,trim(p_checkpoint_key),p_created_by)
  returning * into r;
  return r;
end;
$$;

-- Automatic advancement occurs only after a clean pass and a checkpoint.
create or replace function public.ab005_advance_after_clean_pass(
  p_staging_record_id uuid
) returns public.release_staging_records
language plpgsql security definer set search_path = public
as $$
declare r public.release_staging_records;
  latest public.release_staging_smoke_results;
  checkpoint_count integer;
begin
  select * into latest
  from public.release_staging_smoke_results
  where staging_record_id=p_staging_record_id
  order by created_at desc
  limit 1;

  select count(*) into checkpoint_count
  from public.release_checkpoints
  where staging_record_id=p_staging_record_id;

  if latest.id is null or latest.result <> 'pass' then
    raise exception 'Staging cannot advance: latest smoke result is not pass';
  end if;
  if checkpoint_count = 0 then
    raise exception 'Staging cannot advance: checkpoint required';
  end if;

  update public.release_staging_records
     set status='ready_for_production', updated_at=now()
   where id=p_staging_record_id
  returning * into r;
  return r;
end;
$$;

-- Production intentionally has no automatic advancement function in AB-005.
comment on table public.release_staging_records is 'AB-005 additive staging records; production remains separately gated.';
comment on table public.release_staging_smoke_results is 'AB-005 smoke results; contract is pass/fail/blocked/manual.';
comment on table public.release_checkpoints is 'AB-005 checkpoints with unique keys per staging record and optional creator attribution.';
