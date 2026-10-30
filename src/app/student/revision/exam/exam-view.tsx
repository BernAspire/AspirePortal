
import { formatDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { startPractice } from "@/modules/practice";
import { addMyExam, daysUntil, examPlan, removeMyExam, setExamMode } from "@/modules/revision";

import { EmptyState } from "../../_components/class-ui";
import { ActionButton, AddExamForm, PractiseTopicButton } from "../revision-client";
import { subjectOf, type RevisionContext } from "../revision-data";
import { panel, RevisionHeader, RevisionNav, Stars, WEAKNESS_TAG } from "../revision-ui";

export function ExamView({ ctx }: { ctx: RevisionContext }) {
  const r = ctx.revision;
  if (!r) return <EmptyState title="No revision yet">Your student record isn&apos;t set up. Please contact {ctx.centreName}.</EmptyState>;
  const course = (id: string) => ctx.courseNames.get(id) ?? "";
  const active = r.exams.find((e) => e.active) ?? null;
  const courses = [...new Set(r.sections.map((s) => s.courseId))].map((id) => ({ id, name: course(id) }));

  return (
    <div className="flex flex-col gap-[18px]">
      <RevisionNav active="exam" />

      {active ? (
        <ActivePlan />
      ) : (
        <RevisionHeader title="Before-Exam Mode">
          <p className="max-w-sm text-sm text-[#3D4146]">Choose an exam to count down to. Weak topics then come back twice as often.</p>
        </RevisionHeader>
      )}

      <section aria-labelledby="exams" className={cn(panel, "flex flex-col gap-3 px-5 py-[18px]")}>
        <h2 id="exams" className="font-display text-[17px] font-semibold">
          Upcoming exams
        </h2>
        {r.exams.length === 0 ? (
          <p className="text-sm text-muted-foreground">No exam dates yet. Add your school exam below.</p>
        ) : (
          <ul className="divide-y divide-border">
            {r.exams.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="flex flex-col">
                  <span className="font-semibold">
                    {e.name} · {subjectOf(course(e.courseId))}
                  </span>
                  <span className="text-[13px] text-[#5F6368]">
                    {formatDateOnly(e.examOn)} · in {daysUntil(r.today, e.examOn)} days · {e.own ? "added by you" : `from ${ctx.centreName}`}
                  </span>
                </span>
                <span className="flex flex-wrap items-start gap-2">
                  {e.active ? (
                    <ActionButton
                      run={setExamMode.bind(null, { courseId: e.courseId, examId: null })}
                      label="Turn off"
                      pendingLabel="Turning off…"
                      className="min-h-[38px] rounded-full border border-border bg-white px-4 text-[13px] font-semibold"
                    />
                  ) : (
                    <ActionButton
                      run={setExamMode.bind(null, { courseId: e.courseId, examId: e.id })}
                      label="Activate"
                      pendingLabel="Activating…"
                      className="min-h-[38px] rounded-full bg-[#B4483F] px-4 text-[13px] font-bold text-white"
                    />
                  )}
                  {e.own ? (
                    <ActionButton
                      run={removeMyExam.bind(null, e.id)}
                      label="Remove"
                      pendingLabel="Removing…"
                      className="min-h-[38px] rounded-full px-3 text-[13px] font-semibold text-[#9B1C1C] underline-offset-4 hover:underline"
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {courses.length > 0 ? (
          <div className="border-t border-border pt-3">
            <h3 className="mb-2 text-sm font-semibold">Add your own exam</h3>
            <AddExamForm courses={courses} add={addMyExam} minDate={r.today} />
          </div>
        ) : null}
      </section>
    </div>
  );

  function ActivePlan() {
    if (!r || !active) return null;
    const plan = examPlan(r, active);
    const pct = Math.min(100, Math.round((plan.revisedToday / plan.dailyTarget) * 100));
    const ring = 2 * Math.PI * 34;
    return (
      <>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#F4CFCB] bg-[#FDF0EF] px-6 py-5">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
            <p className="text-xs font-bold tracking-[.06em] text-[#9B1C1C]">BEFORE-EXAM MODE ACTIVE</p>
            <h1 className="font-display text-[28px] font-bold leading-tight">
              {plan.daysLeft === 0 ? "Exam day: " : `${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} until `}
              {active.name} {subjectOf(course(active.courseId))}
            </h1>
            <p className="text-sm text-[#3D4146]">
              Revise <strong>{plan.dailyTarget} topic{plan.dailyTarget === 1 ? "" : "s"} per day</strong> to cover all weak topics before your exam.
            </p>
            <div className="mt-2 flex justify-between text-sm">
              <span>
                Today:{" "}
                <strong>
                  {plan.revisedToday}/{plan.dailyTarget} topics revised
                </strong>
              </span>
              <span className="font-semibold">{pct}%</span>
            </div>
            <span role="progressbar" aria-label="Today's revision" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="block h-2 rounded-full bg-[#F7D9D6]">
              <span className="block h-full rounded-full bg-[#B4483F]" style={{ width: `${pct}%` }} />
            </span>
          </div>
          <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${plan.daysLeft} days left`}>
            <circle cx="42" cy="42" r="34" fill="#fff" stroke="#F4CFCB" strokeWidth="6" />
            <circle cx="42" cy="42" r="34" fill="none" stroke="#B4483F" strokeWidth="6" strokeDasharray={`${ring * Math.min(1, plan.daysLeft / 30)} ${ring}`} transform="rotate(-90 42 42)" />
            <text x="42" y="46" textAnchor="middle" fontSize="22" fontWeight="700" fill="#9B1C1C">
              {plan.daysLeft}
            </text>
            <text x="42" y="60" textAnchor="middle" fontSize="9" fill="#5F6368">
              DAYS
            </text>
          </svg>
        </section>

        <div className="flex flex-wrap items-start gap-[18px]">
          <section aria-labelledby="prio" className={cn(panel, "flex min-w-0 flex-[999_1_440px] flex-col")}>
            <h2 id="prio" className="border-b border-border px-5 py-4 font-display text-[17px] font-semibold">
              Prioritised Revision Topics
            </h2>
            {plan.priorities.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No weak topics in this subject. Try exam practice to keep sharp.</p>
            ) : (
              <ul>
                {plan.priorities.map((p) => (
                  <li key={p.section.sectionId} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0">
                    <span className={cn("flex min-w-0 flex-col gap-1 border-l-4 pl-3", p.weakness === "critical" ? "border-[#D93636]" : "border-brand")}>
                      <span className="flex flex-wrap items-center gap-2 font-semibold">
                        {p.section.title}
                        {p.weakness ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", WEAKNESS_TAG[p.weakness].cls)}>{WEAKNESS_TAG[p.weakness].label}</span> : null}
                      </span>
                      <span className="text-[13px] text-[#5F6368]">
                        {p.section.topic} · <strong className="text-[#B42318]">{p.accuracy === null ? "—" : `${p.accuracy}%`}</strong> <Stars value={p.section.confidence} />
                      </span>
                    </span>
                    <PractiseTopicButton courseId={p.section.courseId} sectionId={p.section.sectionId} label="Revise" start={startPractice} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="xp" className="flex min-w-0 flex-[1_1_260px] flex-col gap-2 rounded-2xl bg-[#2B3138] px-5 py-[18px] text-white">
            <p className="text-xs font-bold tracking-[.06em] text-brand">EXAM PRACTICE</p>
            <h2 id="xp" className="font-display text-[17px] font-semibold">
              Practice exam-style questions
            </h2>
            <p className="text-[13px] leading-snug text-[#C9CED4]">15 mixed questions across this subject, weakest topics first, with worked solutions.</p>
            <PractiseTopicButton courseId={active.courseId} sectionId={null} label="Start exam practice" count={15} start={startPractice} variant="dark" />
          </section>
        </div>
      </>
    );
  }
}
