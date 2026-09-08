
-- TGG EYES / VISION + MAP / GPS
create table if not exists public.tgg_one_vision_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('healthy','warning','restricted')),
  browser_failures integer not null default 0,
  visual_failures integer not null default 0,
  overlap_total integer not null default 0,
  clipped_text_total integer not null default 0,
  stuck_loading integer not null default 0,
  duplicate_shell integer not null default 0,
  accessibility_findings integer not null default 0,
  slow_routes integer not null default 0,
  vision jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

create table if not exists public.tgg_one_gps_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check(status in ('healthy','idle','warning','restricted')),
  active_routes integer not null default 0,
  enabled_world_locations integer not null default 0,
  unfinished_goals integer not null default 0,
  ready_steps integer not null default 0,
  blocked_steps integer not null default 0,
  next_goal_key text,
  next_step_key text,
  path jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_vision_snapshots enable row level security;
alter table public.tgg_one_gps_snapshots enable row level security;
revoke all on public.tgg_one_vision_snapshots from anon,authenticated;
revoke all on public.tgg_one_gps_snapshots from anon,authenticated;



revoke all on function public.tgg_one_vision_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_vision_state() from public,anon,authenticated;
revoke all on function public.tgg_one_gps_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_gps_state() from public,anon,authenticated;
revoke all on function public.tgg_one_navigation_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_vision_refresh() to postgres;
grant execute on function public.tgg_one_vision_state() to postgres;
grant execute on function public.tgg_one_gps_refresh() to postgres;
grant execute on function public.tgg_one_gps_state() to postgres;
grant execute on function public.tgg_one_navigation_completeness() to postgres;
