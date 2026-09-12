# V5680 — Integration Readiness

V5680 establishes the safe boundary between prepared repairs and the canonical
Blogger source.

## Decision

`HOLD`

The canonical Blogger XML is not present in the repository, no Blogger
connector is available, and the existing browser session is signed out.
Rendered production HTML is therefore retained as evidence and is not promoted
into a replacement theme.

## Candidate builder

`scripts/tgg-blogger-candidate.mjs` builds only a new output file and requires
the caller to provide the exact SHA-256 of the input source. It:

- refuses an unknown or changed source;
- refuses to overwrite the source or an existing output;
- requires the known `HTML6` homepage widget;
- scopes `HTML6` to the Blogger homepage when it is unscoped;
- corrects raw CDATA script openings;
- injects explicitly named review modules before `</body>`;
- runs the V5670 Blogger lint rules;
- records source/candidate hashes and every transformation; and
- returns HOLD while any definite source defect remains.

The resulting candidate still requires XML validation, human review, controlled
deployment, rollback preservation, and fresh public plus authenticated browser
evidence. The builder performs no network call or production write.
