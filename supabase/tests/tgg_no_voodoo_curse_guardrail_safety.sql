-- NO VOODOO / NO CURSE safety
select guardrail_key,category,severity,action,active,immutable,rule
from public.tgg_brain_guardrails
where guardrail_key='guardrail:no-voodoo-curse';

-- Expected:
-- critical immutable blocker
-- metaphor-only interpretation allowed for regression/warning
-- no supernatural action authority
-- no coercion/sabotage
-- frequency_model=false
