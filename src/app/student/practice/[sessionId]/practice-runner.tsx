"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import type { PracticeResponse, PracticeResult, SubmitAnswerResult } from "@/modules/practice/schema";
import { DIFFICULTY_LABEL, QuestionBlocks, WorkedSteps, type Difficulty, type QuestionContent } from "@/modules/question-bank/ui";

export interface RunnerQuestion {
  readonly position: number;
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
  const [pending, startTransition] = useTransition();

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
              <span className="rounded-md bg-foreground px-2 py-0.5 text-sm font-bold tabular-nums text-white">Q{q.ref}</span>
              <span>{q.sectionTitle}</span>
            </h2>
            <span className={cn("rounded-full px-2.5 py-0.5 font-semibold", DIFF_STYLE[q.difficulty])}>{DIFFICULTY_LABEL[q.difficulty]}</span>
            {q.marks ? <span className="rounded-full bg-secondary px-2.5 py-0.5 font-semibold">{q.marks} marks</span> : null}
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
                      <span>{c}</span>
                      {result && pickedHere && !isRight && result.whyNot[String(n)] ? (
                        <span className="mt-1 text-[13px] text-[#9B1C1C]">{result.whyNot[String(n)]}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {q.content.parts.map((label, i) => {
                const given = result?.response && "parts" in result.response ? result.response.parts[i] ?? "" : undefined;
                return (
                  <label key={i} className="flex flex-wrap items-center gap-2.5">
                    <span className="min-w-20 text-sm font-semibold">{label ? `(${label}) Answer` : "Answer"}</span>
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
            </div>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {!result ? (
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
                {result.correct ? "Correct! Well done." : result.gaveUp ? "Here's how to solve it." : "Not quite. Here's how to solve it."}
                {result.display ? <span className="ml-1 font-normal text-foreground">Answer: {result.display}</span> : null}
              </p>
              <div className="rounded-xl bg-[#F7F7F5] px-4 py-3">
                <p className="mb-1.5 text-[13px] font-semibold uppercase tracking-[.05em] text-[#5F6368]">Worked solution</p>
                {q.strategy ? (
                  <p className="mb-1.5 text-sm">
                    Strategy: <strong>{q.strategy}</strong>
                  </p>
                ) : null}
                <WorkedSteps steps={result.steps} />
              </div>
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
