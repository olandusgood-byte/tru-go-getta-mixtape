# Production Migration Parity Closeout — 2026-09-14

Authoritative production migration recovery artifacts were refreshed through migration `20260914074511`.

- Production migration count: 1,146
- Latest migration: `20260914074511` (`remove_redundant_artists_select_policy`)
- Migration ledger SHA-256: `e3fe5df01a235cfb8f9dfca1cdac64947c531f4a40ef7205127675679cad8b8a`
- Schema baseline snapshot ID: `05c47f6e-061c-4485-aa22-a889c9e56fbb`
- Schema baseline SHA-256: `584d71d6146f5d89bf0e5842a01e23dfa4adc4fea04a42ca756795f70d3cb40d`
- Schema baseline objects: 9,256
- Production row data exported: no
- High-risk secret scan: passed
- Production replay: prohibited

The historical migration archive is evidence-only. The schema baseline is the clean-bootstrap recovery artifact and must be validated in an isolated environment before any bootstrap use.
