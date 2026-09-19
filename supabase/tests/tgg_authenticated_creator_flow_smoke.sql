-- TGG authenticated creator-flow smoke safety
select public.tgg_auth_authorization_readiness() as auth_readiness;
select public.tgg_creator_ui_action_readiness() as ui_action_readiness;

select p.proname,p.prosecdef,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_creator_upload_bootstrap','tgg_upload_track',
    'tgg_register_pending_media_upload','tgg_finalize_studio_upload',
    'tgg_finalize_vault_upload','tgg_finalize_video_upload','tgg_finalize_message_upload'
  )
order by p.proname;

-- Expected:
-- owner_rpcs 7/7 ready.
-- unsafe user-metadata function/policy count 0.
-- fresh-owner helper is accepted as a valid owner check.
-- Creator UI references 56/56, workspaces 11/11, destinations 10/10.
-- upload/finalize RPCs are SECURITY INVOKER, authenticated executable, anon blocked.
