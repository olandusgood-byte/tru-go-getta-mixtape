-- Harden VEIL audit: private ledger + SECURITY INVOKER public wrapper

create schema if not exists private;

create table if not exists private.tgg_veil_audit_ledger (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  route_key text not null,
  allowed boolean not null,
  access_level text,
  reason text not null,
  source text not null default 'veil',
  metadata jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now()
);

insert into private.tgg_veil_audit_ledger(
  id,actor_user_id,route_key,allowed,access_level,reason,source,metadata,decided_at
)
select id,actor_user_id,route_key,allowed,access_level,reason,source,metadata,decided_at
from public.tgg_veil_audit_ledger
on conflict(id) do nothing;

revoke all on private.tgg_veil_audit_ledger from public,anon;
grant usage on schema private to authenticated;
grant insert on private.tgg_veil_audit_ledger to authenticated;
revoke select,update,delete on private.tgg_veil_audit_ledger from authenticated;

create or replace function public.tgg_veil_route_decision_audited(p_route_key text)
returns jsonb
language plpgsql
security invoker
set search_path='public,private'
as $$
declare
  v_uid uuid:=auth.uid();
  v_decision jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  v_decision:=public.tgg_veil_route_decision(p_route_key);

  insert into private.tgg_veil_audit_ledger(
    actor_user_id,route_key,allowed,access_level,reason,source,metadata
  )
  values(
    v_uid,p_route_key,
    coalesce((v_decision->>'allow')::boolean,false),
    nullif(v_decision->>'access_level',''),
    coalesce(v_decision->>'reason','unknown'),
    'tgg_veil_route_decision_audited',
    jsonb_build_object(
      'path_present',nullif(v_decision->>'path','') is not null,
      'stores_secret_values',false,
      'stores_message_body',false,
      'stores_provider_payload',false
    )
  );

  return v_decision;
end $$;

create or replace function public.tgg_veil_audit_state()
returns jsonb
language sql
security definer
set search_path=''
as $$
select jsonb_build_object(
  'total',count(*),
  'allowed',count(*) filter(where allowed),
  'denied',count(*) filter(where not allowed),
  'last_decision_at',max(decided_at),
  'stores_secrets',false,
  'client_readable',false,
  'ledger_schema','private'
)
from private.tgg_veil_audit_ledger
$$;

revoke all on function public.tgg_veil_route_decision_audited(text) from public,anon,authenticated;
grant execute on function public.tgg_veil_route_decision_audited(text) to authenticated;
revoke all on public.tgg_veil_audit_ledger from public,anon,authenticated;
