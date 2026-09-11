-- Review-only runtime drift classification


revoke all on function private.tgg_review_only_runtime_drift(jsonb) from public,anon,authenticated;
