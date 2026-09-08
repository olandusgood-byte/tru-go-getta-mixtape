# AB-005 Continuous Staging

AB-005 is additive and keeps production separately gated.

## Flow

1. Prepare a staging release record.
2. Run staging smoke checks.
3. Record smoke using exactly `pass`, `fail`, `blocked`, or `manual`.
4. If smoke fails/blocks, retain the staging record and use its rollback reference.
5. Roll back to the recorded reference when required.
6. Re-test cleanly.
7. Record a release checkpoint. Checkpoint keys are unique per staging record and may include creator attribution.
8. A clean `pass` plus at least one checkpoint advances the staging record to `ready_for_production`.
9. Production advancement is intentionally not automated by AB-005.

## Safety properties

- Failed or blocked smoke does not advance staging.
- A missing checkpoint does not advance staging.
- Smoke result vocabulary remains `pass/fail/blocked/manual`.
- Rollback references remain attached to the staging record.
- Production remains a separate authorization/gate boundary.

## Integration sequence

`prepare -> fail smoke -> rollback -> clean retest -> checkpoint -> pass -> production gate`
