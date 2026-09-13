# Canonical Blogger Source Intake

This directory contains the authenticated Blogger Theme > Backup export and its
companion checksum:

- `TRU_GO_GETTA_CANONICAL.xml`
- `TRU_GO_GETTA_CANONICAL.xml.sha256`

The checksum file must contain one line in standard SHA-256 format:

```text
<64-character-sha256>  TRU_GO_GETTA_CANONICAL.xml
```

The intake workflow rejects filename drift, hash drift, truncated or oversized
sources, missing Blogger markers, malformed XML, custom DTD/entity declarations,
and server-side secrets. It accepts the standard HTML doctype, generates only a
separate review candidate, validates that candidate as XML, and never overwrites
or deploys the canonical source.
