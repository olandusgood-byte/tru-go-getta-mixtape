-- TGG GAP CHECK EVERYTHING v2
create table if not exists private.tgg_gap_master_snapshots (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  status text not null check(status in ('complete','review','external','blocked')),
  pass_count integer not null default 0,
  review_count integer not null default 0,
  external_count integer not null default 0,
  blocked_count integer not null default 0,
  categories jsonb not null default '[]'::jsonb,
  next_action jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);
revoke all on private.tgg_gap_master_snapshots from public,anon,authenticated;



revoke all on function private.tgg_gap_only_bulk_state() from public,anon,authenticated;
grant execute on function private.tgg_gap_only_bulk_state() to postgres;
