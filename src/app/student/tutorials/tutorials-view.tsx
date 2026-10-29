import Link from "next/link";

import { formatSingapore } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ATTENDANCE_LABEL, JOIN_OPENS_MINUTES, joinState, timeRange, type BookedSession } from "@/modules/scheduling";

import { ATTENDANCE_STYLE, Card, ClassesHeader, EmptyState } from "../_components/class-ui";
import { TUTORIALS_PATH } from "../_components/nav-config";

function JoinButton({ session, now }: { session: BookedSession; now: Date }) {
  const state = joinState(session, now);
  if (state === "open") {
    return (
      <Link
        href={`${TUTORIALS_PATH}/${session.id}/join`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-foreground outline-none hover:bg-brand-strong focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Join now
        <span className="sr-only"> (opens in a new tab)</span>
      </Link>
    );
  }
  const opens = new Date(new Date(session.startsAt).getTime() - JOIN_OPENS_MINUTES * 60_000);
  return (
    <span className="inline-flex min-h-10 items-center rounded-full border border-border bg-secondary px-4 text-[13px] text-[#3D4146]">
      {state === "cancelled" ? "Cancelled" : `Join opens ${formatSingapore(opens, "h:mm aaa")}`}
    </span>
  );
}

/** Live tutorials: upcoming ones with a Join button, recent ones with attendance. Presentational only. */
export function TutorialsView({ all, now, centreName }: { all: readonly BookedSession[]; now: Date; centreName: string }) {
  const live = all.filter((s) => s.kind === "live_tutorial");
  const upcoming = live.filter((s) => new Date(s.endsAt) >= now).slice(0, 8);
  const past = live
    .filter((s) => new Date(s.endsAt) < now && !s.cancelled)
    .reverse()
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <ClassesHeader eyebrow="CLASSES" title="Live Tutorials" />

      {live.length === 0 ? (
        <EmptyState title="No live tutorials yet">
          Online tutorials from {centreName} will appear here. You can join from this page when one is about to start.
        </EmptyState>
      ) : null}

      {upcoming.length > 0 ? (
        <Card aria-labelledby="upcoming" className="flex flex-col gap-3 px-5 py-4">
          <h2 id="upcoming" className="font-display text-base font-semibold">
            Coming up
          </h2>
          <ul className="flex flex-col gap-2.5">
            {upcoming.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-xl px-3.5 py-3",
                  s.cancelled ? "bg-[#EEEEEC]" : "bg-[#DCE8FB]",
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className={cn("text-sm font-semibold", s.cancelled && "line-through")}>{s.courseName}</span>
                  <span className="text-[13px] text-[#3D4146]">
                    {formatSingapore(s.startsAt, "EEE d MMM")}, {timeRange(s.startsAt, s.endsAt)} · {s.teacherName}
                  </span>
                  {s.cancelled && s.cancelReason ? <span className="text-xs text-[#3D4146]">{s.cancelReason}</span> : null}
                </span>
                <JoinButton session={s} now={now} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            The Join button appears {JOIN_OPENS_MINUTES} minutes before each tutorial while your programme is active.
          </p>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <Card aria-labelledby="past" className="flex flex-col gap-2.5 px-5 py-4">
          <h2 id="past" className="font-display text-base font-semibold">
            Recent tutorials
          </h2>
          <ul className="divide-y divide-border">
            {past.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{s.courseName}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {formatSingapore(s.startsAt, "EEE d MMM, h:mm aaa")} · {s.teacherName}
                  </span>
                </span>
                <span
                  className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", ATTENDANCE_STYLE[s.attendance ?? "unmarked"])}
                >
                  {s.attendance ? ATTENDANCE_LABEL[s.attendance] : "Not marked yet"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
