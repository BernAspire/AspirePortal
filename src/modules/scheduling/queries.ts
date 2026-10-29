import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getCourses } from "@/modules/academics";

import {
  attendanceRow,
  bookingRow,
  CLASS_COLUMNS,
  classRow,
  enrolmentRow,
  namedRow,
  SESSION_COLUMNS,
  sessionIdParam,
  sessionRow,
  type BookedSession,
  type ClassEnrolment,
  type ClassTemplate,
  type Session,
} from "./schema";

/*
 * Reads use the student's own session, so RLS returns only sessions they are booked
 * into, in their own centre. Columns are listed explicitly: meeting links are not
 * readable as columns (session_join_url hands them out).
 */

async function names(table: "branches" | "rooms", ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).select("id, name").in("id", wanted);
  if (error) throw new Error(`Could not load ${table}.`);
  return new Map(
    z
      .array(namedRow)
      .parse(data)
      .map((r) => [r.id, r.name]),
  );
}

async function withNames(
  sessions: readonly Session[],
  attendance: Map<string, BookedSession["attendance"]>,
): Promise<BookedSession[]> {
  const [courses, branches, rooms] = await Promise.all([
    getCourses([...new Set(sessions.map((s) => s.courseId))]),
    names(
      "branches",
      sessions.map((s) => s.branchId),
    ),
    names(
      "rooms",
      sessions.map((s) => s.roomId),
    ),
  ]);
  const courseNames = new Map(courses.map((c) => [c.id, c.name]));
  return sessions.map((s) => ({
    ...s,
    courseName: courseNames.get(s.courseId) ?? "Class",
    branchName: s.branchId ? (branches.get(s.branchId) ?? null) : null,
    roomName: s.roomId ? (rooms.get(s.roomId) ?? null) : null,
    attendance: attendance.get(s.id) ?? null,
  }));
}

/**
 * The student's booked sessions between two instants (or all, when no range is given),
 * in time order, with course/branch/room names and attendance.
 */
export const getBookedSessions = cache(
  async (centreId: string, studentId: string, from?: string, to?: string): Promise<BookedSession[]> => {
    const supabase = await createClient();
    const { data: bookingData, error: bookingError } = await supabase
      .from("bookings")
      .select("id, session_id")
      .eq("centre_id", centreId)
      .eq("student_id", studentId);
    if (bookingError) throw new Error("Could not load your bookings.");
    const bookings = z.array(bookingRow).parse(bookingData);
    if (bookings.length === 0) return [];

    let query = supabase.from("class_sessions").select(SESSION_COLUMNS).eq("centre_id", centreId).order("starts_at");
    if (from) query = query.gte("starts_at", from);
    if (to) query = query.lt("starts_at", to);
    const [{ data: sessionData, error: sessionError }, { data: attendanceData, error: attendanceError }] = await Promise.all([
      query,
      supabase.from("attendance_records").select("booking_id, status, note").eq("centre_id", centreId),
    ]);
    if (sessionError || attendanceError) throw new Error("Could not load your timetable.");

    const bookedSessionIds = new Map(bookings.map((b) => [b.sessionId, b.id]));
    const bookingAttendance = new Map(
      z
        .array(attendanceRow)
        .parse(attendanceData)
        .map((a) => [a.bookingId, a.status]),
    );
    const sessions = z
      .array(sessionRow)
      .parse(sessionData)
      .filter((s) => bookedSessionIds.has(s.id));
    const attendance = new Map(
      sessions.map((s) => [s.id, bookingAttendance.get(bookedSessionIds.get(s.id) ?? "") ?? null] as const),
    );
    return withNames(sessions, attendance);
  },
);

export interface MyClass extends ClassTemplate {
  readonly courseName: string;
  readonly branchName: string | null;
  readonly roomName: string | null;
  readonly enrolment: ClassEnrolment;
}

/** The weekly classes the student is on the roster of. */
export const getMyClasses = cache(async (centreId: string, studentId: string): Promise<MyClass[]> => {
  const supabase = await createClient();
  const { data: enrolmentData, error: enrolmentError } = await supabase
    .from("class_enrolments")
    .select("class_id, from_date, until_date")
    .eq("centre_id", centreId)
    .eq("student_id", studentId);
  if (enrolmentError) throw new Error("Could not load your classes.");
  const enrolments = z.array(enrolmentRow).parse(enrolmentData);
  if (enrolments.length === 0) return [];

  const { data: classData, error: classError } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("centre_id", centreId)
    .in(
      "id",
      enrolments.map((e) => e.classId),
    );
  if (classError) throw new Error("Could not load your classes.");
  const classes = z.array(classRow).parse(classData);

  const [courses, branches, rooms] = await Promise.all([
    getCourses([...new Set(classes.map((c) => c.courseId))]),
    names(
      "branches",
      classes.map((c) => c.branchId),
    ),
    names(
      "rooms",
      classes.map((c) => c.roomId),
    ),
  ]);
  const courseNames = new Map(courses.map((c) => [c.id, c.name]));
  const byClass = new Map(enrolments.map((e) => [e.classId, e]));
  return classes
    .map((c) => ({
      ...c,
      courseName: courseNames.get(c.courseId) ?? "Class",
      branchName: c.branchId ? (branches.get(c.branchId) ?? null) : null,
      roomName: c.roomId ? (rooms.get(c.roomId) ?? null) : null,
      enrolment: byClass.get(c.id) as ClassEnrolment,
    }))
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
});

/**
 * The live-tutorial link, if the database says the student may join now (booked,
 * programme active today, from 15 minutes before the start until the end).
 */
export async function getJoinUrl(sessionId: string): Promise<string | null> {
  if (!sessionIdParam.safeParse(sessionId).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("session_join_url", {
    p_session: sessionId,
  });
  if (error) throw new Error("Could not open the tutorial link.");
  const url = z.string().nullable().parse(data);
  return url && /^https:\/\/\S+$/.test(url) ? url : null;
}

/** One booked session by id (RLS: only the student's own). */
export async function getBookedSession(centreId: string, studentId: string, sessionId: string): Promise<BookedSession | null> {
  if (!sessionIdParam.safeParse(sessionId).success) return null;
  const all = await getBookedSessions(centreId, studentId);
  return all.find((s) => s.id === sessionId) ?? null;
}
