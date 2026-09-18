import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
const sql = `
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
`;
const poolConn = await pool.connect();
try { await poolConn.query('begin'); await poolConn.query(sql); await poolConn.query('commit'); console.log('TGG_STUDIO_MIGRATION_OK'); }
catch (e) { await poolConn.query('rollback'); console.error('TGG_STUDIO_MIGRATION_FAILED', e.message); process.exitCode=1; }
finally { poolConn.release(); await pool.end(); }