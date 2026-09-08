# AB-006 — Production Authorization Boundary

## Purpose
AB-006 adds an explicit authorization boundary after the AB-005 continuous staging and Launch Gate checks. It records an intentional production authorization without performing production deployment or promotion.

## Required sequence

1. Build release enters staging.
2. Smoke checks complete using the existing `pass/fail/blocked/manual` vocabulary.
3. Failed attempts are isolated by the AB-005 rollback cutoff.
4. A clean retest passes and a unique checkpoint exists.
5. `tgg_ab005_launch_gate()` reports `eligible=true`, `read_only=true`, `production_gate_required=true`, and `production_promoted=false`.
6. An authenticated user with `profiles.role = admin` may explicitly authorize the eligible staging release through `ab006_authorize_production`.
7. The authorization record is retained for audit and handoff.
8. A separate production deployment/promote operation remains required and is not invoked by AB-006.

## Authorization contract

`public.tgg_production_authorizations` records:

- staging release ID
- checkpoint key
- unique authorization key
- authorization status
- authorizing admin user
- optional authorization note
- created/revoked/consumed timestamps

`public.ab006_authorize_production(uuid, text, text)`:

- is `SECURITY INVOKER`
- requires an authenticated admin profile
- requires AB-005 clean-pass staging eligibility
- requires the linked checkpoint
- records explicit authorization
- returns `production_authorized=true`
- always returns `production_promoted=false`
- always returns `production_deploy_performed=false`
- does not deploy or promote production

## Safety boundary

AB-006 does not resurrect retired endpoints, create a production worker, or connect the Launch Gate to automatic production deployment. The Launch Gate remains read-only and production remains separately gated.
