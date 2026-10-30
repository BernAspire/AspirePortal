import base64
import json
import tempfile
import unittest
from pathlib import Path

from bank import parse_name, read_file
from bank_v2 import IMG_PREFIX, answer_parts, convert_v2, is_open, plain, rich

PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"x" * 20).decode()
DATA = {
    "sections": {"WN-A": "Numbers to 10 Million", "WN-B": "Four Operations"},
    "short": {"WN-A": "Numbers", "WN-B": "Operations"},
    "hint": "Type the number only.",
    "key": "test",
    "img": [PNG],
    "items": [
        {"id": "Q0001", "s": "WN-A", "d": 1, "p": "A", "src": "Product A · Paper", "g": "Q0001",
         "q": ["Which is ⟦3‖4⟧ of 8?", "[[img:0:320]]"], "o": ["6", "2⟦1‖2⟧", "4", "8"], "c": 1, "a": "(1)", "k": []},
        {"id": "Q0002", "s": "WN-B", "d": 2, "p": "D", "src": "Product D", "g": "R1", "x": 1,
         "q": ["Find the area.", {"table": [["Side", "Length"], ["a", "⟦1‖2⟧ m"]]}],
         "a": "(a) 54 cm² ; (b) 3⟦2‖7⟧",
         "k": ["\tArea\t= 6 × 9", "\t\t= 54 cm²", "(a)", "[[img:0:200]]", {"table": [["x"]]}]},
        {"id": "Q0003", "s": "WN-B", "d": 3, "p": "BC", "src": "Product BC", "g": "R1",
         "q": ["Explain."], "a": "No, because the tens digit is less than 5.", "k": ["Look at the tens digit."]},
        {"id": "Q0004", "s": "WN-A", "d": 1, "p": "A", "src": "P", "g": "Q0004", "draw": 1,
         "q": ["Draw the next pattern."], "a": "A row of 6 circles", "k": []},
    ],
}


def page(data: dict) -> str:
    return f"<!doctype html><html><body><script>\nconst BANK = {json.dumps(data)};\nconst X = 1;\n</script></body></html>"


class InlineTests(unittest.TestCase):
    def test_fractions(self):
        self.assertEqual(rich("3⟦2‖7⟧ kg"), ["3", {"frac": [["2"], ["7"]]}, " kg"])
        self.assertEqual(rich("⟦28⟦1‖2⟧‖50⟧"), [{"frac": [["28", {"frac": [["1"], ["2"]]}], ["50"]]}])
        self.assertEqual(rich("a\tb"), ["a b"])
        with self.assertRaises(ValueError):
            rich("⟦1‖2")

    def test_plain_and_parts(self):
        self.assertEqual(plain("3⟦2‖7⟧ and ⟦1‖3⟧"), "3 2/7 and 1/3")
        self.assertEqual(answer_parts("(a) 54 cm² ; (b) 3⟦2‖7⟧"), [{"label": "(a)", "text": "54 cm²"}, {"label": "(b)", "text": "3 2/7"}])
        self.assertEqual(answer_parts("Length: 4 cm ; Width: 3 cm"), [{"label": "Length", "text": "4 cm"}, {"label": "Width", "text": "3 cm"}])
        self.assertEqual(answer_parts("(4)"), [{"label": "", "text": "(4)"}])
        self.assertEqual(answer_parts("(a) 5"), [{"label": "(a)", "text": "5"}])
        self.assertEqual(answer_parts("A = 20 ; B = 49"), [{"label": "", "text": "A = 20 ; B = 49"}])
        self.assertTrue(is_open("No, because it is smaller."))
        self.assertFalse(is_open("54 cm²"))


class ConvertTests(unittest.TestCase):
    def test_convert(self):
        b = convert_v2(DATA)
        self.assertEqual(b.errors, [])
        self.assertEqual(b.sections, [{"number": 1, "title": "Numbers to 10 Million"}, {"number": 2, "title": "Four Operations"}])
        q1, q2, q3, q4 = b.questions
        self.assertEqual(q1["key"]["answer"], {"kind": "choice", "correct": 1})
        self.assertEqual(q1["content"]["choices"][1], ["2", {"frac": [["1"], ["2"]]}])
        image = q1["content"]["blocks"][1]
        self.assertEqual(image["type"], "image")
        self.assertTrue(image["path"].startswith(IMG_PREFIX) and image["path"].endswith(".png"))
        self.assertEqual(len(b.images), 1)  # the same figure used twice is stored once
        self.assertEqual(q2["section"], 2)
        self.assertEqual(q2["content"]["parts"], ["(a)", "(b)"])
        self.assertEqual(q2["key"]["answer"]["parts"][0]["text"], "54 cm²")
        self.assertTrue(q2["content"]["extra"])
        self.assertEqual(q2["content"]["hint"], "Type the number only.")
        self.assertEqual(q2["key"]["steps"][0], {"type": "equation", "rows": [
            {"label": ["Area"], "value": ["= 6 × 9"]}, {"label": [], "value": ["= 54 cm²"]}]})
        self.assertEqual(q2["key"]["steps"][1], {"type": "paragraph", "rich": ["(a)"], "part": True})
        self.assertEqual(q3["key"]["answer"], {"kind": "self"})
        self.assertEqual(q3["content"]["self_check"], "explain")
        self.assertEqual(q4["content"]["self_check"], "draw")
        self.assertNotIn("Product", json.dumps(q1["content"]))  # source stays out of what students see
        self.assertEqual(q1["source"], "Product A · Paper")

    def test_problems_are_reported(self):
        bad = json.loads(json.dumps(DATA))
        bad["items"][0]["q"] = ["Text [[img:5:100]]"]
        bad["items"][1]["s"] = "ZZ"
        bad["items"][2]["q"] = ["⟦1‖"]
        bad["img"] = ["data:image/svg+xml;base64,PHN2Zz4="]
        bad["items"][3]["q"] = ["[[img:0:100]]"]
        errors = convert_v2(bad).errors
        self.assertIn("Question Q0001: a figure must be on a line of its own", errors)
        self.assertIn("Question Q0002: section 'ZZ' is not one of the sections", errors)
        self.assertIn("Question Q0003: unbalanced fraction markers ⟦ ‖ ⟧", errors)
        self.assertIn("Question Q0004: figure 0 is not a PNG or JPEG image", errors)

    def test_file(self):
        self.assertEqual(parse_name("P5 - Mathematics - Topic 12 - Fractions (Word Problems).html").position, 12)
        self.assertEqual(parse_name("P5 - Mathematics - Topic 12 - Fractions (Word Problems).html").topic, "Topic 12 - Fractions (Word Problems)")
        self.assertIsNone(parse_name("P5 - Mathematics - Whole Numbers.html").position)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "P5 - Mathematics - Topic 1 - Whole Numbers.html"
            path.write_text(page(DATA), encoding="utf-8")
            info, bank, _ = read_file(path)
            self.assertEqual((bank.errors, info.position, len(bank.questions)), ([], 1, 4))


if __name__ == "__main__":
    unittest.main()
