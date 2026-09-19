-- TGG final launch smoke cleanup safety

select public.tgg_external_action_contract_readiness() as external_actions;

select jsonb_build_object(
  'count',(select count(*) from public.tgg_one_layers where active=true),
  'min_order',(select min(layer_order) from public.tgg_one_layers where active=true),
  'max_order',(select max(layer_order) from public.tgg_one_layers where active=true),
  'distinct_orders',(select count(distinct layer_order) from public.tgg_one_layers where active=true),
  'the_one_last',(select layer_order=58 from public.tgg_one_layers where layer_key='the_one' and active=true)
) as hierarchy;

select private.tgg_post_migration_schema_attestation_check() as attestation;

select count(*) as open_alerts
from public.tgg_operational_alerts
where status<>'resolved';

select public.tgg_one_hands_refresh() as hands;

-- Expected:
-- external action contract = 6/6 ready; completed Blogger OAuth requires no action URL.
-- 58 active layers exactly ordered 1..58; THE ONE last.
-- attestation passes after approved intentional smoke reconciliation.
-- zero open operational alerts.
-- HANDS external_contract_ready=6/6.
-- protected checkpoint identity/runtime recovery fields unchanged.
-- AB-006 / V223 remains canonical boundary.
