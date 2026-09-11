-- TRU GO GETTA production migration history archive
-- Date bucket: 20260904
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260904010032 add_tgg_theme_autodeploy_queue
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create table if not exists public.tgg_theme_deploy_devices (
  id uuid primary key default gen_random_uuid(),
  device_name text not null,
  token_hash text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists public.tgg_theme_deploy_jobs (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  sha256 text not null,
  xml_text text not null,
  status text not null default 'queued' check (status in ('queued','claimed','deployed','failed','cancelled')),
  device_id uuid references public.tgg_theme_deploy_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  error text,
  result jsonb not null default '{}'::jsonb
);

create index if not exists tgg_theme_deploy_jobs_status_created_idx
  on public.tgg_theme_deploy_jobs(status, created_at);

alter table public.tgg_theme_deploy_devices enable row level security;
alter table public.tgg_theme_deploy_jobs enable row level security;

revoke all on table public.tgg_theme_deploy_devices from anon, authenticated;
revoke all on table public.tgg_theme_deploy_jobs from anon, authenticated;

grant all on table public.tgg_theme_deploy_devices to service_role;
grant all on table public.tgg_theme_deploy_jobs to service_role;

insert into public.tgg_theme_deploy_devices(device_name, token_hash)
select 'TGG Blogger Chrome Auto Deployer', '119e9d521482dae378ec287d3ab4db485d4ea163914b79af0f35666ff936f5c9'
where not exists (
  select 1 from public.tgg_theme_deploy_devices
  where token_hash='119e9d521482dae378ec287d3ab4db485d4ea163914b79af0f35666ff936f5c9'
);

commit;

-- ============================================================
-- MIGRATION 20260904010201 compress_tgg_theme_autodeploy_payloads
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;
alter table public.tgg_theme_deploy_jobs alter column xml_text drop not null;
alter table public.tgg_theme_deploy_jobs add column if not exists payload_text text;
alter table public.tgg_theme_deploy_jobs add column if not exists payload_encoding text not null default 'plain' check (payload_encoding in ('plain','gzip-base64'));
commit;

-- ============================================================
-- MIGRATION 20260904032901 v2390_release_workflow_status_backend
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.release_status_history (
  id uuid primary key default gen_random_uuid(),
  project_type text not null check (project_type in ('mixtape','video','merch')),
  project_id uuid not null,
  user_id uuid,
  old_status text,
  new_status text not null,
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);

alter table public.release_status_history enable row level security;

revoke all on table public.release_status_history from anon;
revoke insert, update, delete on table public.release_status_history from authenticated;
grant select on table public.release_status_history to authenticated;

create policy "release history creator read"
on public.release_status_history
for select
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists release_status_history_user_created_idx
  on public.release_status_history (user_id, created_at desc);
create index if not exists release_status_history_project_idx
  on public.release_status_history (project_type, project_id, created_at desc);

alter table public.site_videos
  drop constraint if exists site_videos_status_workflow_check;
alter table public.site_videos
  add constraint site_videos_status_workflow_check
  check (status is null or status in ('draft','pending','changes_requested','published','rejected')) not valid;
alter table public.site_videos validate constraint site_videos_status_workflow_check;

alter table public.merch_products
  drop constraint if exists merch_products_status_workflow_check;
alter table public.merch_products
  add constraint merch_products_status_workflow_check
  check (status is null or status in ('draft','pending','changes_requested','published','rejected')) not valid;
alter table public.merch_products validate constraint merch_products_status_workflow_check;

create or replace function private.tgg_record_release_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_type text;
  v_note text;
  v_user_id uuid;
begin
  if tg_table_name = 'mixtapes' then
    v_project_type := 'mixtape';
    v_note := new.admin_note;
    v_user_id := new.user_id;
  elsif tg_table_name = 'site_videos' then
    v_project_type := 'video';
    v_note := null;
    v_user_id := new.user_id;
  elsif tg_table_name = 'merch_products' then
    v_project_type := 'merch';
    v_note := new.admin_note;
    v_user_id := new.user_id;
  else
    raise exception 'unsupported release workflow table: %', tg_table_name;
  end if;

  if tg_op = 'INSERT' then
    insert into public.release_status_history(project_type, project_id, user_id, old_status, new_status, note, changed_by)
    values (v_project_type, new.id, v_user_id, null, coalesce(new.status::text, 'draft'), v_note, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.release_status_history(project_type, project_id, user_id, old_status, new_status, note, changed_by)
    values (v_project_type, new.id, v_user_id, old.status::text, coalesce(new.status::text, 'draft'), v_note, auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function private.tgg_record_release_status_change() from public, anon, authenticated;

drop trigger if exists tgg_mixtape_status_history on public.mixtapes;
create trigger tgg_mixtape_status_history
after insert or update of status on public.mixtapes
for each row execute function private.tgg_record_release_status_change();

drop trigger if exists tgg_video_status_history on public.site_videos;
create trigger tgg_video_status_history
after insert or update of status on public.site_videos
for each row execute function private.tgg_record_release_status_change();

drop trigger if exists tgg_merch_status_history on public.merch_products;
create trigger tgg_merch_status_history
after insert or update of status on public.merch_products
for each row execute function private.tgg_record_release_status_change();


-- ============================================================
-- MIGRATION 20260904033114 v2400_creator_analytics_performance_backend
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_release_performance
with (security_invoker = true)
as
select
  m.user_id,
  m.artist_id,
  m.id as mixtape_id,
  m.title,
  m.status::text as status,
  coalesce(m.play_count,0)::bigint as play_count,
  coalesce(m.download_count,0)::bigint as download_count,
  coalesce(t.track_count,0)::bigint as track_count,
  case when coalesce(m.play_count,0) > 0
       then round((coalesce(m.download_count,0)::numeric / m.play_count::numeric) * 100, 2)
       else 0::numeric end as download_rate_pct,
  m.featured,
  m.release_date,
  m.created_at
from public.mixtapes m
left join (
  select mixtape_id, count(*)::bigint as track_count
  from public.tracks
  group by mixtape_id
) t on t.mixtape_id = m.id;

revoke all on public.creator_release_performance from anon;
grant select on public.creator_release_performance to authenticated;

create or replace view public.creator_performance_summary
with (security_invoker = true)
as
with
m as (
  select user_id,
         count(*)::bigint as total_mixtapes,
         count(*) filter (where status::text='published')::bigint as published_mixtapes,
         count(*) filter (where status::text in ('pending','changes_requested'))::bigint as mixtapes_in_review,
         coalesce(sum(play_count),0)::bigint as total_plays,
         coalesce(sum(download_count),0)::bigint as total_downloads
  from public.mixtapes
  where user_id is not null
  group by user_id
),
t as (
  select user_id, count(*)::bigint as total_tracks
  from public.tracks
  where user_id is not null
  group by user_id
),
v as (
  select user_id,
         count(*)::bigint as total_videos,
         count(*) filter (where status='published' or published is true)::bigint as published_videos,
         count(*) filter (where status in ('pending','changes_requested'))::bigint as videos_in_review
  from public.site_videos
  where user_id is not null
  group by user_id
),
p as (
  select user_id,
         count(*)::bigint as total_merch,
         count(*) filter (where status='published')::bigint as published_merch,
         count(*) filter (where status in ('pending','changes_requested'))::bigint as merch_in_review
  from public.merch_products
  where user_id is not null
  group by user_id
)
select
  a.user_id,
  a.id as artist_id,
  a.stage_name,
  coalesce(m.total_mixtapes,0)::bigint as total_mixtapes,
  coalesce(m.published_mixtapes,0)::bigint as published_mixtapes,
  coalesce(t.total_tracks,0)::bigint as total_tracks,
  coalesce(m.total_plays,0)::bigint as total_plays,
  coalesce(m.total_downloads,0)::bigint as total_downloads,
  case when coalesce(m.total_plays,0) > 0
       then round((coalesce(m.total_downloads,0)::numeric / m.total_plays::numeric) * 100, 2)
       else 0::numeric end as overall_download_rate_pct,
  coalesce(v.total_videos,0)::bigint as total_videos,
  coalesce(v.published_videos,0)::bigint as published_videos,
  coalesce(p.total_merch,0)::bigint as total_merch,
  coalesce(p.published_merch,0)::bigint as published_merch,
  (coalesce(m.mixtapes_in_review,0)+coalesce(v.videos_in_review,0)+coalesce(p.merch_in_review,0))::bigint as items_in_review
from public.artists a
left join m on m.user_id = a.user_id
left join t on t.user_id = a.user_id
left join v on v.user_id = a.user_id
left join p on p.user_id = a.user_id
where a.user_id is not null;

revoke all on public.creator_performance_summary from anon;
grant select on public.creator_performance_summary to authenticated;


-- ============================================================
-- MIGRATION 20260904033216 v2410_creator_analytics_event_tracking
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_record_creator_event(
  p_event_type text,
  p_mixtape_id uuid default null,
  p_session_id text default null,
  p_source text default 'web',
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_creator_id uuid;
  v_event_id uuid;
  v_type text := lower(trim(coalesce(p_event_type,'')));
begin
  if v_type not in ('play','download','release_view','track_play','video_view','merch_view','share') then
    raise exception 'unsupported analytics event type';
  end if;

  if p_mixtape_id is not null then
    select m.artist_id into v_creator_id
    from public.mixtapes m
    where m.id = p_mixtape_id;
  end if;

  if v_creator_id is null then
    select cm.creator_id into v_creator_id
    from public.v54_creator_members cm
    where cm.user_id = (select auth.uid())
    order by cm.created_at asc
    limit 1;
  end if;

  if v_creator_id is null then
    raise exception 'creator could not be resolved';
  end if;

  insert into public.creator_analytics_events
    (creator_id, mixtape_id, event_type, session_id, source, metadata, occurred_at)
  values
    (v_creator_id, p_mixtape_id, v_type, nullif(left(trim(coalesce(p_session_id,'')),128),''), nullif(left(trim(coalesce(p_source,'web')),64),''), coalesce(p_metadata,'{}'::jsonb), now())
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.tgg_record_creator_event(text,uuid,text,text,jsonb) from public, anon;
grant execute on function public.tgg_record_creator_event(text,uuid,text,text,jsonb) to authenticated;

create or replace view public.creator_event_daily
with (security_invoker=true)
as
select
  e.creator_id,
  date_trunc('day', e.occurred_at)::date as event_date,
  count(*) as total_events,
  count(*) filter (where e.event_type='play') as plays,
  count(*) filter (where e.event_type='download') as downloads,
  count(*) filter (where e.event_type='release_view') as release_views,
  count(*) filter (where e.event_type='track_play') as track_plays,
  count(*) filter (where e.event_type='video_view') as video_views,
  count(*) filter (where e.event_type='merch_view') as merch_views,
  count(*) filter (where e.event_type='share') as shares
from public.creator_analytics_events e
group by e.creator_id, date_trunc('day', e.occurred_at)::date;

revoke all on public.creator_event_daily from public, anon;
grant select on public.creator_event_daily to authenticated;

create or replace view public.creator_release_event_summary
with (security_invoker=true)
as
select
  e.creator_id,
  e.mixtape_id,
  count(*) as total_events,
  count(*) filter (where e.event_type='play') as plays,
  count(*) filter (where e.event_type='download') as downloads,
  count(*) filter (where e.event_type='release_view') as release_views,
  count(*) filter (where e.event_type='track_play') as track_plays,
  count(*) filter (where e.event_type='share') as shares,
  min(e.occurred_at) as first_event_at,
  max(e.occurred_at) as last_event_at
from public.creator_analytics_events e
where e.mixtape_id is not null
group by e.creator_id,e.mixtape_id;

revoke all on public.creator_release_event_summary from public, anon;
grant select on public.creator_release_event_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904033337 v2420_public_analytics_event_ingestion
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.creator_analytics_events add column if not exists visitor_hash text;

create index if not exists creator_analytics_events_mixtape_occurred_idx on public.creator_analytics_events(mixtape_id,occurred_at desc);
create index if not exists creator_analytics_events_type_occurred_idx on public.creator_analytics_events(event_type,occurred_at desc);

create or replace function private.tgg_record_public_mixtape_event(
  p_event_type text,
  p_mixtape_id uuid,
  p_session_id text default null,
  p_source text default 'blogger',
  p_metadata jsonb default '{}'::jsonb,
  p_visitor_hash text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 v_creator_id uuid;
 v_event_id uuid;
 v_type text:=lower(trim(coalesce(p_event_type,'')));
begin
 if v_type not in ('play','download','release_view','track_play','share') then raise exception 'unsupported event type'; end if;
 select m.artist_id into v_creator_id from public.mixtapes m where m.id=p_mixtape_id and m.status='published' limit 1;
 if v_creator_id is null then raise exception 'published release not found'; end if;
 insert into public.creator_analytics_events(creator_id,mixtape_id,event_type,session_id,source,metadata,visitor_hash,occurred_at)
 values(v_creator_id,p_mixtape_id,v_type,nullif(left(trim(coalesce(p_session_id,'')),128),''),nullif(left(trim(coalesce(p_source,'blogger')),64),''),coalesce(p_metadata,'{}'::jsonb),nullif(left(trim(coalesce(p_visitor_hash,'')),128),''),now()) returning id into v_event_id;
 return v_event_id;
end;
$$;
revoke all on function private.tgg_record_public_mixtape_event(text,uuid,text,text,jsonb,text) from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260904033431 v2430_creator_growth_insights
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_growth_insights
with (security_invoker=true)
as
with daily as (
 select e.creator_id,
        count(*) filter (where e.occurred_at >= now()-interval '7 days') as events_7d,
        count(*) filter (where e.occurred_at >= now()-interval '30 days') as events_30d,
        count(*) filter (where e.event_type in ('play','track_play') and e.occurred_at >= now()-interval '30 days') as plays_30d,
        count(*) filter (where e.event_type='download' and e.occurred_at >= now()-interval '30 days') as downloads_30d,
        count(*) filter (where e.event_type='release_view' and e.occurred_at >= now()-interval '30 days') as release_views_30d,
        count(*) filter (where e.event_type='share' and e.occurred_at >= now()-interval '30 days') as shares_30d,
        count(distinct e.visitor_hash) filter (where e.visitor_hash is not null and e.occurred_at >= now()-interval '30 days') as unique_visitors_30d
 from public.creator_analytics_events e group by e.creator_id
), releases as (
 select m.artist_id as creator_id,
        count(*) filter(where m.status='published') as published_releases,
        coalesce(sum(m.play_count),0)::bigint as lifetime_plays,
        coalesce(sum(m.download_count),0)::bigint as lifetime_downloads
 from public.mixtapes m group by m.artist_id
), ranked as (
 select e.creator_id,e.mixtape_id,count(*) as engagement_events,
        row_number() over(partition by e.creator_id order by count(*) desc,max(e.occurred_at) desc) as rn
 from public.creator_analytics_events e
 where e.mixtape_id is not null and e.occurred_at>=now()-interval '30 days'
 group by e.creator_id,e.mixtape_id
)
select a.id as creator_id,a.stage_name,
 coalesce(d.events_7d,0)::bigint as events_7d,
 coalesce(d.events_30d,0)::bigint as events_30d,
 coalesce(d.plays_30d,0)::bigint as plays_30d,
 coalesce(d.downloads_30d,0)::bigint as downloads_30d,
 coalesce(d.release_views_30d,0)::bigint as release_views_30d,
 coalesce(d.shares_30d,0)::bigint as shares_30d,
 coalesce(d.unique_visitors_30d,0)::bigint as unique_visitors_30d,
 coalesce(r.published_releases,0)::bigint as published_releases,
 coalesce(r.lifetime_plays,0)::bigint as lifetime_plays,
 coalesce(r.lifetime_downloads,0)::bigint as lifetime_downloads,
 rr.mixtape_id as top_release_30d_id,
 m.title as top_release_30d_title,
 coalesce(rr.engagement_events,0)::bigint as top_release_30d_events
from public.artists a
left join daily d on d.creator_id=a.id
left join releases r on r.creator_id=a.id
left join ranked rr on rr.creator_id=a.id and rr.rn=1
left join public.mixtapes m on m.id=rr.mixtape_id;

revoke all on public.creator_growth_insights from public,anon;
grant select on public.creator_growth_insights to authenticated;

create or replace view public.creator_analytics_30d_daily
with (security_invoker=true)
as
select e.creator_id,date_trunc('day',e.occurred_at)::date as event_date,
 count(*) filter(where e.event_type in ('play','track_play'))::bigint as plays,
 count(*) filter(where e.event_type='download')::bigint as downloads,
 count(*) filter(where e.event_type='release_view')::bigint as release_views,
 count(*) filter(where e.event_type='share')::bigint as shares,
 count(distinct e.visitor_hash) filter(where e.visitor_hash is not null)::bigint as unique_visitors
from public.creator_analytics_events e
where e.occurred_at>=now()-interval '30 days'
group by e.creator_id,date_trunc('day',e.occurred_at)::date;
revoke all on public.creator_analytics_30d_daily from public,anon;
grant select on public.creator_analytics_30d_daily to authenticated;

-- ============================================================
-- MIGRATION 20260904033517 v2440_creator_action_center
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_action_center
with (security_invoker=true)
as
select a.id as creator_id,a.stage_name,
  case
   when nullif(trim(coalesce(a.stage_name,'')),'') is null then 'complete_profile'
   when not exists(select 1 from public.mixtapes m where m.artist_id=a.id) then 'create_first_release'
   when exists(select 1 from public.mixtapes m where m.artist_id=a.id and m.status='changes_requested') then 'fix_release_changes'
   when exists(select 1 from public.mixtapes m where m.artist_id=a.id and m.status='draft') then 'finish_draft_release'
   when not exists(select 1 from public.mixtapes m where m.artist_id=a.id and m.status='published') then 'submit_release'
   when coalesce(g.events_30d,0)=0 then 'promote_release'
   when coalesce(g.shares_30d,0)=0 then 'encourage_shares'
   else 'keep_growing'
  end as next_action,
  case
   when nullif(trim(coalesce(a.stage_name,'')),'') is null then 'Complete your artist profile'
   when not exists(select 1 from public.mixtapes m where m.artist_id=a.id) then 'Create your first mixtape'
   when exists(select 1 from public.mixtapes m where m.artist_id=a.id and m.status='changes_requested') then 'Review requested changes'
   when exists(select 1 from public.mixtapes m where m.artist_id=a.id and m.status='draft') then 'Finish your draft release'
   when not exists(select 1 from public.mixtapes m where m.artist_id=a.id and m.status='published') then 'Submit a release for review'
   when coalesce(g.events_30d,0)=0 then 'Promote your published release'
   when coalesce(g.shares_30d,0)=0 then 'Drive more shares'
   else 'Keep building momentum'
  end as next_action_title,
  coalesce(g.events_7d,0)::bigint as events_7d,
  coalesce(g.events_30d,0)::bigint as events_30d,
  coalesce(g.plays_30d,0)::bigint as plays_30d,
  coalesce(g.downloads_30d,0)::bigint as downloads_30d,
  coalesce(g.shares_30d,0)::bigint as shares_30d,
  g.top_release_30d_id,g.top_release_30d_title,
  (select count(*) from public.mixtapes m where m.artist_id=a.id and m.status='draft')::bigint as draft_releases,
  (select count(*) from public.mixtapes m where m.artist_id=a.id and m.status='pending')::bigint as pending_releases,
  (select count(*) from public.mixtapes m where m.artist_id=a.id and m.status='changes_requested')::bigint as changes_requested_releases
from public.artists a
left join public.creator_growth_insights g on g.creator_id=a.id;
revoke all on public.creator_action_center from public,anon;
grant select on public.creator_action_center to authenticated;

create or replace view public.creator_recent_release_activity
with (security_invoker=true)
as
select h.user_id,h.project_type,h.project_id,h.old_status,h.new_status,h.note,h.created_at
from public.release_status_history h
where h.created_at>=now()-interval '90 days';
revoke all on public.creator_recent_release_activity from public,anon;
grant select on public.creator_recent_release_activity to authenticated;

-- ============================================================
-- MIGRATION 20260904033615 v2450_creator_communications_summary
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_communications_summary
with (security_invoker=true)
as
select cm.user_id,
 count(distinct cm.conversation_id)::bigint as conversations,
 count(distinct cm.conversation_id) filter (where c.status='active')::bigint as active_conversations,
 count(distinct r.id) filter (where r.recipient_id=cm.user_id and r.status='pending')::bigint as incoming_collab_requests,
 count(distinct r.id) filter (where r.sender_id=cm.user_id and r.status='pending')::bigint as outgoing_collab_requests,
 count(distinct m.id) filter (where m.sender_id<>cm.user_id and m.created_at>coalesce(cm.last_read_at,'epoch'::timestamptz))::bigint as unread_messages,
 max(c.last_message_at) as latest_message_at
from public.tgg_conversation_members cm
join public.tgg_conversations c on c.id=cm.conversation_id
left join public.tgg_collaboration_requests r on r.conversation_id=cm.conversation_id and (r.sender_id=cm.user_id or r.recipient_id=cm.user_id)
left join public.tgg_messages m on m.conversation_id=cm.conversation_id
group by cm.user_id;
revoke all on public.creator_communications_summary from public,anon;
grant select on public.creator_communications_summary to authenticated;

create or replace view public.creator_inbox_priority
with (security_invoker=true)
as
select cm.user_id,c.id as conversation_id,c.title,c.project_type,c.status,c.last_message_at,cm.last_read_at,
 count(m.id) filter(where m.sender_id<>cm.user_id and m.created_at>coalesce(cm.last_read_at,'epoch'::timestamptz))::bigint as unread_messages,
 exists(select 1 from public.tgg_collaboration_requests r where r.conversation_id=c.id and r.recipient_id=cm.user_id and r.status='pending') as has_pending_request
from public.tgg_conversation_members cm
join public.tgg_conversations c on c.id=cm.conversation_id
left join public.tgg_messages m on m.conversation_id=c.id
group by cm.user_id,c.id,c.title,c.project_type,c.status,c.last_message_at,cm.last_read_at;
revoke all on public.creator_inbox_priority from public,anon;
grant select on public.creator_inbox_priority to authenticated;

-- ============================================================
-- MIGRATION 20260904033706 v2460_creator_catalog_health
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_catalog_health
with (security_invoker=true)
as
select a.id as creator_id,a.user_id,
 count(distinct m.id)::bigint as mixtapes,
 count(distinct m.id) filter(where m.status='published')::bigint as published_mixtapes,
 count(distinct v.id)::bigint as videos,
 count(distinct v.id) filter(where v.status='published' or v.published=true)::bigint as published_videos,
 count(distinct mp.id)::bigint as merch_products,
 count(distinct mp.id) filter(where mp.status='published')::bigint as published_merch,
 count(distinct mp.id) filter(where mp.inventory<=0)::bigint as out_of_stock_merch,
 count(distinct mp.id) filter(where mp.inventory between 1 and 5)::bigint as low_stock_merch,
 count(distinct i.id)::bigint as interviews,
 count(distinct i.id) filter(where i.published=true or i.status='published')::bigint as published_interviews,
 count(distinct m.id) filter(where m.status='changes_requested')::bigint as mixtapes_needing_changes,
 count(distinct v.id) filter(where v.status='changes_requested')::bigint as videos_needing_changes,
 count(distinct mp.id) filter(where mp.status='changes_requested')::bigint as merch_needing_changes
from public.artists a
left join public.mixtapes m on m.artist_id=a.id
left join public.site_videos v on v.user_id=a.user_id
left join public.merch_products mp on mp.user_id=a.user_id
left join public.artist_interviews i on i.user_id=a.user_id
group by a.id,a.user_id;
revoke all on public.creator_catalog_health from public,anon;
grant select on public.creator_catalog_health to authenticated;

create or replace view public.creator_merch_inventory_alerts
with (security_invoker=true)
as
select mp.user_id,mp.creator_id,mp.id as product_id,mp.title,mp.sku,mp.inventory,mp.status,
 case when mp.inventory<=0 then 'out_of_stock' when mp.inventory<=5 then 'low_stock' else 'ok' end as inventory_state,
 mp.updated_at
from public.merch_products mp
where mp.inventory<=5;
revoke all on public.creator_merch_inventory_alerts from public,anon;
grant select on public.creator_merch_inventory_alerts to authenticated;

-- ============================================================
-- MIGRATION 20260904033754 v2470_creator_command_center
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_command_center
with (security_invoker=true)
as
select a.id as creator_id,a.user_id,a.stage_name,
 ac.next_action,ac.next_action_title,
 coalesce(ac.draft_releases,0)::bigint as draft_releases,
 coalesce(ac.pending_releases,0)::bigint as pending_releases,
 coalesce(ac.changes_requested_releases,0)::bigint as changes_requested_releases,
 coalesce(g.events_7d,0)::bigint as events_7d,
 coalesce(g.events_30d,0)::bigint as events_30d,
 coalesce(g.plays_30d,0)::bigint as plays_30d,
 coalesce(g.downloads_30d,0)::bigint as downloads_30d,
 coalesce(g.unique_visitors_30d,0)::bigint as unique_visitors_30d,
 g.top_release_30d_id,g.top_release_30d_title,
 coalesce(ch.published_mixtapes,0)::bigint as published_mixtapes,
 coalesce(ch.published_videos,0)::bigint as published_videos,
 coalesce(ch.published_merch,0)::bigint as published_merch,
 coalesce(ch.low_stock_merch,0)::bigint as low_stock_merch,
 coalesce(ch.out_of_stock_merch,0)::bigint as out_of_stock_merch,
 coalesce(cs.unread_messages,0)::bigint as unread_messages,
 coalesce(cs.incoming_collab_requests,0)::bigint as incoming_collab_requests,
 cs.latest_message_at,
 (coalesce(ac.changes_requested_releases,0)+coalesce(ch.videos_needing_changes,0)+coalesce(ch.merch_needing_changes,0))::bigint as total_items_needing_changes,
 (coalesce(cs.unread_messages,0)+coalesce(cs.incoming_collab_requests,0)+coalesce(ch.low_stock_merch,0)+coalesce(ch.out_of_stock_merch,0)+coalesce(ac.changes_requested_releases,0)+coalesce(ch.videos_needing_changes,0)+coalesce(ch.merch_needing_changes,0))::bigint as attention_count
from public.artists a
left join public.creator_action_center ac on ac.creator_id=a.id
left join public.creator_growth_insights g on g.creator_id=a.id
left join public.creator_catalog_health ch on ch.creator_id=a.id
left join public.creator_communications_summary cs on cs.user_id=a.user_id;
revoke all on public.creator_command_center from public,anon;
grant select on public.creator_command_center to authenticated;

-- ============================================================
-- MIGRATION 20260904033843 v2480_backend_hardening_cleanup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create index if not exists tgg_theme_deploy_jobs_device_id_idx on public.tgg_theme_deploy_jobs(device_id);
drop index if exists public.creator_analytics_events_type_occurred_idx;
drop index if exists public.creator_analytics_events_mixtape_occurred_idx;
revoke all on table public.tgg_theme_deploy_devices from anon, authenticated;
revoke all on table public.tgg_theme_deploy_jobs from anon, authenticated;
revoke all on table public.v98_blogger_connect_links from anon, authenticated;

-- ============================================================
-- MIGRATION 20260904034008 v2490_creator_analytics_trend_views
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_analytics_daily
with (security_invoker = true)
as
select
  m.user_id,
  e.creator_id,
  e.mixtape_id,
  e.event_type,
  (e.occurred_at at time zone 'UTC')::date as event_date,
  count(*)::bigint as event_count,
  count(distinct nullif(e.session_id,''))::bigint as unique_sessions
from public.creator_analytics_events e
join public.mixtapes m on m.id=e.mixtape_id
where m.user_id=auth.uid()
group by m.user_id,e.creator_id,e.mixtape_id,e.event_type,(e.occurred_at at time zone 'UTC')::date;

revoke all on public.creator_analytics_daily from public, anon;
grant select on public.creator_analytics_daily to authenticated;

create or replace view public.creator_analytics_event_summary
with (security_invoker = true)
as
select
  m.user_id,
  e.creator_id,
  e.event_type,
  count(*)::bigint as total_events,
  count(*) filter (where e.occurred_at >= now()-interval '7 days')::bigint as events_7d,
  count(*) filter (where e.occurred_at >= now()-interval '30 days')::bigint as events_30d,
  count(distinct nullif(e.session_id,''))::bigint as unique_sessions
from public.creator_analytics_events e
join public.mixtapes m on m.id=e.mixtape_id
where m.user_id=auth.uid()
group by m.user_id,e.creator_id,e.event_type;

revoke all on public.creator_analytics_event_summary from public, anon;
grant select on public.creator_analytics_event_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904034108 v2500_public_analytics_integrity
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create index if not exists creator_analytics_events_dedupe_idx on public.creator_analytics_events (mixtape_id,event_type,visitor_hash,occurred_at desc) where visitor_hash is not null;

create or replace function private.tgg_record_public_mixtape_event(
 p_event_type text,
 p_mixtape_id uuid,
 p_session_id text default null,
 p_source text default 'blogger',
 p_metadata jsonb default '{}'::jsonb,
 p_visitor_hash text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 v_creator uuid;
 v_id uuid;
 v_window interval;
 v_meta jsonb;
begin
 if p_event_type not in ('play','download','release_view','track_play','share') then
   raise exception 'unsupported event';
 end if;
 select m.artist_id into v_creator from public.mixtapes m where m.id=p_mixtape_id and m.status='published' limit 1;
 if v_creator is null then raise exception 'release unavailable'; end if;
 v_meta=case when p_metadata is null or jsonb_typeof(p_metadata)<>'object' then '{}'::jsonb else p_metadata end;
 if pg_column_size(v_meta)>4096 then raise exception 'metadata too large'; end if;
 v_window=case p_event_type when 'release_view' then interval '10 minutes' when 'play' then interval '30 seconds' when 'track_play' then interval '30 seconds' when 'download' then interval '5 minutes' when 'share' then interval '2 minutes' else interval '1 minute' end;
 if p_visitor_hash is not null and exists(
   select 1 from public.creator_analytics_events e
   where e.mixtape_id=p_mixtape_id and e.event_type=p_event_type and e.visitor_hash=p_visitor_hash and e.occurred_at>now()-v_window
 ) then return null; end if;
 insert into public.creator_analytics_events(creator_id,mixtape_id,event_type,session_id,source,metadata,occurred_at,visitor_hash)
 values(v_creator,p_mixtape_id,p_event_type,left(nullif(p_session_id,''),128),left(coalesce(nullif(p_source,''),'blogger'),64),v_meta,now(),p_visitor_hash)
 returning id into v_id;
 return v_id;
end;$$;
revoke all on function private.tgg_record_public_mixtape_event(text,uuid,text,text,jsonb,text) from public,anon,authenticated;


-- ============================================================
-- MIGRATION 20260904034207 v2510_release_saves_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.release_saves (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(user_id,mixtape_id)
);
create index if not exists release_saves_mixtape_id_idx on public.release_saves(mixtape_id);
create index if not exists release_saves_user_created_idx on public.release_saves(user_id,created_at desc);
alter table public.release_saves enable row level security;
revoke all on public.release_saves from anon;
grant select,insert,delete on public.release_saves to authenticated;
drop policy if exists release_saves_select_own on public.release_saves;
create policy release_saves_select_own on public.release_saves for select to authenticated using (user_id=auth.uid());
drop policy if exists release_saves_insert_own on public.release_saves;
create policy release_saves_insert_own on public.release_saves for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.mixtapes m where m.id=mixtape_id and m.status='published'));
drop policy if exists release_saves_delete_own on public.release_saves;
create policy release_saves_delete_own on public.release_saves for delete to authenticated using (user_id=auth.uid());

create or replace view public.creator_release_save_summary
with (security_invoker=true)
as
select m.user_id,m.artist_id,m.id as mixtape_id,m.title,count(s.id)::bigint as saves,max(s.created_at) as latest_save_at
from public.mixtapes m left join public.release_saves s on s.mixtape_id=m.id
where m.user_id=auth.uid()
group by m.user_id,m.artist_id,m.id,m.title;
revoke all on public.creator_release_save_summary from public,anon;
grant select on public.creator_release_save_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904034303 v2520_artist_follows_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.artist_follows (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 artist_id uuid not null references public.artists(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(user_id,artist_id)
);
create index if not exists artist_follows_artist_id_idx on public.artist_follows(artist_id);
create index if not exists artist_follows_user_created_idx on public.artist_follows(user_id,created_at desc);
alter table public.artist_follows enable row level security;
revoke all on public.artist_follows from anon;
grant select,insert,delete on public.artist_follows to authenticated;
drop policy if exists artist_follows_select_own on public.artist_follows;
create policy artist_follows_select_own on public.artist_follows for select to authenticated using(user_id=auth.uid());
drop policy if exists artist_follows_insert_own on public.artist_follows;
create policy artist_follows_insert_own on public.artist_follows for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.artists a where a.id=artist_id));
drop policy if exists artist_follows_delete_own on public.artist_follows;
create policy artist_follows_delete_own on public.artist_follows for delete to authenticated using(user_id=auth.uid());

create or replace view public.creator_follower_summary
with (security_invoker=true)
as
select a.user_id,a.id as artist_id,a.stage_name,count(f.id)::bigint as followers,max(f.created_at) as latest_follow_at
from public.artists a left join public.artist_follows f on f.artist_id=a.id
where a.user_id=auth.uid()
group by a.user_id,a.id,a.stage_name;
revoke all on public.creator_follower_summary from public,anon;
grant select on public.creator_follower_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904034343 v2530_fan_following_feed
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_following_feed
with (security_invoker=true)
as
select af.user_id as fan_user_id,m.id as mixtape_id,m.artist_id,a.stage_name,m.title,m.genre,m.description,m.cover_url,m.slug,m.release_date,m.created_at,m.play_count,m.download_count,
 exists(select 1 from public.release_saves rs where rs.user_id=af.user_id and rs.mixtape_id=m.id) as saved
from public.artist_follows af
join public.artists a on a.id=af.artist_id
join public.mixtapes m on m.artist_id=af.artist_id and m.status='published'
where af.user_id=auth.uid();
revoke all on public.fan_following_feed from public,anon;
grant select on public.fan_following_feed to authenticated;

create or replace view public.fan_library
with (security_invoker=true)
as
select rs.user_id as fan_user_id,rs.created_at as saved_at,m.id as mixtape_id,m.artist_id,a.stage_name,m.title,m.genre,m.cover_url,m.slug,m.release_date,m.play_count,m.download_count
from public.release_saves rs
join public.mixtapes m on m.id=rs.mixtape_id and m.status='published'
join public.artists a on a.id=m.artist_id
where rs.user_id=auth.uid();
revoke all on public.fan_library from public,anon;
grant select on public.fan_library to authenticated;

-- ============================================================
-- MIGRATION 20260904034440 v2540_notification_center_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
revoke all on public.notifications from authenticated;
grant select,update on public.notifications to authenticated;
drop policy if exists "Users can view own notifications" on public.notifications;
drop policy if exists "Users can update own notifications" on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using(recipient_id=auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id,created_at desc);
create index if not exists notifications_recipient_unread_idx on public.notifications(recipient_id,created_at desc) where read_at is null;

create or replace view public.user_notification_summary
with (security_invoker=true)
as
select recipient_id as user_id,count(*)::bigint as total_notifications,count(*) filter(where read_at is null)::bigint as unread_notifications,max(created_at) as latest_notification_at
from public.notifications
where recipient_id=auth.uid()
group by recipient_id;
revoke all on public.user_notification_summary from public,anon;
grant select on public.user_notification_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904034525 v2550_release_reactions_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.release_reactions(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
 reaction text not null default 'like' check(reaction in ('like','fire')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,mixtape_id)
);
create index if not exists release_reactions_mixtape_idx on public.release_reactions(mixtape_id);
create index if not exists release_reactions_user_idx on public.release_reactions(user_id,created_at desc);
alter table public.release_reactions enable row level security;
revoke all on public.release_reactions from anon;
grant select,insert,update,delete on public.release_reactions to authenticated;
create policy release_reactions_select_own on public.release_reactions for select to authenticated using(user_id=auth.uid());
create policy release_reactions_insert_own on public.release_reactions for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.mixtapes m where m.id=mixtape_id and m.status='published'));
create policy release_reactions_update_own on public.release_reactions for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and reaction in ('like','fire'));
create policy release_reactions_delete_own on public.release_reactions for delete to authenticated using(user_id=auth.uid());

create or replace view public.creator_release_reaction_summary
with (security_invoker=true)
as
select m.user_id,m.artist_id,m.id as mixtape_id,m.title,count(r.id)::bigint as reactions,count(r.id) filter(where r.reaction='like')::bigint as likes,count(r.id) filter(where r.reaction='fire')::bigint as fires,max(r.created_at) as latest_reaction_at
from public.mixtapes m left join public.release_reactions r on r.mixtape_id=m.id
where m.user_id=auth.uid()
group by m.user_id,m.artist_id,m.id,m.title;
revoke all on public.creator_release_reaction_summary from public,anon;
grant select on public.creator_release_reaction_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904034616 v2560_release_comments_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.release_comments(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists release_comments_mixtape_created_idx on public.release_comments(mixtape_id,created_at desc);
create index if not exists release_comments_user_created_idx on public.release_comments(user_id,created_at desc);
alter table public.release_comments enable row level security;
revoke all on public.release_comments from anon;
grant select,insert,update,delete on public.release_comments to authenticated;
create policy release_comments_select_authenticated on public.release_comments for select to authenticated using(exists(select 1 from public.mixtapes m where m.id=mixtape_id and m.status='published'));
create policy release_comments_insert_own on public.release_comments for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.mixtapes m where m.id=mixtape_id and m.status='published'));
create policy release_comments_update_own on public.release_comments for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and char_length(btrim(body)) between 1 and 1000);
create policy release_comments_delete_own on public.release_comments for delete to authenticated using(user_id=auth.uid());

create or replace view public.creator_release_comment_summary
with (security_invoker=true)
as
select m.user_id,m.artist_id,m.id as mixtape_id,m.title,count(c.id)::bigint as comments,max(c.created_at) as latest_comment_at
from public.mixtapes m left join public.release_comments c on c.mixtape_id=m.id
where m.user_id=auth.uid()
group by m.user_id,m.artist_id,m.id,m.title;
revoke all on public.creator_release_comment_summary from public,anon;
grant select on public.creator_release_comment_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904034704 v2570_release_comment_moderation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.release_comment_reports(
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id) on delete cascade,
 comment_id uuid not null references public.release_comments(id) on delete cascade,
 reason text not null check(reason in ('spam','harassment','hate','sexual','violence','misinformation','other')),
 details text check(details is null or char_length(details)<=1000),
 status text not null default 'pending' check(status in ('pending','reviewed','dismissed','actioned')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 unique(reporter_id,comment_id)
);
create index if not exists release_comment_reports_comment_idx on public.release_comment_reports(comment_id);
create index if not exists release_comment_reports_status_created_idx on public.release_comment_reports(status,created_at desc);
alter table public.release_comment_reports enable row level security;
revoke all on public.release_comment_reports from anon;
grant select,insert on public.release_comment_reports to authenticated;
create policy release_comment_reports_select_own on public.release_comment_reports for select to authenticated using(reporter_id=auth.uid());
create policy release_comment_reports_insert_own on public.release_comment_reports for insert to authenticated with check(reporter_id=auth.uid() and exists(select 1 from public.release_comments c join public.mixtapes m on m.id=c.mixtape_id where c.id=comment_id and m.status='published'));

create or replace view public.creator_comment_moderation_summary
with (security_invoker=true)
as
select m.user_id,m.artist_id,m.id as mixtape_id,m.title,count(distinct c.id)::bigint as comments,count(r.id) filter(where r.status='pending')::bigint as pending_reports,count(r.id) filter(where r.status='actioned')::bigint as actioned_reports,max(r.created_at) as latest_report_at
from public.mixtapes m left join public.release_comments c on c.mixtape_id=m.id left join public.release_comment_reports r on r.comment_id=c.id
where m.user_id=auth.uid()
group by m.user_id,m.artist_id,m.id,m.title;
revoke all on public.creator_comment_moderation_summary from public,anon;
grant select on public.creator_comment_moderation_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904034758 v2580_creator_comment_moderation_actions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.release_comments add column if not exists hidden_by_creator boolean not null default false, add column if not exists hidden_at timestamptz;

create or replace function public.tgg_creator_set_comment_visibility(p_comment_id uuid,p_hidden boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.release_comments c set hidden_by_creator=p_hidden, hidden_at=case when p_hidden then now() else null end, updated_at=now()
 where c.id=p_comment_id and exists(select 1 from public.mixtapes m where m.id=c.mixtape_id and m.user_id=auth.uid());
 return found;
end;$$;
revoke all on function public.tgg_creator_set_comment_visibility(uuid,boolean) from public,anon;
grant execute on function public.tgg_creator_set_comment_visibility(uuid,boolean) to authenticated;

create or replace view public.creator_comment_moderation_queue with (security_invoker=true) as
select m.user_id,m.artist_id,m.id as mixtape_id,m.title as mixtape_title,c.id as comment_id,c.user_id as commenter_id,c.body,c.created_at,c.hidden_by_creator,c.hidden_at,count(r.id) filter(where r.status='pending')::bigint as pending_reports,max(r.created_at) as latest_report_at
from public.mixtapes m join public.release_comments c on c.mixtape_id=m.id left join public.release_comment_reports r on r.comment_id=c.id
where m.user_id=auth.uid()
group by m.user_id,m.artist_id,m.id,m.title,c.id,c.user_id,c.body,c.created_at,c.hidden_by_creator,c.hidden_at
having count(r.id) filter(where r.status='pending')>0 or c.hidden_by_creator=true;
revoke all on public.creator_comment_moderation_queue from public,anon;
grant select on public.creator_comment_moderation_queue to authenticated;

-- ============================================================
-- MIGRATION 20260904034839 v2590_release_community_engagement_summary
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_release_community_summary
with (security_invoker=true)
as
select m.user_id,m.artist_id,m.id as mixtape_id,m.title,m.status,
 coalesce(s.saves,0)::bigint as saves,
 coalesce(r.reactions,0)::bigint as reactions,
 coalesce(r.likes,0)::bigint as likes,
 coalesce(r.fires,0)::bigint as fires,
 coalesce(c.comments,0)::bigint as comments,
 coalesce(rep.pending_reports,0)::bigint as pending_comment_reports,
 coalesce(s.saves,0)+coalesce(r.reactions,0)+coalesce(c.comments,0) as total_community_actions
from public.mixtapes m
left join (select mixtape_id,count(*)::bigint saves from public.release_saves group by mixtape_id) s on s.mixtape_id=m.id
left join (select mixtape_id,count(*)::bigint reactions,count(*) filter(where reaction='like')::bigint likes,count(*) filter(where reaction='fire')::bigint fires from public.release_reactions group by mixtape_id) r on r.mixtape_id=m.id
left join (select mixtape_id,count(*) filter(where hidden_by_creator=false)::bigint comments from public.release_comments group by mixtape_id) c on c.mixtape_id=m.id
left join (select c.mixtape_id,count(*) filter(where cr.status='pending')::bigint pending_reports from public.release_comments c join public.release_comment_reports cr on cr.comment_id=c.id group by c.mixtape_id) rep on rep.mixtape_id=m.id
where m.user_id=auth.uid();
revoke all on public.creator_release_community_summary from public,anon;
grant select on public.creator_release_community_summary to authenticated;

create or replace view public.creator_audience_summary
with (security_invoker=true)
as
select a.user_id,a.id as artist_id,a.stage_name,
 coalesce(f.followers,0)::bigint as followers,
 coalesce(x.saved_releases,0)::bigint as total_release_saves,
 coalesce(x.reactions,0)::bigint as total_reactions,
 coalesce(x.comments,0)::bigint as total_comments,
 coalesce(x.community_actions,0)::bigint as total_community_actions
from public.artists a
left join (select artist_id,count(*)::bigint followers from public.artist_follows group by artist_id) f on f.artist_id=a.id
left join (select artist_id,sum(saves)::bigint saved_releases,sum(reactions)::bigint reactions,sum(comments)::bigint comments,sum(total_community_actions)::bigint community_actions from public.creator_release_community_summary group by artist_id) x on x.artist_id=a.id
where a.user_id=auth.uid();
revoke all on public.creator_audience_summary from public,anon;
grant select on public.creator_audience_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904034922 v2600_creator_command_center_community
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_command_center_v2
with (security_invoker=true)
as
select cc.*,
 coalesce(aud.followers,0)::bigint as followers,
 coalesce(aud.total_release_saves,0)::bigint as total_release_saves,
 coalesce(aud.total_reactions,0)::bigint as total_reactions,
 coalesce(aud.total_comments,0)::bigint as total_comments,
 coalesce(aud.total_community_actions,0)::bigint as total_community_actions,
 coalesce(mod.pending_reports,0)::bigint as pending_comment_reports,
 coalesce(ns.unread_notifications,0)::bigint as unread_notifications,
 (coalesce(cc.attention_count,0)+coalesce(mod.pending_reports,0)+coalesce(ns.unread_notifications,0))::bigint as total_attention_count
from public.creator_command_center cc
left join public.creator_audience_summary aud on aud.artist_id=cc.creator_id
left join (
 select artist_id,sum(pending_comment_reports)::bigint pending_reports
 from public.creator_release_community_summary group by artist_id
) mod on mod.artist_id=cc.creator_id
left join public.user_notification_summary ns on ns.user_id=cc.user_id
where cc.user_id=auth.uid();
revoke all on public.creator_command_center_v2 from public,anon;
grant select on public.creator_command_center_v2 to authenticated;

-- ============================================================
-- MIGRATION 20260904035022 v2610_release_readiness_backend
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_release_readiness
with (security_invoker=true)
as
with tc as (
 select mixtape_id,count(*)::bigint track_count,
 count(*) filter(where coalesce(nullif(btrim(audio_url),''),nullif(btrim(audio_path),'')) is not null)::bigint audio_track_count
 from public.tracks group by mixtape_id
), base as (
 select m.user_id,m.artist_id,m.id as mixtape_id,m.title,m.status,
 (nullif(btrim(m.title),'') is not null) has_title,
 (nullif(btrim(m.genre),'') is not null) has_genre,
 (nullif(btrim(m.description),'') is not null) has_description,
 (coalesce(nullif(btrim(m.cover_url),''),nullif(btrim(m.cover_path),'')) is not null) has_cover,
 (m.release_date is not null) has_release_date,
 (coalesce(tc.track_count,0)>0) has_tracks,
 (coalesce(tc.audio_track_count,0)>0 or nullif(btrim(m.audio_url),'') is not null) has_audio,
 coalesce(tc.track_count,0)::bigint track_count,
 coalesce(tc.audio_track_count,0)::bigint audio_track_count
 from public.mixtapes m left join tc on tc.mixtape_id=m.id
 where m.user_id=auth.uid()
)
select b.*,
 ((has_title::int+has_genre::int+has_description::int+has_cover::int+has_release_date::int+has_tracks::int+has_audio::int))::int completed_requirements,
 (7-(has_title::int+has_genre::int+has_description::int+has_cover::int+has_release_date::int+has_tracks::int+has_audio::int))::int issue_count,
 round(((has_title::int+has_genre::int+has_description::int+has_cover::int+has_release_date::int+has_tracks::int+has_audio::int)::numeric/7)*100)::int readiness_pct,
 case when not has_title then 'add_title' when not has_genre then 'add_genre' when not has_description then 'add_description' when not has_cover then 'add_cover' when not has_release_date then 'set_release_date' when not has_tracks then 'add_tracks' when not has_audio then 'upload_audio' else 'ready' end next_requirement,
 case when not has_title then 'Add a release title' when not has_genre then 'Choose a genre' when not has_description then 'Add a release description' when not has_cover then 'Upload cover artwork' when not has_release_date then 'Set a release date' when not has_tracks then 'Add at least one track' when not has_audio then 'Upload audio' else 'Release is ready' end next_requirement_title
from base b;
revoke all on public.creator_release_readiness from public,anon;
grant select on public.creator_release_readiness to authenticated;

-- ============================================================
-- MIGRATION 20260904035100 v2620_release_pipeline_backend
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_release_pipeline
with (security_invoker=true)
as
select r.user_id,r.artist_id,r.mixtape_id,r.title,r.status,r.readiness_pct,r.issue_count,r.track_count,r.audio_track_count,r.next_requirement,r.next_requirement_title,
 case
  when r.status='changes_requested' then 1
  when r.status='draft' and r.issue_count>0 then 2
  when r.status='draft' and r.issue_count=0 then 3
  when r.status='pending' then 4
  when r.status='rejected' then 5
  when r.status='published' then 6
  else 7 end as pipeline_priority,
 case
  when r.status='changes_requested' then 'Changes requested'
  when r.status='draft' and r.issue_count>0 then 'Needs setup'
  when r.status='draft' and r.issue_count=0 then 'Ready to submit'
  when r.status='pending' then 'In review'
  when r.status='rejected' then 'Rejected'
  when r.status='published' then 'Published'
  else initcap(replace(r.status::text,'_',' ')) end as pipeline_stage,
 h.last_status_change_at,h.last_status_note
from public.creator_release_readiness r
left join lateral (
 select max(created_at) as last_status_change_at,
        (array_agg(note order by created_at desc))[1] as last_status_note
 from public.release_status_history sh
 where sh.user_id=r.user_id and sh.project_type='mixtape' and sh.project_id=r.mixtape_id
) h on true
where r.user_id=auth.uid();
revoke all on public.creator_release_pipeline from public,anon;
grant select on public.creator_release_pipeline to authenticated;

create or replace view public.creator_release_pipeline_summary
with (security_invoker=true)
as
select user_id,artist_id,
 count(*)::bigint total_releases,
 count(*) filter(where pipeline_stage='Needs setup')::bigint needs_setup,
 count(*) filter(where pipeline_stage='Ready to submit')::bigint ready_to_submit,
 count(*) filter(where pipeline_stage='In review')::bigint in_review,
 count(*) filter(where pipeline_stage='Changes requested')::bigint changes_requested,
 count(*) filter(where pipeline_stage='Published')::bigint published,
 count(*) filter(where pipeline_stage='Rejected')::bigint rejected,
 round(avg(readiness_pct))::int average_readiness_pct
from public.creator_release_pipeline
where user_id=auth.uid()
group by user_id,artist_id;
revoke all on public.creator_release_pipeline_summary from public,anon;
grant select on public.creator_release_pipeline_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904035137 v2630_creator_command_center_release_pipeline
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_command_center_v3
with (security_invoker=true)
as
select cc.*,
 coalesce(ps.total_releases,0)::bigint as pipeline_total_releases,
 coalesce(ps.needs_setup,0)::bigint as releases_needing_setup,
 coalesce(ps.ready_to_submit,0)::bigint as releases_ready_to_submit,
 coalesce(ps.in_review,0)::bigint as releases_in_review,
 coalesce(ps.changes_requested,0)::bigint as pipeline_changes_requested,
 coalesce(ps.published,0)::bigint as pipeline_published,
 coalesce(ps.rejected,0)::bigint as pipeline_rejected,
 coalesce(ps.average_readiness_pct,0)::int as average_release_readiness_pct,
 (coalesce(cc.total_attention_count,0)+coalesce(ps.needs_setup,0)+coalesce(ps.changes_requested,0))::bigint as command_attention_count,
 case
   when coalesce(ps.changes_requested,0)>0 then 'fix_release_changes'
   when coalesce(ps.needs_setup,0)>0 then 'complete_release_setup'
   when coalesce(ps.ready_to_submit,0)>0 then 'submit_ready_release'
   else cc.next_action end as command_next_action,
 case
   when coalesce(ps.changes_requested,0)>0 then 'Review requested release changes'
   when coalesce(ps.needs_setup,0)>0 then 'Complete release setup'
   when coalesce(ps.ready_to_submit,0)>0 then 'Submit a ready release'
   else cc.next_action_title end as command_next_action_title
from public.creator_command_center_v2 cc
left join public.creator_release_pipeline_summary ps on ps.user_id=cc.user_id and ps.artist_id=cc.creator_id
where cc.user_id=auth.uid();
revoke all on public.creator_command_center_v3 from public,anon;
grant select on public.creator_command_center_v3 to authenticated;

-- ============================================================
-- MIGRATION 20260904035219 v2640_fan_discovery_backend
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_release_discovery
with (security_invoker=true)
as
select m.id as mixtape_id,m.artist_id,a.stage_name,m.title,m.genre,m.description,m.cover_url,m.slug,m.release_date,m.created_at,m.featured,
 coalesce(m.play_count,0)::bigint as play_count,coalesce(m.download_count,0)::bigint as download_count,
 coalesce(s.saves,0)::bigint as saves,coalesce(r.reactions,0)::bigint as reactions,coalesce(c.comments,0)::bigint as comments,
 (coalesce(m.play_count,0)+coalesce(m.download_count,0)*2+coalesce(s.saves,0)*3+coalesce(r.reactions,0)*2+coalesce(c.comments,0)*2)::bigint as discovery_score,
 exists(select 1 from public.artist_follows af where af.user_id=auth.uid() and af.artist_id=m.artist_id) as following_artist,
 exists(select 1 from public.release_saves rs where rs.user_id=auth.uid() and rs.mixtape_id=m.id) as saved
from public.mixtapes m join public.artists a on a.id=m.artist_id
left join (select mixtape_id,count(*)::bigint saves from public.release_saves group by mixtape_id) s on s.mixtape_id=m.id
left join (select mixtape_id,count(*)::bigint reactions from public.release_reactions group by mixtape_id) r on r.mixtape_id=m.id
left join (select mixtape_id,count(*) filter(where hidden_by_creator=false)::bigint comments from public.release_comments group by mixtape_id) c on c.mixtape_id=m.id
where m.status='published';
revoke all on public.fan_release_discovery from public,anon;
grant select on public.fan_release_discovery to authenticated;

create or replace view public.fan_artist_discovery
with (security_invoker=true)
as
select a.id as artist_id,a.stage_name,a.bio,a.avatar_url,
 count(distinct m.id) filter(where m.status='published')::bigint as published_releases,
 coalesce(f.followers,0)::bigint as followers,
 coalesce(sum(m.play_count) filter(where m.status='published'),0)::bigint as total_plays,
 exists(select 1 from public.artist_follows af where af.user_id=auth.uid() and af.artist_id=a.id) as following
from public.artists a
left join public.mixtapes m on m.artist_id=a.id
left join (select artist_id,count(*)::bigint followers from public.artist_follows group by artist_id) f on f.artist_id=a.id
group by a.id,a.stage_name,a.bio,a.avatar_url,f.followers;
revoke all on public.fan_artist_discovery from public,anon;
grant select on public.fan_artist_discovery to authenticated;

-- ============================================================
-- MIGRATION 20260904035305 v2650_fan_collections_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table public.fan_collections(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 80),
 description text check(description is null or char_length(description)<=500),
 is_public boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.fan_collection_items(
 id uuid primary key default gen_random_uuid(),
 collection_id uuid not null references public.fan_collections(id) on delete cascade,
 mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
 added_at timestamptz not null default now(),
 unique(collection_id,mixtape_id)
);
create index fan_collections_user_idx on public.fan_collections(user_id,updated_at desc);
create index fan_collection_items_collection_idx on public.fan_collection_items(collection_id,added_at desc);
create index fan_collection_items_mixtape_idx on public.fan_collection_items(mixtape_id);
alter table public.fan_collections enable row level security;
alter table public.fan_collection_items enable row level security;
revoke all on public.fan_collections,public.fan_collection_items from anon;
grant select,insert,update,delete on public.fan_collections,public.fan_collection_items to authenticated;
create policy fan_collections_select_own on public.fan_collections for select to authenticated using(user_id=auth.uid());
create policy fan_collections_insert_own on public.fan_collections for insert to authenticated with check(user_id=auth.uid());
create policy fan_collections_update_own on public.fan_collections for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fan_collections_delete_own on public.fan_collections for delete to authenticated using(user_id=auth.uid());
create policy fan_collection_items_select_own on public.fan_collection_items for select to authenticated using(exists(select 1 from public.fan_collections c where c.id=collection_id and c.user_id=auth.uid()));
create policy fan_collection_items_insert_own on public.fan_collection_items for insert to authenticated with check(exists(select 1 from public.fan_collections c where c.id=collection_id and c.user_id=auth.uid()) and exists(select 1 from public.mixtapes m where m.id=mixtape_id and m.status='published'));
create policy fan_collection_items_delete_own on public.fan_collection_items for delete to authenticated using(exists(select 1 from public.fan_collections c where c.id=collection_id and c.user_id=auth.uid()));

create or replace view public.fan_collection_summary with (security_invoker=true) as
select c.user_id,c.id as collection_id,c.name,c.description,c.is_public,c.created_at,c.updated_at,count(i.id)::bigint as release_count,max(i.added_at) as latest_added_at
from public.fan_collections c left join public.fan_collection_items i on i.collection_id=c.id
where c.user_id=auth.uid()
group by c.user_id,c.id,c.name,c.description,c.is_public,c.created_at,c.updated_at;
revoke all on public.fan_collection_summary from public,anon;
grant select on public.fan_collection_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904035340 v2660_fan_collection_detail_backend
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_collection_detail
with (security_invoker=true)
as
select c.user_id,c.id as collection_id,c.name as collection_name,c.description,c.is_public,
 i.id as collection_item_id,i.added_at,m.id as mixtape_id,m.artist_id,a.stage_name,m.title,m.genre,m.cover_url,m.slug,m.release_date,
 coalesce(m.play_count,0)::bigint as play_count,coalesce(m.download_count,0)::bigint as download_count,
 exists(select 1 from public.release_saves rs where rs.user_id=c.user_id and rs.mixtape_id=m.id) as saved
from public.fan_collections c
join public.fan_collection_items i on i.collection_id=c.id
join public.mixtapes m on m.id=i.mixtape_id and m.status='published'
join public.artists a on a.id=m.artist_id
where c.user_id=auth.uid();
revoke all on public.fan_collection_detail from public,anon;
grant select on public.fan_collection_detail to authenticated;

create or replace view public.fan_home_summary
with (security_invoker=true)
as
select auth.uid() as user_id,
 (select count(*) from public.artist_follows af where af.user_id=auth.uid())::bigint as followed_artists,
 (select count(*) from public.release_saves rs where rs.user_id=auth.uid())::bigint as saved_releases,
 (select count(*) from public.fan_collections fc where fc.user_id=auth.uid())::bigint as collections,
 (select count(*) from public.release_reactions rr where rr.user_id=auth.uid())::bigint as reactions,
 (select count(*) from public.release_comments rc where rc.user_id=auth.uid())::bigint as comments,
 (select count(*) from public.notifications n where n.recipient_id=auth.uid() and n.read_at is null)::bigint as unread_notifications;
revoke all on public.fan_home_summary from public,anon;
grant select on public.fan_home_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904035420 v2670_fan_listening_history
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table public.fan_listening_history(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
 track_id uuid references public.tracks(id) on delete set null,
 listened_at timestamptz not null default now(),
 progress_seconds integer not null default 0 check(progress_seconds>=0),
 completed boolean not null default false
);
create index fan_listening_history_user_time_idx on public.fan_listening_history(user_id,listened_at desc);
create index fan_listening_history_mixtape_idx on public.fan_listening_history(mixtape_id,listened_at desc);
alter table public.fan_listening_history enable row level security;
revoke all on public.fan_listening_history from anon;
grant select,insert,update,delete on public.fan_listening_history to authenticated;
create policy fan_listening_history_select_own on public.fan_listening_history for select to authenticated using(user_id=auth.uid());
create policy fan_listening_history_insert_own on public.fan_listening_history for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.mixtapes m where m.id=mixtape_id and m.status='published') and (track_id is null or exists(select 1 from public.tracks t where t.id=track_id and t.mixtape_id=fan_listening_history.mixtape_id)));
create policy fan_listening_history_update_own on public.fan_listening_history for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fan_listening_history_delete_own on public.fan_listening_history for delete to authenticated using(user_id=auth.uid());

create or replace view public.fan_recently_played with (security_invoker=true) as
select distinct on (h.mixtape_id) h.user_id,h.mixtape_id,h.track_id,h.listened_at,h.progress_seconds,h.completed,m.artist_id,a.stage_name,m.title,m.cover_url,m.slug,m.release_date
from public.fan_listening_history h join public.mixtapes m on m.id=h.mixtape_id and m.status='published' join public.artists a on a.id=m.artist_id
where h.user_id=auth.uid()
order by h.mixtape_id,h.listened_at desc;
revoke all on public.fan_recently_played from public,anon;
grant select on public.fan_recently_played to authenticated;

-- ============================================================
-- MIGRATION 20260904035502 v2680_fan_continue_listening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_continue_listening
with (security_invoker=true)
as
select distinct on (h.mixtape_id)
 h.user_id,h.mixtape_id,h.track_id,h.listened_at,h.progress_seconds,h.completed,
 m.artist_id,a.stage_name,m.title as mixtape_title,m.cover_url,m.slug,
 t.track_number,t.title as track_title,t.duration_seconds,
 case when coalesce(t.duration_seconds,0)>0 then least(100,round((h.progress_seconds::numeric/t.duration_seconds)*100)::int) else null end as progress_pct
from public.fan_listening_history h
join public.mixtapes m on m.id=h.mixtape_id and m.status='published'
join public.artists a on a.id=m.artist_id
left join public.tracks t on t.id=h.track_id and t.mixtape_id=h.mixtape_id
where h.user_id=auth.uid() and h.completed=false and h.progress_seconds>0
order by h.mixtape_id,h.listened_at desc;
revoke all on public.fan_continue_listening from public,anon;
grant select on public.fan_continue_listening to authenticated;

create or replace view public.fan_listening_summary
with (security_invoker=true)
as
select auth.uid() as user_id,
 count(*)::bigint as listening_events,
 count(distinct mixtape_id)::bigint as releases_played,
 count(distinct track_id) filter(where track_id is not null)::bigint as tracks_played,
 count(*) filter(where completed)::bigint as completed_plays,
 max(listened_at) as last_listened_at
from public.fan_listening_history
where user_id=auth.uid();
revoke all on public.fan_listening_summary from public,anon;
grant select on public.fan_listening_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904035636 v2690_fan_home_command_center
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_home_command_center
with (security_invoker=true)
as
select h.user_id,h.followed_artists,h.saved_releases,h.collections,h.reactions,h.comments,h.unread_notifications,
 coalesce(ls.listening_events,0)::bigint as listening_events,
 coalesce(ls.releases_played,0)::bigint as releases_played,
 coalesce(ls.tracks_played,0)::bigint as tracks_played,
 coalesce(ls.completed_plays,0)::bigint as completed_plays,
 ls.last_listened_at,
 (select count(*) from public.fan_continue_listening cl where cl.user_id=auth.uid())::bigint as continue_listening_count,
 (select count(*) from public.fan_following_feed ff where ff.fan_user_id=auth.uid())::bigint as following_feed_releases,
 case
   when coalesce(h.unread_notifications,0)>0 then 'view_notifications'
   when (select count(*) from public.fan_continue_listening cl where cl.user_id=auth.uid())>0 then 'continue_listening'
   when coalesce(h.saved_releases,0)>0 then 'open_library'
   when coalesce(h.followed_artists,0)>0 then 'view_following_feed'
   else 'discover_music' end as next_action,
 case
   when coalesce(h.unread_notifications,0)>0 then 'View new notifications'
   when (select count(*) from public.fan_continue_listening cl where cl.user_id=auth.uid())>0 then 'Continue listening'
   when coalesce(h.saved_releases,0)>0 then 'Open your saved library'
   when coalesce(h.followed_artists,0)>0 then 'See releases from artists you follow'
   else 'Discover music' end as next_action_title
from public.fan_home_summary h
left join public.fan_listening_summary ls on ls.user_id=h.user_id
where h.user_id=auth.uid();
revoke all on public.fan_home_command_center from public,anon;
grant select on public.fan_home_command_center to authenticated;

-- ============================================================
-- MIGRATION 20260904035713 v2700_fan_personalized_discovery
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_personalized_discovery
with (security_invoker=true)
as
with prefs as (
 select m.genre,count(*)::bigint affinity
 from public.fan_listening_history h join public.mixtapes m on m.id=h.mixtape_id
 where h.user_id=auth.uid() and nullif(btrim(m.genre),'') is not null
 group by m.genre
), saved_prefs as (
 select m.genre,count(*)::bigint affinity
 from public.release_saves s join public.mixtapes m on m.id=s.mixtape_id
 where s.user_id=auth.uid() and nullif(btrim(m.genre),'') is not null
 group by m.genre
), combined as (
 select genre,sum(affinity)::bigint affinity from (
   select genre,affinity*2 affinity from prefs
   union all
   select genre,affinity*3 affinity from saved_prefs
 ) x group by genre
)
select d.*,
 coalesce(p.affinity,0)::bigint as genre_affinity,
 (d.discovery_score + coalesce(p.affinity,0)*10 + case when d.following_artist then 30 else 0 end + case when d.saved then 15 else 0 end)::bigint as personalized_score
from public.fan_release_discovery d
left join combined p on lower(p.genre)=lower(d.genre)
where not exists (
 select 1 from public.fan_listening_history h where h.user_id=auth.uid() and h.mixtape_id=d.mixtape_id and h.listened_at>now()-interval '24 hours'
);
revoke all on public.fan_personalized_discovery from public,anon;
grant select on public.fan_personalized_discovery to authenticated;

-- ============================================================
-- MIGRATION 20260904035829 v2710_comment_visibility_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists release_comments_select_authenticated on public.release_comments;
create policy release_comments_select_authenticated on public.release_comments for select to authenticated using(
 exists(select 1 from public.mixtapes m where m.id=release_comments.mixtape_id and m.status='published')
 and (
   release_comments.hidden_by_creator=false
   or release_comments.user_id=auth.uid()
   or exists(select 1 from public.mixtapes own where own.id=release_comments.mixtape_id and own.user_id=auth.uid())
 )
);
create or replace view public.fan_release_comments with (security_invoker=true) as
select rc.id as comment_id,rc.mixtape_id,rc.body,rc.created_at,rc.updated_at,(rc.user_id=auth.uid()) as is_mine
from public.release_comments rc
join public.mixtapes m on m.id=rc.mixtape_id and m.status='published'
where rc.hidden_by_creator=false;
revoke all on public.fan_release_comments from public,anon;
grant select on public.fan_release_comments to authenticated;

-- ============================================================
-- MIGRATION 20260904035836 v2720_fan_engagement_hub
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_engagement_hub with (security_invoker=true) as
select auth.uid() as user_id,
 (select count(*) from public.artist_follows where user_id=auth.uid())::bigint followed_artists,
 (select count(*) from public.release_saves where user_id=auth.uid())::bigint saved_releases,
 (select count(*) from public.release_reactions where user_id=auth.uid())::bigint reactions,
 (select count(*) from public.release_comments where user_id=auth.uid())::bigint comments,
 (select count(*) from public.fan_collections where user_id=auth.uid())::bigint collections,
 (select count(*) from public.fan_listening_history where user_id=auth.uid())::bigint listening_events,
 (select count(*) from public.notifications where recipient_id=auth.uid() and read_at is null)::bigint unread_notifications,
 (select max(created_at) from public.release_saves where user_id=auth.uid()) latest_save_at,
 (select max(created_at) from public.release_reactions where user_id=auth.uid()) latest_reaction_at,
 (select max(created_at) from public.release_comments where user_id=auth.uid()) latest_comment_at;
revoke all on public.fan_engagement_hub from public,anon;
grant select on public.fan_engagement_hub to authenticated;

-- ============================================================
-- MIGRATION 20260904035846 v2730_platform_launch_readiness
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_launch_readiness with (security_invoker=true) as
select cc.user_id,cc.creator_id,cc.stage_name,
 cc.pipeline_total_releases,cc.releases_needing_setup,cc.releases_ready_to_submit,cc.releases_in_review,cc.pipeline_changes_requested,cc.pipeline_published,
 cc.average_release_readiness_pct,cc.followers,cc.total_release_saves,cc.total_reactions,cc.total_comments,cc.pending_comment_reports,cc.unread_notifications,
 case when cc.pipeline_total_releases=0 then 'create_first_release'
      when cc.pipeline_changes_requested>0 then 'resolve_changes'
      when cc.releases_needing_setup>0 then 'finish_release_setup'
      when cc.releases_ready_to_submit>0 then 'submit_release'
      when cc.releases_in_review>0 then 'await_review'
      when cc.pipeline_published>0 then 'promote_published_music'
      else cc.command_next_action end launch_next_action,
 case when cc.pipeline_total_releases=0 then 'Create your first release'
      when cc.pipeline_changes_requested>0 then 'Resolve requested changes'
      when cc.releases_needing_setup>0 then 'Finish release setup'
      when cc.releases_ready_to_submit>0 then 'Submit a ready release'
      when cc.releases_in_review>0 then 'Release is in review'
      when cc.pipeline_published>0 then 'Promote your published music'
      else cc.command_next_action_title end launch_next_action_title,
 greatest(0,least(100,
   case when cc.pipeline_total_releases=0 then 10
        when cc.pipeline_published>0 then 100
        else coalesce(cc.average_release_readiness_pct,0) end
 ))::int launch_readiness_pct
from public.creator_command_center_v3 cc
where cc.user_id=auth.uid();
revoke all on public.creator_launch_readiness from public,anon;
grant select on public.creator_launch_readiness to authenticated;

-- ============================================================
-- MIGRATION 20260904040108 v2740_creator_dashboard_master
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_dashboard_master
with (security_invoker=true)
as
select cc.*,
 lr.launch_readiness_pct,lr.launch_next_action,lr.launch_next_action_title
from public.creator_command_center_v3 cc
left join public.creator_launch_readiness lr on lr.user_id=cc.user_id and lr.creator_id=cc.creator_id
where cc.user_id=auth.uid();
revoke all on public.creator_dashboard_master from public,anon;
grant select on public.creator_dashboard_master to authenticated;

-- ============================================================
-- MIGRATION 20260904040117 v2750_fan_dashboard_master
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_dashboard_master
with (security_invoker=true)
as
select fh.*,
 (select count(*) from public.fan_engagement_hub fe where fe.user_id=auth.uid())::bigint as engagement_items,
 (select count(*) from public.fan_personalized_discovery pd)::bigint as discovery_releases,
 (select count(*) from public.fan_collection_summary cs where cs.user_id=auth.uid())::bigint as collection_count
from public.fan_home_command_center fh
where fh.user_id=auth.uid();
revoke all on public.fan_dashboard_master from public,anon;
grant select on public.fan_dashboard_master to authenticated;

-- ============================================================
-- MIGRATION 20260904040453 v2760_security_performance_autorepair
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Explicitly deny client roles on internal deployment tables while keeping RLS intent visible.
drop policy if exists tgg_theme_deploy_devices_deny_clients on public.tgg_theme_deploy_devices;
create policy tgg_theme_deploy_devices_deny_clients on public.tgg_theme_deploy_devices for all to anon, authenticated using (false) with check (false);
drop policy if exists tgg_theme_deploy_jobs_deny_clients on public.tgg_theme_deploy_jobs;
create policy tgg_theme_deploy_jobs_deny_clients on public.tgg_theme_deploy_jobs for all to anon, authenticated using (false) with check (false);
drop policy if exists v98_blogger_connect_links_deny_clients on public.v98_blogger_connect_links;
create policy v98_blogger_connect_links_deny_clients on public.v98_blogger_connect_links for all to anon, authenticated using (false) with check (false);

-- Cover the listening-history track foreign key.
create index if not exists fan_listening_history_track_id_idx on public.fan_listening_history(track_id);

-- RLS init-plan optimization: evaluate auth.uid() once per statement.
alter policy release_saves_select_own on public.release_saves using (user_id = (select auth.uid()));
alter policy release_saves_insert_own on public.release_saves with check (user_id = (select auth.uid()) and exists (select 1 from public.mixtapes m where m.id = release_saves.mixtape_id and m.status = 'published'));
alter policy release_saves_delete_own on public.release_saves using (user_id = (select auth.uid()));

alter policy artist_follows_select_own on public.artist_follows using (user_id = (select auth.uid()));
alter policy artist_follows_insert_own on public.artist_follows with check (user_id = (select auth.uid()) and exists (select 1 from public.artists a where a.id = artist_follows.artist_id));
alter policy artist_follows_delete_own on public.artist_follows using (user_id = (select auth.uid()));

alter policy notifications_select_own on public.notifications using (recipient_id = (select auth.uid()));
alter policy notifications_update_own on public.notifications using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

alter policy release_reactions_select_own on public.release_reactions using (user_id = (select auth.uid()));
alter policy release_reactions_insert_own on public.release_reactions with check (user_id = (select auth.uid()) and exists (select 1 from public.mixtapes m where m.id = release_reactions.mixtape_id and m.status = 'published'));
alter policy release_reactions_update_own on public.release_reactions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and reaction = any(array['like'::text,'fire'::text]));
alter policy release_reactions_delete_own on public.release_reactions using (user_id = (select auth.uid()));

alter policy release_comments_insert_own on public.release_comments with check (user_id = (select auth.uid()) and exists (select 1 from public.mixtapes m where m.id = release_comments.mixtape_id and m.status = 'published'));
alter policy release_comments_delete_own on public.release_comments using (user_id = (select auth.uid()));
alter policy release_comments_update_own on public.release_comments using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and char_length(btrim(body)) between 1 and 1000);
alter policy release_comments_select_authenticated on public.release_comments using (
 exists (select 1 from public.mixtapes m where m.id = release_comments.mixtape_id and m.status = 'published')
 and (
   hidden_by_creator = false
   or user_id = (select auth.uid())
   or exists (select 1 from public.mixtapes own where own.id = release_comments.mixtape_id and own.user_id = (select auth.uid()))
 )
);

alter policy release_comment_reports_select_own on public.release_comment_reports using (reporter_id = (select auth.uid()));
alter policy release_comment_reports_insert_own on public.release_comment_reports with check (
 reporter_id = (select auth.uid())
 and exists (
   select 1 from public.release_comments c
   join public.mixtapes m on m.id = c.mixtape_id
   where c.id = release_comment_reports.comment_id and m.status = 'published'
 )
);

alter policy fan_collections_select_own on public.fan_collections using (user_id = (select auth.uid()));
alter policy fan_collections_insert_own on public.fan_collections with check (user_id = (select auth.uid()));
alter policy fan_collections_update_own on public.fan_collections using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy fan_collections_delete_own on public.fan_collections using (user_id = (select auth.uid()));

alter policy fan_collection_items_select_own on public.fan_collection_items using (exists (select 1 from public.fan_collections c where c.id = fan_collection_items.collection_id and c.user_id = (select auth.uid())));
alter policy fan_collection_items_insert_own on public.fan_collection_items with check (
 exists (select 1 from public.fan_collections c where c.id = fan_collection_items.collection_id and c.user_id = (select auth.uid()))
 and exists (select 1 from public.mixtapes m where m.id = fan_collection_items.mixtape_id and m.status = 'published')
);
alter policy fan_collection_items_delete_own on public.fan_collection_items using (exists (select 1 from public.fan_collections c where c.id = fan_collection_items.collection_id and c.user_id = (select auth.uid())));

alter policy fan_listening_history_select_own on public.fan_listening_history using (user_id = (select auth.uid()));
alter policy fan_listening_history_insert_own on public.fan_listening_history with check (
 user_id = (select auth.uid())
 and exists (select 1 from public.mixtapes m where m.id = fan_listening_history.mixtape_id and m.status = 'published')
 and (track_id is null or exists (select 1 from public.tracks t where t.id = fan_listening_history.track_id and t.mixtape_id = fan_listening_history.mixtape_id))
);
alter policy fan_listening_history_update_own on public.fan_listening_history using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy fan_listening_history_delete_own on public.fan_listening_history using (user_id = (select auth.uid()));

-- ============================================================
-- MIGRATION 20260904040705 v2770_community_notification_automation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_create_community_notification() returns trigger language plpgsql security definer set search_path = '' as $$ declare v_recipient uuid; v_title text; v_body text; v_type text; v_entity_type text; v_entity_id uuid; begin if tg_table_name = 'artist_follows' then select a.user_id into v_recipient from public.artists a where a.id=new.artist_id; v_type:='artist_follow'; v_entity_type:='artist'; v_entity_id:=new.artist_id; v_title:='New follower'; v_body:='Someone followed your artist profile.'; elsif tg_table_name = 'release_saves' then select m.user_id into v_recipient from public.mixtapes m where m.id=new.mixtape_id; v_type:='release_save'; v_entity_type:='mixtape'; v_entity_id:=new.mixtape_id; v_title:='Release saved'; v_body:='Someone saved your release.'; elsif tg_table_name = 'release_reactions' then select m.user_id into v_recipient from public.mixtapes m where m.id=new.mixtape_id; v_type:='release_reaction'; v_entity_type:='mixtape'; v_entity_id:=new.mixtape_id; v_title:='New reaction'; v_body:='Someone reacted to your release.'; elsif tg_table_name = 'release_comments' then select m.user_id into v_recipient from public.mixtapes m where m.id=new.mixtape_id; v_type:='release_comment'; v_entity_type:='comment'; v_entity_id:=new.id; v_title:='New comment'; v_body:='Someone commented on your release.'; else return new; end if; if v_recipient is null or v_recipient = new.user_id then return new; end if; if not exists (select 1 from public.notifications n where n.recipient_id=v_recipient and n.actor_id=new.user_id and n.notification_type=v_type and n.entity_type=v_entity_type and n.entity_id=v_entity_id and n.created_at > now()-interval '10 minutes') then insert into public.notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,title,body) values(v_recipient,new.user_id,v_type,v_entity_type,v_entity_id,v_title,v_body); end if; return new; end $$; revoke all on function private.tgg_create_community_notification() from public, anon, authenticated; drop trigger if exists tgg_artist_follow_notification on public.artist_follows; create trigger tgg_artist_follow_notification after insert on public.artist_follows for each row execute function private.tgg_create_community_notification(); drop trigger if exists tgg_release_save_notification on public.release_saves; create trigger tgg_release_save_notification after insert on public.release_saves for each row execute function private.tgg_create_community_notification(); drop trigger if exists tgg_release_reaction_notification on public.release_reactions; create trigger tgg_release_reaction_notification after insert on public.release_reactions for each row execute function private.tgg_create_community_notification(); drop trigger if exists tgg_release_comment_notification on public.release_comments; create trigger tgg_release_comment_notification after insert on public.release_comments for each row execute function private.tgg_create_community_notification(); create index if not exists notifications_community_dedupe_idx on public.notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,created_at desc);

-- ============================================================
-- MIGRATION 20260904040712 v2780_fan_activity_hub
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_activity_summary with (security_invoker=true) as select u.id as user_id, (select count(*) from public.artist_follows f where f.user_id=u.id) as followed_artists, (select count(*) from public.release_saves s where s.user_id=u.id) as saved_releases, (select count(*) from public.release_reactions r where r.user_id=u.id) as reactions, (select count(*) from public.release_comments c where c.user_id=u.id) as comments, (select count(*) from public.fan_collections fc where fc.user_id=u.id) as collections, (select count(*) from public.fan_listening_history h where h.user_id=u.id) as listening_events, (select count(*) from public.notifications n where n.recipient_id=u.id and n.read_at is null) as unread_notifications, greatest((select max(h.listened_at) from public.fan_listening_history h where h.user_id=u.id),(select max(n.created_at) from public.notifications n where n.recipient_id=u.id)) as last_activity_at from auth.users u where u.id=(select auth.uid()); revoke all on public.fan_activity_summary from public,anon; grant select on public.fan_activity_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904040721 v2790_listening_progress_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_save_listening_progress(p_mixtape_id uuid,p_track_id uuid default null,p_progress_seconds integer default 0,p_completed boolean default false) returns uuid language plpgsql set search_path='' as $$ declare v_user uuid := auth.uid(); v_id uuid; v_duration integer; v_progress integer := greatest(coalesce(p_progress_seconds,0),0); begin if v_user is null then raise exception 'authentication required'; end if; if not exists(select 1 from public.mixtapes m where m.id=p_mixtape_id and m.status='published') then raise exception 'release unavailable'; end if; if p_track_id is not null then select t.duration_seconds into v_duration from public.tracks t where t.id=p_track_id and t.mixtape_id=p_mixtape_id; if not found then raise exception 'track unavailable'; end if; if v_duration is not null and v_duration>0 then v_progress:=least(v_progress,v_duration); end if; end if; select h.id into v_id from public.fan_listening_history h where h.user_id=v_user and h.mixtape_id=p_mixtape_id and h.track_id is not distinct from p_track_id order by h.listened_at desc limit 1; if v_id is not null then update public.fan_listening_history set progress_seconds=v_progress, completed=(p_completed or (v_duration is not null and v_duration>0 and v_progress >= greatest(v_duration-5,0))), listened_at=now() where id=v_id and user_id=v_user; return v_id; end if; insert into public.fan_listening_history(user_id,mixtape_id,track_id,progress_seconds,completed,listened_at) values(v_user,p_mixtape_id,p_track_id,v_progress,(p_completed or (v_duration is not null and v_duration>0 and v_progress >= greatest(v_duration-5,0))),now()) returning id into v_id; return v_id; end $$; revoke all on function public.tgg_save_listening_progress(uuid,uuid,integer,boolean) from public,anon; grant execute on function public.tgg_save_listening_progress(uuid,uuid,integer,boolean) to authenticated; create index if not exists fan_listening_history_user_release_track_recent_idx on public.fan_listening_history(user_id,mixtape_id,track_id,listened_at desc);

-- ============================================================
-- MIGRATION 20260904040827 v2800_public_collection_sharing
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_public_collection(p_collection_id uuid) returns table(collection_id uuid, collection_name text, collection_description text, updated_at timestamptz, item_id uuid, mixtape_id uuid, mixtape_title text, artist_name text, cover_url text, slug text, added_at timestamptz) language sql security definer set search_path='' as $$ select c.id,c.name,c.description,c.updated_at,i.id,i.mixtape_id,m.title,a.stage_name,m.cover_url,m.slug,i.added_at from public.fan_collections c join public.fan_collection_items i on i.collection_id=c.id join public.mixtapes m on m.id=i.mixtape_id and m.status='published' left join public.artists a on a.id=m.artist_id where c.id=p_collection_id and c.is_public=true order by i.added_at desc $$; revoke all on function public.tgg_get_public_collection(uuid) from public; grant execute on function public.tgg_get_public_collection(uuid) to anon, authenticated;

-- ============================================================
-- MIGRATION 20260904040837 v2810_stable_dashboard_contracts
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_dashboard_v1 with (security_invoker=true) as select * from public.creator_dashboard_master where user_id=(select auth.uid()); revoke all on public.creator_dashboard_v1 from public,anon; grant select on public.creator_dashboard_v1 to authenticated; create or replace view public.fan_dashboard_v1 with (security_invoker=true) as select * from public.fan_dashboard_master where user_id=(select auth.uid()); revoke all on public.fan_dashboard_v1 from public,anon; grant select on public.fan_dashboard_v1 to authenticated; create or replace view public.public_release_detail_v1 with (security_invoker=true) as select m.id as mixtape_id,m.slug,m.title,m.genre,m.description,m.cover_url,m.release_date,m.explicit,m.play_count,m.download_count,m.artist_id,a.stage_name,a.avatar_url,(select count(*) from public.tracks t where t.mixtape_id=m.id) as track_count,(select count(*) from public.release_saves s where s.mixtape_id=m.id) as save_count,(select count(*) from public.release_reactions r where r.mixtape_id=m.id) as reaction_count,(select count(*) from public.release_comments c where c.mixtape_id=m.id and c.hidden_by_creator=false) as visible_comment_count from public.mixtapes m left join public.artists a on a.id=m.artist_id where m.status='published'; revoke all on public.public_release_detail_v1 from public; grant select on public.public_release_detail_v1 to anon,authenticated;

-- ============================================================
-- MIGRATION 20260904040843 v2820_notification_actions_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_mark_notification_read(p_notification_id uuid) returns boolean language plpgsql set search_path='' as $$ begin update public.notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and recipient_id=(select auth.uid()); return found; end $$; revoke all on function public.tgg_mark_notification_read(uuid) from public,anon; grant execute on function public.tgg_mark_notification_read(uuid) to authenticated; create or replace function public.tgg_mark_all_notifications_read() returns integer language plpgsql set search_path='' as $$ declare v_count integer; begin update public.notifications set read_at=coalesce(read_at,now()) where recipient_id=(select auth.uid()) and read_at is null; get diagnostics v_count=row_count; return v_count; end $$; revoke all on function public.tgg_mark_all_notifications_read() from public,anon; grant execute on function public.tgg_mark_all_notifications_read() to authenticated;

-- ============================================================
-- MIGRATION 20260904040951 v2830_public_release_tracks_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_release_tracks_v1 with (security_invoker=true) as select t.id,t.mixtape_id,t.track_number,t.title,t.featured_artist,t.audio_url,t.duration_seconds,t.download_policy from public.tracks t join public.mixtapes m on m.id=t.mixtape_id where m.status='published'; revoke all on public.public_release_tracks_v1 from public; grant select on public.public_release_tracks_v1 to anon,authenticated; create index if not exists tracks_mixtape_track_number_idx on public.tracks(mixtape_id,track_number);

-- ============================================================
-- MIGRATION 20260904041001 v2840_fan_engagement_actions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_toggle_release_save(p_mixtape_id uuid) returns boolean language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); begin if v_user is null then raise exception 'authentication required'; end if; if not exists(select 1 from public.mixtapes m where m.id=p_mixtape_id and m.status='published') then raise exception 'release unavailable'; end if; if exists(select 1 from public.release_saves s where s.user_id=v_user and s.mixtape_id=p_mixtape_id) then delete from public.release_saves where user_id=v_user and mixtape_id=p_mixtape_id; return false; end if; insert into public.release_saves(user_id,mixtape_id) values(v_user,p_mixtape_id); return true; end $$; create or replace function public.tgg_toggle_artist_follow(p_artist_id uuid) returns boolean language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); begin if v_user is null then raise exception 'authentication required'; end if; if not exists(select 1 from public.artists a where a.id=p_artist_id) then raise exception 'artist unavailable'; end if; if exists(select 1 from public.artist_follows f where f.user_id=v_user and f.artist_id=p_artist_id) then delete from public.artist_follows where user_id=v_user and artist_id=p_artist_id; return false; end if; insert into public.artist_follows(user_id,artist_id) values(v_user,p_artist_id); return true; end $$; create or replace function public.tgg_set_release_reaction(p_mixtape_id uuid,p_reaction text) returns text language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_reaction text:=lower(btrim(p_reaction)); begin if v_user is null then raise exception 'authentication required'; end if; if v_reaction not in ('like','fire') then raise exception 'invalid reaction'; end if; if not exists(select 1 from public.mixtapes m where m.id=p_mixtape_id and m.status='published') then raise exception 'release unavailable'; end if; insert into public.release_reactions(user_id,mixtape_id,reaction) values(v_user,p_mixtape_id,v_reaction) on conflict(user_id,mixtape_id) do update set reaction=excluded.reaction,updated_at=now(); return v_reaction; end $$; revoke all on function public.tgg_toggle_release_save(uuid) from public,anon; revoke all on function public.tgg_toggle_artist_follow(uuid) from public,anon; revoke all on function public.tgg_set_release_reaction(uuid,text) from public,anon; grant execute on function public.tgg_toggle_release_save(uuid) to authenticated; grant execute on function public.tgg_toggle_artist_follow(uuid) to authenticated; grant execute on function public.tgg_set_release_reaction(uuid,text) to authenticated;

-- ============================================================
-- MIGRATION 20260904041010 v2850_release_comment_actions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_add_release_comment(p_mixtape_id uuid,p_body text) returns uuid language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_id uuid; v_body text:=btrim(coalesce(p_body,'')); begin if v_user is null then raise exception 'authentication required'; end if; if char_length(v_body)<1 or char_length(v_body)>1000 then raise exception 'comment must be 1 to 1000 characters'; end if; if not exists(select 1 from public.mixtapes m where m.id=p_mixtape_id and m.status='published') then raise exception 'release unavailable'; end if; insert into public.release_comments(user_id,mixtape_id,body) values(v_user,p_mixtape_id,v_body) returning id into v_id; return v_id; end $$; create or replace function public.tgg_delete_own_release_comment(p_comment_id uuid) returns boolean language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_count integer; begin if v_user is null then raise exception 'authentication required'; end if; delete from public.release_comments where id=p_comment_id and user_id=v_user; get diagnostics v_count=row_count; return v_count>0; end $$; revoke all on function public.tgg_add_release_comment(uuid,text) from public,anon; revoke all on function public.tgg_delete_own_release_comment(uuid) from public,anon; grant execute on function public.tgg_add_release_comment(uuid,text) to authenticated; grant execute on function public.tgg_delete_own_release_comment(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260904041017 v2860_fan_release_state_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_release_state_v1 with (security_invoker=true) as select m.id as mixtape_id,(s.id is not null) as saved,(f.id is not null) as following_artist,r.reaction,(select count(*) from public.release_comments c where c.mixtape_id=m.id and c.user_id=(select auth.uid()))::bigint as own_comment_count from public.mixtapes m left join public.release_saves s on s.mixtape_id=m.id and s.user_id=(select auth.uid()) left join public.artist_follows f on f.artist_id=m.artist_id and f.user_id=(select auth.uid()) left join public.release_reactions r on r.mixtape_id=m.id and r.user_id=(select auth.uid()) where m.status='published' and (select auth.uid()) is not null; revoke all on public.fan_release_state_v1 from public,anon; grant select on public.fan_release_state_v1 to authenticated;

-- ============================================================
-- MIGRATION 20260904041112 v2870_fan_collection_actions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_create_fan_collection(p_name text,p_description text default null,p_is_public boolean default false) returns uuid language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_id uuid; v_name text:=btrim(coalesce(p_name,'')); begin if v_user is null then raise exception 'authentication required'; end if; if char_length(v_name)<1 or char_length(v_name)>80 then raise exception 'collection name must be 1 to 80 characters'; end if; if p_description is not null and char_length(p_description)>500 then raise exception 'description too long'; end if; insert into public.fan_collections(user_id,name,description,is_public) values(v_user,v_name,nullif(btrim(p_description),''),coalesce(p_is_public,false)) returning id into v_id; return v_id; end $$; create or replace function public.tgg_toggle_collection_item(p_collection_id uuid,p_mixtape_id uuid) returns boolean language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); begin if v_user is null then raise exception 'authentication required'; end if; if not exists(select 1 from public.fan_collections c where c.id=p_collection_id and c.user_id=v_user) then raise exception 'collection unavailable'; end if; if not exists(select 1 from public.mixtapes m where m.id=p_mixtape_id and m.status='published') then raise exception 'release unavailable'; end if; if exists(select 1 from public.fan_collection_items i where i.collection_id=p_collection_id and i.mixtape_id=p_mixtape_id) then delete from public.fan_collection_items where collection_id=p_collection_id and mixtape_id=p_mixtape_id; return false; end if; insert into public.fan_collection_items(collection_id,mixtape_id) values(p_collection_id,p_mixtape_id); return true; end $$; create or replace function public.tgg_set_collection_visibility(p_collection_id uuid,p_is_public boolean) returns boolean language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_count integer; begin if v_user is null then raise exception 'authentication required'; end if; update public.fan_collections set is_public=coalesce(p_is_public,false),updated_at=now() where id=p_collection_id and user_id=v_user; get diagnostics v_count=row_count; return v_count>0; end $$; revoke all on function public.tgg_create_fan_collection(text,text,boolean) from public,anon; revoke all on function public.tgg_toggle_collection_item(uuid,uuid) from public,anon; revoke all on function public.tgg_set_collection_visibility(uuid,boolean) from public,anon; grant execute on function public.tgg_create_fan_collection(text,text,boolean),public.tgg_toggle_collection_item(uuid,uuid),public.tgg_set_collection_visibility(uuid,boolean) to authenticated;

-- ============================================================
-- MIGRATION 20260904041120 v2880_public_artist_profile_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_artist_profile_v1 with (security_invoker=true) as select a.id as artist_id,a.stage_name,a.bio,a.avatar_url,a.instagram,a.website,a.youtube,a.soundcloud,a.spotify,(select count(*) from public.mixtapes m where m.artist_id=a.id and m.status='published')::bigint as published_releases,(select count(*) from public.artist_follows f where f.artist_id=a.id)::bigint as followers,(select coalesce(sum(m.play_count),0) from public.mixtapes m where m.artist_id=a.id and m.status='published')::bigint as total_plays from public.artists a where exists(select 1 from public.mixtapes m where m.artist_id=a.id and m.status='published'); revoke all on public.public_artist_profile_v1 from public; grant select on public.public_artist_profile_v1 to anon,authenticated;

-- ============================================================
-- MIGRATION 20260904041125 v2890_public_release_comments_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_release_comments_v1 with (security_invoker=true) as select c.id as comment_id,c.mixtape_id,c.body,c.created_at,c.updated_at from public.release_comments c join public.mixtapes m on m.id=c.mixtape_id where m.status='published' and c.hidden_by_creator=false; revoke all on public.public_release_comments_v1 from public; grant select on public.public_release_comments_v1 to authenticated;

-- ============================================================
-- MIGRATION 20260904041132 v2900_release_engagement_counts_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_release_engagement_v1 with (security_invoker=true) as select m.id as mixtape_id,(select count(*) from public.release_saves s where s.mixtape_id=m.id)::bigint as saves,(select count(*) from public.release_reactions r where r.mixtape_id=m.id and r.reaction='like')::bigint as likes,(select count(*) from public.release_reactions r where r.mixtape_id=m.id and r.reaction='fire')::bigint as fires,(select count(*) from public.release_comments c where c.mixtape_id=m.id and c.hidden_by_creator=false)::bigint as comments from public.mixtapes m where m.status='published'; revoke all on public.public_release_engagement_v1 from public; grant select on public.public_release_engagement_v1 to authenticated;

-- ============================================================
-- MIGRATION 20260904041246 v2910_public_video_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_videos_v1 with (security_invoker=true) as select id,title,description,category,video_url,thumbnail_url,artist_name,publish_date,featured from public.site_videos where published=true and coalesce(status,'published')='published'; revoke all on public.public_videos_v1 from public; grant select on public.public_videos_v1 to anon,authenticated; create index if not exists site_videos_public_feed_idx on public.site_videos(published,status,publish_date desc);

-- ============================================================
-- MIGRATION 20260904041252 v2920_public_interview_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_interviews_v1 with (security_invoker=true) as select id,title,artist_name,video_url,image_url,publish_date from public.artist_interviews where published=true and coalesce(status,'published')='published'; revoke all on public.public_interviews_v1 from public; grant select on public.public_interviews_v1 to anon,authenticated; create index if not exists artist_interviews_public_feed_idx on public.artist_interviews(published,status,publish_date desc);

-- ============================================================
-- MIGRATION 20260904041259 v2930_public_merch_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_merch_v1 with (security_invoker=true) as select mp.id,mp.creator_id,mp.title,mp.description,mp.product_type,mp.price_cents,mp.currency,mp.sku,mp.inventory,mp.image_url,mp.published_at,a.stage_name as creator_name from public.merch_products mp left join public.artists a on a.id=mp.creator_id where mp.status='published'; revoke all on public.public_merch_v1 from public; grant select on public.public_merch_v1 to anon,authenticated; create index if not exists merch_products_public_feed_idx on public.merch_products(status,published_at desc);

-- ============================================================
-- MIGRATION 20260904041306 v2940_creator_content_inventory_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_content_inventory_v1 with (security_invoker=true) as select (select auth.uid()) as user_id,(select count(*) from public.mixtapes m where m.user_id=(select auth.uid()))::bigint as mixtapes,(select count(*) from public.mixtapes m where m.user_id=(select auth.uid()) and m.status='published')::bigint as published_mixtapes,(select count(*) from public.site_videos v where v.user_id=(select auth.uid()))::bigint as videos,(select count(*) from public.site_videos v where v.user_id=(select auth.uid()) and v.published=true)::bigint as published_videos,(select count(*) from public.artist_interviews i where i.user_id=(select auth.uid()))::bigint as interviews,(select count(*) from public.merch_products p where p.user_id=(select auth.uid()))::bigint as merch_products,(select count(*) from public.merch_products p where p.user_id=(select auth.uid()) and p.status='published')::bigint as published_merch where (select auth.uid()) is not null; revoke all on public.creator_content_inventory_v1 from public,anon; grant select on public.creator_content_inventory_v1 to authenticated;

-- ============================================================
-- MIGRATION 20260904041355 v2950_messenger_inbox_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_messenger_inbox_v1 with (security_invoker=true) as select c.id as conversation_id,c.title,c.project_type,c.status,c.last_message_at,c.created_at,cm.role,cm.last_read_at,(select count(*) from public.tgg_messages m where m.conversation_id=c.id and m.created_at>coalesce(cm.last_read_at,'epoch'::timestamptz) and m.sender_id<>(select auth.uid()))::bigint as unread_messages,(select m.body from public.tgg_messages m where m.conversation_id=c.id order by m.created_at desc limit 1) as last_message from public.tgg_conversations c join public.tgg_conversation_members cm on cm.conversation_id=c.id where cm.user_id=(select auth.uid()); revoke all on public.creator_messenger_inbox_v1 from public,anon; grant select on public.creator_messenger_inbox_v1 to authenticated;

-- ============================================================
-- MIGRATION 20260904041402 v2960_messenger_read_action
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_mark_conversation_read(p_conversation_id uuid) returns boolean language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_count integer; begin if v_user is null then raise exception 'authentication required'; end if; update public.tgg_conversation_members set last_read_at=now() where conversation_id=p_conversation_id and user_id=v_user; get diagnostics v_count=row_count; return v_count>0; end $$; revoke all on function public.tgg_mark_conversation_read(uuid) from public,anon; grant execute on function public.tgg_mark_conversation_read(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260904041411 v2970_messenger_send_action
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_send_message(p_conversation_id uuid,p_body text) returns uuid language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_body text:=btrim(coalesce(p_body,'')); v_id uuid; begin if v_user is null then raise exception 'authentication required'; end if; if char_length(v_body)<1 or char_length(v_body)>5000 then raise exception 'message must be 1 to 5000 characters'; end if; if not (select private.tgg_is_conversation_member(p_conversation_id)) then raise exception 'conversation unavailable'; end if; insert into public.tgg_messages(conversation_id,sender_id,body) values(p_conversation_id,v_user,v_body) returning id into v_id; update public.tgg_conversations set last_message_at=now(),updated_at=now() where id=p_conversation_id; update public.tgg_conversation_members set last_read_at=now() where conversation_id=p_conversation_id and user_id=v_user; return v_id; end $$; revoke all on function public.tgg_send_message(uuid,text) from public,anon; grant execute on function public.tgg_send_message(uuid,text) to authenticated;

-- ============================================================
-- MIGRATION 20260904041420 v2980_collaboration_inbox_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_collaboration_inbox_v1 with (security_invoker=true) as select r.id,r.sender_id,r.recipient_id,r.project_title,r.project_type,r.note,r.status,r.conversation_id,r.created_at,r.updated_at,case when r.recipient_id=(select auth.uid()) then 'incoming' else 'outgoing' end as direction from public.tgg_collaboration_requests r where r.sender_id=(select auth.uid()) or r.recipient_id=(select auth.uid()); revoke all on public.creator_collaboration_inbox_v1 from public,anon; grant select on public.creator_collaboration_inbox_v1 to authenticated;

-- ============================================================
-- MIGRATION 20260904041517 v2990_creator_workspace_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_workspace_v1 with (security_invoker=true) as select (select auth.uid()) as user_id,(select row_to_json(x) from public.creator_dashboard_v1 x limit 1) as dashboard,(select row_to_json(x) from public.creator_content_inventory_v1 x limit 1) as content_inventory,(select count(*) from public.creator_messenger_inbox_v1)::bigint as conversations,(select coalesce(sum(unread_messages),0) from public.creator_messenger_inbox_v1)::bigint as unread_messages,(select count(*) from public.creator_collaboration_inbox_v1 where direction='incoming' and status in ('pending','requested'))::bigint as pending_collaborations where (select auth.uid()) is not null; revoke all on public.creator_workspace_v1 from public,anon; grant select on public.creator_workspace_v1 to authenticated;

-- ============================================================
-- MIGRATION 20260904041528 v3000_fan_workspace_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.fan_workspace_v1 with (security_invoker=true) as select (select auth.uid()) as user_id,(select row_to_json(x) from public.fan_dashboard_v1 x limit 1) as dashboard,(select row_to_json(x) from public.fan_activity_summary x limit 1) as activity,(select count(*) from public.fan_continue_listening)::bigint as continue_listening_count,(select count(*) from public.fan_following_feed)::bigint as following_feed_count,(select count(*) from public.fan_personalized_discovery)::bigint as discovery_count where (select auth.uid()) is not null; revoke all on public.fan_workspace_v1 from public,anon; grant select on public.fan_workspace_v1 to authenticated;

-- ============================================================
-- MIGRATION 20260904041543 v3010_public_home_feed_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_home_feed_v1 with (security_invoker=true) as select m.id as mixtape_id,m.slug,m.title,m.genre,m.description,m.cover_url,m.release_date,m.featured,m.play_count,m.download_count,a.id as artist_id,a.stage_name,a.avatar_url,(select count(*) from public.tracks t where t.mixtape_id=m.id)::bigint as track_count from public.mixtapes m left join public.artists a on a.id=m.artist_id where m.status='published' order by m.featured desc,m.release_date desc nulls last,m.created_at desc; revoke all on public.public_home_feed_v1 from public; grant select on public.public_home_feed_v1 to anon,authenticated; create index if not exists mixtapes_public_home_idx on public.mixtapes(status,featured desc,release_date desc,created_at desc);

-- ============================================================
-- MIGRATION 20260904041553 v3020_api_contract_registry
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_api_contract_registry(contract_name text primary key,contract_kind text not null check(contract_kind in ('view','rpc','edge_function')),contract_version integer not null default 1,visibility text not null check(visibility in ('public','authenticated','internal')),description text,updated_at timestamptz not null default now()); alter table public.tgg_api_contract_registry enable row level security; revoke all on public.tgg_api_contract_registry from public,anon,authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values ('public_home_feed_v1','view',1,'public','Published mixtape homepage feed'),('public_release_detail_v1','view',1,'public','Published release detail'),('public_release_tracks_v1','view',1,'public','Published release tracklist'),('public_artist_profile_v1','view',1,'public','Published artist profile'),('public_videos_v1','view',1,'public','Published video feed'),('public_interviews_v1','view',1,'public','Published interview feed'),('public_merch_v1','view',1,'public','Published merch catalog'),('creator_workspace_v1','view',1,'authenticated','Creator workspace aggregate'),('fan_workspace_v1','view',1,'authenticated','Fan workspace aggregate'),('tgg_save_listening_progress','rpc',1,'authenticated','Save fan listening progress'),('tgg_toggle_release_save','rpc',1,'authenticated','Toggle release save'),('tgg_toggle_artist_follow','rpc',1,'authenticated','Toggle artist follow'),('tgg_set_release_reaction','rpc',1,'authenticated','Set release reaction'),('tgg_add_release_comment','rpc',1,'authenticated','Add release comment'),('tgg_send_message','rpc',1,'authenticated','Send conversation message') on conflict(contract_name) do update set contract_kind=excluded.contract_kind,contract_version=excluded.contract_version,visibility=excluded.visibility,description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904041657 v3030_security_advisor_autorepair
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create policy "tgg api registry deny clients" on public.tgg_api_contract_registry as restrictive for all to anon,authenticated using(false) with check(false); create or replace function public.tgg_get_public_collection(p_collection_id uuid) returns table(collection_id uuid,collection_name text,collection_description text,updated_at timestamptz,item_id uuid,mixtape_id uuid,mixtape_title text,artist_name text,cover_url text,slug text,added_at timestamptz) language sql security invoker set search_path='' as $$ select c.id,c.name,c.description,c.updated_at,i.id,i.mixtape_id,m.title,a.stage_name,m.cover_url,m.slug,i.added_at from public.fan_collections c join public.fan_collection_items i on i.collection_id=c.id join public.mixtapes m on m.id=i.mixtape_id and m.status='published' left join public.artists a on a.id=m.artist_id where c.id=p_collection_id and c.is_public=true order by i.added_at desc $$; revoke all on function public.tgg_get_public_collection(uuid) from public; grant execute on function public.tgg_get_public_collection(uuid) to anon,authenticated;

-- ============================================================
-- MIGRATION 20260904041845 v3040_notification_preferences
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.notification_preferences(user_id uuid primary key references auth.users(id) on delete cascade,follows_enabled boolean not null default true,saves_enabled boolean not null default true,reactions_enabled boolean not null default true,comments_enabled boolean not null default true,collaboration_enabled boolean not null default true,updated_at timestamptz not null default now()); alter table public.notification_preferences enable row level security; revoke all on public.notification_preferences from public,anon; grant select,insert,update on public.notification_preferences to authenticated; drop policy if exists notification_preferences_select_own on public.notification_preferences; create policy notification_preferences_select_own on public.notification_preferences for select to authenticated using(user_id=(select auth.uid())); drop policy if exists notification_preferences_insert_own on public.notification_preferences; create policy notification_preferences_insert_own on public.notification_preferences for insert to authenticated with check(user_id=(select auth.uid())); drop policy if exists notification_preferences_update_own on public.notification_preferences; create policy notification_preferences_update_own on public.notification_preferences for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid())); create or replace function public.tgg_update_notification_preferences(p_follows boolean default true,p_saves boolean default true,p_reactions boolean default true,p_comments boolean default true,p_collaboration boolean default true) returns boolean language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); begin if v_user is null then raise exception 'authentication required'; end if; insert into public.notification_preferences(user_id,follows_enabled,saves_enabled,reactions_enabled,comments_enabled,collaboration_enabled) values(v_user,coalesce(p_follows,true),coalesce(p_saves,true),coalesce(p_reactions,true),coalesce(p_comments,true),coalesce(p_collaboration,true)) on conflict(user_id) do update set follows_enabled=excluded.follows_enabled,saves_enabled=excluded.saves_enabled,reactions_enabled=excluded.reactions_enabled,comments_enabled=excluded.comments_enabled,collaboration_enabled=excluded.collaboration_enabled,updated_at=now(); return true; end $$; revoke all on function public.tgg_update_notification_preferences(boolean,boolean,boolean,boolean,boolean) from public,anon; grant execute on function public.tgg_update_notification_preferences(boolean,boolean,boolean,boolean,boolean) to authenticated; create or replace function private.tgg_create_community_notification() returns trigger language plpgsql security definer set search_path='' as $$ declare v_recipient uuid; v_title text; v_body text; v_type text; v_entity_type text; v_entity_id uuid; v_enabled boolean:=true; begin if tg_table_name='artist_follows' then select a.user_id into v_recipient from public.artists a where a.id=new.artist_id; v_type:='artist_follow';v_entity_type:='artist';v_entity_id:=new.artist_id;v_title:='New follower';v_body:='Someone followed your artist profile.'; if v_recipient is not null then select coalesce(p.follows_enabled,true) into v_enabled from public.notification_preferences p where p.user_id=v_recipient; end if; elsif tg_table_name='release_saves' then select m.user_id into v_recipient from public.mixtapes m where m.id=new.mixtape_id; v_type:='release_save';v_entity_type:='mixtape';v_entity_id:=new.mixtape_id;v_title:='Release saved';v_body:='Someone saved your release.'; if v_recipient is not null then select coalesce(p.saves_enabled,true) into v_enabled from public.notification_preferences p where p.user_id=v_recipient; end if; elsif tg_table_name='release_reactions' then select m.user_id into v_recipient from public.mixtapes m where m.id=new.mixtape_id; v_type:='release_reaction';v_entity_type:='mixtape';v_entity_id:=new.mixtape_id;v_title:='New reaction';v_body:='Someone reacted to your release.'; if v_recipient is not null then select coalesce(p.reactions_enabled,true) into v_enabled from public.notification_preferences p where p.user_id=v_recipient; end if; elsif tg_table_name='release_comments' then select m.user_id into v_recipient from public.mixtapes m where m.id=new.mixtape_id; v_type:='release_comment';v_entity_type:='comment';v_entity_id:=new.id;v_title:='New comment';v_body:='Someone commented on your release.'; if v_recipient is not null then select coalesce(p.comments_enabled,true) into v_enabled from public.notification_preferences p where p.user_id=v_recipient; end if; else return new; end if; if v_recipient is null or v_recipient=new.user_id or v_enabled=false then return new; end if; if not exists(select 1 from public.notifications n where n.recipient_id=v_recipient and n.actor_id=new.user_id and n.notification_type=v_type and n.entity_type=v_entity_type and n.entity_id=v_entity_id and n.created_at>now()-interval '10 minutes') then insert into public.notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,title,body) values(v_recipient,new.user_id,v_type,v_entity_type,v_entity_id,v_title,v_body); end if; return new; end $$; revoke all on function private.tgg_create_community_notification() from public,anon,authenticated;

-- ============================================================
-- MIGRATION 20260904041853 v3050_notification_preferences_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.notification_preferences_v1 with (security_invoker=true) as select user_id,follows_enabled,saves_enabled,reactions_enabled,comments_enabled,collaboration_enabled,updated_at from public.notification_preferences where user_id=(select auth.uid()); revoke all on public.notification_preferences_v1 from public,anon; grant select on public.notification_preferences_v1 to authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values ('notification_preferences_v1','view',1,'authenticated','Current user notification preferences'),('tgg_update_notification_preferences','rpc',1,'authenticated','Update current user notification preferences') on conflict(contract_name) do update set contract_kind=excluded.contract_kind,contract_version=excluded.contract_version,visibility=excluded.visibility,description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904041948 v3060_collaboration_actions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_create_collaboration_request(p_recipient_id uuid,p_project_title text,p_project_type text,p_note text default null) returns uuid language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_id uuid; v_title text:=btrim(coalesce(p_project_title,'')); v_type text:=btrim(coalesce(p_project_type,'')); v_note text:=nullif(btrim(coalesce(p_note,'')),''); begin if v_user is null then raise exception 'authentication required'; end if; if p_recipient_id is null or p_recipient_id=v_user then raise exception 'invalid recipient'; end if; if not exists(select 1 from auth.users u where u.id=p_recipient_id) then raise exception 'recipient unavailable'; end if; if char_length(v_title)<1 or char_length(v_title)>160 then raise exception 'project title must be 1 to 160 characters'; end if; if char_length(v_type)<1 or char_length(v_type)>80 then raise exception 'project type must be 1 to 80 characters'; end if; if v_note is not null and char_length(v_note)>2000 then raise exception 'note too long'; end if; if exists(select 1 from public.tgg_collaboration_requests r where r.sender_id=v_user and r.recipient_id=p_recipient_id and r.project_title=v_title and r.status='pending') then raise exception 'matching request already pending'; end if; insert into public.tgg_collaboration_requests(sender_id,recipient_id,project_title,project_type,note,status) values(v_user,p_recipient_id,v_title,v_type,v_note,'pending') returning id into v_id; return v_id; end $$; create or replace function public.tgg_respond_collaboration_request(p_request_id uuid,p_accept boolean) returns text language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_status text; begin if v_user is null then raise exception 'authentication required'; end if; v_status:=case when coalesce(p_accept,false) then 'accepted' else 'declined' end; update public.tgg_collaboration_requests set status=v_status,updated_at=now() where id=p_request_id and recipient_id=v_user and status='pending'; if not found then raise exception 'pending request unavailable'; end if; return v_status; end $$; create or replace function public.tgg_cancel_collaboration_request(p_request_id uuid) returns boolean language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); begin if v_user is null then raise exception 'authentication required'; end if; update public.tgg_collaboration_requests set status='cancelled',updated_at=now() where id=p_request_id and sender_id=v_user and status='pending'; return found; end $$; revoke all on function public.tgg_create_collaboration_request(uuid,text,text,text),public.tgg_respond_collaboration_request(uuid,boolean),public.tgg_cancel_collaboration_request(uuid) from public,anon; grant execute on function public.tgg_create_collaboration_request(uuid,text,text,text),public.tgg_respond_collaboration_request(uuid,boolean),public.tgg_cancel_collaboration_request(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260904041956 v3070_collaboration_notification_automation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function private.tgg_create_collaboration_notification() returns trigger language plpgsql security definer set search_path='' as $$ declare v_recipient uuid; v_actor uuid; v_title text; v_body text; v_enabled boolean:=true; begin if tg_op='INSERT' then v_recipient:=new.recipient_id; v_actor:=new.sender_id; v_title:='New collaboration request'; v_body:='You received a collaboration request for '||new.project_title||'.'; elsif tg_op='UPDATE' and old.status='pending' and new.status in ('accepted','declined') then v_recipient:=new.sender_id; v_actor:=new.recipient_id; v_title:=case new.status when 'accepted' then 'Collaboration accepted' else 'Collaboration declined' end; v_body:='Your collaboration request for '||new.project_title||' was '||new.status||'.'; else return new; end if; select coalesce(p.collaboration_enabled,true) into v_enabled from public.notification_preferences p where p.user_id=v_recipient; if v_enabled=false then return new; end if; if not exists(select 1 from public.notifications n where n.recipient_id=v_recipient and n.actor_id=v_actor and n.notification_type='collaboration_'||new.status and n.entity_id=new.id and n.created_at>now()-interval '10 minutes') then insert into public.notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,title,body) values(v_recipient,v_actor,case when tg_op='INSERT' then 'collaboration_request' else 'collaboration_'||new.status end,'collaboration',new.id,v_title,v_body); end if; return new; end $$; revoke all on function private.tgg_create_collaboration_notification() from public,anon,authenticated; drop trigger if exists tgg_collaboration_notification on public.tgg_collaboration_requests; create trigger tgg_collaboration_notification after insert or update of status on public.tgg_collaboration_requests for each row execute function private.tgg_create_collaboration_notification();

-- ============================================================
-- MIGRATION 20260904042005 v3080_collaboration_contract_registry
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values ('creator_collaboration_inbox_v1','view',1,'authenticated','Current user collaboration inbox'),('tgg_create_collaboration_request','rpc',1,'authenticated','Create collaboration request'),('tgg_respond_collaboration_request','rpc',1,'authenticated','Accept or decline incoming collaboration request'),('tgg_cancel_collaboration_request','rpc',1,'authenticated','Cancel outgoing pending collaboration request') on conflict(contract_name) do update set contract_kind=excluded.contract_kind,contract_version=excluded.contract_version,visibility=excluded.visibility,description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042101 v3090_collaboration_conversation_activation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_respond_collaboration_request(p_request_id uuid,p_accept boolean) returns text language plpgsql security definer set search_path='' as $$ declare v_user uuid:=auth.uid(); v_req public.tgg_collaboration_requests%rowtype; v_status text; v_conversation uuid; begin if v_user is null then raise exception 'authentication required'; end if; select * into v_req from public.tgg_collaboration_requests where id=p_request_id and recipient_id=v_user and status='pending' for update; if not found then raise exception 'pending request unavailable'; end if; v_status:=case when coalesce(p_accept,false) then 'accepted' else 'declined' end; if v_status='accepted' then v_conversation:=v_req.conversation_id; if v_conversation is null then insert into public.tgg_conversations(created_by,title,project_type,status) values(v_req.sender_id,v_req.project_title,v_req.project_type,'active') returning id into v_conversation; insert into public.tgg_conversation_members(conversation_id,user_id,role,last_read_at) values(v_conversation,v_req.sender_id,'member',now()),(v_conversation,v_req.recipient_id,'member',now()) on conflict do nothing; end if; end if; update public.tgg_collaboration_requests set status=v_status,conversation_id=coalesce(v_conversation,conversation_id),updated_at=now() where id=p_request_id; return v_status; end $$; revoke all on function public.tgg_respond_collaboration_request(uuid,boolean) from public,anon; grant execute on function public.tgg_respond_collaboration_request(uuid,boolean) to authenticated;

-- ============================================================
-- MIGRATION 20260904042108 v3100_messenger_thread_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.creator_message_thread_v1 with (security_invoker=true) as select m.id as message_id,m.conversation_id,m.sender_id,m.body,m.created_at from public.tgg_messages m where private.tgg_is_conversation_member(m.conversation_id); revoke all on public.creator_message_thread_v1 from public,anon; grant select on public.creator_message_thread_v1 to authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values ('creator_message_thread_v1','view',1,'authenticated','Messages for conversations the current user belongs to') on conflict(contract_name) do update set description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042115 v3110_conversation_lifecycle_actions
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_set_conversation_status(p_conversation_id uuid,p_status text) returns boolean language plpgsql set search_path='' as $$ declare v_user uuid:=auth.uid(); v_status text:=lower(btrim(coalesce(p_status,''))); v_count integer; begin if v_user is null then raise exception 'authentication required'; end if; if v_status not in ('active','archived') then raise exception 'invalid status'; end if; if not (select private.tgg_is_conversation_member(p_conversation_id)) then raise exception 'conversation unavailable'; end if; update public.tgg_conversations set status=v_status,updated_at=now() where id=p_conversation_id; get diagnostics v_count=row_count; return v_count>0; end $$; revoke all on function public.tgg_set_conversation_status(uuid,text) from public,anon; grant execute on function public.tgg_set_conversation_status(uuid,text) to authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values ('tgg_set_conversation_status','rpc',1,'authenticated','Archive or reactivate a conversation') on conflict(contract_name) do update set description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042205 v3120_public_engagement_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_release_engagement_v2 with (security_invoker=true) as select m.id as mixtape_id,(select count(*) from public.release_saves s where s.mixtape_id=m.id)::bigint as saves,(select count(*) from public.release_reactions r where r.mixtape_id=m.id and r.reaction='like')::bigint as likes,(select count(*) from public.release_reactions r where r.mixtape_id=m.id and r.reaction='fire')::bigint as fires,(select count(*) from public.release_comments c where c.mixtape_id=m.id and coalesce(c.hidden_by_creator,false)=false)::bigint as comments from public.mixtapes m where m.status='published'; revoke all on public.public_release_engagement_v2 from public; grant select on public.public_release_engagement_v2 to anon,authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values('public_release_engagement_v2','view',2,'public','Public aggregate engagement counts for published releases') on conflict(contract_name) do update set contract_version=excluded.contract_version,visibility=excluded.visibility,description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042213 v3130_public_site_sections_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_site_sections_v1 with (security_invoker=true) as select 'mixtape'::text content_type,id,title,cover_url::text image_url,release_date::timestamptz published_at,featured,slug::text destination_key from public.mixtapes where status='published' union all select 'video',id,title,thumbnail_url,publish_date,featured,id::text from public.site_videos where published=true and coalesce(status,'published')='published' union all select 'interview',id,title,image_url,publish_date,false,id::text from public.artist_interviews where published=true and coalesce(status,'published')='published' union all select 'merch',id,title,image_url,published_at,false,id::text from public.merch_products where status='published'; revoke all on public.public_site_sections_v1 from public; grant select on public.public_site_sections_v1 to anon,authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values('public_site_sections_v1','view',1,'public','Unified published content feed for homepage and discovery sections') on conflict(contract_name) do update set description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042219 v3140_frontend_bootstrap_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_frontend_bootstrap_v1 with (security_invoker=true) as select (select count(*) from public.public_home_feed_v1)::bigint as published_releases,(select count(*) from public.public_videos_v1)::bigint as published_videos,(select count(*) from public.public_interviews_v1)::bigint as published_interviews,(select count(*) from public.public_merch_v1)::bigint as published_merch,(select max(published_at) from public.public_site_sections_v1) as latest_content_at; revoke all on public.public_frontend_bootstrap_v1 from public; grant select on public.public_frontend_bootstrap_v1 to anon,authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values('public_frontend_bootstrap_v1','view',1,'public','Small public bootstrap payload for frontend health and section counts') on conflict(contract_name) do update set description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042334 v3150_public_release_bundle_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_public_release_bundle(p_release_id uuid default null,p_slug text default null) returns jsonb language sql security invoker set search_path='' stable as $$ select jsonb_build_object('release',to_jsonb(d),'tracks',coalesce((select jsonb_agg(to_jsonb(t) order by t.track_number) from public.public_release_tracks_v1 t where t.mixtape_id=d.mixtape_id),'[]'::jsonb),'engagement',coalesce((select to_jsonb(e) from public.public_release_engagement_v2 e where e.mixtape_id=d.mixtape_id),'{}'::jsonb)) from public.public_release_detail_v1 d where (p_release_id is not null and d.mixtape_id=p_release_id) or (p_release_id is null and p_slug is not null and d.slug=p_slug) limit 1 $$; revoke all on function public.tgg_get_public_release_bundle(uuid,text) from public; grant execute on function public.tgg_get_public_release_bundle(uuid,text) to anon,authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values('tgg_get_public_release_bundle','rpc',1,'public','Single-call published release detail, tracklist, and engagement bundle') on conflict(contract_name) do update set description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042343 v3160_public_artist_bundle_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_public_artist_bundle(p_artist_id uuid) returns jsonb language sql security invoker set search_path='' stable as $$ select jsonb_build_object('artist',to_jsonb(a),'releases',coalesce((select jsonb_agg(to_jsonb(r) order by r.release_date desc nulls last) from public.public_home_feed_v1 r where r.artist_id=a.artist_id),'[]'::jsonb)) from public.public_artist_profile_v1 a where a.artist_id=p_artist_id limit 1 $$; revoke all on function public.tgg_get_public_artist_bundle(uuid) from public; grant execute on function public.tgg_get_public_artist_bundle(uuid) to anon,authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values('tgg_get_public_artist_bundle','rpc',1,'public','Single-call public artist profile and published releases bundle') on conflict(contract_name) do update set description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042355 v3170_public_home_bundle_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_public_home_bundle(p_limit integer default 12) returns jsonb language sql security invoker set search_path='' stable as $$ select jsonb_build_object('bootstrap',(select to_jsonb(b) from public.public_frontend_bootstrap_v1 b limit 1),'releases',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.public_home_feed_v1 order by featured desc,release_date desc nulls last limit greatest(1,least(coalesce(p_limit,12),50))) x),'[]'::jsonb),'videos',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.public_videos_v1 order by featured desc,publish_date desc nulls last limit 12) x),'[]'::jsonb),'interviews',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.public_interviews_v1 order by publish_date desc nulls last limit 12) x),'[]'::jsonb),'merch',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.public_merch_v1 order by published_at desc nulls last limit 12) x),'[]'::jsonb)) $$; revoke all on function public.tgg_get_public_home_bundle(integer) from public; grant execute on function public.tgg_get_public_home_bundle(integer) to anon,authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values('tgg_get_public_home_bundle','rpc',1,'public','Single-call homepage bootstrap, releases, videos, interviews, and merch bundle') on conflict(contract_name) do update set description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042501 v3180_public_collection_rls_repair
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists fan_collections_select_public on public.fan_collections; create policy fan_collections_select_public on public.fan_collections for select to anon,authenticated using(is_public=true); drop policy if exists fan_collection_items_select_public on public.fan_collection_items; create policy fan_collection_items_select_public on public.fan_collection_items for select to anon,authenticated using(exists(select 1 from public.fan_collections c where c.id=fan_collection_items.collection_id and c.is_public=true) and exists(select 1 from public.mixtapes m where m.id=fan_collection_items.mixtape_id and m.status='published')); grant select on public.fan_collections,public.fan_collection_items to anon; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values('tgg_get_public_collection','rpc',2,'public','Public collection detail backed by scoped public-read RLS policies') on conflict(contract_name) do update set contract_version=excluded.contract_version,visibility=excluded.visibility,description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042512 v3190_public_collection_summary_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.public_collection_summary_v1 with (security_invoker=true) as select c.id as collection_id,c.name,c.description,c.updated_at,count(i.id)::bigint as item_count from public.fan_collections c left join public.fan_collection_items i on i.collection_id=c.id where c.is_public=true group by c.id,c.name,c.description,c.updated_at; revoke all on public.public_collection_summary_v1 from public; grant select on public.public_collection_summary_v1 to anon,authenticated; insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description) values('public_collection_summary_v1','view',1,'public','Public collection metadata and published-item counts') on conflict(contract_name) do update set description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904042557 v3200_public_collection_rls_dependency_repair
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists fan_collection_items_select_public on public.fan_collection_items; create policy fan_collection_items_select_public on public.fan_collection_items for select to anon,authenticated using(exists(select 1 from public.fan_collections c where c.id=fan_collection_items.collection_id and c.is_public=true));

-- ============================================================
-- MIGRATION 20260904042845 v3210_collaboration_security_repair
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_respond_collaboration_request(p_request_id uuid,p_accept boolean) returns text language plpgsql security invoker set search_path='' as $$ declare v_user uuid:=auth.uid(); v_req public.tgg_collaboration_requests%rowtype; v_status text; v_conversation uuid; begin if v_user is null then raise exception 'authentication required'; end if; select * into v_req from public.tgg_collaboration_requests where id=p_request_id and recipient_id=v_user and status='pending' for update; if not found then raise exception 'pending request unavailable'; end if; v_status:=case when coalesce(p_accept,false) then 'accepted' else 'declined' end; if v_status='accepted' then v_conversation:=v_req.conversation_id; if v_conversation is null then insert into public.tgg_conversations(created_by,title,project_type,status) values(v_user,v_req.project_title,v_req.project_type,'active') returning id into v_conversation; insert into public.tgg_conversation_members(conversation_id,user_id,role,last_read_at) values(v_conversation,v_user,'member',now()),(v_conversation,v_req.sender_id,'member',now()) on conflict do nothing; end if; end if; update public.tgg_collaboration_requests set status=v_status,conversation_id=coalesce(v_conversation,conversation_id),updated_at=now() where id=p_request_id and recipient_id=v_user and status='pending'; if not found then raise exception 'pending request unavailable'; end if; return v_status; end $$; revoke all on function public.tgg_respond_collaboration_request(uuid,boolean) from public,anon; grant execute on function public.tgg_respond_collaboration_request(uuid,boolean) to authenticated;

-- ============================================================
-- MIGRATION 20260904042927 v3220_collection_policy_performance_repair
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists fan_collections_select_own on public.fan_collections; drop policy if exists fan_collections_select_public on public.fan_collections; create policy fan_collections_select_authenticated on public.fan_collections for select to authenticated using(user_id=(select auth.uid()) or is_public=true); create policy fan_collections_select_anon_public on public.fan_collections for select to anon using(is_public=true); drop policy if exists fan_collection_items_select_own on public.fan_collection_items; drop policy if exists fan_collection_items_select_public on public.fan_collection_items; create policy fan_collection_items_select_authenticated on public.fan_collection_items for select to authenticated using(exists(select 1 from public.fan_collections c where c.id=fan_collection_items.collection_id and (c.user_id=(select auth.uid()) or c.is_public=true))); create policy fan_collection_items_select_anon_public on public.fan_collection_items for select to anon using(exists(select 1 from public.fan_collections c where c.id=fan_collection_items.collection_id and c.is_public=true));

-- ============================================================
-- MIGRATION 20260904044308 v3250_account_workspace_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_account_workspace_bundle(p_notification_limit integer default 12)
returns jsonb
language sql
security invoker
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'creator_workspace', (select to_jsonb(c) from public.creator_workspace_v1 c limit 1),
    'fan_workspace', (select to_jsonb(f) from public.fan_workspace_v1 f limit 1),
    'notification_summary', (select to_jsonb(s) from public.user_notification_summary s where s.user_id = (select auth.uid()) limit 1),
    'notification_preferences', (select to_jsonb(p) from public.notification_preferences_v1 p limit 1),
    'notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from (
        select id, notification_type, entity_type, entity_id, title, body, read_at, created_at
        from public.notifications
        where recipient_id = (select auth.uid())
        order by created_at desc
        limit greatest(1, least(coalesce(p_notification_limit,12),50))
      ) n
    ), '[]'::jsonb)
  )
  where (select auth.uid()) is not null;
$$;
revoke all on function public.tgg_get_account_workspace_bundle(integer) from public, anon;
grant execute on function public.tgg_get_account_workspace_bundle(integer) to authenticated;
insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description,updated_at)
values('tgg_get_account_workspace_bundle','rpc',1,'authenticated','One-call authenticated creator/fan workspace, notification summary, preferences, and recent notifications bundle.',now())
on conflict(contract_name) do update set contract_kind=excluded.contract_kind,contract_version=excluded.contract_version,visibility=excluded.visibility,description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904044432 v3260_account_workspace_action_contracts
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

insert into public.tgg_api_contract_registry(contract_name,contract_kind,contract_version,visibility,description,updated_at)
values
('tgg_mark_notification_read','rpc',1,'authenticated','Mark one current-user notification as read.',now()),
('tgg_mark_all_notifications_read','rpc',1,'authenticated','Mark all current-user notifications as read.',now()),
('tgg_create_fan_collection','rpc',1,'authenticated','Create a fan collection.',now()),
('tgg_toggle_collection_item','rpc',1,'authenticated','Toggle a published release in a fan collection.',now()),
('tgg_set_collection_visibility','rpc',1,'authenticated','Set current-user collection public/private visibility.',now()),
('tgg_delete_own_release_comment','rpc',1,'authenticated','Delete the current user own release comment.',now())
on conflict(contract_name) do update set contract_kind=excluded.contract_kind,contract_version=excluded.contract_version,visibility=excluded.visibility,description=excluded.description,updated_at=now();

-- ============================================================
-- MIGRATION 20260904050950 v3300_social_studio_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create table if not exists public.tgg_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  story_type text not null default 'text' check (story_type in ('text','image','video','audio','release','collab','live')),
  caption text,
  media_url text,
  linked_release_id uuid references public.mixtapes(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint tgg_stories_caption_len check (caption is null or char_length(caption) <= 1000)
);

create index if not exists tgg_stories_user_created_idx on public.tgg_stories(user_id, created_at desc);
create index if not exists tgg_stories_expires_idx on public.tgg_stories(expires_at desc);

alter table public.tgg_stories enable row level security;
drop policy if exists tgg_stories_public_read_active on public.tgg_stories;
create policy tgg_stories_public_read_active on public.tgg_stories
for select to anon, authenticated
using (expires_at > now());
drop policy if exists tgg_stories_insert_own on public.tgg_stories;
create policy tgg_stories_insert_own on public.tgg_stories
for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists tgg_stories_update_own on public.tgg_stories;
create policy tgg_stories_update_own on public.tgg_stories
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists tgg_stories_delete_own on public.tgg_stories;
create policy tgg_stories_delete_own on public.tgg_stories
for delete to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.tgg_story_views (
  story_id uuid not null references public.tgg_stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
alter table public.tgg_story_views enable row level security;
drop policy if exists tgg_story_views_insert_own on public.tgg_story_views;
create policy tgg_story_views_insert_own on public.tgg_story_views
for insert to authenticated
with check ((select auth.uid()) = viewer_id);
drop policy if exists tgg_story_views_select_related on public.tgg_story_views;
create policy tgg_story_views_select_related on public.tgg_story_views
for select to authenticated
using (
  (select auth.uid()) = viewer_id
  or exists (select 1 from public.tgg_stories s where s.id = story_id and s.user_id = (select auth.uid()))
);

create table if not exists public.tgg_story_reactions (
  story_id uuid not null references public.tgg_stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like','fire','heart','laugh','wow')),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
alter table public.tgg_story_reactions enable row level security;
drop policy if exists tgg_story_reactions_read on public.tgg_story_reactions;
create policy tgg_story_reactions_read on public.tgg_story_reactions
for select to authenticated
using (true);
drop policy if exists tgg_story_reactions_insert_own on public.tgg_story_reactions;
create policy tgg_story_reactions_insert_own on public.tgg_story_reactions
for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists tgg_story_reactions_update_own on public.tgg_story_reactions;
create policy tgg_story_reactions_update_own on public.tgg_story_reactions
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists tgg_story_reactions_delete_own on public.tgg_story_reactions;
create policy tgg_story_reactions_delete_own on public.tgg_story_reactions
for delete to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.tgg_studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  bpm numeric(6,2) not null default 120,
  musical_key text,
  status text not null default 'draft' check (status in ('draft','recording','mixing','mastering','complete','archived')),
  project_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tgg_studio_projects_title_len check (char_length(title) between 1 and 160),
  constraint tgg_studio_projects_bpm_range check (bpm between 20 and 400)
);
create index if not exists tgg_studio_projects_user_updated_idx on public.tgg_studio_projects(user_id, updated_at desc);
alter table public.tgg_studio_projects enable row level security;
drop policy if exists tgg_studio_projects_own_all on public.tgg_studio_projects;
create policy tgg_studio_projects_own_all on public.tgg_studio_projects
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.tgg_studio_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null check (asset_type in ('recording','sample','loop','stem','beat','mix','master','image','other')),
  name text not null,
  source_url text,
  storage_path text,
  license_name text,
  license_url text,
  source_name text,
  source_item_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tgg_studio_assets_name_len check (char_length(name) between 1 and 240)
);
create index if not exists tgg_studio_assets_project_created_idx on public.tgg_studio_assets(project_id, created_at desc);
alter table public.tgg_studio_assets enable row level security;
drop policy if exists tgg_studio_assets_own_all on public.tgg_studio_assets;
create policy tgg_studio_assets_own_all on public.tgg_studio_assets
for all to authenticated
using ((select auth.uid()) = user_id and exists (select 1 from public.tgg_studio_projects p where p.id = project_id and p.user_id = (select auth.uid())))
with check ((select auth.uid()) = user_id and exists (select 1 from public.tgg_studio_projects p where p.id = project_id and p.user_id = (select auth.uid())));

create or replace view public.active_stories_v1
with (security_invoker=true) as
select
  s.id,
  s.user_id,
  coalesce(a.stage_name, 'TGG User') as display_name,
  a.avatar_url,
  s.story_type,
  s.caption,
  s.media_url,
  s.linked_release_id,
  s.created_at,
  s.expires_at
from public.tgg_stories s
left join public.artists a on a.user_id = s.user_id
where s.expires_at > now()
order by s.created_at desc;

grant select on public.active_stories_v1 to anon, authenticated;
grant select on public.tgg_stories to anon, authenticated;
grant insert, update, delete on public.tgg_stories to authenticated;
grant select, insert on public.tgg_story_views to authenticated;
grant select, insert, update, delete on public.tgg_story_reactions to authenticated;
grant select, insert, update, delete on public.tgg_studio_projects to authenticated;
grant select, insert, update, delete on public.tgg_studio_assets to authenticated;
revoke all on public.tgg_story_views from anon;
revoke all on public.tgg_story_reactions from anon;
revoke all on public.tgg_studio_projects from anon;
revoke all on public.tgg_studio_assets from anon;

commit;

-- ============================================================
-- MIGRATION 20260904051308 v3310_creative_hub_video_studio_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create table if not exists public.tgg_creative_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_type text not null check (project_type in ('audio','beat','video','cover','campaign')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text,
  status text not null default 'draft' check (status in ('draft','active','archived','published')),
  aspect_ratio text,
  duration_seconds numeric,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_media_vault_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references public.tgg_creative_projects(id) on delete set null,
  asset_type text not null check (asset_type in ('audio','video','image','font','caption','other')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  source_kind text not null default 'upload' check (source_kind in ('upload','recording','generated','licensed','external')),
  storage_path text,
  public_url text,
  mime_type text,
  duration_seconds numeric,
  width integer,
  height integer,
  file_size_bytes bigint,
  source_url text,
  license_code text,
  attribution_text text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tgg_creative_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_creative_projects(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  version_number integer not null check (version_number > 0),
  label text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id, version_number)
);

create table if not exists public.tgg_video_timeline_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_creative_projects(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  asset_id uuid references public.tgg_media_vault_assets(id) on delete set null,
  track_index integer not null default 0 check (track_index >= 0),
  item_type text not null check (item_type in ('video','audio','image','text','caption','overlay')),
  start_seconds numeric not null default 0 check (start_seconds >= 0),
  duration_seconds numeric not null default 0 check (duration_seconds >= 0),
  source_in_seconds numeric not null default 0 check (source_in_seconds >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tgg_creative_projects_user_updated_idx on public.tgg_creative_projects(user_id, updated_at desc);
create index if not exists tgg_media_vault_assets_user_created_idx on public.tgg_media_vault_assets(user_id, created_at desc);
create index if not exists tgg_creative_versions_project_idx on public.tgg_creative_versions(project_id, version_number desc);
create index if not exists tgg_video_timeline_items_project_track_idx on public.tgg_video_timeline_items(project_id, track_index, start_seconds);

alter table public.tgg_creative_projects enable row level security;
alter table public.tgg_media_vault_assets enable row level security;
alter table public.tgg_creative_versions enable row level security;
alter table public.tgg_video_timeline_items enable row level security;

drop policy if exists tgg_creative_projects_own on public.tgg_creative_projects;
create policy tgg_creative_projects_own on public.tgg_creative_projects for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists tgg_media_vault_assets_own on public.tgg_media_vault_assets;
create policy tgg_media_vault_assets_own on public.tgg_media_vault_assets for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists tgg_creative_versions_own on public.tgg_creative_versions;
create policy tgg_creative_versions_own on public.tgg_creative_versions for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists tgg_video_timeline_items_own on public.tgg_video_timeline_items;
create policy tgg_video_timeline_items_own on public.tgg_video_timeline_items for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.tgg_creative_projects from anon;
revoke all on public.tgg_media_vault_assets from anon;
revoke all on public.tgg_creative_versions from anon;
revoke all on public.tgg_video_timeline_items from anon;

grant select, insert, update, delete on public.tgg_creative_projects to authenticated;
grant select, insert, update, delete on public.tgg_media_vault_assets to authenticated;
grant select, insert, update, delete on public.tgg_creative_versions to authenticated;
grant select, insert, update, delete on public.tgg_video_timeline_items to authenticated;

commit;

-- ============================================================
-- MIGRATION 20260904051719 v3320_music_social_rooms_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tgg_playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.tgg_playlists(id) on delete cascade,
  mixtape_id uuid not null references public.mixtapes(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  unique(playlist_id, track_id)
);
create table if not exists public.tgg_call_rooms (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.tgg_conversations(id) on delete set null,
  title text,
  room_type text not null default 'video' check (room_type in ('audio','video','listening','studio','drop')),
  status text not null default 'open' check (status in ('open','active','ended')),
  is_group boolean not null default false,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create table if not exists public.tgg_call_participants (
  room_id uuid not null references public.tgg_call_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  mic_enabled boolean not null default true,
  camera_enabled boolean not null default true,
  primary key(room_id,user_id)
);

alter table public.tgg_playlists enable row level security;
alter table public.tgg_playlist_items enable row level security;
alter table public.tgg_call_rooms enable row level security;
alter table public.tgg_call_participants enable row level security;

drop policy if exists tgg_playlists_owner_all on public.tgg_playlists;
create policy tgg_playlists_owner_all on public.tgg_playlists for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists tgg_playlist_items_owner_all on public.tgg_playlist_items;
create policy tgg_playlist_items_owner_all on public.tgg_playlist_items for all to authenticated using (exists(select 1 from public.tgg_playlists p where p.id=playlist_id and p.user_id=(select auth.uid()))) with check (exists(select 1 from public.tgg_playlists p where p.id=playlist_id and p.user_id=(select auth.uid())));
drop policy if exists tgg_call_rooms_member_select on public.tgg_call_rooms;
create policy tgg_call_rooms_member_select on public.tgg_call_rooms for select to authenticated using (created_by=(select auth.uid()) or exists(select 1 from public.tgg_call_participants cp where cp.room_id=id and cp.user_id=(select auth.uid())));
drop policy if exists tgg_call_rooms_creator_insert on public.tgg_call_rooms;
create policy tgg_call_rooms_creator_insert on public.tgg_call_rooms for insert to authenticated with check (created_by=(select auth.uid()));
drop policy if exists tgg_call_rooms_creator_update on public.tgg_call_rooms;
create policy tgg_call_rooms_creator_update on public.tgg_call_rooms for update to authenticated using (created_by=(select auth.uid())) with check (created_by=(select auth.uid()));
drop policy if exists tgg_call_participants_member_select on public.tgg_call_participants;
create policy tgg_call_participants_member_select on public.tgg_call_participants for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from public.tgg_call_rooms r where r.id=room_id and r.created_by=(select auth.uid())));
drop policy if exists tgg_call_participants_self_insert on public.tgg_call_participants;
create policy tgg_call_participants_self_insert on public.tgg_call_participants for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists tgg_call_participants_self_update on public.tgg_call_participants;
create policy tgg_call_participants_self_update on public.tgg_call_participants for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

grant select,insert,update,delete on public.tgg_playlists to authenticated;
grant select,insert,update,delete on public.tgg_playlist_items to authenticated;
grant select,insert,update on public.tgg_call_rooms to authenticated;
grant select,insert,update on public.tgg_call_participants to authenticated;
revoke all on public.tgg_playlists, public.tgg_playlist_items, public.tgg_call_rooms, public.tgg_call_participants from anon;

create index if not exists tgg_playlists_user_idx on public.tgg_playlists(user_id,updated_at desc);
create index if not exists tgg_playlist_items_playlist_idx on public.tgg_playlist_items(playlist_id,position,added_at);
create index if not exists tgg_call_rooms_conversation_idx on public.tgg_call_rooms(conversation_id,created_at desc);
create index if not exists tgg_call_participants_user_idx on public.tgg_call_participants(user_id,joined_at desc);

-- ============================================================
-- MIGRATION 20260904051908 v3321_webrtc_room_signaling
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_call_signals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.tgg_call_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice','hangup')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.tgg_call_signals enable row level security;
drop policy if exists tgg_call_signals_members_select on public.tgg_call_signals;
create policy tgg_call_signals_members_select on public.tgg_call_signals for select to authenticated using (
  exists(select 1 from public.tgg_call_participants cp where cp.room_id=tgg_call_signals.room_id and cp.user_id=(select auth.uid()))
  and (recipient_id is null or recipient_id=(select auth.uid()) or sender_id=(select auth.uid()))
);
drop policy if exists tgg_call_signals_members_insert on public.tgg_call_signals;
create policy tgg_call_signals_members_insert on public.tgg_call_signals for insert to authenticated with check (
  sender_id=(select auth.uid()) and exists(select 1 from public.tgg_call_participants cp where cp.room_id=tgg_call_signals.room_id and cp.user_id=(select auth.uid()))
);
grant select,insert,delete on public.tgg_call_signals to authenticated;
revoke all on public.tgg_call_signals from anon;
create index if not exists tgg_call_signals_room_created_idx on public.tgg_call_signals(room_id,created_at);

create or replace function public.tgg_start_call_room(p_conversation_id uuid, p_room_type text default 'video')
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare v_uid uuid := auth.uid(); v_room uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_room_type not in ('audio','video','listening','studio','drop') then raise exception 'Invalid room type'; end if;
  if not exists(select 1 from public.tgg_conversation_members m where m.conversation_id=p_conversation_id and m.user_id=v_uid) then raise exception 'Not a conversation member'; end if;
  insert into public.tgg_call_rooms(created_by,conversation_id,title,room_type,status,is_group)
  select v_uid,p_conversation_id,coalesce(c.title,'TGG Room'),p_room_type,'active',
         (select count(*)>2 from public.tgg_conversation_members m where m.conversation_id=p_conversation_id)
  from public.tgg_conversations c where c.id=p_conversation_id returning id into v_room;
  insert into public.tgg_call_participants(room_id,user_id,mic_enabled,camera_enabled)
  select v_room,m.user_id,true,(p_room_type<>'audio') from public.tgg_conversation_members m where m.conversation_id=p_conversation_id
  on conflict(room_id,user_id) do nothing;
  return v_room;
end;$$;
grant execute on function public.tgg_start_call_room(uuid,text) to authenticated;
revoke execute on function public.tgg_start_call_room(uuid,text) from anon;

create or replace function public.tgg_end_call_room(p_room_id uuid)
returns boolean
language plpgsql
security invoker
set search_path=public
as $$
begin
  update public.tgg_call_rooms set status='ended',ended_at=now() where id=p_room_id and created_by=auth.uid() and status<>'ended';
  return found;
end;$$;
grant execute on function public.tgg_end_call_room(uuid) to authenticated;
revoke execute on function public.tgg_end_call_room(uuid) from anon;

-- ============================================================
-- MIGRATION 20260904051928 v3322_call_participant_room_visibility
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists tgg_call_participants_member_select on public.tgg_call_participants;
create policy tgg_call_participants_member_select on public.tgg_call_participants for select to authenticated using (
  exists(select 1 from public.tgg_call_participants me where me.room_id=tgg_call_participants.room_id and me.user_id=(select auth.uid()))
);


-- ============================================================
-- MIGRATION 20260904052324 v3330_shorts_social_feed
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_shorts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  caption text,
  media_url text not null,
  thumbnail_url text,
  linked_release_id uuid references public.mixtapes(id) on delete set null,
  visibility text not null default 'public' check (visibility in ('public','followers','private')),
  status text not null default 'published' check (status in ('draft','published','archived')),
  duration_seconds numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_short_reactions (
  short_id uuid not null references public.tgg_shorts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'fire' check (reaction in ('like','fire')),
  created_at timestamptz not null default now(),
  primary key(short_id,user_id)
);

alter table public.tgg_shorts enable row level security;
alter table public.tgg_short_reactions enable row level security;

drop policy if exists tgg_shorts_public_read on public.tgg_shorts;
create policy tgg_shorts_public_read on public.tgg_shorts for select to anon, authenticated
using (status='published' and visibility='public' or user_id=(select auth.uid()));

drop policy if exists tgg_shorts_owner_insert on public.tgg_shorts;
create policy tgg_shorts_owner_insert on public.tgg_shorts for insert to authenticated
with check (user_id=(select auth.uid()));

drop policy if exists tgg_shorts_owner_update on public.tgg_shorts;
create policy tgg_shorts_owner_update on public.tgg_shorts for update to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists tgg_shorts_owner_delete on public.tgg_shorts;
create policy tgg_shorts_owner_delete on public.tgg_shorts for delete to authenticated
using (user_id=(select auth.uid()));

drop policy if exists tgg_short_reactions_public_read on public.tgg_short_reactions;
create policy tgg_short_reactions_public_read on public.tgg_short_reactions for select to anon, authenticated using (true);

drop policy if exists tgg_short_reactions_self_insert on public.tgg_short_reactions;
create policy tgg_short_reactions_self_insert on public.tgg_short_reactions for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.tgg_shorts s where s.id=short_id and s.status='published' and s.visibility='public'));

drop policy if exists tgg_short_reactions_self_update on public.tgg_short_reactions;
create policy tgg_short_reactions_self_update on public.tgg_short_reactions for update to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists tgg_short_reactions_self_delete on public.tgg_short_reactions;
create policy tgg_short_reactions_self_delete on public.tgg_short_reactions for delete to authenticated
using (user_id=(select auth.uid()));

grant select on public.tgg_shorts, public.tgg_short_reactions to anon;
grant select,insert,update,delete on public.tgg_shorts, public.tgg_short_reactions to authenticated;

create index if not exists tgg_shorts_public_feed_idx on public.tgg_shorts(status,visibility,created_at desc);
create index if not exists tgg_shorts_user_idx on public.tgg_shorts(user_id,created_at desc);
create index if not exists tgg_short_reactions_short_idx on public.tgg_short_reactions(short_id,created_at desc);

create or replace view public.public_shorts_v1 with (security_invoker=true) as
select s.id,s.user_id,s.caption,s.media_url,s.thumbnail_url,s.linked_release_id,s.duration_seconds,s.created_at,
       coalesce(a.stage_name,'TGG Creator') as creator_name,
       count(r.user_id) filter (where r.reaction='like')::bigint as likes,
       count(r.user_id) filter (where r.reaction='fire')::bigint as fires
from public.tgg_shorts s
left join public.artists a on a.user_id=s.user_id
left join public.tgg_short_reactions r on r.short_id=s.id
where s.status='published' and s.visibility='public'
group by s.id,a.stage_name;

grant select on public.public_shorts_v1 to anon, authenticated;

-- ============================================================
-- MIGRATION 20260904053459 v3340_supporters_games_artist_world_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_membership_tiers (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  benefits jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tgg_memberships (
  id uuid primary key default gen_random_uuid(),
  tier_id uuid not null references public.tgg_membership_tiers(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  fan_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','paused','canceled','expired')),
  started_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, fan_user_id)
);
create table if not exists public.tgg_vault_items (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  item_type text not null default 'post' check (item_type in ('post','audio','video','image','file','early_release')),
  media_url text,
  min_tier_id uuid references public.tgg_membership_tiers(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.tgg_games (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  artist_id uuid references public.artists(id) on delete set null,
  room_id uuid references public.tgg_call_rooms(id) on delete set null,
  game_type text not null check (game_type in ('music_bingo','trivia','name_that_track','finish_the_lyric','beat_battle','song_battle','karaoke','beat_roulette','freestyle_roulette')),
  title text not null check (char_length(title) between 1 and 160),
  status text not null default 'draft' check (status in ('draft','open','live','ended')),
  settings jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.tgg_game_players (
  game_id uuid not null references public.tgg_games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0,
  state jsonb not null default '{}'::jsonb,
  joined_at timestamptz not null default now(),
  primary key (game_id,user_id)
);
create table if not exists public.tgg_artist_world_settings (
  artist_id uuid primary key references public.artists(id) on delete cascade,
  sections jsonb not null default '["music","shorts","stories","live","vault","fan_club","store","events","rooms","community","about"]'::jsonb,
  accent text,
  hero_url text,
  welcome_message text,
  updated_at timestamptz not null default now()
);

alter table public.tgg_membership_tiers enable row level security;
alter table public.tgg_memberships enable row level security;
alter table public.tgg_vault_items enable row level security;
alter table public.tgg_games enable row level security;
alter table public.tgg_game_players enable row level security;
alter table public.tgg_artist_world_settings enable row level security;

create policy "tiers public read" on public.tgg_membership_tiers for select to anon, authenticated using (is_active = true or exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
create policy "tiers artist manage" on public.tgg_membership_tiers for all to authenticated using (exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid()))) with check (exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
create policy "memberships own read" on public.tgg_memberships for select to authenticated using (fan_user_id=(select auth.uid()) or exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
create policy "memberships fan insert" on public.tgg_memberships for insert to authenticated with check (fan_user_id=(select auth.uid()));
create policy "memberships fan update" on public.tgg_memberships for update to authenticated using (fan_user_id=(select auth.uid())) with check (fan_user_id=(select auth.uid()));
create policy "vault artist manage" on public.tgg_vault_items for all to authenticated using (exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid()))) with check (exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
create policy "vault member read" on public.tgg_vault_items for select to authenticated using (exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())) or exists (select 1 from public.tgg_memberships m where m.artist_id=tgg_vault_items.artist_id and m.fan_user_id=(select auth.uid()) and m.status='active'));
create policy "games read" on public.tgg_games for select to authenticated using (status in ('open','live','ended') or created_by=(select auth.uid()));
create policy "games create" on public.tgg_games for insert to authenticated with check (created_by=(select auth.uid()));
create policy "games creator update" on public.tgg_games for update to authenticated using (created_by=(select auth.uid())) with check (created_by=(select auth.uid()));
create policy "game players read" on public.tgg_game_players for select to authenticated using (exists (select 1 from public.tgg_games g where g.id=game_id and (g.status in ('open','live','ended') or g.created_by=(select auth.uid()))));
create policy "game players join" on public.tgg_game_players for insert to authenticated with check (user_id=(select auth.uid()));
create policy "game players self update" on public.tgg_game_players for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "artist world public read" on public.tgg_artist_world_settings for select to anon, authenticated using (true);
create policy "artist world manage" on public.tgg_artist_world_settings for all to authenticated using (exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid()))) with check (exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));

grant select on public.tgg_membership_tiers, public.tgg_artist_world_settings to anon;
grant select,insert,update,delete on public.tgg_membership_tiers, public.tgg_memberships, public.tgg_vault_items, public.tgg_games, public.tgg_game_players, public.tgg_artist_world_settings to authenticated;
revoke all on public.tgg_memberships, public.tgg_vault_items, public.tgg_games, public.tgg_game_players from anon;
create index if not exists tgg_membership_tiers_artist_idx on public.tgg_membership_tiers(artist_id,is_active);
create index if not exists tgg_memberships_fan_idx on public.tgg_memberships(fan_user_id,status);
create index if not exists tgg_memberships_artist_idx on public.tgg_memberships(artist_id,status);
create index if not exists tgg_vault_artist_idx on public.tgg_vault_items(artist_id,published_at desc);
create index if not exists tgg_games_status_idx on public.tgg_games(status,starts_at);


-- ============================================================
-- MIGRATION 20260904053700 v3341_music_id_scenes_programs_command_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_song_workspaces (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  status text not null default 'idea' check (status in ('idea','writing','recording','mixing','mastering','ready','released','archived')),
  bpm numeric,
  musical_key text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tgg_music_ids (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.tgg_song_workspaces(id) on delete set null,
  artist_id uuid not null references public.artists(id) on delete cascade,
  mixtape_id uuid references public.mixtapes(id) on delete set null,
  track_id uuid references public.tracks(id) on delete set null,
  canonical_title text not null,
  credits jsonb not null default '[]'::jsonb,
  lyrics text,
  artwork_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tgg_scenes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  region text,
  country text not null default 'US',
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.tgg_scene_memberships (
  scene_id uuid not null references public.tgg_scenes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','artist','dj','producer','host','moderator')),
  joined_at timestamptz not null default now(),
  primary key(scene_id,user_id)
);
create table if not exists public.tgg_programs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  artist_id uuid references public.artists(id) on delete set null,
  room_id uuid references public.tgg_call_rooms(id) on delete set null,
  scene_id uuid references public.tgg_scenes(id) on delete set null,
  program_type text not null check (program_type in ('open_mic','battle','tv','radio_show','listening_club','cypher','karaoke','demo_review','session','festival')),
  title text not null check (char_length(title) between 1 and 180),
  description text,
  status text not null default 'draft' check (status in ('draft','scheduled','live','ended','canceled')),
  starts_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tgg_command_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('task','idea','alert','campaign','release','collab','content','event')),
  title text not null,
  details text,
  status text not null default 'open' check (status in ('open','in_progress','done','dismissed')),
  priority integer not null default 0,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_song_workspaces enable row level security;
alter table public.tgg_music_ids enable row level security;
alter table public.tgg_scenes enable row level security;
alter table public.tgg_scene_memberships enable row level security;
alter table public.tgg_programs enable row level security;
alter table public.tgg_command_items enable row level security;

create policy "song workspace owner" on public.tgg_song_workspaces for all to authenticated using (created_by=(select auth.uid())) with check (created_by=(select auth.uid()) and exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
create policy "music ids public read" on public.tgg_music_ids for select to anon, authenticated using (true);
create policy "music ids artist manage" on public.tgg_music_ids for all to authenticated using (exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid()))) with check (exists (select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
create policy "scenes public read" on public.tgg_scenes for select to anon, authenticated using (is_active=true);
create policy "scene memberships read" on public.tgg_scene_memberships for select to authenticated using (true);
create policy "scene memberships self insert" on public.tgg_scene_memberships for insert to authenticated with check (user_id=(select auth.uid()));
create policy "scene memberships self delete" on public.tgg_scene_memberships for delete to authenticated using (user_id=(select auth.uid()));
create policy "programs public read" on public.tgg_programs for select to anon, authenticated using (status in ('scheduled','live','ended') or created_by=(select auth.uid()));
create policy "programs creator manage" on public.tgg_programs for all to authenticated using (created_by=(select auth.uid())) with check (created_by=(select auth.uid()));
create policy "command own" on public.tgg_command_items for all to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

grant select on public.tgg_music_ids, public.tgg_scenes, public.tgg_programs to anon;
grant select,insert,update,delete on public.tgg_song_workspaces, public.tgg_music_ids, public.tgg_scene_memberships, public.tgg_programs, public.tgg_command_items to authenticated;
grant select on public.tgg_scenes to authenticated;
create index if not exists tgg_song_workspaces_owner_idx on public.tgg_song_workspaces(created_by,status,updated_at desc);
create index if not exists tgg_music_ids_artist_idx on public.tgg_music_ids(artist_id,updated_at desc);
create index if not exists tgg_scene_memberships_user_idx on public.tgg_scene_memberships(user_id,joined_at desc);
create index if not exists tgg_programs_status_idx on public.tgg_programs(status,starts_at);
create index if not exists tgg_programs_scene_idx on public.tgg_programs(scene_id,starts_at);
create index if not exists tgg_command_items_user_idx on public.tgg_command_items(user_id,status,priority desc,created_at desc);

-- ============================================================
-- MIGRATION 20260904054232 v3350_monetization_live_events_rewards_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

alter table public.tgg_membership_tiers add column if not exists stripe_product_id text, add column if not exists stripe_price_id text;
alter table public.tgg_memberships add column if not exists stripe_customer_id text, add column if not exists stripe_subscription_id text, add column if not exists cancel_at_period_end boolean not null default false;
alter table public.artists add column if not exists stripe_account_id text, add column if not exists stripe_onboarding_complete boolean not null default false, add column if not exists payouts_enabled boolean not null default false;

create table if not exists public.tgg_support_transactions (
 id uuid primary key default gen_random_uuid(), fan_user_id uuid references auth.users(id) on delete set null, artist_id uuid not null references public.artists(id) on delete cascade,
 transaction_type text not null check(transaction_type in ('membership','tip','drop','merch','ticket','digital_product')), amount_cents integer not null check(amount_cents>0), currency text not null default 'usd', platform_fee_cents integer not null default 0,
 stripe_checkout_session_id text, stripe_payment_intent_id text, stripe_subscription_id text, status text not null default 'pending' check(status in ('pending','paid','failed','refunded','disputed')), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), paid_at timestamptz
);
create table if not exists public.tgg_live_events (
 id uuid primary key default gen_random_uuid(), host_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete set null, room_id uuid references public.tgg_call_rooms(id) on delete set null,
 title text not null check(char_length(title) between 1 and 160), live_type text not null default 'live' check(live_type in ('live','premiere','open_mic','battle','game_night','listening_party','studio_window','radio_show','afterparty')),
 access_level text not null default 'everyone' check(access_level in ('everyone','followers','supporters','vip','invite_only')), status text not null default 'scheduled' check(status in ('scheduled','live','ended','canceled')), scheduled_at timestamptz, started_at timestamptz, ended_at timestamptz, settings jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.tgg_events (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete set null, title text not null, description text, venue_name text, city text, region text, country text default 'US', starts_at timestamptz, ends_at timestamptz, event_type text not null default 'show' check(event_type in ('show','festival','release_party','game_night','open_mic','battle','meetup','virtual')), ticket_url text, status text not null default 'draft' check(status in ('draft','published','ended','canceled')), created_at timestamptz not null default now()
);
create table if not exists public.tgg_user_xp (
 user_id uuid primary key references auth.users(id) on delete cascade, xp bigint not null default 0, level integer not null default 1, updated_at timestamptz not null default now()
);
create table if not exists public.tgg_achievements (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, description text, icon text, xp_reward integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.tgg_user_achievements (
 user_id uuid not null references auth.users(id) on delete cascade, achievement_id uuid not null references public.tgg_achievements(id) on delete cascade, earned_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb, primary key(user_id,achievement_id)
);

alter table public.tgg_support_transactions enable row level security; alter table public.tgg_live_events enable row level security; alter table public.tgg_events enable row level security; alter table public.tgg_user_xp enable row level security; alter table public.tgg_achievements enable row level security; alter table public.tgg_user_achievements enable row level security;
create policy "support transaction parties read" on public.tgg_support_transactions for select to authenticated using(fan_user_id=(select auth.uid()) or exists(select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
create policy "live public read" on public.tgg_live_events for select to anon,authenticated using(access_level='everyone' or host_user_id=(select auth.uid()));
create policy "live host manage" on public.tgg_live_events for all to authenticated using(host_user_id=(select auth.uid())) with check(host_user_id=(select auth.uid()));
create policy "events public read" on public.tgg_events for select to anon,authenticated using(status='published' or created_by=(select auth.uid()));
create policy "events creator manage" on public.tgg_events for all to authenticated using(created_by=(select auth.uid())) with check(created_by=(select auth.uid()));
create policy "xp own read" on public.tgg_user_xp for select to authenticated using(user_id=(select auth.uid()));
create policy "achievements public read" on public.tgg_achievements for select to anon,authenticated using(true);
create policy "user achievements own read" on public.tgg_user_achievements for select to authenticated using(user_id=(select auth.uid()));

grant select on public.tgg_achievements,public.tgg_live_events,public.tgg_events to anon;
grant select on public.tgg_support_transactions to authenticated;
grant select,insert,update,delete on public.tgg_live_events,public.tgg_events to authenticated;
grant select on public.tgg_user_xp,public.tgg_user_achievements,public.tgg_achievements to authenticated;
revoke insert,update,delete on public.tgg_support_transactions,public.tgg_user_xp,public.tgg_user_achievements from anon,authenticated;
create index if not exists tgg_support_tx_artist_idx on public.tgg_support_transactions(artist_id,created_at desc);
create index if not exists tgg_live_status_idx on public.tgg_live_events(status,scheduled_at);
create index if not exists tgg_events_city_idx on public.tgg_events(city,starts_at);


-- ============================================================
-- MIGRATION 20260904054930 v3360_tgg_phone_directory_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_directory_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 artist_id uuid references public.artists(id) on delete set null,
 tgg_number text unique,
 display_name text not null,
 directory_type text not null default 'creator' check(directory_type in ('artist','producer','engineer','dj','videographer','photographer','designer','manager','promoter','studio','venue','record_store','creator','fan')),
 headline text, city text, region text, country text default 'US', services jsonb not null default '[]'::jsonb,
 availability text not null default 'offline' check(availability in ('available','busy','in_session','recording','live','game_night','offline')),
 accepts_messages boolean not null default true, accepts_calls boolean not null default true, accepts_video boolean not null default true, accepts_bookings boolean not null default false,
 is_public boolean not null default true, verified boolean not null default false, updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table if not exists public.tgg_phone_contacts (
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 contact_user_id uuid not null references auth.users(id) on delete cascade,
 nickname text, is_favorite boolean not null default false, speed_dial smallint check(speed_dial between 1 and 9), notes text, created_at timestamptz not null default now(),
 primary key(owner_user_id,contact_user_id), unique(owner_user_id,speed_dial)
);
create table if not exists public.tgg_voicemails (
 id uuid primary key default gen_random_uuid(), from_user_id uuid not null references auth.users(id) on delete cascade, to_user_id uuid not null references auth.users(id) on delete cascade,
 audio_url text not null, duration_seconds integer check(duration_seconds between 1 and 600), transcript text, is_read boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.tgg_pages (
 id uuid primary key default gen_random_uuid(), sender_user_id uuid not null references auth.users(id) on delete cascade, recipient_user_id uuid references auth.users(id) on delete cascade,
 artist_id uuid references public.artists(id) on delete cascade, audience text not null default 'direct' check(audience in ('direct','followers','supporters','vip')), message text not null check(char_length(message) between 1 and 240), action_type text, action_id uuid, expires_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.tgg_hotline_greetings (
 artist_id uuid primary key references public.artists(id) on delete cascade, greeting text not null default 'Welcome to my TGG Line.', menu jsonb not null default '[{"key":"1","label":"Newest Release","action":"music"},{"key":"2","label":"Artist World","action":"world"},{"key":"3","label":"Fan Club","action":"fan_club"},{"key":"4","label":"Events","action":"events"},{"key":"5","label":"Leave Voicemail","action":"voicemail"}]'::jsonb, enabled boolean not null default true, updated_at timestamptz not null default now()
);
create table if not exists public.tgg_booking_requests (
 id uuid primary key default gen_random_uuid(), requester_user_id uuid not null references auth.users(id) on delete cascade, provider_user_id uuid not null references auth.users(id) on delete cascade,
 service text not null, message text, requested_at timestamptz, budget_cents integer check(budget_cents is null or budget_cents>=0), status text not null default 'pending' check(status in ('pending','accepted','declined','canceled','completed')), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.tgg_directory_profiles enable row level security; alter table public.tgg_phone_contacts enable row level security; alter table public.tgg_voicemails enable row level security; alter table public.tgg_pages enable row level security; alter table public.tgg_hotline_greetings enable row level security; alter table public.tgg_booking_requests enable row level security;
create policy "directory public read" on public.tgg_directory_profiles for select to anon,authenticated using(is_public or user_id=(select auth.uid()));
create policy "directory own manage" on public.tgg_directory_profiles for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy "contacts own manage" on public.tgg_phone_contacts for all to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
create policy "voicemail parties read" on public.tgg_voicemails for select to authenticated using(from_user_id=(select auth.uid()) or to_user_id=(select auth.uid()));
create policy "voicemail send" on public.tgg_voicemails for insert to authenticated with check(from_user_id=(select auth.uid()) and from_user_id<>to_user_id);
create policy "voicemail recipient update" on public.tgg_voicemails for update to authenticated using(to_user_id=(select auth.uid())) with check(to_user_id=(select auth.uid()));
create policy "pages parties read" on public.tgg_pages for select to authenticated using(sender_user_id=(select auth.uid()) or recipient_user_id=(select auth.uid()));
create policy "direct page send" on public.tgg_pages for insert to authenticated with check(sender_user_id=(select auth.uid()) and audience='direct' and recipient_user_id is not null);
create policy "hotline public read" on public.tgg_hotline_greetings for select to anon,authenticated using(enabled or exists(select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
create policy "hotline artist manage" on public.tgg_hotline_greetings for all to authenticated using(exists(select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid()))) with check(exists(select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
create policy "booking parties read" on public.tgg_booking_requests for select to authenticated using(requester_user_id=(select auth.uid()) or provider_user_id=(select auth.uid()));
create policy "booking request create" on public.tgg_booking_requests for insert to authenticated with check(requester_user_id=(select auth.uid()) and requester_user_id<>provider_user_id);
create policy "booking parties update" on public.tgg_booking_requests for update to authenticated using(requester_user_id=(select auth.uid()) or provider_user_id=(select auth.uid())) with check(requester_user_id=(select auth.uid()) or provider_user_id=(select auth.uid()));

grant select on public.tgg_directory_profiles,public.tgg_hotline_greetings to anon;
grant select,insert,update,delete on public.tgg_directory_profiles,public.tgg_phone_contacts,public.tgg_voicemails,public.tgg_pages,public.tgg_hotline_greetings,public.tgg_booking_requests to authenticated;
create index if not exists tgg_directory_geo_idx on public.tgg_directory_profiles(city,region,directory_type);
create index if not exists tgg_directory_avail_idx on public.tgg_directory_profiles(availability,directory_type);
create index if not exists tgg_voicemail_to_idx on public.tgg_voicemails(to_user_id,created_at desc);
create index if not exists tgg_pages_recipient_idx on public.tgg_pages(recipient_user_id,created_at desc);
create index if not exists tgg_booking_provider_idx on public.tgg_booking_requests(provider_user_id,status,created_at desc);

-- ============================================================
-- MIGRATION 20260904055410 v3370_scenes_games_xp_booking_live_expansion
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create table if not exists public.tgg_scene_posts (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.tgg_scenes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null default 'update' check (post_type in ('update','opportunity','event','collab','drop','open_mic','battle')),
  title text not null check (char_length(title) between 1 and 160),
  body text,
  action_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.tgg_game_sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.tgg_games(id) on delete set null,
  room_id uuid references public.tgg_call_rooms(id) on delete set null,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  game_type text not null check (game_type in ('music_bingo','trivia','name_that_track','beat_battle','song_battle','karaoke','beat_roulette','freestyle_roulette')),
  status text not null default 'open' check (status in ('open','active','ended','canceled')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table if not exists public.tgg_game_scores (
  session_id uuid not null references public.tgg_game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  wins integer not null default 0 check (wins >= 0),
  updated_at timestamptz not null default now(),
  primary key (session_id,user_id)
);

alter table public.tgg_booking_requests add column if not exists scheduled_for timestamptz;
alter table public.tgg_booking_requests add column if not exists provider_note text;
alter table public.tgg_booking_requests add column if not exists source text not null default 'directory';

create index if not exists tgg_scene_posts_scene_created_idx on public.tgg_scene_posts(scene_id,created_at desc);
create index if not exists tgg_game_sessions_status_created_idx on public.tgg_game_sessions(status,created_at desc);
create index if not exists tgg_game_scores_user_idx on public.tgg_game_scores(user_id,score desc);

alter table public.tgg_scene_posts enable row level security;
alter table public.tgg_game_sessions enable row level security;
alter table public.tgg_game_scores enable row level security;

drop policy if exists "scene posts readable" on public.tgg_scene_posts;
create policy "scene posts readable" on public.tgg_scene_posts for select to authenticated using (true);
drop policy if exists "scene members create posts" on public.tgg_scene_posts;
create policy "scene members create posts" on public.tgg_scene_posts for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.tgg_scene_memberships m where m.scene_id=tgg_scene_posts.scene_id and m.user_id=(select auth.uid())));
drop policy if exists "owners manage scene posts" on public.tgg_scene_posts;
create policy "owners manage scene posts" on public.tgg_scene_posts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "owners delete scene posts" on public.tgg_scene_posts;
create policy "owners delete scene posts" on public.tgg_scene_posts for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists "game sessions readable" on public.tgg_game_sessions;
create policy "game sessions readable" on public.tgg_game_sessions for select to authenticated using (true);
drop policy if exists "hosts create game sessions" on public.tgg_game_sessions;
create policy "hosts create game sessions" on public.tgg_game_sessions for insert to authenticated with check ((select auth.uid())=host_user_id);
drop policy if exists "hosts update game sessions" on public.tgg_game_sessions;
create policy "hosts update game sessions" on public.tgg_game_sessions for update to authenticated using ((select auth.uid())=host_user_id) with check ((select auth.uid())=host_user_id);
drop policy if exists "hosts delete game sessions" on public.tgg_game_sessions;
create policy "hosts delete game sessions" on public.tgg_game_sessions for delete to authenticated using ((select auth.uid())=host_user_id);

drop policy if exists "game scores readable" on public.tgg_game_scores;
create policy "game scores readable" on public.tgg_game_scores for select to authenticated using (true);

revoke all on public.tgg_scene_posts, public.tgg_game_sessions, public.tgg_game_scores from anon;
grant select,insert,update,delete on public.tgg_scene_posts to authenticated;
grant select,insert,update,delete on public.tgg_game_sessions to authenticated;
grant select on public.tgg_game_scores to authenticated;

commit;

-- ============================================================
-- MIGRATION 20260904055813 v3380_circles_rooms_irl_fan_journey
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create table if not exists public.tgg_circles (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null,
 name text not null,
 slug text unique,
 description text,
 circle_type text not null default 'community' check (circle_type in ('community','artist','scene','supporter','street_team','listening_club','collab')),
 access_level text not null default 'public' check (access_level in ('public','followers','supporters','invite_only')),
 city text, region text, country text,
 avatar_url text, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tgg_circle_memberships (
 circle_id uuid not null references public.tgg_circles(id) on delete cascade,
 user_id uuid not null,
 role text not null default 'member' check (role in ('owner','moderator','member')),
 status text not null default 'active' check (status in ('active','pending','blocked')),
 joined_at timestamptz not null default now(),
 primary key(circle_id,user_id)
);
create table if not exists public.tgg_circle_posts (
 id uuid primary key default gen_random_uuid(), circle_id uuid not null references public.tgg_circles(id) on delete cascade,
 user_id uuid not null, post_type text not null default 'post' check (post_type in ('post','drop','poll','event','room','opportunity')),
 body text, action_type text, action_id uuid, created_at timestamptz not null default now()
);
create table if not exists public.tgg_room_links (
 id uuid primary key default gen_random_uuid(), created_by uuid not null,
 call_room_id uuid references public.tgg_call_rooms(id) on delete cascade,
 circle_id uuid references public.tgg_circles(id) on delete set null,
 event_id uuid references public.tgg_events(id) on delete set null,
 room_mode text not null default 'listening' check (room_mode in ('listening','studio','drop','afterparty','backstage','game_night')),
 access_level text not null default 'public' check (access_level in ('public','followers','supporters','vip','invite_only')),
 title text, starts_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.tgg_event_checkins (
 event_id uuid not null references public.tgg_events(id) on delete cascade,
 user_id uuid not null, checked_in_at timestamptz not null default now(),
 badge_code text default 'i_was_there', source text default 'app',
 primary key(event_id,user_id)
);
create table if not exists public.tgg_fan_journey (
 user_id uuid not null,
 artist_id uuid not null,
 first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 streams_count bigint not null default 0, saves_count bigint not null default 0, comments_count bigint not null default 0,
 events_count bigint not null default 0, rooms_count bigint not null default 0,
 supporter boolean not null default false,
 journey_stage text not null default 'listener' check (journey_stage in ('listener','fan','regular','superfan','supporter')),
 primary key(user_id,artist_id)
);

alter table public.tgg_circles enable row level security;
alter table public.tgg_circle_memberships enable row level security;
alter table public.tgg_circle_posts enable row level security;
alter table public.tgg_room_links enable row level security;
alter table public.tgg_event_checkins enable row level security;
alter table public.tgg_fan_journey enable row level security;

grant select on public.tgg_circles, public.tgg_circle_posts, public.tgg_room_links to anon;
grant select,insert,update,delete on public.tgg_circles, public.tgg_circle_memberships, public.tgg_circle_posts, public.tgg_room_links, public.tgg_event_checkins, public.tgg_fan_journey to authenticated;

create policy circles_public_read on public.tgg_circles for select to anon,authenticated using (is_active and access_level='public' or owner_user_id=(select auth.uid()));
create policy circles_owner_insert on public.tgg_circles for insert to authenticated with check (owner_user_id=(select auth.uid()));
create policy circles_owner_update on public.tgg_circles for update to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
create policy circles_owner_delete on public.tgg_circles for delete to authenticated using (owner_user_id=(select auth.uid()));

create policy circle_members_read on public.tgg_circle_memberships for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from public.tgg_circles c where c.id=circle_id and c.owner_user_id=(select auth.uid())));
create policy circle_members_join on public.tgg_circle_memberships for insert to authenticated with check (user_id=(select auth.uid()));
create policy circle_members_self_update on public.tgg_circle_memberships for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy circle_members_self_delete on public.tgg_circle_memberships for delete to authenticated using (user_id=(select auth.uid()));

create policy circle_posts_public_read on public.tgg_circle_posts for select to anon,authenticated using (exists(select 1 from public.tgg_circles c where c.id=circle_id and c.is_active and c.access_level='public') or user_id=(select auth.uid()) or exists(select 1 from public.tgg_circle_memberships m where m.circle_id=tgg_circle_posts.circle_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy circle_posts_insert on public.tgg_circle_posts for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.tgg_circle_memberships m where m.circle_id=tgg_circle_posts.circle_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy circle_posts_update on public.tgg_circle_posts for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy circle_posts_delete on public.tgg_circle_posts for delete to authenticated using (user_id=(select auth.uid()));

create policy room_links_public_read on public.tgg_room_links for select to anon,authenticated using (access_level='public' or created_by=(select auth.uid()) or (circle_id is not null and exists(select 1 from public.tgg_circle_memberships m where m.circle_id=tgg_room_links.circle_id and m.user_id=(select auth.uid()) and m.status='active')));
create policy room_links_insert on public.tgg_room_links for insert to authenticated with check (created_by=(select auth.uid()));
create policy room_links_update on public.tgg_room_links for update to authenticated using (created_by=(select auth.uid())) with check (created_by=(select auth.uid()));
create policy room_links_delete on public.tgg_room_links for delete to authenticated using (created_by=(select auth.uid()));

create policy checkins_self_read on public.tgg_event_checkins for select to authenticated using (user_id=(select auth.uid()));
create policy checkins_self_insert on public.tgg_event_checkins for insert to authenticated with check (user_id=(select auth.uid()));
create policy checkins_self_delete on public.tgg_event_checkins for delete to authenticated using (user_id=(select auth.uid()));

create policy fan_journey_self_read on public.tgg_fan_journey for select to authenticated using (user_id=(select auth.uid()));
create policy fan_journey_self_insert on public.tgg_fan_journey for insert to authenticated with check (user_id=(select auth.uid()));
create policy fan_journey_self_update on public.tgg_fan_journey for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create index if not exists tgg_circles_owner_idx on public.tgg_circles(owner_user_id);
create index if not exists tgg_circle_posts_circle_idx on public.tgg_circle_posts(circle_id,created_at desc);
create index if not exists tgg_room_links_circle_idx on public.tgg_room_links(circle_id,starts_at);
create index if not exists tgg_event_checkins_user_idx on public.tgg_event_checkins(user_id,checked_in_at desc);
create index if not exists tgg_fan_journey_artist_idx on public.tgg_fan_journey(artist_id,journey_stage);
commit;

-- ============================================================
-- MIGRATION 20260904060222 v3390_campaigns_goals_fan_crm_radar
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;
create table if not exists public.tgg_campaigns (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete set null, title text not null, campaign_type text not null default 'release', status text not null default 'draft', starts_at timestamptz, ends_at timestamptz, objective text, target_value bigint not null default 0, current_value bigint not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.tgg_campaign_tasks (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.tgg_campaigns(id) on delete cascade, owner_user_id uuid not null references auth.users(id) on delete cascade, task_type text not null default 'custom', title text not null, due_at timestamptz, status text not null default 'todo', metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.tgg_creator_goals (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete set null, goal_type text not null default 'growth', title text not null, target_value bigint not null default 0, current_value bigint not null default 0, unit text not null default 'count', deadline timestamptz, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.tgg_fan_crm (
 id uuid primary key default gen_random_uuid(), creator_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid not null references public.artists(id) on delete cascade, fan_user_id uuid not null references auth.users(id) on delete cascade, segment text not null default 'fan', tags jsonb not null default '[]'::jsonb, private_notes text, last_contacted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(creator_user_id,artist_id,fan_user_id));

alter table public.tgg_campaigns enable row level security;
alter table public.tgg_campaign_tasks enable row level security;
alter table public.tgg_creator_goals enable row level security;
alter table public.tgg_fan_crm enable row level security;

drop policy if exists campaigns_owner_all on public.tgg_campaigns;
create policy campaigns_owner_all on public.tgg_campaigns for all to authenticated using ((select auth.uid())=owner_user_id) with check ((select auth.uid())=owner_user_id);
drop policy if exists campaign_tasks_owner_all on public.tgg_campaign_tasks;
create policy campaign_tasks_owner_all on public.tgg_campaign_tasks for all to authenticated using ((select auth.uid())=owner_user_id) with check ((select auth.uid())=owner_user_id);
drop policy if exists creator_goals_owner_all on public.tgg_creator_goals;
create policy creator_goals_owner_all on public.tgg_creator_goals for all to authenticated using ((select auth.uid())=owner_user_id) with check ((select auth.uid())=owner_user_id);
drop policy if exists fan_crm_owner_all on public.tgg_fan_crm;
create policy fan_crm_owner_all on public.tgg_fan_crm for all to authenticated using ((select auth.uid())=creator_user_id and exists(select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid()))) with check ((select auth.uid())=creator_user_id and exists(select 1 from public.artists a where a.id=artist_id and a.user_id=(select auth.uid())));
drop policy if exists fan_journey_creator_read on public.tgg_fan_journey;
create policy fan_journey_creator_read on public.tgg_fan_journey for select to authenticated using (exists(select 1 from public.artists a where a.id=tgg_fan_journey.artist_id and a.user_id=(select auth.uid())) or user_id=(select auth.uid()));

grant select,insert,update,delete on public.tgg_campaigns,public.tgg_campaign_tasks,public.tgg_creator_goals,public.tgg_fan_crm to authenticated;
revoke all on public.tgg_campaigns,public.tgg_campaign_tasks,public.tgg_creator_goals,public.tgg_fan_crm from anon;
commit;

-- ============================================================
-- MIGRATION 20260904060606 v3400_opportunities_press_epk_release_team
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_opportunities (id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete set null, opportunity_type text not null default 'collab', title text not null, description text, city text, region text, remote_ok boolean not null default true, compensation_type text not null default 'unspecified', deadline timestamptz, status text not null default 'open', created_at timestamptz not null default now());
create table if not exists public.tgg_opportunity_applications (id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.tgg_opportunities(id) on delete cascade, applicant_user_id uuid not null references auth.users(id) on delete cascade, message text, portfolio_url text, status text not null default 'submitted', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(opportunity_id,applicant_user_id));
create table if not exists public.tgg_press_items (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, item_type text not null default 'press', title text not null, publication text, url text, published_at timestamptz, quote text, is_featured boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.tgg_release_team (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, release_id uuid references public.mixtapes(id) on delete cascade, member_name text not null, role text not null, contact text, status text not null default 'invited', notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.tgg_epk_settings (owner_user_id uuid primary key references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, headline text, short_bio text, booking_email text, location text, highlights jsonb not null default '[]'::jsonb, public_slug text unique, is_public boolean not null default true, updated_at timestamptz not null default now());
alter table public.tgg_opportunities enable row level security; alter table public.tgg_opportunity_applications enable row level security; alter table public.tgg_press_items enable row level security; alter table public.tgg_release_team enable row level security; alter table public.tgg_epk_settings enable row level security;
drop policy if exists opportunities_read on public.tgg_opportunities; create policy opportunities_read on public.tgg_opportunities for select to anon,authenticated using (status='open' or created_by=(select auth.uid()));
drop policy if exists opportunities_owner_insert on public.tgg_opportunities; create policy opportunities_owner_insert on public.tgg_opportunities for insert to authenticated with check (created_by=(select auth.uid()));
drop policy if exists opportunities_owner_update on public.tgg_opportunities; create policy opportunities_owner_update on public.tgg_opportunities for update to authenticated using (created_by=(select auth.uid())) with check (created_by=(select auth.uid()));
drop policy if exists opportunities_owner_delete on public.tgg_opportunities; create policy opportunities_owner_delete on public.tgg_opportunities for delete to authenticated using (created_by=(select auth.uid()));
drop policy if exists applications_read on public.tgg_opportunity_applications; create policy applications_read on public.tgg_opportunity_applications for select to authenticated using (applicant_user_id=(select auth.uid()) or exists(select 1 from public.tgg_opportunities o where o.id=opportunity_id and o.created_by=(select auth.uid())));
drop policy if exists applications_insert on public.tgg_opportunity_applications; create policy applications_insert on public.tgg_opportunity_applications for insert to authenticated with check (applicant_user_id=(select auth.uid()));
drop policy if exists applications_update on public.tgg_opportunity_applications; create policy applications_update on public.tgg_opportunity_applications for update to authenticated using (applicant_user_id=(select auth.uid()) or exists(select 1 from public.tgg_opportunities o where o.id=opportunity_id and o.created_by=(select auth.uid()))) with check (applicant_user_id=(select auth.uid()) or exists(select 1 from public.tgg_opportunities o where o.id=opportunity_id and o.created_by=(select auth.uid())));
drop policy if exists press_public_read on public.tgg_press_items; create policy press_public_read on public.tgg_press_items for select to anon,authenticated using (true); drop policy if exists press_owner_all on public.tgg_press_items; create policy press_owner_all on public.tgg_press_items for all to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
drop policy if exists release_team_owner_all on public.tgg_release_team; create policy release_team_owner_all on public.tgg_release_team for all to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
drop policy if exists epk_public_read on public.tgg_epk_settings; create policy epk_public_read on public.tgg_epk_settings for select to anon,authenticated using (is_public or owner_user_id=(select auth.uid())); drop policy if exists epk_owner_all on public.tgg_epk_settings; create policy epk_owner_all on public.tgg_epk_settings for all to authenticated using (owner_user_id=(select auth.uid())) with check (owner_user_id=(select auth.uid()));
grant select on public.tgg_opportunities,public.tgg_press_items,public.tgg_epk_settings to anon; grant select,insert,update,delete on public.tgg_opportunities,public.tgg_opportunity_applications,public.tgg_press_items,public.tgg_release_team,public.tgg_epk_settings to authenticated;

-- ============================================================
-- MIGRATION 20260904060959 v3410_creator_resume_academy_mentorship_feedback
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_creator_resume (owner_user_id uuid primary key references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, headline text, skills jsonb not null default '[]'::jsonb, credits jsonb not null default '[]'::jsonb, experience jsonb not null default '[]'::jsonb, availability text not null default 'open', public_slug text unique, is_public boolean not null default true, updated_at timestamptz not null default now());
create table if not exists public.tgg_academy_progress (user_id uuid not null references auth.users(id) on delete cascade, course_code text not null, lesson_code text not null, status text not null default 'started', progress_percent integer not null default 0 check(progress_percent between 0 and 100), completed_at timestamptz, updated_at timestamptz not null default now(), primary key(user_id,course_code,lesson_code));
create table if not exists public.tgg_mentorship_requests (id uuid primary key default gen_random_uuid(), requester_user_id uuid not null references auth.users(id) on delete cascade, mentor_user_id uuid references auth.users(id) on delete cascade, topic text not null, message text, session_type text not null default 'room', status text not null default 'requested', requested_at timestamptz not null default now(), scheduled_at timestamptz, updated_at timestamptz not null default now());
create table if not exists public.tgg_feedback_requests (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, title text not null, asset_type text not null default 'demo', asset_url text, prompt text, access_level text not null default 'community', status text not null default 'open', created_at timestamptz not null default now());
create table if not exists public.tgg_feedback_responses (id uuid primary key default gen_random_uuid(), request_id uuid not null references public.tgg_feedback_requests(id) on delete cascade, responder_user_id uuid not null references auth.users(id) on delete cascade, rating smallint check(rating between 1 and 5), feedback text not null, created_at timestamptz not null default now(), unique(request_id,responder_user_id));
alter table public.tgg_creator_resume enable row level security;alter table public.tgg_academy_progress enable row level security;alter table public.tgg_mentorship_requests enable row level security;alter table public.tgg_feedback_requests enable row level security;alter table public.tgg_feedback_responses enable row level security;
drop policy if exists resume_read on public.tgg_creator_resume;create policy resume_read on public.tgg_creator_resume for select to anon,authenticated using(is_public or owner_user_id=(select auth.uid()));drop policy if exists resume_owner_all on public.tgg_creator_resume;create policy resume_owner_all on public.tgg_creator_resume for all to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
drop policy if exists academy_self_all on public.tgg_academy_progress;create policy academy_self_all on public.tgg_academy_progress for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists mentor_read on public.tgg_mentorship_requests;create policy mentor_read on public.tgg_mentorship_requests for select to authenticated using(requester_user_id=(select auth.uid()) or mentor_user_id=(select auth.uid()));drop policy if exists mentor_insert on public.tgg_mentorship_requests;create policy mentor_insert on public.tgg_mentorship_requests for insert to authenticated with check(requester_user_id=(select auth.uid()));drop policy if exists mentor_update on public.tgg_mentorship_requests;create policy mentor_update on public.tgg_mentorship_requests for update to authenticated using(requester_user_id=(select auth.uid()) or mentor_user_id=(select auth.uid())) with check(requester_user_id=(select auth.uid()) or mentor_user_id=(select auth.uid()));
drop policy if exists feedback_request_read on public.tgg_feedback_requests;create policy feedback_request_read on public.tgg_feedback_requests for select to authenticated using(status='open' or owner_user_id=(select auth.uid()));drop policy if exists feedback_request_owner_all on public.tgg_feedback_requests;create policy feedback_request_owner_all on public.tgg_feedback_requests for all to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
drop policy if exists feedback_response_read on public.tgg_feedback_responses;create policy feedback_response_read on public.tgg_feedback_responses for select to authenticated using(responder_user_id=(select auth.uid()) or exists(select 1 from public.tgg_feedback_requests r where r.id=request_id and r.owner_user_id=(select auth.uid())));drop policy if exists feedback_response_insert on public.tgg_feedback_responses;create policy feedback_response_insert on public.tgg_feedback_responses for insert to authenticated with check(responder_user_id=(select auth.uid()));
grant select on public.tgg_creator_resume to anon;grant select,insert,update,delete on public.tgg_creator_resume,public.tgg_academy_progress,public.tgg_mentorship_requests,public.tgg_feedback_requests,public.tgg_feedback_responses to authenticated;

-- ============================================================
-- MIGRATION 20260904061440 v3420_smart_links_credits_clearance_release_checklist
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_smart_links (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, release_id uuid references public.mixtapes(id) on delete cascade, title text not null, slug text not null unique, destination_type text not null default 'release', destinations jsonb not null default '[]'::jsonb, click_count bigint not null default 0, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.tgg_release_credits (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, release_id uuid references public.mixtapes(id) on delete cascade, track_id uuid, person_name text not null, role text not null, tgg_user_id uuid references auth.users(id) on delete set null, notes text, created_at timestamptz not null default now());
create table if not exists public.tgg_clearance_items (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, release_id uuid references public.mixtapes(id) on delete cascade, item_type text not null default 'sample', description text not null, source_name text, permission_status text not null default 'needs_review', proof_url text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.tgg_release_checklist_items (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, release_id uuid references public.mixtapes(id) on delete cascade, item_code text not null, label text not null, status text not null default 'todo', due_at timestamptz, notes text, updated_at timestamptz not null default now(), unique(owner_user_id,release_id,item_code));
alter table public.tgg_smart_links enable row level security;alter table public.tgg_release_credits enable row level security;alter table public.tgg_clearance_items enable row level security;alter table public.tgg_release_checklist_items enable row level security;
drop policy if exists smart_links_public_read on public.tgg_smart_links;create policy smart_links_public_read on public.tgg_smart_links for select to anon,authenticated using(is_active or owner_user_id=(select auth.uid()));drop policy if exists smart_links_owner_all on public.tgg_smart_links;create policy smart_links_owner_all on public.tgg_smart_links for all to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
drop policy if exists release_credits_public_read on public.tgg_release_credits;create policy release_credits_public_read on public.tgg_release_credits for select to anon,authenticated using(true);drop policy if exists release_credits_owner_all on public.tgg_release_credits;create policy release_credits_owner_all on public.tgg_release_credits for all to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
drop policy if exists clearance_owner_all on public.tgg_clearance_items;create policy clearance_owner_all on public.tgg_clearance_items for all to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
drop policy if exists checklist_owner_all on public.tgg_release_checklist_items;create policy checklist_owner_all on public.tgg_release_checklist_items for all to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
grant select on public.tgg_smart_links,public.tgg_release_credits to anon;grant select,insert,update,delete on public.tgg_smart_links,public.tgg_release_credits,public.tgg_clearance_items,public.tgg_release_checklist_items to authenticated;

-- ============================================================
-- MIGRATION 20260904061920 v3430_creator_intelligence_growth_backend
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_smart_link_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.tgg_smart_links(id) on delete cascade,
  event_type text not null default 'click' check (event_type in ('click','destination_click')),
  destination text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  occurred_at timestamptz not null default now()
);
alter table public.tgg_smart_link_events enable row level security;
drop policy if exists smart_link_events_owner_read on public.tgg_smart_link_events;
create policy smart_link_events_owner_read on public.tgg_smart_link_events for select to authenticated using (exists (select 1 from public.tgg_smart_links l where l.id=link_id and l.owner_user_id=(select auth.uid())));
drop policy if exists smart_link_events_public_insert on public.tgg_smart_link_events;
create policy smart_link_events_public_insert on public.tgg_smart_link_events for insert to anon,authenticated with check (event_type in ('click','destination_click') and exists (select 1 from public.tgg_smart_links l where l.id=link_id and l.is_active=true));
grant insert on public.tgg_smart_link_events to anon;
grant select,insert on public.tgg_smart_link_events to authenticated;
create index if not exists tgg_smart_link_events_link_time_idx on public.tgg_smart_link_events(link_id,occurred_at desc);

create or replace function public.tgg_record_smart_link_event(p_link_id uuid,p_event_type text default 'click',p_destination text default null,p_referrer text default null,p_utm_source text default null,p_utm_medium text default null,p_utm_campaign text default null)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if p_event_type not in ('click','destination_click') then raise exception 'invalid event type'; end if;
  insert into public.tgg_smart_link_events(link_id,event_type,destination,referrer,utm_source,utm_medium,utm_campaign)
  values(p_link_id,p_event_type,left(p_destination,500),left(p_referrer,500),left(p_utm_source,120),left(p_utm_medium,120),left(p_utm_campaign,120));
end;$$;
grant execute on function public.tgg_record_smart_link_event(uuid,text,text,text,text,text,text) to anon,authenticated;

create or replace function public.tgg_get_opportunity_matches(p_limit integer default 25)
returns table(opportunity_id uuid,title text,opportunity_type text,city text,region text,remote_ok boolean,compensation_type text,match_score integer,match_reason text)
language sql security invoker set search_path=public as $$
with me as (select * from public.tgg_directory_profiles where user_id=(select auth.uid()) and is_public=true limit 1), ranked as (
select o.id,o.title,o.opportunity_type,o.city,o.region,o.remote_ok,o.compensation_type,
(case when lower(coalesce(o.city,''))=lower(coalesce(me.city,'')) and coalesce(o.city,'')<>'' then 35 else 0 end + case when lower(coalesce(o.region,''))=lower(coalesce(me.region,'')) and coalesce(o.region,'')<>'' then 15 else 0 end + case when o.remote_ok then 15 else 0 end + case when lower(coalesce(me.directory_type,''))=lower(coalesce(o.opportunity_type,'')) then 35 else 0 end + case when coalesce(me.services,'[]'::jsonb)::text ilike '%'||o.opportunity_type||'%' then 25 else 0 end)::integer as score,
concat_ws(' • ',case when lower(coalesce(o.city,''))=lower(coalesce(me.city,'')) and coalesce(o.city,'')<>'' then 'same city' end,case when o.remote_ok then 'remote-friendly' end,case when lower(coalesce(me.directory_type,''))=lower(coalesce(o.opportunity_type,'')) then 'role match' end,case when coalesce(me.services,'[]'::jsonb)::text ilike '%'||o.opportunity_type||'%' then 'service match' end) as reason
from public.tgg_opportunities o cross join me where o.status='open' and o.created_by<>(select auth.uid()) and (o.deadline is null or o.deadline>now()))
select id,title,opportunity_type,city,region,remote_ok,compensation_type,score,coalesce(nullif(reason,''),'open opportunity') from ranked order by score desc,title limit greatest(1,least(coalesce(p_limit,25),100));$$;
grant execute on function public.tgg_get_opportunity_matches(integer) to authenticated;

create or replace function public.tgg_get_creator_growth_insights()
returns table(insight_code text,priority integer,insight_title text,detail text,action_type text,action_ref uuid)
language sql security invoker set search_path=public as $$
with uid as (select auth.uid() as id), open_goals as (select * from public.tgg_creator_goals where owner_user_id=(select id from uid) and status not in ('completed','cancelled')), active_campaigns as (select * from public.tgg_campaigns where owner_user_id=(select id from uid) and status in ('active','scheduled','draft')), incomplete_releases as (select release_id,count(*) filter(where status<>'done') remaining,count(*) total from public.tgg_release_checklist_items where owner_user_id=(select id from uid) group by release_id), links as (select l.id,l.title,count(e.id) filter(where e.occurred_at>=now()-interval '7 days') clicks7 from public.tgg_smart_links l left join public.tgg_smart_link_events e on e.link_id=l.id where l.owner_user_id=(select id from uid) and l.is_active=true group by l.id,l.title), apps as (select o.id,o.title,count(a.id) applications from public.tgg_opportunities o left join public.tgg_opportunity_applications a on a.opportunity_id=o.id where o.created_by=(select id from uid) and o.status='open' group by o.id,o.title), insights as (
select 'goal_deadline'::text code,100::integer prio,'Goal deadline approaching'::text ttl,(g.title||' is due soon.')::text det,'goal'::text typ,g.id ref from open_goals g where g.deadline between now() and now()+interval '7 days'
union all select 'campaign_tasks',90,'Campaign needs execution',(c.title||' has open campaign tasks.')::text,'campaign',c.id from active_campaigns c where exists(select 1 from public.tgg_campaign_tasks t where t.campaign_id=c.id and t.owner_user_id=(select id from uid) and t.status not in ('done','completed'))
union all select 'release_not_ready',85,'Release not ready',(remaining||' of '||total||' checklist items remain.')::text,'release',release_id from incomplete_releases where remaining>0
union all select 'smart_link_quiet',60,'Smart link needs traffic',(title||' has no tracked clicks in the last 7 days.')::text,'smart_link',id from links where clicks7=0
union all select 'opportunity_interest',70,'Opportunity has applicants',(title||' has '||applications||' application(s) waiting.')::text,'opportunity',id from apps where applications>0)
select code,prio,ttl,det,typ,ref from insights order by prio desc,ttl;$$;
grant execute on function public.tgg_get_creator_growth_insights() to authenticated;

create or replace view public.tgg_creator_growth_snapshot with (security_invoker=true) as
select a.user_id as owner_user_id,a.id as artist_id,
count(distinct g.id) filter(where g.status not in ('completed','cancelled')) as open_goals,
count(distinct c.id) filter(where c.status in ('active','scheduled','draft')) as active_campaigns,
count(distinct o.id) filter(where o.status='open') as open_opportunities,
count(distinct s.id) filter(where s.is_active=true) as active_smart_links
from public.artists a left join public.tgg_creator_goals g on g.artist_id=a.id left join public.tgg_campaigns c on c.artist_id=a.id left join public.tgg_opportunities o on o.artist_id=a.id left join public.tgg_smart_links s on s.artist_id=a.id group by a.user_id,a.id;
grant select on public.tgg_creator_growth_snapshot to authenticated;

-- ============================================================
-- MIGRATION 20260904062124 v3440_creator_copilot_action_engine
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_creator_action_queue (id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade, artist_id uuid references public.artists(id) on delete cascade, source_type text not null default 'copilot', source_id uuid, action_type text not null, title text not null, rationale text, priority smallint not null default 50 check(priority between 0 and 100), status text not null default 'open', due_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists tgg_creator_action_queue_owner_status_idx on public.tgg_creator_action_queue(owner_user_id,status,priority desc);
alter table public.tgg_creator_action_queue enable row level security;
drop policy if exists creator_action_queue_owner_all on public.tgg_creator_action_queue;create policy creator_action_queue_owner_all on public.tgg_creator_action_queue for all to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));
grant select,insert,update,delete on public.tgg_creator_action_queue to authenticated;
create or replace function public.tgg_refresh_creator_action_queue(p_artist_id uuid default null) returns integer language plpgsql security invoker set search_path=public as $$ declare v_uid uuid:=(select auth.uid());v_artist uuid;v_added integer:=0; begin if v_uid is null then raise exception 'Authentication required';end if;select id into v_artist from public.artists where user_id=v_uid and (p_artist_id is null or id=p_artist_id) order by created_at nulls last limit 1;if v_artist is null then return 0;end if;delete from public.tgg_creator_action_queue where owner_user_id=v_uid and artist_id=v_artist and source_type='copilot' and status='open';insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,action_type,title,rationale,priority,metadata) select v_uid,v_artist,'copilot','release_readiness','Finish release checklist','One or more release-readiness items are still open.',90,jsonb_build_object('open_items',count(*)) from public.tgg_release_checklist_items where owner_user_id=v_uid and artist_id=v_artist and status<>'done' having count(*)>0;get diagnostics v_added=row_count;insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,action_type,title,rationale,priority,metadata) select v_uid,v_artist,'copilot','campaign','Create or activate a campaign','No active campaign is currently supporting this artist.',80,'{}'::jsonb where not exists(select 1 from public.tgg_campaigns where owner_user_id=v_uid and artist_id=v_artist and status in('active','scheduled'));v_added:=v_added+(case when found then 1 else 0 end);insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,action_type,title,rationale,priority,metadata) select v_uid,v_artist,'copilot','smart_link','Create a smart link','No active smart link exists for this artist.',70,'{}'::jsonb where not exists(select 1 from public.tgg_smart_links where owner_user_id=v_uid and artist_id=v_artist and is_active=true);v_added:=v_added+(case when found then 1 else 0 end);insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,action_type,title,rationale,priority,metadata) select v_uid,v_artist,'copilot','goal','Set a creator goal','No active creator goal is currently tracking progress.',60,'{}'::jsonb where not exists(select 1 from public.tgg_creator_goals where owner_user_id=v_uid and artist_id=v_artist and status='active');v_added:=v_added+(case when found then 1 else 0 end);return v_added;end $$;
revoke all on function public.tgg_refresh_creator_action_queue(uuid) from public,anon;grant execute on function public.tgg_refresh_creator_action_queue(uuid) to authenticated;
create or replace function public.tgg_set_creator_action_status(p_action_id uuid,p_status text) returns boolean language plpgsql security invoker set search_path=public as $$ begin if p_status not in('open','done','dismissed') then raise exception 'Invalid status';end if;update public.tgg_creator_action_queue set status=p_status,updated_at=now() where id=p_action_id and owner_user_id=(select auth.uid());return found;end $$;
revoke all on function public.tgg_set_creator_action_status(uuid,text) from public,anon;grant execute on function public.tgg_set_creator_action_status(uuid,text) to authenticated;
create or replace view public.tgg_creator_action_summary with (security_invoker=true) as select owner_user_id,artist_id,count(*) filter(where status='open')::bigint as open_actions,count(*) filter(where status='done')::bigint as completed_actions,max(priority) filter(where status='open') as highest_priority,max(updated_at) as last_updated from public.tgg_creator_action_queue group by owner_user_id,artist_id;
grant select on public.tgg_creator_action_summary to authenticated;

-- ============================================================
-- MIGRATION 20260904062330 v3450_creator_copilot_digest_notifications
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create table if not exists public.tgg_creator_digest_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  digest_enabled boolean not null default true,
  action_alerts_enabled boolean not null default true,
  opportunity_alerts_enabled boolean not null default true,
  minimum_priority smallint not null default 70 check (minimum_priority between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.tgg_creator_digest_preferences enable row level security;
revoke all on public.tgg_creator_digest_preferences from anon, authenticated;
grant select, insert, update, delete on public.tgg_creator_digest_preferences to authenticated;

drop policy if exists creator_digest_preferences_select on public.tgg_creator_digest_preferences;
create policy creator_digest_preferences_select on public.tgg_creator_digest_preferences for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists creator_digest_preferences_insert on public.tgg_creator_digest_preferences;
create policy creator_digest_preferences_insert on public.tgg_creator_digest_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists creator_digest_preferences_update on public.tgg_creator_digest_preferences;
create policy creator_digest_preferences_update on public.tgg_creator_digest_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists creator_digest_preferences_delete on public.tgg_creator_digest_preferences;
create policy creator_digest_preferences_delete on public.tgg_creator_digest_preferences for delete to authenticated using ((select auth.uid()) = user_id);

create or replace view public.tgg_creator_daily_brief
with (security_invoker=true)
as
select q.owner_user_id,
       count(*) filter (where q.status='open')::bigint as open_actions,
       count(*) filter (where q.status='open' and q.priority >= 80)::bigint as urgent_actions,
       min(q.due_at) filter (where q.status='open') as next_due_at,
       coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'action_type',q.action_type,'priority',q.priority,'due_at',q.due_at) order by q.priority desc,q.created_at asc) filter (where q.status='open'), '[]'::jsonb) as actions
from public.tgg_creator_action_queue q
where q.owner_user_id = (select auth.uid())
group by q.owner_user_id;

revoke all on public.tgg_creator_daily_brief from anon, authenticated;
grant select on public.tgg_creator_daily_brief to authenticated;

create or replace function public.tgg_get_creator_daily_brief(p_limit integer default 8)
returns jsonb
language sql
stable
security invoker
set search_path=public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'open_actions', count(*) filter (where q.status='open'),
    'urgent_actions', count(*) filter (where q.status='open' and q.priority>=80),
    'next_due_at', min(q.due_at) filter (where q.status='open'),
    'actions', coalesce((select jsonb_agg(x.obj order by x.priority desc, x.created_at asc) from (select jsonb_build_object('id',a.id,'title',a.title,'rationale',a.rationale,'action_type',a.action_type,'priority',a.priority,'due_at',a.due_at,'metadata',a.metadata) obj,a.priority,a.created_at from public.tgg_creator_action_queue a where a.owner_user_id=(select auth.uid()) and a.status='open' order by a.priority desc,a.created_at asc limit greatest(1,least(coalesce(p_limit,8),25))) x),'[]'::jsonb)
  )
  from public.tgg_creator_action_queue q
  where q.owner_user_id=(select auth.uid());
$$;
revoke all on function public.tgg_get_creator_daily_brief(integer) from public, anon;
grant execute on function public.tgg_get_creator_daily_brief(integer) to authenticated;

create or replace function public.tgg_sync_creator_action_notifications()
returns integer
language plpgsql
volatile
security invoker
set search_path=public
as $$
declare v_count integer:=0;
begin
  insert into public.tgg_creator_digest_preferences(user_id) values ((select auth.uid())) on conflict (user_id) do nothing;
  insert into public.notifications(recipient_id,actor_id,notification_type,entity_type,entity_id,title,body)
  select q.owner_user_id,null,'creator_action','creator_action',q.id,'Creator action: '||q.title,q.rationale
  from public.tgg_creator_action_queue q
  join public.tgg_creator_digest_preferences p on p.user_id=q.owner_user_id
  where q.owner_user_id=(select auth.uid()) and q.status='open' and p.action_alerts_enabled and q.priority>=p.minimum_priority
    and not exists (select 1 from public.notifications n where n.recipient_id=q.owner_user_id and n.notification_type='creator_action' and n.entity_id=q.id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.tgg_sync_creator_action_notifications() from public, anon;
grant execute on function public.tgg_sync_creator_action_notifications() to authenticated;

commit;

-- ============================================================
-- MIGRATION 20260904062530 v3460_fan_intelligence_crm_automation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create table if not exists public.tgg_fan_intelligence_snapshots (
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  fan_user_id uuid not null references auth.users(id) on delete cascade,
  engagement_score integer not null default 0 check (engagement_score between 0 and 100),
  recency_score integer not null default 0 check (recency_score between 0 and 100),
  loyalty_score integer not null default 0 check (loyalty_score between 0 and 100),
  fan_state text not null default 'new' check (fan_state in ('new','active','superfan','supporter','slipping','dormant')),
  recommended_action text,
  last_seen_at timestamptz,
  calculated_at timestamptz not null default now(),
  primary key (creator_user_id, artist_id, fan_user_id)
);

alter table public.tgg_fan_intelligence_snapshots enable row level security;

drop policy if exists fan_intelligence_creator_read on public.tgg_fan_intelligence_snapshots;
create policy fan_intelligence_creator_read
on public.tgg_fan_intelligence_snapshots
for select to authenticated
using (creator_user_id = auth.uid());

grant select on public.tgg_fan_intelligence_snapshots to authenticated;
revoke all on public.tgg_fan_intelligence_snapshots from anon;

create or replace function public.tgg_refresh_fan_intelligence(p_artist_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  delete from public.tgg_fan_intelligence_snapshots s
  where s.creator_user_id = v_user
    and (p_artist_id is null or s.artist_id = p_artist_id);

  insert into public.tgg_fan_intelligence_snapshots (
    creator_user_id, artist_id, fan_user_id,
    engagement_score, recency_score, loyalty_score,
    fan_state, recommended_action, last_seen_at, calculated_at
  )
  select
    v_user,
    fj.artist_id,
    fj.user_id,
    least(100, greatest(0,
      (least(coalesce(fj.streams_count,0),40) * 1)
      + (least(coalesce(fj.saves_count,0),10) * 3)
      + (least(coalesce(fj.comments_count,0),10) * 4)
      + (least(coalesce(fj.events_count,0),5) * 5)
      + (least(coalesce(fj.rooms_count,0),5) * 4)
      + case when coalesce(fj.supporter,false) then 20 else 0 end
    ))::int as engagement_score,
    case
      when fj.last_seen_at is null then 0
      when fj.last_seen_at >= now() - interval '3 days' then 100
      when fj.last_seen_at >= now() - interval '7 days' then 85
      when fj.last_seen_at >= now() - interval '30 days' then 60
      when fj.last_seen_at >= now() - interval '90 days' then 30
      else 10
    end::int as recency_score,
    least(100, greatest(0,
      case coalesce(fj.journey_stage,'listener')
        when 'supporter' then 100
        when 'superfan' then 90
        when 'regular' then 75
        when 'fan' then 55
        else 30
      end
      + case when coalesce(fj.supporter,false) then 10 else 0 end
    ))::int as loyalty_score,
    case
      when coalesce(fj.supporter,false) then 'supporter'
      when coalesce(fj.journey_stage,'') = 'superfan' then 'superfan'
      when fj.last_seen_at is null or fj.last_seen_at < now() - interval '90 days' then 'dormant'
      when fj.last_seen_at < now() - interval '30 days' then 'slipping'
      when fj.first_seen_at >= now() - interval '14 days' then 'new'
      else 'active'
    end as fan_state,
    case
      when coalesce(fj.supporter,false) then 'Reward loyalty with exclusive access or recognition.'
      when coalesce(fj.journey_stage,'') = 'superfan' then 'Invite to a private room, early listen, or street-team mission.'
      when fj.last_seen_at is null or fj.last_seen_at < now() - interval '90 days' then 'Run a low-frequency win-back touchpoint tied to a new release or event.'
      when fj.last_seen_at < now() - interval '30 days' then 'Re-engage with a targeted update, event invite, or personalized release recommendation.'
      when fj.first_seen_at >= now() - interval '14 days' then 'Welcome them and guide them toward saving, following, or joining a Circle.'
      else 'Keep nurturing with relevant releases, Rooms, and events.'
    end,
    fj.last_seen_at,
    now()
  from public.tgg_fan_journey fj
  join public.artists a on a.id = fj.artist_id
  where a.user_id = v_user
    and (p_artist_id is null or fj.artist_id = p_artist_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.tgg_refresh_fan_intelligence(uuid) to authenticated;
revoke all on function public.tgg_refresh_fan_intelligence(uuid) from anon;

create or replace function public.tgg_sync_fan_crm_segments(p_artist_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  insert into public.tgg_fan_crm (
    creator_user_id, artist_id, fan_user_id, segment, tags, private_notes, created_at, updated_at
  )
  select
    s.creator_user_id,
    s.artist_id,
    s.fan_user_id,
    s.fan_state,
    jsonb_build_array('auto:'+s.fan_state),
    null,
    now(),
    now()
  from public.tgg_fan_intelligence_snapshots s
  where s.creator_user_id = v_user
    and (p_artist_id is null or s.artist_id = p_artist_id)
  on conflict (creator_user_id, artist_id, fan_user_id)
  do update set
    segment = excluded.segment,
    tags = case
      when jsonb_typeof(public.tgg_fan_crm.tags) = 'array'
        then public.tgg_fan_crm.tags || jsonb_build_array('auto:'+excluded.segment)
      else jsonb_build_array('auto:'+excluded.segment)
    end,
    updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.tgg_sync_fan_crm_segments(uuid) to authenticated;
revoke all on function public.tgg_sync_fan_crm_segments(uuid) from anon;

create or replace function public.tgg_generate_fan_followup_actions(p_artist_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  insert into public.tgg_creator_action_queue (
    owner_user_id, artist_id, source_type, source_id, action_type,
    title, rationale, priority, status, due_at, metadata, created_at, updated_at
  )
  select
    s.creator_user_id,
    s.artist_id,
    'fan_intelligence',
    s.fan_user_id,
    case when s.fan_state in ('slipping','dormant') then 'fan_reengagement' else 'fan_nurture' end,
    case s.fan_state
      when 'supporter' then 'Reward a supporter relationship'
      when 'superfan' then 'Activate a superfan'
      when 'slipping' then 'Re-engage a slipping fan'
      when 'dormant' then 'Win back a dormant fan'
      when 'new' then 'Welcome a new fan'
      else 'Nurture an active fan'
    end,
    s.recommended_action,
    case s.fan_state
      when 'slipping' then 4
      when 'dormant' then 3
      when 'superfan' then 4
      when 'supporter' then 5
      when 'new' then 3
      else 2
    end,
    'open',
    case when s.fan_state in ('slipping','dormant') then now() + interval '3 days' else null end,
    jsonb_build_object(
      'fan_user_id', s.fan_user_id,
      'fan_state', s.fan_state,
      'engagement_score', s.engagement_score,
      'recency_score', s.recency_score,
      'loyalty_score', s.loyalty_score
    ),
    now(),
    now()
  from public.tgg_fan_intelligence_snapshots s
  where s.creator_user_id = v_user
    and (p_artist_id is null or s.artist_id = p_artist_id)
    and s.fan_state in ('new','superfan','supporter','slipping','dormant')
    and not exists (
      select 1
      from public.tgg_creator_action_queue q
      where q.owner_user_id = s.creator_user_id
        and q.artist_id = s.artist_id
        and q.source_type = 'fan_intelligence'
        and q.source_id = s.fan_user_id
        and q.status = 'open'
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.tgg_generate_fan_followup_actions(uuid) to authenticated;
revoke all on function public.tgg_generate_fan_followup_actions(uuid) from anon;

create or replace view public.tgg_creator_fan_intelligence_summary
with (security_invoker = true)
as
select
  creator_user_id,
  artist_id,
  count(*) as total_fans,
  count(*) filter (where fan_state='new') as new_fans,
  count(*) filter (where fan_state='active') as active_fans,
  count(*) filter (where fan_state='superfan') as superfans,
  count(*) filter (where fan_state='supporter') as supporters,
  count(*) filter (where fan_state='slipping') as slipping_fans,
  count(*) filter (where fan_state='dormant') as dormant_fans,
  round(avg(engagement_score)::numeric,1) as avg_engagement_score,
  round(avg(recency_score)::numeric,1) as avg_recency_score,
  round(avg(loyalty_score)::numeric,1) as avg_loyalty_score,
  max(calculated_at) as refreshed_at
from public.tgg_fan_intelligence_snapshots
group by creator_user_id, artist_id;

grant select on public.tgg_creator_fan_intelligence_summary to authenticated;
revoke all on public.tgg_creator_fan_intelligence_summary from anon;

commit;

-- ============================================================
-- MIGRATION 20260904062705 v3470_supporter_retention_revenue_intelligence
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_supporter_health_snapshots (
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  fan_user_id uuid not null references auth.users(id) on delete cascade,
  membership_id uuid references public.tgg_memberships(id) on delete set null,
  health_score integer not null default 0 check (health_score between 0 and 100),
  supporter_state text not null default 'active' check (supporter_state in ('new','active','loyal','at_risk','churned')),
  lifetime_support_cents bigint not null default 0,
  current_tier_id uuid references public.tgg_membership_tiers(id) on delete set null,
  current_period_end timestamptz,
  recommended_action text,
  calculated_at timestamptz not null default now(),
  primary key (creator_user_id, artist_id, fan_user_id)
);
alter table public.tgg_supporter_health_snapshots enable row level security;
drop policy if exists supporter_health_creator_read on public.tgg_supporter_health_snapshots;
create policy supporter_health_creator_read on public.tgg_supporter_health_snapshots for select to authenticated using (creator_user_id = auth.uid());
revoke all on public.tgg_supporter_health_snapshots from anon;
grant select on public.tgg_supporter_health_snapshots to authenticated;

create or replace function public.tgg_refresh_supporter_health()
returns integer language plpgsql security invoker set search_path=public as $$
declare v_uid uuid := auth.uid(); v_count integer := 0;
begin
 if v_uid is null then raise exception 'authentication required'; end if;
 insert into public.tgg_supporter_health_snapshots(creator_user_id,artist_id,fan_user_id,membership_id,health_score,supporter_state,lifetime_support_cents,current_tier_id,current_period_end,recommended_action,calculated_at)
 select v_uid,m.artist_id,m.fan_user_id,m.id,
   greatest(0,least(100,
     case when m.status='active' then 55 when m.status in ('canceled','cancelled') then 10 else 25 end
     + case when coalesce(m.cancel_at_period_end,false) then -25 else 10 end
     + case when m.started_at < now()-interval '90 days' then 15 else 5 end
     + case when coalesce(fi.loyalty_score,0)>=70 then 10 else 0 end)),
   case when m.status not in ('active','trialing') then 'churned'
        when coalesce(m.cancel_at_period_end,false) or (m.current_period_end is not null and m.current_period_end < now()+interval '10 days') then 'at_risk'
        when m.started_at > now()-interval '30 days' then 'new'
        when m.started_at < now()-interval '180 days' then 'loyal'
        else 'active' end,
   coalesce(st.total_cents,0),m.tier_id,m.current_period_end,
   case when m.status not in ('active','trialing') then 'Invite back with a relevant new release or supporter benefit.'
        when coalesce(m.cancel_at_period_end,false) then 'Review cancellation risk and offer a meaningful retention touchpoint.'
        when m.started_at > now()-interval '30 days' then 'Welcome this new supporter and show them their member benefits.'
        when m.started_at < now()-interval '180 days' then 'Recognize this loyal supporter with an exclusive thank-you or early access.'
        else 'Keep this supporter engaged with regular member-only value.' end, now()
 from public.tgg_memberships m
 join public.artists a on a.id=m.artist_id and a.user_id=v_uid
 left join public.tgg_fan_intelligence_snapshots fi on fi.creator_user_id=v_uid and fi.artist_id=m.artist_id and fi.fan_user_id=m.fan_user_id
 left join lateral (select sum(s.amount_cents)::bigint total_cents from public.tgg_support_transactions s where s.artist_id=m.artist_id and s.fan_user_id=m.fan_user_id and s.status in ('paid','succeeded','complete','completed')) st on true
 on conflict (creator_user_id,artist_id,fan_user_id) do update set membership_id=excluded.membership_id,health_score=excluded.health_score,supporter_state=excluded.supporter_state,lifetime_support_cents=excluded.lifetime_support_cents,current_tier_id=excluded.current_tier_id,current_period_end=excluded.current_period_end,recommended_action=excluded.recommended_action,calculated_at=now();
 get diagnostics v_count = row_count; return v_count;
end $$;

create or replace function public.tgg_generate_supporter_retention_actions()
returns integer language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_count integer:=0;
begin
 if v_uid is null then raise exception 'authentication required'; end if;
 insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,source_id,action_type,title,rationale,priority,status,due_at,metadata)
 select v_uid,s.artist_id,'supporter',s.membership_id,
   case when s.supporter_state='at_risk' then 'retain_supporter' when s.supporter_state='churned' then 'win_back_supporter' when s.supporter_state='new' then 'welcome_supporter' else 'reward_supporter' end,
   case when s.supporter_state='at_risk' then 'Supporter may be at risk' when s.supporter_state='churned' then 'Reconnect with a former supporter' when s.supporter_state='new' then 'Welcome a new supporter' else 'Reward a loyal supporter' end,
   s.recommended_action,
   case when s.supporter_state='at_risk' then 95 when s.supporter_state='churned' then 80 when s.supporter_state='new' then 70 else 60 end,
   'open',case when s.supporter_state='at_risk' then now()+interval '2 days' else now()+interval '7 days' end,
   jsonb_build_object('fan_user_id',s.fan_user_id,'supporter_state',s.supporter_state,'health_score',s.health_score,'lifetime_support_cents',s.lifetime_support_cents)
 from public.tgg_supporter_health_snapshots s
 where s.creator_user_id=v_uid and s.supporter_state in ('at_risk','churned','new','loyal')
 and not exists (select 1 from public.tgg_creator_action_queue q where q.owner_user_id=v_uid and q.source_type='supporter' and q.source_id=s.membership_id and q.status='open' and q.action_type in ('retain_supporter','win_back_supporter','welcome_supporter','reward_supporter'));
 get diagnostics v_count=row_count; return v_count;
end $$;

create or replace view public.tgg_creator_supporter_summary with (security_invoker=true) as
select creator_user_id,artist_id,count(*)::bigint supporter_records,
 count(*) filter(where supporter_state in ('new','active','loyal'))::bigint active_supporters,
 count(*) filter(where supporter_state='at_risk')::bigint at_risk_supporters,
 count(*) filter(where supporter_state='churned')::bigint churned_supporters,
 coalesce(sum(lifetime_support_cents),0)::bigint tracked_lifetime_support_cents,
 round(avg(health_score),1) average_health_score,
 max(calculated_at) calculated_at
from public.tgg_supporter_health_snapshots group by creator_user_id,artist_id;
revoke all on public.tgg_creator_supporter_summary from anon;
grant select on public.tgg_creator_supporter_summary to authenticated;

grant execute on function public.tgg_refresh_supporter_health() to authenticated;
grant execute on function public.tgg_generate_supporter_retention_actions() to authenticated;
revoke all on function public.tgg_refresh_supporter_health() from anon;
revoke all on function public.tgg_generate_supporter_retention_actions() from anon;

-- ============================================================
-- MIGRATION 20260904062824 v3480_events_booking_live_command_intelligence
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.tgg_creator_event_performance with (security_invoker=true) as
select e.created_by as creator_user_id,e.artist_id,e.id event_id,e.title,e.event_type,e.starts_at,e.status,
 count(ec.user_id)::bigint checkins,
 count(ec.user_id) filter(where ec.badge_code is not null)::bigint badge_checkins
from public.tgg_events e left join public.tgg_event_checkins ec on ec.event_id=e.id
group by e.created_by,e.artist_id,e.id,e.title,e.event_type,e.starts_at,e.status;
revoke all on public.tgg_creator_event_performance from anon; grant select on public.tgg_creator_event_performance to authenticated;

create or replace view public.tgg_creator_booking_pipeline with (security_invoker=true) as
select b.provider_user_id as creator_user_id,b.status,count(*)::bigint requests,
 coalesce(sum(b.budget_cents),0)::bigint budget_cents,
 min(b.requested_at) earliest_requested_at,max(b.updated_at) latest_updated_at
from public.tgg_booking_requests b group by b.provider_user_id,b.status;
revoke all on public.tgg_creator_booking_pipeline from anon; grant select on public.tgg_creator_booking_pipeline to authenticated;

create or replace function public.tgg_generate_event_booking_actions()
returns integer language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_count integer:=0; v_added integer:=0;
begin
 if v_uid is null then raise exception 'authentication required'; end if;
 insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,source_id,action_type,title,rationale,priority,status,due_at,metadata)
 select v_uid,e.artist_id,'event',e.id,'promote_event','Promote upcoming event: '||e.title,
 'This event starts soon. Push it through TGG campaigns, supporters, Stories, Circles and your smart link.',
 case when e.starts_at < now()+interval '3 days' then 95 else 75 end,'open',greatest(now(),e.starts_at-interval '1 day'),jsonb_build_object('starts_at',e.starts_at,'event_type',e.event_type,'city',e.city)
 from public.tgg_events e where e.created_by=v_uid and e.status not in ('cancelled','canceled','completed') and e.starts_at between now() and now()+interval '14 days'
 and not exists(select 1 from public.tgg_creator_action_queue q where q.owner_user_id=v_uid and q.source_type='event' and q.source_id=e.id and q.action_type='promote_event' and q.status='open');
 get diagnostics v_added=row_count; v_count:=v_count+v_added;
 insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,source_id,action_type,title,rationale,priority,status,due_at,metadata)
 select v_uid,a.id,'booking',b.id,'respond_booking','Respond to booking request: '||coalesce(b.service,'service'),
 'A booking request is waiting for a response. Fast replies can improve conversion and creator professionalism.',90,'open',now()+interval '1 day',jsonb_build_object('budget_cents',b.budget_cents,'requested_at',b.requested_at,'scheduled_for',b.scheduled_for)
 from public.tgg_booking_requests b left join public.artists a on a.user_id=v_uid
 where b.provider_user_id=v_uid and b.status in ('pending','requested','new')
 and not exists(select 1 from public.tgg_creator_action_queue q where q.owner_user_id=v_uid and q.source_type='booking' and q.source_id=b.id and q.action_type='respond_booking' and q.status='open');
 get diagnostics v_added=row_count; v_count:=v_count+v_added;
 insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,source_id,action_type,title,rationale,priority,status,due_at,metadata)
 select v_uid,l.artist_id,'live',l.id,'prepare_live','Prepare LIVE: '||l.title,
 'Your scheduled TGG Live session is approaching. Confirm room setup, access level, pinned release/merch and promotion.',85,'open',greatest(now(),l.scheduled_at-interval '12 hours'),jsonb_build_object('scheduled_at',l.scheduled_at,'live_type',l.live_type,'access_level',l.access_level)
 from public.tgg_live_events l where l.host_user_id=v_uid and l.status not in ('ended','cancelled','canceled') and l.scheduled_at between now() and now()+interval '7 days'
 and not exists(select 1 from public.tgg_creator_action_queue q where q.owner_user_id=v_uid and q.source_type='live' and q.source_id=l.id and q.action_type='prepare_live' and q.status='open');
 get diagnostics v_added=row_count; v_count:=v_count+v_added; return v_count;
end $$;

grant execute on function public.tgg_generate_event_booking_actions() to authenticated; revoke all on function public.tgg_generate_event_booking_actions() from anon;

-- ============================================================
-- MIGRATION 20260904063236 v3490_v3530_unified_creator_command_center
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace view public.tgg_creator_release_health with (security_invoker=true) as
select a.user_id as creator_user_id,m.artist_id,m.id release_id,m.title,m.status,m.release_date,m.play_count,m.download_count,
 coalesce(count(rc.id),0)::bigint checklist_items,
 coalesce(count(rc.id) filter(where rc.status='done'),0)::bigint checklist_done,
 case when count(rc.id)=0 then 0 else round((count(rc.id) filter(where rc.status='done')::numeric/count(rc.id))*100)::int end readiness_percent,
 coalesce(sl.click_count,0)::bigint smart_link_clicks
from public.mixtapes m join public.artists a on a.id=m.artist_id
left join public.tgg_release_checklist_items rc on rc.release_id=m.id and rc.owner_user_id=a.user_id
left join lateral (select sum(s.click_count)::bigint click_count from public.tgg_smart_links s where s.release_id=m.id and s.owner_user_id=a.user_id and s.is_active=true) sl on true
group by a.user_id,m.artist_id,m.id,m.title,m.status,m.release_date,m.play_count,m.download_count,sl.click_count;
revoke all on public.tgg_creator_release_health from anon; grant select on public.tgg_creator_release_health to authenticated;

create or replace view public.tgg_creator_campaign_health with (security_invoker=true) as
select c.owner_user_id as creator_user_id,c.artist_id,c.id campaign_id,c.title,c.status,c.objective,c.target_value,c.current_value,c.starts_at,c.ends_at,
 coalesce(count(t.id),0)::bigint task_count,
 coalesce(count(t.id) filter(where t.status in ('done','complete','completed')),0)::bigint tasks_done,
 case when c.target_value is null or c.target_value=0 then null else round((c.current_value::numeric/c.target_value)*100,1) end objective_percent
from public.tgg_campaigns c left join public.tgg_campaign_tasks t on t.campaign_id=c.id and t.owner_user_id=c.owner_user_id
group by c.owner_user_id,c.artist_id,c.id,c.title,c.status,c.objective,c.target_value,c.current_value,c.starts_at,c.ends_at;
revoke all on public.tgg_creator_campaign_health from anon; grant select on public.tgg_creator_campaign_health to authenticated;

create or replace view public.tgg_creator_monetization_summary with (security_invoker=true) as
select a.user_id as creator_user_id,a.id artist_id,
 coalesce(sum(s.amount_cents) filter(where s.status in ('paid','succeeded','complete','completed')),0)::bigint gross_support_cents,
 coalesce(sum(s.platform_fee_cents) filter(where s.status in ('paid','succeeded','complete','completed')),0)::bigint platform_fee_cents,
 count(s.id) filter(where s.status in ('paid','succeeded','complete','completed'))::bigint paid_transactions,
 count(distinct m.fan_user_id) filter(where m.status in ('active','trialing'))::bigint active_supporters
from public.artists a
left join public.tgg_support_transactions s on s.artist_id=a.id
left join public.tgg_memberships m on m.artist_id=a.id
group by a.user_id,a.id;
revoke all on public.tgg_creator_monetization_summary from anon; grant select on public.tgg_creator_monetization_summary to authenticated;

create or replace function public.tgg_generate_release_campaign_actions()
returns integer language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_count integer:=0; v_added integer:=0;
begin
 if v_uid is null then raise exception 'authentication required'; end if;
 insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,source_id,action_type,title,rationale,priority,status,due_at,metadata)
 select v_uid,r.artist_id,'release',r.release_id,'finish_release','Finish release prep: '||r.title,
 'Release readiness is '||r.readiness_percent||'%. Complete the remaining checklist before launch.',
 case when r.release_date is not null and r.release_date < now()+interval '7 days' then 98 else 82 end,'open',coalesce(r.release_date,now()+interval '7 days')-interval '1 day',
 jsonb_build_object('readiness_percent',r.readiness_percent,'smart_link_clicks',r.smart_link_clicks)
 from public.tgg_creator_release_health r where r.creator_user_id=v_uid and r.readiness_percent<100 and (r.release_date is null or r.release_date>=now()-interval '7 days')
 and not exists(select 1 from public.tgg_creator_action_queue q where q.owner_user_id=v_uid and q.source_type='release' and q.source_id=r.release_id and q.action_type='finish_release' and q.status='open');
 get diagnostics v_added=row_count; v_count:=v_count+v_added;
 insert into public.tgg_creator_action_queue(owner_user_id,artist_id,source_type,source_id,action_type,title,rationale,priority,status,due_at,metadata)
 select v_uid,c.artist_id,'campaign',c.campaign_id,'optimize_campaign','Optimize campaign: '||c.title,
 case when c.objective_percent is not null and c.objective_percent<50 then 'Campaign progress is behind target.' else 'Campaign still has unfinished tasks or needs a stronger push.' end,
 case when c.ends_at is not null and c.ends_at<now()+interval '5 days' then 92 else 72 end,'open',coalesce(c.ends_at,now()+interval '5 days')-interval '1 day',
 jsonb_build_object('objective_percent',c.objective_percent,'tasks_done',c.tasks_done,'task_count',c.task_count)
 from public.tgg_creator_campaign_health c where c.creator_user_id=v_uid and c.status not in ('complete','completed','cancelled','canceled') and (c.tasks_done<c.task_count or coalesce(c.objective_percent,0)<100)
 and not exists(select 1 from public.tgg_creator_action_queue q where q.owner_user_id=v_uid and q.source_type='campaign' and q.source_id=c.campaign_id and q.action_type='optimize_campaign' and q.status='open');
 get diagnostics v_added=row_count; v_count:=v_count+v_added; return v_count;
end $$;

grant execute on function public.tgg_generate_release_campaign_actions() to authenticated; revoke all on function public.tgg_generate_release_campaign_actions() from anon;

create or replace function public.tgg_refresh_creator_command_center()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_release int:=0; v_event int:=0; v_fan int:=0; v_support int:=0; v_total int:=0;
begin
 if v_uid is null then raise exception 'authentication required'; end if;
 begin v_release:=public.tgg_generate_release_campaign_actions(); exception when undefined_function then v_release:=0; end;
 begin v_event:=public.tgg_generate_event_booking_actions(); exception when undefined_function then v_event:=0; end;
 begin perform public.tgg_refresh_fan_intelligence(); perform public.tgg_sync_fan_crm_segments(); v_fan:=public.tgg_generate_fan_followup_actions(); exception when undefined_function then v_fan:=0; end;
 begin perform public.tgg_refresh_supporter_health(); v_support:=public.tgg_generate_supporter_retention_actions(); exception when undefined_function then v_support:=0; end;
 v_total:=coalesce(v_release,0)+coalesce(v_event,0)+coalesce(v_fan,0)+coalesce(v_support,0);
 return jsonb_build_object('release_campaign_actions',v_release,'event_booking_live_actions',v_event,'fan_actions',v_fan,'supporter_actions',v_support,'new_actions_total',v_total,'refreshed_at',now());
end $$;
grant execute on function public.tgg_refresh_creator_command_center() to authenticated; revoke all on function public.tgg_refresh_creator_command_center() from anon;

create or replace view public.tgg_creator_command_center with (security_invoker=true) as
select a.user_id as creator_user_id,a.id artist_id,
 coalesce((select count(*) from public.tgg_creator_action_queue q where q.owner_user_id=a.user_id and q.artist_id=a.id and q.status='open'),0)::bigint open_actions,
 coalesce((select count(*) from public.tgg_creator_action_queue q where q.owner_user_id=a.user_id and q.artist_id=a.id and q.status='open' and q.priority>=90),0)::bigint urgent_actions,
 coalesce((select count(*) from public.tgg_creator_release_health r where r.creator_user_id=a.user_id and r.artist_id=a.id and r.readiness_percent<100),0)::bigint releases_needing_work,
 coalesce((select count(*) from public.tgg_creator_campaign_health c where c.creator_user_id=a.user_id and c.artist_id=a.id and c.status not in ('complete','completed','cancelled','canceled')),0)::bigint active_campaigns,
 coalesce((select active_supporters from public.tgg_creator_monetization_summary m where m.creator_user_id=a.user_id and m.artist_id=a.id),0)::bigint active_supporters,
 coalesce((select gross_support_cents from public.tgg_creator_monetization_summary m where m.creator_user_id=a.user_id and m.artist_id=a.id),0)::bigint gross_support_cents,
 coalesce((select sum(requests) from public.tgg_creator_booking_pipeline b where b.creator_user_id=a.user_id and b.status in ('pending','requested','new')),0)::bigint pending_bookings,
 coalesce((select sum(checkins) from public.tgg_creator_event_performance e where e.creator_user_id=a.user_id and e.artist_id=a.id and e.starts_at>=now()-interval '30 days'),0)::bigint recent_event_checkins
from public.artists a;
revoke all on public.tgg_creator_command_center from anon; grant select on public.tgg_creator_command_center to authenticated;

-- ============================================================
-- MIGRATION 20260904063507 v3540_final_backend_hardening_indexes_and_dedup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create index if not exists tgg_creator_action_queue_owner_status_priority_idx on public.tgg_creator_action_queue(owner_user_id,status,priority desc,created_at desc);
create index if not exists tgg_creator_action_queue_source_idx on public.tgg_creator_action_queue(owner_user_id,source_type,source_id,action_type,status);
create index if not exists tgg_fan_intelligence_creator_state_idx on public.tgg_fan_intelligence_snapshots(creator_user_id,fan_state,engagement_score desc,calculated_at desc);
create index if not exists tgg_supporter_health_creator_state_idx on public.tgg_supporter_health_snapshots(creator_user_id,supporter_state,health_score,calculated_at desc);
create index if not exists tgg_booking_requests_provider_status_idx on public.tgg_booking_requests(provider_user_id,status,requested_at desc);
create index if not exists tgg_events_creator_starts_idx on public.tgg_events(created_by,starts_at desc,status);
create index if not exists tgg_live_events_host_schedule_idx on public.tgg_live_events(host_user_id,scheduled_at desc,status);
create index if not exists tgg_campaigns_owner_status_idx on public.tgg_campaigns(owner_user_id,status,updated_at desc);
create index if not exists tgg_campaign_tasks_owner_status_due_idx on public.tgg_campaign_tasks(owner_user_id,status,due_at);
create index if not exists tgg_release_checklist_owner_release_status_idx on public.tgg_release_checklist_items(owner_user_id,release_id,status);
create index if not exists tgg_smart_link_events_link_occurred_idx on public.tgg_smart_link_events(link_id,occurred_at desc);
create index if not exists tgg_smart_links_owner_active_idx on public.tgg_smart_links(owner_user_id,is_active,updated_at desc);
create index if not exists tgg_support_transactions_artist_status_paid_idx on public.tgg_support_transactions(artist_id,status,paid_at desc);
create index if not exists tgg_memberships_artist_status_period_idx on public.tgg_memberships(artist_id,status,current_period_end);

create or replace function public.tgg_dedupe_creator_open_actions()
returns integer language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_count integer:=0;
begin
 if v_uid is null then raise exception 'authentication required'; end if;
 with ranked as (
   select id,row_number() over(partition by owner_user_id,source_type,source_id,action_type order by priority desc,created_at asc,id) rn
   from public.tgg_creator_action_queue
   where owner_user_id=v_uid and status='open' and source_id is not null
 ), closed as (
   update public.tgg_creator_action_queue q set status='dismissed',updated_at=now(),metadata=coalesce(q.metadata,'{}'::jsonb)||jsonb_build_object('deduped_at',now())
   from ranked r where q.id=r.id and r.rn>1 returning q.id
 ) select count(*) into v_count from closed;
 return v_count;
end $$;
grant execute on function public.tgg_dedupe_creator_open_actions() to authenticated;
revoke all on function public.tgg_dedupe_creator_open_actions() from anon;

create or replace function public.tgg_run_creator_backend_maintenance()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_refresh jsonb; v_dedup integer;
begin
 if v_uid is null then raise exception 'authentication required'; end if;
 v_refresh:=public.tgg_refresh_creator_command_center();
 v_dedup:=public.tgg_dedupe_creator_open_actions();
 return jsonb_build_object('refreshed',v_refresh,'deduped_actions',v_dedup,'ran_at',now());
end $$;
grant execute on function public.tgg_run_creator_backend_maintenance() to authenticated;
revoke all on function public.tgg_run_creator_backend_maintenance() from anon;

-- ============================================================
-- MIGRATION 20260904063637 v3550_creator_backend_final_permission_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.tgg_dedupe_creator_open_actions() from public, anon;
revoke execute on function public.tgg_generate_event_booking_actions() from public, anon;
revoke execute on function public.tgg_generate_fan_followup_actions(uuid) from public, anon;
revoke execute on function public.tgg_generate_release_campaign_actions() from public, anon;
revoke execute on function public.tgg_generate_supporter_retention_actions() from public, anon;
revoke execute on function public.tgg_refresh_creator_command_center() from public, anon;
revoke execute on function public.tgg_refresh_fan_intelligence(uuid) from public, anon;
revoke execute on function public.tgg_refresh_supporter_health() from public, anon;
revoke execute on function public.tgg_run_creator_backend_maintenance() from public, anon;
grant execute on function public.tgg_dedupe_creator_open_actions() to authenticated;
grant execute on function public.tgg_generate_event_booking_actions() to authenticated;
grant execute on function public.tgg_generate_fan_followup_actions(uuid) to authenticated;
grant execute on function public.tgg_generate_release_campaign_actions() to authenticated;
grant execute on function public.tgg_generate_supporter_retention_actions() to authenticated;
grant execute on function public.tgg_refresh_creator_command_center() to authenticated;
grant execute on function public.tgg_refresh_fan_intelligence(uuid) to authenticated;
grant execute on function public.tgg_refresh_supporter_health() to authenticated;
grant execute on function public.tgg_run_creator_backend_maintenance() to authenticated;

-- ============================================================
-- MIGRATION 20260904063914 v3560_creator_dashboard_frontend_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_dashboard_bundle(p_artist_id uuid default null, p_action_limit integer default 8)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_limit integer := greatest(1, least(coalesce(p_action_limit,8), 25));
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select a.id into v_artist
  from public.artists a
  where a.user_id=v_uid and (p_artist_id is null or a.id=p_artist_id)
  order by a.created_at asc
  limit 1;

  if v_artist is null then raise exception 'artist profile not found'; end if;

  select jsonb_build_object(
    'artist', (select jsonb_build_object('id',a.id,'stage_name',a.stage_name,'avatar_url',a.avatar_url,'bio',a.bio,'stripe_onboarding_complete',coalesce(a.stripe_onboarding_complete,false),'payouts_enabled',coalesce(a.payouts_enabled,false)) from public.artists a where a.id=v_artist and a.user_id=v_uid),
    'command_center', coalesce((select to_jsonb(c) - 'creator_user_id' from public.tgg_creator_command_center c where c.creator_user_id=v_uid and c.artist_id=v_artist limit 1),'{}'::jsonb),
    'monetization', coalesce((select to_jsonb(m) - 'creator_user_id' from public.tgg_creator_monetization_summary m where m.creator_user_id=v_uid and m.artist_id=v_artist limit 1),'{}'::jsonb),
    'fan_intelligence', coalesce((select to_jsonb(f) - 'creator_user_id' from public.tgg_creator_fan_intelligence_summary f where f.creator_user_id=v_uid and f.artist_id=v_artist limit 1),'{}'::jsonb),
    'supporters', coalesce((select to_jsonb(s) - 'creator_user_id' from public.tgg_creator_supporter_summary s where s.creator_user_id=v_uid and s.artist_id=v_artist limit 1),'{}'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(q) order by q.priority desc,q.due_at nulls last,q.created_at desc) from (select id,source_type,source_id,action_type,title,rationale,priority,status,due_at,metadata,created_at from public.tgg_creator_action_queue where owner_user_id=v_uid and artist_id=v_artist and status='open' order by priority desc,due_at nulls last,created_at desc limit v_limit) q),'[]'::jsonb),
    'releases', coalesce((select jsonb_agg(to_jsonb(r) order by r.release_date desc nulls last,r.title) from (select release_id,title,status,release_date,play_count,download_count,checklist_items,checklist_done,readiness_percent,smart_link_clicks from public.tgg_creator_release_health where creator_user_id=v_uid and artist_id=v_artist order by release_date desc nulls last,title limit 12) r),'[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c) order by c.starts_at desc nulls last,c.title) from (select campaign_id,title,status,objective,target_value,current_value,starts_at,ends_at,task_count,tasks_done,objective_percent from public.tgg_creator_campaign_health where creator_user_id=v_uid and artist_id=v_artist order by starts_at desc nulls last,title limit 12) c),'[]'::jsonb),
    'generated_at', now()
  ) into v_result;

  return v_result;
end $$;

revoke execute on function public.tgg_get_creator_dashboard_bundle(uuid,integer) from public, anon;
grant execute on function public.tgg_get_creator_dashboard_bundle(uuid,integer) to authenticated;

-- ============================================================
-- MIGRATION 20260904063954 v3570_release_workspace_and_fan_crm_bundles
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_release_workspace_bundle(p_release_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select m.artist_id into v_artist from public.mixtapes m join public.artists a on a.id=m.artist_id where m.id=p_release_id and a.user_id=v_uid limit 1;
  if v_artist is null then raise exception 'release not found'; end if;
  select jsonb_build_object(
    'release',coalesce((select to_jsonb(r) - 'creator_user_id' from public.tgg_creator_release_health r where r.creator_user_id=v_uid and r.artist_id=v_artist and r.release_id=p_release_id limit 1),'{}'::jsonb),
    'checklist',coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at nulls last,x.label) from (select id,item_code,label,status,due_at,notes,updated_at from public.tgg_release_checklist_items where owner_user_id=v_uid and artist_id=v_artist and release_id=p_release_id) x),'[]'::jsonb),
    'credits',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.person_name) from (select id,track_id,person_name,role,tgg_user_id,notes,created_at from public.tgg_release_credits where owner_user_id=v_uid and artist_id=v_artist and release_id=p_release_id) x),'[]'::jsonb),
    'clearance',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc,x.item_type) from (select id,item_type,description,source_name,permission_status,proof_url,notes,created_at,updated_at from public.tgg_clearance_items where owner_user_id=v_uid and artist_id=v_artist and release_id=p_release_id) x),'[]'::jsonb),
    'smart_links',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,title,slug,destination_type,destinations,click_count,is_active,created_at,updated_at from public.tgg_smart_links where owner_user_id=v_uid and artist_id=v_artist and release_id=p_release_id) x),'[]'::jsonb),
    'generated_at',now()
  ) into v_result;
  return v_result;
end $$;

create or replace function public.tgg_get_creator_fan_crm_bundle(p_artist_id uuid default null,p_limit integer default 50)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_artist uuid;
  v_limit integer := greatest(1,least(coalesce(p_limit,50),200));
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select a.id into v_artist from public.artists a where a.user_id=v_uid and (p_artist_id is null or a.id=p_artist_id) order by a.created_at asc limit 1;
  if v_artist is null then raise exception 'artist profile not found'; end if;
  select jsonb_build_object(
    'summary',coalesce((select to_jsonb(s)-'creator_user_id' from public.tgg_creator_fan_intelligence_summary s where s.creator_user_id=v_uid and s.artist_id=v_artist limit 1),'{}'::jsonb),
    'fans',coalesce((select jsonb_agg(to_jsonb(x) order by x.engagement_score desc,x.last_seen_at desc nulls last) from (
      select c.id,c.fan_user_id,c.segment,c.tags,c.private_notes,c.last_contacted_at,c.updated_at,
             i.engagement_score,i.recency_score,i.loyalty_score,i.fan_state,i.recommended_action,i.last_seen_at
      from public.tgg_fan_crm c
      left join public.tgg_fan_intelligence_snapshots i on i.creator_user_id=c.creator_user_id and i.artist_id=c.artist_id and i.fan_user_id=c.fan_user_id
      where c.creator_user_id=v_uid and c.artist_id=v_artist
      order by coalesce(i.engagement_score,0) desc,i.last_seen_at desc nulls last,c.updated_at desc
      limit v_limit
    ) x),'[]'::jsonb),
    'generated_at',now()
  ) into v_result;
  return v_result;
end $$;

revoke execute on function public.tgg_get_creator_release_workspace_bundle(uuid) from public, anon;
revoke execute on function public.tgg_get_creator_fan_crm_bundle(uuid,integer) from public, anon;
grant execute on function public.tgg_get_creator_release_workspace_bundle(uuid) to authenticated;
grant execute on function public.tgg_get_creator_fan_crm_bundle(uuid,integer) to authenticated;

-- ============================================================
-- MIGRATION 20260904064121 v3580_creator_growth_live_opportunity_bundles
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_growth_workspace_bundle(p_artist_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; result jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select a.id into aid from public.artists a where a.user_id=uid and (p_artist_id is null or a.id=p_artist_id) order by a.created_at limit 1;
 if aid is null then raise exception 'artist not found'; end if;
 select jsonb_build_object(
  'goals',coalesce((select jsonb_agg(to_jsonb(g) order by g.deadline nulls last) from public.tgg_creator_goals g where g.owner_user_id=uid and g.artist_id=aid),'[]'::jsonb),
  'campaigns',coalesce((select jsonb_agg(to_jsonb(c) order by c.starts_at desc nulls last) from public.tgg_creator_campaign_health c where c.creator_user_id=uid and c.artist_id=aid),'[]'::jsonb),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.due_at nulls last) from public.tgg_campaign_tasks t join public.tgg_campaigns c on c.id=t.campaign_id where t.owner_user_id=uid and c.artist_id=aid and t.status not in ('done','completed')),'[]'::jsonb),
  'actions',coalesce((select jsonb_agg(to_jsonb(q) order by q.priority desc,q.created_at desc) from (select * from public.tgg_creator_action_queue where owner_user_id=uid and artist_id=aid and status='open' and action_type in ('promote_release','improve_campaign','create_smart_link','complete_release_checklist') order by priority desc,created_at desc limit 20) q),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.tgg_get_creator_live_booking_bundle(p_artist_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; result jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select a.id into aid from public.artists a where a.user_id=uid and (p_artist_id is null or a.id=p_artist_id) order by a.created_at limit 1;
 if aid is null then raise exception 'artist not found'; end if;
 select jsonb_build_object(
  'bookings',coalesce((select jsonb_agg(to_jsonb(b) order by b.requested_at desc) from (select * from public.tgg_booking_requests where provider_user_id=uid order by requested_at desc limit 50) b),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.starts_at) from (select * from public.tgg_events where created_by=uid and artist_id=aid and starts_at>=now()-interval '1 day' order by starts_at limit 30) e),'[]'::jsonb),
  'live',coalesce((select jsonb_agg(to_jsonb(l) order by l.scheduled_at nulls last) from (select * from public.tgg_live_events where host_user_id=uid and artist_id=aid and coalesce(ended_at,scheduled_at,created_at)>=now()-interval '7 days' order by scheduled_at nulls last limit 30) l),'[]'::jsonb),
  'actions',coalesce((select jsonb_agg(to_jsonb(q) order by q.priority desc,q.created_at desc) from (select * from public.tgg_creator_action_queue where owner_user_id=uid and artist_id=aid and status='open' and action_type in ('respond_booking','promote_event','prepare_live') order by priority desc,created_at desc limit 20) q),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.tgg_get_creator_opportunity_bundle(p_artist_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; result jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select a.id into aid from public.artists a where a.user_id=uid and (p_artist_id is null or a.id=p_artist_id) order by a.created_at limit 1;
 if aid is null then raise exception 'artist not found'; end if;
 select jsonb_build_object(
  'matches',coalesce(public.tgg_get_opportunity_matches(aid,20),'[]'::jsonb),
  'applications',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select ap.*,o.title as opportunity_title,o.opportunity_type,o.deadline from public.tgg_opportunity_applications ap join public.tgg_opportunities o on o.id=ap.opportunity_id where ap.applicant_user_id=uid order by ap.created_at desc limit 50) x),'[]'::jsonb),
  'created',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (select * from public.tgg_opportunities where created_by=uid order by created_at desc limit 30) o),'[]'::jsonb)
 ) into result;
 return result;
end $$;

revoke execute on function public.tgg_get_creator_growth_workspace_bundle(uuid) from public,anon;
revoke execute on function public.tgg_get_creator_live_booking_bundle(uuid) from public,anon;
revoke execute on function public.tgg_get_creator_opportunity_bundle(uuid) from public,anon;
grant execute on function public.tgg_get_creator_growth_workspace_bundle(uuid) to authenticated;
grant execute on function public.tgg_get_creator_live_booking_bundle(uuid) to authenticated;
grant execute on function public.tgg_get_creator_opportunity_bundle(uuid) to authenticated;

-- ============================================================
-- MIGRATION 20260904064241 v3590_supporters_revenue_career_workspace_bundles
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_supporters_revenue_bundle(p_artist_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; result jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select id into aid from public.artists where user_id=uid and (p_artist_id is null or id=p_artist_id) order by created_at limit 1;
 if aid is null then raise exception 'artist not found'; end if;
 select jsonb_build_object(
 'summary',coalesce((select to_jsonb(s) from public.tgg_creator_supporter_summary s where s.creator_user_id=uid and s.artist_id=aid),'{}'::jsonb),
 'monetization',coalesce((select to_jsonb(m) from public.tgg_creator_monetization_summary m where m.creator_user_id=uid and m.artist_id=aid),'{}'::jsonb),
 'tiers',coalesce((select jsonb_agg(to_jsonb(t) order by t.price_cents) from public.tgg_membership_tiers t where t.artist_id=aid),'[]'::jsonb),
 'memberships',coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at desc) from (select m.id,m.tier_id,m.artist_id,m.fan_user_id,m.status,m.started_at,m.current_period_end,m.cancel_at_period_end from public.tgg_memberships m where m.artist_id=aid order by m.started_at desc limit 100) x),'[]'::jsonb),
 'transactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.paid_at desc nulls last) from (select id,transaction_type,amount_cents,currency,platform_fee_cents,status,created_at,paid_at from public.tgg_support_transactions where artist_id=aid order by paid_at desc nulls last,created_at desc limit 100) x),'[]'::jsonb),
 'actions',coalesce((select jsonb_agg(to_jsonb(q) order by q.priority desc,q.created_at desc) from (select * from public.tgg_creator_action_queue where owner_user_id=uid and artist_id=aid and status='open' and action_type in ('retain_supporter','win_back_supporter','welcome_supporter','reward_supporter') order by priority desc,created_at desc limit 30) q),'[]'::jsonb)
 ) into result; return result;
end $$;

create or replace function public.tgg_get_creator_career_workspace_bundle(p_artist_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; result jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select id into aid from public.artists where user_id=uid and (p_artist_id is null or id=p_artist_id) order by created_at limit 1;
 if aid is null then raise exception 'artist not found'; end if;
 select jsonb_build_object(
 'resume',coalesce((select to_jsonb(r) from public.tgg_creator_resume r where r.owner_user_id=uid and r.artist_id=aid),'{}'::jsonb),
 'epk',coalesce((select to_jsonb(e) from public.tgg_epk_settings e where e.owner_user_id=uid and e.artist_id=aid),'{}'::jsonb),
 'press',coalesce((select jsonb_agg(to_jsonb(p) order by p.published_at desc nulls last) from public.tgg_press_items p where p.owner_user_id=uid and p.artist_id=aid),'[]'::jsonb),
 'academy',coalesce((select jsonb_agg(to_jsonb(a) order by a.updated_at desc) from public.tgg_academy_progress a where a.user_id=uid),'[]'::jsonb),
 'mentorship',coalesce((select jsonb_agg(to_jsonb(m) order by m.requested_at desc) from (select * from public.tgg_mentorship_requests where requester_user_id=uid or mentor_user_id=uid order by requested_at desc limit 50) m),'[]'::jsonb),
 'feedback',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc) from (select * from public.tgg_feedback_requests where owner_user_id=uid and artist_id=aid order by created_at desc limit 50) f),'[]'::jsonb)
 ) into result; return result;
end $$;

create or replace function public.tgg_get_creator_workspace_manifest()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select id into aid from public.artists where user_id=uid order by created_at limit 1;
 return jsonb_build_object('artist_id',aid,'workspaces',jsonb_build_array(
 jsonb_build_object('key','dashboard','label','Command Center','rpc','tgg_get_creator_dashboard_bundle'),
 jsonb_build_object('key','releases','label','Release Pro','rpc','tgg_get_creator_release_workspace_bundle'),
 jsonb_build_object('key','fans','label','Fan CRM','rpc','tgg_get_creator_fan_crm_bundle'),
 jsonb_build_object('key','growth','label','Growth','rpc','tgg_get_creator_growth_workspace_bundle'),
 jsonb_build_object('key','live','label','LIVE + Bookings','rpc','tgg_get_creator_live_booking_bundle'),
 jsonb_build_object('key','opportunities','label','Opportunities','rpc','tgg_get_creator_opportunity_bundle'),
 jsonb_build_object('key','supporters','label','Supporters + Revenue','rpc','tgg_get_creator_supporters_revenue_bundle'),
 jsonb_build_object('key','career','label','Career + EPK','rpc','tgg_get_creator_career_workspace_bundle')));
end $$;

revoke execute on function public.tgg_get_creator_supporters_revenue_bundle(uuid) from public,anon;
revoke execute on function public.tgg_get_creator_career_workspace_bundle(uuid) from public,anon;
revoke execute on function public.tgg_get_creator_workspace_manifest() from public,anon;
grant execute on function public.tgg_get_creator_supporters_revenue_bundle(uuid) to authenticated;
grant execute on function public.tgg_get_creator_career_workspace_bundle(uuid) to authenticated;
grant execute on function public.tgg_get_creator_workspace_manifest() to authenticated;

-- ============================================================
-- MIGRATION 20260904064350 v3600_creator_shell_notifications_bundle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_shell_bundle()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; result jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select id into aid from public.artists where user_id=uid order by created_at limit 1;
 select jsonb_build_object(
  'artist_id',aid,
  'manifest',public.tgg_get_creator_workspace_manifest(),
  'notifications',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select id,notification_type,entity_type,entity_id,title,body,read_at,created_at from public.notifications where recipient_id=uid order by created_at desc limit 30) n),'[]'::jsonb),
  'unread_notifications',(select count(*) from public.notifications where recipient_id=uid and read_at is null),
  'digest_preferences',coalesce((select to_jsonb(p) from public.tgg_creator_digest_preferences p where p.user_id=uid),'{}'::jsonb),
  'command_center',coalesce((select to_jsonb(c) from public.tgg_creator_command_center c where c.creator_user_id=uid and c.artist_id=aid),'{}'::jsonb),
  'top_actions',coalesce((select jsonb_agg(to_jsonb(q) order by q.priority desc,q.created_at desc) from (select id,action_type,title,rationale,priority,due_at,metadata,created_at from public.tgg_creator_action_queue where owner_user_id=uid and (aid is null or artist_id=aid) and status='open' order by priority desc,created_at desc limit 8) q),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.tgg_mark_creator_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); n integer;
begin
 if uid is null then raise exception 'authentication required'; end if;
 update public.notifications set read_at=coalesce(read_at,now()) where recipient_id=uid and read_at is null and (p_ids is null or id=any(p_ids));
 get diagnostics n=row_count; return n;
end $$;

revoke execute on function public.tgg_get_creator_shell_bundle() from public,anon;
revoke execute on function public.tgg_mark_creator_notifications_read(uuid[]) from public,anon;
grant execute on function public.tgg_get_creator_shell_bundle() to authenticated;
grant execute on function public.tgg_mark_creator_notifications_read(uuid[]) to authenticated;

-- ============================================================
-- MIGRATION 20260904064507 v3610_messenger_music_account_frontend_contracts
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_communications_bundle()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'authentication required'; end if;
 return jsonb_build_object(
  'messenger',coalesce((select jsonb_agg(to_jsonb(x) order by x.last_message_at desc nulls last) from (select * from public.creator_messenger_inbox_v1 order by last_message_at desc nulls last limit 50) x),'[]'::jsonb),
  'collaborations',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc nulls last) from (select * from public.creator_collaboration_inbox_v1 order by updated_at desc nulls last limit 50) x),'[]'::jsonb),
  'unread_messages',coalesce((select sum(unread_messages) from public.creator_messenger_inbox_v1),0),
  'pending_collaborations',coalesce((select count(*) from public.creator_collaboration_inbox_v1 where direction='incoming' and status in ('pending','requested','open')),0)
 );
end $$;

create or replace function public.tgg_get_user_music_library_bundle()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'authentication required'; end if;
 return jsonb_build_object(
  'library',coalesce((select jsonb_agg(to_jsonb(x) order by x.saved_at desc) from (select * from public.fan_library where fan_user_id=uid order by saved_at desc limit 100) x),'[]'::jsonb),
  'following_feed',coalesce((select jsonb_agg(to_jsonb(x) order by x.release_date desc nulls last) from (select * from public.fan_following_feed where fan_user_id=uid order by release_date desc nulls last limit 50) x),'[]'::jsonb),
  'collections',coalesce((select jsonb_agg(to_jsonb(x) order by x.updated_at desc) from (select * from public.fan_collection_summary where user_id=uid order by updated_at desc limit 50) x),'[]'::jsonb),
  'playlists',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'is_public',p.is_public,'created_at',p.created_at,'updated_at',p.updated_at,'item_count',(select count(*) from public.tgg_playlist_items i where i.playlist_id=p.id)) order by p.updated_at desc) from public.tgg_playlists p where p.user_id=uid),'[]'::jsonb)
 );
end $$;

create or replace function public.tgg_get_frontend_api_contract()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'authentication required'; end if;
 return jsonb_build_object(
 'version','v3610',
 'shell','tgg_get_creator_shell_bundle',
 'account','tgg_get_account_workspace_bundle',
 'communications','tgg_get_creator_communications_bundle',
 'music_library','tgg_get_user_music_library_bundle',
 'creator_workspaces',jsonb_build_object(
 'dashboard','tgg_get_creator_dashboard_bundle','releases','tgg_get_creator_release_workspace_bundle','fans','tgg_get_creator_fan_crm_bundle','growth','tgg_get_creator_growth_workspace_bundle','live_bookings','tgg_get_creator_live_booking_bundle','opportunities','tgg_get_creator_opportunity_bundle','supporters_revenue','tgg_get_creator_supporters_revenue_bundle','career_epk','tgg_get_creator_career_workspace_bundle'),
 'mutations',jsonb_build_object('mark_notifications_read','tgg_mark_creator_notifications_read','set_action_status','tgg_set_creator_action_status','maintenance','tgg_run_creator_backend_maintenance')
 );
end $$;

revoke execute on function public.tgg_get_creator_communications_bundle() from public,anon;
revoke execute on function public.tgg_get_user_music_library_bundle() from public,anon;
revoke execute on function public.tgg_get_frontend_api_contract() from public,anon;
grant execute on function public.tgg_get_creator_communications_bundle() to authenticated;
grant execute on function public.tgg_get_user_music_library_bundle() to authenticated;
grant execute on function public.tgg_get_frontend_api_contract() to authenticated;

-- ============================================================
-- MIGRATION 20260904064710 v3620_frontend_integration_health_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_frontend_integration_health()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select id into aid from public.artists where user_id=uid order by created_at limit 1;
 return jsonb_build_object(
  'ok',true,
  'authenticated',true,
  'artist_ready',aid is not null,
  'artist_id',aid,
  'server_time',now(),
  'contracts',public.tgg_get_frontend_api_contract(),
  'shell_ready',true,
  'maintenance_available',true,
  'version','v3620'
 );
end $$;

create or replace function public.tgg_get_creator_bootstrap_bundle()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); shell jsonb; health jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 shell:=public.tgg_get_creator_shell_bundle();
 health:=public.tgg_get_frontend_integration_health();
 return jsonb_build_object(
  'status','ready',
  'health',health,
  'shell',shell,
  'account',public.tgg_get_account_workspace_bundle(20),
  'loaded_at',now()
 );
end $$;

revoke execute on function public.tgg_get_frontend_integration_health() from public,anon;
revoke execute on function public.tgg_get_creator_bootstrap_bundle() from public,anon;
grant execute on function public.tgg_get_frontend_integration_health() to authenticated;
grant execute on function public.tgg_get_creator_bootstrap_bundle() to authenticated;

-- ============================================================
-- MIGRATION 20260904065108 v3630_creator_ui_config_and_route_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_creator_ui_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 default_workspace text not null default 'dashboard',
 compact_mode boolean not null default false,
 sidebar_collapsed boolean not null default false,
 reduce_motion boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.tgg_creator_ui_preferences enable row level security;
drop policy if exists creator_ui_preferences_select on public.tgg_creator_ui_preferences;
create policy creator_ui_preferences_select on public.tgg_creator_ui_preferences for select to authenticated using (user_id=auth.uid());
drop policy if exists creator_ui_preferences_insert on public.tgg_creator_ui_preferences;
create policy creator_ui_preferences_insert on public.tgg_creator_ui_preferences for insert to authenticated with check (user_id=auth.uid());
drop policy if exists creator_ui_preferences_update on public.tgg_creator_ui_preferences;
create policy creator_ui_preferences_update on public.tgg_creator_ui_preferences for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
revoke all on public.tgg_creator_ui_preferences from anon;
grant select,insert,update on public.tgg_creator_ui_preferences to authenticated;

create or replace function public.tgg_get_creator_ui_contract()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); prefs jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select to_jsonb(p) into prefs from public.tgg_creator_ui_preferences p where p.user_id=uid;
 return jsonb_build_object(
  'version','3630',
  'preferences',coalesce(prefs,jsonb_build_object('user_id',uid,'default_workspace','dashboard','compact_mode',false,'sidebar_collapsed',false,'reduce_motion',false)),
  'routes',jsonb_build_array(
   jsonb_build_object('key','dashboard','label','Command Center','icon','home','rpc','tgg_get_creator_dashboard_bundle'),
   jsonb_build_object('key','releases','label','Release Pro','icon','disc','rpc','tgg_get_creator_release_workspace_bundle'),
   jsonb_build_object('key','fans','label','Fan CRM','icon','users','rpc','tgg_get_creator_fan_crm_bundle'),
   jsonb_build_object('key','growth','label','Growth','icon','trending-up','rpc','tgg_get_creator_growth_workspace_bundle'),
   jsonb_build_object('key','messages','label','Messenger','icon','message-circle','rpc','tgg_get_creator_communications_bundle'),
   jsonb_build_object('key','live','label','LIVE + Bookings','icon','radio','rpc','tgg_get_creator_live_booking_bundle'),
   jsonb_build_object('key','opportunities','label','Opportunities','icon','briefcase','rpc','tgg_get_creator_opportunity_bundle'),
   jsonb_build_object('key','supporters','label','Supporters + Revenue','icon','heart','rpc','tgg_get_creator_supporters_revenue_bundle'),
   jsonb_build_object('key','career','label','Career + EPK','icon','badge','rpc','tgg_get_creator_career_workspace_bundle'),
   jsonb_build_object('key','library','label','Music Library','icon','music','rpc','tgg_get_user_music_library_bundle')
  ),
  'states',jsonb_build_object('loading','Loading workspace…','empty','Nothing here yet.','error','Could not load this workspace. Try again.'),
  'bootstrap_rpc','tgg_get_creator_bootstrap_bundle'
 );
end $$;

create or replace function public.tgg_set_creator_ui_preferences(p_default_workspace text default null,p_compact_mode boolean default null,p_sidebar_collapsed boolean default null,p_reduce_motion boolean default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); outrow jsonb; allowed text[]:=array['dashboard','releases','fans','growth','messages','live','opportunities','supporters','career','library'];
begin
 if uid is null then raise exception 'authentication required'; end if;
 if p_default_workspace is not null and not (p_default_workspace=any(allowed)) then raise exception 'invalid workspace'; end if;
 insert into public.tgg_creator_ui_preferences(user_id,default_workspace,compact_mode,sidebar_collapsed,reduce_motion)
 values(uid,coalesce(p_default_workspace,'dashboard'),coalesce(p_compact_mode,false),coalesce(p_sidebar_collapsed,false),coalesce(p_reduce_motion,false))
 on conflict(user_id) do update set
 default_workspace=coalesce(p_default_workspace,tgg_creator_ui_preferences.default_workspace),
 compact_mode=coalesce(p_compact_mode,tgg_creator_ui_preferences.compact_mode),
 sidebar_collapsed=coalesce(p_sidebar_collapsed,tgg_creator_ui_preferences.sidebar_collapsed),
 reduce_motion=coalesce(p_reduce_motion,tgg_creator_ui_preferences.reduce_motion),updated_at=now()
 returning to_jsonb(tgg_creator_ui_preferences.*) into outrow;
 return outrow;
end $$;
revoke execute on function public.tgg_get_creator_ui_contract() from public,anon;
revoke execute on function public.tgg_set_creator_ui_preferences(text,boolean,boolean,boolean) from public,anon;
grant execute on function public.tgg_get_creator_ui_contract() to authenticated;
grant execute on function public.tgg_set_creator_ui_preferences(text,boolean,boolean,boolean) to authenticated;

-- ============================================================
-- MIGRATION 20260904065204 v3640_creator_ui_workspace_schema
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_workspace_schema(p_workspace text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); cfg jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 cfg:=case p_workspace
 when 'dashboard' then jsonb_build_object('title','Command Center','rpc','tgg_get_creator_dashboard_bundle','sections',jsonb_build_array('command_center','actions','releases','campaigns','monetization','fan_intelligence','supporters'))
 when 'releases' then jsonb_build_object('title','Release Pro','rpc','tgg_get_creator_release_workspace_bundle','sections',jsonb_build_array('release','checklist','credits','clearance','smart_links'))
 when 'fans' then jsonb_build_object('title','Fan CRM','rpc','tgg_get_creator_fan_crm_bundle','sections',jsonb_build_array('summary','fans'))
 when 'growth' then jsonb_build_object('title','Growth','rpc','tgg_get_creator_growth_workspace_bundle','sections',jsonb_build_array('goals','campaigns','tasks','actions'))
 when 'messages' then jsonb_build_object('title','Messenger','rpc','tgg_get_creator_communications_bundle','sections',jsonb_build_array('inbox','collaborations'))
 when 'live' then jsonb_build_object('title','LIVE + Bookings','rpc','tgg_get_creator_live_booking_bundle','sections',jsonb_build_array('bookings','events','live','actions'))
 when 'opportunities' then jsonb_build_object('title','Opportunities','rpc','tgg_get_creator_opportunity_bundle','sections',jsonb_build_array('matches','applications','created'))
 when 'supporters' then jsonb_build_object('title','Supporters + Revenue','rpc','tgg_get_creator_supporters_revenue_bundle','sections',jsonb_build_array('summary','monetization','tiers','memberships','transactions','actions'))
 when 'career' then jsonb_build_object('title','Career + EPK','rpc','tgg_get_creator_career_workspace_bundle','sections',jsonb_build_array('resume','epk','press','academy','mentorship','feedback'))
 when 'library' then jsonb_build_object('title','Music Library','rpc','tgg_get_user_music_library_bundle','sections',jsonb_build_array('saved','following','collections','playlists'))
 else null end;
 if cfg is null then raise exception 'unknown workspace'; end if;
 return cfg || jsonb_build_object('key',p_workspace,'ui',jsonb_build_object('layout','responsive-grid','skeleton',true,'empty_state',true,'error_retry',true,'mobile_stack',true));
end $$;

create or replace function public.tgg_get_creator_ui_bootstrap()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); contract jsonb; shell jsonb;
begin
 if uid is null then raise exception 'authentication required'; end if;
 contract:=public.tgg_get_creator_ui_contract();
 shell:=public.tgg_get_creator_shell_bundle();
 return jsonb_build_object('version','3640','contract',contract,'shell',shell,'capabilities',jsonb_build_object('responsive',true,'mobile_navigation',true,'loading_states',true,'empty_states',true,'retry_states',true,'preferences',true));
end $$;
revoke execute on function public.tgg_get_creator_workspace_schema(text) from public,anon;
revoke execute on function public.tgg_get_creator_ui_bootstrap() from public,anon;
grant execute on function public.tgg_get_creator_workspace_schema(text) to authenticated;
grant execute on function public.tgg_get_creator_ui_bootstrap() to authenticated;

-- ============================================================
-- MIGRATION 20260904065259 v3650_creator_ui_action_registry
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_ui_action_registry()
returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 return jsonb_build_object(
 'version','3650','actions',jsonb_build_array(
  jsonb_build_object('key','notifications_read','workspace','dashboard','rpc','tgg_mark_creator_notifications_read','mode','mutation','confirm',false),
  jsonb_build_object('key','action_status','workspace','dashboard','rpc','tgg_set_creator_action_status','mode','mutation','confirm',false),
  jsonb_build_object('key','save_release','workspace','library','rpc','tgg_toggle_release_save','mode','mutation','confirm',false),
  jsonb_build_object('key','follow_artist','workspace','library','rpc','tgg_toggle_artist_follow','mode','mutation','confirm',false),
  jsonb_build_object('key','react_release','workspace','library','rpc','tgg_set_release_reaction','mode','mutation','confirm',false),
  jsonb_build_object('key','comment_release','workspace','library','rpc','tgg_add_release_comment','mode','mutation','confirm',false),
  jsonb_build_object('key','send_message','workspace','messages','rpc','tgg_send_message','mode','mutation','confirm',false),
  jsonb_build_object('key','conversation_status','workspace','messages','rpc','tgg_set_conversation_status','mode','mutation','confirm',false),
  jsonb_build_object('key','create_collab','workspace','messages','rpc','tgg_create_collaboration_request','mode','mutation','confirm',false),
  jsonb_build_object('key','respond_collab','workspace','messages','rpc','tgg_respond_collaboration_request','mode','mutation','confirm',true),
  jsonb_build_object('key','cancel_collab','workspace','messages','rpc','tgg_cancel_collaboration_request','mode','mutation','confirm',true),
  jsonb_build_object('key','start_call','workspace','messages','rpc','tgg_start_call_room','mode','mutation','confirm',false),
  jsonb_build_object('key','save_listening_progress','workspace','library','rpc','tgg_save_listening_progress','mode','background','confirm',false),
  jsonb_build_object('key','ui_preferences','workspace','global','rpc','tgg_set_creator_ui_preferences','mode','mutation','confirm',false)
 ),
 'behavior',jsonb_build_object('optimistic_updates',jsonb_build_array('notifications_read','save_release','follow_artist','react_release','ui_preferences'),'disable_while_pending',true,'retry_reads',true,'retry_mutations',false,'toast_success',true,'toast_error',true)
 );
end $$;

create or replace function public.tgg_get_creator_ui_runtime_contract()
returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 return jsonb_build_object('version','3650','bootstrap',public.tgg_get_creator_ui_bootstrap(),'actions',public.tgg_get_creator_ui_action_registry(),'runtime',jsonb_build_object('request_timeout_ms',15000,'debounce_ms',250,'notification_page_size',30,'fan_page_size',50,'mobile_breakpoint_px',768,'cache',jsonb_build_object('shell_seconds',30,'workspace_seconds',15,'contract_seconds',300)));
end $$;
revoke execute on function public.tgg_get_creator_ui_action_registry() from public,anon;
revoke execute on function public.tgg_get_creator_ui_runtime_contract() from public,anon;
grant execute on function public.tgg_get_creator_ui_action_registry() to authenticated;
grant execute on function public.tgg_get_creator_ui_runtime_contract() to authenticated;

-- ============================================================
-- MIGRATION 20260904065518 v3660_creator_ui_component_binding_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_ui_component_contract(p_workspace text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare cfg jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 cfg:=case p_workspace
 when 'dashboard' then jsonb_build_object('workspace','dashboard','components',jsonb_build_array(
  jsonb_build_object('key','command_center','type','stat_grid','source','command_center','fields',jsonb_build_array('open_actions','urgent_actions','releases_needing_work','active_campaigns','active_supporters','gross_support_cents','pending_bookings','recent_event_checkins')),
  jsonb_build_object('key','actions','type','priority_list','source','actions','title_field','title','subtitle_field','rationale','badge_field','priority','empty','No open actions.'),
  jsonb_build_object('key','releases','type','release_cards','source','releases','title_field','title','status_field','status','metric_fields',jsonb_build_array('readiness_percent','play_count','download_count')),
  jsonb_build_object('key','campaigns','type','progress_cards','source','campaigns','title_field','title','progress_field','objective_percent','status_field','status')
 ))
 when 'releases' then jsonb_build_object('workspace','releases','components',jsonb_build_array(
  jsonb_build_object('key','release','type','hero_summary','source','release','title_field','title','status_field','status'),
  jsonb_build_object('key','checklist','type','checklist','source','checklist','label_field','label','status_field','status','due_field','due_at'),
  jsonb_build_object('key','credits','type','table','source','credits','columns',jsonb_build_array('person_name','role','notes')),
  jsonb_build_object('key','clearance','type','table','source','clearance','columns',jsonb_build_array('item_type','description','permission_status','source_name')),
  jsonb_build_object('key','smart_links','type','link_cards','source','smart_links','title_field','title','slug_field','slug','metric_field','click_count')
 ))
 when 'fans' then jsonb_build_object('workspace','fans','components',jsonb_build_array(
  jsonb_build_object('key','summary','type','stat_grid','source','summary','fields',jsonb_build_array('fan_records','active_fans','superfans','supporters','slipping_fans','dormant_fans')),
  jsonb_build_object('key','fans','type','crm_table','source','fans','columns',jsonb_build_array('fan_state','engagement_score','recency_score','loyalty_score','segment','recommended_action','last_seen_at'))
 ))
 when 'growth' then jsonb_build_object('workspace','growth','components',jsonb_build_array(
  jsonb_build_object('key','goals','type','progress_cards','source','goals','title_field','title','value_field','current_value','target_field','target_value','status_field','status'),
  jsonb_build_object('key','campaigns','type','progress_cards','source','campaigns','title_field','title','progress_field','objective_percent'),
  jsonb_build_object('key','tasks','type','task_list','source','tasks','title_field','title','status_field','status','due_field','due_at'),
  jsonb_build_object('key','actions','type','priority_list','source','actions','title_field','title','subtitle_field','rationale')
 ))
 when 'messages' then jsonb_build_object('workspace','messages','components',jsonb_build_array(
  jsonb_build_object('key','inbox','type','conversation_list','source','inbox','title_field','title','preview_field','last_message','unread_field','unread_messages','time_field','last_message_at'),
  jsonb_build_object('key','collaborations','type','request_list','source','collaborations','title_field','project_title','status_field','status','direction_field','direction')
 ))
 when 'live' then jsonb_build_object('workspace','live','components',jsonb_build_array(
  jsonb_build_object('key','bookings','type','booking_table','source','bookings','columns',jsonb_build_array('service','status','requested_at','scheduled_for','budget_cents')),
  jsonb_build_object('key','events','type','event_cards','source','events','title_field','title','time_field','starts_at','status_field','status'),
  jsonb_build_object('key','live','type','live_cards','source','live','title_field','title','status_field','status','time_field','scheduled_at'),
  jsonb_build_object('key','actions','type','priority_list','source','actions','title_field','title','subtitle_field','rationale')
 ))
 when 'opportunities' then jsonb_build_object('workspace','opportunities','components',jsonb_build_array(
  jsonb_build_object('key','matches','type','opportunity_cards','source','matches','title_field','title','type_field','opportunity_type','deadline_field','deadline'),
  jsonb_build_object('key','applications','type','application_table','source','applications','columns',jsonb_build_array('title','opportunity_type','status','deadline','created_at')),
  jsonb_build_object('key','created','type','opportunity_cards','source','created','title_field','title','status_field','status','deadline_field','deadline')
 ))
 when 'supporters' then jsonb_build_object('workspace','supporters','components',jsonb_build_array(
  jsonb_build_object('key','summary','type','stat_grid','source','summary','fields',jsonb_build_array('supporter_records','active_supporters','at_risk_supporters','churned_supporters','tracked_lifetime_support_cents','average_health_score')),
  jsonb_build_object('key','monetization','type','revenue_stats','source','monetization','fields',jsonb_build_array('gross_support_cents','platform_fee_cents','paid_transactions','active_supporters')),
  jsonb_build_object('key','tiers','type','tier_cards','source','tiers','title_field','name','price_field','price_cents','active_field','is_active'),
  jsonb_build_object('key','memberships','type','membership_table','source','memberships','columns',jsonb_build_array('status','started_at','current_period_end','cancel_at_period_end')),
  jsonb_build_object('key','transactions','type','transaction_table','source','transactions','columns',jsonb_build_array('transaction_type','amount_cents','platform_fee_cents','status','created_at'))
 ))
 when 'career' then jsonb_build_object('workspace','career','components',jsonb_build_array(
  jsonb_build_object('key','resume','type','profile_panel','source','resume'),
  jsonb_build_object('key','epk','type','profile_panel','source','epk'),
  jsonb_build_object('key','press','type','press_list','source','press','title_field','title','publication_field','publication','date_field','published_at'),
  jsonb_build_object('key','academy','type','progress_list','source','academy','label_field','course_code','progress_field','progress_percent'),
  jsonb_build_object('key','mentorship','type','request_list','source','mentorship','title_field','topic','status_field','status'),
  jsonb_build_object('key','feedback','type','request_list','source','feedback','title_field','title','status_field','status')
 ))
 when 'library' then jsonb_build_object('workspace','library','components',jsonb_build_array(
  jsonb_build_object('key','saved','type','release_grid','source','saved','title_field','title','artist_field','stage_name','cover_field','cover_url'),
  jsonb_build_object('key','following','type','release_grid','source','following','title_field','title','artist_field','stage_name','cover_field','cover_url'),
  jsonb_build_object('key','collections','type','collection_cards','source','collections','title_field','name','count_field','release_count'),
  jsonb_build_object('key','playlists','type','playlist_cards','source','playlists','title_field','name','count_field','item_count')
 ))
 else null end;
 if cfg is null then raise exception 'unknown workspace'; end if;
 return cfg;
end $$;

create or replace function public.tgg_get_creator_ui_full_contract()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare ws text; bindings jsonb:='{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 foreach ws in array array['dashboard','releases','fans','growth','messages','live','opportunities','supporters','career','library'] loop
  bindings:=bindings || jsonb_build_object(ws,public.tgg_get_creator_ui_component_contract(ws));
 end loop;
 return jsonb_build_object('version','3660','runtime',public.tgg_get_creator_ui_runtime_contract(),'bindings',bindings,'display',jsonb_build_object('currency','USD','date_format','MMM D, YYYY','datetime_format','MMM D, YYYY h:mm A','number_compact',true,'percent_suffix','%'));
end $$;
revoke execute on function public.tgg_get_creator_ui_component_contract(text) from public,anon;
revoke execute on function public.tgg_get_creator_ui_full_contract() from public,anon;
grant execute on function public.tgg_get_creator_ui_component_contract(text) to authenticated;
grant execute on function public.tgg_get_creator_ui_full_contract() to authenticated;

-- ============================================================
-- MIGRATION 20260904065651 v3670_creator_ui_interaction_state
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_creator_ui_workspace_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace text not null,
  search_query text,
  filter_state jsonb not null default '{}'::jsonb,
  sort_key text,
  sort_direction text not null default 'desc' check (sort_direction in ('asc','desc')),
  view_mode text not null default 'default',
  page_size integer not null default 25 check (page_size between 5 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace),
  check (workspace in ('dashboard','releases','fans','growth','messages','live','opportunities','supporters','career','library'))
);

alter table public.tgg_creator_ui_workspace_state enable row level security;

drop policy if exists creator_ui_workspace_state_select on public.tgg_creator_ui_workspace_state;
create policy creator_ui_workspace_state_select on public.tgg_creator_ui_workspace_state
for select to authenticated using (user_id = auth.uid());

drop policy if exists creator_ui_workspace_state_insert on public.tgg_creator_ui_workspace_state;
create policy creator_ui_workspace_state_insert on public.tgg_creator_ui_workspace_state
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists creator_ui_workspace_state_update on public.tgg_creator_ui_workspace_state;
create policy creator_ui_workspace_state_update on public.tgg_creator_ui_workspace_state
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists creator_ui_workspace_state_delete on public.tgg_creator_ui_workspace_state;
create policy creator_ui_workspace_state_delete on public.tgg_creator_ui_workspace_state
for delete to authenticated using (user_id = auth.uid());

revoke all on public.tgg_creator_ui_workspace_state from anon;
grant select,insert,update,delete on public.tgg_creator_ui_workspace_state to authenticated;

create or replace function public.tgg_get_creator_ui_interaction_contract()
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  return jsonb_build_object(
    'version','3670',
    'workspaces',jsonb_build_object(
      'dashboard',jsonb_build_object('search',false,'filters',jsonb_build_array('priority','status'),'sort',jsonb_build_array('priority','due_at','created_at'),'view_modes',jsonb_build_array('default','compact')),
      'releases',jsonb_build_object('search',true,'filters',jsonb_build_array('status','readiness','release_date'),'sort',jsonb_build_array('release_date','title','readiness_percent','play_count'),'view_modes',jsonb_build_array('cards','table')),
      'fans',jsonb_build_object('search',true,'filters',jsonb_build_array('fan_state','segment','supporter'),'sort',jsonb_build_array('engagement_score','last_seen_at','loyalty_score'),'view_modes',jsonb_build_array('table','cards')),
      'growth',jsonb_build_object('search',false,'filters',jsonb_build_array('status','goal_type','campaign_type'),'sort',jsonb_build_array('deadline','progress','updated_at'),'view_modes',jsonb_build_array('default','compact')),
      'messages',jsonb_build_object('search',true,'filters',jsonb_build_array('status','unread','project_type'),'sort',jsonb_build_array('last_message_at','created_at'),'view_modes',jsonb_build_array('list')),
      'live',jsonb_build_object('search',true,'filters',jsonb_build_array('status','event_type','booking_status'),'sort',jsonb_build_array('starts_at','requested_at','created_at'),'view_modes',jsonb_build_array('cards','agenda')),
      'opportunities',jsonb_build_object('search',true,'filters',jsonb_build_array('opportunity_type','status','remote_ok'),'sort',jsonb_build_array('deadline','created_at'),'view_modes',jsonb_build_array('cards','table')),
      'supporters',jsonb_build_object('search',true,'filters',jsonb_build_array('supporter_state','membership_status','tier'),'sort',jsonb_build_array('health_score','lifetime_support_cents','current_period_end'),'view_modes',jsonb_build_array('table','cards')),
      'career',jsonb_build_object('search',true,'filters',jsonb_build_array('section','status'),'sort',jsonb_build_array('published_at','updated_at','created_at'),'view_modes',jsonb_build_array('default')),
      'library',jsonb_build_object('search',true,'filters',jsonb_build_array('source','genre','saved'),'sort',jsonb_build_array('saved_at','release_date','title','play_count'),'view_modes',jsonb_build_array('grid','list'))
    ),
    'pagination',jsonb_build_object('strategy','offset','default_page_size',25,'allowed_page_sizes',jsonb_build_array(10,25,50,100),'reset_page_on_filter_change',true),
    'behavior',jsonb_build_object('persist_workspace_state',true,'debounced_search_ms',250,'clear_filters_action',true,'restore_last_view',true,'sync_query_string',true)
  );
end $$;

create or replace function public.tgg_set_creator_ui_workspace_state(
  p_workspace text,
  p_search_query text default null,
  p_filter_state jsonb default null,
  p_sort_key text default null,
  p_sort_direction text default null,
  p_view_mode text default null,
  p_page_size integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_workspace not in ('dashboard','releases','fans','growth','messages','live','opportunities','supporters','career','library') then raise exception 'invalid workspace'; end if;
  if p_sort_direction is not null and p_sort_direction not in ('asc','desc') then raise exception 'invalid sort direction'; end if;
  if p_page_size is not null and (p_page_size < 5 or p_page_size > 100) then raise exception 'invalid page size'; end if;

  insert into public.tgg_creator_ui_workspace_state(user_id,workspace,search_query,filter_state,sort_key,sort_direction,view_mode,page_size)
  values(uid,p_workspace,p_search_query,coalesce(p_filter_state,'{}'::jsonb),p_sort_key,coalesce(p_sort_direction,'desc'),coalesce(p_view_mode,'default'),coalesce(p_page_size,25))
  on conflict(user_id,workspace) do update set
    search_query=coalesce(p_search_query,tgg_creator_ui_workspace_state.search_query),
    filter_state=coalesce(p_filter_state,tgg_creator_ui_workspace_state.filter_state),
    sort_key=coalesce(p_sort_key,tgg_creator_ui_workspace_state.sort_key),
    sort_direction=coalesce(p_sort_direction,tgg_creator_ui_workspace_state.sort_direction),
    view_mode=coalesce(p_view_mode,tgg_creator_ui_workspace_state.view_mode),
    page_size=coalesce(p_page_size,tgg_creator_ui_workspace_state.page_size),
    updated_at=now()
  returning to_jsonb(tgg_creator_ui_workspace_state.*) into result;
  return result;
end $$;

create or replace function public.tgg_get_creator_ui_workspace_states()
returns jsonb
language sql
security invoker
set search_path=public
as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.workspace),'[]'::jsonb)
  from public.tgg_creator_ui_workspace_state s
  where s.user_id=auth.uid();
$$;

revoke execute on function public.tgg_get_creator_ui_interaction_contract() from public,anon;
revoke execute on function public.tgg_set_creator_ui_workspace_state(text,text,jsonb,text,text,text,integer) from public,anon;
revoke execute on function public.tgg_get_creator_ui_workspace_states() from public,anon;
grant execute on function public.tgg_get_creator_ui_interaction_contract() to authenticated;
grant execute on function public.tgg_set_creator_ui_workspace_state(text,text,jsonb,text,text,text,integer) to authenticated;
grant execute on function public.tgg_get_creator_ui_workspace_states() to authenticated;

-- ============================================================
-- MIGRATION 20260904065807 v3680_v3690_navigation_badges_app_shell_readiness
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_navigation_state()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); unread bigint:=0; msgs bigint:=0; collabs bigint:=0; actions bigint:=0; bookings bigint:=0;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select count(*) into unread from notifications where recipient_id=uid and read_at is null;
 select coalesce(sum(unread_messages),0) into msgs from creator_messenger_inbox_v1;
 select count(*) into collabs from creator_collaboration_inbox_v1 where direction='incoming' and status='pending';
 select count(*) into actions from tgg_creator_action_queue where owner_user_id=uid and status='open';
 select count(*) into bookings from tgg_booking_requests where provider_user_id=uid and status in ('pending','requested');
 return jsonb_build_object('version','3680','badges',jsonb_build_object('notifications',unread,'messages',msgs,'collaborations',collabs,'actions',actions,'bookings',bookings),'navigation',jsonb_build_array(
 jsonb_build_object('key','dashboard','badge',actions),jsonb_build_object('key','releases','badge',0),jsonb_build_object('key','fans','badge',0),jsonb_build_object('key','growth','badge',0),jsonb_build_object('key','messages','badge',msgs+collabs),jsonb_build_object('key','live','badge',bookings),jsonb_build_object('key','opportunities','badge',0),jsonb_build_object('key','supporters','badge',0),jsonb_build_object('key','career','badge',0),jsonb_build_object('key','library','badge',0)));
end $$;

create or replace function public.tgg_get_creator_app_shell_readiness()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; missing text[]:=array[]::text[]; ready boolean;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select id into aid from artists where user_id=uid order by created_at limit 1;
 if aid is null then missing:=array_append(missing,'artist_profile'); end if;
 if to_regprocedure('public.tgg_get_creator_ui_full_contract()') is null then missing:=array_append(missing,'ui_full_contract'); end if;
 if to_regprocedure('public.tgg_get_creator_ui_runtime_contract()') is null then missing:=array_append(missing,'runtime_contract'); end if;
 if to_regprocedure('public.tgg_get_creator_navigation_state()') is null then missing:=array_append(missing,'navigation_state'); end if;
 ready:=coalesce(array_length(missing,1),0)=0;
 return jsonb_build_object('version','3690','ready',ready,'user_id',uid,'artist_id',aid,'missing',to_jsonb(missing),'contracts',jsonb_build_object('bootstrap','tgg_get_creator_ui_bootstrap','full_ui','tgg_get_creator_ui_full_contract','runtime','tgg_get_creator_ui_runtime_contract','navigation','tgg_get_creator_navigation_state'),'shell',jsonb_build_object('desktop_sidebar',true,'mobile_bottom_nav',true,'notification_center',true,'workspace_badges',true,'persistent_player_slot',true,'global_search_slot',true,'account_menu',true));
end $$;

create or replace function public.tgg_get_creator_app_startup_bundle()
returns jsonb language plpgsql security invoker set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 return jsonb_build_object('version','3690','readiness',public.tgg_get_creator_app_shell_readiness(),'ui',public.tgg_get_creator_ui_full_contract(),'navigation',public.tgg_get_creator_navigation_state());
end $$;

revoke execute on function public.tgg_get_creator_navigation_state() from public,anon;
revoke execute on function public.tgg_get_creator_app_shell_readiness() from public,anon;
revoke execute on function public.tgg_get_creator_app_startup_bundle() from public,anon;
grant execute on function public.tgg_get_creator_navigation_state() to authenticated;
grant execute on function public.tgg_get_creator_app_shell_readiness() to authenticated;
grant execute on function public.tgg_get_creator_app_startup_bundle() to authenticated;

-- ============================================================
-- MIGRATION 20260904065912 v3700_creator_ui_final_readiness_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_ui_final_readiness()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare uid uuid:=auth.uid(); aid uuid; required text[]:=array['tgg_get_creator_ui_contract','tgg_get_creator_workspace_schema','tgg_get_creator_ui_bootstrap','tgg_get_creator_ui_action_registry','tgg_get_creator_ui_runtime_contract','tgg_get_creator_ui_component_contract','tgg_get_creator_ui_full_contract','tgg_get_creator_ui_interaction_contract','tgg_get_creator_ui_workspace_states','tgg_set_creator_ui_workspace_state','tgg_get_creator_navigation_state','tgg_get_creator_app_shell_readiness','tgg_get_creator_app_startup_bundle']; missing text[]:=array[]::text[]; n text; ready boolean;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select id into aid from artists where user_id=uid order by created_at limit 1;
 foreach n in array required loop
  if not exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=n) then missing:=array_append(missing,n); end if;
 end loop;
 ready:=aid is not null and coalesce(array_length(missing,1),0)=0;
 return jsonb_build_object('version','3700','ready',ready,'artist_ready',aid is not null,'artist_id',aid,'required_contract_count',array_length(required,1),'missing_contracts',to_jsonb(missing),'frontend_handoff',jsonb_build_object('startup_rpc','tgg_get_creator_app_startup_bundle','workspace_schema_rpc','tgg_get_creator_workspace_schema','workspace_state_rpc','tgg_get_creator_ui_workspace_states','workspace_state_mutation','tgg_set_creator_ui_workspace_state','status','backend_ui_contract_ready'));
end $$;
revoke execute on function public.tgg_get_creator_ui_final_readiness() from public,anon;
grant execute on function public.tgg_get_creator_ui_final_readiness() to authenticated;

-- ============================================================
-- MIGRATION 20260904073438 v3740_lock_call_room_rpc
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke execute on function public.tgg_start_call_room(uuid,text) from public, anon;
grant execute on function public.tgg_start_call_room(uuid,text) to authenticated;

-- ============================================================
-- MIGRATION 20260904074211 v3730_ui_state_rls_and_call_indexes
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

drop policy if exists creator_ui_preferences_select on public.tgg_creator_ui_preferences;
create policy creator_ui_preferences_select on public.tgg_creator_ui_preferences for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists creator_ui_preferences_insert on public.tgg_creator_ui_preferences;
create policy creator_ui_preferences_insert on public.tgg_creator_ui_preferences for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists creator_ui_preferences_update on public.tgg_creator_ui_preferences;
create policy creator_ui_preferences_update on public.tgg_creator_ui_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists creator_ui_workspace_state_select on public.tgg_creator_ui_workspace_state;
create policy creator_ui_workspace_state_select on public.tgg_creator_ui_workspace_state for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists creator_ui_workspace_state_insert on public.tgg_creator_ui_workspace_state;
create policy creator_ui_workspace_state_insert on public.tgg_creator_ui_workspace_state for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists creator_ui_workspace_state_update on public.tgg_creator_ui_workspace_state;
create policy creator_ui_workspace_state_update on public.tgg_creator_ui_workspace_state for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists creator_ui_workspace_state_delete on public.tgg_creator_ui_workspace_state;
create policy creator_ui_workspace_state_delete on public.tgg_creator_ui_workspace_state for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists tgg_booking_requests_requester_user_id_idx on public.tgg_booking_requests(requester_user_id);
create index if not exists tgg_call_rooms_created_by_idx on public.tgg_call_rooms(created_by);
create index if not exists tgg_call_signals_recipient_id_idx on public.tgg_call_signals(recipient_id);
create index if not exists tgg_call_signals_sender_id_idx on public.tgg_call_signals(sender_id);

-- ============================================================
-- MIGRATION 20260904074834 v3740_rls_and_index_cleanup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

drop policy if exists fan_intelligence_creator_read on public.tgg_fan_intelligence_snapshots;
create policy fan_intelligence_creator_read
on public.tgg_fan_intelligence_snapshots
for select
to authenticated
using (creator_user_id = (select auth.uid()));

drop policy if exists supporter_health_creator_read on public.tgg_supporter_health_snapshots;
create policy supporter_health_creator_read
on public.tgg_supporter_health_snapshots
for select
to authenticated
using (creator_user_id = (select auth.uid()));

drop index if exists public.tgg_smart_link_events_link_time_idx;

create index if not exists tgg_campaign_tasks_campaign_id_idx
  on public.tgg_campaign_tasks(campaign_id);
create index if not exists tgg_campaigns_artist_id_idx
  on public.tgg_campaigns(artist_id);
create index if not exists tgg_clearance_items_release_id_idx
  on public.tgg_clearance_items(release_id);
create index if not exists tgg_creator_action_queue_artist_id_idx
  on public.tgg_creator_action_queue(artist_id);
create index if not exists tgg_fan_crm_artist_id_idx
  on public.tgg_fan_crm(artist_id);
create index if not exists tgg_memberships_tier_id_idx
  on public.tgg_memberships(tier_id);
create index if not exists tgg_release_checklist_items_release_id_idx
  on public.tgg_release_checklist_items(release_id);
create index if not exists tgg_release_credits_release_id_idx
  on public.tgg_release_credits(release_id);
create index if not exists tgg_smart_links_release_id_idx
  on public.tgg_smart_links(release_id);

commit;

-- ============================================================
-- MIGRATION 20260904074900 v3741_creator_workspace_indexes
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create index if not exists tgg_clearance_items_artist_id_idx on public.tgg_clearance_items(artist_id);
create index if not exists tgg_clearance_items_owner_user_id_idx on public.tgg_clearance_items(owner_user_id);
create index if not exists tgg_release_credits_artist_id_idx on public.tgg_release_credits(artist_id);
create index if not exists tgg_release_credits_owner_user_id_idx on public.tgg_release_credits(owner_user_id);
create index if not exists tgg_release_team_artist_id_idx on public.tgg_release_team(artist_id);
create index if not exists tgg_release_team_owner_user_id_idx on public.tgg_release_team(owner_user_id);
create index if not exists tgg_release_team_release_id_idx on public.tgg_release_team(release_id);
create index if not exists tgg_opportunities_artist_id_idx on public.tgg_opportunities(artist_id);
create index if not exists tgg_opportunities_created_by_idx on public.tgg_opportunities(created_by);
create index if not exists tgg_opportunity_applications_applicant_user_id_idx on public.tgg_opportunity_applications(applicant_user_id);
create index if not exists tgg_events_artist_id_idx on public.tgg_events(artist_id);
create index if not exists tgg_live_events_artist_id_idx on public.tgg_live_events(artist_id);
create index if not exists tgg_live_events_room_id_idx on public.tgg_live_events(room_id);
create index if not exists tgg_support_transactions_fan_user_id_idx on public.tgg_support_transactions(fan_user_id);
create index if not exists tgg_supporter_health_snapshots_artist_id_idx on public.tgg_supporter_health_snapshots(artist_id);
create index if not exists tgg_supporter_health_snapshots_fan_user_id_idx on public.tgg_supporter_health_snapshots(fan_user_id);
create index if not exists tgg_supporter_health_snapshots_membership_id_idx on public.tgg_supporter_health_snapshots(membership_id);
create index if not exists tgg_supporter_health_snapshots_current_tier_id_idx on public.tgg_supporter_health_snapshots(current_tier_id);

commit;

-- ============================================================
-- MIGRATION 20260904075058 v3740_call_lifecycle_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

revoke execute on function public.tgg_end_call_room(uuid) from public, anon;
grant execute on function public.tgg_end_call_room(uuid) to authenticated;

create or replace function public.tgg_leave_call_room(p_room_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  update public.tgg_call_participants
     set left_at = coalesce(left_at, now())
   where room_id = p_room_id
     and user_id = v_uid
     and left_at is null;

  return found;
end;
$$;

revoke execute on function public.tgg_leave_call_room(uuid) from public, anon;
grant execute on function public.tgg_leave_call_room(uuid) to authenticated;

commit;

-- ============================================================
-- MIGRATION 20260904075150 v3740_runtime_contract_call_lifecycle
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create or replace function public.tgg_get_creator_ui_action_registry()
returns jsonb
language plpgsql
security invoker
set search_path='public'
as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 return jsonb_build_object(
 'version','3740','actions',jsonb_build_array(
  jsonb_build_object('key','notifications_read','workspace','dashboard','rpc','tgg_mark_creator_notifications_read','mode','mutation','confirm',false),
  jsonb_build_object('key','action_status','workspace','dashboard','rpc','tgg_set_creator_action_status','mode','mutation','confirm',false),
  jsonb_build_object('key','save_release','workspace','library','rpc','tgg_toggle_release_save','mode','mutation','confirm',false),
  jsonb_build_object('key','follow_artist','workspace','library','rpc','tgg_toggle_artist_follow','mode','mutation','confirm',false),
  jsonb_build_object('key','react_release','workspace','library','rpc','tgg_set_release_reaction','mode','mutation','confirm',false),
  jsonb_build_object('key','comment_release','workspace','library','rpc','tgg_add_release_comment','mode','mutation','confirm',false),
  jsonb_build_object('key','send_message','workspace','messages','rpc','tgg_send_message','mode','mutation','confirm',false),
  jsonb_build_object('key','conversation_status','workspace','messages','rpc','tgg_set_conversation_status','mode','mutation','confirm',false),
  jsonb_build_object('key','create_collab','workspace','messages','rpc','tgg_create_collaboration_request','mode','mutation','confirm',false),
  jsonb_build_object('key','respond_collab','workspace','messages','rpc','tgg_respond_collaboration_request','mode','mutation','confirm',true),
  jsonb_build_object('key','cancel_collab','workspace','messages','rpc','tgg_cancel_collaboration_request','mode','mutation','confirm',true),
  jsonb_build_object('key','start_call','workspace','messages','rpc','tgg_start_call_room','mode','mutation','confirm',false),
  jsonb_build_object('key','leave_call','workspace','messages','rpc','tgg_leave_call_room','mode','mutation','confirm',false),
  jsonb_build_object('key','end_call','workspace','messages','rpc','tgg_end_call_room','mode','mutation','confirm',true),
  jsonb_build_object('key','save_listening_progress','workspace','library','rpc','tgg_save_listening_progress','mode','background','confirm',false),
  jsonb_build_object('key','ui_preferences','workspace','global','rpc','tgg_set_creator_ui_preferences','mode','mutation','confirm',false)
 ),
 'behavior',jsonb_build_object('optimistic_updates',jsonb_build_array('notifications_read','save_release','follow_artist','react_release','ui_preferences','leave_call'),'disable_while_pending',true,'retry_reads',true,'retry_mutations',false,'toast_success',true,'toast_error',true)
 );
end;
$$;

create or replace function public.tgg_get_creator_ui_runtime_contract()
returns jsonb
language plpgsql
security invoker
set search_path='public'
as $$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 return jsonb_build_object('version','3740','bootstrap',public.tgg_get_creator_ui_bootstrap(),'actions',public.tgg_get_creator_ui_action_registry(),'runtime',jsonb_build_object('request_timeout_ms',15000,'debounce_ms',250,'notification_page_size',30,'fan_page_size',50,'mobile_breakpoint_px',768,'cache',jsonb_build_object('shell_seconds',30,'workspace_seconds',15,'contract_seconds',300)));
end;
$$;

create or replace function public.tgg_get_frontend_api_contract()
returns jsonb
language plpgsql
security invoker
set search_path='public'
as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'authentication required'; end if;
 return jsonb_build_object(
 'version','v3740',
 'shell','tgg_get_creator_shell_bundle',
 'account','tgg_get_account_workspace_bundle',
 'communications','tgg_get_creator_communications_bundle',
 'music_library','tgg_get_user_music_library_bundle',
 'navigation','tgg_get_creator_navigation_state',
 'creator_workspaces',jsonb_build_object(
 'dashboard','tgg_get_creator_dashboard_bundle','releases','tgg_get_creator_release_workspace_bundle','fans','tgg_get_creator_fan_crm_bundle','growth','tgg_get_creator_growth_workspace_bundle','live_bookings','tgg_get_creator_live_booking_bundle','opportunities','tgg_get_creator_opportunity_bundle','supporters_revenue','tgg_get_creator_supporters_revenue_bundle','career_epk','tgg_get_creator_career_workspace_bundle'),
 'mutations',jsonb_build_object(
 'mark_notifications_read','tgg_mark_creator_notifications_read','set_action_status','tgg_set_creator_action_status','send_message','tgg_send_message','conversation_status','tgg_set_conversation_status','create_collab','tgg_create_collaboration_request','respond_collab','tgg_respond_collaboration_request','cancel_collab','tgg_cancel_collaboration_request','start_call','tgg_start_call_room','leave_call','tgg_leave_call_room','end_call','tgg_end_call_room','save_listening_progress','tgg_save_listening_progress','ui_preferences','tgg_set_creator_ui_preferences','maintenance','tgg_run_creator_backend_maintenance')
 );
end;
$$;

revoke execute on function public.tgg_get_creator_ui_action_registry() from public, anon;
revoke execute on function public.tgg_get_creator_ui_runtime_contract() from public, anon;
revoke execute on function public.tgg_get_frontend_api_contract() from public, anon;
grant execute on function public.tgg_get_creator_ui_action_registry() to authenticated;
grant execute on function public.tgg_get_creator_ui_runtime_contract() to authenticated;
grant execute on function public.tgg_get_frontend_api_contract() to authenticated;

commit;

-- ============================================================
-- MIGRATION 20260904075405 v3750_lock_membership_state_to_server
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

revoke insert, update, delete on table public.tgg_memberships from authenticated;
grant select on table public.tgg_memberships to authenticated;

drop policy if exists "memberships fan insert" on public.tgg_memberships;
drop policy if exists "memberships fan update" on public.tgg_memberships;

-- ============================================================
-- MIGRATION 20260904075649 v3740_finalize_ui_readiness_contract
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create or replace function public.tgg_get_creator_app_startup_bundle()
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 return jsonb_build_object(
   'version','3740',
   'readiness',public.tgg_get_creator_app_shell_readiness(),
   'ui',public.tgg_get_creator_ui_full_contract(),
   'navigation',public.tgg_get_creator_navigation_state(),
   'api',public.tgg_get_frontend_api_contract()
 );
end
$function$;

create or replace function public.tgg_get_creator_ui_full_contract()
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare ws text; bindings jsonb:='{}'::jsonb;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 foreach ws in array array['dashboard','releases','fans','growth','messages','live','opportunities','supporters','career','library'] loop
  bindings:=bindings || jsonb_build_object(ws,public.tgg_get_creator_ui_component_contract(ws));
 end loop;
 return jsonb_build_object(
   'version','3740',
   'runtime',public.tgg_get_creator_ui_runtime_contract(),
   'bindings',bindings,
   'display',jsonb_build_object('currency','USD','date_format','MMM D, YYYY','datetime_format','MMM D, YYYY h:mm A','number_compact',true,'percent_suffix','%')
 );
end
$function$;

create or replace function public.tgg_get_creator_ui_final_readiness()
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
 uid uuid:=auth.uid();
 aid uuid;
 required text[]:=array[
  'tgg_get_creator_ui_contract','tgg_get_creator_workspace_schema','tgg_get_creator_ui_bootstrap',
  'tgg_get_creator_ui_action_registry','tgg_get_creator_ui_runtime_contract','tgg_get_creator_ui_component_contract',
  'tgg_get_creator_ui_full_contract','tgg_get_creator_ui_interaction_contract','tgg_get_creator_ui_workspace_states',
  'tgg_set_creator_ui_workspace_state','tgg_get_creator_navigation_state','tgg_get_creator_app_shell_readiness',
  'tgg_get_creator_app_startup_bundle','tgg_start_call_room','tgg_leave_call_room','tgg_end_call_room'
 ];
 missing text[]:=array[]::text[];
 n text;
 ready boolean;
begin
 if uid is null then raise exception 'authentication required'; end if;
 select id into aid from artists where user_id=uid order by created_at limit 1;
 foreach n in array required loop
  if not exists(select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=n) then
    missing:=array_append(missing,n);
  end if;
 end loop;
 ready:=aid is not null and coalesce(array_length(missing,1),0)=0;
 return jsonb_build_object(
  'version','3740','ready',ready,'artist_ready',aid is not null,'artist_id',aid,
  'required_contract_count',array_length(required,1),'missing_contracts',to_jsonb(missing),
  'frontend_handoff',jsonb_build_object(
    'startup_rpc','tgg_get_creator_app_startup_bundle',
    'workspace_schema_rpc','tgg_get_creator_workspace_schema',
    'workspace_state_rpc','tgg_get_creator_ui_workspace_states',
    'workspace_state_mutation','tgg_set_creator_ui_workspace_state',
    'call_start_rpc','tgg_start_call_room',
    'call_leave_rpc','tgg_leave_call_room',
    'call_end_rpc','tgg_end_call_room',
    'status','backend_ui_contract_ready'
  )
 );
end
$function$;

revoke execute on function public.tgg_get_creator_app_startup_bundle() from public, anon;
grant execute on function public.tgg_get_creator_app_startup_bundle() to authenticated;
revoke execute on function public.tgg_get_creator_ui_full_contract() from public, anon;
grant execute on function public.tgg_get_creator_ui_full_contract() to authenticated;
revoke execute on function public.tgg_get_creator_ui_final_readiness() from public, anon;
grant execute on function public.tgg_get_creator_ui_final_readiness() to authenticated;

-- ============================================================
-- MIGRATION 20260904075923 v3740_core_fk_index_cleanup
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create index if not exists tgg_creator_goals_artist_id_idx on public.tgg_creator_goals(artist_id);
create index if not exists tgg_creator_goals_owner_user_id_idx on public.tgg_creator_goals(owner_user_id);
create index if not exists tgg_creator_resume_artist_id_idx on public.tgg_creator_resume(artist_id);
create index if not exists tgg_directory_profiles_artist_id_idx on public.tgg_directory_profiles(artist_id);
create index if not exists tgg_epk_settings_artist_id_idx on public.tgg_epk_settings(artist_id);
create index if not exists tgg_fan_crm_fan_user_id_idx on public.tgg_fan_crm(fan_user_id);
create index if not exists tgg_fan_intelligence_snapshots_artist_id_idx on public.tgg_fan_intelligence_snapshots(artist_id);
create index if not exists tgg_fan_intelligence_snapshots_fan_user_id_idx on public.tgg_fan_intelligence_snapshots(fan_user_id);
create index if not exists tgg_feedback_requests_artist_id_idx on public.tgg_feedback_requests(artist_id);
create index if not exists tgg_feedback_requests_owner_user_id_idx on public.tgg_feedback_requests(owner_user_id);
create index if not exists tgg_feedback_responses_responder_user_id_idx on public.tgg_feedback_responses(responder_user_id);
create index if not exists tgg_music_ids_mixtape_id_idx on public.tgg_music_ids(mixtape_id);
create index if not exists tgg_music_ids_track_id_idx on public.tgg_music_ids(track_id);
create index if not exists tgg_music_ids_workspace_id_idx on public.tgg_music_ids(workspace_id);
create index if not exists tgg_press_items_artist_id_idx on public.tgg_press_items(artist_id);
create index if not exists tgg_press_items_owner_user_id_idx on public.tgg_press_items(owner_user_id);
create index if not exists tgg_release_checklist_items_artist_id_idx on public.tgg_release_checklist_items(artist_id);
create index if not exists tgg_release_credits_tgg_user_id_idx on public.tgg_release_credits(tgg_user_id);
create index if not exists tgg_room_links_call_room_id_idx on public.tgg_room_links(call_room_id);
create index if not exists tgg_room_links_event_id_idx on public.tgg_room_links(event_id);
create index if not exists tgg_song_workspaces_artist_id_idx on public.tgg_song_workspaces(artist_id);

-- ============================================================
-- MIGRATION 20260904095739 v3760_release_upload_edit_hardening
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Allow artists to replace/delete only their own cover objects.
drop policy if exists "tgg covers owner update" on storage.objects;
create policy "tgg covers owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'covers'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'covers'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "tgg covers owner delete" on storage.objects;
create policy "tgg covers owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'covers'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Allow an artist to remove tracks only while the parent release is still editable.
drop policy if exists "tracks artist delete" on public.tracks;
create policy "tracks artist delete"
on public.tracks
for delete
to authenticated
using (
  exists (
    select 1
    from public.mixtapes m
    join public.artists a on a.id = m.artist_id
    where m.id = tracks.mixtape_id
      and tracks.artist_id = m.artist_id
      and a.user_id = (select auth.uid())
      and m.status in ('draft','pending','changes_requested','rejected')
  )
);

commit;

-- ============================================================
-- MIGRATION 20260904120714 v3760_site_route_manifest
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create table if not exists public.tgg_site_routes (
  id uuid primary key default gen_random_uuid(),
  route_key text not null unique,
  title text not null,
  area text not null check (area in ('public','fan','artist','admin','shared')),
  access_level text not null check (access_level in ('public','authenticated','artist','admin')),
  path text not null,
  workspace_key text,
  icon text,
  nav_group text,
  nav_order integer not null default 100,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_site_routes enable row level security;
revoke all on table public.tgg_site_routes from anon, authenticated;
grant select on table public.tgg_site_routes to anon, authenticated;

drop policy if exists "site routes public read" on public.tgg_site_routes;
create policy "site routes public read"
on public.tgg_site_routes for select
to anon, authenticated
using (is_active = true and access_level <> 'admin');

insert into public.tgg_site_routes
(route_key,title,area,access_level,path,workspace_key,icon,nav_group,nav_order,is_primary,description)
values
('home','Home','public','public','/p/homepage.html',null,'home','main',10,true,'Main public landing page and latest releases.'),
('discover','Discover','public','public','/p/discover.html',null,'compass','main',20,true,'Music, artists, videos, charts and personalized discovery.'),
('mixtapes','Mixtapes','public','public','/search/label/Mixtapes',null,'disc','music',10,true,'Public mixtape catalog.'),
('releases','Releases','public','public','/p/releases.html',null,'album','music',20,false,'Public singles, albums and release catalog.'),
('radio','TGG Radio','public','public','/p/radio.html',null,'radio','music',30,false,'Radio, stations, discovery and listening rooms.'),
('charts','Charts','public','public','/p/charts.html',null,'chart','music',40,false,'TGG charts, trending tracks, releases and artists.'),
('videos','Videos','public','public','/p/videos.html',null,'video','media',10,true,'Music videos, interviews and visual content.'),
('shorts','Shorts','public','public','/p/shorts.html',null,'shorts','media',20,false,'Short-form creator and fan video feed.'),
('artists','Artists','public','public','/p/artists.html',null,'users','community',10,true,'Artist directory and public profiles.'),
('events','Events','public','public','/p/events.html',null,'calendar','community',20,true,'Events, tickets, LIVE appearances and IRL experiences.'),
('opportunities_public','Opportunities','public','public','/p/opportunities.html',null,'briefcase','community',30,false,'Public opportunities, open calls and creator listings.'),
('merch','Store','public','public','/p/store.html',null,'bag','commerce',10,true,'Merch, albums, beat licenses, sample packs and digital products.'),
('memberships','Memberships','public','public','/p/memberships.html',null,'heart','commerce',20,false,'Artist memberships and supporter programs.'),
('artist_dashboard','Artist Dashboard','artist','artist','/p/artist-dashboard_0633467215.html','dashboard','dashboard','creator',10,true,'Authenticated Creator OS home. Sign in here and remain on this page.'),
('artist_releases','Release Pro','artist','artist','/p/artist-dashboard_0633467215.html?workspace=releases','releases','disc','creator',20,true,'Create, edit, upload, schedule and manage releases.'),
('artist_upload','Upload Music','artist','artist','/p/artist-dashboard_0633467215.html?workspace=upload','upload','upload','creator',30,true,'Upload mixtapes, singles, albums, artwork and tracks.'),
('artist_fans','Fan CRM','artist','artist','/p/artist-dashboard_0633467215.html?workspace=fans','fans','users','growth',10,true,'Fan CRM, segmentation, notes and supporter intelligence.'),
('artist_growth','Growth','artist','artist','/p/artist-dashboard_0633467215.html?workspace=growth','growth','chart','growth',20,true,'Analytics, growth snapshots, goals and campaign health.'),
('artist_campaigns','Campaigns','artist','artist','/p/artist-dashboard_0633467215.html?workspace=campaigns','campaigns','megaphone','growth',30,false,'Campaign builder, tasks, goals and promotion workflows.'),
('artist_messages','Messenger','artist','artist','/p/artist-dashboard_0633467215.html?workspace=messages','messages','message','connect',10,true,'DMs, conversations, collaborations and music attachments.'),
('artist_calls','Calls & Rooms','artist','artist','/p/artist-dashboard_0633467215.html?workspace=calls','calls','phone','connect',20,false,'Audio/video calls, listening rooms and studio rooms.'),
('artist_live','LIVE + Bookings','artist','artist','/p/artist-dashboard_0633467215.html?workspace=live','live','live','connect',30,true,'LIVE sessions, bookings, events and performance pipeline.'),
('artist_opportunities','Opportunities','artist','artist','/p/artist-dashboard_0633467215.html?workspace=opportunities','opportunities','briefcase','career',10,true,'Opportunities, applications and creator radar.'),
('artist_supporters','Supporters + Revenue','artist','artist','/p/artist-dashboard_0633467215.html?workspace=supporters','supporters','heart','money',10,true,'Memberships, tips, supporter retention and revenue intelligence.'),
('artist_store','Commerce','artist','artist','/p/artist-dashboard_0633467215.html?workspace=commerce','commerce','bag','money',20,false,'Merch, digital products, beat licenses, tickets and offers.'),
('artist_career','Career + EPK','artist','artist','/p/artist-dashboard_0633467215.html?workspace=career','career','star','career',20,true,'EPK, creator resume, press kit and career tools.'),
('artist_library','Music Library','artist','artist','/p/artist-dashboard_0633467215.html?workspace=library','library','library','create',10,true,'Private media and music library.'),
('artist_studio','TGG Studio','artist','artist','/p/artist-dashboard_0633467215.html?workspace=studio','studio','studio','create',20,false,'Browser recording and production workspace.'),
('artist_beatmaker','Beat Maker','artist','artist','/p/artist-dashboard_0633467215.html?workspace=beatmaker','beatmaker','drums','create',30,false,'Beat creation and collaboration tools.'),
('artist_video_studio','Video Studio','artist','artist','/p/artist-dashboard_0633467215.html?workspace=video-studio','video-studio','video','create',40,false,'Creator video editing and visual production.'),
('artist_media_vault','Media Vault','artist','artist','/p/artist-dashboard_0633467215.html?workspace=media-vault','media-vault','vault','create',50,false,'Secure creator media, assets and project files.'),
('artist_smartlinks','Smart Links','artist','artist','/p/artist-dashboard_0633467215.html?workspace=smart-links','smart-links','link','release',10,false,'Release smart links and destination analytics.'),
('artist_credits','Credits + Clearance','artist','artist','/p/artist-dashboard_0633467215.html?workspace=credits','credits','check','release',20,false,'Credits, rights, samples, permissions and clearance tracking.'),
('artist_academy','Academy + Mentorship','artist','artist','/p/artist-dashboard_0633467215.html?workspace=academy','academy','school','career',30,false,'Education, mentorship, feedback and creator development.'),
('fan_hub','Fan Hub','fan','authenticated','/p/fan-hub.html',null,'home','fan',10,true,'Signed-in fan home, feed and recommendations.'),
('fan_library','My Library','fan','authenticated','/p/fan-library.html',null,'library','fan',20,true,'Saved releases, listening history and collections.'),
('fan_following','Following','fan','authenticated','/p/following.html',null,'users','fan',30,false,'Artists and creators the fan follows.'),
('fan_messages','Messages','fan','authenticated','/p/messages.html',null,'message','fan',40,false,'Fan conversations and creator messaging.'),
('fan_rewards','Rewards','fan','authenticated','/p/rewards.html',null,'gift','fan',50,false,'Fan XP, rewards, games and supporter perks.'),
('admin_dashboard','Admin','admin','admin','/p/admin-dashboard.html',null,'shield','admin',10,false,'Platform administration only; never a normal artist sign-in destination.'),
('submit_music','Submit Music','shared','authenticated','/p/submit-music.html',null,'upload','submit',10,false,'Submission entry point for authenticated creators.'),
('about','About','public','public','/p/about.html',null,'info','footer',10,false,'About TRU GO GETTA.'),
('help','Help','public','public','/p/help.html',null,'help','footer',20,false,'Help center, FAQs and support.'),
('privacy','Privacy','public','public','/p/privacy.html',null,'lock','footer',30,false,'Privacy policy.'),
('terms','Terms','public','public','/p/terms.html',null,'file','footer',40,false,'Terms of use.')
on conflict (route_key) do update set
 title=excluded.title,
 area=excluded.area,
 access_level=excluded.access_level,
 path=excluded.path,
 workspace_key=excluded.workspace_key,
 icon=excluded.icon,
 nav_group=excluded.nav_group,
 nav_order=excluded.nav_order,
 is_primary=excluded.is_primary,
 is_active=excluded.is_active,
 description=excluded.description,
 updated_at=now();

create or replace function public.tgg_get_site_route_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.area, r.nav_group, r.nav_order, r.title), '[]'::jsonb)
  from public.tgg_site_routes r
  where r.is_active = true
    and r.access_level <> 'admin'
    and (
      r.access_level = 'public'
      or (
        r.access_level = 'authenticated'
        and (select auth.uid()) is not null
      )
      or (
        r.access_level = 'artist'
        and exists (
          select 1 from public.artists a
          where a.user_id = (select auth.uid())
        )
      )
    );
$$;

revoke all on function public.tgg_get_site_route_manifest() from public;
grant execute on function public.tgg_get_site_route_manifest() to anon, authenticated;

commit;

-- ============================================================
-- MIGRATION 20260904122204 tgg_core_apps_foundation_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Messenger: richer message model.
alter table public.tgg_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists reply_to_message_id uuid null,
  add column if not exists edited_at timestamptz null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Add the self-reference only once.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tgg_messages_reply_to_fkey'
      and conrelid = 'public.tgg_messages'::regclass
  ) then
    alter table public.tgg_messages
      add constraint tgg_messages_reply_to_fkey
      foreign key (reply_to_message_id)
      references public.tgg_messages(id)
      on delete set null;
  end if;
end $$;

create index if not exists tgg_messages_conversation_created_idx
  on public.tgg_messages(conversation_id, created_at desc);
create index if not exists tgg_messages_sender_idx
  on public.tgg_messages(sender_id, created_at desc);

-- TGG-specific attachments for the TGG messenger tables.
create table if not exists public.tgg_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.tgg_messages(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  file_name text not null,
  mime_type text,
  file_size bigint,
  storage_bucket text not null default 'creator-media',
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tgg_message_attachments enable row level security;
grant select, insert, delete on public.tgg_message_attachments to authenticated;

create policy "tgg message attachments select members"
on public.tgg_message_attachments for select
to authenticated
using (
  exists (
    select 1
    from public.tgg_messages m
    where m.id = tgg_message_attachments.message_id
      and private.tgg_is_conversation_member(m.conversation_id)
  )
);

create policy "tgg message attachments insert own"
on public.tgg_message_attachments for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.tgg_messages m
    where m.id = tgg_message_attachments.message_id
      and m.sender_id = (select auth.uid())
      and private.tgg_is_conversation_member(m.conversation_id)
  )
);

create policy "tgg message attachments delete own"
on public.tgg_message_attachments for delete
to authenticated
using (user_id = (select auth.uid()));

create index if not exists tgg_message_attachments_message_idx
  on public.tgg_message_attachments(message_id, created_at);

-- Message reactions.
create table if not exists public.tgg_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.tgg_messages(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  reaction text not null,
  created_at timestamptz not null default now(),
  unique(message_id, user_id, reaction)
);

alter table public.tgg_message_reactions enable row level security;
grant select, insert, delete on public.tgg_message_reactions to authenticated;

create policy "tgg message reactions select members"
on public.tgg_message_reactions for select
to authenticated
using (
  exists (
    select 1 from public.tgg_messages m
    where m.id = tgg_message_reactions.message_id
      and private.tgg_is_conversation_member(m.conversation_id)
  )
);

create policy "tgg message reactions insert own"
on public.tgg_message_reactions for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.tgg_messages m
    where m.id = tgg_message_reactions.message_id
      and private.tgg_is_conversation_member(m.conversation_id)
  )
);

create policy "tgg message reactions delete own"
on public.tgg_message_reactions for delete
to authenticated
using (user_id = (select auth.uid()));

-- Per-message read receipts.
create table if not exists public.tgg_message_reads (
  message_id uuid not null references public.tgg_messages(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.tgg_message_reads enable row level security;
grant select, insert, update on public.tgg_message_reads to authenticated;

create policy "tgg message reads select members"
on public.tgg_message_reads for select
to authenticated
using (
  exists (
    select 1 from public.tgg_messages m
    where m.id = tgg_message_reads.message_id
      and private.tgg_is_conversation_member(m.conversation_id)
  )
);

create policy "tgg message reads insert self"
on public.tgg_message_reads for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.tgg_messages m
    where m.id = tgg_message_reads.message_id
      and private.tgg_is_conversation_member(m.conversation_id)
  )
);

create policy "tgg message reads update self"
on public.tgg_message_reads for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Allow authors to edit/delete their own messages while preserving membership checks.
create policy "tgg messages update own"
on public.tgg_messages for update
to authenticated
using (
  sender_id = (select auth.uid())
  and private.tgg_is_conversation_member(conversation_id)
)
with check (
  sender_id = (select auth.uid())
  and private.tgg_is_conversation_member(conversation_id)
);

create policy "tgg messages delete own"
on public.tgg_messages for delete
to authenticated
using (
  sender_id = (select auth.uid())
  and private.tgg_is_conversation_member(conversation_id)
);

grant select, insert, update, delete on public.tgg_messages to authenticated;

-- Recording Studio + Beat Studio share the studio project engine.
alter table public.tgg_studio_projects
  add column if not exists project_type text not null default 'recording',
  add column if not exists description text null,
  add column if not exists cover_url text null,
  add column if not exists duration_seconds numeric null;

create index if not exists tgg_studio_projects_user_type_updated_idx
  on public.tgg_studio_projects(user_id, project_type, updated_at desc);

create table if not exists public.tgg_studio_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  version_number integer not null,
  label text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id, version_number)
);

alter table public.tgg_studio_versions enable row level security;
grant select, insert, update, delete on public.tgg_studio_versions to authenticated;

create policy "tgg studio versions owner"
on public.tgg_studio_versions for all
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.tgg_studio_projects p
    where p.id = tgg_studio_versions.project_id
      and p.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.tgg_studio_projects p
    where p.id = tgg_studio_versions.project_id
      and p.user_id = (select auth.uid())
  )
);

create index if not exists tgg_studio_versions_project_idx
  on public.tgg_studio_versions(project_id, version_number desc);

-- Beat sequencer patterns are stored separately so the UI can autosave lightweight changes.
create table if not exists public.tgg_beat_patterns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  name text not null default 'Pattern 1',
  bpm numeric not null default 120,
  steps integer not null default 16 check (steps between 4 and 128),
  pattern_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tgg_beat_patterns enable row level security;
grant select, insert, update, delete on public.tgg_beat_patterns to authenticated;

create policy "tgg beat patterns owner"
on public.tgg_beat_patterns for all
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.tgg_studio_projects p
    where p.id = tgg_beat_patterns.project_id
      and p.user_id = (select auth.uid())
      and p.project_type = 'beat'
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.tgg_studio_projects p
    where p.id = tgg_beat_patterns.project_id
      and p.user_id = (select auth.uid())
      and p.project_type = 'beat'
  )
);

create index if not exists tgg_beat_patterns_project_idx
  on public.tgg_beat_patterns(project_id, updated_at desc);

-- Keep Messenger live. Add tables only when not already in the publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tgg_messages'
  ) then
    alter publication supabase_realtime add table public.tgg_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tgg_conversations'
  ) then
    alter publication supabase_realtime add table public.tgg_conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tgg_message_reads'
  ) then
    alter publication supabase_realtime add table public.tgg_message_reads;
  end if;
end $$;

commit;

-- ============================================================
-- MIGRATION 20260904130003 tgg_backend_hardening_v3820
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Allow the deployed Create Hub concepts while retaining every existing creative type.
alter table public.tgg_creative_projects drop constraint if exists tgg_creative_projects_project_type_check;
alter table public.tgg_creative_projects add constraint tgg_creative_projects_project_type_check check (project_type = any (array['audio'::text,'beat'::text,'video'::text,'cover'::text,'campaign'::text,'story'::text,'short'::text,'post'::text,'collab'::text,'live'::text]));

-- Compatibility for the deployed Beat Studio client (`pattern`) and canonical backend (`pattern_data`).
alter table public.tgg_beat_patterns add column if not exists pattern jsonb;
update public.tgg_beat_patterns set pattern = pattern_data where pattern is null;
create or replace function public.tgg_sync_beat_pattern_compat() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.pattern is not null then new.pattern_data := new.pattern;
    else new.pattern := new.pattern_data; end if;
  else
    if new.pattern is distinct from old.pattern then new.pattern_data := coalesce(new.pattern,'{}'::jsonb);
    elsif new.pattern_data is distinct from old.pattern_data then new.pattern := new.pattern_data;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists tgg_beat_pattern_compat_sync on public.tgg_beat_patterns;
create trigger tgg_beat_pattern_compat_sync before insert or update on public.tgg_beat_patterns for each row execute function public.tgg_sync_beat_pattern_compat();

-- Derive top-level studio project_type from deployed project_data when present.
create or replace function public.tgg_sync_studio_project_type() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.project_data ? 'project_type' and nullif(btrim(new.project_data->>'project_type'),'') is not null then
    new.project_type := new.project_data->>'project_type';
  end if;
  return new;
end; $$;
drop trigger if exists tgg_studio_project_type_sync on public.tgg_studio_projects;
create trigger tgg_studio_project_type_sync before insert or update of project_data on public.tgg_studio_projects for each row execute function public.tgg_sync_studio_project_type();
update public.tgg_studio_projects set project_type = project_data->>'project_type' where project_data ? 'project_type' and nullif(btrim(project_data->>'project_type'),'') is not null and project_type is distinct from project_data->>'project_type';

-- Active Creator OS foreign-key indexes flagged by the production advisor.
create index if not exists tgg_messages_reply_to_idx on public.tgg_messages(reply_to_message_id);
create index if not exists tgg_game_players_user_idx on public.tgg_game_players(user_id);
create index if not exists tgg_game_sessions_game_idx on public.tgg_game_sessions(game_id);
create index if not exists tgg_game_sessions_host_idx on public.tgg_game_sessions(host_user_id);
create index if not exists tgg_game_sessions_room_idx on public.tgg_game_sessions(room_id);
create index if not exists tgg_games_artist_idx on public.tgg_games(artist_id);
create index if not exists tgg_games_creator_idx on public.tgg_games(created_by);
create index if not exists tgg_games_room_idx on public.tgg_games(room_id);
create index if not exists tgg_programs_artist_idx on public.tgg_programs(artist_id);
create index if not exists tgg_programs_creator_idx on public.tgg_programs(created_by);
create index if not exists tgg_programs_room_idx on public.tgg_programs(room_id);
create index if not exists tgg_studio_assets_user_idx on public.tgg_studio_assets(user_id);
create index if not exists tgg_vault_items_min_tier_idx on public.tgg_vault_items(min_tier_id);
create index if not exists tgg_video_timeline_items_asset_idx on public.tgg_video_timeline_items(asset_id);

-- Private creator-media owner-prefix access. App uploads use <auth.uid()>/... paths.
drop policy if exists "creator media insert own" on storage.objects;
create policy "creator media insert own" on storage.objects for insert to authenticated with check (bucket_id='creator-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "creator media select own" on storage.objects;
create policy "creator media select own" on storage.objects for select to authenticated using (bucket_id='creator-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "creator media update own" on storage.objects;
create policy "creator media update own" on storage.objects for update to authenticated using (bucket_id='creator-media' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id='creator-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "creator media delete own" on storage.objects;
create policy "creator media delete own" on storage.objects for delete to authenticated using (bucket_id='creator-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;

-- ============================================================
-- MIGRATION 20260904130118 tgg_creator_media_messaging_access_v3821
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;
create index if not exists tgg_message_attachments_storage_path_idx on public.tgg_message_attachments(storage_path);
drop policy if exists "creator media conversation member read" on storage.objects;
create policy "creator media conversation member read" on storage.objects for select to authenticated using (
  bucket_id='creator-media' and exists (
    select 1
    from public.tgg_message_attachments a
    join public.tgg_messages m on m.id=a.message_id
    join public.tgg_conversation_members cm on cm.conversation_id=m.conversation_id
    where a.storage_bucket='creator-media'
      and a.storage_path=name
      and cm.user_id=(select auth.uid())
  )
);
commit;

-- ============================================================
-- MIGRATION 20260904130330 tgg_backend_app_actions_v2
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Collaboration UI/backend compatibility: accept either auth user UUID or artist UUID as recipient.
create or replace function public.tgg_create_collaboration_request(p_recipient_id uuid, p_project_title text, p_project_type text, p_note text default null)
returns uuid language plpgsql set search_path='' as $$
declare v_user uuid:=auth.uid(); v_recipient_user uuid; v_id uuid; v_title text:=btrim(coalesce(p_project_title,'')); v_type text:=btrim(coalesce(p_project_type,'')); v_note text:=nullif(btrim(coalesce(p_note,'')),'');
begin
 if v_user is null then raise exception 'authentication required'; end if;
 select u.id into v_recipient_user from auth.users u where u.id=p_recipient_id;
 if v_recipient_user is null then select a.user_id into v_recipient_user from public.artists a where a.id=p_recipient_id limit 1; end if;
 if v_recipient_user is null or v_recipient_user=v_user then raise exception 'invalid recipient'; end if;
 if char_length(v_title)<1 or char_length(v_title)>160 then raise exception 'project title must be 1 to 160 characters'; end if;
 if char_length(v_type)<1 or char_length(v_type)>80 then raise exception 'project type must be 1 to 80 characters'; end if;
 if v_note is not null and char_length(v_note)>2000 then raise exception 'note too long'; end if;
 if exists(select 1 from public.tgg_collaboration_requests r where r.sender_id=v_user and r.recipient_id=v_recipient_user and r.project_title=v_title and r.status='pending') then raise exception 'matching request already pending'; end if;
 insert into public.tgg_collaboration_requests(sender_id,recipient_id,project_title,project_type,note,status) values(v_user,v_recipient_user,v_title,v_type,v_note,'pending') returning id into v_id;
 return v_id;
end $$;
grant execute on function public.tgg_create_collaboration_request(uuid,text,text,text) to authenticated;

-- Studio asset helper: validates ownership and canonical creator-media path.
create or replace function public.tgg_register_studio_asset(p_project_id uuid,p_asset_type text,p_name text,p_storage_path text,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_type text:=btrim(coalesce(p_asset_type,'')); v_name text:=btrim(coalesce(p_name,'')); v_path text:=btrim(coalesce(p_storage_path,''));
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.tgg_studio_projects p where p.id=p_project_id and p.user_id=v_user) then raise exception 'studio project unavailable'; end if;
 if char_length(v_type)<1 or char_length(v_type)>80 then raise exception 'invalid asset type'; end if;
 if char_length(v_name)<1 or char_length(v_name)>240 then raise exception 'invalid asset name'; end if;
 if v_path='' or split_part(v_path,'/',1)<>v_user::text then raise exception 'invalid creator media path'; end if;
 insert into public.tgg_studio_assets(project_id,user_id,asset_type,name,storage_path,metadata) values(p_project_id,v_user,v_type,v_name,v_path,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
 return v_id;
end $$;
grant execute on function public.tgg_register_studio_asset(uuid,text,text,text,jsonb) to authenticated;

-- Messenger attachment registration after client uploads to creator-media/{uid}/...
create or replace function public.tgg_register_message_attachment(p_message_id uuid,p_file_name text,p_mime_type text,p_file_size bigint,p_storage_path text,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_path text:=btrim(coalesce(p_storage_path,''));
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if not exists(select 1 from public.tgg_messages m join public.tgg_conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=v_user where m.id=p_message_id and m.sender_id=v_user) then raise exception 'message unavailable'; end if;
 if v_path='' or split_part(v_path,'/',1)<>v_user::text then raise exception 'invalid creator media path'; end if;
 insert into public.tgg_message_attachments(message_id,user_id,file_name,mime_type,file_size,storage_bucket,storage_path,metadata) values(p_message_id,v_user,btrim(p_file_name),nullif(btrim(coalesce(p_mime_type,'')),''),p_file_size,'creator-media',v_path,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
 return v_id;
end $$;
grant execute on function public.tgg_register_message_attachment(uuid,text,text,bigint,text,jsonb) to authenticated;

-- Reaction toggle and message edit/delete actions.
create or replace function public.tgg_toggle_message_reaction(p_message_id uuid,p_reaction text)
returns boolean language plpgsql set search_path='' as $$
declare v_user uuid:=auth.uid(); v_reaction text:=btrim(coalesce(p_reaction,''));
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if char_length(v_reaction)<1 or char_length(v_reaction)>32 then raise exception 'invalid reaction'; end if;
 if not exists(select 1 from public.tgg_messages m join public.tgg_conversation_members cm on cm.conversation_id=m.conversation_id and cm.user_id=v_user where m.id=p_message_id) then raise exception 'message unavailable'; end if;
 delete from public.tgg_message_reactions where message_id=p_message_id and user_id=v_user and reaction=v_reaction;
 if found then return false; end if;
 insert into public.tgg_message_reactions(message_id,user_id,reaction) values(p_message_id,v_user,v_reaction); return true;
end $$;
grant execute on function public.tgg_toggle_message_reaction(uuid,text) to authenticated;

create or replace function public.tgg_edit_message(p_message_id uuid,p_body text)
returns boolean language plpgsql set search_path='' as $$
declare v_user uuid:=auth.uid(); v_body text:=btrim(coalesce(p_body,''));
begin
 if v_user is null then raise exception 'authentication required'; end if;
 if char_length(v_body)<1 or char_length(v_body)>10000 then raise exception 'message must be 1 to 10000 characters'; end if;
 update public.tgg_messages set body=v_body,edited_at=now() where id=p_message_id and sender_id=v_user; if not found then raise exception 'message unavailable'; end if; return true;
end $$;
grant execute on function public.tgg_edit_message(uuid,text) to authenticated;

create or replace function public.tgg_delete_message(p_message_id uuid)
returns boolean language plpgsql set search_path='' as $$
declare v_user uuid:=auth.uid(); begin
 if v_user is null then raise exception 'authentication required'; end if;
 delete from public.tgg_messages where id=p_message_id and sender_id=v_user; if not found then raise exception 'message unavailable'; end if; return true;
end $$;
grant execute on function public.tgg_delete_message(uuid) to authenticated;

commit;

-- ============================================================
-- MIGRATION 20260904130446 tgg_backend_security_performance_v3
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Tighten execution privileges on authenticated app RPCs.
revoke execute on function public.tgg_delete_message(uuid) from public, anon;
revoke execute on function public.tgg_edit_message(uuid,text) from public, anon;
revoke execute on function public.tgg_register_message_attachment(uuid,text,text,bigint,text,jsonb) from public, anon;
revoke execute on function public.tgg_register_studio_asset(uuid,text,text,text,jsonb) from public, anon;
revoke execute on function public.tgg_toggle_message_reaction(uuid,text) from public, anon;
grant execute on function public.tgg_delete_message(uuid) to authenticated;
grant execute on function public.tgg_edit_message(uuid,text) to authenticated;
grant execute on function public.tgg_register_message_attachment(uuid,text,text,bigint,text,jsonb) to authenticated;
grant execute on function public.tgg_register_studio_asset(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.tgg_toggle_message_reaction(uuid,text) to authenticated;

-- Active media/video path performance.
create index if not exists tgg_media_vault_assets_project_idx on public.tgg_media_vault_assets(project_id);

commit;

-- ============================================================
-- MIGRATION 20260904131528 tgg_secure_media_enhancement_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

alter table public.tgg_vault_items
  add column if not exists media_asset_id uuid references public.tgg_media_vault_assets(id) on delete set null,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists tgg_vault_items_media_asset_idx
  on public.tgg_vault_items(media_asset_id)
  where media_asset_id is not null;

create index if not exists tgg_vault_items_storage_path_idx
  on public.tgg_vault_items(storage_path)
  where storage_path is not null;

create or replace function public.tgg_register_media_vault_asset(
  p_project_id uuid,
  p_asset_type text,
  p_title text,
  p_storage_path text,
  p_mime_type text default null,
  p_file_size_bytes bigint default null,
  p_duration_seconds numeric default null,
  p_width integer default null,
  p_height integer default null,
  p_metadata jsonb default '{}'::jsonb
) returns public.tgg_media_vault_assets
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.tgg_media_vault_assets;
  v_first text;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  if p_asset_type is null or length(btrim(p_asset_type)) < 1 or length(p_asset_type) > 80 then
    raise exception 'invalid asset type';
  end if;
  if p_title is null or length(btrim(p_title)) < 1 or length(p_title) > 200 then
    raise exception 'invalid title';
  end if;
  if p_storage_path is null or length(btrim(p_storage_path)) < 3 then
    raise exception 'storage path required';
  end if;
  v_first := split_part(p_storage_path,'/',1);
  if v_first <> v_uid::text then
    raise exception 'storage path must be scoped to current user';
  end if;
  if p_file_size_bytes is not null and (p_file_size_bytes < 0 or p_file_size_bytes > 524288000) then
    raise exception 'invalid file size';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.tgg_creative_projects cp
    where cp.id = p_project_id and cp.user_id = v_uid
  ) then
    raise exception 'creative project not found or not owned by current user';
  end if;

  insert into public.tgg_media_vault_assets(
    user_id, project_id, asset_type, title, source_kind, storage_path,
    mime_type, file_size_bytes, duration_seconds, width, height, metadata
  ) values (
    v_uid, p_project_id, btrim(p_asset_type), btrim(p_title), 'upload', btrim(p_storage_path),
    nullif(btrim(coalesce(p_mime_type,'')),''), p_file_size_bytes, p_duration_seconds, p_width, p_height,
    coalesce(p_metadata,'{}'::jsonb)
  ) returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.tgg_register_media_vault_asset(uuid,text,text,text,text,bigint,numeric,integer,integer,jsonb) from public, anon;
grant execute on function public.tgg_register_media_vault_asset(uuid,text,text,text,text,bigint,numeric,integer,integer,jsonb) to authenticated;

create or replace function public.tgg_attach_vault_media(
  p_vault_item_id uuid,
  p_media_asset_id uuid
) returns public.tgg_vault_items
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_asset public.tgg_media_vault_assets;
  v_row public.tgg_vault_items;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select * into v_asset
  from public.tgg_media_vault_assets
  where id = p_media_asset_id and user_id = v_uid;
  if not found then raise exception 'media asset not found'; end if;

  update public.tgg_vault_items vi
     set media_asset_id = v_asset.id,
         storage_path = v_asset.storage_path,
         mime_type = v_asset.mime_type,
         file_size_bytes = v_asset.file_size_bytes,
         media_url = null,
         metadata = coalesce(vi.metadata,'{}'::jsonb) || jsonb_build_object('secure_media',true)
   where vi.id = p_vault_item_id
     and exists (select 1 from public.artists a where a.id = vi.artist_id and a.user_id = v_uid)
  returning * into v_row;

  if not found then raise exception 'vault item not found or not owned by current user'; end if;
  return v_row;
end;
$$;

revoke all on function public.tgg_attach_vault_media(uuid,uuid) from public, anon;
grant execute on function public.tgg_attach_vault_media(uuid,uuid) to authenticated;

drop policy if exists "creator media vault member read" on storage.objects;
create policy "creator media vault member read"
on storage.objects for select to authenticated
using (
  bucket_id = 'creator-media'
  and exists (
    select 1
    from public.tgg_vault_items vi
    where vi.storage_path = storage.objects.name
      and (
        exists (
          select 1 from public.artists a
          where a.id = vi.artist_id and a.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.tgg_memberships m
          where m.artist_id = vi.artist_id
            and m.fan_user_id = (select auth.uid())
            and m.status = 'active'
            and (vi.min_tier_id is null or m.tier_id = vi.min_tier_id)
        )
      )
  )
);

commit;

-- ============================================================
-- MIGRATION 20260904131654 tgg_secure_upload_finalize_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

create or replace function public.tgg_finalize_studio_upload(
  p_project_id uuid,
  p_asset_type text,
  p_name text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, storage
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_storage_path is null or p_storage_path !~ ('^' || v_uid::text || '/studio/') then raise exception 'invalid studio storage path'; end if;
  if coalesce(p_file_size,0) <= 0 or p_file_size > 524288000 then raise exception 'invalid file size'; end if;
  if not exists (select 1 from public.tgg_studio_projects sp where sp.id=p_project_id and sp.user_id=v_uid) then raise exception 'studio project not found'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='creator-media' and o.name=p_storage_path) then raise exception 'uploaded storage object not found'; end if;

  v_id := public.tgg_register_studio_asset(
    p_project_id,
    p_asset_type,
    p_name,
    p_storage_path,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('mime_type',p_mime_type,'file_size',p_file_size,'secure_upload',true)
  );
  return v_id;
end;
$$;

create or replace function public.tgg_finalize_message_upload(
  p_message_id uuid,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_storage_path text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, storage
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_storage_path is null or p_storage_path !~ ('^' || v_uid::text || '/messages/') then raise exception 'invalid message storage path'; end if;
  if coalesce(p_file_size,0) <= 0 or p_file_size > 524288000 then raise exception 'invalid file size'; end if;
  if not exists (
    select 1 from public.tgg_messages m
    where m.id=p_message_id
      and (m.sender_id=v_uid or exists (
        select 1 from public.tgg_conversation_members cm
        where cm.conversation_id=m.conversation_id and cm.user_id=v_uid
      ))
  ) then raise exception 'message not accessible'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='creator-media' and o.name=p_storage_path) then raise exception 'uploaded storage object not found'; end if;

  v_id := public.tgg_register_message_attachment(
    p_message_id,p_file_name,p_mime_type,p_file_size,p_storage_path,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('secure_upload',true)
  );
  return v_id;
end;
$$;

create or replace function public.tgg_finalize_video_upload(
  p_project_id uuid,
  p_title text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_duration_seconds numeric default null,
  p_width integer default null,
  p_height integer default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, storage
as $$
declare
  v_uid uuid := auth.uid();
  v_asset public.tgg_media_vault_assets;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_storage_path is null or p_storage_path !~ ('^' || v_uid::text || '/video/') then raise exception 'invalid video storage path'; end if;
  if p_mime_type is null or p_mime_type not like 'video/%' then raise exception 'video mime type required'; end if;
  if coalesce(p_file_size,0) <= 0 or p_file_size > 524288000 then raise exception 'invalid file size'; end if;
  if not exists (select 1 from public.tgg_creative_projects cp where cp.id=p_project_id and cp.user_id=v_uid and cp.project_type='video') then raise exception 'video project not found'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='creator-media' and o.name=p_storage_path) then raise exception 'uploaded storage object not found'; end if;

  v_asset := public.tgg_register_media_vault_asset(
    p_project_id,'video',p_title,p_storage_path,p_mime_type,p_file_size,
    p_duration_seconds,p_width,p_height,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('secure_upload',true,'draft_media',true)
  );
  return v_asset.id;
end;
$$;

revoke all on function public.tgg_finalize_studio_upload(uuid,text,text,text,text,bigint,jsonb) from public, anon;
revoke all on function public.tgg_finalize_message_upload(uuid,text,text,bigint,text,jsonb) from public, anon;
revoke all on function public.tgg_finalize_video_upload(uuid,text,text,text,bigint,numeric,integer,integer,jsonb) from public, anon;
grant execute on function public.tgg_finalize_studio_upload(uuid,text,text,text,text,bigint,jsonb) to authenticated;
grant execute on function public.tgg_finalize_message_upload(uuid,text,text,bigint,text,jsonb) to authenticated;
grant execute on function public.tgg_finalize_video_upload(uuid,text,text,text,bigint,numeric,integer,integer,jsonb) to authenticated;

create index if not exists tgg_studio_assets_project_created_idx on public.tgg_studio_assets(project_id, created_at desc);
create index if not exists tgg_creative_projects_user_type_updated_idx2 on public.tgg_creative_projects(user_id, project_type, updated_at desc);
create index if not exists tgg_video_timeline_project_track_start_idx on public.tgg_video_timeline_items(project_id, track_index, start_seconds);
create index if not exists tgg_message_reads_user_read_idx on public.tgg_message_reads(user_id, read_at desc);

commit;

-- ============================================================
-- MIGRATION 20260904131755 tgg_private_media_delivery_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;

-- Canonical authenticated asset manifests. Storage remains private; clients use
-- Supabase Storage createSignedUrl only after these RLS-backed manifests expose a path.
create or replace function public.tgg_get_studio_asset_manifest(p_project_id uuid)
returns table(id uuid, asset_type text, name text, storage_path text, metadata jsonb, created_at timestamptz)
language sql security invoker set search_path=public
as $$
  select a.id,a.asset_type,a.name,a.storage_path,a.metadata,a.created_at
  from public.tgg_studio_assets a
  join public.tgg_studio_projects p on p.id=a.project_id
  where a.project_id=p_project_id and p.user_id=(select auth.uid())
  order by a.created_at desc;
$$;

create or replace function public.tgg_get_message_attachment_manifest(p_message_id uuid)
returns table(id uuid, file_name text, mime_type text, file_size bigint, storage_bucket text, storage_path text, metadata jsonb, created_at timestamptz)
language sql security invoker set search_path=public
as $$
  select a.id,a.file_name,a.mime_type,a.file_size,a.storage_bucket,a.storage_path,a.metadata,a.created_at
  from public.tgg_message_attachments a
  join public.tgg_messages m on m.id=a.message_id
  join public.tgg_conversation_members cm on cm.conversation_id=m.conversation_id
  where a.message_id=p_message_id and cm.user_id=(select auth.uid())
  order by a.created_at;
$$;

create or replace function public.tgg_get_video_asset_manifest(p_project_id uuid)
returns table(id uuid, asset_type text, title text, storage_path text, mime_type text, duration_seconds numeric, width integer, height integer, file_size_bytes bigint, metadata jsonb, created_at timestamptz)
language sql security invoker set search_path=public
as $$
  select a.id,a.asset_type,a.title,a.storage_path,a.mime_type,a.duration_seconds,a.width,a.height,a.file_size_bytes,a.metadata,a.created_at
  from public.tgg_media_vault_assets a
  join public.tgg_creative_projects p on p.id=a.project_id
  where a.project_id=p_project_id and p.user_id=(select auth.uid()) and p.project_type='video'
  order by a.created_at desc;
$$;

revoke all on function public.tgg_get_studio_asset_manifest(uuid) from public, anon;
revoke all on function public.tgg_get_message_attachment_manifest(uuid) from public, anon;
revoke all on function public.tgg_get_video_asset_manifest(uuid) from public, anon;
grant execute on function public.tgg_get_studio_asset_manifest(uuid) to authenticated;
grant execute on function public.tgg_get_message_attachment_manifest(uuid) to authenticated;
grant execute on function public.tgg_get_video_asset_manifest(uuid) to authenticated;

-- Cleanup registry lets the UI safely track uploads that reached Storage but did not finalize.
create table if not exists public.tgg_pending_media_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  app_scope text not null check (app_scope in ('studio','messages','video','vault')),
  storage_bucket text not null default 'creator-media' check (storage_bucket='creator-media'),
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending','finalized','abandoned')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique(storage_bucket,storage_path)
);
alter table public.tgg_pending_media_uploads enable row level security;
drop policy if exists "pending media own select" on public.tgg_pending_media_uploads;
drop policy if exists "pending media own insert" on public.tgg_pending_media_uploads;
drop policy if exists "pending media own update" on public.tgg_pending_media_uploads;
drop policy if exists "pending media own delete" on public.tgg_pending_media_uploads;
create policy "pending media own select" on public.tgg_pending_media_uploads for select to authenticated using ((select auth.uid())=user_id);
create policy "pending media own insert" on public.tgg_pending_media_uploads for insert to authenticated with check ((select auth.uid())=user_id and (storage.foldername(storage_path))[1]=(select auth.uid())::text and (storage.foldername(storage_path))[2]=app_scope);
create policy "pending media own update" on public.tgg_pending_media_uploads for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "pending media own delete" on public.tgg_pending_media_uploads for delete to authenticated using ((select auth.uid())=user_id);
grant select,insert,update,delete on public.tgg_pending_media_uploads to authenticated;
create index if not exists tgg_pending_media_user_status_created_idx on public.tgg_pending_media_uploads(user_id,status,created_at desc);

create or replace function public.tgg_register_pending_media_upload(p_app_scope text,p_storage_path text)
returns uuid language plpgsql security invoker set search_path=public,storage as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'authentication required'; end if;
 if p_app_scope not in ('studio','messages','video','vault') then raise exception 'invalid app scope'; end if;
 if (storage.foldername(p_storage_path))[1]<>v_uid::text or (storage.foldername(p_storage_path))[2]<>p_app_scope then raise exception 'invalid storage path'; end if;
 insert into public.tgg_pending_media_uploads(user_id,app_scope,storage_path)
 values(v_uid,p_app_scope,p_storage_path)
 on conflict(storage_bucket,storage_path) do update set status='pending',finalized_at=null
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.tgg_register_pending_media_upload(text,text) from public,anon;
grant execute on function public.tgg_register_pending_media_upload(text,text) to authenticated;

create or replace function public.tgg_mark_media_upload_finalized(p_storage_path text)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update public.tgg_pending_media_uploads set status='finalized',finalized_at=now()
 where user_id=(select auth.uid()) and storage_bucket='creator-media' and storage_path=p_storage_path;
 return found;
end $$;
revoke all on function public.tgg_mark_media_upload_finalized(text) from public,anon;
grant execute on function public.tgg_mark_media_upload_finalized(text) to authenticated;

commit;

-- ============================================================
-- MIGRATION 20260904131950 tgg_finalize_vault_upload_v1
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

begin;
create or replace function public.tgg_finalize_vault_upload(
 p_title text,
 p_asset_type text,
 p_storage_path text,
 p_mime_type text,
 p_file_size bigint,
 p_duration_seconds numeric default null,
 p_width integer default null,
 p_height integer default null,
 p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security invoker set search_path=public,storage
as $$
declare v_uid uuid:=auth.uid(); v_asset public.tgg_media_vault_assets; v_obj_exists boolean;
begin
 if v_uid is null then raise exception 'authentication required'; end if;
 if p_title is null or length(trim(p_title))=0 then raise exception 'title required'; end if;
 if p_asset_type not in ('audio','video','image','other') then raise exception 'invalid asset type'; end if;
 if p_file_size is null or p_file_size<1 or p_file_size>524288000 then raise exception 'invalid file size'; end if;
 if (storage.foldername(p_storage_path))[1]<>v_uid::text or (storage.foldername(p_storage_path))[2]<>'vault' then raise exception 'invalid storage path'; end if;
 select exists(select 1 from storage.objects where bucket_id='creator-media' and name=p_storage_path and owner_id=v_uid::text) into v_obj_exists;
 if not v_obj_exists then raise exception 'uploaded object not found'; end if;
 select * into v_asset from public.tgg_register_media_vault_asset(null,p_asset_type,trim(p_title),p_storage_path,p_mime_type,p_file_size,p_duration_seconds,p_width,p_height,coalesce(p_metadata,'{}'::jsonb));
 perform public.tgg_mark_media_upload_finalized(p_storage_path);
 return v_asset.id;
end $$;
revoke all on function public.tgg_finalize_vault_upload(text,text,text,text,bigint,numeric,integer,integer,jsonb) from public,anon;
grant execute on function public.tgg_finalize_vault_upload(text,text,text,text,bigint,numeric,integer,integer,jsonb) to authenticated;
commit;

-- ============================================================
-- MIGRATION 20260904132200 tgg_v3910_post_deploy_performance_fix
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create index if not exists tgg_mentorship_requests_mentor_user_idx on public.tgg_mentorship_requests(mentor_user_id);
create index if not exists tgg_mentorship_requests_requester_user_idx on public.tgg_mentorship_requests(requester_user_id);
create index if not exists tgg_pages_artist_idx on public.tgg_pages(artist_id);
create index if not exists tgg_pages_sender_user_idx on public.tgg_pages(sender_user_id);
create index if not exists tgg_phone_contacts_contact_user_idx on public.tgg_phone_contacts(contact_user_id);
create index if not exists tgg_playlist_items_mixtape_idx on public.tgg_playlist_items(mixtape_id);
create index if not exists tgg_playlist_items_track_idx on public.tgg_playlist_items(track_id);
create index if not exists tgg_scene_posts_user_idx on public.tgg_scene_posts(user_id);
create index if not exists tgg_short_reactions_user_idx on public.tgg_short_reactions(user_id);
create index if not exists tgg_shorts_linked_release_idx on public.tgg_shorts(linked_release_id);
create index if not exists tgg_smart_links_artist_idx on public.tgg_smart_links(artist_id);
create index if not exists tgg_stories_linked_release_idx on public.tgg_stories(linked_release_id);
create index if not exists tgg_story_reactions_user_idx on public.tgg_story_reactions(user_id);
create index if not exists tgg_story_views_viewer_idx on public.tgg_story_views(viewer_id);
create index if not exists tgg_user_achievements_achievement_idx on public.tgg_user_achievements(achievement_id);
create index if not exists tgg_voicemails_from_user_idx on public.tgg_voicemails(from_user_id);
drop index if exists public.tgg_video_timeline_project_track_start_idx;

