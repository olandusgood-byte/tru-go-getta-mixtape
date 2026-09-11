# TGG Production Supabase Fingerprint — 2026-09-11

This file records a read-only fingerprint of the connected production Supabase project. It is intended for drift detection and recovery review. It does **not** recreate production and must not be treated as a replacement for a reviewed SQL schema/migration export.

## Migration ledger

Authoritative source: `supabase_migrations.schema_migrations` queried directly in production.

- Migration count: **1,056**
- First migration version: `20260831124800`
- Latest migration version: `20260911051033`
- Latest observed migration name: `harden_private_public_epk_impl_execute`
- Ordered `version:name` ledger SHA-256: `85875a0e6fd0aba08a77dc1c1879446c0cfc349d782d978b4add069774e8b2c2`
- Ordered migration statements SHA-256: `a20a445b935009666e57329944e0e38a293ef2a311c5d74d81fe3e38c275c262`
- Migrations with retained statements: **1,056 / 1,056**
- Retained SQL statement bytes: **3,371,963**
- Stored rollback arrays: **0**

The earlier preliminary count recorded in this file was incorrect. The values above were recomputed directly from `supabase_migrations.schema_migrations` and supersede the preliminary connector-derived count.

A targeted high-risk literal scan of retained migration statements found zero matches for Stripe live keys, Stripe webhook signing secrets, Supabase secret keys, AWS access keys, private-key PEM blocks, JWT literals, and obvious quoted API/client/password secret assignments. This is a safety check, not a guarantee that every possible secret format is absent.

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

These fingerprints make accidental drift detectable: a change in the relevant ordered definitions changes the corresponding digest. The production migration table also retains the SQL statements for all 1,056 recorded migrations, which means a historical source-control archive can be produced without reconstructing DDL from guesses.

They do **not** by themselves prove source-control migration parity. Full parity remains open until the retained SQL is exported, reviewed, checked into source control in a recovery-safe form, and validated for clean-environment bootstrap.

## Safety rule

- Do not blindly replay 1,056 historical migrations against production.
- Do not rewrite production merely to make repository history look tidy.
- Preserve the currently verified production release and zero-drift state.
- Prefer a reviewed historical archive plus a tested clean-environment baseline/squash migration.
- Recompute these hashes after any intentional production schema change.
