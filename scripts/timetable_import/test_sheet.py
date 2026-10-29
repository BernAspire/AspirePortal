import tempfile
import unittest
from datetime import date, datetime, time
from pathlib import Path

from sheet import (ATTENDANCE, CANCELLATIONS, CLASSES, COLUMNS, ONE_OFFS, STUDENTS, CellError, CourseRef, parse_date,
                   parse_level, parse_time, read_rows, read_workbook)


def sheets(**rows):
    names = {"classes": CLASSES, "students": STUDENTS, "one_offs": ONE_OFFS, "cancellations": CANCELLATIONS,
             "attendance": ATTENDANCE}
    return {names[k]: [tuple(COLUMNS[names[k]])] + [tuple(r) for r in v] for k, v in rows.items()}


CLASS_ROW = ["P5MA-SAT", "P5", "mathematics", "Physical tutorial", "Bishan", "Room 1", "Ms Lim", "Sat", "9:00",
             120, "2/1/2027", "25/12/2027", 12, None]


class CellTests(unittest.TestCase):
    def test_dates(self):
        self.assertEqual(parse_date("7/11/2026"), date(2026, 11, 7))  # day first
        self.assertEqual(parse_date("2026-11-07"), date(2026, 11, 7))
        self.assertEqual(parse_date("7 Nov 2026"), date(2026, 11, 7))
        self.assertEqual(parse_date(datetime(2026, 11, 7, 0, 0)), date(2026, 11, 7))
        for bad in ("31/2/2026", "next week", "", None, "11/7"):
            with self.assertRaises(CellError):
                parse_date(bad)

    def test_times(self):
        self.assertEqual(parse_time("15:30"), time(15, 30))
        self.assertEqual(parse_time("3:30 pm"), time(15, 30))
        self.assertEqual(parse_time("12pm"), time(12, 0))
        self.assertEqual(parse_time("12:15 am"), time(0, 15))
        self.assertEqual(parse_time("1530"), time(15, 30))
        self.assertEqual(parse_time(0.6458333333), time(15, 30))  # Excel fraction of a day
        self.assertEqual(parse_time(time(9, 0, 30)), time(9, 0))
        for bad in ("25:00", "13pm", "noon", ""):
            with self.assertRaises(CellError):
                parse_time(bad)

    def test_levels(self):
        self.assertEqual(parse_level("p5"), "P5")
        self.assertEqual(parse_level("Primary 5"), "P5")
        self.assertEqual(parse_level("Sec 2"), "S2")
        with self.assertRaises(CellError):
            parse_level("P7")


class RowTests(unittest.TestCase):
    def test_valid_class(self):
        tt = read_rows(sheets(classes=[CLASS_ROW]))
        self.assertEqual(tt.errors, [])
        c = tt.classes[0]
        self.assertEqual((c["kind"], c["weekday"], c["start_time"], c["first_date"]),
                         ("physical_tutorial", 6, time(9, 0), date(2027, 1, 2)))
        self.assertEqual(c["course"], CourseRef("P5", "Mathematics"))
        self.assertEqual(c["course"].course_name, "Primary 5 Mathematics")
        payload = tt.payload({CourseRef("P5", "Mathematics"): "course-1"})
        self.assertEqual(payload["classes"][0]["course_id"], "course-1")
        self.assertEqual(payload["classes"][0]["start_time"], "09:00")
        self.assertEqual(payload["classes"][0]["first_date"], "2027-01-02")
        self.assertNotIn("course", payload["classes"][0])

    def test_errors_name_sheet_row_and_column(self):
        bad = list(CLASS_ROW)
        bad[7] = "Thurs-ish"
        bad[11] = "1/1/2027"  # before first date
        tt = read_rows(sheets(classes=[CLASS_ROW, bad]))
        self.assertEqual(len(tt.classes), 1)
        self.assertIn("Classes row 3: Day must be one of Mon, Tue, Wed, Thu, Fri, Sat, Sun (got 'Thurs-ish')", tt.errors)
        self.assertIn("Classes row 3: Last date is before First date", tt.errors)

    def test_physical_needs_branch_and_codes_are_unique(self):
        no_branch = list(CLASS_ROW)
        no_branch[0], no_branch[4], no_branch[5] = "OTHER", None, None
        tt = read_rows(sheets(classes=[CLASS_ROW, CLASS_ROW, no_branch]))
        self.assertIn("Classes row 3: Class code P5MA-SAT appears twice", tt.errors)
        self.assertIn("Classes row 4: Branch is needed for a physical tutorial", tt.errors)

    def test_live_tutorial_link_must_be_https(self):
        live = ["LIVE", "P6", "Science", "Live", None, None, "Mr Ong", "Wed", "19:30", 90, "6/1/2027", "29/12/2027", None,
                "http://zoom.us/j/1"]
        tt = read_rows(sheets(classes=[live]))
        self.assertTrue(any("Meeting link must be a link starting with https://" in e for e in tt.errors))

    def test_blank_rows_are_skipped_and_missing_columns_reported(self):
        tt = read_rows(sheets(classes=[CLASS_ROW, [None] * 14]))
        self.assertEqual((tt.errors, len(tt.classes)), ([], 1))
        tt = read_rows({CLASSES: [("Class code", "Level")], STUDENTS: [tuple(COLUMNS[STUDENTS])]})
        self.assertTrue(tt.errors[0].startswith("Classes: missing column(s) Subject, Type"))

    def test_students_one_offs_cancellations_attendance(self):
        tt = read_rows(sheets(
            students=[["P5MA-SAT", "820f", None, None], ["P5MA-SAT", "820F", None, None], ["P5MA-SAT", "x", None, None]],
            one_offs=[["COACH-1", "P6", "Science", "Coaching", "Bishan", None, "Mr Tan", "12/1/2027", "15:00", 60, None, None,
                       "820F, 821g"]],
            cancellations=[["P5MA-SAT", "1/5/2027", "Labour Day"]],
            attendance=[["P5MA-SAT", "2/1/2027", "820F", "P", None], ["P5MA-SAT", "2/1/2027", "821G", "Sick", None]],
        ))
        self.assertEqual([r["client_code"] for r in tt.roster], ["820F"])
        self.assertIn("Students row 3: 820F is listed twice for P5MA-SAT", tt.errors)
        self.assertIn("Students row 4: Client code must be 3–8 letters or digits (got 'x')", tt.errors)
        self.assertEqual(tt.one_offs[0]["students"], ["820F", "821G"])
        self.assertEqual(tt.one_offs[0]["kind"], "academic_coaching")
        self.assertEqual(tt.cancellations[0]["date"], date(2027, 5, 1))
        self.assertEqual(tt.attendance[0]["status"], "present")
        self.assertIn("Attendance row 3: Status must be one of Present, Late, Absent, Excused (got 'Sick')", tt.errors)


class WorkbookTests(unittest.TestCase):
    def test_template_round_trip(self):
        from make_template import build
        from openpyxl import load_workbook

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.xlsx"
            build(path)
            empty = read_workbook(path)
            self.assertEqual((empty.errors, empty.summary()),
                             ([], "0 classes, 0 student places, 0 one-off sessions, 0 cancellations, 0 attendance marks"))
            wb = load_workbook(path)
            row = list(CLASS_ROW)
            row[8], row[10], row[11] = time(9, 0), datetime(2027, 1, 2), datetime(2027, 12, 25)  # real Excel cells
            wb[CLASSES].append(row)
            wb.save(path)
            tt = read_workbook(path)
            self.assertEqual(tt.errors, [])
            self.assertEqual(tt.classes[0]["last_date"], date(2027, 12, 25))

    def test_not_a_workbook(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.xlsx"
            path.write_text("not excel")
            self.assertTrue(read_workbook(path).errors[0].startswith("Could not open the spreadsheet"))


if __name__ == "__main__":
    unittest.main()
