-- TGG VIDEO GAME WRITER / GAME DIRECTOR

create table if not exists public.tgg_game_writer_packets (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.tgg_game_idea_inbox(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.tgg_build_projects(id) on delete set null,
  status text not null default 'queued'
    check(status in ('queued','writing','ready','revision','complete','blocked')),
  version integer not null default 1,
  game_title text,
  writing jsonb not null default '{}'::jsonb,
  acceptance jsonb not null default '[]'::jsonb,
  worker text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(idea_id,version)
);

alter table public.tgg_game_writer_packets enable row level security;

drop policy if exists "game_writer_select_own" on public.tgg_game_writer_packets;
create policy "game_writer_select_own"
on public.tgg_game_writer_packets for select to authenticated
using ((select auth.uid())=owner_user_id);

revoke all on public.tgg_game_writer_packets from anon;
revoke insert,update,delete on public.tgg_game_writer_packets from authenticated;
grant select on public.tgg_game_writer_packets to authenticated;



revoke all on function public.tgg_game_writer_enqueue(uuid) from public,anon,authenticated;
revoke all on function public.tgg_game_writer_claim_batch(text,integer) from public,anon,authenticated;
revoke all on function public.tgg_game_writer_complete(uuid,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.tgg_game_writer_mark_complete(uuid) from public,anon,authenticated;
revoke all on function public.tgg_game_writer_state() from public,anon,authenticated;

grant execute on function public.tgg_game_writer_enqueue(uuid) to authenticated;
grant execute on function public.tgg_game_writer_claim_batch(text,integer) to postgres;
grant execute on function public.tgg_game_writer_complete(uuid,jsonb,jsonb) to postgres;
grant execute on function public.tgg_game_writer_mark_complete(uuid) to postgres;
grant execute on function public.tgg_game_writer_state() to postgres;
