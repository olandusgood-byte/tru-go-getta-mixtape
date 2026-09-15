# TGG Production Supabase Fingerprint — 2026-09-15

Read-only production fingerprint refreshed directly from `supabase_migrations.schema_migrations`. This updates the stale 2026-09-11/09-13 checkpoints without modifying production schema or data.

## Migration ledger

- Migration count: **1,164**
- First migration version: `20260831124800`
- Latest migration version: `20260915061031`
- Latest observed migration name: `world_multiplayer_witness_v11_7_2`
- Ordered `version:name` ledger SHA-256: `2a22a82ec477fba38db41b7a00c5e5057a20d6e9e4c5e1d464a38c2fab702689`
- Ordered retained migration-statements SHA-256: `5a41b629f4360e642909221af2c2c9bbd8187f988127279534d73226e2ad714e`
- Migrations with retained statements: **1,164 / 1,164**
- Retained statement text bytes: **3,676,580**
- Stored rollback arrays: **0**

## Source-control reconciliation

The previously archived live tail through `20260914001721` is now extended with the next live tail through `20260915061031`:

`supabase/production-history/live-tail-20260915.tsv`

The repository therefore now contains the exact production migration **version/name ledger tail** through the current live migration. This fixes the stale source-control ledger checkpoint.

The repository still does **not** contain the full retained SQL for every production migration. Production retains all 1,164 migration statement payloads and exposes them through the server-only `tgg_migration_archive_export_chunk` function. Full clean-bootstrap/source-SQL parity remains open until that retained SQL is exported, reviewed, checked into a recovery-safe archive, and validated in a clean environment.

## Current status

- [x] Live migration count refreshed
- [x] Latest live migration identified
- [x] Current ledger SHA-256 refreshed
- [x] Current retained-statement SHA-256 refreshed
- [x] Live tail version/name ledger archived through `20260915061031`
- [x] Retained SQL availability verified through server-only export function
- [ ] Full retained SQL archive checked into source control
- [ ] Clean-environment bootstrap validated
- [ ] Full migration parity PASS

## Safety

- No production migration was replayed.
- No production data was modified.
- No migration-history rows were altered.
- No synthetic purchase, user, or browser evidence was created.
- Do not run `supabase db reset --linked` against production; Supabase documents that operation as destructive and intended for development/staging environments.
