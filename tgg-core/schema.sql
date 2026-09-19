create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text,
  role text not null default 'user' check (role in ('user','artist','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);
create index if not exists sessions_expiry_idx on sessions(expires_at);

create table if not exists artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  stage_name text not null,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  title text not null,
  release_type text not null check (release_type in ('single','album','mixtape','ep','video')),
  release_year integer,
  cover_url text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists releases_artist_idx on releases(artist_id);

create table if not exists tracks (
  id uuid primary key default gen_random_uuid(),
  release_id uuid references releases(id) on delete cascade,
  artist_id uuid not null references artists(id) on delete cascade,
  title text not null,
  track_number integer,
  audio_url text,
  video_url text,
  artwork_url text,
  duration_seconds integer,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tracks_artist_idx on tracks(artist_id);
create index if not exists tracks_release_idx on tracks(release_id);

create table if not exists media_objects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  media_type text not null check (media_type in ('audio','video','image','thumbnail','document')),
  storage_key text not null unique,
  public_url text,
  size_bytes bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists world_missions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  reward_points integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists mission_sessions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references world_missions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'started' check (status in ('started','submitted','verified','rejected')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists mission_evidence (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references mission_sessions(id) on delete cascade,
  evidence_type text not null,
  evidence_url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists rewards_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  points integer not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists realtime_events (
  id bigserial primary key,
  topic text not null,
  user_id uuid references users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists realtime_events_topic_idx on realtime_events(topic, id);

create table if not exists tgg_crew (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists tgg_crew_members (
  crew_id uuid not null references tgg_crew(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create or replace function tgg_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists users_touch on users;
create trigger users_touch before update on users for each row execute function tgg_touch_updated_at();
drop trigger if exists artists_touch on artists;
create trigger artists_touch before update on artists for each row execute function tgg_touch_updated_at();
drop trigger if exists releases_touch on releases;
create trigger releases_touch before update on releases for each row execute function tgg_touch_updated_at();
drop trigger if exists tracks_touch on tracks;
create trigger tracks_touch before update on tracks for each row execute function tgg_touch_updated_at();

create or replace function tgg_emit_event() returns trigger language plpgsql as $$
begin
  perform pg_notify('tgg_realtime', json_build_object(
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'id', coalesce(new.id, old.id)
  )::text);
  return coalesce(new, old);
end $$;


-- Live Viewer event journal for TGG-owned browser sessions.
create table if not exists tgg_browser_viewer_events (
  id bigserial primary key,
  browser_session_id uuid not null references tgg_browser_sessions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tgg_browser_viewer_events_session_idx
  on tgg_browser_viewer_events(browser_session_id,id);

-- TGG-owned browser worker queue. Kept in schema.sql so fresh TGG Core databases
-- contain the same queue that server.mjs can safely initialize at runtime.
create table if not exists tgg_worker_registry (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null unique,
  worker_token_hash text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tgg_browser_jobs (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid references tgg_worker_registry(id) on delete set null,
  flow_key text not null,
  status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  evidence jsonb not null default '[]'::jsonb,
  lease_token text,
  lease_expires_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists tgg_browser_jobs_claim_idx
  on tgg_browser_jobs(status,lease_expires_at,created_at);

-- TGG-owned platform layer: storage metadata, jobs, browser certification,
-- auditability and realtime subscriptions. No Supabase-specific dependencies.
create table if not exists tgg_storage_buckets (
  id uuid primary key default gen_random_uuid(),
  bucket_key text not null unique,
  visibility text not null default 'private' check (visibility in ('private','public')),
  max_bytes bigint,
  allowed_mime_types text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists tgg_media_uploads (
  id uuid primary key default gen_random_uuid(),
  media_object_id uuid references media_objects(id) on delete cascade,
  owner_user_id uuid not null references users(id) on delete cascade,
  bucket_key text not null references tgg_storage_buckets(bucket_key),
  object_key text not null unique,
  status text not null default 'pending' check (status in ('pending','uploaded','processing','ready','failed','deleted')),
  checksum_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tgg_media_uploads_owner_idx on tgg_media_uploads(owner_user_id);
create index if not exists tgg_media_uploads_status_idx on tgg_media_uploads(status);

create table if not exists tgg_media_variants (
  id uuid primary key default gen_random_uuid(),
  media_object_id uuid not null references media_objects(id) on delete cascade,
  variant_key text not null,
  object_key text not null unique,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(media_object_id, variant_key)
);

create table if not exists tgg_jobs (
  id uuid primary key default gen_random_uuid(),
  queue text not null,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tgg_jobs_queue_idx on tgg_jobs(queue,status,priority desc,available_at);

create table if not exists tgg_browser_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  session_key text not null unique,
  status text not null default 'created' check (status in ('created','bootstrapping','active','closed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tgg_certifications (
  id uuid primary key default gen_random_uuid(),
  browser_session_id uuid references tgg_browser_sessions(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  certification_type text not null,
  status text not null default 'started' check (status in ('started','passed','failed','expired')),
  evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists tgg_audit_log (
  id bigserial primary key,
  actor_user_id uuid references users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tgg_audit_log_resource_idx on tgg_audit_log(resource_type,resource_id,created_at desc);

create table if not exists tgg_realtime_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  topic text not null,
  cursor_id bigint not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, topic)
);

insert into tgg_storage_buckets(bucket_key,visibility)
values
 ('audio','public'),('videos','public'),('covers','public'),
 ('media-thumbnails','public'),('artist-images','public')
on conflict(bucket_key) do nothing;


create table if not exists tgg_creator_messages (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references users(id) on delete cascade,
  recipient_user_id uuid not null references users(id) on delete cascade,
  subject text,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tgg_creator_messages_recipient_idx on tgg_creator_messages(recipient_user_id,created_at desc);

create table if not exists tgg_creator_supporters (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  supporter_user_id uuid references users(id) on delete set null,
  display_name text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique(artist_id,supporter_user_id)
);
create index if not exists tgg_creator_supporters_artist_idx on tgg_creator_supporters(artist_id,created_at desc);

create table if not exists tgg_creator_revenue_events (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references artists(id) on delete cascade,
  supporter_user_id uuid references users(id) on delete set null,
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'USD',
  source text not null default 'manual',
  status text not null default 'recorded' check (status in ('recorded','void')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists tgg_creator_revenue_artist_idx on tgg_creator_revenue_events(artist_id,created_at desc);


-- TGG Studio layer: projects, recording sessions, and saved versions.
create table if not exists studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  project_type text not null check (project_type in ('beat','recording','mix','master','podcast','audiobook')),
  bpm numeric,
  musical_key text,
  description text,
  status text not null default 'draft' check (status in ('draft','recording','paused','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_projects_user_idx on studio_projects(user_id,created_at desc);

create table if not exists recording_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references studio_projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  sample_rate integer,
  bit_depth integer,
  notes text,
  status text not null default 'open' check (status in ('open','paused','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists recording_sessions_user_idx on recording_sessions(user_id,started_at desc);

create table if not exists studio_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references studio_projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);
create index if not exists studio_versions_project_idx on studio_versions(project_id,created_at desc);


-- TGG_VIDEO_STUDIO_V2_SCHEMA
-- Additive project model for the professional Video Studio workstation.
create table if not exists video_studio_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  status text not null default 'editing' check (status in ('draft','editing','rendering','ready','archived')),
  width integer not null default 1920 check (width between 240 and 7680),
  height integer not null default 1080 check (height between 240 and 7680),
  fps numeric not null default 30 check (fps > 0 and fps <= 120),
  duration_ms bigint not null default 60000 check (duration_ms >= 0 and duration_ms <= 86400000),
  project_json jsonb not null default '{"version":2,"tracks":[],"assets":[],"settings":{}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists video_studio_projects_user_updated_idx on video_studio_projects(user_id,updated_at desc);

create table if not exists video_studio_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references video_studio_projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  label text not null,
  project_json jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists video_studio_versions_project_created_idx on video_studio_versions(project_id,created_at desc);

create table if not exists video_studio_exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references video_studio_projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('browser','server')),
  preset text not null,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  output_media_object_id uuid references media_objects(id) on delete set null,
  mime_type text,
  width integer,
  height integer,
  duration_ms bigint,
  size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists video_studio_exports_project_created_idx on video_studio_exports(project_id,created_at desc);
create index if not exists video_studio_exports_user_status_idx on video_studio_exports(user_id,status,created_at desc);

insert into tgg_storage_buckets(bucket_key,visibility,max_bytes,allowed_mime_types)
values (
  'creator-media','private',2147483648,
  array[
    'video/mp4','video/webm','video/quicktime',
    'audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/webm',
    'image/jpeg','image/png','image/webp','image/gif'
  ]::text[]
)
on conflict(bucket_key) do nothing;


-- TGG_VIDEO_STUDIO_V2_RENDER_BRIDGE_SCHEMA
-- TGG Core-native GitHub OIDC server-render queue. Additive and rollback-safe.
alter table tgg_jobs add column if not exists worker_id text;
alter table tgg_jobs add column if not exists lease_token_hash text;
alter table tgg_jobs add column if not exists lease_expires_at timestamptz;
create index if not exists tgg_jobs_video_render_claim_idx
  on tgg_jobs(queue,status,lease_expires_at,priority desc,created_at)
  where queue='video-render';

alter table video_studio_exports add column if not exists job_id uuid references tgg_jobs(id) on delete set null;
create unique index if not exists video_studio_exports_job_uidx
  on video_studio_exports(job_id) where job_id is not null;

create table if not exists video_studio_render_workers (
  id uuid primary key default gen_random_uuid(),
  worker_id text not null unique,
  provider text not null default 'github.oidc.ffmpeg.v2',
  status text not null default 'online' check (status in ('online','offline','error')),
  current_job_id uuid references tgg_jobs(id) on delete set null,
  progress integer not null default 0 check (progress between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists video_studio_render_workers_seen_idx
  on video_studio_render_workers(status,last_seen_at desc);
