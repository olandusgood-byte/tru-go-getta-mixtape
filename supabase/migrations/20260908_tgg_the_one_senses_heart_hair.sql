
-- TGG THE ONE SENSES + HEART + HAIR expansion
create table if not exists public.tgg_one_senses_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','warning','restricted')),
  browser_failures integer not null default 0,
  browser_console_errors integer not null default 0,
  browser_network_errors integer not null default 0,
  slow_routes integer not null default 0,
  visual_failures integer not null default 0,
  visual_accessibility_findings integer not null default 0,
  visual_overlap_findings integer not null default 0,
  provider_degraded integer not null default 0,
  provider_blocked integer not null default 0,
  new_events integer not null default 0,
  signals jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

create table if not exists public.tgg_one_heart_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','waiting','warning','restricted')),
  open_creator_actions integer not null default 0,
  overdue_creator_actions integer not null default 0,
  active_brain_priorities integer not null default 0,
  top_focus jsonb not null default '[]'::jsonb,
  creator_needs jsonb not null default '[]'::jsonb,
  values_state jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

create table if not exists public.tgg_one_hair_snapshots (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('healthy','warning','restricted')),
  active_design_systems integer not null default 0,
  ready_design_specs integer not null default 0,
  blocked_design_specs integer not null default 0,
  latest_visual_failures integer not null default 0,
  latest_overlap_findings integer not null default 0,
  latest_clipped_text_findings integer not null default 0,
  stale_theme_jobs integer not null default 0,
  style_state jsonb not null default '{}'::jsonb,
  sensed_at timestamptz not null default now()
);

alter table public.tgg_one_senses_snapshots enable row level security;
alter table public.tgg_one_heart_snapshots enable row level security;
alter table public.tgg_one_hair_snapshots enable row level security;
revoke all on public.tgg_one_senses_snapshots from anon,authenticated;
revoke all on public.tgg_one_heart_snapshots from anon,authenticated;
revoke all on public.tgg_one_hair_snapshots from anon,authenticated;

update public.tgg_one_layers set layer_order=99 where layer_key='the_one';
insert into public.tgg_one_layers(
  layer_key,display_name,layer_order,purpose,responsibility,source_systems,
  can_execute,can_block,production_authority,high_risk_authority,canonical_authority
) values
('senses','SENSES',1,'Perception of reality and live system signals',
 jsonb_build_array('browser_signals','visual_signals','accessibility','performance','providers','events'),
 jsonb_build_array('tgg_browser_qa_results','tgg_visual_qa_results','tgg_provider_health_state','tgg_autonomic_events'),
 false,true,false,false,false),
('heart','HEART',5,'Value, creator needs, urgency and what matters most',
 jsonb_build_array('creator_needs','product_value','priority','urgency','experience_quality','focus'),
 jsonb_build_array('tgg_creator_action_queue','tgg_brain_priorities','tgg_one_heart_snapshots'),
 false,true,false,false,false),
('hair','HAIR',9,'Outer expression, visual identity, branding and presentation polish',
 jsonb_build_array('branding','themes','visual_polish','layout_consistency','design_qa','surface_expression'),
 jsonb_build_array('tgg_design_systems','tgg_design_specs','tgg_visual_qa_results','tgg_theme_deploy_jobs'),
 false,true,false,false,false)
on conflict(layer_key) do update
set display_name=excluded.display_name,purpose=excluded.purpose,responsibility=excluded.responsibility,
    source_systems=excluded.source_systems,can_execute=false,can_block=true,
    production_authority=false,high_risk_authority=false,canonical_authority=false,
    active=true,updated_at=now();

update public.tgg_one_layers set layer_order=2 where layer_key='shadow';
update public.tgg_one_layers set layer_order=3 where layer_key='head';
update public.tgg_one_layers set layer_order=4 where layer_key='mind';
update public.tgg_one_layers set layer_order=6 where layer_key='body';
update public.tgg_one_layers set layer_order=7 where layer_key='spirit';
update public.tgg_one_layers set layer_order=8 where layer_key='soul';
update public.tgg_one_layers set layer_order=10 where layer_key='the_one';



revoke all on function public.tgg_one_senses_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_senses_state() from public,anon,authenticated;
revoke all on function public.tgg_one_heart_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_heart_state() from public,anon,authenticated;
revoke all on function public.tgg_one_hair_refresh() from public,anon,authenticated;
revoke all on function public.tgg_one_hair_state() from public,anon,authenticated;
revoke all on function public.tgg_one_layer_state(text) from public,anon,authenticated;
revoke all on function public.tgg_one_state() from public,anon,authenticated;
revoke all on function public.tgg_one_cycle() from public,anon,authenticated;
revoke all on function public.tgg_autonomic_completeness() from public,anon,authenticated;
grant execute on function public.tgg_one_senses_refresh() to postgres;
grant execute on function public.tgg_one_senses_state() to postgres;
grant execute on function public.tgg_one_heart_refresh() to postgres;
grant execute on function public.tgg_one_heart_state() to postgres;
grant execute on function public.tgg_one_hair_refresh() to postgres;
grant execute on function public.tgg_one_hair_state() to postgres;
grant execute on function public.tgg_one_layer_state(text) to postgres;
grant execute on function public.tgg_one_state() to postgres;
grant execute on function public.tgg_one_cycle() to postgres;
grant execute on function public.tgg_autonomic_completeness() to postgres;
