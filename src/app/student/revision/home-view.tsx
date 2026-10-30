import Link from "next/link";

import { formatDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { startPractice } from "@/modules/practice";
import { accuracyOf, daysUntil, nextExam, todaysTasks, upcomingReviews, weakTopics, weekStats } from "@/modules/revision";

import { EmptyState } from "../_components/class-ui";
import { REVISION_PATH } from "../_components/nav-config";

import { PractiseTopicButton } from "./revision-client";
import { subjectOf, type RevisionContext } from "./revision-data";
import { focus, panel, RevisionHeader, RevisionNav, Stars } from "./revision-ui";

const REASON = {
  overdue: { label: "Overdue", cls: "bg-[#FFF1D6] text-[#7A4B00]" },
  due_today: { label: "Due today", cls: "bg-[#E5EEFB] text-[#1D4E89]" },
  weak: { label: "Weak topic", cls: "bg-[#FDECEC] text-[#9B1C1C]" },
} as const;

export function RevisionHomeView({ ctx }: { ctx: RevisionContext }) {
  const r = ctx.revision;
  if (!r) return <EmptyState title="No revision yet">Your student record isn&apos;t set up. Please contact {ctx.centreName}.</EmptyState>;

  const tasks = todaysTasks(r.sections, r.today);
  const upcoming = upcomingReviews(r.sections, r.today);
  const weak = weakTopics(r.sections, "accuracy");
  const week = weekStats(r);
  const exam = nextExam(r.exams);
  const subjects = [...new Set([...ctx.courseNames.values()].map(subjectOf))];
  const course = (id: string) => ctx.courseNames.get(id) ?? "";

  return (
    <div className="flex flex-col gap-[18px]">
      <RevisionNav active="home" />
      <RevisionHeader eyebrow={subjects.length ? subjects.join(" · ").toUpperCase() : "SMART REVISION"} title="Smart Revision Centre">
        <div className="text-right">
          <div className="font-bold">
            {weak.length} weak topic{weak.length === 1 ? "" : "s"}
          </div>
          <div className="text-[13px] text-[#3D4146]">
            {tasks.length} task{tasks.length === 1 ? "" : "s"} today
          </div>
        </div>
      </RevisionHeader>

      {r.sections.length === 0 ? (
        <EmptyState title="Nothing to revise yet">Practice questions for your courses will appear here once your centre adds them.</EmptyState>
      ) : (
        <div className="flex flex-wrap items-start gap-[18px]">
          <div className="flex min-w-0 flex-[999_1_440px] flex-col gap-[18px]">
            <section aria-labelledby="today" className={cn(panel, "flex flex-col gap-3 px-5 py-[18px]")}>
              <h2 id="today" className="font-display text-[17px] font-semibold">
                Today&apos;s revision tasks{" "}
                <span className="rounded-full bg-[#FDEBB8] px-2 py-0.5 font-sans text-xs">{tasks.length}</span>
              </h2>
              {tasks.length === 0 ? (
                <p className="border-t border-[#F3EEE2] pt-3 text-sm text-muted-foreground">
                  You&apos;re up to date. Practise a topic to schedule its next review.
                </p>
              ) : (
                <ul>
                  {tasks.map((t) => (
                    <li key={t.section.sectionId} className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#F3EEE2] py-2.5">
                      <div className="flex min-w-0 flex-[1_1_220px] items-center gap-3">
                        <span aria-hidden className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-full bg-[#FFF6DA] text-[#8A5A00]">
                          ↻
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{t.section.title}</span>
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", REASON[t.reason].cls)}>{REASON[t.reason].label}</span>
                          </div>
                          <div className="text-[13px] text-[#5F6368]">
                            {subjectOf(course(t.section.courseId))} · {t.accuracy === null ? "not tried yet" : `${t.accuracy}%`}
                            {t.section.lastReviewedAt ? ` · last reviewed ${formatDateOnly(t.section.lastReviewedAt.slice(0, 10))}` : ""}
                          </div>
                        </div>
                      </div>
                      <PractiseTopicButton courseId={t.section.courseId} sectionId={t.section.sectionId} label="Revise now" start={startPractice} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="spaced" className={cn(panel, "flex flex-col gap-2.5 px-5 py-[18px]")}>
              <h2 id="spaced" className="font-display text-[17px] font-semibold">
                Upcoming spaced reviews
              </h2>
              {upcoming.length === 0 ? (
                <p className="border-t border-[#F3EEE2] pt-2 text-sm text-muted-foreground">No reviews scheduled yet.</p>
              ) : (
                <ul>
                  {upcoming.map((u) => (
                    <li key={u.sectionId} className="flex justify-between gap-2.5 border-t border-[#F3EEE2] py-2 text-sm">
                      <span className="min-w-0">
                        <strong>{u.title}</strong> · <span className="text-[#5F6368]">{subjectOf(course(u.courseId))}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap">{formatDateOnly(u.dueOn as string)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-[#5F6368]">Topics come back at growing intervals after each good review, and sooner after a weak one.</p>
            </section>
          </div>

          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
            <section aria-labelledby="wk" className={cn(panel, "flex flex-col gap-2 px-[18px] py-4 text-sm")}>
              <h2 id="wk" className="text-xs font-semibold tracking-[.08em] text-[#5F6368]">
                THIS WEEK
              </h2>
              <div className="flex justify-between">
                <span>Topics revised</span>
                <strong className="text-[#146C3E]">{week.topicsRevised}</strong>
              </div>
              <div className="flex justify-between">
                <span>Weak topics resolved</span>
                <strong className="text-[#8A5A00]">{week.weakResolved}</strong>
              </div>
              <div className="flex justify-between">
                <span>Revision streak</span>
                <strong className="text-[#B42318]">
                  {week.streak} day{week.streak === 1 ? "" : "s"}
                </strong>
              </div>
            </section>

            <section aria-labelledby="weak" className={cn(panel, "flex flex-col gap-2.5 px-[18px] py-4")}>
              <div className="flex items-center justify-between">
                <h2 id="weak" className="font-display text-[17px] font-semibold">
                  Weak topics
                </h2>
                <Link href={`${REVISION_PATH}/weak-topics`} className={cn("text-[13px] font-semibold text-[#8A5A00]", focus)}>
                  See all ›
                </Link>
              </div>
              {weak.length === 0 ? (
                <p className="text-sm text-muted-foreground">None right now. Keep practising!</p>
              ) : (
                weak.slice(0, 4).map((w) => (
                  <div key={w.sectionId} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{w.title}</div>
                      <div className="text-xs font-semibold text-[#B42318]">
                        {accuracyOf(w) === null ? "—" : `${accuracyOf(w)}%`} <Stars value={w.confidence} />
                      </div>
                    </div>
                    <Link
                      href={`${REVISION_PATH}/weak-topics`}
                      className={cn("inline-flex min-h-9 items-center rounded-full bg-[#FFF1D6] px-3.5 text-[13px] font-semibold text-[#7A4B00]", focus)}
                    >
                      Revise
                    </Link>
                  </div>
                ))
              )}
            </section>

            <section
              aria-labelledby="exam"
              className={cn(
                "flex flex-col gap-2 rounded-2xl border px-[18px] py-4",
                exam?.active ? "border-[#CDEBD7] bg-[#EEF8F1]" : "border-[#F4CFCB] bg-[#FDF0EF]",
              )}
            >
              <p className="text-xs font-bold tracking-[.06em] text-[#9B1C1C]">
                {exam ? `${exam.name.toUpperCase()} IN ${daysUntil(r.today, exam.examOn)} DAYS` : "NO EXAM DATE YET"}
              </p>
              <h2 id="exam" className="font-display text-[17px] font-semibold">
                Before-exam mode
              </h2>
              <p className="text-[13px] leading-snug text-[#3D4146]">Halves your revision intervals so you see weak topics more often before your exam.</p>
              <Link
                href={`${REVISION_PATH}/exam`}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-full text-sm font-bold text-white",
                  focus,
                  exam?.active ? "bg-[#1F8A50]" : "bg-[#B4483F]",
                )}
              >
                {exam?.active ? "On · open plan" : exam ? "Activate now" : "Add your exam"}
              </Link>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
