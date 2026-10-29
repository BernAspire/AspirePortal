import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { singaporeDate } from "@/lib/time";

import { enrolmentRow, programmeCourseRow, programmeRow } from "./schema";
import { activeEntitlements, type ActiveEntitlement } from "./service";

/**
 * Programmes the student can use today, read with the user's session so RLS
 * applies (students see their own enrolments; guardians their children's).
 */
export const getActiveEntitlements = cache(async (
  centreId: string,
  studentId: string,
): Promise<ActiveEntitlement[]> => {
  const today = singaporeDate();
  const supabase = await createClient();

  const { data: enrolmentData, error: enrolmentError } = await supabase
    .from("programme_enrolments")
    .select("id, programme_id, valid_from, valid_until")
    .eq("centre_id", centreId)
    .eq("student_id", studentId)
    .lte("valid_from", today)
    .gte("valid_until", today);
  if (enrolmentError) throw new Error("Could not load programme enrolments.");
  const enrolments = z.array(enrolmentRow).parse(enrolmentData);
  if (enrolments.length === 0) return [];

  const programmeIds = [...new Set(enrolments.map((e) => e.programmeId))];
  const [programmesResult, coursesResult] = await Promise.all([
    supabase
      .from("programmes")
      .select("id, name, kind, status")
      .eq("centre_id", centreId)
      .in("id", programmeIds),
    supabase
      .from("programme_courses")
      .select("programme_id, course_id")
      .eq("centre_id", centreId)
      .in("programme_id", programmeIds),
  ]);
  if (programmesResult.error) throw new Error("Could not load programmes.");
  if (coursesResult.error) throw new Error("Could not load programme courses.");

  return activeEntitlements(
    enrolments,
    z.array(programmeRow).parse(programmesResult.data),
    z.array(programmeCourseRow).parse(coursesResult.data),
    today,
  );
});
