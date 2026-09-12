#!/usr/bin/env python3

import pathlib
import tempfile
import unittest

from scripts.tgg_xml_wellformed import validate_xml


class XmlWellFormedTests(unittest.TestCase):
    def validate(self, content: str) -> dict:
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "theme.xml"
            path.write_text(content, encoding="utf-8")
            return validate_xml(path)

    def test_valid_blogger_xml_passes(self):
        result = self.validate(
            '<?xml version="1.0"?><html xmlns:b="urn:blogger"><body><b:widget id="HTML6"/></body></html>'
        )
        self.assertEqual(result["decision"], "PASS")

    def test_unclosed_document_holds(self):
        result = self.validate('<html><body>')
        self.assertEqual(result["decision"], "HOLD")
        self.assertIn("XML parse error", " ".join(result["reasons"]))

    def test_dtd_is_rejected(self):
        result = self.validate('<!DOCTYPE html><html><body/></html>')
        self.assertEqual(result["decision"], "HOLD")
        self.assertIn("DTD", " ".join(result["reasons"]))


if __name__ == "__main__":
    unittest.main()
