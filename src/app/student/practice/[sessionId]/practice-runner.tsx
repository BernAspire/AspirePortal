"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import type { PracticeResponse, PracticeResult, PracticeSolution, SolutionResult, SubmitAnswerResult } from "@/modules/practice/schema";
import { DIFFICULTY_LABEL, QuestionBlocks, questionLabel, RichText, WorkedSteps, type Difficulty, type QuestionContent } from "@/modules/question-bank/ui";

export interface RunnerQuestion {
  readonly position: number;
  readonly questionId: string;
  readonly sectionTitle: string;
  readonly difficulty: Difficulty;
  readonly marks: number | null;
  readonly strategy: string | null;
  /** The bank's question number, e.g. "1.4e". */
  readonly ref: string;
  readonly content: QuestionContent;
}

export interface PracticeRunnerProps {
  readonly sessionId: string;
  readonly courseName: string;
  readonly questions: readonly RunnerQuestion[];
  readonly initialResults: readonly PracticeResult[];
  readonly setupHref: string;
  readonly submit: (input: unknown) => Promise<SubmitAnswerResult>;
  /** Questions the student has bookmarked (unresolved). */
  readonly bookmarked: readonly string[];
  readonly setBookmark: (input: unknown) => Promise<{ ok: boolean }>;
  /** Worked solution of a self-checked question, before the student marks it. */
  readonly solution: (input: unknown) => Promise<SolutionResult>;
}

/** "a" → "(a) Answer", "(a)" → "(a) Answer", "Length" → "Length: Answer". */
function boxLabel(label: string): string {
  if (!label) return "Answer";
  if (/^\(/.test(label)) return `${label} Answer`;
  if (/^[a-h]$/.test(label)) return `(${label}) Answer`;
  return `${label}: Answer`;
}

const focus = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const DIFF_STYLE: Record<Difficulty, string> = {
  1: "bg-[#E6F4EC] text-[#145C38]",
  2: "bg-[#E6EFFA] text-[#1F3F7A]",
  3: "bg-[#FDECEC] text-[#9B1C1C]",
};
const REASON: Record<Exclude<SubmitAnswerResult, { ok: true }>["reason"], string> = {
  consent: "Your answers can't be saved until your parent's consent is on record. Please ask them to contact the centre.",
  not_allowed: "This practice isn't available to you any more (your programme may have ended).",
  invalid: "Please answer in the boxes above, then check again.",
  unavailable: "Couldn't check your answer just now. Please try again.",
};

/** One question at a time: answer, check, see the worked solution, move on. */
export function PracticeRunner(props: PracticeRunnerProps) {
  const total = props.questions.length;
  const [results, setResults] = useState<ReadonlyMap<number, PracticeResult>>(
    () => new Map(props.initialResults.map((r) => [r.position, r])),
  );
  const firstOpen = props.questions.find((q) => !results.has(q.position))?.position;
  const [current, setCurrent] = useState<number | "summary">(firstOpen ?? "summary");
  const [choice, setChoice] = useState<number | null>(null);
  const [parts, setParts] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [solutions, setSolutions] = useState<ReadonlyMap<number, PracticeSolution>>(() => new Map());
  const [pending, startTransition] = useTransition();
  const [marks, setMarks] = useState<ReadonlySet<string>>(() => new Set(props.bookmarked));
  const [, startMark] = useTransition();
  const toggleMark = (questionId: string) => {
    const on = !marks.has(questionId);
    const next = new Set(marks);
    if (on) next.add(questionId);
    else next.delete(questionId);
    setMarks(next);
    startMark(async () => {
      const out = await props.setBookmark({ questionId, on });
      if (!out.ok) setMarks(marks);
    });
  };

  const go = (to: number | "summary") => {
    setCurrent(to);
    setChoice(null);
    setParts([]);
    setError(null);
  };
  const nextOpen = (after: number) =>
    props.questions.find((q) => q.position > after && !results.has(q.position))?.position ??
    props.questions.find((q) => !results.has(q.position) && q.position !== after)?.position;

  const send = (position: number, response: PracticeResponse) => {
    setError(null);
    startTransition(async () => {
      const out = await props.submit({ sessionId: props.sessionId, position, response });
      if (out.ok) setResults((m) => new Map(m).set(position, out.result));
      else setError(REASON[out.reason]);
    });
  };

  const reveal = (position: number) => {
    setError(null);
    startTransition(async () => {
      const out = await props.solution({ sessionId: props.sessionId, position });
      if (out.ok) setSolutions((m) => new Map(m).set(position, out.solution));
      else setError(REASON.unavailable);
    });
  };

  const correctCount = [...results.values()].filter((r) => r.correct).length;
  const q = current === "summary" ? null : props.questions.find((x) => x.position === current);
  const result = q ? results.get(q.position) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#F6E3A6] bg-[#FFF9EC] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.06em] text-[#5F6368]">Practice · {props.courseName}</p>
          <h1 className="mt-0.5 font-display text-xl font-semibold">
            {q ? `Question ${q.position} of ${total}` : "Your results"}
          </h1>
        </div>
        <nav aria-label="Questions" className="flex flex-wrap gap-1.5">
          {props.questions.map((x) => {
            const r = results.get(x.position);
            return (
              <button
                key={x.position}
                type="button"
                onClick={() => go(x.position)}
                aria-current={current === x.position ? "step" : undefined}
                aria-label={`Question ${x.position}${r ? (r.correct ? ", correct" : ", not correct") : ", not answered"}`}
                className={cn(
                  "size-8 rounded-full border text-[13px] font-semibold",
                  focus,
                  r ? (r.correct ? "border-[#1F9D55] bg-[#E6F4EC] text-[#145C38]" : "border-[#D93636] bg-[#FDECEC] text-[#9B1C1C]") : "border-border bg-white",
                  current === x.position && "ring-2 ring-foreground ring-offset-1",
                )}
              >
                {x.position}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => go("summary")}
            aria-current={current === "summary" ? "step" : undefined}
            className={cn("h-8 rounded-full border border-border bg-white px-3 text-[13px] font-semibold", focus)}
          >
            Results
          </button>
        </nav>
      </header>

      {q ? (
        <article className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-5" aria-labelledby="q-title">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <h2 id="q-title" className="mr-auto flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-[#3D4146]">
              <span className="rounded-md bg-foreground px-2 py-0.5 text-sm font-bold tabular-nums text-white">
                {questionLabel(q.ref)}
              </span>
              <span>{q.sectionTitle}</span>
            </h2>
            <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", DIFF_STYLE[q.difficulty])}>{DIFFICULTY_LABEL[q.difficulty]}</span>
            {q.marks ? <span className="rounded-full bg-secondary px-2.5 py-0.5 font-semibold">{q.marks} marks</span> : null}
            {q.content.extra ? <span className="rounded-full bg-secondary px-2.5 py-0.5 font-semibold">Extra practice</span> : null}
            <button
              type="button"
              aria-pressed={marks.has(q.questionId)}
              onClick={() => toggleMark(q.questionId)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 font-semibold",
                focus,
                marks.has(q.questionId) ? "border-[#E3A008] bg-[#FFF6DA] text-[#7A4B00]" : "border-border bg-white text-[#3D4146] hover:bg-accent",
              )}
            >
              <span aria-hidden>{marks.has(q.questionId) ? "★" : "☆"}</span>
              {marks.has(q.questionId) ? "Bookmarked" : "Bookmark"}
            </button>
          </div>

          <QuestionBlocks blocks={q.content.blocks} />

          {q.content.choices ? (
            <div role="radiogroup" aria-label="Options" className="grid gap-2 sm:grid-cols-2">
              {q.content.choices.map((c, i) => {
                const n = i + 1;
                const pickedHere = result ? result.response && "choice" in result.response && result.response.choice === n : choice === n;
                const isRight = result?.answer.kind === "choice" && result.answer.correct === n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={Boolean(pickedHere)}
                    disabled={Boolean(result) || pending}
                    onClick={() => setChoice(n)}
                    className={cn(
                      "flex min-h-12 items-start gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left text-base",
                      focus,
                      result
                        ? isRight
                          ? "border-[#1F9D55] bg-[#E6F4EC]"
                          : pickedHere
                            ? "border-[#D93636] bg-[#FDECEC]"
                            : "border-border bg-white opacity-70"
                        : pickedHere
                          ? "border-foreground bg-[#FFF6DA]"
                          : "border-border bg-white hover:bg-[#FFFDF6]",
                    )}
                  >
                    <span className="font-semibold tabular-nums">({n})</span>
                    <span className="flex flex-col">
                      <span>
                        <RichText value={c} />
                      </span>
                      {result && pickedHere && !isRight && result.whyNot[String(n)] ? (
                        <span className="mt-1 text-[13px] text-[#9B1C1C]">{result.whyNot[String(n)]}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : q.content.self_check ? (
            !result && !solutions.has(q.position) ? (
              <p className="rounded-xl bg-[#EEF4FB] px-4 py-3 text-sm text-[#1D4E89]">
                {q.content.self_check === "draw"
                  ? "Draw or write your answer on paper, then compare it with the worked solution."
                  : "Work it out on paper, then compare your answer with the worked solution."}
              </p>
            ) : null
          ) : (
            <div className="flex flex-col gap-2.5">
              {q.content.parts.map((label, i) => {
                const given = result?.response && "parts" in result.response ? result.response.parts[i] ?? "" : undefined;
                return (
                  <label key={i} className="flex flex-wrap items-center gap-2.5">
                    <span className="min-w-20 text-sm font-semibold">{boxLabel(label)}</span>
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      maxLength={200}
                      value={given ?? parts[i] ?? ""}
                      readOnly={Boolean(result)}
                      onChange={(e) => setParts((p) => Object.assign([...p], { [i]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !result && parts.some((x) => x?.trim())) {
                          e.preventDefault();
                          send(q.position, { parts: q.content.parts.map((_, j) => parts[j] ?? "") });
                        }
                      }}
                      className={cn(
                        "h-11 min-w-0 flex-1 rounded-lg border border-input bg-white px-3 text-base",
                        focus,
                        result && (result.correct ? "border-[#1F9D55] bg-[#F3FBF6]" : "border-[#D93636] bg-[#FFF6F6]"),
                      )}
                    />
                  </label>
                );
              })}
              {q.content.hint && !result ? <p className="text-[13px] text-[#5F6368]">{q.content.hint}</p> : null}
            </div>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {!result && q.content.self_check ? (
            solutions.has(q.position) ? (
              <section aria-live="polite" className="flex flex-col gap-3">
                <SolutionPanel display={solutions.get(q.position)?.display ?? null} steps={solutions.get(q.position)?.steps ?? []} />
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-sm font-semibold">How did you do?</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => send(q.position, { self: true })}
                    className={cn("min-h-11 rounded-full bg-[#1F8A50] px-5 text-sm font-bold text-white disabled:opacity-50", focus)}
                  >
                    I got it right
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => send(q.position, { self: false })}
                    className={cn("min-h-11 rounded-full border border-border bg-white px-5 text-sm font-semibold hover:bg-accent", focus)}
                  >
                    I got it wrong
                  </button>
                </div>
              </section>
            ) : (
              <div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => reveal(q.position)}
                  className={cn("min-h-11 rounded-full bg-brand px-6 text-sm font-bold hover:bg-brand-strong disabled:opacity-50", focus)}
                >
                  {pending ? "Loading…" : "Check with the worked solution"}
                </button>
              </div>
            )
          ) : !result ? (
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={pending || (q.content.choices ? choice === null : !parts.some((x) => x?.trim()))}
                onClick={() =>
                  send(q.position, q.content.choices ? { choice: choice ?? 0 } : { parts: q.content.parts.map((_, j) => parts[j] ?? "") })
                }
                className={cn("min-h-11 rounded-full bg-brand px-6 text-sm font-bold hover:bg-brand-strong disabled:opacity-50", focus)}
              >
                {pending ? "Checking…" : "Check answer"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => send(q.position, { gave_up: true })}
                className={cn("min-h-11 rounded-full border border-border bg-white px-5 text-sm font-semibold hover:bg-accent", focus)}
              >
                Show the answer
              </button>
            </div>
          ) : (
            <section aria-live="polite" className="flex flex-col gap-3">
              <p
                className={cn(
                  "rounded-xl px-4 py-3 text-sm font-semibold",
                  result.correct ? "bg-[#E6F4EC] text-[#145C38]" : "bg-[#FDECEC] text-[#9B1C1C]",
                )}
              >
                {result.answer.kind === "self" && !result.gaveUp
                  ? result.correct
                    ? "Marked as right. Well done."
                    : "Marked as wrong. Try it again later."
                  : result.correct
                    ? "Correct! Well done."
                    : result.gaveUp
                      ? "Here's how to solve it."
                      : "Not quite. Here's how to solve it."}
              </p>
              <SolutionPanel display={result.display} steps={result.steps} strategy={q.strategy} />
              <div>
                {nextOpen(q.position) ? (
                  <button
                    type="button"
                    onClick={() => go(nextOpen(q.position) as number)}
                    className={cn("min-h-11 rounded-full bg-foreground px-6 text-sm font-bold text-white", focus)}
                  >
                    Next question ›
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => go("summary")}
                    className={cn("min-h-11 rounded-full bg-foreground px-6 text-sm font-bold text-white", focus)}
                  >
                    See my results ›
                  </button>
                )}
              </div>
            </section>
          )}
        </article>
      ) : (
        <section className="flex flex-col items-center gap-3 rounded-[14px] border border-border bg-card px-5 py-8 text-center" aria-live="polite">
          <p className="font-display text-[40px] font-semibold leading-none">
            {correctCount}/{total}
          </p>
          <p className="text-sm text-[#3D4146]">
            {results.size < total
              ? `You've answered ${results.size} of ${total}. Pick a number above to carry on.`
              : correctCount === total
                ? "Full marks. Excellent work!"
                : "Look back at the ones you missed, then try another set."}
          </p>
          <Link href={props.setupHref} className={cn("mt-1 min-h-11 rounded-full bg-brand px-6 py-3 text-sm font-bold hover:bg-brand-strong", focus)}>
            Practise again
          </Link>
        </section>
      )}
    </div>
  );
}

function SolutionPanel({ display, steps, strategy }: { display: PracticeResult["display"]; steps: PracticeResult["steps"]; strategy?: string | null }) {
  return (
    <div className="rounded-xl bg-[#F7F7F5] px-4 py-3">
      {display && display.length > 0 ? (
        <p className="mb-2 text-[15px] font-semibold">
          Answer: <RichText value={display} />
        </p>
      ) : null}
      <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-[.05em] text-[#5F6368]">Worked solution</p>
      {strategy ? (
        <p className="mb-1.5 text-sm">
          Strategy: <strong>{strategy}</strong>
        </p>
      ) : null}
      <WorkedSteps steps={steps} />
    </div>
  );
}
