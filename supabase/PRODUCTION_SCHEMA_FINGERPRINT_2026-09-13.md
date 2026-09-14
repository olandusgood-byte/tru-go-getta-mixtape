# TGG Production Supabase Fingerprint — 2026-09-13

This is a read-only production verification checkpoint. It does not replay or modify production.

## Current live migration ledger

Authoritative source: `supabase_migrations.schema_migrations` queried directly in production project `xsofowzvwetamhyuvlpj`.

- Live migration count: **1,106**
- First migration version: `20260831124800`
- Latest live migration version: `20260914001721`
- Latest live migration name: `optimize_codesync_rpc_registry_refresh`
- Current ordered `version:name` ledger SHA-256: `bbde0b955e12a5f5349b5c19723845af3a3fd0b7ee6abd2513caf46db4e2ba4d`
- Tail after repository's 2026-09-11 baseline: **78 migrations**
- Tail first version: `20260911081536`
- Tail latest version: `20260914001721`
- Tail ordered `version:name` SHA-256: `c71c4eaf164b0955563f17b0c2e36a0662d7067438b4465d8ab6c06116e138f9`
- Tail ordered retained-statement SHA-256: `9cfd8a074e5ef623746a99293cae50236fc7ddd6a9afa05ccc3363a2fd8ddd35`

## Source-control reconciliation performed

The repository already contained the historical production archive through the 2026-09-11 baseline. A live tail ledger for all 78 migrations after that baseline has now been checked into:

`supabase/production-history/live-tail-20260913.tsv`

This establishes the exact live version/name sequence for the previously missing 2026-09-11 through 2026-09-14 tail and prevents the stale 1,056-migration fingerprint from being mistaken for current production state.

## Important boundary

The 78 migration **names/versions** are now archived in source control, but the full retained SQL statements for those 78 migrations have not been copied into ordinary migration files here. Production retains those statements and exposes them through the server-only `tgg_migration_archive_export_chunk` function. Therefore **full clean-bootstrap/source-SQL parity is still OPEN** until the retained SQL is exported, reviewed, checked into a recovery-safe archive, and validated in a clean environment.

Do not mark this as a full migration-parity PASS solely from the ledger hash or names.

## Verification status

- [x] Live production migration count re-read
- [x] Latest live migration identified
- [x] Current ledger SHA-256 re-read
- [x] 78-migration production tail enumerated
- [x] Tail ledger committed to source control
- [x] Retained SQL availability verified through server-only export function
- [ ] Full retained SQL tail archive checked into source control
- [ ] Clean-environment bootstrap validated
- [ ] Full migration parity PASS

## Safety

No production DDL, data mutation, purchase, user creation, browser evidence, or release-gate override was performed by this checkpoint.
