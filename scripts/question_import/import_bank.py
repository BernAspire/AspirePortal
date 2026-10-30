#!/usr/bin/env python3
"""Imports question bank pages into the portal.

Usage:
  # Check files locally (no network):
  python3 import_bank.py check "P5 - Mathematics - Whole Numbers.html"

  # Import every bank in the `question-inbox` bucket for one centre (the GitHub job does this):
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 import_bank.py inbox --centre aspire-hub

Each file is one database transaction (public.import_question_bank): new questions are
added, edited ones get a new version, missing ones are retired. The original file is kept
in the private `question-sources` bucket. The service-role key is used only here, in a
job, never in the app (CLAUDE.md rule 5).
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

from bank import read_file  # noqa: E402
from bank_v2 import IMG_PREFIX, SOL_PREFIX, BankV2  # noqa: E402

INBOX = "question-inbox"
SOURCES = "question-sources"
IMAGES = "question-images"


def upload_figures(sb: Supabase, bank: BankV2, prefix: str, tmp: Path) -> None:
    """Puts each figure in private storage at {prefix}{sha}.{ext}; worked-solution figures go
    under {prefix}solutions/, which students can open only once they've answered (ADR 0011)."""
    for folder, names in (("", bank.question_figures), ("solutions/", bank.solution_figures)):
        for name in sorted(names):
            raw = bank.images[name]
            local = tmp / f"fig-{name}"
            local.write_bytes(raw)
            sb.upload(IMAGES, prefix + folder + name, local, "image/png" if name.endswith(".png") else "image/jpeg")
            local.unlink()


def cmd_check(args: argparse.Namespace) -> int:
    worst = 0
    for name in args.files:
        info, bank, _ = read_file(Path(name))
        if bank.errors:
            worst = 1
            print(f"✗ {name}: {len(bank.errors)} problem(s)")
            for err in bank.errors[:50]:
                print(f"  - {err}")
            if len(bank.errors) > 50:
                print(f"  … and {len(bank.errors) - 50} more")
        else:
            assert info is not None
            print(f"✓ {name}: {info.course_name} · {info.topic}: {bank.summary()}")
    return worst


def database_message(err: Exception) -> str:
    text = str(err)
    start = text.find("{")
    if start >= 0:
        try:
            return json.loads(text[start:]).get("message", text)
        except ValueError:
            pass
    return text


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
        print(f"The {INBOX} bucket is empty. Upload the question bank files there first.")
        return 0

    stamp = time.strftime("%Y%m%d-%H%M%S")
    failures = 0
    with tempfile.TemporaryDirectory() as tmp:
        for name in names:
            local = sb.download(INBOX, name, Path(tmp) / name)
            info, bank, sha = read_file(local)
            if bank.errors or info is None:
                failures += 1
                print(f"✗ {name}: nothing was imported. Fix these and upload again:")
                for err in bank.errors[:50]:
                    print(f"  - {err}")
                sb.move(INBOX, name, f"failed/{stamp}/{name}")
                continue
            try:
                course_id = ensure_course(sb, centre_id, info)  # type: ignore[arg-type]
                source_path = f"centres/{centre_id}/question-bank/sources/{sha}.html"
                sb.upload(SOURCES, source_path, local, "text/html")
                data = bank.payload()
                if info.position is not None:
                    data["position"] = info.position
                text = json.dumps(data)
                if isinstance(bank, BankV2):
                    prefix = f"centres/{centre_id}/question-bank/images/{course_id}/"
                    upload_figures(sb, bank, prefix, Path(tmp))
                    text = text.replace(json.dumps(IMG_PREFIX)[:-1], json.dumps(prefix)[:-1])
                    text = text.replace(json.dumps(SOL_PREFIX)[:-1], json.dumps(prefix + "solutions/")[:-1])
                body = ('{"p_centre": %s, "p_course": %s, "p_topic": %s, "p_source_path": %s, "p_sha256": %s, "p_data": %s}' % (
                    json.dumps(centre_id), json.dumps(course_id), json.dumps(info.topic), json.dumps(source_path),
                    json.dumps(sha), text)).encode()
                result = json.loads(sb._request("POST", "/rest/v1/rpc/import_question_bank", body, {"Content-Type": "application/json"}))
            except Exception as err:  # the whole file rolled back
                failures += 1
                print(f"✗ {name}: nothing was imported. {database_message(err)}")
                sb.move(INBOX, name, f"failed/{stamp}/{name}")
                continue
            print(f"✓ {name}: {info.course_name} · {info.topic}: {result['added']} added, {result['changed']} changed, "
                  f"{result['unchanged']} unchanged, {result['retired']} retired")
            sb.move(INBOX, name, f"done/{stamp}/{name}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    c = sub.add_parser("check", help="check bank files locally, no upload")
    c.add_argument("files", nargs="+")
    i = sub.add_parser("inbox", help="import every bank file in the question-inbox bucket")
    i.add_argument("--centre", required=True, help="centre slug, e.g. aspire-hub")
    args = parser.parse_args()
    return cmd_check(args) if args.command == "check" else cmd_inbox(args)


if __name__ == "__main__":
    sys.exit(main())
