# V5680 — Integration Readiness

V5680 establishes the safe boundary between prepared repairs and the canonical
Blogger source.

## Decision

`READY_FOR_HUMAN_REVIEW`

The user promoted the authenticated Blogger account, privileged Theme access
was confirmed, and a read-only backup produced the canonical Blogger XML. The
export and checksum are now present and pass intake plus XML validation.
Rendered production HTML remains evidence only and was not substituted for the
canonical export.

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

Against the authenticated export, the builder replaces four known direct
public-discovery joins, renames six duplicate legacy player-ID references, and
produces a well-formed candidate with a clean predeployment lint result.

The resulting candidate still requires XML validation, human review, controlled
deployment, rollback preservation, and fresh public plus authenticated browser
evidence. The builder performs no network call or production write.
