-- TGG authenticated user E2E evidence refresh safety
select p.proname,p.prosecdef,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='tgg_authenticated_user_e2e_refresh';

select public.tgg_authenticated_user_e2e_refresh() as e2e;

select milestone_key,status,acceptance
from public.tgg_build_milestones
where release_id='433251c2-3ca3-4d95-a535-8b438f0e094c'
  and milestone_key='authenticated-user-e2e';

-- Expected:
-- function is postgres-only.
-- current milestone remains active until a real authenticated artist_world entry
-- followed by artist_creator_os return exists in the private VEIL audit ledger.
-- no portal evidence is fabricated.
-- external credential/device items remain deferred.
-- CodeSync remains protected/review-only.
