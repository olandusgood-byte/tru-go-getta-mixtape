# AB-005 Launch / Verification Gate Integration

AB-005 owns the continuous staging decision. The Launch / Verification surface is a read-only consumer of that decision; it must not promote production.

## Canonical boundary

`V58 workflow -> AB-005 staging gate -> Launch/Verification gate -> separate production authorization`

## Required staging evidence

A staging candidate is eligible for the Launch / Verification gate only when all of the following are true:

- `tgg_build_staging_releases.status = 'passed'`
- `tgg_build_staging_releases.checkpoint_key` is present
- `tgg_build_staging_releases.smoke_summary->>'ab005_clean_pass' = 'true'`
- the staging record retains its rollback reference (`previous_stable_key`) when one was established
- the production decision remains separate from the staging decision

The `ab005_clean_pass` marker is important: a generic legacy staging check is not a substitute for the AB-005 rollback-cutoff-aware clean-pass evaluation.

## Read-only consumer contract

The Launch / Verification consumer should report at minimum:

- staging key
- staging status
- checkpoint key
- clean-pass marker
- rollback reference / cutoff when present
- production gate required = `true`
- production promoted = `false` until a separate authorized production action occurs

The consumer must not call an AB-005 production advancement routine because AB-005 intentionally provides none.

## Existing compatibility note

`public.tgg_build_gate_staging` predates AB-005 and evaluates the broader `autobuilder:<staging_key>:` smoke namespace. It should not be treated as the authoritative AB-005 clean-pass evaluator for a rollback/retest cycle. Use `public.ab005_advance_after_clean_pass` for the AB-005 decision, then consume the resulting staging state.

## Retired infrastructure rule

Do not wire AB-005 into retired V58 staging/readiness/orchestrator/final Edge Functions. Do not resurrect those endpoints merely to provide this read-only gate.

## Production boundary

A staging `passed` result means staging verification completed. It does not authorize production deployment. Production remains subject to its existing authorization, approval, and gate controls.
