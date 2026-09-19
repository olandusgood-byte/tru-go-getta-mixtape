
-- TGG SCOUT + BONES + CIRCULATION safety

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
    'tgg_one_scout_snapshots',
    'tgg_one_bones_snapshots',
    'tgg_one_circulation_snapshots'
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
    'tgg_one_scout_refresh','tgg_one_scout_state',
    'tgg_one_bones_refresh','tgg_one_bones_state',
    'tgg_one_circulation_refresh','tgg_one_circulation_state',
    'tgg_one_completeness'
  )
order by p.proname;

select public.tgg_one_scout_refresh() as scout_probe;
select public.tgg_one_bones_refresh() as bones_probe;
select public.tgg_one_circulation_refresh() as circulation_probe;
select public.tgg_one_completeness() as completeness;

-- Expected exact order includes:
-- senses, reflexes, scout, shadow, head, mind, heart, bones, circulation,
-- muscle, stamina, body, spirit, soul, hair, the_one
-- SCOUT may report review-only CodeSync drift without restricting safe work.
-- BONES: broken_required_links=0 and stale_components=0 on healthy state.
-- CIRCULATION must not perform production changes.
-- RLS=true, anon/authenticated cannot execute internal functions.
-- completeness.ok=true with 16 required layers.
-- AB-006 / V223 preserved.
