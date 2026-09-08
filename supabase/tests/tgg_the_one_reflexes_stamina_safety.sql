
-- TGG REFLEXES + STAMINA safety

select layer_key,display_name,layer_order,can_execute,can_block,
       production_authority,high_risk_authority,canonical_authority,active
from public.tgg_one_layers
where active=true
order by layer_order;

select c.relname,c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('tgg_one_reflex_snapshots','tgg_one_stamina_snapshots')
order by c.relname;

select p.proname,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'tgg_one_reflex_refresh','tgg_one_reflex_state',
    'tgg_one_stamina_refresh','tgg_one_stamina_state',
    'tgg_one_completeness'
  )
order by p.proname;

select public.tgg_one_reflex_refresh() as reflex_probe;
select public.tgg_one_stamina_refresh() as stamina_probe;
select public.tgg_one_completeness() as one_completeness;

-- Expected exact order:
-- senses, reflexes, shadow, head, mind, heart, muscle, stamina, body, spirit, soul, hair, the_one
-- Reflexes can detect/route only; cannot bypass HEAD or execute production.
-- Stamina respects retry budgets and never exceeds retries.
-- RLS=true.
-- anon/authenticated cannot execute internal functions.
-- one_completeness.ok=true with 13 required layers.
-- production_auto_publish=false.
-- production_promotion_allowed=false.
-- high_risk_auto_execute=false.
-- AB-006 / V223 preserved.
