-- TRU GO GETTA production migration history archive
-- Date bucket: 20260914
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260914001721 optimize_codesync_rpc_registry_refresh
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_codesync_refresh_rpc_registry()
returns jsonb
language plpgsql
set search_path to 'private','public','pg_catalog','pg_temp'
as $function$
declare
  r record;
  v_db_refs int;
  v_policy_refs int;
  v_state text;
  v_count int:=0;
begin
  create temporary table if not exists pg_temp.tgg_codesync_function_text(
    oid oid primary key,
    function_text text not null
  ) on commit drop;
  truncate pg_temp.tgg_codesync_function_text;
  insert into pg_temp.tgg_codesync_function_text(oid,function_text)
  select p.oid, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p');

  create temporary table if not exists pg_temp.tgg_codesync_policy_text(
    policy_text text not null
  ) on commit drop;
  truncate pg_temp.tgg_codesync_policy_text;
  insert into pg_temp.tgg_codesync_policy_text(policy_text)
  select coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') || ' ' || coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'')
  from pg_policy pol;

  for r in
    select n.nspname as schema_name,p.oid,p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as identity_args,
           regexp_replace(p.proname,'_v[0-9]+$','') as family_key,
           nullif(substring(p.proname from '_v([0-9]+)$'),'')::int as version_num
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prokind in ('f','p') and p.proname like 'tgg_%'
  loop
    select count(*) into v_db_refs
    from pg_temp.tgg_codesync_function_text f
    where f.oid<>r.oid and position(r.function_name in f.function_text)>0;

    select count(*) into v_policy_refs
    from pg_temp.tgg_codesync_policy_text pol
    where position(r.function_name in pol.policy_text)>0;

    if exists (select 1 from private.tgg_rpc_intentional_version_names i where i.schema_name=r.schema_name and i.function_name=r.function_name and i.keep) then
      v_state:='active';
    elsif r.version_num is not null and v_db_refs=0 and v_policy_refs=0 then
      v_state:='safe_to_retire';
    elsif r.version_num is not null then
      v_state:='consolidate';
    elsif exists (
      select 1 from pg_proc q join pg_namespace nq on nq.oid=q.pronamespace
      where nq.nspname in ('public','private') and nq.nspname<>r.schema_name and q.proname=r.function_name
        and pg_get_function_identity_arguments(q.oid)=r.identity_args
    ) then
      v_state:='wrapper_pair';
    else
      v_state:='active';
    end if;

    insert into private.tgg_rpc_registry(schema_name,function_name,identity_args,family_key,version_num,db_refs,policy_refs,state,notes,last_scanned_at)
    values(r.schema_name,r.function_name,r.identity_args,r.family_key,r.version_num,v_db_refs,v_policy_refs,v_state,
      case when v_policy_refs>0 then 'Referenced by active RLS policies; do not retire without migrating policies.'
           when v_state='safe_to_retire' then 'No database-function or RLS-policy references detected.'
           when v_state='consolidate' then 'Versioned RPC still has dependencies; consolidate before retirement.'
           when v_state='wrapper_pair' then 'Public/private pair preserved pending security-wrapper comparison.'
           else null end, now())
    on conflict(schema_name,function_name,identity_args) do update set
      family_key=excluded.family_key,version_num=excluded.version_num,db_refs=excluded.db_refs,policy_refs=excluded.policy_refs,
      state=case when private.tgg_rpc_registry.state='retired' then 'retired' else excluded.state end,
      notes=excluded.notes,last_scanned_at=now();
    v_count:=v_count+1;
  end loop;

  delete from private.tgg_rpc_registry rr where rr.state<>'retired' and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname=rr.schema_name and p.proname=rr.function_name
      and pg_get_function_identity_arguments(p.oid)=rr.identity_args);

  insert into public.tgg_code_sync_rpc_state(id,tracked,canonical,consolidate,safe_to_retire,wrapper_pairs,retired,updated_at)
  values(1,(select count(*) from private.tgg_rpc_registry),(select count(*) from private.tgg_rpc_registry where state='canonical'),
    (select count(*) from private.tgg_rpc_registry where state='consolidate'),(select count(*) from private.tgg_rpc_registry where state='safe_to_retire'),
    (select count(*) from private.tgg_rpc_registry where state='wrapper_pair'),(select count(*) from private.tgg_rpc_registry where state='retired'),now())
  on conflict(id) do update set tracked=excluded.tracked,canonical=excluded.canonical,consolidate=excluded.consolidate,safe_to_retire=excluded.safe_to_retire,
    wrapper_pairs=excluded.wrapper_pairs,retired=excluded.retired,updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'tracked',v_count,'refreshed_at',now());
end;
$function$;

-- ============================================================
-- MIGRATION 20260914024035 enable_video_production_realtime_core
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tgg_studio_projects',
    'tgg_studio_assets',
    'tgg_video_timeline_items',
    'tgg_video_studio_timeline_actions',
    'tgg_video_studio_ai_edit_sessions',
    'tgg_video_studio_publish_manifests',
    'tgg_homepage_publish_events'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname='supabase_realtime'
           AND schemaname='public'
           AND tablename=t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

