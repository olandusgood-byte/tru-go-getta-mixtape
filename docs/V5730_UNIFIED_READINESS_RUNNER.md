# V5730 — Unified Readiness Runner

V5730 replaces manual cross-checking with one read-only command:

```bash
node scripts/tgg-readiness-runner.mjs
```

The runner evaluates five independent gates together:

1. authenticated production evidence;
2. remediation verification and its hash-bound approval;
3. consolidated master status;
4. release-package SHA-256 integrity; and
5. canonical Blogger source intake.

It returns `GO` only when every gate is green at the same time. Package
integrity alone cannot override a HOLD release, and the existence of an XML file
alone cannot bypass its checksum, size, Blogger-marker, or secret checks.

The canonical XML and checksum are now accepted and the integration candidate
is READY_FOR_HUMAN_REVIEW. The overall result remains HOLD because remediation
is not verified, the public-shell failures are unresolved in production, the 11
authenticated requirements are not PASS, and human approvals are absent.

The runner performs no network call, sign-in, production write, deployment,
destructive action, or automatic remediation.
