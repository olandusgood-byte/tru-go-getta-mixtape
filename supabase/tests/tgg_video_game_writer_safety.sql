-- TGG VIDEO GAME WRITER safety

select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='tgg_game_writer_packets';

select policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public' and tablename='tgg_game_writer_packets'
order by policyname;

select p.proname,p.prosecdef,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_game_writer_enqueue','tgg_game_writer_claim_batch',
    'tgg_game_writer_complete','tgg_game_writer_mark_complete','tgg_game_writer_state'
  )
order by p.proname;

select public.tgg_game_writer_state() as writer_state;

-- Expected:
-- owner can only read own writer packets.
-- enqueue requires authenticated ownership of the source idea.
-- claim/complete/mark-complete are postgres-only.
-- writer packet requires all 19 sections before ready.
-- no production/high-risk/canonical authority is granted.
-- no fabricated QA/deploy/user-action evidence.
-- AB-006/V223 remains protected.
