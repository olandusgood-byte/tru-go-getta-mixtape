# TGG Production Migration History

Generated from the authoritative production `supabase_migrations.schema_migrations` ledger through a GitHub OIDC trust path. No static Supabase server secret is stored in GitHub.

These dated SQL files preserve historical evidence from the point migration tracking began. They are **not a from-zero bootstrap** because the first tracked migration already depended on pre-existing V54/V58 objects. Use `../production-baseline/current-schema.sql` for clean recovery and use this history for audit/reconciliation only. Never replay this history against production.
