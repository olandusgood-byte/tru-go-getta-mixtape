# V5690 — Canonical Source Intake

V5690 makes the missing Blogger export a deterministic input instead of a
manual ambiguity.

The intake contract requires the canonical XML and a companion checksum whose
filename and SHA-256 must match exactly. It rejects source-size drift outside
650,000–2,000,000 bytes, missing Blogger markers, malformed XML, DTD/entity
declarations, and common server-secret patterns.

When both files are present, CI performs source intake, XML parsing, regression
linting, and V5680 candidate generation. The candidate and its decision
manifest are uploaded only as review artifacts. No workflow step connects to
Blogger or deploys a theme.

Current decision remains `HOLD` because the two canonical source files have not
been received. This is a source-availability boundary, not a passed repair or a
production failure.
