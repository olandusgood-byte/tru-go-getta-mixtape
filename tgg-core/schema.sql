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
