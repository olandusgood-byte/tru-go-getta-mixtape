-- TGG DOUBLE MATRIX BREAKER + NO WITCH/SPELLS/WIZARDS
insert into public.tgg_brain_guardrails(
  guardrail_key,category,rule,severity,action,active,immutable,source_ref
) values
(
  'guardrail:no-witch-spells-wizards','risk',
  '{"no_witch_logic":true,"no_spell_logic":true,"no_wizard_logic":true,"no_occult_execution_authority":true,"no_supernatural_action_claims":true,"safe_metaphor_only":true}'::jsonb,
  'critical','block',true,true,'User explicit NO WITCH NO SPELLS NO WIZARDS rule'
),
(
  'guardrail:no-double-matrix-loop','risk',
  '{"no_endless_gateway_recursion":true,"no_duplicate_active_gateway_buildup":true,"matrix_lewis_overlap_must_stay_bounded":true,"recommended_safe_return_route":"artist_creator_os","auto_force_exit":false}'::jsonb,
  'critical','block',true,true,'DOUBLE MATRIX loop safety'
)
on conflict(guardrail_key) do update
set rule=excluded.rule,severity='critical',action='block',
    active=true,immutable=true,source_ref=excluded.source_ref,updated_at=now();

create table if not exists public.tgg_one_double_matrix_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('clear','watch','loop_risk','restricted')),
  active_matrix_sessions integer not null default 0,
  active_lewis_sessions integer not null default 0,
  overlapping_users integer not null default 0,
  excessive_matrix_steps integer not null default 0,
  excessive_lewis_steps integer not null default 0,
  duplicate_active_sessions integer not null default 0,
  breaker jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
alter table public.tgg_one_double_matrix_snapshots enable row level security;
revoke all on public.tgg_one_double_matrix_snapshots from anon,authenticated;



revoke all on function public.tgg_one_double_matrix_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_double_matrix_state() from public,anon,authenticated;
revoke all on function public.tgg_one_double_matrix_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_double_matrix_refresh() to postgres;
grant execute on function public.tgg_one_double_matrix_state() to postgres;
grant execute on function public.tgg_one_double_matrix_completeness() to postgres;

update public.tgg_one_layers set layer_order=7000+layer_order where active=true;
insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values(
  'double_matrix_breaker','DOUBLE MATRIX BREAKER 🌀✂️',56,
  'Detect and stop recursive or duplicate Matrix/Lewis gateway patterns without forcing user movement',
  '["loop_detection","duplicate_gateway_detection","bounded_overlap","safe_return_recommendation"]'::jsonb,
  '["tgg_matrix_gateway_sessions","tgg_lewis_portal_sessions","tgg_one_exit_state"]'::jsonb,
  false,true,false,false,false
)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,
    responsibility=excluded.responsibility,source_systems=excluded.source_systems,
    can_execute=false,can_block=true,production_authority=false,
    high_risk_authority=false,canonical_authority=false,active=true,updated_at=now();

update public.tgg_one_layers set layer_order=57 where layer_key='mirror';
update public.tgg_one_layers set layer_order=58 where layer_key='the_one';
