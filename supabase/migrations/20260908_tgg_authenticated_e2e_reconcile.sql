-- TGG Authenticated E2E evidence auto-reconcile


revoke all on function private.tgg_authenticated_e2e_reconcile() from public,anon,authenticated;
grant execute on function private.tgg_authenticated_e2e_reconcile() to postgres;

revoke all on function public.tgg_one_recorded_freight_train_cycle() from public,anon,authenticated;
grant execute on function public.tgg_one_recorded_freight_train_cycle() to postgres;
