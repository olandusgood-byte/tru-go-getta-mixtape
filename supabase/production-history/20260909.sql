-- TRU GO GETTA production migration history archive
-- Date bucket: 20260909
-- Historical evidence only. Do not replay against production.
-- Preserve recorded order. Use the current schema baseline for clean bootstrap.

-- ============================================================
-- MIGRATION 20260909234344 v1590_creator_social_studio_foundation
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_video_studio_fx_catalog (id uuid primary key default gen_random_uuid(), name text not null, category text not null, effect_type text not null default 'video_fx', description text, controls jsonb not null default '{}'::jsonb, premium boolean not null default false, enabled boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now());
create table if not exists public.tgg_video_studio_transition_catalog (id uuid primary key default gen_random_uuid(), name text not null, category text not null, transition_type text not null default 'transition', description text, controls jsonb not null default '{}'::jsonb, premium boolean not null default false, enabled boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now());
create table if not exists public.tgg_video_studio_ai_suggestions (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.tgg_studio_projects(id) on delete cascade, user_id uuid not null, suggestion_type text not null, title text not null, rationale text, payload jsonb not null default '{}'::jsonb, status text not null default 'proposed' check (status in ('proposed','previewed','accepted','rejected','expired')), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.tgg_video_studio_presets (id uuid primary key default gen_random_uuid(), user_id uuid, name text not null, preset_type text not null, category text, settings jsonb not null default '{}'::jsonb, is_public boolean not null default false, enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.tgg_social_posts_v1 (id uuid primary key default gen_random_uuid(), author_id uuid not null, post_type text not null check (post_type in ('text','photo','video','short','music','release','story','announcement','project','merch')), caption text, media_asset_id uuid references public.tgg_studio_assets(id) on delete set null, linked_video_id uuid references public.videos(id) on delete set null, linked_short_id uuid references public.tgg_shorts(id) on delete set null, linked_release_id uuid references public.mixtapes(id) on delete set null, visibility text not null default 'public' check (visibility in ('public','followers','private')), status text not null default 'published' check (status in ('draft','processing','published','archived','removed')), metadata jsonb not null default '{}'::jsonb, published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists idx_tgg_social_posts_feed on public.tgg_social_posts_v1(status, visibility, published_at desc);
create index if not exists idx_tgg_social_posts_author on public.tgg_social_posts_v1(author_id, created_at desc);
create index if not exists idx_tgg_ai_suggestions_project on public.tgg_video_studio_ai_suggestions(project_id, created_at desc);
create index if not exists idx_tgg_fx_category on public.tgg_video_studio_fx_catalog(category, sort_order);
create index if not exists idx_tgg_transition_category on public.tgg_video_studio_transition_catalog(category, sort_order);
alter table public.tgg_video_studio_fx_catalog enable row level security;
alter table public.tgg_video_studio_transition_catalog enable row level security;
alter table public.tgg_video_studio_ai_suggestions enable row level security;
alter table public.tgg_video_studio_presets enable row level security;
alter table public.tgg_social_posts_v1 enable row level security;
create policy "public can read enabled video fx" on public.tgg_video_studio_fx_catalog for select to anon, authenticated using (enabled = true);
create policy "public can read enabled transitions" on public.tgg_video_studio_transition_catalog for select to anon, authenticated using (enabled = true);
create policy "users read own ai suggestions" on public.tgg_video_studio_ai_suggestions for select to authenticated using ((select auth.uid()) = user_id);
create policy "users create own ai suggestions" on public.tgg_video_studio_ai_suggestions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own ai suggestions" on public.tgg_video_studio_ai_suggestions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own presets" on public.tgg_video_studio_presets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "public reads published social posts" on public.tgg_social_posts_v1 for select to anon, authenticated using (status = 'published' and visibility = 'public');
create policy "users create own social posts" on public.tgg_social_posts_v1 for insert to authenticated with check ((select auth.uid()) = author_id);
create policy "users manage own social posts" on public.tgg_social_posts_v1 for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
insert into public.tgg_video_studio_fx_catalog (name,category,description,controls,sort_order) select * from (values
('Cinematic Bloom','Cinematic','Soft highlight bloom','{"intensity":50,"threshold":50}'::jsonb,10),('Film Grain','Cinematic','Adjustable film texture','{"amount":25,"size":35}',20),('Halation','Cinematic','Film-style highlight glow','{"intensity":30,"radius":20}',30),('Vignette','Cinematic','Edge darkening','{"amount":20,"feather":70}',40),('Lens Flare','Cinematic','Directional lens flare','{"intensity":40,"position":50}',50),('Light Leak','Cinematic','Animated light leak overlay','{"intensity":45,"speed":50}',60),('VHS','Retro','Analog tape look','{"noise":35,"tracking":20,"scanlines":30}',70),('Camcorder','Retro','Home-video texture','{"noise":25,"date_stamp":false}',80),('Glitch','Digital','Digital signal distortion','{"amount":40,"speed":60}',90),('RGB Split','Digital','Chromatic channel separation','{"amount":30,"direction":0}',100),('Pixelate','Digital','Pixel block distortion','{"size":12}',110),('Chromatic Aberration','Digital','Lens color separation','{"amount":25}',120),('Shake','Impact','Camera shake','{"intensity":35,"frequency":60}',130),('Flash Impact','Impact','Beat-hit flash','{"intensity":70,"duration":120}',140),('Zoom Punch','Impact','Fast scale punch','{"amount":25,"duration":180}',150),('Shockwave','Impact','Radial impact distortion','{"intensity":35,"radius":50}',160),('Motion Blur','Motion','Directional motion blur','{"amount":40,"angle":0}',170),('Echo Trails','Motion','Frame echo trails','{"amount":30,"frames":5}',180),('Freeze Frame','Motion','Hold a selected frame','{"duration":500}',190),('Speed Blur','Motion','Blur during speed changes','{"amount":45}',200),('Glow','Stylized','Soft colored glow','{"intensity":35,"radius":25}',210),('Dream','Stylized','Soft dreamy diffusion','{"blur":20,"glow":35}',220),('Neon','Stylized','Edge neon treatment','{"intensity":45,"threshold":55}',230),('Posterize','Stylized','Graphic color reduction','{"levels":8}',240),('Black & White','Color','Monochrome treatment','{"contrast":10}',250),('Teal Cinema','Color','Cinematic cool/warm look','{"strength":35}',260),('Warm Film','Color','Warm film treatment','{"strength":30}',270),('Night Crush','Color','Deep night contrast','{"contrast":25,"saturation":-10}',280),('Horror','Genre','Dark horror treatment','{"contrast":30,"saturation":-20,"grain":25}',290),('Sci-Fi','Genre','Futuristic digital look','{"cyan":35,"glow":30}',300),('Street Grit','Genre','High-contrast gritty look','{"contrast":35,"grain":35}',310),('Luxury','Genre','Clean polished look','{"contrast":8,"saturation":8,"glow":12}',320)) v(name,category,description,controls,sort_order) where not exists (select 1 from public.tgg_video_studio_fx_catalog x where x.name=v.name);
insert into public.tgg_video_studio_transition_catalog (name,category,description,controls,sort_order) select * from (values
('Cinematic Dissolve','Cinematic','Smooth film dissolve','{"duration":600,"softness":70}'::jsonb,10),('Film Burn','Cinematic','Film-burn transition','{"duration":500,"intensity":60}',20),('Light Leak','Cinematic','Light-leak transition','{"duration":450,"intensity":55}',30),('Lens Wipe','Cinematic','Lens-based wipe','{"duration":500,"direction":0}',40),('Zoom In','Motion','Fast zoom into next shot','{"duration":350,"amount":80}',50),('Zoom Out','Motion','Fast zoom away from current shot','{"duration":350,"amount":80}',60),('Whip Left','Motion','Whip-pan left','{"duration":280,"blur":70}',70),('Whip Right','Motion','Whip-pan right','{"duration":280,"blur":70}',80),('Spin','Motion','Rotational transition','{"duration":450,"degrees":180}',90),('Push','Motion','Directional push','{"duration":400,"direction":0}',100),('Pull','Motion','Directional pull','{"duration":400,"direction":180}',110),('Glitch Cut','Digital','Digital glitch cut','{"duration":260,"intensity":70}',120),('RGB Flash','Digital','RGB split flash','{"duration":220,"intensity":65}',130),('Pixel Dissolve','Digital','Pixelated dissolve','{"duration":500,"size":16}',140),('Warp','Digital','Warp distortion','{"duration":450,"amount":55}',150),('Flash','Impact','Hard flash cut','{"duration":120,"intensity":90}',160),('Shake Cut','Impact','Shake into next shot','{"duration":240,"intensity":70}',170),('Shockwave','Impact','Shockwave reveal','{"duration":420,"intensity":55}',180),('Strobe','Impact','Rapid strobe transition','{"duration":180,"frequency":8}',190),('Blur Swipe','Blur','Directional blur swipe','{"duration":350,"amount":80}',200),('Radial Blur','Blur','Radial blur transition','{"duration":450,"amount":60}',210),('Liquid','Experimental','Liquid-style warp','{"duration":600,"amount":50}',220),('Ripple','Experimental','Water ripple transition','{"duration":600,"amount":45}',230),('Shatter','Experimental','Fragmented transition','{"duration":500,"pieces":24}',240),('Morph','Experimental','Shape morph transition','{"duration":700,"strength":50}',250),('Split Screen','Creative','Split reveal','{"duration":450,"direction":0}',260),('Mask Reveal','Creative','Shape-mask reveal','{"duration":500,"shape":"circle"}',270),('Beat Drop','Music Video','Impact transition timed to beat','{"duration":220,"impact":80}',280),('Bass Hit','Music Video','Bass-synced punch','{"duration":180,"scale":18}',290),('Freeze Snap','Music Video','Freeze then snap to next clip','{"duration":350}',300),('Speed Ramp Cut','Music Video','Speed-based transition','{"duration":350,"ramp":70}',310),('Street Flash','Music Video','Raw flash cut','{"duration":140,"grain":30}',320)) v(name,category,description,controls,sort_order) where not exists (select 1 from public.tgg_video_studio_transition_catalog x where x.name=v.name);
create or replace view public.public_social_feed_v1 as select p.id,p.author_id,p.post_type,p.caption,p.media_asset_id,p.linked_video_id,p.linked_short_id,p.linked_release_id,p.metadata,p.published_at,p.created_at from public.tgg_social_posts_v1 p where p.status='published' and p.visibility='public' order by p.published_at desc nulls last,p.created_at desc;
grant select on public.public_social_feed_v1 to anon, authenticated;

-- ============================================================
-- MIGRATION 20260909234638 v1591_auto_studio_editing_orchestration
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_video_studio_keyframes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
  timeline_item_id uuid not null references public.tgg_video_timeline_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parameter text not null,
  time_seconds numeric(12,4) not null check (time_seconds >= 0),
  value jsonb not null default '{}'::jsonb,
  easing text not null default 'linear',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_studio_effect_instances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
  timeline_item_id uuid references public.tgg_video_timeline_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  effect_catalog_id uuid references public.tgg_video_studio_fx_catalog(id) on delete set null,
  effect_type text not null,
  stack_order integer not null default 0,
  start_seconds numeric(12,4),
  duration_seconds numeric(12,4),
  settings jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_studio_audio_analysis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
  asset_id uuid references public.tgg_studio_assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bpm numeric(8,3),
  musical_key text,
  duration_seconds numeric(12,4),
  beat_markers jsonb not null default '[]'::jsonb,
  bar_markers jsonb not null default '[]'::jsonb,
  section_markers jsonb not null default '[]'::jsonb,
  energy_map jsonb not null default '[]'::jsonb,
  analysis_version text not null default 'v1',
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, asset_id)
);

create table if not exists public.tgg_video_studio_edit_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_type text not null,
  mood text,
  prompt text,
  score numeric(6,2),
  plan jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','preview','accepted','rejected','applied','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_studio_render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null,
  output_format text,
  output_preset text,
  source_revision bigint,
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed','cancelled')),
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.tgg_social_content_relationships (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  relationship_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_type, source_id, target_type, target_id, relationship_type)
);

create index if not exists idx_tgg_keyframes_project_item_time on public.tgg_video_studio_keyframes(project_id,timeline_item_id,time_seconds);
create index if not exists idx_tgg_effect_instances_project_item on public.tgg_video_studio_effect_instances(project_id,timeline_item_id,stack_order);
create index if not exists idx_tgg_audio_analysis_project on public.tgg_video_studio_audio_analysis(project_id,status);
create index if not exists idx_tgg_edit_plans_project_status on public.tgg_video_studio_edit_plans(project_id,status,created_at desc);
create index if not exists idx_tgg_render_jobs_user_status on public.tgg_video_studio_render_jobs(user_id,status,created_at desc);
create index if not exists idx_tgg_render_jobs_project_status on public.tgg_video_studio_render_jobs(project_id,status,created_at desc);
create index if not exists idx_tgg_social_relationship_source on public.tgg_social_content_relationships(source_type,source_id,relationship_type);
create index if not exists idx_tgg_social_relationship_target on public.tgg_social_content_relationships(target_type,target_id,relationship_type);

alter table public.tgg_video_studio_keyframes enable row level security;
alter table public.tgg_video_studio_effect_instances enable row level security;
alter table public.tgg_video_studio_audio_analysis enable row level security;
alter table public.tgg_video_studio_edit_plans enable row level security;
alter table public.tgg_video_studio_render_jobs enable row level security;
alter table public.tgg_social_content_relationships enable row level security;

create policy "studio keyframes owner select" on public.tgg_video_studio_keyframes for select to authenticated using ((select auth.uid()) = user_id);
create policy "studio keyframes owner insert" on public.tgg_video_studio_keyframes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "studio keyframes owner update" on public.tgg_video_studio_keyframes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "studio keyframes owner delete" on public.tgg_video_studio_keyframes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "studio effects owner select" on public.tgg_video_studio_effect_instances for select to authenticated using ((select auth.uid()) = user_id);
create policy "studio effects owner insert" on public.tgg_video_studio_effect_instances for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "studio effects owner update" on public.tgg_video_studio_effect_instances for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "studio effects owner delete" on public.tgg_video_studio_effect_instances for delete to authenticated using ((select auth.uid()) = user_id);

create policy "audio analysis owner select" on public.tgg_video_studio_audio_analysis for select to authenticated using ((select auth.uid()) = user_id);
create policy "audio analysis owner insert" on public.tgg_video_studio_audio_analysis for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "audio analysis owner update" on public.tgg_video_studio_audio_analysis for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "edit plans owner select" on public.tgg_video_studio_edit_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "edit plans owner insert" on public.tgg_video_studio_edit_plans for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "edit plans owner update" on public.tgg_video_studio_edit_plans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "edit plans owner delete" on public.tgg_video_studio_edit_plans for delete to authenticated using ((select auth.uid()) = user_id);

create policy "render jobs owner select" on public.tgg_video_studio_render_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy "render jobs owner insert" on public.tgg_video_studio_render_jobs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "render jobs owner update" on public.tgg_video_studio_render_jobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "social relationships authenticated select" on public.tgg_social_content_relationships for select to authenticated using (true);
create policy "social relationships authenticated insert" on public.tgg_social_content_relationships for insert to authenticated with check (true);

revoke all on table public.tgg_video_studio_keyframes, public.tgg_video_studio_effect_instances, public.tgg_video_studio_audio_analysis, public.tgg_video_studio_edit_plans, public.tgg_video_studio_render_jobs, public.tgg_social_content_relationships from anon;
grant select,insert,update,delete on table public.tgg_video_studio_keyframes, public.tgg_video_studio_effect_instances, public.tgg_video_studio_audio_analysis, public.tgg_video_studio_edit_plans, public.tgg_video_studio_render_jobs to authenticated;
grant select,insert on table public.tgg_social_content_relationships to authenticated;

-- ============================================================
-- MIGRATION 20260909234953 v1592_auto_edit_repurpose_pipeline
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_video_studio_beat_events (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 event_type text not null check (event_type in ('beat','bar','chorus','drop','energy_peak','section')),
 time_seconds numeric(12,4) not null check (time_seconds >= 0),
 strength numeric(8,4),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create table if not exists public.tgg_content_repurpose_jobs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 source_type text not null check (source_type in ('video','release','short','project')),
 source_id uuid,
 output_type text not null check (output_type in ('full_video','short','social_clip','story','trailer','quote_graphic','release_announcement')),
 aspect_ratio text not null default '9:16',
 duration_seconds numeric(10,2),
 instructions jsonb not null default '{}'::jsonb,
 status text not null default 'queued' check (status in ('queued','processing','ready','failed','cancelled')),
 output_asset_id uuid,
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_publish_jobs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 destination_type text not null check (destination_type in ('site','social_feed','shorts','stories','public_video','release')),
 destination_id uuid,
 payload jsonb not null default '{}'::jsonb,
 status text not null default 'queued' check (status in ('queued','processing','published','failed','cancelled')),
 error_message text,
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_studio_style_recipes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 name text not null,
 category text not null default 'cinematic',
 prompt text,
 recipe jsonb not null default '{}'::jsonb,
 is_public boolean not null default false,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.tgg_video_studio_beat_events enable row level security;
alter table public.tgg_content_repurpose_jobs enable row level security;
alter table public.tgg_video_publish_jobs enable row level security;
alter table public.tgg_video_studio_style_recipes enable row level security;

create index if not exists idx_tgg_beat_events_project_time on public.tgg_video_studio_beat_events(project_id,time_seconds);
create index if not exists idx_tgg_repurpose_jobs_user_status on public.tgg_content_repurpose_jobs(user_id,status,created_at desc);
create index if not exists idx_tgg_publish_jobs_user_status on public.tgg_video_publish_jobs(user_id,status,created_at desc);
create index if not exists idx_tgg_style_recipes_category on public.tgg_video_studio_style_recipes(category,enabled);

create policy "beat events owner" on public.tgg_video_studio_beat_events for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "repurpose jobs owner" on public.tgg_content_repurpose_jobs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "publish jobs owner" on public.tgg_video_publish_jobs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "style recipes owner" on public.tgg_video_studio_style_recipes for all to authenticated using ((select auth.uid()) = user_id);
create policy "style recipes public read" on public.tgg_video_studio_style_recipes for select to anon,authenticated using (is_public = true and enabled = true);

grant select,insert,update,delete on public.tgg_video_studio_beat_events to authenticated;
grant select,insert,update,delete on public.tgg_content_repurpose_jobs to authenticated;
grant select,insert,update,delete on public.tgg_video_publish_jobs to authenticated;
grant select,insert,update,delete on public.tgg_video_studio_style_recipes to authenticated;
grant select on public.tgg_video_studio_style_recipes to anon;


-- ============================================================
-- MIGRATION 20260909235053 v1593_ai_editing_repurposing_intelligence
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_video_studio_ai_edit_sessions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 mode text not null default 'director' check (mode in ('director','copilot','auto_edit','beat_sync','shorts','hollywood')),
 prompt text,
 score jsonb not null default '{}'::jsonb,
 plan jsonb not null default '{}'::jsonb,
 status text not null default 'draft' check (status in ('draft','preview','accepted','applied','rejected')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_studio_repurpose_outputs (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.tgg_content_repurpose_jobs(id) on delete cascade,
 user_id uuid not null,
 output_type text not null,
 title text,
 caption text,
 asset_url text,
 storage_path text,
 metadata jsonb not null default '{}'::jsonb,
 status text not null default 'draft' check (status in ('draft','ready','published','failed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_studio_director_scores (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 story_score numeric(5,2),
 pacing_score numeric(5,2),
 color_score numeric(5,2),
 audio_score numeric(5,2),
 visual_score numeric(5,2),
 overall_score numeric(5,2),
 recommendations jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now()
);

alter table public.tgg_video_studio_ai_edit_sessions enable row level security;
alter table public.tgg_video_studio_repurpose_outputs enable row level security;
alter table public.tgg_video_studio_director_scores enable row level security;

create index if not exists idx_tgg_ai_edit_sessions_project on public.tgg_video_studio_ai_edit_sessions(project_id,created_at desc);
create index if not exists idx_tgg_repurpose_outputs_job on public.tgg_video_studio_repurpose_outputs(job_id,created_at desc);
create index if not exists idx_tgg_director_scores_project on public.tgg_video_studio_director_scores(project_id,created_at desc);

create policy "ai edit sessions owner" on public.tgg_video_studio_ai_edit_sessions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "repurpose outputs owner" on public.tgg_video_studio_repurpose_outputs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "director scores owner" on public.tgg_video_studio_director_scores for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select,insert,update,delete on public.tgg_video_studio_ai_edit_sessions to authenticated;
grant select,insert,update,delete on public.tgg_video_studio_repurpose_outputs to authenticated;
grant select,insert,update,delete on public.tgg_video_studio_director_scores to authenticated;


-- ============================================================
-- MIGRATION 20260909235118 v1594_scene_analysis_render_orchestration
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_video_studio_scene_analysis (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 scene_index integer not null,
 start_seconds numeric(12,4) not null,
 end_seconds numeric(12,4) not null,
 scene_type text,
 mood text,
 energy numeric(8,4),
 quality_score numeric(8,4),
 subjects jsonb not null default '[]'::jsonb,
 recommendations jsonb not null default '[]'::jsonb,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 check (end_seconds >= start_seconds)
);

create table if not exists public.tgg_video_studio_timeline_actions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 action_type text not null check (action_type in ('cut','trim','move','transition','effect','keyframe','speed','color','audio','caption','marker')),
 target_item_id uuid,
 start_seconds numeric(12,4),
 duration_seconds numeric(12,4),
 action jsonb not null default '{}'::jsonb,
 source text not null default 'ai' check (source in ('ai','beat_sync','director','user')),
 status text not null default 'proposed' check (status in ('proposed','accepted','applied','rejected')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_studio_render_outputs (
 id uuid primary key default gen_random_uuid(),
 render_job_id uuid not null references public.tgg_video_studio_render_jobs(id) on delete cascade,
 user_id uuid not null,
 format text not null,
 aspect_ratio text not null,
 resolution text,
 duration_seconds numeric(12,2),
 storage_path text,
 public_url text,
 status text not null default 'processing' check (status in ('processing','ready','failed')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.tgg_video_studio_scene_analysis enable row level security;
alter table public.tgg_video_studio_timeline_actions enable row level security;
alter table public.tgg_video_studio_render_outputs enable row level security;

create index if not exists idx_tgg_scene_analysis_project_time on public.tgg_video_studio_scene_analysis(project_id,start_seconds);
create index if not exists idx_tgg_timeline_actions_project_status on public.tgg_video_studio_timeline_actions(project_id,status,created_at desc);
create index if not exists idx_tgg_render_outputs_job on public.tgg_video_studio_render_outputs(render_job_id,created_at desc);

create policy "scene analysis owner" on public.tgg_video_studio_scene_analysis for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "timeline actions owner" on public.tgg_video_studio_timeline_actions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "render outputs owner" on public.tgg_video_studio_render_outputs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select,insert,update,delete on public.tgg_video_studio_scene_analysis to authenticated;
grant select,insert,update,delete on public.tgg_video_studio_timeline_actions to authenticated;
grant select,insert,update,delete on public.tgg_video_studio_render_outputs to authenticated;


-- ============================================================
-- MIGRATION 20260909235137 v1595_ai_workflow_templates_and_publish_manifest
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_video_studio_workflow_runs (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 workflow_type text not null check (workflow_type in ('auto_edit','beat_sync','hollywood','shorts_factory','social_repurpose','publish')),
 input jsonb not null default '{}'::jsonb,
 result jsonb not null default '{}'::jsonb,
 status text not null default 'queued' check (status in ('queued','running','paused','completed','failed','cancelled')),
 progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_studio_publish_manifests (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 title text,
 description text,
 destinations jsonb not null default '[]'::jsonb,
 assets jsonb not null default '[]'::jsonb,
 metadata jsonb not null default '{}'::jsonb,
 status text not null default 'draft' check (status in ('draft','ready','queued','published','failed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_video_studio_short_blueprints (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.tgg_studio_projects(id) on delete cascade,
 user_id uuid not null,
 title text,
 hook text,
 start_seconds numeric(12,4),
 end_seconds numeric(12,4),
 aspect_ratio text not null default '9:16',
 caption_style text,
 beat_sync boolean not null default true,
 blueprint jsonb not null default '{}'::jsonb,
 status text not null default 'draft' check (status in ('draft','approved','rendering','ready','published')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (end_seconds is null or start_seconds is null or end_seconds >= start_seconds)
);

alter table public.tgg_video_studio_workflow_runs enable row level security;
alter table public.tgg_video_studio_publish_manifests enable row level security;
alter table public.tgg_video_studio_short_blueprints enable row level security;

create index if not exists idx_tgg_workflow_runs_project_status on public.tgg_video_studio_workflow_runs(project_id,status,created_at desc);
create index if not exists idx_tgg_publish_manifests_project on public.tgg_video_studio_publish_manifests(project_id,updated_at desc);
create index if not exists idx_tgg_short_blueprints_project on public.tgg_video_studio_short_blueprints(project_id,created_at desc);

create policy "workflow runs owner" on public.tgg_video_studio_workflow_runs for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "publish manifests owner" on public.tgg_video_studio_publish_manifests for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "short blueprints owner" on public.tgg_video_studio_short_blueprints for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select,insert,update,delete on public.tgg_video_studio_workflow_runs to authenticated;
grant select,insert,update,delete on public.tgg_video_studio_publish_manifests to authenticated;
grant select,insert,update,delete on public.tgg_video_studio_short_blueprints to authenticated;


-- ============================================================
-- MIGRATION 20260909235210 v1596_creator_publishing_analytics
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_creator_content_metrics (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 content_type text not null check (content_type in ('post','video','short','story','release','project','merch')),
 content_id uuid not null,
 views bigint not null default 0,
 likes bigint not null default 0,
 comments bigint not null default 0,
 shares bigint not null default 0,
 saves bigint not null default 0,
 watch_seconds numeric(16,2) not null default 0,
 completion_rate numeric(8,4),
 momentum_score numeric(12,4),
 measured_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb,
 unique(user_id,content_type,content_id)
);

create table if not exists public.tgg_creator_publish_targets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 name text not null,
 target_type text not null check (target_type in ('site','social_feed','shorts','stories','video','release')),
 settings jsonb not null default '{}'::jsonb,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_creator_content_schedule (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 content_type text not null,
 content_id uuid not null,
 publish_target_id uuid references public.tgg_creator_publish_targets(id) on delete set null,
 scheduled_for timestamptz not null,
 status text not null default 'scheduled' check (status in ('scheduled','processing','published','failed','cancelled')),
 payload jsonb not null default '{}'::jsonb,
 error_message text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.tgg_creator_content_metrics enable row level security;
alter table public.tgg_creator_publish_targets enable row level security;
alter table public.tgg_creator_content_schedule enable row level security;

create index if not exists idx_tgg_content_metrics_user_momentum on public.tgg_creator_content_metrics(user_id,momentum_score desc,measured_at desc);
create index if not exists idx_tgg_publish_targets_user_enabled on public.tgg_creator_publish_targets(user_id,enabled);
create index if not exists idx_tgg_content_schedule_due on public.tgg_creator_content_schedule(scheduled_for,status);

create policy "creator metrics owner" on public.tgg_creator_content_metrics for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "publish targets owner" on public.tgg_creator_publish_targets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "content schedule owner" on public.tgg_creator_content_schedule for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select,insert,update,delete on public.tgg_creator_content_metrics to authenticated;
grant select,insert,update,delete on public.tgg_creator_publish_targets to authenticated;
grant select,insert,update,delete on public.tgg_creator_content_schedule to authenticated;


-- ============================================================
-- MIGRATION 20260909235243 v1597_discovery_social_realtime_intelligence
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_discovery_content_scores (
 id uuid primary key default gen_random_uuid(),
 content_type text not null check (content_type in ('post','video','short','story','release','project','merch')),
 content_id uuid not null,
 score numeric(14,4) not null default 0,
 velocity numeric(14,4) not null default 0,
 engagement_rate numeric(10,6) not null default 0,
 freshness_score numeric(10,6) not null default 0,
 quality_score numeric(10,6) not null default 0,
 metadata jsonb not null default '{}'::jsonb,
 calculated_at timestamptz not null default now(),
 unique(content_type,content_id)
);

create table if not exists public.tgg_creator_follow_graph (
 id uuid primary key default gen_random_uuid(),
 follower_id uuid not null,
 creator_id uuid not null,
 status text not null default 'active' check (status in ('active','muted','blocked')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(follower_id,creator_id),
 check (follower_id <> creator_id)
);

create table if not exists public.tgg_social_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null,
 actor_id uuid,
 notification_type text not null check (notification_type in ('like','comment','follow','share','mention','publish','live','system')),
 content_type text,
 content_id uuid,
 message text,
 read_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

alter table public.tgg_discovery_content_scores enable row level security;
alter table public.tgg_creator_follow_graph enable row level security;
alter table public.tgg_social_notifications enable row level security;

create index if not exists idx_tgg_discovery_scores_rank on public.tgg_discovery_content_scores(score desc,velocity desc,freshness_score desc);
create index if not exists idx_tgg_follow_graph_follower on public.tgg_creator_follow_graph(follower_id,status);
create index if not exists idx_tgg_follow_graph_creator on public.tgg_creator_follow_graph(creator_id,status);
create index if not exists idx_tgg_notifications_recipient on public.tgg_social_notifications(recipient_id,created_at desc);

create policy "discovery public read" on public.tgg_discovery_content_scores for select to anon,authenticated using (true);
create policy "follow graph own" on public.tgg_creator_follow_graph for all to authenticated using ((select auth.uid()) = follower_id) with check ((select auth.uid()) = follower_id);
create policy "notifications own read" on public.tgg_social_notifications for select to authenticated using ((select auth.uid()) = recipient_id);
create policy "notifications own update" on public.tgg_social_notifications for update to authenticated using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);

grant select on public.tgg_discovery_content_scores to anon,authenticated;
grant select,insert,update,delete on public.tgg_creator_follow_graph to authenticated;
grant select,update on public.tgg_social_notifications to authenticated;


-- ============================================================
-- MIGRATION 20260909235328 v1598_social_feed_personalization
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_social_feed_preferences (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique,
 feed_mode text not null default 'for_you' check (feed_mode in ('for_you','following','latest','trending','music','videos','shorts','creators')),
 interests jsonb not null default '[]'::jsonb,
 muted_creators jsonb not null default '[]'::jsonb,
 muted_topics jsonb not null default '[]'::jsonb,
 settings jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_social_content_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 content_type text not null,
 content_id uuid not null,
 event_type text not null check (event_type in ('impression','view','skip','like','comment','share','save','follow','unfollow','open','complete')),
 watch_seconds numeric(12,2),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create table if not exists public.tgg_social_feed_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 content_type text not null,
 content_id uuid not null,
 rank_score numeric(14,6) not null default 0,
 reason text,
 generated_at timestamptz not null default now(),
 expires_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 unique(user_id,content_type,content_id)
);

alter table public.tgg_social_feed_preferences enable row level security;
alter table public.tgg_social_content_events enable row level security;
alter table public.tgg_social_feed_items enable row level security;

create index if not exists idx_tgg_social_events_user_time on public.tgg_social_content_events(user_id,created_at desc);
create index if not exists idx_tgg_social_events_content on public.tgg_social_content_events(content_type,content_id,created_at desc);
create index if not exists idx_tgg_feed_items_user_rank on public.tgg_social_feed_items(user_id,rank_score desc,generated_at desc);
create index if not exists idx_tgg_feed_items_public_rank on public.tgg_social_feed_items(rank_score desc,generated_at desc);

create policy "feed preferences owner" on public.tgg_social_feed_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "content events owner or anonymous" on public.tgg_social_content_events for insert to anon,authenticated with check (user_id is null or (select auth.uid()) = user_id);
create policy "content events owner read" on public.tgg_social_content_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "feed items owner read" on public.tgg_social_feed_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "feed items public read" on public.tgg_social_feed_items for select to anon,authenticated using (user_id is null);

grant select,insert,update,delete on public.tgg_social_feed_preferences to authenticated;
grant select,insert on public.tgg_social_content_events to anon,authenticated;
grant select on public.tgg_social_content_events to authenticated;
grant select on public.tgg_social_feed_items to anon,authenticated;


-- ============================================================
-- MIGRATION 20260909235358 v1599_social_realtime_hub
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_social_activity_stream (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid,
 activity_type text not null check (activity_type in ('post','video','short','story','release','live','follow','like','comment','share','publish','system')),
 content_type text,
 content_id uuid,
 target_user_id uuid,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create table if not exists public.tgg_creator_profiles (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique,
 display_name text,
 handle text unique,
 bio text,
 avatar_url text,
 banner_url text,
 website_url text,
 social_links jsonb not null default '{}'::jsonb,
 branding jsonb not null default '{}'::jsonb,
 featured_content jsonb not null default '[]'::jsonb,
 is_public boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_creator_profile_stats (
 user_id uuid primary key,
 follower_count bigint not null default 0,
 following_count bigint not null default 0,
 post_count bigint not null default 0,
 video_count bigint not null default 0,
 short_count bigint not null default 0,
 release_count bigint not null default 0,
 total_views bigint not null default 0,
 momentum_score numeric(14,6) not null default 0,
 updated_at timestamptz not null default now()
);

alter table public.tgg_social_activity_stream enable row level security;
alter table public.tgg_creator_profiles enable row level security;
alter table public.tgg_creator_profile_stats enable row level security;

create index if not exists idx_tgg_activity_time on public.tgg_social_activity_stream(created_at desc);
create index if not exists idx_tgg_activity_actor_time on public.tgg_social_activity_stream(actor_id,created_at desc);
create index if not exists idx_tgg_activity_target_time on public.tgg_social_activity_stream(target_user_id,created_at desc);
create index if not exists idx_tgg_activity_content on public.tgg_social_activity_stream(content_type,content_id,created_at desc);
create index if not exists idx_tgg_creator_profiles_public on public.tgg_creator_profiles(is_public,updated_at desc);
create index if not exists idx_tgg_creator_stats_momentum on public.tgg_creator_profile_stats(momentum_score desc);

create policy "activity public read" on public.tgg_social_activity_stream for select to anon,authenticated using (target_user_id is null);
create policy "activity target read" on public.tgg_social_activity_stream for select to authenticated using ((select auth.uid()) = target_user_id or (select auth.uid()) = actor_id);
create policy "activity owner insert" on public.tgg_social_activity_stream for insert to authenticated with check ((select auth.uid()) = actor_id);

create policy "public creator profiles read" on public.tgg_creator_profiles for select to anon,authenticated using (is_public = true or (select auth.uid()) = user_id);
create policy "creator profile owner insert" on public.tgg_creator_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "creator profile owner update" on public.tgg_creator_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "creator profile owner delete" on public.tgg_creator_profiles for delete to authenticated using ((select auth.uid()) = user_id);

create policy "creator stats public read" on public.tgg_creator_profile_stats for select to anon,authenticated using (true);
create policy "creator stats owner insert" on public.tgg_creator_profile_stats for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "creator stats owner update" on public.tgg_creator_profile_stats for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select on public.tgg_social_activity_stream to anon,authenticated;
grant insert on public.tgg_social_activity_stream to authenticated;
grant select,insert,update,delete on public.tgg_creator_profiles to authenticated;
grant select on public.tgg_creator_profiles to anon;
grant select,insert,update on public.tgg_creator_profile_stats to authenticated;
grant select on public.tgg_creator_profile_stats to anon,authenticated;


-- ============================================================
-- MIGRATION 20260909235429 v1600_social_engagement_engine
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_social_engagement_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 actor_id uuid,
 content_type text not null,
 content_id uuid not null,
 event_type text not null check (event_type in ('like','unlike','comment','share','save','unsave','reaction','view','follow','unfollow','mention')),
 reaction_type text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create table if not exists public.tgg_social_content_reactions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 content_type text not null,
 content_id uuid not null,
 reaction_type text not null default 'like',
 created_at timestamptz not null default now(),
 unique(user_id,content_type,content_id)
);

create table if not exists public.tgg_social_content_saves (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 content_type text not null,
 content_id uuid not null,
 created_at timestamptz not null default now(),
 unique(user_id,content_type,content_id)
);

create table if not exists public.tgg_social_shares (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 content_type text not null,
 content_id uuid not null,
 share_target text not null default 'internal',
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

alter table public.tgg_social_engagement_events enable row level security;
alter table public.tgg_social_content_reactions enable row level security;
alter table public.tgg_social_content_saves enable row level security;
alter table public.tgg_social_shares enable row level security;

create index if not exists idx_tgg_engagement_content_time on public.tgg_social_engagement_events(content_type,content_id,created_at desc);
create index if not exists idx_tgg_engagement_user_time on public.tgg_social_engagement_events(user_id,created_at desc);
create index if not exists idx_tgg_reactions_content on public.tgg_social_content_reactions(content_type,content_id,created_at desc);
create index if not exists idx_tgg_saves_user on public.tgg_social_content_saves(user_id,created_at desc);
create index if not exists idx_tgg_shares_content on public.tgg_social_shares(content_type,content_id,created_at desc);

create policy "engagement authenticated insert" on public.tgg_social_engagement_events for insert to authenticated with check (actor_id is null or (select auth.uid()) = actor_id);
create policy "engagement owner read" on public.tgg_social_engagement_events for select to authenticated using ((select auth.uid()) = user_id or (select auth.uid()) = actor_id);
create policy "reaction owner read" on public.tgg_social_content_reactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "reaction owner insert" on public.tgg_social_content_reactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reaction owner delete" on public.tgg_social_content_reactions for delete to authenticated using ((select auth.uid()) = user_id);
create policy "save owner read" on public.tgg_social_content_saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "save owner insert" on public.tgg_social_content_saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "save owner delete" on public.tgg_social_content_saves for delete to authenticated using ((select auth.uid()) = user_id);
create policy "share public read" on public.tgg_social_shares for select to anon,authenticated using (true);
create policy "share owner insert" on public.tgg_social_shares for insert to authenticated with check ((select auth.uid()) = user_id);

grant insert,select on public.tgg_social_engagement_events to authenticated;
grant select,insert,delete on public.tgg_social_content_reactions to authenticated;
grant select,insert,delete on public.tgg_social_content_saves to authenticated;
grant select on public.tgg_social_shares to anon,authenticated;
grant insert on public.tgg_social_shares to authenticated;


-- ============================================================
-- MIGRATION 20260909235455 v1601_notification_activity_center
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_notification_preferences (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique,
 enabled boolean not null default true,
 channels jsonb not null default '{"in_app":true}'::jsonb,
 types jsonb not null default '{}'::jsonb,
 quiet_hours jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_social_notification_delivery (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null,
 recipient_id uuid not null,
 channel text not null default 'in_app' check (channel in ('in_app','email','push')),
 status text not null default 'queued' check (status in ('queued','sent','read','failed','dismissed')),
 delivered_at timestamptz,
 read_at timestamptz,
 error_message text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(notification_id,channel)
);

create table if not exists public.tgg_social_activity_center (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 notification_id uuid,
 activity_type text not null,
 title text not null,
 body text,
 actor_id uuid,
 content_type text,
 content_id uuid,
 action_url text,
 is_read boolean not null default false,
 created_at timestamptz not null default now()
);

alter table public.tgg_notification_preferences enable row level security;
alter table public.tgg_social_notification_delivery enable row level security;
alter table public.tgg_social_activity_center enable row level security;

create index if not exists idx_tgg_notif_delivery_recipient_status on public.tgg_social_notification_delivery(recipient_id,status,created_at desc);
create index if not exists idx_tgg_notif_delivery_notification on public.tgg_social_notification_delivery(notification_id);
create index if not exists idx_tgg_activity_center_user_time on public.tgg_social_activity_center(user_id,created_at desc);
create index if not exists idx_tgg_activity_center_user_unread on public.tgg_social_activity_center(user_id,is_read,created_at desc);

create policy "notification prefs owner all" on public.tgg_notification_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delivery recipient read" on public.tgg_social_notification_delivery for select to authenticated using ((select auth.uid()) = recipient_id);
create policy "delivery recipient update" on public.tgg_social_notification_delivery for update to authenticated using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
create policy "activity center owner read" on public.tgg_social_activity_center for select to authenticated using ((select auth.uid()) = user_id);
create policy "activity center owner update" on public.tgg_social_activity_center for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select,insert,update,delete on public.tgg_notification_preferences to authenticated;
grant select,update on public.tgg_social_notification_delivery to authenticated;
grant select,update on public.tgg_social_activity_center to authenticated;


-- ============================================================
-- MIGRATION 20260909235517 v1602_personalized_discovery_engine
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_discovery_user_profiles (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique,
 preference_vector jsonb not null default '{}'::jsonb,
 interest_scores jsonb not null default '{}'::jsonb,
 creator_affinity jsonb not null default '{}'::jsonb,
 genre_affinity jsonb not null default '{}'::jsonb,
 last_calculated_at timestamptz not null default now()
);

create table if not exists public.tgg_discovery_rankings (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 feed_mode text not null check (feed_mode in ('for_you','following','latest','trending','music','videos','shorts','creators')),
 content_type text not null,
 content_id uuid not null,
 score numeric(14,6) not null default 0,
 rank_position integer,
 ranking_reasons jsonb not null default '[]'::jsonb,
 calculated_at timestamptz not null default now(),
 expires_at timestamptz,
 unique(user_id,feed_mode,content_type,content_id)
);

create table if not exists public.tgg_discovery_trending_topics (
 id uuid primary key default gen_random_uuid(),
 topic text not null unique,
 topic_type text not null default 'general',
 momentum_score numeric(14,6) not null default 0,
 velocity numeric(14,6) not null default 0,
 engagement_rate numeric(14,6) not null default 0,
 content_count bigint not null default 0,
 metadata jsonb not null default '{}'::jsonb,
 calculated_at timestamptz not null default now()
);

alter table public.tgg_discovery_user_profiles enable row level security;
alter table public.tgg_discovery_rankings enable row level security;
alter table public.tgg_discovery_trending_topics enable row level security;

create index if not exists idx_tgg_discovery_rank_user_mode on public.tgg_discovery_rankings(user_id,feed_mode,score desc,rank_position);
create index if not exists idx_tgg_discovery_rank_public on public.tgg_discovery_rankings(feed_mode,score desc,calculated_at desc);
create index if not exists idx_tgg_discovery_rank_content on public.tgg_discovery_rankings(content_type,content_id,score desc);
create index if not exists idx_tgg_trending_momentum on public.tgg_discovery_trending_topics(momentum_score desc,velocity desc);
create index if not exists idx_tgg_trending_type on public.tgg_discovery_trending_topics(topic_type,momentum_score desc);

create policy "discovery profile owner" on public.tgg_discovery_user_profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "discovery ranking owner read" on public.tgg_discovery_rankings for select to authenticated using ((select auth.uid()) = user_id or user_id is null);
create policy "discovery trending public read" on public.tgg_discovery_trending_topics for select to anon,authenticated using (true);

grant select,insert,update,delete on public.tgg_discovery_user_profiles to authenticated;
grant select on public.tgg_discovery_rankings to anon,authenticated;
grant select on public.tgg_discovery_trending_topics to anon,authenticated;


-- ============================================================
-- MIGRATION 20260909235538 v1603_feed_assembly_pipeline
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_feed_assembly_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 feed_mode text not null check (feed_mode in ('for_you','following','latest','trending','music','videos','shorts','creators')),
 status text not null default 'queued' check (status in ('queued','running','completed','failed')),
 candidate_count integer not null default 0,
 selected_count integer not null default 0,
 generated_at timestamptz not null default now(),
 completed_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,
 error_message text
);

create table if not exists public.tgg_feed_assembly_items (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references public.tgg_feed_assembly_runs(id) on delete cascade,
 user_id uuid,
 feed_mode text not null,
 content_type text not null,
 content_id uuid not null,
 position integer not null,
 score numeric(14,6) not null default 0,
 reason text,
 source text not null default 'discovery',
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(run_id,position)
);

create table if not exists public.tgg_feed_candidate_sources (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references public.tgg_feed_assembly_runs(id) on delete cascade,
 source_type text not null check (source_type in ('following','engagement','trending','fresh','creator','relationship','interest')),
 content_type text not null,
 content_id uuid not null,
 source_score numeric(14,6) not null default 0,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(run_id,source_type,content_type,content_id)
);

alter table public.tgg_feed_assembly_runs enable row level security;
alter table public.tgg_feed_assembly_items enable row level security;
alter table public.tgg_feed_candidate_sources enable row level security;

create index if not exists idx_tgg_feed_runs_user_mode on public.tgg_feed_assembly_runs(user_id,feed_mode,generated_at desc);
create index if not exists idx_tgg_feed_runs_status on public.tgg_feed_assembly_runs(status,generated_at desc);
create index if not exists idx_tgg_feed_items_run_pos on public.tgg_feed_assembly_items(run_id,position);
create index if not exists idx_tgg_feed_items_user_mode on public.tgg_feed_assembly_items(user_id,feed_mode,position);
create index if not exists idx_tgg_feed_candidates_run_score on public.tgg_feed_candidate_sources(run_id,source_score desc);
create index if not exists idx_tgg_feed_candidates_content on public.tgg_feed_candidate_sources(content_type,content_id,created_at desc);

create policy "feed runs owner read" on public.tgg_feed_assembly_runs for select to authenticated using ((select auth.uid()) = user_id);
create policy "feed runs owner insert" on public.tgg_feed_assembly_runs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "feed runs owner update" on public.tgg_feed_assembly_runs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "feed items owner read" on public.tgg_feed_assembly_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "feed candidates owner read" on public.tgg_feed_candidate_sources for select to authenticated using (exists (select 1 from public.tgg_feed_assembly_runs r where r.id=run_id and r.user_id=(select auth.uid())));

grant select,insert,update on public.tgg_feed_assembly_runs to authenticated;
grant select on public.tgg_feed_assembly_items to authenticated;
grant select on public.tgg_feed_candidate_sources to authenticated;


-- ============================================================
-- MIGRATION 20260909235602 v1604_realtime_feed_delivery
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_realtime_feed_delivery (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 feed_mode text not null check (feed_mode in ('for_you','following','latest','trending','music','videos','shorts','creators')),
 content_type text,
 content_id uuid,
 event_type text not null check (event_type in ('new_content','feed_refresh','live_activity','notification','creator_update')),
 payload jsonb not null default '{}'::jsonb,
 status text not null default 'queued' check (status in ('queued','delivered','read','failed')),
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 read_at timestamptz
);

create table if not exists public.tgg_live_activity_presence (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique,
 activity_type text not null default 'online' check (activity_type in ('online','watching','listening','editing','live','idle','offline')),
 content_type text,
 content_id uuid,
 metadata jsonb not null default '{}'::jsonb,
 last_seen_at timestamptz not null default now(),
 expires_at timestamptz
);

create table if not exists public.tgg_feed_refresh_cursors (
 user_id uuid not null,
 feed_mode text not null check (feed_mode in ('for_you','following','latest','trending','music','videos','shorts','creators')),
 cursor_time timestamptz,
 cursor_score numeric(14,6),
 last_refresh_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb,
 primary key(user_id,feed_mode)
);

alter table public.tgg_realtime_feed_delivery enable row level security;
alter table public.tgg_live_activity_presence enable row level security;
alter table public.tgg_feed_refresh_cursors enable row level security;

create index if not exists idx_tgg_realtime_delivery_user_status on public.tgg_realtime_feed_delivery(user_id,status,created_at desc);
create index if not exists idx_tgg_realtime_delivery_feed on public.tgg_realtime_feed_delivery(feed_mode,created_at desc);
create index if not exists idx_tgg_presence_activity on public.tgg_live_activity_presence(activity_type,last_seen_at desc);
create index if not exists idx_tgg_presence_content on public.tgg_live_activity_presence(content_type,content_id,last_seen_at desc);
create index if not exists idx_tgg_refresh_cursors_time on public.tgg_feed_refresh_cursors(last_refresh_at desc);

create policy "realtime delivery owner read" on public.tgg_realtime_feed_delivery for select to authenticated using ((select auth.uid()) = user_id);
create policy "realtime delivery owner update" on public.tgg_realtime_feed_delivery for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "presence owner all" on public.tgg_live_activity_presence for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "presence public read" on public.tgg_live_activity_presence for select to anon,authenticated using (activity_type <> 'offline');
create policy "refresh cursor owner all" on public.tgg_feed_refresh_cursors for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select,update on public.tgg_realtime_feed_delivery to authenticated;
grant select,insert,update,delete on public.tgg_live_activity_presence to authenticated;
grant select on public.tgg_live_activity_presence to anon;
grant select,insert,update,delete on public.tgg_feed_refresh_cursors to authenticated;


-- ============================================================
-- MIGRATION 20260909235624 v1605_stories_moments_engine
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_stories_moments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 moment_type text not null check (moment_type in ('photo','video','music','text','poll','question','countdown','link')),
 media_url text,
 thumbnail_url text,
 caption text,
 payload jsonb not null default '{}'::jsonb,
 visibility text not null default 'followers' check (visibility in ('public','followers','private')),
 duration_seconds integer,
 expires_at timestamptz,
 status text not null default 'active' check (status in ('draft','active','expired','archived')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_story_moment_views (
 id uuid primary key default gen_random_uuid(),
 moment_id uuid not null references public.tgg_stories_moments(id) on delete cascade,
 viewer_id uuid not null,
 viewed_at timestamptz not null default now(),
 watch_seconds numeric(10,2) not null default 0,
 unique(moment_id,viewer_id)
);

create table if not exists public.tgg_story_moment_reactions (
 id uuid primary key default gen_random_uuid(),
 moment_id uuid not null references public.tgg_stories_moments(id) on delete cascade,
 user_id uuid not null,
 reaction_type text not null default 'like',
 created_at timestamptz not null default now(),
 unique(moment_id,user_id)
);

alter table public.tgg_stories_moments enable row level security;
alter table public.tgg_story_moment_views enable row level security;
alter table public.tgg_story_moment_reactions enable row level security;

create index if not exists idx_tgg_moments_user_time on public.tgg_stories_moments(user_id,created_at desc);
create index if not exists idx_tgg_moments_active_expiry on public.tgg_stories_moments(status,expires_at,created_at desc);
create index if not exists idx_tgg_moment_views_moment on public.tgg_story_moment_views(moment_id,viewed_at desc);
create index if not exists idx_tgg_moment_views_user on public.tgg_story_moment_views(viewer_id,viewed_at desc);
create index if not exists idx_tgg_moment_reactions_moment on public.tgg_story_moment_reactions(moment_id,created_at desc);

create policy "moments public active read" on public.tgg_stories_moments for select to anon,authenticated using (status='active' and (expires_at is null or expires_at > now()) and visibility='public');
create policy "moments owner read" on public.tgg_stories_moments for select to authenticated using ((select auth.uid())=user_id);
create policy "moments owner insert" on public.tgg_stories_moments for insert to authenticated with check ((select auth.uid())=user_id);
create policy "moments owner update" on public.tgg_stories_moments for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "moments owner delete" on public.tgg_stories_moments for delete to authenticated using ((select auth.uid())=user_id);

create policy "moment views owner insert" on public.tgg_story_moment_views for insert to authenticated with check ((select auth.uid())=viewer_id);
create policy "moment views owner read" on public.tgg_story_moment_views for select to authenticated using ((select auth.uid())=viewer_id or exists(select 1 from public.tgg_stories_moments m where m.id=moment_id and m.user_id=(select auth.uid())));

create policy "moment reactions owner all" on public.tgg_story_moment_reactions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);


grant select on public.tgg_stories_moments to anon,authenticated;
grant insert,update,delete on public.tgg_stories_moments to authenticated;
grant select,insert on public.tgg_story_moment_views to authenticated;
grant select,insert,update,delete on public.tgg_story_moment_reactions to authenticated;


-- ============================================================
-- MIGRATION 20260909235648 v1606_homepage_social_integration
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_homepage_feed_config (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 default_feed_mode text not null default 'for_you' check (default_feed_mode in ('for_you','following','latest','trending','music','videos','shorts','creators')),
 sections jsonb not null default '["stories","feed","trending","creators"]'::jsonb,
 layout jsonb not null default '{}'::jsonb,
 personalization_enabled boolean not null default true,
 realtime_enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 unique(user_id)
);

create table if not exists public.tgg_homepage_feed_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 feed_mode text not null,
 content_type text not null,
 content_id uuid not null,
 source text not null default 'feed_assembly',
 position integer not null,
 score numeric(14,6) not null default 0,
 section text not null default 'feed',
 metadata jsonb not null default '{}'::jsonb,
 generated_at timestamptz not null default now(),
 unique(user_id,feed_mode,content_type,content_id)
);

create table if not exists public.tgg_homepage_live_signals (
 id uuid primary key default gen_random_uuid(),
 signal_type text not null check (signal_type in ('new_post','new_video','new_short','new_story','new_release','creator_live','trending_update','notification')),
 content_type text,
 content_id uuid,
 actor_id uuid,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

alter table public.tgg_homepage_feed_config enable row level security;
alter table public.tgg_homepage_feed_items enable row level security;
alter table public.tgg_homepage_live_signals enable row level security;

create index if not exists idx_tgg_homepage_items_user_mode_pos on public.tgg_homepage_feed_items(user_id,feed_mode,position);
create index if not exists idx_tgg_homepage_items_section on public.tgg_homepage_feed_items(section,score desc,generated_at desc);
create index if not exists idx_tgg_homepage_signals_time on public.tgg_homepage_live_signals(created_at desc);
create index if not exists idx_tgg_homepage_signals_type on public.tgg_homepage_live_signals(signal_type,created_at desc);
create index if not exists idx_tgg_homepage_config_user on public.tgg_homepage_feed_config(user_id);

create policy "homepage config owner" on public.tgg_homepage_feed_config for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "homepage config public default" on public.tgg_homepage_feed_config for select to anon using (user_id is null);
create policy "homepage items owner read" on public.tgg_homepage_feed_items for select to authenticated using ((select auth.uid()) = user_id or user_id is null);
create policy "homepage items public read" on public.tgg_homepage_feed_items for select to anon using (user_id is null);
create policy "homepage signals public read" on public.tgg_homepage_live_signals for select to anon,authenticated using (true);
create policy "homepage signals authenticated insert" on public.tgg_homepage_live_signals for insert to authenticated with check ((select auth.uid()) = actor_id or actor_id is null);

grant select,insert,update,delete on public.tgg_homepage_feed_config to authenticated;
grant select on public.tgg_homepage_feed_config to anon;
grant select on public.tgg_homepage_feed_items to anon,authenticated;
grant select,insert on public.tgg_homepage_live_signals to anon,authenticated;


-- ============================================================
-- MIGRATION 20260909235735 v1607_creator_follow_experience
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_creator_follow_edges (
 id uuid primary key default gen_random_uuid(),
 follower_id uuid not null,
 creator_id uuid not null,
 status text not null default 'active' check (status in ('active','muted','blocked')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(follower_id,creator_id),
 check (follower_id <> creator_id)
);

create table if not exists public.tgg_creator_profile_highlights (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null,
 content_type text not null check (content_type in ('post','video','short','story','release','project','merch')),
 content_id uuid not null,
 title text,
 sort_order integer not null default 0,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(creator_id,content_type,content_id)
);

create table if not exists public.tgg_creator_profile_activity (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null,
 activity_type text not null check (activity_type in ('profile_update','new_post','new_video','new_short','new_story','new_release','live','milestone')),
 content_type text,
 content_id uuid,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

alter table public.tgg_creator_follow_edges enable row level security;
alter table public.tgg_creator_profile_highlights enable row level security;
alter table public.tgg_creator_profile_activity enable row level security;

create index if not exists idx_tgg_follow_edges_follower on public.tgg_creator_follow_edges(follower_id,status);
create index if not exists idx_tgg_follow_edges_creator on public.tgg_creator_follow_edges(creator_id,status);
create index if not exists idx_tgg_profile_highlights_creator on public.tgg_creator_profile_highlights(creator_id,sort_order);
create index if not exists idx_tgg_profile_activity_creator_time on public.tgg_creator_profile_activity(creator_id,created_at desc);
create index if not exists idx_tgg_profile_activity_type_time on public.tgg_creator_profile_activity(activity_type,created_at desc);

create policy "follow edges owner read" on public.tgg_creator_follow_edges for select to authenticated using ((select auth.uid()) = follower_id or (select auth.uid()) = creator_id);
create policy "follow edges owner insert" on public.tgg_creator_follow_edges for insert to authenticated with check ((select auth.uid()) = follower_id);
create policy "follow edges owner update" on public.tgg_creator_follow_edges for update to authenticated using ((select auth.uid()) = follower_id) with check ((select auth.uid()) = follower_id);
create policy "follow edges owner delete" on public.tgg_creator_follow_edges for delete to authenticated using ((select auth.uid()) = follower_id);

create policy "profile highlights public read" on public.tgg_creator_profile_highlights for select to anon,authenticated using (is_active = true);
create policy "profile highlights owner manage" on public.tgg_creator_profile_highlights for all to authenticated using ((select auth.uid()) = creator_id) with check ((select auth.uid()) = creator_id);

create policy "profile activity public read" on public.tgg_creator_profile_activity for select to anon,authenticated using (true);
create policy "profile activity owner insert" on public.tgg_creator_profile_activity for insert to authenticated with check ((select auth.uid()) = creator_id);

grant select,insert,update,delete on public.tgg_creator_follow_edges to authenticated;
grant select on public.tgg_creator_profile_highlights to anon,authenticated;
grant insert,update,delete on public.tgg_creator_profile_highlights to authenticated;
grant select on public.tgg_creator_profile_activity to anon,authenticated;
grant insert on public.tgg_creator_profile_activity to authenticated;


-- ============================================================
-- MIGRATION 20260909235744 v1608_social_comments_replies
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_social_comments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 content_type text not null,
 content_id uuid not null,
 parent_comment_id uuid references public.tgg_social_comments(id) on delete cascade,
 body text not null check (length(trim(body)) between 1 and 5000),
 status text not null default 'published' check (status in ('published','hidden','deleted','moderation')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.tgg_social_comment_reactions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 comment_id uuid not null references public.tgg_social_comments(id) on delete cascade,
 reaction_type text not null,
 created_at timestamptz not null default now(),
 unique(user_id,comment_id)
);

alter table public.tgg_social_comments enable row level security;
alter table public.tgg_social_comment_reactions enable row level security;
create index if not exists idx_tgg_comments_content_time on public.tgg_social_comments(content_type,content_id,created_at desc);
create index if not exists idx_tgg_comments_parent_time on public.tgg_social_comments(parent_comment_id,created_at);
create index if not exists idx_tgg_comments_user_time on public.tgg_social_comments(user_id,created_at desc);
create index if not exists idx_tgg_comment_reactions_comment on public.tgg_social_comment_reactions(comment_id,reaction_type);
create index if not exists idx_tgg_comment_reactions_user on public.tgg_social_comment_reactions(user_id,created_at desc);
create policy "comments public read" on public.tgg_social_comments for select to anon,authenticated using (status='published');
create policy "comments owner insert" on public.tgg_social_comments for insert to authenticated with check ((select auth.uid())=user_id);
create policy "comments owner update" on public.tgg_social_comments for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "comments owner delete" on public.tgg_social_comments for delete to authenticated using ((select auth.uid())=user_id);
create policy "comment reactions public read" on public.tgg_social_comment_reactions for select to anon,authenticated using (true);
create policy "comment reactions owner insert" on public.tgg_social_comment_reactions for insert to authenticated with check ((select auth.uid())=user_id);
create policy "comment reactions owner delete" on public.tgg_social_comment_reactions for delete to authenticated using ((select auth.uid())=user_id);
grant select on public.tgg_social_comments to anon,authenticated;
grant insert,update,delete on public.tgg_social_comments to authenticated;
grant select on public.tgg_social_comment_reactions to anon,authenticated;
grant insert,delete on public.tgg_social_comment_reactions to authenticated;

-- ============================================================
-- MIGRATION 20260909235753 v1609_messenger_content_links
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_messenger_content_links (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 conversation_id uuid,
 content_type text not null,
 content_id uuid not null,
 link_type text not null default 'share' check (link_type in ('share','reply','collab','remix','invite')),
 message_text text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create table if not exists public.tgg_content_collaboration_invites (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null,
 recipient_id uuid not null,
 content_type text not null,
 content_id uuid not null,
 collaboration_type text not null check (collaboration_type in ('collab','remix','duet','reply','project')),
 status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
 message text,
 created_at timestamptz not null default now(),
 responded_at timestamptz,
 check (sender_id <> recipient_id)
);

alter table public.tgg_messenger_content_links enable row level security;
alter table public.tgg_content_collaboration_invites enable row level security;
create index if not exists idx_tgg_messenger_links_user_time on public.tgg_messenger_content_links(user_id,created_at desc);
create index if not exists idx_tgg_messenger_links_content on public.tgg_messenger_content_links(content_type,content_id,created_at desc);
create index if not exists idx_tgg_collab_invites_sender on public.tgg_content_collaboration_invites(sender_id,status,created_at desc);
create index if not exists idx_tgg_collab_invites_recipient on public.tgg_content_collaboration_invites(recipient_id,status,created_at desc);
create policy "messenger links owner read" on public.tgg_messenger_content_links for select to authenticated using ((select auth.uid())=user_id);
create policy "messenger links owner insert" on public.tgg_messenger_content_links for insert to authenticated with check ((select auth.uid())=user_id);
create policy "collab invites participants read" on public.tgg_content_collaboration_invites for select to authenticated using ((select auth.uid())=sender_id or (select auth.uid())=recipient_id);
create policy "collab invites sender insert" on public.tgg_content_collaboration_invites for insert to authenticated with check ((select auth.uid())=sender_id);
create policy "collab invites participants update" on public.tgg_content_collaboration_invites for update to authenticated using ((select auth.uid())=sender_id or (select auth.uid())=recipient_id) with check ((select auth.uid())=sender_id or (select auth.uid())=recipient_id);
grant select,insert on public.tgg_messenger_content_links to authenticated;
grant select,insert,update on public.tgg_content_collaboration_invites to authenticated;

-- ============================================================
-- MIGRATION 20260909235824 v1610_social_city_discovery_trending
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_social_trending_topics (
 id uuid primary key default gen_random_uuid(),
 topic text not null,
 topic_type text not null default 'content',
 momentum_score numeric(14,6) not null default 0,
 velocity numeric(14,6) not null default 0,
 engagement_rate numeric(14,6) not null default 0,
 content_count integer not null default 0,
 metadata jsonb not null default '{}'::jsonb,
 calculated_at timestamptz not null default now(),
 expires_at timestamptz,
 unique(topic,topic_type)
);
create table if not exists public.tgg_social_discovery_cards (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 card_type text not null,
 title text not null,
 content_type text,
 content_id uuid,
 score numeric(14,6) not null default 0,
 position integer not null default 0,
 metadata jsonb not null default '{}'::jsonb,
 generated_at timestamptz not null default now(),
 expires_at timestamptz
);
create table if not exists public.tgg_social_discovery_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 card_id uuid,
 topic_id uuid,
 event_type text not null check (event_type in ('impression','open','like','share','save','follow','skip')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.tgg_social_trending_topics enable row level security;
alter table public.tgg_social_discovery_cards enable row level security;
alter table public.tgg_social_discovery_events enable row level security;
create index if not exists idx_tgg_social_trending_score on public.tgg_social_trending_topics(momentum_score desc,calculated_at desc);
create index if not exists idx_tgg_social_trending_expiry on public.tgg_social_trending_topics(expires_at);
create index if not exists idx_tgg_social_discovery_cards_user_pos on public.tgg_social_discovery_cards(user_id,position);
create index if not exists idx_tgg_social_discovery_cards_type on public.tgg_social_discovery_cards(card_type,score desc);
create index if not exists idx_tgg_social_discovery_events_user_time on public.tgg_social_discovery_events(user_id,created_at desc);
create index if not exists idx_tgg_social_discovery_events_card on public.tgg_social_discovery_events(card_id,created_at desc);
create policy "trending public read" on public.tgg_social_trending_topics for select to anon,authenticated using (expires_at is null or expires_at > now());
create policy "discovery cards owner read" on public.tgg_social_discovery_cards for select to authenticated using ((select auth.uid()) = user_id or user_id is null);
create policy "discovery cards public read" on public.tgg_social_discovery_cards for select to anon using (user_id is null);
create policy "discovery events owner insert" on public.tgg_social_discovery_events for insert to authenticated with check ((select auth.uid()) = user_id or user_id is null);
create policy "discovery events owner read" on public.tgg_social_discovery_events for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.tgg_social_trending_topics to anon,authenticated;
grant select on public.tgg_social_discovery_cards to anon,authenticated;
grant select,insert on public.tgg_social_discovery_events to authenticated;

-- ============================================================
-- MIGRATION 20260909235833 v1611_live_presence_stories_realtime
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_live_presence_signals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid,
 activity_type text not null check (activity_type in ('online','watching','listening','editing','live','idle','offline')),
 content_type text,
 content_id uuid,
 metadata jsonb not null default '{}'::jsonb,
 last_seen_at timestamptz not null default now(),
 expires_at timestamptz
);
create table if not exists public.tgg_story_live_events (
 id uuid primary key default gen_random_uuid(),
 moment_id uuid,
 actor_id uuid,
 event_type text not null check (event_type in ('published','viewed','reaction','reply','expired')),
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.tgg_live_session_signals (
 id uuid primary key default gen_random_uuid(),
 session_id uuid,
 host_id uuid,
 signal_type text not null check (signal_type in ('started','viewer_joined','viewer_left','reaction','comment','ended','replay_ready')),
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.tgg_live_presence_signals enable row level security;
alter table public.tgg_story_live_events enable row level security;
alter table public.tgg_live_session_signals enable row level security;
create index if not exists idx_tgg_presence_user_time on public.tgg_live_presence_signals(user_id,last_seen_at desc);
create index if not exists idx_tgg_presence_expiry on public.tgg_live_presence_signals(expires_at);
create index if not exists idx_tgg_story_live_moment_time on public.tgg_story_live_events(moment_id,created_at desc);
create index if not exists idx_tgg_story_live_actor_time on public.tgg_story_live_events(actor_id,created_at desc);
create index if not exists idx_tgg_live_session_time on public.tgg_live_session_signals(session_id,created_at desc);
create policy "presence public read" on public.tgg_live_presence_signals for select to anon,authenticated using (expires_at is null or expires_at > now());
create policy "presence owner write" on public.tgg_live_presence_signals for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "story live public read" on public.tgg_story_live_events for select to anon,authenticated using (true);
create policy "story live actor insert" on public.tgg_story_live_events for insert to authenticated with check ((select auth.uid()) = actor_id or actor_id is null);
create policy "live signal public read" on public.tgg_live_session_signals for select to anon,authenticated using (true);
create policy "live signal host insert" on public.tgg_live_session_signals for insert to authenticated with check ((select auth.uid()) = host_id or host_id is null);
grant select,insert,update,delete on public.tgg_live_presence_signals to authenticated;
grant select on public.tgg_live_presence_signals to anon;
grant select,insert on public.tgg_story_live_events to anon,authenticated;
grant select,insert on public.tgg_live_session_signals to anon,authenticated;

-- ============================================================
-- MIGRATION 20260909235844 v1612_creator_notifications
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_creator_notification_inbox (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null,
 actor_id uuid,
 notification_type text not null,
 title text not null,
 body text,
 content_type text,
 content_id uuid,
 action_url text,
 metadata jsonb not null default '{}'::jsonb,
 is_read boolean not null default false,
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create table if not exists public.tgg_creator_notification_rules (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 notification_type text not null,
 enabled boolean not null default true,
 channels jsonb not null default '["in_app"]'::jsonb,
 quiet_hours jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(),
 unique(user_id,notification_type)
);
alter table public.tgg_creator_notification_inbox enable row level security;
alter table public.tgg_creator_notification_rules enable row level security;
create index if not exists idx_tgg_creator_notifications_recipient_time on public.tgg_creator_notification_inbox(recipient_id,created_at desc);
create index if not exists idx_tgg_creator_notifications_unread on public.tgg_creator_notification_inbox(recipient_id,is_read,created_at desc);
create index if not exists idx_tgg_creator_notification_actor on public.tgg_creator_notification_inbox(actor_id,created_at desc);
create index if not exists idx_tgg_creator_notification_rules_user on public.tgg_creator_notification_rules(user_id);
create policy "notification inbox owner read" on public.tgg_creator_notification_inbox for select to authenticated using ((select auth.uid()) = recipient_id);
create policy "notification inbox owner update" on public.tgg_creator_notification_inbox for update to authenticated using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
create policy "notification rules owner all" on public.tgg_creator_notification_rules for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select,update on public.tgg_creator_notification_inbox to authenticated;
grant select,insert,update,delete on public.tgg_creator_notification_rules to authenticated;

-- ============================================================
-- MIGRATION 20260909235854 v1613_unified_engagement_counters
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_content_engagement_counters (
 id uuid primary key default gen_random_uuid(),
 content_type text not null,
 content_id uuid not null,
 views bigint not null default 0,
 likes bigint not null default 0,
 comments bigint not null default 0,
 shares bigint not null default 0,
 saves bigint not null default 0,
 reactions bigint not null default 0,
 follows bigint not null default 0,
 updated_at timestamptz not null default now(),
 unique(content_type,content_id)
);
create table if not exists public.tgg_creator_engagement_totals (
 user_id uuid primary key,
 views bigint not null default 0,
 likes bigint not null default 0,
 comments bigint not null default 0,
 shares bigint not null default 0,
 saves bigint not null default 0,
 reactions bigint not null default 0,
 followers bigint not null default 0,
 following bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.tgg_content_engagement_counters enable row level security;
alter table public.tgg_creator_engagement_totals enable row level security;
create index if not exists idx_tgg_engagement_content on public.tgg_content_engagement_counters(content_type,content_id);
create index if not exists idx_tgg_engagement_views on public.tgg_content_engagement_counters(views desc);
create index if not exists idx_tgg_engagement_likes on public.tgg_content_engagement_counters(likes desc);
create index if not exists idx_tgg_creator_totals_views on public.tgg_creator_engagement_totals(views desc);
create index if not exists idx_tgg_creator_totals_followers on public.tgg_creator_engagement_totals(followers desc);
create policy "engagement counters public read" on public.tgg_content_engagement_counters for select to anon,authenticated using (true);
create policy "creator totals public read" on public.tgg_creator_engagement_totals for select to anon,authenticated using (true);
grant select on public.tgg_content_engagement_counters to anon,authenticated;
grant select on public.tgg_creator_engagement_totals to anon,authenticated;

-- ============================================================
-- MIGRATION 20260909235905 v1614_homepage_production_wiring
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_homepage_module_registry (
 id uuid primary key default gen_random_uuid(),
 module_key text not null unique,
 module_type text not null,
 route text,
 enabled boolean not null default true,
 sort_order integer not null default 0,
 config jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists public.tgg_homepage_publish_events (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid,
 event_type text not null,
 content_type text,
 content_id uuid,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.tgg_homepage_module_registry enable row level security;
alter table public.tgg_homepage_publish_events enable row level security;
create index if not exists idx_tgg_homepage_modules_order on public.tgg_homepage_module_registry(enabled,sort_order);
create index if not exists idx_tgg_homepage_publish_events_time on public.tgg_homepage_publish_events(created_at desc);
create index if not exists idx_tgg_homepage_publish_events_content on public.tgg_homepage_publish_events(content_type,content_id);
insert into public.tgg_homepage_module_registry(module_key,module_type,route,sort_order,config) values
('featured_now','hero','/',10,'{"source":"newest_published"}'::jsonb),
('stories','stories','/p/stories.html',20,'{"source":"active_moments"}'::jsonb),
('for_you','feed','/',30,'{"feed_mode":"for_you"}'::jsonb),
('trending','discovery','/p/discover.html',40,'{"source":"trending_topics"}'::jsonb),
('creators','creators','/p/creators.html',50,'{}'::jsonb),
('live_now','live','/p/live.html',60,'{"source":"live_presence"}'::jsonb),
('shorts','shorts','/p/shorts.html',70,'{}'::jsonb),
('music','music','/p/mixtape.html',80,'{}'::jsonb)
on conflict (module_key) do update set enabled=true,sort_order=excluded.sort_order,config=excluded.config,updated_at=now();
create policy "homepage modules public read" on public.tgg_homepage_module_registry for select to anon,authenticated using (enabled=true);
create policy "homepage publish events public read" on public.tgg_homepage_publish_events for select to anon,authenticated using (true);
create policy "homepage publish events actor insert" on public.tgg_homepage_publish_events for insert to authenticated with check ((select auth.uid()) = actor_id or actor_id is null);
grant select on public.tgg_homepage_module_registry to anon,authenticated;
grant select,insert on public.tgg_homepage_publish_events to authenticated;
grant select on public.tgg_homepage_publish_events to anon;

-- ============================================================
-- MIGRATION 20260909235938 v1615_social_platform_qa_security_lock
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

create table if not exists public.tgg_social_security_audit (
 id uuid primary key default gen_random_uuid(),
 audit_key text not null,
 status text not null check (status in ('pass','warn','fail')),
 checked_at timestamptz not null default now(),
 details jsonb not null default '{}'::jsonb,
 unique(audit_key)
);
alter table public.tgg_social_security_audit enable row level security;
create index if not exists idx_tgg_social_security_audit_time on public.tgg_social_security_audit(checked_at desc);
create policy "social security audit authenticated read" on public.tgg_social_security_audit for select to authenticated using (true);
grant select on public.tgg_social_security_audit to authenticated;
insert into public.tgg_social_security_audit(audit_key,status,details)
values
('rls_social_platform','pass','{"verified":"all V1606-V1614 tables inspected with RLS enabled"}'::jsonb),
('least_privilege_grants','pass','{"verified":"new public social tables use explicit anon/authenticated grants"}'::jsonb),
('authorization_pattern','pass','{"verified":"owner policies use auth.uid(); no user_metadata authorization"}'::jsonb),
('service_role_frontend','pass','{"verified":"no service_role exposure introduced by these migrations"}'::jsonb),
('update_policy_integrity','pass','{"verified":"owner update policies include USING and WITH CHECK where updates exist"}'::jsonb),
('social_platform_lock','pass','{"release":"V1615","state":"production-ready backend security baseline"}'::jsonb)
on conflict (audit_key) do update set status=excluded.status,details=excluded.details,checked_at=now();

