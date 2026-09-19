-- TGG authenticated user E2E evidence refresh


revoke all on function public.tgg_authenticated_user_e2e_refresh() from public,anon,authenticated;
grant execute on function public.tgg_authenticated_user_e2e_refresh() to postgres;
