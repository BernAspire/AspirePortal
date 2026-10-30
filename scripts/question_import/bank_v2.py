"""Question bank format 2 (docs/question-bank-discovery.md, "Format 2").

The 2026 banks (one file per topic, "P5 - Mathematics - Topic 1 - Whole Numbers") hold
richer questions than format 1:

- sections are keyed by code ("WN-A"); they become sub-topics 1, 2, 3 … in file order;
- question text, options, table cells, answers and worked steps use two markers:
  ⟦numerator‖denominator⟧ for fractions (nestable) and [[img:N:W]] for figure N of the
  file's image list, drawn W pixels wide (always on a line of its own);
- worked-step lines starting with a tab are equation rows ("\\tLabel\\t= value");
- draw-on-paper questions (`draw`) and sentence answers can't be marked by matching:
  the student checks them against the worked solution ("self" answers);
- `src` and the product tag `p` are kept for staff, never shown to students.

Text is turned into structured JSON ("rich" inline lists), never HTML. Figures are
returned as bytes keyed by SHA-256; the import job uploads them to private storage and
the content refers to them by path.
"""

from __future__ import annotations

import base64
import hashlib
import re
from dataclasses import dataclass, field
from typing import Any

IMG_PREFIX = "@img/"  # replaced by centres/{centre}/question-bank/images/{course}/ at import
SOL_PREFIX = "@sol/"  # worked-solution figures: …/images/{course}/solutions/, never listable by students
MAX_TEXT = 4000
MAX_IMAGE_BYTES = 2_000_000
MAX_PARTS = 8

_IMG = re.compile(r"\[\[img:(\d+):(\d+)\]\]")
_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$")
# Answer-checking rules, ported from the bank page's own script so marking matches it.
_LAB = re.compile(r"^\(([a-h]|i{1,3}|iv|vi?)\)((?:\((?:i{1,3}|iv|vi?)\))?)\s*(.*)$", re.DOTALL)
_NAMED = re.compile(r"^[A-Za-z][\w ]{0,20}:\s*\S", re.ASCII)

Inline = list  # list of str | {"frac": [Inline, Inline]}


class _Bad(ValueError):
    pass


def rich(s: str) -> Inline:
    """'3⟦2‖7⟧ kg' → ['3', {'frac': [['2'], ['7']]}, ' kg']. Tabs become spaces (as on the page)."""
    s = re.sub(r"\t+", " ", s)
    out, i = _parse(s, 0, top=True)
    if i != len(s):
        raise _Bad("unbalanced fraction markers ⟦ ‖ ⟧")
    return out


def _parse(s: str, i: int, *, top: bool, stop: str = "") -> tuple[Inline, int]:
    out: Inline = []
    buf = ""
    while i < len(s):
        ch = s[i]
        if ch == "⟦":
            if buf:
                out.append(buf)
                buf = ""
            num, i = _parse(s, i + 1, top=False, stop="‖")
            if i >= len(s) or s[i] != "‖":
                raise _Bad("unbalanced fraction markers ⟦ ‖ ⟧")
            den, i = _parse(s, i + 1, top=False, stop="⟧")
            if i >= len(s) or s[i] != "⟧":
                raise _Bad("unbalanced fraction markers ⟦ ‖ ⟧")
            out.append({"frac": [num, den]})
            i += 1
            continue
        if not top and ch in stop:
            break
        if ch in "‖⟧":
            raise _Bad("unbalanced fraction markers ⟦ ‖ ⟧")
        buf += ch
        i += 1
    if buf:
        out.append(buf)
    return out, i


def plain(s: str) -> str:
    """Text form used for marking, exactly as the page: 3⟦2‖7⟧ → '3 2/7', ⟦1‖3⟧ → '1/3'."""
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"(\d)⟦([^⟦⟧]*?)‖([^⟦⟧]*?)⟧", r"\1 \2/\3", s)
        s = re.sub(r"⟦([^⟦⟧]*?)‖([^⟦⟧]*?)⟧", r"\1/\2", s)
    return s


def is_open(v: str) -> bool:
    """A sentence answer that can't be marked by matching (the page's isOpen rule)."""
    words = len(v.split())
    return bool(re.search(r"\bbecause\b|\bexplain|see working|counted twice", v, re.IGNORECASE)
                or (re.search(r"\b(is|are|was|were|has|have)\b", v, re.IGNORECASE) and words > 3)
                or (not re.search(r"\d", v) and words > 12))


def answer_parts(answer: str) -> list[dict]:
    """The answer boxes, as the page splits them: '(a) 54 cm² ; (b) ⟦3‖8⟧' → (a) and (b)."""
    t = plain(answer).strip()
    segs = re.split(r"\s*;\s*", t)
    if len(segs) > 1 and _LAB.match(t):
        out = []
        for seg in re.split(r"\s*;\s*(?=\()", t):
            m = _LAB.match(seg)
            if not m:
                break
            out.append({"label": f"({m[1]}){m[2] or ''}", "text": m[3].strip()})
        else:
            return out
    if len(segs) > 1 and all(_NAMED.match(x) for x in segs):
        return [{"label": x[: x.index(":")].strip(), "text": x[x.index(":") + 1:].strip()} for x in segs]
    m = _LAB.match(t)
    if m and not re.match(r"^\(\d", t):
        return [{"label": f"({m[1]}){m[2] or ''}", "text": m[3].strip()}]
    return [{"label": "", "text": t}]


@dataclass
class BankV2:
    sections: list[dict] = field(default_factory=list)
    questions: list[dict] = field(default_factory=list)
    images: dict[str, bytes] = field(default_factory=dict)  # "sha256.png" → PNG/JPEG bytes
    question_figures: set[str] = field(default_factory=set)  # names used in question text
    solution_figures: set[str] = field(default_factory=set)  # names used in worked solutions
    errors: list[str] = field(default_factory=list)

    def payload(self) -> dict:
        return {"sections": self.sections, "questions": self.questions}

    def summary(self) -> str:
        kinds = [q["key"]["answer"]["kind"] for q in self.questions]
        return (f"{len(self.questions)} questions in {len(self.sections)} sections "
                f"({kinds.count('choice')} multiple choice, {kinds.count('text')} written answers, "
                f"{kinds.count('self')} self-checked), {len(self.images)} figures")


def convert_v2(data: dict) -> BankV2:
    bank = BankV2()
    e = bank.errors
    sections, items, img = data.get("sections"), data.get("items"), data.get("img") or []
    if not isinstance(sections, dict) or not sections:
        e.append("'sections' is missing")
        return bank
    if not isinstance(items, list) or not items:
        e.append("'items' is missing")
        return bank
    if not isinstance(img, list):
        e.append("'img' must be a list of figures")
        return bank
    hint = data.get("hint") if isinstance(data.get("hint"), str) and len(data["hint"]) <= 200 else None

    numbers: dict[str, int] = {}
    for key, title in sections.items():
        if not isinstance(title, str) or not title.strip() or len(title) > 200:
            e.append(f"Section {key}: title must be text")
            continue
        numbers[key] = len(numbers) + 1
        bank.sections.append({"number": numbers[key], "title": title.strip()})
    if len(numbers) > 999:
        e.append("More than 999 sections")

    figures: dict[int, str] = {}  # image index → sha

    def figure(n: int, where: str) -> str | None:
        if n in figures:
            return figures[n]
        if not 0 <= n < len(img) or not isinstance(img[n], str):
            raise _Bad(f"figure {n} does not exist")
        m = re.match(r"^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$", img[n])
        if not m:
            raise _Bad(f"figure {n} is not a PNG or JPEG image")
        raw = base64.b64decode(m[2], validate=True)
        if not (raw.startswith(b"\x89PNG\r\n\x1a\n") or raw.startswith(b"\xff\xd8\xff")):
            raise _Bad(f"figure {n} is not a PNG or JPEG image")
        if len(raw) > MAX_IMAGE_BYTES:
            raise _Bad(f"figure {n} is larger than 2 MB")
        sha = hashlib.sha256(raw).hexdigest()
        ext = "png" if raw.startswith(b"\x89PNG") else "jpg"
        bank.images[f"{sha}.{ext}"] = raw
        figures[n] = f"{sha}.{ext}"
        return figures[n]

    def text_block(s: str, *, part: bool = False, solution: bool = False) -> dict:
        m = _IMG.fullmatch(s.strip())
        if m:
            name = figure(int(m[1]), "")
            (bank.solution_figures if solution else bank.question_figures).add(name)
            return {"type": "image", "path": (SOL_PREFIX if solution else IMG_PREFIX) + name, "width": max(40, min(int(m[2]), 1000))}
        if _IMG.search(s):
            raise _Bad("a figure must be on a line of its own")
        if len(s) > MAX_TEXT:
            raise _Bad(f"a line is longer than {MAX_TEXT} characters")
        block: dict = {"type": "paragraph", "rich": rich(s)}
        if part:
            block["part"] = True
        return block

    def table_block(rows: Any) -> dict:
        if (not isinstance(rows, list) or not 1 <= len(rows) <= 50
                or not all(isinstance(r, list) and 1 <= len(r) <= 12 for r in rows)):
            raise _Bad("a table is not rows of cells")
        cells = []
        for r in rows:
            row = []
            for c in r:
                if not isinstance(c, (str, int, float)) or _IMG.search(str(c)):
                    raise _Bad("a table cell must be text")
                row.append(rich(str(c)))
            cells.append(row)
        return {"type": "table", "rows": cells}

    seen: set[str] = set()
    for n, q in enumerate(items, start=1):
        if not isinstance(q, dict):
            e.append(f"Item {n} is not a question")
            continue
        ref = q.get("id")
        where = f"Question {ref}" if isinstance(ref, str) else f"Item {n}"
        before = len(e)
        if not isinstance(ref, str) or not _REF.match(ref):
            e.append(f"{where}: id must be a short code like Q0001")
        elif ref in seen:
            e.append(f"{where}: id appears twice")
        group = q.get("g")
        if not isinstance(group, str) or not _REF.match(group):
            e.append(f"{where}: group 'g' is missing")
        if q.get("s") not in numbers:
            e.append(f"{where}: section {q.get('s')!r} is not one of the sections")
        if q.get("d") not in (1, 2, 3):
            e.append(f"{where}: difficulty must be 1, 2 or 3")
        source = q.get("src")
        if source is not None and (not isinstance(source, str) or len(source) > 300):
            e.append(f"{where}: source must be text")
        answer = q.get("a")
        if not isinstance(answer, str) or not answer.strip() or len(answer) > 1000:
            e.append(f"{where}: answer must be text")
            answer = ""
        try:
            stem = q.get("q")
            if not isinstance(stem, list) or not stem:
                raise _Bad("question text must be a list of lines")
            # Multiple choice written into the question text: "(1) 81 026" … "(4) …" lines and an
            # answer starting "(2)". The page could only mark these by typed text; make them choices.
            inline_choices: list[str] = []
            if q.get("o") is None and re.match(r"^\(\d\)", answer.strip()):
                tail = []
                for x in reversed(stem):
                    m = re.match(r"^\((\d)\)\s+(\S.*)$", x.strip(), re.DOTALL) if isinstance(x, str) else None
                    if not m:
                        break
                    tail.insert(0, (int(m[1]), m[2]))
                if 2 <= len(tail) <= 6 and [n for n, _ in tail] == list(range(1, len(tail) + 1)) \
                        and not any(_IMG.search(t) for _, t in tail) and int(answer.strip()[1]) <= len(tail):
                    inline_choices = [t for _, t in tail]
                    stem = stem[: len(stem) - len(tail)]
                    if not stem:
                        raise _Bad("question text is only options")
            blocks = []
            for x in stem:
                if isinstance(x, dict) and "table" in x:
                    blocks.append(table_block(x["table"]))
                elif isinstance(x, str) and x.strip():
                    blocks.append(text_block(x, part=bool(re.match(r"^\([a-d]\)\t", x))))
                elif not isinstance(x, str):
                    raise _Bad("question text has an unknown kind of line")

            steps: list[dict] = []
            k = q.get("k")
            if not isinstance(k, list):
                raise _Bad("worked steps 'k' must be a list")
            for line in k:
                if isinstance(line, dict) and "table" in line:
                    steps.append(table_block(line["table"]))
                elif isinstance(line, str):
                    if line.startswith("\t"):
                        body = line[1:]
                        label, rest = (body.split("\t", 1) if "\t" in body else ("", body))
                        row = {"label": rich(label), "value": rich(rest)}
                        if steps and steps[-1]["type"] == "equation":
                            steps[-1]["rows"].append(row)
                        else:
                            steps.append({"type": "equation", "rows": [row]})
                    elif line.strip():
                        steps.append(text_block(line, part=bool(re.fullmatch(r"\([a-d]\)", line.strip())), solution=True))
                else:
                    raise _Bad("worked steps have an unknown kind of line")

            options = q.get("o")
            choices = None
            if inline_choices:
                choices = [rich(o) for o in inline_choices]
                spec = {"kind": "choice", "correct": int(answer.strip()[1])}
                labels = [""]
            elif options is not None:
                if not isinstance(options, list) or not 2 <= len(options) <= 6 or not all(isinstance(o, str) and o.strip() for o in options):
                    raise _Bad("options must be 2–6 pieces of text")
                if any(_IMG.search(o) for o in options):
                    raise _Bad("options can't contain figures")
                choices = [rich(o) for o in options]
                correct = q.get("c")
                if not isinstance(correct, int) or not 1 <= correct <= len(options):
                    raise _Bad(f"correct option 'c' must be 1–{len(options)}")
                spec: dict = {"kind": "choice", "correct": correct}
                labels = [""]
            else:
                parts = answer_parts(answer)
                if len(parts) > MAX_PARTS:
                    raise _Bad(f"more than {MAX_PARTS} answer parts")
                if any(not p["text"] for p in parts):
                    raise _Bad("an answer part is empty")
                labels = [p["label"] for p in parts]
                # Drawings, sentences and answers with a tolerance ("34° (accept 33°–35°)") can't be
                # marked by matching: the student checks them against the worked solution.
                if q.get("draw") or any(is_open(p["text"]) or re.search(r"\baccept\b", p["text"], re.IGNORECASE) for p in parts):
                    spec = {"kind": "self"}
                    labels = [""]
                else:
                    spec = {"kind": "text", "parts": parts}
            display = rich(answer) if answer else []
        except _Bad as err:
            e.append(f"{where}: {err}")
            continue
        except (ValueError, TypeError) as err:  # base64 and the like
            e.append(f"{where}: {err}")
            continue

        if len(e) == before:
            seen.add(ref)
            content: dict = {"blocks": blocks, "choices": choices, "parts": labels}
            if spec["kind"] == "self":
                content["self_check"] = "draw" if q.get("draw") else "explain"
            elif hint and spec["kind"] == "text":
                content["hint"] = hint
            if q.get("x"):
                content["extra"] = True
            bank.questions.append({
                "ref": ref, "group": group, "section": numbers[q["s"]], "difficulty": q["d"],
                "strategy": None, "marks": None, "source": source.strip() if isinstance(source, str) and source.strip() else None,
                "content": content,
                "key": {"answer": spec, "display": display, "why_not": {}, "steps": steps},
            })
    return bank


def is_v2(data: dict) -> bool:
    items = data.get("items")
    return isinstance(items, list) and any(isinstance(q, dict) and isinstance(q.get("q"), list) for q in items[:20])
