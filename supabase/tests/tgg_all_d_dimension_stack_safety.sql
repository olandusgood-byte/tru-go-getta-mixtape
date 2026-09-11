-- TGG ALL-D safety
select public.tgg_one_dimension_registry_state() as registry;
select public.tgg_one_all_d_completeness() as completeness;

select dimension_no,dimension_key,display_name,frequency_model,
       production_authority,high_risk_authority,active
from public.tgg_one_dimension_registry
order by dimension_no;

select layer_key,display_name,layer_order,production_authority,high_risk_authority
from public.tgg_one_layers
where active=true
order by layer_order;

select public.tgg_one_dimension_all_refresh(10) as implemented_stack;

-- Expected:
-- 65 dimensions registered: D/0D through 64D.
-- frequency_enabled_count=0.
-- production/high-risk authority count=0.
-- 0D-10D implemented with grounded semantics.
-- 11D-64D remain semantic placeholders until real evidence sources exist.
-- ALL-D aggregate layer exists; THE ONE remains final.
-- no supernatural/frequency claims.
-- AB-006 / V223 preserved.
