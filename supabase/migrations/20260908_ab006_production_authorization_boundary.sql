-- AB-006: explicit production authorization boundary.
-- This records authorization only. It never promotes or deploys production.

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
    staging_release_id,
    checkpoint_key,
    authorization_key,
    status,
    authorized_by,
    authorization_note
  ) values (
    v_stage.id,
    v_stage.checkpoint_key,
    btrim(p_authorization_key),
    'approved',
    auth.uid(),
    p_note
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
