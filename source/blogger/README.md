# Canonical Blogger Source Intake

This directory intentionally contains no theme XML yet. The canonical export
must be added as both:

- `TRU_GO_GETTA_CANONICAL.xml`
- `TRU_GO_GETTA_CANONICAL.xml.sha256`

The checksum file must contain one line in standard SHA-256 format:

```text
<64-character-sha256>  TRU_GO_GETTA_CANONICAL.xml
```

The intake workflow rejects filename drift, hash drift, truncated or oversized
sources, missing Blogger markers, malformed XML, DTD/entity declarations, and
server-side secrets. It generates only a separate review candidate and never
overwrites or deploys the canonical source.
