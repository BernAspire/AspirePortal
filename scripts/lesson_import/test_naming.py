import unittest

from naming import PART_SLIDES, PART_WORKSHEET, page_title, parse_name, slide_role, subject_code


class ParseNameTest(unittest.TestCase):
    def test_slides(self):
        f = parse_name("P5 - Mathematics - Worksheet 01 - Numbers to 10 Million.pptx")
        self.assertIsNotNone(f)
        assert f is not None
        self.assertEqual((f.level_code, f.subject_name, f.week, f.title, f.part), ("P5", "Mathematics", 1, "Numbers to 10 Million", PART_SLIDES))
        self.assertEqual(f.course_name, "Primary 5 Mathematics")
        self.assertEqual(f.subject_code, "MATH")

    def test_worksheet_matches_the_same_lesson(self):
        a = parse_name("P5 - Mathematics - Worksheet 01 - Numbers to 10 Million.pptx")
        b = parse_name("P5 - Mathematics - Worksheet 01 - Numbers to 10 Million - Questions.docx")
        assert a is not None and b is not None
        self.assertEqual(b.part, PART_WORKSHEET)
        self.assertEqual(b.title, "Numbers to 10 Million")
        self.assertEqual(a.key, b.key)

    def test_tolerates_spacing_and_case(self):
        f = parse_name("s2 -  science - week 12 - Heat Energy.PDF")
        assert f is not None
        self.assertEqual((f.level_code, f.subject_name, f.week, f.part, f.ext), ("S2", "Science", 12, PART_WORKSHEET, "pdf"))

    def test_rejects_other_names(self):
        for name in [
            "Numbers to 10 Million.pptx",
            "P7 - Mathematics - Worksheet 01 - X.pptx",
            "P5 - Mathematics - Worksheet 00 - X.pptx",
            "P5 - Mathematics - Worksheet 01 - X.xlsx",
            "f18b2423-P5 - Mathematics - Worksheet 01 - X.pptx",
        ]:
            self.assertIsNone(parse_name(name), name)


class SubjectCodeTest(unittest.TestCase):
    def test_known_and_unknown(self):
        self.assertEqual(subject_code("Science"), "SCI")
        self.assertEqual(subject_code("Combined Humanities"), "COMBIN")


class SlideRoleTest(unittest.TestCase):
    def test_roles(self):
        self.assertEqual(slide_role("Class Rules"), "hidden")
        self.assertEqual(slide_role("  class   rules "), "hidden")
        self.assertEqual(slide_role("Q1  ·  Worked Solution"), "solution")
        self.assertEqual(slide_role("⚡ Quick Fire 1  ·  Answer"), "solution")
        self.assertEqual(slide_role("Q1  ·  Easy"), "page")
        self.assertEqual(slide_role("⚡ Quick Fire 1"), "page")
        self.assertEqual(slide_role("Learning Objectives"), "page")
        self.assertEqual(slide_role("Key Takeaways"), "page")

    def test_page_title(self):
        self.assertEqual(page_title("\n  Q1  ·  Easy \nWhat is"), "Q1 · Easy")
        self.assertEqual(page_title(""), "")


if __name__ == "__main__":
    unittest.main()
