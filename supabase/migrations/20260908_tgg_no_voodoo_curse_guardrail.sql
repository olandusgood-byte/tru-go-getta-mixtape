-- TGG NO VOODOO / NO CURSE guardrail
insert into public.tgg_brain_guardrails(
  guardrail_key,category,rule,severity,action,active,immutable,source_ref
) values (
  'guardrail:no-voodoo-curse',
  'risk',
  '{"forbid_voodoo_as_action_authority":true,"forbid_curse_as_action_authority":true,"forbid_supernatural_harm_claims":true,"forbid_coercive_or_sabotage_behavior":true,"allow_metaphor_only_for_regression_or_warning":true,"frequency_model":false}'::jsonb,
  'critical','block',true,true,'User explicit NO VOODOO CURSE rule'
)
on conflict(guardrail_key) do update
set rule=excluded.rule,severity='critical',action='block',active=true,immutable=true,
    source_ref=excluded.source_ref,updated_at=now();
