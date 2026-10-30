"""Reads the timetable spreadsheet and checks every row before anything is uploaded.

The workbook has five sheets (see make_template.py). Each row is turned into the JSON
that public.apply_timetable() expects; anything wrong is reported with its sheet and row
number so staff can fix the file. Names (courses, branches, students) are resolved later:
courses by the import job, branches/rooms/students by the database function.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any, Callable

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lesson_import"))
from naming import LEVEL_NAMES, subject_code  # noqa: E402

# --- Sheet layout ------------------------------------------------------------------
CLASSES = "Classes"
STUDENTS = "Students"
ONE_OFFS = "One-off sessions"
CANCELLATIONS = "Cancellations"
ATTENDANCE = "Attendance"
EXAMS = "Exams"
OFFERS = "Offers"

COLUMNS: dict[str, list[str]] = {
    CLASSES: ["Class code", "Level", "Subject", "Type", "Branch", "Room", "Teacher", "Day", "Start time",
              "Duration (min)", "First date", "Last date", "Seats", "Meeting link"],
    STUDENTS: ["Class code", "Client code", "From date", "Until date"],
    ONE_OFFS: ["Code", "Level", "Subject", "Type", "Branch", "Room", "Teacher", "Date", "Start time",
               "Duration (min)", "Seats", "Meeting link", "Client codes"],
    CANCELLATIONS: ["Class code", "Date", "Reason"],
    ATTENDANCE: ["Class or one-off code", "Date", "Client code", "Status", "Note"],
    EXAMS: ["Level", "Subject", "Exam", "Date"],
    OFFERS: ["Level", "Subject", "Offer", "Description", "Topic", "Sub-topics", "From date", "Until date"],
}

TYPES = {
    "physical tutorial": "physical_tutorial", "physical": "physical_tutorial",
    "live tutorial": "live_tutorial", "live": "live_tutorial", "online": "live_tutorial",
    "academic coaching": "academic_coaching", "coaching": "academic_coaching",
}
TYPE_LABELS = ["Physical tutorial", "Live tutorial", "Academic coaching"]
DAYS = {name: i + 1 for i, names in enumerate(
    [("mon", "monday"), ("tue", "tues", "tuesday"), ("wed", "weds", "wednesday"), ("thu", "thur", "thurs", "thursday"),
     ("fri", "friday"), ("sat", "saturday"), ("sun", "sunday")]) for name in names}
DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
STATUSES = {"present": "present", "p": "present", "late": "late", "l": "late",
            "absent": "absent", "a": "absent", "excused": "excused", "e": "excused", "mc": "excused"}
STATUS_LABELS = ["Present", "Late", "Absent", "Excused"]

CODE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$")
PRICE = re.compile(r"\$|\bS?GD\b|\bdollars?\b|\bprice\b|\bfees?\b|\bcost\b|\bdiscount\b|%\s*off\b", re.IGNORECASE)
CLIENT_CODE = re.compile(r"^[A-Za-z0-9]{3,8}$")
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


class CellError(ValueError):
    pass


# --- Cell readers (pure) ----------------------------------------------------------
def text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    s = " ".join(str(value).split())
    return s or None


def parse_date(value: Any) -> date:
    """Excel dates, 2026-11-07, 7/11/2026 (day first, as in Singapore) or 7 Nov 2026."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = text(value)
    if not s:
        raise CellError("is empty")
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m:
        y, mo, d = map(int, m.groups())
    else:
        m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s)
        if m:
            d, mo, y = map(int, m.groups())
        else:
            m = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})", s)
            if not m or m.group(2)[:3].lower() not in MONTHS:
                raise CellError(f"is not a date (got '{s}'; use e.g. 7/11/2026)")
            d, mo, y = int(m.group(1)), MONTHS[m.group(2)[:3].lower()], int(m.group(3))
    try:
        return date(y, mo, d)
    except ValueError:
        raise CellError(f"is not a real date (got '{s}')") from None


def parse_time(value: Any) -> time:
    """Excel times, 15:30, 3:30 pm, 3pm, 1530."""
    if isinstance(value, datetime):
        return value.time().replace(second=0, microsecond=0)
    if isinstance(value, time):
        return value.replace(second=0, microsecond=0)
    if isinstance(value, float) and 0 <= value < 1:  # Excel day fraction
        minutes = round(value * 24 * 60)
        return time(minutes // 60, minutes % 60)
    s = (text(value) or "").lower().replace(".", ":")
    if not s:
        raise CellError("is empty")
    m = re.fullmatch(r"(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?", s)
    if not m:
        raise CellError(f"is not a time (got '{s}'; use e.g. 15:30 or 3:30 pm)")
    h, mi, ampm = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    if ampm:
        if not 1 <= h <= 12:
            raise CellError(f"is not a time (got '{s}')")
        h = h % 12 + (12 if ampm == "pm" else 0)
    if h > 23 or mi > 59:
        raise CellError(f"is not a time (got '{s}')")
    return time(h, mi)


def parse_int(value: Any, low: int, high: int) -> int:
    s = text(value)
    if not s or not re.fullmatch(r"\d+", s):
        raise CellError(f"must be a whole number (got '{s or ''}')")
    n = int(s)
    if not low <= n <= high:
        raise CellError(f"must be between {low} and {high} (got {n})")
    return n


def parse_choice(value: Any, choices: dict[str, str | int], labels: list[str]) -> Any:
    s = (text(value) or "").lower()
    if s not in choices:
        raise CellError(f"must be one of {', '.join(labels)} (got '{text(value) or ''}')")
    return choices[s]


def parse_code(value: Any) -> str:
    s = text(value)
    if not s or not CODE.match(s):
        raise CellError(f"must be 1–32 letters, digits, dots, dashes or underscores (got '{s or ''}')")
    return s


def parse_client_code(value: Any) -> str:
    s = text(value)
    if not s or not CLIENT_CODE.match(s):
        raise CellError(f"must be 3–8 letters or digits (got '{s or ''}')")
    return s.upper()


def parse_level(value: Any) -> str:
    s = (text(value) or "").upper().replace(" ", "").replace("PRIMARY", "P").replace("SECONDARY", "S").replace("SEC", "S")
    if s not in LEVEL_NAMES:
        raise CellError(f"must be a level such as P5, S2 or JC1 (got '{text(value) or ''}')")
    return s


def parse_subject(value: Any) -> str:
    s = text(value)
    if not s or not re.fullmatch(r"[A-Za-z][A-Za-z &]{1,40}", s):
        raise CellError(f"must be a subject such as Mathematics (got '{s or ''}')")
    return " ".join(w.capitalize() if w.islower() else w for w in s.split())


def parse_url(value: Any) -> str:
    s = text(value)
    if not s or not re.fullmatch(r"https://\S+", s) or len(s) > 500:
        raise CellError(f"must be a link starting with https:// (got '{s or ''}')")
    return s


@dataclass(frozen=True)
class CourseRef:
    """A course named by level and subject, e.g. P5 + Mathematics = Primary 5 Mathematics."""

    level_code: str
    subject_name: str

    @property
    def level_name(self) -> str:
        return LEVEL_NAMES[self.level_code][0]

    @property
    def subject_code(self) -> str:
        return subject_code(self.subject_name)

    @property
    def course_name(self) -> str:
        return f"{self.level_name} {self.subject_name}"


@dataclass
class Timetable:
    classes: list[dict] = field(default_factory=list)
    roster: list[dict] = field(default_factory=list)
    one_offs: list[dict] = field(default_factory=list)
    cancellations: list[dict] = field(default_factory=list)
    attendance: list[dict] = field(default_factory=list)
    exams: list[dict] = field(default_factory=list)
    offers: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def courses(self) -> set[CourseRef]:
        return {r["course"] for r in self.classes + self.one_offs + self.exams + self.offers}

    def payload(self, course_ids: dict[CourseRef, str]) -> dict:
        """The JSON for public.apply_timetable, with courses replaced by their ids."""

        def with_course(rows: list[dict]) -> list[dict]:
            return [{**{k: v for k, v in r.items() if k != "course"}, "course_id": course_ids[r["course"]]} for r in rows]

        def jsonable(rows: list[dict]) -> list[dict]:
            return [{k: (v.isoformat(timespec="minutes") if isinstance(v, time) else v.isoformat() if isinstance(v, date) else v)
                     for k, v in r.items()} for r in rows]

        return {
            "classes": jsonable(with_course(self.classes)),
            "roster": jsonable(self.roster),
            "one_offs": jsonable(with_course(self.one_offs)),
            "cancellations": jsonable(self.cancellations),
            "attendance": jsonable(self.attendance),
        }

    def exam_payload(self, course_ids: dict[CourseRef, str]) -> list[dict]:
        """The JSON for public.apply_exam_dates."""
        return [{"course_id": course_ids[e["course"]], "name": e["name"], "exam_on": e["exam_on"].isoformat()} for e in self.exams]

    def offer_payload(self, course_ids: dict[CourseRef, str]) -> list[dict]:
        """The JSON for public.apply_revision_offers."""
        return [{"course_id": course_ids[o["course"]], "title": o["title"], "description": o["description"], "topic": o["topic"],
                 "sections": o["sections"], "starts_on": o["starts_on"].isoformat() if o["starts_on"] else None,
                 "ends_on": o["ends_on"].isoformat() if o["ends_on"] else None} for o in self.offers]

    def summary(self) -> str:
        return (f"{len(self.classes)} classes, {len(self.roster)} student places, {len(self.one_offs)} one-off sessions, "
                f"{len(self.cancellations)} cancellations, {len(self.attendance)} attendance marks, {len(self.exams)} exam dates, {len(self.offers)} offers")


# --- Rows -------------------------------------------------------------------------
Row = dict[str, Any]


def _rows(sheet_rows: list[tuple], sheet: str) -> list[tuple[int, Row]]:
    """(row number, {column: value}) for every non-empty data row; headers are matched by name."""
    if not sheet_rows:
        return []
    header = [(text(h) or "").lower() for h in sheet_rows[0]]
    index = {}
    for col in COLUMNS[sheet]:
        if col.lower() in header:
            index[col] = header.index(col.lower())
    missing = [c for c in COLUMNS[sheet] if c not in index]
    if missing:
        raise CellError(f"{sheet}: missing column(s) {', '.join(missing)}. Start from the template.")
    out = []
    for n, raw in enumerate(sheet_rows[1:], start=2):
        row = {c: (raw[i] if i < len(raw) else None) for c, i in index.items()}
        if all(text(v) is None for v in row.values()):
            continue
        out.append((n, row))
    return out


def _cell(errors: list[str], where: str, column: str, fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except CellError as err:
        errors.append(f"{where}: {column} {err}")
        return None


def _optional(value: Any, fn: Callable[[Any], Any]) -> Any:
    return None if text(value) is None and not isinstance(value, (date, time)) else fn(value)


def read_rows(sheets: dict[str, list[tuple]]) -> Timetable:
    """Checks every row. `sheets` maps sheet name → rows (first row = headers)."""
    tt = Timetable()
    e = tt.errors

    for sheet in COLUMNS:
        if sheet not in sheets:
            sheets = {**sheets, sheet: []}

    # Classes
    try:
        rows = _rows(sheets[CLASSES], CLASSES)
    except CellError as err:
        e.append(str(err))
        rows = []
    seen: set[str] = set()
    for n, r in rows:
        w = f"{CLASSES} row {n}"
        before = len(e)
        code = _cell(e, w, "Class code", lambda: parse_code(r["Class code"]))
        level = _cell(e, w, "Level", lambda: parse_level(r["Level"]))
        subject = _cell(e, w, "Subject", lambda: parse_subject(r["Subject"]))
        kind = _cell(e, w, "Type", lambda: parse_choice(r["Type"], TYPES, TYPE_LABELS))
        teacher = _cell(e, w, "Teacher", lambda: text(r["Teacher"]) or _raise("is empty"))
        day = _cell(e, w, "Day", lambda: parse_choice(r["Day"], DAYS, DAY_LABELS))
        start = _cell(e, w, "Start time", lambda: parse_time(r["Start time"]))
        duration = _cell(e, w, "Duration (min)", lambda: parse_int(r["Duration (min)"], 15, 480))
        first = _cell(e, w, "First date", lambda: parse_date(r["First date"]))
        last = _cell(e, w, "Last date", lambda: parse_date(r["Last date"]))
        seats = _cell(e, w, "Seats", lambda: _optional(r["Seats"], lambda v: parse_int(v, 1, 500)))
        link = _cell(e, w, "Meeting link", lambda: _optional(r["Meeting link"], parse_url))
        branch, room = text(r["Branch"]), text(r["Room"])
        if kind == "physical_tutorial" and not branch:
            e.append(f"{w}: Branch is needed for a physical tutorial")
        if room and not branch:
            e.append(f"{w}: Room needs a Branch")
        if first and last and last < first:
            e.append(f"{w}: Last date is before First date")
        if first and last and last > first + timedelta(days=400):
            e.append(f"{w}: Last date is more than 400 days after First date; upload one year at a time")
        if code and code in seen:
            e.append(f"{w}: Class code {code} appears twice")
        if code:
            seen.add(code)
        if len(e) == before:
            tt.classes.append({"code": code, "course": CourseRef(level, subject), "kind": kind, "branch": branch, "room": room,
                               "teacher": teacher, "weekday": day, "start_time": start, "duration": duration,
                               "first_date": first, "last_date": last, "capacity": seats, "meeting_url": link})

    # Students (class rosters)
    try:
        rows = _rows(sheets[STUDENTS], STUDENTS)
    except CellError as err:
        e.append(str(err))
        rows = []
    seen_pairs: set[tuple[str, str]] = set()
    for n, r in rows:
        w = f"{STUDENTS} row {n}"
        before = len(e)
        code = _cell(e, w, "Class code", lambda: parse_code(r["Class code"]))
        client = _cell(e, w, "Client code", lambda: parse_client_code(r["Client code"]))
        start = _cell(e, w, "From date", lambda: _optional(r["From date"], parse_date))
        until = _cell(e, w, "Until date", lambda: _optional(r["Until date"], parse_date))
        if start and until and until < start:
            e.append(f"{w}: Until date is before From date")
        if code and client and (code, client) in seen_pairs:
            e.append(f"{w}: {client} is listed twice for {code}")
        if len(e) == before:
            seen_pairs.add((code, client))
            tt.roster.append({"class": code, "client_code": client, "from_date": start, "until_date": until})

    # One-off sessions
    try:
        rows = _rows(sheets[ONE_OFFS], ONE_OFFS)
    except CellError as err:
        e.append(str(err))
        rows = []
    for n, r in rows:
        w = f"{ONE_OFFS} row {n}"
        before = len(e)
        code = _cell(e, w, "Code", lambda: parse_code(r["Code"]))
        level = _cell(e, w, "Level", lambda: parse_level(r["Level"]))
        subject = _cell(e, w, "Subject", lambda: parse_subject(r["Subject"]))
        kind = _cell(e, w, "Type", lambda: parse_choice(r["Type"], TYPES, TYPE_LABELS))
        teacher = _cell(e, w, "Teacher", lambda: text(r["Teacher"]) or _raise("is empty"))
        day = _cell(e, w, "Date", lambda: parse_date(r["Date"]))
        start = _cell(e, w, "Start time", lambda: parse_time(r["Start time"]))
        duration = _cell(e, w, "Duration (min)", lambda: parse_int(r["Duration (min)"], 15, 480))
        seats = _cell(e, w, "Seats", lambda: _optional(r["Seats"], lambda v: parse_int(v, 1, 500)))
        link = _cell(e, w, "Meeting link", lambda: _optional(r["Meeting link"], parse_url))
        clients: list[str] = []
        for part in re.split(r"[,;\s]+", text(r["Client codes"]) or ""):
            if part:
                c = _cell(e, w, "Client codes", lambda p=part: parse_client_code(p))
                if c:
                    clients.append(c)
        branch, room = text(r["Branch"]), text(r["Room"])
        if kind == "physical_tutorial" and not branch:
            e.append(f"{w}: Branch is needed for a physical tutorial")
        if room and not branch:
            e.append(f"{w}: Room needs a Branch")
        if code and code in seen:
            e.append(f"{w}: Code {code} is already used by a class or another one-off")
        if code:
            seen.add(code)
        if len(e) == before:
            tt.one_offs.append({"code": code, "course": CourseRef(level, subject), "kind": kind, "branch": branch, "room": room,
                                "teacher": teacher, "date": day, "start_time": start, "duration": duration,
                                "capacity": seats, "meeting_url": link, "students": sorted(set(clients))})

    # Cancellations
    try:
        rows = _rows(sheets[CANCELLATIONS], CANCELLATIONS)
    except CellError as err:
        e.append(str(err))
        rows = []
    for n, r in rows:
        w = f"{CANCELLATIONS} row {n}"
        before = len(e)
        code = _cell(e, w, "Class code", lambda: parse_code(r["Class code"]))
        day = _cell(e, w, "Date", lambda: parse_date(r["Date"]))
        reason = text(r["Reason"])
        if reason and len(reason) > 200:
            e.append(f"{w}: Reason is longer than 200 characters")
        if len(e) == before:
            tt.cancellations.append({"class": code, "date": day, "reason": reason})

    # Attendance
    try:
        rows = _rows(sheets[ATTENDANCE], ATTENDANCE)
    except CellError as err:
        e.append(str(err))
        rows = []
    for n, r in rows:
        w = f"{ATTENDANCE} row {n}"
        before = len(e)
        code = _cell(e, w, "Class or one-off code", lambda: parse_code(r["Class or one-off code"]))
        day = _cell(e, w, "Date", lambda: parse_date(r["Date"]))
        client = _cell(e, w, "Client code", lambda: parse_client_code(r["Client code"]))
        status = _cell(e, w, "Status", lambda: parse_choice(r["Status"], STATUSES, STATUS_LABELS))
        note = text(r["Note"])
        if note and len(note) > 500:
            e.append(f"{w}: Note is longer than 500 characters")
        if len(e) == before:
            tt.attendance.append({"session": code, "date": day, "client_code": client, "status": status, "note": note})

    # Exams (centre-wide exam dates for Before-Exam Mode)
    try:
        rows = _rows(sheets[EXAMS], EXAMS)
    except CellError as err:
        e.append(str(err))
        rows = []
    seen_exams: set[tuple] = set()
    for n, r in rows:
        w = f"{EXAMS} row {n}"
        before = len(e)
        level = _cell(e, w, "Level", lambda: parse_level(r["Level"]))
        subject = _cell(e, w, "Subject", lambda: parse_subject(r["Subject"]))
        name = text(r["Exam"])
        if not name or len(name) > 80:
            e.append(f"{w}: Exam must be a name of up to 80 characters, e.g. SA2 or PSLE")
        day = _cell(e, w, "Date", lambda: parse_date(r["Date"]))
        key = (level, subject, (name or "").lower())
        if len(e) == before and key in seen_exams:
            e.append(f"{w}: {name} is listed twice for {level} {subject}")
        if len(e) == before:
            seen_exams.add(key)
            tt.exams.append({"course": CourseRef(level, subject), "name": name, "exam_on": day})

    # Offers ("Recommended for you" in Smart Revision, matched to weak sub-topics; ADR 0010)
    try:
        rows = _rows(sheets[OFFERS], OFFERS)
    except CellError as err:
        e.append(str(err))
        rows = []
    seen_offers: set[tuple] = set()
    for n, r in rows:
        w = f"{OFFERS} row {n}"
        before = len(e)
        level = _cell(e, w, "Level", lambda: parse_level(r["Level"]))
        subject = _cell(e, w, "Subject", lambda: parse_subject(r["Subject"]))
        title = text(r["Offer"])
        if not title or len(title) > 80:
            e.append(f"{w}: Offer must be a name of up to 80 characters, e.g. P6 Science Holiday Intensive")
        description = text(r["Description"])
        if description and len(description) > 300:
            e.append(f"{w}: Description is longer than 300 characters")
        if any(PRICE.search(t or "") for t in (title, description)):
            e.append(f"{w}: Offer and Description must not mention a price or fee: students see this text (ADR 0010)")
        topic = text(r["Topic"])
        if not topic:
            e.append(f"{w}: Topic must be a question bank topic, e.g. Whole Numbers")
        sections = _cell(e, w, "Sub-topics", lambda: parse_section_numbers(r["Sub-topics"]))
        starts = _cell(e, w, "From date", lambda: _optional(r["From date"], parse_date))
        ends = _cell(e, w, "Until date", lambda: _optional(r["Until date"], parse_date))
        if starts and ends and ends < starts:
            e.append(f"{w}: Until date is before From date")
        key = (level, subject, (title or "").lower())
        if len(e) == before and key in seen_offers:
            e.append(f"{w}: {title} is listed twice for {level} {subject}")
        if len(e) == before:
            seen_offers.add(key)
            tt.offers.append({"course": CourseRef(level, subject), "title": title, "description": description, "topic": topic,
                              "sections": sections, "starts_on": starts, "ends_on": ends})

    return tt


def parse_section_numbers(value: Any) -> list[int]:
    """'1, 3' → [1, 3]; blank → [] (the whole topic)."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if value != int(value) or not 1 <= value <= 999:
            raise CellError(f"must be sub-topic numbers like 1, 3 (got '{value}')")
        return [int(value)]
    raw = text(value)
    if raw is None:
        return []
    out: list[int] = []
    for part in re.split(r"[,;\s]+", raw):
        if not part:
            continue
        if not part.isdigit() or not 1 <= int(part) <= 999:
            raise CellError(f"must be sub-topic numbers like 1, 3 (got '{raw}')")
        if int(part) not in out:
            out.append(int(part))
    return out


def _raise(message: str) -> Any:
    raise CellError(message)


def read_workbook(path: Path) -> Timetable:
    from openpyxl import load_workbook

    try:
        wb = load_workbook(path, read_only=True, data_only=True)
    except Exception as err:  # not an .xlsx, corrupt, password-protected
        tt = Timetable()
        tt.errors.append(f"Could not open the spreadsheet: {err.__class__.__name__}. Save it as an Excel workbook (.xlsx).")
        return tt
    sheets = {ws.title: [tuple(row) for row in ws.iter_rows(values_only=True)] for ws in wb.worksheets if ws.title in COLUMNS}
    wb.close()
    if not sheets:
        tt = Timetable()
        tt.errors.append(f"No timetable sheets found. The workbook needs sheets named {', '.join(COLUMNS)}.")
        return tt
    return read_rows(sheets)
