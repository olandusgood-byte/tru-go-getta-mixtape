# TGG Production Supabase Fingerprint — 2026-09-11

This file records a read-only fingerprint of the connected production Supabase project. It is intended for drift detection and recovery review. It does **not** recreate production and must not be treated as a replacement for a reviewed SQL schema/migration export.

## Migration ledger

- Migration count: **1,684**
- First migration version: `20260831160000`
- Latest migration version: `20260911051033`
- Latest observed migration name: `harden_private_public_epk_impl_execute`
- Ordered migration-ledger SHA-256: `272557c6efd0c5ec473c73b57653ec6e1e99fee3f3524f38fed4f7040a30ed5d`

The migration-ledger digest is computed from the ordered `version:name` sequence in `supabase_migrations.schema_migrations`.

## Live schema fingerprints

Scope: `public` and `private` schemas.

| Object class | Count | SHA-256 |
|---|---:|---|
| Columns | 9,304 | `7aa7fae806e279f43cffdc6aa57a4ee91b6020a3c42c4ed72cb5c6e4f0d13d30` |
| Constraints | 3,301 | `d8fee3bf628f838fb502305dbd07e46c95a7351bcdabb7dcace81646204e3d73` |
| Indexes | 2,101 | `0e5e9a3b2db380971c68f1006e58571f7c7c88413f0f31909c9ed46c165507cc` |
| Functions | 1,595 | `d77a9c6f505485429523ec94c9308ad5abb05e7f915426f91ab26809c7913774` |
| RLS policies | 1,117 | `5252a7bc4634ce9a7be6bca99f1430d8c7f67a257515194b930759c74734c745` |
| Non-internal triggers | 116 | `6938f27e246a3dfb37c193557ecbe734cfff091f79a2e68deeb0c7559fa6745c` |

## Interpretation

These fingerprints make accidental drift detectable: a change in the relevant ordered definitions changes the corresponding digest. They also document how far the live project has progressed beyond the small set of SQL files currently checked into `supabase/migrations/`.

They do **not** prove source-control migration parity. Full parity remains open until the authoritative live schema/migration SQL can be exported, reviewed, and checked into source control in a replay-safe form.

## Safety rule

- Do not blindly regenerate or replay 1,684 migrations against production.
- Do not rewrite production merely to make repository history look tidy.
- Preserve the currently verified production release and zero-drift state.
- Prefer a reviewed baseline/squash export for clean-environment bootstrap, with the live migration ledger retained as historical evidence.
- Recompute these hashes after any intentional production schema change.
