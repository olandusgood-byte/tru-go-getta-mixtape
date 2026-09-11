# TGG Production Migration History

This directory is generated from the authoritative production `supabase_migrations.schema_migrations` ledger through a short-lived GitHub OIDC trust path. No static Supabase server secret is stored in GitHub.

The SQL files are grouped by migration date and preserve migration order and statement text for recovery review. They are **historical evidence, not a production replay script**. Never apply them back to production. Before using them to bootstrap a clean database, validate the complete sequence in an isolated environment and compare the resulting schema against the production schema fingerprint.

See `manifest.json` for migration count and SHA-256 digests.
