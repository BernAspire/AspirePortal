"""Pure rules for the lesson importer: file names, levels, subjects, slide roles.

No third-party imports, so these run in CI with the standard library alone.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# "P5 - Mathematics - Worksheet 01 - Numbers to 10 Million.pptx"
# "P5 - Mathematics - Worksheet 01 - Numbers to 10 Million - Questions.docx"
_NAME = re.compile(
    r"""^(?P<level>P[1-6]|S[1-5]|JC[12])
        \s*-\s*(?P<subject>[A-Za-z][A-Za-z &]{1,40}?)
        \s*-\s*(?:Worksheet|Week|Lesson)\s*(?P<week>\d{1,2})
        \s*-\s*(?P<title>.+?)
        (?:\s*-\s*(?P<variant>Questions|Worksheet|Notes))?
        \.(?P<ext>pptx|docx|pdf)$""",
    re.IGNORECASE | re.VERBOSE,
)

LEVEL_NAMES = {
    **{f"P{n}": (f"Primary {n}", "primary", n) for n in range(1, 7)},
    **{f"S{n}": (f"Secondary {n}", "secondary", 10 + n) for n in range(1, 6)},
    "JC1": ("JC 1", "jc", 21),
    "JC2": ("JC 2", "jc", 22),
}

SUBJECT_CODES = {
    "mathematics": "MATH",
    "maths": "MATH",
    "math": "MATH",
    "science": "SCI",
    "english": "ENG",
    "chinese": "CHI",
    "malay": "MAL",
    "tamil": "TAM",
}

PART_SLIDES = "slides"
PART_WORKSHEET = "worksheet"


@dataclass(frozen=True)
class LessonFile:
    level_code: str  # "P5"
    subject_name: str  # "Mathematics"
    week: int  # 1
    title: str  # "Numbers to 10 Million"
    part: str  # "slides" | "worksheet"
    ext: str  # "pptx" | "docx" | "pdf"

    @property
    def key(self) -> tuple[str, str, int]:
        """Files with the same key belong to the same lesson."""
        return (self.level_code, self.subject_code, self.week)

    @property
    def subject_code(self) -> str:
        return subject_code(self.subject_name)

    @property
    def level_name(self) -> str:
        return LEVEL_NAMES[self.level_code][0]

    @property
    def course_name(self) -> str:
        return f"{self.level_name} {self.subject_name}"


def parse_name(file_name: str) -> LessonFile | None:
    """Reads a lesson file name; None if it doesn't follow the convention."""
    match = _NAME.match(file_name.strip())
    if not match:
        return None
    level = match["level"].upper()
    week = int(match["week"])
    if week < 1:
        return None
    ext = match["ext"].lower()
    # PowerPoint is the lesson deck; Word or PDF is the worksheet.
    part = PART_SLIDES if ext == "pptx" else PART_WORKSHEET
    subject = " ".join(w.capitalize() if w.islower() else w for w in match["subject"].split())
    return LessonFile(
        level_code=level,
        subject_name=subject,
        week=week,
        title=match["title"].strip(),
        part=part,
        ext=ext,
    )


def subject_code(name: str) -> str:
    known = SUBJECT_CODES.get(name.strip().lower())
    if known:
        return known
    letters = re.sub(r"[^A-Z0-9]", "", name.upper())
    return (letters[:6] or "SUBJ").ljust(2, "X")


# --- Slides ---------------------------------------------------------------------

# Slides meant only for the live online class are left out of self-study.
HIDDEN_SLIDE_TITLES = ("class rules",)

_SOLUTION = re.compile(r"(worked\s+solution|·\s*answers?\s*$|\banswers?\s*$)", re.IGNORECASE)


def slide_role(title: str) -> str:
    """'hidden', 'solution' or 'page' for a slide, from its title."""
    clean = " ".join(title.split()).strip()
    if clean.lower() in HIDDEN_SLIDE_TITLES:
        return "hidden"
    if _SOLUTION.search(clean):
        return "solution"
    return "page"


def page_title(text: str) -> str:
    """A short title for a page: its first non-empty line, at most 200 characters."""
    for line in text.splitlines():
        line = " ".join(line.split())
        if line:
            return line[:200]
    return ""
