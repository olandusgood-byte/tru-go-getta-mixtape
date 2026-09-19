-- TGG DOUBLE MATRIX BREAKER safety
select guardrail_key,category,severity,action,active,immutable,rule
from public.tgg_brain_guardrails
where guardrail_key in ('guardrail:no-witch-spells-wizards','guardrail:no-double-matrix-loop')
order by guardrail_key;

select public.tgg_one_double_matrix_refresh() as breaker;
select public.tgg_one_double_matrix_completeness() as completeness;

select layer_key,display_name,layer_order,production_authority,high_risk_authority,canonical_authority
from public.tgg_one_layers
where active=true
order by layer_order;

-- Expected:
-- no witch/spell/wizard/occult execution authority.
-- no supernatural action claims.
-- no recursive/duplicate Matrix-Lewis buildup.
-- no forced exit or destructive session cleanup.
-- safe return recommendation artist_creator_os.
-- 58 layers; THE ONE last.
-- AB-006 / V223 preserved.
