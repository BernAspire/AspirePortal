"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { cn } from "@/lib/utils";
import type { DifficultyChoice, StartPracticeState } from "@/modules/practice/schema";

export interface SetupSection {
  readonly id: string;
  readonly title: string;
  readonly topicTitle: string;
  readonly questionCount: number;
  readonly accuracy: number | null;
}

export interface PracticeSetupProps {
  readonly courseId: string;
  readonly courseName: string;
  readonly subjectLabel: string;
  readonly courses: readonly { id: string; name: string; href: string; selected: boolean }[];
  /** Weakest first. */
  readonly sections: readonly SetupSection[];
  readonly start: (prev: StartPracticeState, formData: FormData) => Promise<StartPracticeState>;
  readonly historySlot?: React.ReactNode;
}

const MODES = [
  { id: "adaptive", name: "Adaptive", desc: "Picks questions from your weak topics", recommended: true },
  { id: "manual", name: "Manual", desc: "You choose the topics to practise", recommended: false },
] as const;
const LEVELS: readonly { id: DifficultyChoice; name: string; sub: string }[] = [
  { id: "easy", name: "Easy", sub: "Foundation" },
  { id: "medium", name: "Medium", sub: "Standard" },
  { id: "hard", name: "Hard", sub: "Challenging" },
  { id: "mixed", name: "Mixed", sub: "All levels" },
];
const COUNTS = [
  { n: 5, sub: "Quick" },
  { n: 10, sub: "Standard" },
  { n: 15, sub: "Extended" },
] as const;

const legend = "mb-2.5 text-[13px] font-semibold uppercase tracking-[.05em] text-[#5F6368]";
const focus = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** "Set up your practice" from the Aspire Online design. */
export function PracticeSetup(props: PracticeSetupProps) {
  const [mode, setMode] = useState<"adaptive" | "manual">("adaptive");
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [level, setLevel] = useState<DifficultyChoice>("mixed");
  const [count, setCount] = useState<number>(10);
  const [state, action, pending] = useActionState(props.start, {});

  const toggle = (id: string) => {
    setMode("manual");
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const topicText =
    mode === "adaptive"
      ? "weakest topics first"
      : picked.length
        ? props.sections.filter((s) => picked.includes(s.id)).map((s) => s.title).join(", ")
        : "all topics";
  const levelName = LEVELS.find((l) => l.id === level)?.name ?? "Mixed";

  return (
    <div className="flex flex-col gap-[18px]">
      {props.courses.length > 1 ? (
        <nav aria-label="Courses" className="flex flex-wrap gap-2 border-b border-border">
          {props.courses.map((c) => (
            <Link
              key={c.id}
              href={c.href}
              aria-current={c.selected ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center border-b-2 px-3 text-[15px]",
                focus,
                c.selected ? "border-brand font-semibold" : "border-transparent text-[#3D4146] hover:text-foreground",
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2.5 bg-[#FFF9EC] px-[22px] py-[18px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.06em] text-[#5F6368]">
              {props.subjectLabel} · {props.courseName}
            </p>
            <h1 className="mt-1 font-display text-[22px] font-semibold">Set up your practice</h1>
          </div>
          <span className="rounded-full bg-[#FDEBB8] px-3 py-1.5 text-[13px]">Course: {props.courseName}</span>
        </header>

        <form action={action} className="mx-auto flex max-w-[600px] flex-col gap-[22px] p-[22px]">
          <input type="hidden" name="courseId" value={props.courseId} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="difficulty" value={level} />
          <input type="hidden" name="count" value={count} />
          {mode === "manual" ? picked.map((id) => <input key={id} type="hidden" name="sectionId" value={id} />) : null}

          <fieldset>
            <legend className={legend}>Practice mode</legend>
            <div className="flex flex-col gap-2.5">
              {MODES.map((m) => {
                const on = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMode(m.id)}
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-[14px] border-2 px-4 py-3.5 text-left",
                      focus,
                      on ? "border-[#E3A008] bg-[#FFF6DA]" : "border-border bg-white hover:bg-[#FFFDF6]",
                    )}
                  >
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="font-display text-base font-semibold">
                        {m.name}{" "}
                        {m.recommended ? (
                          <span className="ml-1 rounded-full bg-brand px-2 py-0.5 align-middle font-sans text-[11.5px] font-semibold">
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[13px] text-[#3D4146]">{m.desc}</span>
                    </span>
                    <span aria-hidden className={cn("font-bold text-[#8A5A00]", on ? "opacity-100" : "opacity-0")}>
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="rounded-[14px] border border-[#F6E3A6] bg-[#FFFDF6] px-4 py-3.5">
            <legend className={cn(legend, "mb-0 px-1.5")}>Topics</legend>
            <p className="mb-2.5 text-[13px] text-[#3D4146]">
              {mode === "adaptive"
                ? "Adaptive mode starts with your weakest topics (shown with your accuracy). Tap a topic to choose your own instead."
                : "Choose one or more topics, or none for all."}
            </p>
            <div className="flex flex-wrap gap-2">
              {props.sections.map((s) => {
                const on = mode === "manual" && picked.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s.id)}
                    title={`${s.topicTitle} · ${s.questionCount} questions`}
                    className={cn(
                      "min-h-10 rounded-full border px-3.5 text-[13px] font-semibold",
                      focus,
                      on ? "border-foreground bg-foreground text-white" : "border-[#DCD5C3] bg-white hover:bg-[#FBF7EC]",
                    )}
                  >
                    {s.title} · {s.accuracy === null ? "new" : `${s.accuracy}%`}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className={legend}>Difficulty level</legend>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={level === l.id}
                  onClick={() => setLevel(l.id)}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[14px] border-2 bg-white",
                    focus,
                    level === l.id ? "border-foreground" : "border-border hover:bg-[#FFFDF6]",
                  )}
                >
                  <span className="text-[15px] font-semibold">{l.name}</span>
                  <span className="text-xs text-[#5F6368]">{l.sub}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={legend}>Number of questions</legend>
            <div className="grid grid-cols-3 gap-2.5">
              {COUNTS.map((c) => (
                <button
                  key={c.n}
                  type="button"
                  aria-pressed={count === c.n}
                  onClick={() => setCount(c.n)}
                  className={cn(
                    "flex min-h-[76px] flex-col items-center justify-center gap-0.5 rounded-[14px] border-2",
                    focus,
                    count === c.n ? "border-[#E3A008] bg-[#FFF6DA]" : "border-border bg-white hover:bg-[#FFFDF6]",
                  )}
                >
                  <span className="font-display text-[22px] font-semibold">{c.n}</span>
                  <span className="text-xs text-[#3D4146]">{c.sub}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-[14px] bg-[#F4F4F2] px-4 py-3.5">
            <p className={cn(legend, "mb-1")}>Your session</p>
            <p className="text-sm">
              {props.subjectLabel} · {mode === "adaptive" ? "Adaptive" : "Manual"} · {topicText} · {levelName} difficulty · {count} questions
            </p>
          </div>

          <p role="alert" className="-my-2 min-h-5 text-sm text-destructive">
            {state.error}
          </p>
          <button
            type="submit"
            disabled={pending}
            className={cn(
              "flex min-h-[52px] items-center justify-center rounded-full bg-brand text-base font-bold hover:bg-brand-strong disabled:opacity-70",
              focus,
            )}
          >
            {pending ? "Picking your questions…" : "Start practice ›"}
          </button>
        </form>
      </section>
      {props.historySlot}
    </div>
  );
}
