import Link from "next/link";

import { cn } from "@/lib/utils";

export interface ProgressTopic {
  readonly id: string;
  readonly title: string;
  readonly tried: number;
  readonly accuracy: number | null;
}

export interface ProgressViewProps {
  readonly courseName: string | null;
  readonly courses: readonly { id: string; name: string; href: string; selected: boolean }[];
  readonly lessons: { readonly percent: number; readonly done: number; readonly total: number };
  readonly practice: { readonly accuracy: number | null; readonly answered: number };
  readonly attendance: { readonly rate: number | null; readonly marked: number };
  readonly level: { readonly level: number; readonly name: string; readonly streak: number };
  /** Weakest first. */
  readonly topics: readonly ProgressTopic[];
  readonly learnHref: string;
  readonly practiceHref: string;
  readonly rewardsHref: string;
  readonly centreName: string;
}

const focus = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] border border-border bg-card px-4 py-3.5">
      <span className="text-xs text-[#5F6368]">{label}</span>
      <span className={cn("font-display text-2xl font-bold", tone)}>{value}</span>
      <span className="text-xs text-[#5F6368]">{sub}</span>
    </div>
  );
}

function barColour(accuracy: number | null): string {
  if (accuracy === null) return "bg-[#DCD5C3]";
  if (accuracy < 50) return "bg-[#D93636]";
  if (accuracy < 80) return "bg-brand";
  return "bg-[#1F9D55]";
}

/** Progress: lessons, practice accuracy by topic, attendance and level, per course. Presentational only. */
export function ProgressView(p: ProgressViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-[14px] border border-[#F6E3A6] bg-brand-wash px-[22px] py-[18px]">
        <p className="text-xs font-semibold tracking-[.06em] text-[#7A4B00]">PROGRESS</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold">{p.courseName ?? "Your progress"}</h1>
      </header>

      {p.courses.length > 1 ? (
        <nav aria-label="Courses" className="flex flex-wrap gap-2">
          {p.courses.map((c) => (
            <Link
              key={c.id}
              href={c.href}
              aria-current={c.selected ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold",
                focus,
                c.selected ? "border-foreground bg-foreground text-white" : "border-[#E8D9A8] bg-white hover:bg-accent",
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Lessons"
          value={p.courseName ? `${p.lessons.percent}%` : "—"}
          sub={p.courseName ? `${p.lessons.done} of ${p.lessons.total} lessons done` : "No course yet"}
          tone="text-[#8A5A00]"
        />
        <Stat
          label="Practice accuracy"
          value={p.practice.accuracy === null ? "—" : `${p.practice.accuracy}%`}
          sub={`${p.practice.answered} question${p.practice.answered === 1 ? "" : "s"} answered`}
          tone="text-[#145C38]"
        />
        <Stat
          label="Attendance"
          value={p.attendance.rate === null ? "—" : `${p.attendance.rate}%`}
          sub={p.attendance.marked ? `${p.attendance.marked} sessions marked` : "Nothing marked yet"}
          tone="text-[#1F3F7A]"
        />
        <Link href={p.rewardsHref} className={cn("rounded-[14px]", focus)}>
          <Stat
            label="Level"
            value={`L${p.level.level}`}
            sub={`${p.level.name}${p.level.streak ? ` · ${p.level.streak}-day streak` : ""}`}
            tone="text-[#5B2A86]"
          />
        </Link>
      </div>

      <section aria-labelledby="topics" className="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="topics" className="font-display text-base font-semibold">
            Practice by topic
          </h2>
          <span className="text-xs text-muted-foreground">Weakest first</span>
        </div>
        {p.topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {p.courseName ? "No practice questions for this course yet." : `Ask ${p.centreName} about a programme to start.`}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {p.topics.map((t) => (
              <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="truncate text-sm font-semibold">{t.title}</span>
                <span className="text-sm tabular-nums">
                  {t.accuracy === null ? "Not tried" : `${t.accuracy}%`}
                  <span className="ml-1 text-xs text-muted-foreground">{t.tried ? `· ${t.tried} tried` : ""}</span>
                </span>
                <span
                  role="progressbar"
                  aria-label={`${t.title} accuracy`}
                  aria-valuenow={t.accuracy ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="col-span-2 block h-2 rounded-full bg-[#F1F2F4]"
                >
                  <span className={cn("block h-full rounded-full", barColour(t.accuracy))} style={{ width: `${t.accuracy ?? 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {p.courseName ? (
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Link href={p.practiceHref} className={cn("inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-bold hover:bg-brand-strong", focus)}>
              Practise weak topics
            </Link>
            <Link href={p.learnHref} className={cn("inline-flex min-h-11 items-center rounded-full border border-border bg-white px-5 text-sm font-semibold hover:bg-accent", focus)}>
              Continue lessons
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
