#!/usr/bin/env python3
"""Fail-closed XML well-formedness check for a canonical Blogger export."""

from __future__ import annotations

import json
import pathlib
import sys
import xml.etree.ElementTree as ET


def validate_xml(path: pathlib.Path) -> dict:
    result = {
        "schema": "tgg-xml-wellformed-v1",
        "decision": "HOLD",
        "path": str(path),
        "well_formed": False,
        "reasons": [],
    }
    try:
        raw = path.read_bytes()
    except OSError as exc:
        result["reasons"].append(f"Unable to read XML: {exc}")
        return result

    upper = raw.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        result["reasons"].append("DTD and entity declarations are not accepted in the canonical source.")
        return result

    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        result["reasons"].append(f"XML parse error: {exc}")
        return result

    if not root.tag.lower().endswith("html"):
        result["reasons"].append("XML root element must be html.")
        return result

    result["decision"] = "PASS"
    result["well_formed"] = True
    return result


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python3 scripts/tgg_xml_wellformed.py SOURCE.xml", file=sys.stderr)
        return 2
    result = validate_xml(pathlib.Path(argv[1]))
    print(json.dumps(result, indent=2))
    return 0 if result["decision"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
