#!/usr/bin/env python3
"""Imports timetable spreadsheets (classes, students, one-off sessions, cancellations,
attendance, exam dates, Smart Revision offers) into the portal.

Usage:
  # Check a file locally (no network): lists every problem, or what would be uploaded.
  python3 import_timetable.py check FILE.xlsx

  # Import every .xlsx in the `timetable-inbox` bucket for one centre (the GitHub job does this):
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 import_timetable.py inbox --centre aspire-hub

Each file is applied in one database transaction (public.apply_timetable_file): if anything is
wrong, nothing from that file is saved. The service-role key is used only here, in a job,
never in the app (CLAUDE.md rule 5).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lesson_import"))
from import_lessons import Supabase, ensure_course  # noqa: E402

from sheet import CourseRef, Timetable, read_workbook  # noqa: E402

INBOX = "timetable-inbox"


def cmd_check(args: argparse.Namespace) -> int:
    worst = 0
    for name in args.files:
        tt = read_workbook(Path(name))
        if tt.errors:
            worst = 1
            print(f"✗ {name}: {len(tt.errors)} problem(s)")
            for err in tt.errors:
                print(f"  - {err}")
        else:
            print(f"✓ {name}: {tt.summary()}")
            for c in sorted(tt.courses, key=lambda c: c.course_name):
                print(f"  course: {c.course_name}")
    return worst


def database_message(err: Exception) -> str:
    """The readable part of a PostgREST error (our function raises plain sentences)."""
    text = str(err)
    start = text.find("{")
    if start >= 0:
        try:
            return json.loads(text[start:]).get("message", text)
        except ValueError:
            pass
    return text


def apply(sb: Supabase, centre_id: str, tt: Timetable) -> dict:
    course_ids: dict[CourseRef, str] = {c: ensure_course(sb, centre_id, c) for c in tt.courses}  # type: ignore[arg-type]
    # One call, one database transaction (public.apply_timetable_file): the timetable, exam dates
    # and offers are saved together or not at all.
    body = json.dumps({"p_centre": centre_id, "p_data": tt.payload(course_ids), "p_exams": tt.exam_payload(course_ids),
                       "p_offers": tt.offer_payload(course_ids)}).encode()
    return json.loads(sb._request("POST", "/rest/v1/rpc/apply_timetable_file", body, {"Content-Type": "application/json"}))


def cmd_inbox(args: argparse.Namespace) -> int:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.", file=sys.stderr)
        return 2
    sb = Supabase(url, key)
    centres = sb.select("centres", {"select": "id,name", "slug": f"eq.{args.centre}"})
    if not centres:
        print(f"No centre with slug '{args.centre}'.", file=sys.stderr)
        return 2
    centre_id = centres[0]["id"]

    names = [n for n in sb.list_inbox(INBOX) if "/" not in n]
    if not names:
        print(f"The {INBOX} bucket is empty. Upload the spreadsheet there first.")
        return 0

    stamp = time.strftime("%Y%m%d-%H%M%S")
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        for name in names:  # alphabetical: name files 01-…, 02-… to control the order
            if not name.lower().endswith(".xlsx"):
                print(f"✗ {name}: not an Excel .xlsx file")
                sb.move(INBOX, name, f"failed/{stamp}/{name}")
                failures += 1
                continue
            tt = read_workbook(sb.download(INBOX, name, Path(tmp) / name))
            if tt.errors:
                failures += 1
                print(f"✗ {name}: nothing was imported. Fix these and upload again:")
                for err in tt.errors:
                    print(f"  - {err}")
                sb.move(INBOX, name, f"failed/{stamp}/{name}")
                continue
            try:
                result = apply(sb, centre_id, tt)
            except Exception as err:  # the whole file rolled back
                failures += 1
                print(f"✗ {name}: nothing was imported. {database_message(err)}")
                sb.move(INBOX, name, f"failed/{stamp}/{name}")
                continue
            print(f"✓ {name}: {result['classes']} classes ({result['sessions_upserted']} upcoming sessions, "
                  f"{result['sessions_removed']} removed), {result['roster_rows']} student places, "
                  f"{result['one_offs']} one-off sessions, {result['bookings_added']} new bookings, "
                  f"{result['cancellations']} cancellations, {result['attendance']} attendance marks, {result['exams']} exam dates, {result['offers']} offers")
            sb.move(INBOX, name, f"done/{stamp}/{name}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    c = sub.add_parser("check", help="check spreadsheets locally, no upload")
    c.add_argument("files", nargs="+")
    i = sub.add_parser("inbox", help="import every spreadsheet in the timetable-inbox bucket")
    i.add_argument("--centre", required=True, help="centre slug, e.g. aspire-hub")
    args = parser.parse_args()
    return cmd_check(args) if args.command == "check" else cmd_inbox(args)


if __name__ == "__main__":
    sys.exit(main())
