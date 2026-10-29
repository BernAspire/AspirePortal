import { formatSingapore, singaporeDate } from "@/lib/time";

import type { AttendanceStatus, BookedSession, ClassTemplate, SessionKind } from "./schema";

/** Pure scheduling rules for the student portal: calendars, labels, join window, attendance. */

export const KIND_LABEL: Record<SessionKind, string> = {
  physical_tutorial: "Physical tutorial",
  live_tutorial: "Live tutorial",
  academic_coaching: "Academic coaching",
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

/** Students can open a live tutorial's link from this long before it starts (matches session_join_url). */
export const JOIN_OPENS_MINUTES = 15;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAY_PLURAL = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

/** "YYYY-MM" of the Singapore month containing `now`. */
export function currentMonth(now: Date = new Date()): string {
  return singaporeDate(now).slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** The month view: Monday-first weeks, `null` for padding cells. */
export function monthGrid(month: string): {
  title: string;
  prev: string;
  next: string;
  days: (string | null)[];
} {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstIsoDow = ((new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7) + 1; // 1 = Monday
  const days: (string | null)[] = Array.from({ length: firstIsoDow - 1 }, () => null);
  for (let d = 1; d <= daysInMonth; d++) days.push(`${month}-${String(d).padStart(2, "0")}`);
  while (days.length % 7 !== 0) days.push(null);
  return {
    title: `${MONTH_NAMES[m - 1]} ${y}`,
    prev: shiftMonth(month, -1),
    next: shiftMonth(month, 1),
    days,
  };
}

/** UTC instants bounding a Singapore month (Singapore has no daylight saving: always +08:00). */
export function monthBounds(month: string): { from: string; to: string } {
  return {
    from: new Date(`${month}-01T00:00:00+08:00`).toISOString(),
    to: new Date(`${shiftMonth(month, 1)}-01T00:00:00+08:00`).toISOString(),
  };
}

/** "9:00 am" from a Postgres time "09:00". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function timeRange(startsAt: string, endsAt: string): string {
  return `${formatSingapore(startsAt, "h:mm aaa")} – ${formatSingapore(endsAt, "h:mm aaa")}`;
}

export function sessionDay(s: Pick<BookedSession, "startsAt">): string {
  return singaporeDate(s.startsAt);
}

export function sessionTitle(s: Pick<BookedSession, "courseName" | "kind">): string {
  return `${s.courseName} · ${KIND_LABEL[s.kind]}`;
}

/** "Bishan, Room 2 · Ms Lim", "Online · Mr Ong". */
export function sessionWhere(s: Pick<BookedSession, "kind" | "branchName" | "roomName" | "teacherName">): string {
  const place = s.kind === "live_tutorial" ? "Online" : [s.branchName, s.roomName].filter(Boolean).join(", ") || "At the centre";
  return `${place} · ${s.teacherName}`;
}

export type JoinState = "open" | "upcoming" | "ended" | "cancelled";

export function joinState(s: Pick<BookedSession, "startsAt" | "endsAt" | "cancelled">, now: Date = new Date()): JoinState {
  if (s.cancelled) return "cancelled";
  const t = now.getTime();
  if (t > new Date(s.endsAt).getTime()) return "ended";
  if (t >= new Date(s.startsAt).getTime() - JOIN_OPENS_MINUTES * 60_000) return "open";
  return "upcoming";
}

/** "Saturdays · 9:00 am – 11:00 am". */
export function classScheduleLine(c: Pick<ClassTemplate, "weekday" | "startTime" | "durationMinutes">): string {
  const [h, m] = c.startTime.split(":").map(Number) as [number, number];
  const end = h * 60 + m + c.durationMinutes;
  const endClock = `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  return `${WEEKDAY_PLURAL[c.weekday - 1]} · ${formatClock(c.startTime)} – ${formatClock(endClock)}`;
}

export interface AttendanceSummary {
  readonly counts: Record<AttendanceStatus, number>;
  readonly marked: number;
  readonly unmarked: number;
  /** Present or late, out of sessions marked; null before anything is marked. */
  readonly ratePercent: number | null;
}

/** Attendance over sessions that have started and were not cancelled. */
export function attendanceSummary(sessions: readonly BookedSession[], now: Date = new Date()): AttendanceSummary {
  const counts: Record<AttendanceStatus, number> = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
  };
  let unmarked = 0;
  for (const s of sessions) {
    if (s.cancelled || new Date(s.startsAt).getTime() > now.getTime()) continue;
    if (s.attendance) counts[s.attendance] += 1;
    else unmarked += 1;
  }
  const marked = counts.present + counts.late + counts.absent + counts.excused;
  // Excused absences don't count against the rate.
  const counted = marked - counts.excused;
  return {
    counts,
    marked,
    unmarked,
    ratePercent: counted > 0 ? Math.round(((counts.present + counts.late) / counted) * 100) : null,
  };
}
