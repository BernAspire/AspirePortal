// Public API of the scheduling module (classes, sessions, rosters, bookings, attendance).
// Other modules import only from here. Writes come from the timetable import job for now
// (public.apply_timetable); see ADR 0006.
export { getBookedSession, getBookedSessions, getJoinUrl, getMyClasses, type MyClass } from "./queries";
export {
  ATTENDANCE_LABEL,
  attendanceSummary,
  classScheduleLine,
  currentMonth,
  JOIN_OPENS_MINUTES,
  joinState,
  KIND_LABEL,
  monthBounds,
  monthGrid,
  sessionDay,
  sessionTitle,
  sessionWhere,
  timeRange,
  type AttendanceSummary,
  type JoinState,
} from "./service";
export { monthParam, type AttendanceStatus, type BookedSession, type SessionKind } from "./schema";
