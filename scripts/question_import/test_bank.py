import json
import tempfile
import unittest
from pathlib import Path

from bank import answer_parts, convert, extract_bank, parse_name, read_file

ITEMS = [
    {"id": "1.1a", "s": 1, "g": "1.1", "src": "Test School 2020 SA2 P1 Q1", "d": 1, "q": "What is the value of the digit 4 in 586 432?",
     "o": ["40", "400", "4000", "40 000"], "c": 2, "w": {"1": "Tens.", "3": "Thousands.", "4": "Ten thousands."}, "a": "(2) 400",
     "k": ["The 4 is in the hundreds place.", "Value = 400"]},
    {"id": "1.41a", "s": 1, "g": "1.41", "src": "Test 2022", "d": 2, "q": "The table shows cans.\nWhat is the difference?",
     "t": [[["Class", "Cans (kg)"], ["5A", "1345"], ["5B", "1543"]]], "a": "198 kg", "k": ["1543 − 1345 = 198"]},
    {"id": "4.1a", "s": 2, "g": "4.1", "src": "Test 2022", "d": 3, "q": "(a) Write it. (b) Divide. [3]", "m": 3, "h": "Units × value",
     "a": "(a) 6 372 041 (b) 405", "k": ["(a) 6 372 041", "(b) 405"]},
]


def page(data: dict) -> str:
    return f"<!doctype html><html><body><script>\nconst BANK = {json.dumps(data)};\nconst X = 1;\n</script></body></html>"


class BankTests(unittest.TestCase):
    def test_file_names(self):
        f = parse_name("P5 - Mathematics - Whole Numbers.html")
        self.assertEqual((f.level_code, f.subject_name, f.topic, f.course_name),
                         ("P5", "Mathematics", "Whole Numbers", "Primary 5 Mathematics"))
        self.assertEqual(parse_name("s2 - science - Heat_and_Temperature.htm").topic, "Heat and Temperature")
        self.assertIsNone(parse_name("Whole_Numbers_Question_Bank.html"))

    def test_extract_is_json_only(self):
        self.assertEqual(extract_bank(page({"sections": {}, "items": []}))["items"], [])
        with self.assertRaises(ValueError):
            extract_bank("<html>no data</html>")
        with self.assertRaises(ValueError):
            extract_bank("<script>const BANK = {sections: alert(1)}</script>")  # not JSON: never evaluated

    def test_answer_parts(self):
        self.assertEqual(answer_parts("198 kg"), [{"label": "", "text": "198 kg"}])
        self.assertEqual(answer_parts("(a) 6 372 041 (b) 405"),
                         [{"label": "a", "text": "6 372 041"}, {"label": "b", "text": "405"}])

    def test_convert(self):
        b = convert({"sections": {"1": "Numbers", "2": "Word problems"}, "items": ITEMS})
        self.assertEqual(b.errors, [])
        mcq, table, two = b.questions
        self.assertEqual(mcq["content"]["choices"][1], "400")
        self.assertEqual(mcq["key"]["answer"], {"kind": "choice", "correct": 2})
        self.assertEqual(mcq["content"]["parts"], [""])
        self.assertEqual([x["type"] for x in table["content"]["blocks"]], ["paragraph", "paragraph", "table"])
        self.assertEqual(table["key"]["answer"]["parts"][0]["text"], "198 kg")
        self.assertEqual(two["content"]["parts"], ["a", "b"])
        self.assertEqual((two["marks"], two["strategy"]), (3, "Units × value"))
        self.assertNotIn("answer", json.dumps(mcq["content"]))  # keys never in student content
        self.assertEqual(b.summary(), "3 questions in 2 sections (1 multiple choice, 2 written answers)")

    def test_errors(self):
        bad = [dict(ITEMS[0], c=9), dict(ITEMS[1], id="1.41a", s=7), dict(ITEMS[1]), dict(ITEMS[2], d=5, k=[])]
        b = convert({"sections": {"1": "Numbers", "2": "WP"}, "items": bad})
        self.assertIn("Question 1.1a: correct option 'c' must be 1–4", b.errors)
        self.assertIn("Question 1.41a: section 7 is not one of the sections", b.errors)
        self.assertIn("Question 4.1a: difficulty must be 1, 2 or 3", b.errors)
        self.assertIn("Question 4.1a: worked steps 'k' are missing", b.errors)
        self.assertEqual(len(b.questions), 1)

    def test_read_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "P5 - Mathematics - Whole Numbers.html"
            p.write_text(page({"sections": {"1": "N", "2": "W"}, "items": ITEMS}), encoding="utf-8")
            info, bank, sha = read_file(p)
            self.assertEqual((info.topic, len(bank.questions), len(sha)), ("Whole Numbers", 3, 64))


if __name__ == "__main__":
    unittest.main()
