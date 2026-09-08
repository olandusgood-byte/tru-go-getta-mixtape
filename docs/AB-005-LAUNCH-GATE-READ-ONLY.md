# AB-005 Launch Gate — Read-Only Consumer

## Purpose

`public.tgg_ab005_launch_gate()` is the read-only bridge from the authoritative AB-005 continuous-staging state into Launch/Verification UI logic.

It does not deploy, promote, mutate staging, or authorize production.

## Eligibility contract

The consumer selects the most recently verified staging record carrying `smoke_summary->>'ab005_clean_pass' = 'true'` and reports it eligible only when all of the following are true:

- staging status is `passed`
- a checkpoint key is present
- the AB-005 clean-pass marker is `true`

The response also exposes the rollback reference and rollback cutoff when present.

## Production boundary

Every response explicitly reports:

- `production_gate_required = true`
- `production_promoted = false`
- `read_only = true`

A staging pass therefore makes the release eligible for the Launch/Verification gate but never authorizes production advancement.

## Security

The function is `SECURITY INVOKER`. Execute is revoked from `public` and `anon` and granted to `authenticated`. It performs no writes.

## Canonical flow

`V58 workflow -> AB-005 continuous staging -> tgg_ab005_launch_gate() -> Launch/Verification -> separate production authorization`

Do not connect this consumer to retired V58 staging/readiness/orchestrator endpoints.
