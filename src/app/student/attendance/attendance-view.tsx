import { formatSingapore } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ATTENDANCE_LABEL, attendanceSummary, KIND_LABEL, type BookedSession } from "@/modules/scheduling";

import { ATTENDANCE_STYLE, Card, ClassesHeader, EmptyState } from "../_components/class-ui";

/** Attendance rate and history. Presentational only. */
export function AttendanceView({ sessions, now }: { sessions: readonly BookedSession[]; now: Date }) {
  const summary = attendanceSummary(sessions, now);
  const history = sessions
    .filter((s) => !s.cancelled)
    .reverse()
    .slice(0, 50);

  return (
    <div className="flex flex-col gap-4">
      <ClassesHeader eyebrow="CLASSES" title="Attendance" />

      {history.length === 0 ? (
        <EmptyState title="No attendance yet">Your attendance will appear here after your first class.</EmptyState>
      ) : (
        <>
          <Card aria-label="Summary" className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
            <div className="col-span-2 flex flex-col justify-center rounded-xl bg-[#EEF8F1] px-4 py-3 sm:col-span-1">
              <span className="font-display text-[28px] font-semibold leading-none text-[#145C38]">
                {summary.ratePercent === null ? "—" : `${summary.ratePercent}%`}
              </span>
              <span className="mt-1 text-xs text-[#146C3E]">attendance rate</span>
            </div>
            {(["present", "late", "absent", "excused"] as const).map((k) => (
              <div key={k} className={cn("flex flex-col justify-center rounded-xl px-4 py-3", ATTENDANCE_STYLE[k])}>
                <span className="text-xl font-semibold leading-none">{summary.counts[k]}</span>
                <span className="mt-1 text-xs">{ATTENDANCE_LABEL[k]}</span>
              </div>
            ))}
          </Card>
          <p className="-mt-1 text-xs text-muted-foreground">
            The rate counts present and late out of marked sessions; excused absences don&apos;t lower it.
            {summary.unmarked > 0
              ? ` ${summary.unmarked} session${summary.unmarked === 1 ? " is" : "s are"} not marked yet.`
              : ""}
          </p>

          <Card aria-labelledby="history" className="flex flex-col gap-1 px-5 py-4">
            <h2 id="history" className="font-display text-base font-semibold">
              Sessions
            </h2>
            <ul className="divide-y divide-border">
              {history.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">
                      {s.courseName} · {KIND_LABEL[s.kind]}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      {formatSingapore(s.startsAt, "EEE d MMM yyyy, h:mm aaa")} · {s.teacherName}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      ATTENDANCE_STYLE[s.attendance ?? "unmarked"],
                    )}
                  >
                    {s.attendance ? ATTENDANCE_LABEL[s.attendance] : "Not marked yet"}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
