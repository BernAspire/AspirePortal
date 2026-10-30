"""Reads a question bank page (see docs/question-bank-discovery.md) and turns it into the
canonical JSON that public.import_question_bank() stores.

The page holds its questions as one JSON literal, `const BANK = {...}`, inside its script.
Nothing in the page is executed: the literal is decoded with a JSON parser and every
field is checked. Text stays plain text (no HTML), so nothing needs sanitising; the
portal escapes it when rendering.

File names say where a bank goes, like lesson files:
  P5 - Mathematics - Whole Numbers.html   → Primary 5 Mathematics, topic "Whole Numbers"
  P5 - Mathematics - Topic 3 - Decimals.html → topic "Topic 3 - Decimals", listed third

Two formats exist: format 1 (the first Whole Numbers bank, converted here) and format 2
(the 2026 banks with fractions and figures, converted in bank_v2.py).
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lesson_import"))
from naming import LEVEL_NAMES, subject_code  # noqa: E402

from bank_v2 import BankV2, convert_v2, is_v2  # noqa: E402

_NAME = re.compile(
    r"^(?P<level>P[1-6]|S[1-5]|JC[12])\s*-\s*(?P<subject>[A-Za-z][A-Za-z &]{1,40}?)\s*-\s*(?P<topic>.+?)\.html?$",
    re.IGNORECASE,
)
_MARKER = "const BANK = "
_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$")
_PARTS = re.compile(r"\(([a-f])\)\s*")
MAX_TEXT = 4000


@dataclass(frozen=True)
class BankFile:
    level_code: str
    subject_name: str
    topic: str
    #: "Topic 3 - Decimals" → 3: the order topics are listed in (none for other names)
    position: int | None = None

    @property
    def level_name(self) -> str:
        return LEVEL_NAMES[self.level_code][0]

    @property
    def subject_code(self) -> str:
        return subject_code(self.subject_name)

    @property
    def course_name(self) -> str:
        return f"{self.level_name} {self.subject_name}"


def parse_name(file_name: str) -> BankFile | None:
    m = _NAME.match(file_name.strip())
    if not m:
        return None
    subject = " ".join(w.capitalize() if w.islower() else w for w in m["subject"].split())
    topic = " ".join(m["topic"].replace("_", " ").split())
    numbered = re.match(r"^Topic\s+(\d{1,3})\s*-\s*\S", topic, re.IGNORECASE)
    return BankFile(m["level"].upper(), subject, topic, int(numbered[1]) if numbered else None)


def extract_bank(html: str) -> dict:
    """The BANK object, decoded as JSON (never evaluated)."""
    start = html.find(_MARKER)
    if start < 0:
        raise ValueError("No question data found (expected 'const BANK = {...}' in the page). "
                         "Download the bank's own HTML file, not a saved copy of the web page.")
    try:
        value, _ = json.JSONDecoder().raw_decode(html, start + len(_MARKER))
    except json.JSONDecodeError as err:
        raise ValueError(f"The question data is not valid JSON ({err.msg} at character {err.pos}).") from None
    if not isinstance(value, dict):
        raise ValueError("The question data is not an object.")
    return value


def answer_parts(answer: str) -> list[dict]:
    """'(a) 6 372 041 (b) 405' → two parts; anything else is one unlabelled part (as the original page)."""
    pieces = _PARTS.split(answer)
    if len(pieces) < 3:
        return [{"label": "", "text": answer.strip()}]
    return [{"label": pieces[i], "text": pieces[i + 1].strip()} for i in range(1, len(pieces), 2)]


def _text(v: Any, where: str, errors: list[str], *, optional: bool = False, limit: int = MAX_TEXT) -> str | None:
    if v is None and optional:
        return None
    if not isinstance(v, str) or not v.strip():
        errors.append(f"{where} must be text")
        return None
    if len(v) > limit:
        errors.append(f"{where} is longer than {limit} characters")
        return None
    return v


def _table(v: Any, where: str, errors: list[str]) -> list[list[str]] | None:
    if (not isinstance(v, list) or not 1 <= len(v) <= 50
            or not all(isinstance(r, list) and 1 <= len(r) <= 12 and all(isinstance(c, (str, int, float)) for c in r) for r in v)):
        errors.append(f"{where} is not a table (rows of cells)")
        return None
    return [[str(c) for c in r] for r in v]


@dataclass
class Bank:
    sections: list[dict] = field(default_factory=list)
    questions: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def payload(self) -> dict:
        return {"sections": self.sections, "questions": self.questions}

    def summary(self) -> str:
        mcq = sum(1 for q in self.questions if q["key"]["answer"]["kind"] == "choice")
        return (f"{len(self.questions)} questions in {len(self.sections)} sections "
                f"({mcq} multiple choice, {len(self.questions) - mcq} written answers)")


def convert(data: dict) -> Bank:
    bank = Bank()
    e = bank.errors
    sections = data.get("sections")
    items = data.get("items")
    if not isinstance(sections, dict) or not sections:
        e.append("'sections' is missing")
        return bank
    if not isinstance(items, list) or not items:
        e.append("'items' is missing")
        return bank

    for key, title in sections.items():
        if not str(key).isdigit() or not 1 <= int(key) <= 999:
            e.append(f"Section number '{key}' is not a number")
            continue
        t = _text(title, f"Section {key} title", e, limit=200)
        if t:
            bank.sections.append({"number": int(key), "title": t.strip()})
    numbers = {s["number"] for s in bank.sections}

    seen: set[str] = set()
    for n, q in enumerate(items, start=1):
        if not isinstance(q, dict):
            e.append(f"Item {n} is not a question")
            continue
        ref = q.get("id")
        where = f"Question {ref}" if isinstance(ref, str) else f"Item {n}"
        before = len(e)
        if not isinstance(ref, str) or not _REF.match(ref):
            e.append(f"{where}: id must be a short code like 4.35b")
        elif ref in seen:
            e.append(f"{where}: id appears twice")
        group = q.get("g")
        if not isinstance(group, str) or not _REF.match(group):
            e.append(f"{where}: group 'g' is missing")
        section = q.get("s")
        if not isinstance(section, int) or section not in numbers:
            e.append(f"{where}: section {section!r} is not one of the sections")
        difficulty = q.get("d")
        if difficulty not in (1, 2, 3):
            e.append(f"{where}: difficulty must be 1, 2 or 3")
        marks = q.get("m")
        if marks is not None and (not isinstance(marks, int) or not 1 <= marks <= 20):
            e.append(f"{where}: marks must be 1–20")
        strategy = _text(q.get("h"), f"{where}: strategy", e, optional=True, limit=80)
        source = _text(q.get("src"), f"{where}: source", e, optional=True, limit=200)
        stem = _text(q.get("q"), f"{where}: question text", e)
        answer = _text(q.get("a"), f"{where}: answer", e, limit=500)

        blocks: list[dict] = [{"type": "paragraph", "text": p} for p in (stem or "").split("\n") if p.strip()]
        for i, t in enumerate(q.get("t") or []):
            rows = _table(t, f"{where}: table {i + 1}", e)
            if rows:
                blocks.append({"type": "table", "rows": rows})

        steps: list[dict] = []
        k = q.get("k")
        if not isinstance(k, list) or not k:
            e.append(f"{where}: worked steps 'k' are missing")
        else:
            for i, s in enumerate(k):
                if isinstance(s, dict) and "table" in s:
                    rows = _table(s["table"], f"{where}: step {i + 1}", e)
                    if rows:
                        steps.append({"type": "table", "rows": rows})
                else:
                    t = _text(s, f"{where}: step {i + 1}", e, limit=1000)
                    if t:
                        steps.append({"type": "paragraph", "text": t})

        options = q.get("o")
        if options is not None:
            if not isinstance(options, list) or not 2 <= len(options) <= 6 or not all(isinstance(o, str) and o.strip() for o in options):
                e.append(f"{where}: options must be 2–6 pieces of text")
                options = None
            correct = q.get("c")
            if options and (not isinstance(correct, int) or not 1 <= correct <= len(options)):
                e.append(f"{where}: correct option 'c' must be 1–{len(options)}")
            why = q.get("w") or {}
            if not isinstance(why, dict) or not all(str(x).isdigit() and isinstance(y, str) for x, y in why.items()):
                e.append(f"{where}: 'w' must give a reason per wrong option")
                why = {}
            answer_spec: dict = {"kind": "choice", "correct": correct}
            parts = [""]
        else:
            why = {}
            spec_parts = answer_parts(answer or "")
            if any(not p["text"] for p in spec_parts):
                e.append(f"{where}: an answer part is empty")
            answer_spec = {"kind": "text", "parts": spec_parts}
            parts = [p["label"] for p in spec_parts]

        if len(e) == before:
            seen.add(ref)
            bank.questions.append({
                "ref": ref, "group": group, "section": section, "difficulty": difficulty,
                "strategy": strategy.strip() if strategy else None, "marks": marks,
                "source": source.strip() if source else None,
                "content": {"blocks": blocks, "choices": options, "parts": parts},
                "key": {"answer": answer_spec, "display": answer, "why_not": {str(x): y for x, y in why.items()}, "steps": steps},
            })
    return bank


def read_file(path: Path) -> tuple[BankFile | None, Bank | BankV2, str]:
    """(where it goes, the converted bank, sha-256 of the file). Problems are in bank.errors."""
    raw = path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    info = parse_name(path.name)
    if info is None:
        bank = Bank()
        bank.errors.append(f"Name the file like 'P5 - Mathematics - Whole Numbers.html' (level - subject - topic). Got '{path.name}'.")
        return None, bank, sha
    try:
        data = extract_bank(raw.decode("utf-8", errors="strict"))
    except (ValueError, UnicodeDecodeError) as err:
        bank = Bank()
        bank.errors.append(str(err))
        return info, bank, sha
    return info, (convert_v2(data) if is_v2(data) else convert(data)), sha
