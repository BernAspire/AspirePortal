import type { Metadata } from "next";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { formatSingapore, singaporeDate } from "@/lib/time";
import { getMyStudent } from "@/modules/crm";
import {
  currentMonth,
  getBookedSessions,
  KIND_LABEL,
  monthBounds,
  monthGrid,
  monthParam,
  sessionDay,
  sessionTitle,
  sessionWhere,
  type BookedSession,
} from "@/modules/scheduling";

import { CALENDAR_PATH } from "../_components/nav-config";
import { ClassesSkeleton } from "../_components/class-ui";

import { CalendarView, type CalendarEvent } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage({ searchParams }: PageProps<"/student/calendar">) {
  return (
    <Suspense fallback={<ClassesSkeleton label="your calendar" />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

/** "Mathematics 9:00am": the course without its level, for the small calendar chips. */
function shortLabel(s: BookedSession): string {
  const subject = s.courseName.replace(/^(Primary|Secondary)\s+\d+\s+|^JC\s*\d\s+/i, "");
  return `${s.cancelled ? `${KIND_LABEL[s.kind]} (cancelled)` : subject} ${s.cancelled ? "" : formatSingapore(s.startsAt, "h:mmaaa").replace(":00", "")}`.trim();
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/student/calendar">["searchParams"] }) {
  const { centre } = await requirePortal("student", CALENDAR_PATH);
  const params = await searchParams;
  const now = new Date();
  const requested = monthParam.safeParse(params.month);
  const month = requested.success ? requested.data : currentMonth(now);
  const today = singaporeDate(now);

  const student = await getMyStudent(centre.centreId);
  const { from, to } = monthBounds(month);
  const sessions = student ? await getBookedSessions(centre.centreId, student.id, from, to) : [];

  const events: Record<string, CalendarEvent[]> = {};
  for (const s of sessions) {
    (events[sessionDay(s)] ??= []).push({
      id: s.id,
      time: formatSingapore(s.startsAt, "h:mm aaa"),
      short: shortLabel(s),
      title: sessionTitle(s),
      where: sessionWhere(s),
      style: s.cancelled ? "cancelled" : s.kind,
      note: s.cancelled ? `Cancelled by the centre${s.cancelReason ? ` · ${s.cancelReason}` : ""}` : null,
    });
  }

  const grid = monthGrid(month);
  const firstWithEvents = grid.days.find((d) => d && events[d]);
  return (
    <CalendarView
      key={month}
      title={grid.title}
      prevHref={`${CALENDAR_PATH}?month=${grid.prev}`}
      nextHref={`${CALENDAR_PATH}?month=${grid.next}`}
      days={grid.days}
      today={today}
      events={events}
      initialDay={today.startsWith(month) ? today : (firstWithEvents ?? `${month}-01`)}
    />
  );
}
