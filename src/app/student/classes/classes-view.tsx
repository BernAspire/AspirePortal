import Link from "next/link";

import { formatDateOnly, formatSingapore, singaporeDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  classScheduleLine,
  KIND_LABEL,
  sessionTitle,
  sessionWhere,
  timeRange,
  type BookedSession,
  type MyClass,
} from "@/modules/scheduling";

import { Card, ClassesHeader, EmptyState, KIND_STYLE } from "../_components/class-ui";
import { CALENDAR_PATH } from "../_components/nav-config";

/** My Classes: the student's weekly classes and other upcoming sessions. Presentational only. */
export function MyClassesView({
  classes,
  upcoming,
  now,
  centreName,
}: {
  classes: readonly MyClass[];
  upcoming: readonly BookedSession[];
  now: Date;
  centreName: string;
}) {
  const nextByClass = new Map<string, (typeof upcoming)[number]>();
  for (const s of upcoming) if (s.classId && !nextByClass.has(s.classId)) nextByClass.set(s.classId, s);
  const oneOffs = upcoming.filter((s) => s.classId === null).slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <ClassesHeader eyebrow="CLASSES" title="My Classes">
        <Link href={CALENDAR_PATH} className="text-sm font-semibold text-[#145C38] underline-offset-4 hover:underline">
          Open calendar
        </Link>
      </ClassesHeader>

      {classes.length === 0 && oneOffs.length === 0 ? (
        <EmptyState title="No classes yet">
          When {centreName} adds you to a class, it will appear here with its day, time and place.
        </EmptyState>
      ) : null}

      {classes.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Weekly classes">
          {classes.map((c) => {
            const next = nextByClass.get(c.id);
            const ended = c.enrolment.untilDate !== null && c.enrolment.untilDate < singaporeDate(now);
            return (
              <li key={c.id}>
                <Card className="flex h-full flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-base font-semibold">{c.courseName}</h2>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", KIND_STYLE[c.kind].chip)}>
                      {KIND_LABEL[c.kind]}
                    </span>
                  </div>
                  <p className="text-sm font-semibold">{classScheduleLine(c)}</p>
                  <p className="text-sm text-[#3D4146]">
                    {c.kind === "live_tutorial"
                      ? "Online"
                      : [c.branchName, c.roomName].filter(Boolean).join(", ") || "At the centre"}{" "}
                    · {c.teacherName}
                  </p>
                  <p className="mt-auto pt-1 text-[13px] text-muted-foreground">
                    {ended
                      ? `You left this class on ${formatDateOnly(c.enrolment.untilDate as string)}.`
                      : next
                        ? `Next: ${formatSingapore(next.startsAt, "EEE d MMM, h:mm aaa")}${next.cancelled ? " (cancelled)" : ""}`
                        : `Runs until ${formatDateOnly(c.lastDate)}. No more sessions scheduled.`}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}

      {oneOffs.length > 0 ? (
        <Card aria-labelledby="one-offs" className="flex flex-col gap-2.5 px-5 py-4">
          <h2 id="one-offs" className="font-display text-base font-semibold">
            Other upcoming sessions
          </h2>
          <ul className="flex flex-col gap-2">
            {oneOffs.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5",
                  KIND_STYLE[s.cancelled ? "cancelled" : s.kind].chip,
                )}
              >
                <span className="min-w-36 text-sm font-semibold">
                  {formatSingapore(s.startsAt, "EEE d MMM")}, {timeRange(s.startsAt, s.endsAt)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("text-sm font-semibold", s.cancelled && "line-through")}>{sessionTitle(s)}</span>
                  <span className="text-xs text-[#3D4146]">{s.cancelled ? "Cancelled by the centre" : sessionWhere(s)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
