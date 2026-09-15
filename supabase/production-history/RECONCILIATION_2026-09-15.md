# Production Migration Reconciliation — 2026-09-15

## Purpose

Evidence-only reconciliation record for the TRU GO GETTA production Supabase migration ledger. This document does **not** modify production and does **not** claim source-control parity.

## Verified production state

The latest direct production check previously recorded:

- Migration count: **1,106**
- First migration: `20260831124800`
- Latest migration: `20260913155911`
- Latest migration name: `harden_media_vault_security_invoker_and_search_path`
- Current ordered ledger SHA-256: `bbde0b955e12a5f5349b5c19723845af3a3fd0b7ee6abd2513caf46db4e2ba4d`

## Repository history currently available

The repository contains daily historical production archives through:

- `20260831.sql`
- `20260901.sql`
- `20260902.sql`
- `20260903.sql`
- `20260904.sql`
- `20260905.sql`
- `20260906.sql`
- `20260907.sql`
- `20260908.sql`
- `20260909.sql`
- `20260910.sql`
- `20260911.sql`

`20260911.sql` is explicitly labeled historical evidence and includes migration `20260911002753` and later 20260911 migration history.

The repository does **not** currently contain:

- `20260912.sql`
- `20260913.sql`

An exact repository search for the live latest migration version/name also returned no matching source record.

## Reconciliation result

**STATUS: OPEN / RED**

The repository cannot currently prove parity with the live production migration ledger. The known gap is production history after the 20260911 archive boundary, including the live latest migration `20260913155911`.

This is a source-history/documentation gap, not evidence that production is broken or that the live schema should be rewritten.

## Required evidence to close

1. Obtain the retained production migration statements for migrations after the last checked-in archive boundary.
2. Review those statements for ordering, dependencies, and secret leakage.
3. Store the reviewed historical SQL in source control in a recovery-safe form.
4. Recompute the ledger fingerprint from the retained migration history.
5. Validate a clean-environment bootstrap/baseline using the reviewed archive.
6. Only then change the parity gate from OPEN to PASS.

## Safety rules

- Do not replay the historical migration chain against production.
- Do not fabricate missing migrations from schema fingerprints.
- Do not mark parity passed from the ledger count alone.
- Do not alter production solely to make repository history match.
