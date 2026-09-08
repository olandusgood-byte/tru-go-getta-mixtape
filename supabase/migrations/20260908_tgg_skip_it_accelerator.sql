
-- TGG Skip-It + Acceleration
create table if not exists public.tgg_one_skip_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_key text not null unique,
  item_type text not null,
  item_key text not null,
  requested_action text not null default 'process',
  skip boolean not null default false,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

alter table public.tgg_one_skip_decisions enable row level security;
revoke all on public.tgg_one_skip_decisions from anon,authenticated;



revoke all on function public.tgg_one_skip_check(text,text,text) from public,anon,authenticated;
revoke all on function public.tgg_one_skip_batch(jsonb) from public,anon,authenticated;
revoke all on function public.tgg_one_skip_state() from public,anon,authenticated;
revoke all on function public.tgg_one_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_skip_check(text,text,text) to postgres;
grant execute on function public.tgg_one_skip_batch(jsonb) to postgres;
grant execute on function public.tgg_one_skip_state() to postgres;
grant execute on function public.tgg_one_completeness() to postgres;

update public.tgg_speed_booster_config
set boosted_batch_size=20,hard_max_batch_size=25,mode='adaptive',updated_at=now()
where id=1;

update public.tgg_speed_booster_layers
set max_items=case
  when layer_key='intake' then 10
  when layer_key='spec-plan' then 15
  when layer_key in ('build','qa','evidence-sync') then 20
  else max_items
end,
notes=case
  when layer_key='intake' then jsonb_build_object('claim_limit',10,'skip_gate_first',true)
  else coalesce(notes,'{}'::jsonb)||jsonb_build_object('skip_gate_first',true)
end,
updated_at=now();
