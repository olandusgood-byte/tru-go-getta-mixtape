# V5660 — Remediation Readiness

V5660 converts the V5650 browser findings into a controlled repair queue. It
does not claim that a defect is fixed merely because a repair action is known.

## Current decision

`HOLD`

- Six repair work items are tracked.
- Five are `OPEN` and one is `READY` because a safer existing public discovery
  RPC has already been identified.
- No item is `FIXED`.
- No production write or deployment was performed.

## Repair order

1. Isolate each custom application from Blogger post chrome and homepage
   widgets.
2. Gate protected RPC execution behind a resolved authenticated session.
3. Move homepage discovery to the existing public RPC contract.
4. Repair the Creator Store script boundary.
5. Correct protected-audio CDATA and literal numeric entities.
6. Bind ONLINE and completion labels to verified runtime evidence.

## Fixed-state requirements

The remediation gate accepts `FIXED` only when the item includes a patch
reference, browser-test reference, and verification timestamp. A final `GO`
also requires every work item to be `FIXED`, safe controls to remain unchanged,
and a human approval bound to the current remediation SHA-256.

This keeps production fail-closed and prevents planned work, static labels, or
unexecuted tests from being counted as completed remediation.
