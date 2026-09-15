-- TRU GO GETTA production migration history delta
-- Reconciliation delta after the authoritative 20260914 baseline archive.
-- Historical evidence only. Do not replay against production.
-- Baseline archive contains migrations through 20260914074511 (1146 migrations).
-- This delta contains the single later production migration, bringing history to 1147.

-- ============================================================
-- MIGRATION 20260914220956 fix_creator_upload_bootstrap_grants
-- created_by: trugmusicgroup@gmail.com
-- statement_count: 1

-- Grant-only migration. No schema-object DDL is introduced, so the
-- clean-bootstrap schema baseline remains valid while migration-history
-- parity is extended by this recorded delta.
grant usage on schema public to authenticated;
grant execute on function public.tgg_creator_upload_bootstrap(text) to authenticated;
grant select, insert, update on table public.artists to authenticated;

-- ============================================================
-- RECONCILIATION METADATA
-- production_migration_count: 1147
-- baseline_migration_count: 1146
-- baseline_latest_version: 20260914074511
-- reconciled_latest_version: 20260914220956
-- source: public.tgg_migration_archive_export_chunk()
-- production_row_data_exported: false
-- production_apply_prohibited: true
