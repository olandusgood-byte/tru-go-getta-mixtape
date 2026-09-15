
-- TGG THE ONE 10-layer SENSES + HEART + HAIR safety

select layer_key,display_name,layer_order,can_execute,can_block,
       production_authority,high_risk_authority,canonical_authority,active
from public.tgg_one_layers
where active=true
order by layer_order;

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'tgg_one_senses_snapshots',
    'tgg_one_heart_snapshots',
    'tgg_one_hair_snapshots'
  )
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_senses_refresh','tgg_one_senses_state',
    'tgg_one_heart_refresh','tgg_one_heart_state',
    'tgg_one_hair_refresh','tgg_one_hair_state'
  )
order by p.proname;

select public.tgg_one_senses_refresh() as senses_probe;
select public.tgg_one_heart_refresh() as heart_probe;
select public.tgg_one_hair_refresh() as hair_probe;
select public.tgg_one_state() as one_state;
select public.tgg_autonomic_completeness() as completeness;

-- Expected order:
-- senses, shadow, head, mind, heart, body, spirit, soul, hair, the_one
-- No layer may have production_authority=true or high_risk_authority=true.
-- SENSES/HEART/HAIR snapshot tables have RLS=true.
-- anon/authenticated cannot execute internal layer functions.
-- Hair never owns production/canonical/high-risk authority.
-- completeness.ok=true with 10 active required layers.
-- production_auto_publish=false.
-- production_promotion_allowed=false.
-- high_risk_auto_execute=false.
-- canonical_boundary=AB-006 / V223.
