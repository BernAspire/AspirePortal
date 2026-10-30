"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import type { StartPracticeState } from "@/modules/practice/schema";
import type { RevisionActionResult } from "@/modules/revision/schema";

const focus = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Starts a 5-question practice on one sub-topic (posts to the Practice module's action). */
export function PractiseTopicButton({
  courseId,
  sectionId,
  label = "Practice",
  count = 5,
  start,
  variant = "primary",
}: {
  courseId: string;
  sectionId: string | null;
  label?: string;
  count?: 5 | 10 | 15;
  start: (prev: StartPracticeState, formData: FormData) => Promise<StartPracticeState>;
  variant?: "primary" | "dark";
}) {
  const [state, action, pending] = useActionState(start, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="mode" value={sectionId ? "manual" : "adaptive"} />
      {sectionId ? <input type="hidden" name="sectionId" value={sectionId} /> : null}
      <input type="hidden" name="difficulty" value="mixed" />
      <input type="hidden" name="count" value={count} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "inline-flex min-h-[38px] items-center justify-center rounded-full px-5 text-[13px] font-bold disabled:opacity-60",
          focus,
          variant === "dark" ? "w-full bg-brand text-foreground" : "bg-brand hover:bg-brand-strong",
        )}
      >
        {pending ? "Starting…" : label}
      </button>
      {state.error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** The student's own 1–5 star confidence rating, saved as they tap. */
export function ConfidenceStars({
  sectionId,
  value,
  save,
  label,
}: {
  sectionId: string;
  value: number | null;
  save: (input: unknown) => Promise<RevisionActionResult>;
  label: string;
}) {
  const [current, setCurrent] = useOptimistic(value);
  const [, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <span role="radiogroup" aria-label={`Your confidence in ${label}`} className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() =>
            startTransition(async () => {
              const next = current === n ? null : n;
              setCurrent(next);
              const out = await save({ sectionId, confidence: next });
              setFailed(!out.ok);
            })
          }
          className={cn("size-7 rounded text-base leading-none", focus, current !== null && n <= current ? "text-[#E3A008]" : "text-[#C9CED4] hover:text-[#E3A008]")}
        >
          {current !== null && n <= current ? "★" : "☆"}
        </button>
      ))}
      {failed ? <span className="ml-1 text-xs text-destructive">Not saved</span> : null}
    </span>
  );
}

/** Starts a practice set from bookmarks. */
export function PractiseBookmarksButton({
  courseId,
  sectionId,
  label,
  start,
}: {
  courseId: string;
  sectionId: string | null;
  label: string;
  start: (prev: RevisionActionResult, formData: FormData) => Promise<RevisionActionResult>;
}) {
  const [state, action, pending] = useActionState(start, { ok: true } as RevisionActionResult);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="courseId" value={courseId} />
      {sectionId ? <input type="hidden" name="sectionId" value={sectionId} /> : null}
      <button
        type="submit"
        disabled={pending}
        className={cn("inline-flex min-h-[38px] items-center rounded-full border border-[#F4CFCB] bg-[#FDF0EF] px-4 text-[13px] font-semibold text-[#9B1C1C] hover:bg-[#FBE3E1] disabled:opacity-60", focus)}
      >
        {pending ? "Starting…" : label}
      </button>
      {!state.ok ? (
        <p role="alert" className="max-w-56 text-right text-xs text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** A button that runs an action once and reports failure inline. */
export function ActionButton({
  run,
  label,
  pendingLabel,
  className,
}: {
  run: () => Promise<RevisionActionResult>;
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const out = await run();
            setError(out.ok ? null : out.error);
          })
        }
        className={cn("disabled:opacity-60", focus, className)}
      >
        {pending ? pendingLabel : label}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** The student adds their own exam date. */
export function AddExamForm({
  courses,
  add,
  minDate,
}: {
  courses: readonly { id: string; name: string }[];
  add: (prev: RevisionActionResult, formData: FormData) => Promise<RevisionActionResult>;
  minDate: string;
}) {
  const [state, action, pending] = useActionState(add, { ok: true } as RevisionActionResult);
  const field = cn("h-11 rounded-lg border border-input bg-white px-3 text-sm", focus);
  return (
    <form action={action} className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <label className="grid gap-1 text-[13px] font-semibold">
        Subject
        <select name="courseId" required className={field} defaultValue={courses[0]?.id}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[13px] font-semibold">
        Exam
        <input name="name" required maxLength={80} placeholder="e.g. SA2 or School WA3" className={field} />
      </label>
      <label className="grid gap-1 text-[13px] font-semibold">
        Date
        <input name="examOn" type="date" required min={minDate} className={field} />
      </label>
      <button type="submit" disabled={pending} className={cn("min-h-11 rounded-full bg-foreground px-5 text-sm font-bold text-white disabled:opacity-60", focus)}>
        {pending ? "Adding…" : "Add exam"}
      </button>
      {!state.ok ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
