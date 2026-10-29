import { z } from "zod";

export const SESSION_KINDS = ["physical_tutorial", "live_tutorial", "academic_coaching"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Columns students may read. `meeting_url` is not one of them (see session_join_url). */
export const SESSION_COLUMNS =
  "id, class_id, code, course_id, kind, branch_id, room_id, teacher_name, starts_at, ends_at, status, cancel_reason";
export const CLASS_COLUMNS =
  "id, code, course_id, kind, branch_id, room_id, teacher_name, weekday, start_time, duration_minutes, first_date, last_date, status";

export const sessionRow = z
  .object({
    id: z.uuid(),
    class_id: z.uuid().nullable(),
    code: z.string().nullable(),
    course_id: z.uuid(),
    kind: z.enum(SESSION_KINDS),
    branch_id: z.uuid().nullable(),
    room_id: z.uuid().nullable(),
    teacher_name: z.string(),
    starts_at: z.string(),
    ends_at: z.string(),
    status: z.enum(["scheduled", "cancelled"]),
    cancel_reason: z.string().nullable(),
  })
  .transform((r) => ({
    id: r.id,
    classId: r.class_id,
    courseId: r.course_id,
    kind: r.kind,
    branchId: r.branch_id,
    roomId: r.room_id,
    teacherName: r.teacher_name,
    startsAt: new Date(r.starts_at).toISOString(),
    endsAt: new Date(r.ends_at).toISOString(),
    cancelled: r.status === "cancelled",
    cancelReason: r.cancel_reason,
  }));
export type Session = z.infer<typeof sessionRow>;

export const classRow = z
  .object({
    id: z.uuid(),
    code: z.string(),
    course_id: z.uuid(),
    kind: z.enum(SESSION_KINDS),
    branch_id: z.uuid().nullable(),
    room_id: z.uuid().nullable(),
    teacher_name: z.string(),
    weekday: z.number().int().min(1).max(7),
    start_time: z.string().regex(/^\d{2}:\d{2}/),
    duration_minutes: z.number().int().positive(),
    first_date: z.string(),
    last_date: z.string(),
    status: z.enum(["active", "suspended", "archived"]),
  })
  .transform((r) => ({
    id: r.id,
    code: r.code,
    courseId: r.course_id,
    kind: r.kind,
    branchId: r.branch_id,
    roomId: r.room_id,
    teacherName: r.teacher_name,
    weekday: r.weekday,
    startTime: r.start_time.slice(0, 5),
    durationMinutes: r.duration_minutes,
    firstDate: r.first_date,
    lastDate: r.last_date,
    active: r.status === "active",
  }));
export type ClassTemplate = z.infer<typeof classRow>;

export const enrolmentRow = z
  .object({
    class_id: z.uuid(),
    from_date: z.string(),
    until_date: z.string().nullable(),
  })
  .transform((r) => ({
    classId: r.class_id,
    fromDate: r.from_date,
    untilDate: r.until_date,
  }));
export type ClassEnrolment = z.infer<typeof enrolmentRow>;

export const bookingRow = z
  .object({ id: z.uuid(), session_id: z.uuid() })
  .transform((r) => ({ id: r.id, sessionId: r.session_id }));

export const attendanceRow = z
  .object({
    booking_id: z.uuid(),
    status: z.enum(ATTENDANCE_STATUSES),
    note: z.string().nullable(),
  })
  .transform((r) => ({
    bookingId: r.booking_id,
    status: r.status,
    note: r.note,
  }));

export const namedRow = z.object({ id: z.uuid(), name: z.string() });

/** A session the student is booked into, with names resolved and attendance attached. */
export interface BookedSession extends Session {
  readonly courseName: string;
  readonly branchName: string | null;
  readonly roomName: string | null;
  readonly attendance: AttendanceStatus | null;
}

export const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const sessionIdParam = z.uuid();
