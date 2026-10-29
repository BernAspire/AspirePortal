import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import type { Course, StudentCourse, Subject } from "./service";

const courseRow = z
  .object({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(["active", "suspended", "archived"]),
    subject_id: z.uuid(),
  })
  .transform((r) => ({ id: r.id, name: r.name, status: r.status, subjectId: r.subject_id }));

const subjectRow = z.object({ id: z.uuid(), code: z.string(), name: z.string(), sort: z.number().int() });

const levelRow = z.object({ id: z.uuid(), name: z.string() });

const studentCourseRow = z.object({ course_id: z.uuid(), is_current: z.boolean() });

/** Courses by id. Platform courses (no centre) and the user's centre courses are visible. */
export async function getCourses(courseIds: readonly string[]): Promise<Course[]> {
  if (courseIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, status, subject_id")
    .in("id", [...courseIds]);
  if (error) throw new Error("Could not load courses.");
  return z.array(courseRow).parse(data);
}

/** Subjects by id, in catalogue order. */
export async function getSubjects(subjectIds: readonly string[]): Promise<Subject[]> {
  if (subjectIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subjects")
    .select("id, code, name, sort")
    .in("id", [...subjectIds]);
  if (error) throw new Error("Could not load subjects.");
  return z
    .array(subjectRow)
    .parse(data)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "en-SG"));
}

export async function getLevelName(levelId: string | null): Promise<string | null> {
  if (!levelId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("levels")
    .select("id, name")
    .eq("id", levelId)
    .maybeSingle();
  if (error) throw new Error("Could not load level.");
  return data ? levelRow.parse(data).name : null;
}

/** The courses a student is placed in, and which one is current. */
export async function getStudentCourses(
  centreId: string,
  studentId: string,
): Promise<StudentCourse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_courses")
    .select("course_id, is_current")
    .eq("centre_id", centreId)
    .eq("student_id", studentId);
  if (error) throw new Error("Could not load your courses.");
  return z
    .array(studentCourseRow)
    .parse(data)
    .map((r) => ({ courseId: r.course_id, isCurrent: r.is_current }));
}
