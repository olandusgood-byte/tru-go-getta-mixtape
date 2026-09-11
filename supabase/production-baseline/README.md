# TGG Production Schema Baseline

`current-schema.sql` is a schema-only recovery snapshot generated from a **frozen Supabase snapshot ID** through the same strict GitHub OIDC path as the migration archive. It contains no production table rows.

The baseline exists because production migration tracking begins at V58.1 and therefore cannot recreate earlier V54/V58 bootstrap objects from the historical ledger alone. The snapshot records the exact migration version used during capture and rejects captures where that version changes while the snapshot is being built. The baseline must pass the isolated replay/fingerprint gate before it is considered recovery-ready. Never apply it to production.
