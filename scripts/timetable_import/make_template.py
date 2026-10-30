#!/usr/bin/env python3
"""Writes the blank timetable template staff fill in (docs/templates/timetable-template.xlsx).

  python3 make_template.py [OUT.xlsx]
"""

from __future__ import annotations

import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

from sheet import (ATTENDANCE, CANCELLATIONS, CLASSES, COLUMNS, DAY_LABELS, EXAMS, ONE_OFFS, STATUS_LABELS, STUDENTS,
                   TYPE_LABELS)

HEADER_FILL = PatternFill("solid", fgColor="F5B014")
GUIDE = [
    ("How to use this template", True),
    ("Fill in the sheets below, save as .xlsx, upload it to Supabase → Storage → timetable-inbox, then run "
     "GitHub → Actions → Import timetable. Full steps: docs/runbooks/import-timetable.md.", False),
    ("", False),
    ("Classes", True),
    ("One row per weekly class. The portal creates one session per week from First date to Last date.", False),
    ("Class code: your own short code, e.g. P5MA-SAT-0900. Uploading the same code again updates that class.", False),
    ("Level + Subject name the course, e.g. P5 + Mathematics = Primary 5 Mathematics.", False),
    ("Type: Physical tutorial, Live tutorial or Academic coaching. Physical tutorials need a Branch.", False),
    ("Branch must match a branch name in the portal. Rooms are created the first time they are used.", False),
    ("Day: Mon–Sun. Start time: e.g. 15:30 or 3:30 pm (Singapore time). Seats: optional limit.", False),
    ("Meeting link: the Zoom / Google Meet link for live tutorials (students see a Join button 15 minutes before).", False),
    ("Each upload that lists a class replaces its upcoming sessions. Past sessions and attendance never change.", False),
    ("To stop a class, set its Last date and upload again.", False),
    ("", False),
    ("Students", True),
    ("One row per student per class, using the student's client code. Each class listed here gets exactly these "
     "students; leave a class out to keep its current list.", False),
    ("From / Until date: optional, for students joining late or leaving early.", False),
    ("", False),
    ("One-off sessions", True),
    ("Single sessions that are not weekly, e.g. academic coaching. Client codes: separate with commas.", False),
    ("", False),
    ("Cancellations", True),
    ("A class code and the date of the session to cancel, e.g. a public holiday. Students see it as cancelled.", False),
    ("Remove the row and upload again to bring the session back.", False),
    ("", False),
    ("Attendance", True),
    ("One row per student per session: Present, Late, Absent or Excused. Only for sessions that have started.", False),
    ("A student who attends a session they weren't booked into (make-up, walk-in) is booked automatically.", False),
    ("", False),
    ("Exams", True),
    ("Exam dates for everyone on a course, e.g. P6 | Mathematics | PSLE | 26/9/2027. Students see them in Smart Revision → "
     "Before-Exam Mode. Listing a course's exams replaces its upcoming exams; leave the sheet empty to keep them.", False),
    ("", False),
    ("Example (Classes)", True),
    ("P5MA-SAT-0900 | P5 | Mathematics | Physical tutorial | Bishan | Room 1 | Ms Lim | Sat | 09:00 | 120 | "
     "3/1/2027 | 30/12/2027 | 12 |", False),
    ("P6SC-WED-LIVE | P6 | Science | Live tutorial | | | Mr Ong | Wed | 19:30 | 90 | 6/1/2027 | 29/12/2027 | | "
     "https://zoom.us/j/123456789", False),
]

WIDTHS = {"Exam": 20, "Class code": 18, "Code": 18, "Class or one-off code": 22, "Level": 8, "Subject": 16, "Type": 20,
          "Branch": 16, "Room": 12, "Teacher": 18, "Day": 8, "Start time": 11, "Duration (min)": 14,
          "First date": 13, "Last date": 13, "Date": 13, "Seats": 8, "Meeting link": 36, "Client code": 12,
          "Client codes": 30, "From date": 13, "Until date": 13, "Reason": 30, "Status": 12, "Note": 36}


def build(out: Path) -> None:
    wb = Workbook()
    guide = wb.active
    guide.title = "How to use"
    guide.column_dimensions["A"].width = 120
    for i, (line, bold) in enumerate(GUIDE, start=1):
        cell = guide.cell(row=i, column=1, value=line)
        cell.font = Font(bold=bold, size=13 if bold else 11)
        cell.alignment = Alignment(wrap_text=True, vertical="top")

    for name in (CLASSES, STUDENTS, ONE_OFFS, CANCELLATIONS, ATTENDANCE, EXAMS):
        ws = wb.create_sheet(name)
        ws.append(COLUMNS[name])
        for i, col in enumerate(COLUMNS[name], start=1):
            cell = ws.cell(row=1, column=i)
            cell.font = Font(bold=True)
            cell.fill = HEADER_FILL
            ws.column_dimensions[cell.column_letter].width = WIDTHS.get(col, 14)
        ws.freeze_panes = "A2"

        def choose(column: str, labels: list[str]) -> None:
            if column not in COLUMNS[name]:
                return
            letter = ws.cell(row=1, column=COLUMNS[name].index(column) + 1).column_letter
            dv = DataValidation(type="list", formula1='"' + ",".join(labels) + '"', allow_blank=True,
                                showErrorMessage=True, error=f"Choose one of: {', '.join(labels)}")
            dv.add(f"{letter}2:{letter}2000")
            ws.add_data_validation(dv)

        choose("Type", TYPE_LABELS)
        choose("Day", DAY_LABELS)
        choose("Status", STATUS_LABELS)
        for col in ("First date", "Last date", "Date", "From date", "Until date"):
            if col in COLUMNS[name]:
                letter = ws.cell(row=1, column=COLUMNS[name].index(col) + 1).column_letter
                for r in range(2, 501):
                    ws[f"{letter}{r}"].number_format = "d/m/yyyy"
        if "Start time" in COLUMNS[name]:
            letter = ws.cell(row=1, column=COLUMNS[name].index("Start time") + 1).column_letter
            for r in range(2, 501):
                ws[f"{letter}{r}"].number_format = "hh:mm"
    out.parent.mkdir(parents=True, exist_ok=True)
    wb.save(out)


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "docs/templates/timetable-template.xlsx"
    build(target)
    print(f"Wrote {target}")
