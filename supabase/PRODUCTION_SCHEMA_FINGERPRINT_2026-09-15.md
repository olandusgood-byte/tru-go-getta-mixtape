# TGG Production Supabase Fingerprint — 2026-09-15

Read-only production fingerprint refreshed directly from `supabase_migrations.schema_migrations`. This file updates the stale 2026-09-11 ledger snapshot without modifying production schema or data.

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

## Interpretation

Production now has 108 migrations beyond the 2026-09-11 snapshot. The live migration ledger and retained SQL are internally complete, but this file is only a fingerprint. It does **not** claim source-control parity until the retained migration SQL itself is exported, reviewed, checked into recovery-safe source control, and validated by a clean-environment bootstrap.

## Safety

- No production migration was replayed.
- No production data was modified.
- No migration-history rows were altered.
- The existing 2026-09-11 fingerprint remains historical; this file is the newer production snapshot.
- Do not run `supabase db reset --linked` against production; Supabase documents that operation as destructive and intended for development/staging environments. 
