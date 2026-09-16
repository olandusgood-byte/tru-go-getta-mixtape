alter function public.tgg_record_smart_link_event(uuid,text,text,text,text,text,text) security definer;
alter function public.tgg_record_smart_link_event(uuid,text,text,text,text,text,text) set search_path = '';

revoke execute on function public.tgg_record_smart_link_event(uuid,text,text,text,text,text,text) from public;
grant execute on function public.tgg_record_smart_link_event(uuid,text,text,text,text,text,text) to anon, authenticated;

drop policy if exists "smart_link_events_public_insert" on public.tgg_smart_link_events;
revoke insert on table public.tgg_smart_link_events from public, anon, authenticated;
