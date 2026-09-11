-- TGG CHOICE / FREE WILL + EMERGENCY EXIT safety

select guardrail_key,category,severity,action,active,immutable,rule
from public.tgg_brain_guardrails
where guardrail_key='guardrail:user-transition-consent';

select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_one_choices','tgg_one_choice_snapshots','tgg_one_exit_snapshots')
order by c.relname;

select policyname,cmd,roles,qual,with_check
from pg_policies
where schemaname='public' and tablename='tgg_one_choices'
order by policyname;

select p.proname,p.prosecdef,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_choice_set','tgg_one_choice_state','tgg_one_transition_allowed',
    'tgg_one_choice_refresh','tgg_one_exit_refresh','tgg_one_choice_exit_completeness'
  )
order by p.proname;

select public.tgg_one_choice_refresh() as choice_health;
select public.tgg_one_exit_refresh() as exit_health;
select public.tgg_one_choice_exit_completeness() as completeness;

select layer_key,display_name,layer_order,production_authority,high_risk_authority,canonical_authority
from public.tgg_one_layers
where active=true
order by layer_order;

-- Expected:
-- explicit user-transition choice defaults to not granted.
-- choice rows are owner scoped.
-- backend safe automation is not blocked by absence of user-transition consent.
-- no forced portal/elevator/persona.
-- emergency exit reuses Matrix/Lewis exits and returns to Creator OS.
-- exit cannot bypass Veil or destroy history.
-- 54 active layers; THE ONE last.
-- no production/high-risk/canonical authority added.
-- AB-006 / V223 preserved.
