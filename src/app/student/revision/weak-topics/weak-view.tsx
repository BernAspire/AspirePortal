import Link from "next/link";

import { formatDateOnly } from "@/lib/time";
import { cn } from "@/lib/utils";
import { startPractice } from "@/modules/practice";
import { accuracyOf, setConfidence, weaknessOf, weakTopics, type SortKey } from "@/modules/revision";

import { EmptyState } from "../../_components/class-ui";
import { REVISION_PATH } from "../../_components/nav-config";

const PATH = `${REVISION_PATH}/weak-topics`;
import { ConfidenceStars, PractiseTopicButton } from "../revision-client";
import { subjectOf, type RevisionContext } from "../revision-data";
import { focus, panel, RevisionHeader, RevisionNav, WEAKNESS_TAG } from "../revision-ui";

const SORTS: readonly { id: SortKey; label: string }[] = [
  { id: "confidence", label: "Confidence" },
  { id: "accuracy", label: "Accuracy" },
  { id: "recent", label: "Recent" },
];

function href(subject: string | null, sort: SortKey, all: boolean): string {
  const q = new URLSearchParams();
  if (subject) q.set("subject", subject);
  if (sort !== "confidence") q.set("sort", sort);
  if (all) q.set("show", "all");
  const s = q.toString();
  return s ? `${PATH}?${s}` : PATH;
}

function accuracyTone(a: number | null): string {
  if (a === null) return "text-[#5F6368]";
  if (a < 50) return "text-[#B42318]";
  if (a < 70) return "text-[#8A5A00]";
  return "text-[#146C3E]";
}

export function WeakTopicsView({ ctx, params }: { ctx: RevisionContext; params: Record<string, string | string[] | undefined> }) {
  const r = ctx.revision;
  if (!r) return <EmptyState title="No revision yet">Your student record isn&apos;t set up. Please contact {ctx.centreName}.</EmptyState>;

  const sort: SortKey = params.sort === "accuracy" || params.sort === "recent" ? params.sort : "confidence";
  const all = params.show === "all";
  const subjectOfSection = (courseId: string) => subjectOf(ctx.courseNames.get(courseId) ?? "");
  const subjects = [...new Set(r.sections.map((s) => subjectOfSection(s.courseId)))].sort();
  const subject = typeof params.subject === "string" && subjects.includes(params.subject) ? params.subject : null;
  const inSubject = r.sections.filter((s) => !subject || subjectOfSection(s.courseId) === subject);
  const list = all
    ? [...weakTopics(inSubject, sort), ...inSubject.filter((s) => weaknessOf(s) === null && s.tried > 0)]
    : weakTopics(inSubject, sort);

  return (
    <div className="flex flex-col gap-[18px]">
      <RevisionNav active="weak" />
      <RevisionHeader title="Weak Topics" />
      <section className={cn(panel, "flex flex-col")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5">
          <nav aria-label="Subjects" className="flex gap-5">
            {[null, ...subjects].map((s) => (
              <Link
                key={s ?? "all"}
                href={href(s, sort, all)}
                aria-current={s === subject ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center border-b-2 text-[15px]",
                  focus,
                  s === subject ? "border-brand font-semibold" : "border-transparent text-[#3D4146] hover:text-foreground",
                )}
              >
                {s ?? "All"}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 py-2 text-[13px]">
            <span className="text-[#5F6368]">Sort:</span>
            {SORTS.map((o) => (
              <Link
                key={o.id}
                href={href(subject, o.id, all)}
                aria-current={o.id === sort ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-8 items-center rounded-full px-3 font-semibold",
                  focus,
                  o.id === sort ? "bg-[#FDEBB8] text-[#7A4B00]" : "text-[#3D4146] hover:bg-secondary",
                )}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {list.length === 0 ? (
            <p className="py-8 text-center text-[15px] text-muted-foreground">
              No weak topics{subject ? ` in ${subject}` : ""} right now. Topics show up here after a few wrong answers, or if you rate your
              confidence low.
            </p>
          ) : (
            list.map((s) => {
              const acc = accuracyOf(s);
              const weakness = weaknessOf(s);
              return (
                <article key={s.sectionId} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border px-4 py-3.5">
                  <div className="flex min-w-0 flex-col gap-1">
                    <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold">
                      {s.title}
                      {weakness ? <span className={cn("rounded-full px-2 py-0.5 font-sans text-xs font-semibold", WEAKNESS_TAG[weakness].cls)}>{WEAKNESS_TAG[weakness].label}</span> : null}
                    </h2>
                    <p className="text-sm text-[#3D4146]">
                      {subjectOfSection(s.courseId)} · {s.topic}
                      {s.lastAttemptedAt ? ` · Last attempted ${formatDateOnly(s.lastAttemptedAt.slice(0, 10))}` : ""}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
                      <span>
                        <span className="tracking-[.04em] text-[#5F6368]">ACCURACY: </span>
                        <strong className={accuracyTone(acc)}>{acc === null ? "—" : `${acc}%`}</strong>
                        {s.tried ? <span className="text-[#5F6368]"> · last {s.tried}</span> : null}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="tracking-[.04em] text-[#5F6368]">CONFIDENCE:</span>
                        <ConfidenceStars sectionId={s.sectionId} value={s.confidence} save={setConfidence} label={s.title} />
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <PractiseTopicButton courseId={s.courseId} sectionId={s.sectionId} start={startPractice} />
                    <Link
                      href={`${REVISION_PATH}/bookmarks?section=${s.sectionId}`}
                      className={cn(
                        "inline-flex min-h-[38px] items-center rounded-full border border-[#F4CFCB] bg-[#FDF0EF] px-4 text-[13px] font-semibold text-[#9B1C1C] hover:bg-[#FBE3E1]",
                        focus,
                      )}
                    >
                      Bookmarks{s.bookmarksUnresolved ? ` (${s.bookmarksUnresolved})` : ""}
                    </Link>
                  </div>
                </article>
              );
            })
          )}
          <Link href={href(subject, sort, !all)} className={cn("self-center text-[13px] font-semibold text-[#8A5A00]", focus)}>
            {all ? "Show weak topics only" : "Show all topics you've practised"}
          </Link>
        </div>
      </section>
    </div>
  );
}
