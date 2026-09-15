-- TGG GUARDED MOTION safety

select guardrail_key,category,severity,action,active,immutable,rule
from public.tgg_brain_guardrails
where guardrail_key in ('guardrail:no-hexes','guardrail:no-forcing-evil')
order by guardrail_key;

select c.relname,c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'tgg_one_jack_snapshots','tgg_one_animal_snapshots','tgg_one_oracle_snapshots',
    'tgg_one_chicken_snapshots','tgg_one_elevator_snapshots','tgg_one_mask_snapshots'
  )
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_exec,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_jack_refresh','tgg_one_animal_refresh','tgg_one_oracle_refresh',
    'tgg_one_chicken_refresh','tgg_one_elevator_refresh','tgg_one_mask_refresh',
    'tgg_one_guarded_motion_completeness'
  )
order by p.proname;

select public.tgg_one_jack_refresh() as jack;
select public.tgg_one_animal_refresh() as animal;
select public.tgg_one_oracle_refresh() as oracle;
select public.tgg_one_chicken_refresh() as chicken;
select public.tgg_one_elevator_refresh() as elevator;
select public.tgg_one_mask_refresh() as mask;
select public.tgg_one_guarded_motion_completeness() as completeness;

select layer_key,display_name,layer_order,production_authority,high_risk_authority,canonical_authority
from public.tgg_one_layers
where active=true
order by layer_order;

-- Expected:
-- NO HEXES and NO FORCING EVIL are active immutable critical block guardrails.
-- JACK watches one target only and never executes.
-- ANIMAL may retreat but has no attack authority.
-- ORACLE is probabilistic/advisory: no prophecy/psychic/certainty claims.
-- CHICKEN waits/reroutes rather than forcing unsafe crossing.
-- ELEVATOR never auto-moves users and requires Veil/caution.
-- MASK forbids impersonation/auth bypass/secret reveal.
-- 52 active layers, THE ONE last.
-- no production/high-risk/canonical authority added.
-- NO-FREQ stays false.
-- AB-006 / V223 preserved.
