import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LessonStatus } from "@/modules/elearning";

export interface LearnLessonItem {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  readonly status: LessonStatus;
  readonly partsLine: string;
  readonly href: string;
}

export interface LearnViewProps {
  readonly courseName: string | null;
  readonly courses: readonly { id: string; name: string; href: string; selected: boolean }[];
  readonly progress: { percent: number; lessonsDone: number; lessons: number };
  readonly lessons: readonly LearnLessonItem[];
  readonly centreName: string;
}

const STATUS = {
  completed: { label: "Completed", tag: "bg-[#E6F4EC] text-[#145C38]", dot: "bg-[#1F9D55] text-white", cta: "Review", primary: false },
  in_progress: { label: "In progress", tag: "bg-[#FFF1D6] text-[#7A4B00]", dot: "bg-brand text-foreground", cta: "Continue", primary: true },
  not_started: { label: "Not started", tag: "bg-secondary text-[#3D4146]", dot: "bg-secondary text-[#3D4146]", cta: "Start", primary: false },
} as const;

/** The Learn page from the Aspire Online design. Presentational only. */
export function LearnView(props: LearnViewProps) {
  if (!props.courseName) {
    return (
      <section className="rounded-[14px] border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">No courses yet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You don&apos;t have an active programme with lessons. If you think this is wrong, please contact {props.centreName}.
        </p>
      </section>
    );
  }

  const { percent, lessonsDone, lessons } = props.progress;
  return (
    <div className="flex flex-col gap-[18px]">
      <section className="flex flex-col gap-3 rounded-[14px] border border-[#F6E3A6] bg-brand-wash p-5">
        <h1 className="text-2xl font-semibold">{props.courseName}</h1>
        {props.courses.length > 1 ? (
          <nav aria-label="Courses" className="flex flex-wrap gap-2">
            {props.courses.map((c) => (
              <Link
                key={c.id}
                href={c.href}
                aria-current={c.selected ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  c.selected ? "border-foreground bg-foreground text-white" : "border-[#E8D9A8] bg-white hover:bg-accent",
                )}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span>Overall</span>
          <span
            role="progressbar"
            aria-label="Course progress"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 rounded-full bg-[#F3DFA0]"
          >
            <span className="block h-full rounded-full bg-[#1F9D55]" style={{ width: `${percent}%` }} />
          </span>
          <span>
            <strong>{percent}%</strong> · {lessonsDone} of {lessons} lesson{lessons === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      <h2 className="font-sans text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">
        Lessons ({lessons})
      </h2>

      {props.lessons.length === 0 ? (
        <section className="rounded-[14px] border border-border bg-card p-5 text-sm text-muted-foreground">
          No lessons have been added to this course yet.
        </section>
      ) : (
        <ol className="flex flex-col gap-3">
          {props.lessons.map((l) => {
            const s = STATUS[l.status];
            return (
              <li key={l.id}>
                <article className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-[18px] py-3.5">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span
                      aria-hidden
                      className={cn("inline-flex size-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold", s.dot)}
                    >
                      {l.status === "completed" ? "✓" : l.position}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold">
                          Week {l.position}: {l.title}
                        </h3>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", s.tag)}>{s.label}</span>
                      </div>
                      <p className="text-[13px] text-muted-foreground">{l.partsLine}</p>
                    </div>
                  </div>
                  <Link
                    href={l.href}
                    className={cn(
                      "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      s.primary ? "bg-brand text-foreground hover:bg-brand-strong" : "bg-secondary text-foreground hover:bg-[#E6E7EA]",
                    )}
                  >
                    {s.cta}
                    <span className="sr-only">: Week {l.position}</span>
                  </Link>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
