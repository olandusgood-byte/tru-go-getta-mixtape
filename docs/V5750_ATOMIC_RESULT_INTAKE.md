# V5750 — Atomic Result Intake

V5750 accepts executed browser results and verified remediation results as one
batch, validates the entire batch, and creates separate candidate ledgers.

An evidence PASS or FAIL requires a known requirement id, execution timestamp,
durable evidence reference, and notes. A remediation FIXED result requires a
known work-item id, patch reference, test reference, and verification timestamp.
Unknown ids, duplicate ids, placeholder references, partial fixes, and empty
batches are rejected.

Any accepted change clears the previous approval fields. The gate previews are
then recalculated from the candidate ledgers, so old signatures cannot approve
new evidence or fixes.

Run:

```bash
node scripts/tgg-result-intake.mjs \
  evidence/live-evidence-2026-09-12.json \
  remediation/shell-remediation-2026-09-12.json \
  execution-results.json \
  result-intake-candidate.json
```

The command never overwrites the active evidence or remediation ledgers and
performs no production write, deployment, destructive action, or automatic
remediation. Human review and new hash-bound approvals remain required.
