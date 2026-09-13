# V5690 — Canonical Source Intake

V5690 makes the missing Blogger export a deterministic input instead of a
manual ambiguity. V5770 supplied the authenticated export and companion hash.

The intake contract requires the canonical XML and a companion checksum whose
filename and SHA-256 must match exactly. It rejects source-size drift outside
100,000–2,000,000 bytes, missing Blogger markers, malformed XML, custom DTD or
entity declarations, and common server-secret patterns. The standard Blogger
`<!DOCTYPE html>` declaration is accepted.

When both files are present, CI performs source intake, XML parsing, regression
linting, and V5680 candidate generation. The candidate and its decision
manifest are uploaded only as review artifacts. No workflow step connects to
Blogger or deploys a theme.

The canonical source decision is now `ACCEPTED_FOR_CANDIDATE`. This does not
authorize or perform a production deployment.
