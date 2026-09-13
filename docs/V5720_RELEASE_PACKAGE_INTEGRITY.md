# V5720 — Release Package Integrity

V5720 creates one cryptographically bound handoff package for the current
release-readiness state. It includes the source evidence, authenticated evidence
plan, remediation queue, integration controls, repair assets, and executable
gates used to derive the master decision.

Package integrity and release readiness are separate decisions:

- `integrity_decision: PASS` means every declared file matches its recorded
  byte count, SHA-256, role, and safe relative path.
- `release_decision: HOLD` remains authoritative until live evidence,
  remediation verification, source intake, and human approvals are complete.

The verifier also reconciles the active production baseline, review checkpoint,
and release decision against the master status document. Any missing file,
unexpected file, duplicate path, path traversal, hash drift, role drift, unsafe
control change, or master-status disagreement fails closed.

Run:

```bash
node scripts/tgg-release-package.mjs --verify package/v5720-release-readiness.json
```

This layer performs no network call, production write, deployment, destructive
action, or remediation. It does not accept or manufacture human approval.
