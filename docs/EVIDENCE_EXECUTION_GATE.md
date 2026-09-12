# TGG Production Evidence Execution Gate

This layer turns the V5640 evidence records into a deterministic `GO` or `HOLD`
decision without running production tests, changing production, or remediating
failures. It is intentionally fail-closed.

## Input contract

The input JSON must contain an explicit `requirements` array and one unique
evidence record for every listed id. The evaluator does not hardcode a count;
this prevents a stale 10-check summary from hiding the live 11th requirement.
Each record has:

- `id`: stable requirement identifier
- `status`: `PASS`, `FAIL`, or `UNVERIFIED`
- `executed_at`: ISO timestamp for an actually executed PASS or FAIL
- `evidence_ref`: durable evidence reference; required for PASS
- `notes`: concise observation or operator context

The root object must also keep these controls:

```json
{
  "controls": {
    "fail_closed": true,
    "destructive_actions": false,
    "auto_remediation": false
  }
}
```

Run the evaluator with:

```bash
node scripts/tgg-evidence-gate.mjs evidence.json decision.json
```

The process exits `0` only for `GO`; every `HOLD` or invalid input exits `2`.

## Human approval binding

Even when every declared check passes, the decision remains `HOLD` until the release
owner adds a human approval containing `decision: GO`, their identity, an
approval timestamp, and the exact `evidence_sha256` emitted by the evaluator.
Changing any evidence record changes the hash and invalidates the approval.

## Safety boundary

This evaluator performs no network calls and no provider or database writes.
It cannot deploy, promote, delete, repair, or rerun evidence. FAIL and
UNVERIFIED remain distinct and both produce HOLD.
