
-- TGG EARS / HEARING + HANDS / TOOLS
create table if not exists public.tgg_one_ears_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('healthy','busy','warning','restricted')),
  messages_15m integer not null default 0,
  live_chat_15m integer not null default 0,
  autonomic_events_15m integer not null default 0,
  provider_updates_15m integer not null default 0,
  open_alerts integer not null default 0,
  critical_alerts integer not null default 0,
  listening jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);
create table if not exists public.tgg_one_hands_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('healthy','busy','warning','restricted')),
  ui_rpc_ready integer not null default 0,
  ui_rpc_total integer not null default 0,
  workspace_ready integer not null default 0,
  workspace_total integer not null default 0,
  destination_ready integer not null default 0,
  destination_total integer not null default 0,
  open_creator_actions integer not null default 0,
  external_contract_ready integer not null default 0,
  external_contract_total integer not null default 0,
  hands jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_ears_snapshots enable row level security;
alter table public.tgg_one_hands_snapshots enable row level security;
revoke all on public.tgg_one_ears_snapshots from anon,authenticated;
revoke all on public.tgg_one_hands_snapshots from anon,authenticated;



revoke all on function public.tgg_one_ears_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_ears_state() from public,anon,authenticated;
revoke all on function public.tgg_one_hands_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_hands_state() from public,anon,authenticated;
revoke all on function public.tgg_one_sensory_action_completeness() from public,anon,authenticated;

grant execute on function public.tgg_one_ears_refresh() to postgres;
grant execute on function public.tgg_one_ears_state() to postgres;
grant execute on function public.tgg_one_hands_refresh() to postgres;
grant execute on function public.tgg_one_hands_state() to postgres;
grant execute on function public.tgg_one_sensory_action_completeness() to postgres;
