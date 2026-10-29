import Link from "next/link";
import type { ReactNode } from "react";

import { formatDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { PROGRAMME_KIND_LABELS } from "@/modules/programmes";

import type { HomeCourse, HomeProgramme } from "../home-model";

export interface HomeViewProps {
  readonly greeting: string;
  readonly displayName: string;
  readonly dateLine: string;
  readonly centreName: string;
  readonly subjects: readonly { id: string; name: string; href: string; selected: boolean }[];
  readonly currentCourseName: string | null;
  readonly courses: readonly HomeCourse[];
  readonly programmes: readonly HomeProgramme[];
  readonly branch: { name: string; address: string | null; phone: string | null; isDefault: boolean } | null;
}

/** The student home page from the Aspire Online design. Presentational only. */
export function HomeView(props: HomeViewProps) {
  const { courses, programmes } = props;
  return (
    <div className="flex flex-col gap-[18px]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">
            {props.greeting}, {props.displayName}!
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{props.dateLine}</p>
        </div>
      </header>

      {props.subjects.length > 1 ? (
        <nav aria-label="Subjects" className="flex flex-wrap gap-2 border-b border-border">
          {props.subjects.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              aria-current={s.selected ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center border-b-2 px-3 text-[15px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                s.selected ? "border-brand font-semibold text-foreground" : "border-transparent text-[#3D4146] hover:text-foreground",
              )}
            >
              {s.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {props.currentCourseName ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] border border-info-line bg-info-soft px-3.5 py-2.5">
          <span className="text-[13px] font-semibold tracking-[.04em] text-info">
            CURRENT COURSE:{" "}
            <span className="rounded-full bg-info-line px-2.5 py-0.5 tracking-normal">{props.currentCourseName}</span>
          </span>
        </div>
      ) : null}

      {courses.length === 0 ? (
        <Card className="p-5">
          <h2 className="text-base font-semibold">No active programmes</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You don&apos;t have access to any courses right now. If you think this is wrong, please contact{" "}
            {props.centreName}.
          </p>
        </Card>
      ) : (
        <>
          <SectionTitle>Daily Drop</SectionTitle>
          <ComingSoon
            tone="success"
            icon={<BoltIcon />}
            title="3 questions a day"
            text="A short daily set for your current course. Arrives with practice questions."
          />

          <SectionTitle>Continue learning</SectionTitle>
          <ComingSoon
            tone="brand"
            title="Lessons and notes"
            text="Your centre's lessons, notes and videos for each course will appear here."
          />

          <SectionTitle>Practice</SectionTitle>
          <ComingSoon title="Practice sessions" text="Adaptive practice on your weak topics, with your scores over time." />

          <SectionTitle>My courses</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2">
            {courses.map((course) => (
              <li key={course.courseId}>
                <Card className="flex h-full flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold">{course.courseName}</h3>
                    {course.isCurrent ? (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold">Current</span>
                    ) : null}
                  </div>
                  <p className="text-[13px] text-muted-foreground">Access until {formatDateOnly(course.accessUntil)}</p>
                  <ul className="flex flex-wrap gap-1.5 text-xs text-[#3D4146]">
                    {course.programmes.map((p) => (
                      <li key={`${p.name}-${p.kind}`} className="rounded-full bg-secondary px-2.5 py-0.5">
                        {PROGRAMME_KIND_LABELS[p.kind]}
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ComingSoon compact title="Next class" text="Your next session and where it is." />
        <ComingSoon compact title="Homework due" text="Worksheets and tasks from your teachers." />
      </div>

      {programmes.length > 0 ? (
        <>
          <SectionTitle>My programmes</SectionTitle>
          <ul className="grid gap-2">
            {programmes.map((p) => (
              <li key={`${p.name}-${p.validUntil}`}>
                <Card className="flex items-center justify-between gap-2.5 px-4 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.renewSoon ? "Expires" : "Valid until"} {formatDateOnly(p.validUntil)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs",
                      p.renewSoon ? "bg-[#FFF1D6] font-semibold text-[#7A4B00]" : "bg-secondary text-[#3D4146]",
                    )}
                  >
                    {p.renewSoon ? "Renew soon" : PROGRAMME_KIND_LABELS[p.kind]}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <ComingSoon compact title="Badges" text="Streaks, levels and badges you earn." />
        <Card className="px-[18px] py-4">
          <SectionTitle as="h2">My branch</SectionTitle>
          {props.branch ? (
            <>
              <p className="mt-2 text-sm">
                <strong>{props.branch.name}</strong>
                {props.branch.isDefault ? " · Default" : null}
              </p>
              {props.branch.address || props.branch.phone ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[props.branch.address, props.branch.phone].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No branch set yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-[14px] border border-border bg-card", className)}>{children}</section>;
}

function SectionTitle({ children, as = "h2" }: { children: ReactNode; as?: "h2" | "h3" }) {
  const Tag = as;
  return (
    <Tag className="m-0 font-sans text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">{children}</Tag>
  );
}

const TONES = {
  neutral: "border-border bg-card",
  brand: "border-[#F6E3A6] bg-brand-wash",
  success: "border-success-line bg-success-soft",
} as const;

function ComingSoon({
  title,
  text,
  tone = "neutral",
  icon,
  compact = false,
}: {
  title: string;
  text: string;
  tone?: keyof typeof TONES;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={cn("flex items-center justify-between gap-3 rounded-[14px] border", TONES[tone], compact ? "px-[18px] py-4" : "p-[18px]")}>
      <div className="flex min-w-0 items-center gap-3.5">
        {icon ? (
          <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1F9D55] text-white">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          {compact ? (
            <h2 className="font-sans text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">{title}</h2>
          ) : (
            <h3 className="text-base font-semibold">{title}</h3>
          )}
          <p className={cn("text-[13px] text-[#3D4146]", compact && "mt-2")}>{text}</p>
        </div>
      </div>
      <span className="shrink-0 rounded-full border border-dashed border-[#DCD5C3] bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        Coming soon
      </span>
    </section>
  );
}

function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
    </svg>
  );
}
