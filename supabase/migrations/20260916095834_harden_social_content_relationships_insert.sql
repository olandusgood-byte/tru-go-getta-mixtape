drop policy if exists "social relationships authenticated insert"
on public.tgg_social_content_relationships;

revoke insert on table public.tgg_social_content_relationships
from authenticated;
