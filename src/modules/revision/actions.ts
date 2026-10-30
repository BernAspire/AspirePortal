"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { STUDENT_HOME_PATH } from "@/lib/auth/routing";
import { requirePortal } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { singaporeDate } from "@/lib/time";
import { getMyStudent } from "@/modules/crm";

import { bookmarkInput, confidenceInput, examInput, examModeInput, type RevisionActionResult } from "./schema";

const REVISION_PATH = `${STUDENT_HOME_PATH}/revision`;
const FAILED: RevisionActionResult = { ok: false, error: "That didn't save. Please try again." };

/*
 * Revision actions write with the student's own session: RLS and the database functions
 * check that it's their own record, in their centre, for a course they're entitled to.
 * These are the student's study preferences, not personal-data edits, so they are not
 * audit-logged (ADR 0009).
 */

/** The student's own 1–5 star confidence in a sub-topic (null clears it). */
export async function setConfidence(input: unknown): Promise<RevisionActionResult> {
  const { centre } = await requirePortal("student", REVISION_PATH);
  const parsed = confidenceInput.safeParse(input);
  if (!parsed.success) return FAILED;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_topic_confidence", {
    p_centre: centre.centreId,
    p_section: parsed.data.sectionId,
    p_confidence: parsed.data.confidence,
  });
  if (error) return FAILED;
  revalidatePath(REVISION_PATH, "layout");
  return { ok: true };
}

/** Bookmark a question to review later, or remove the bookmark. */
export async function setBookmark(input: unknown): Promise<RevisionActionResult> {
  const { centre } = await requirePortal("student", REVISION_PATH);
  const parsed = bookmarkInput.safeParse(input);
  if (!parsed.success) return FAILED;
  const student = await getMyStudent(centre.centreId);
  if (!student) return FAILED;
  const supabase = await createClient();
  const { error } = parsed.data.on
    ? await supabase
        .from("question_bookmarks")
        .upsert(
          { centre_id: centre.centreId, student_id: student.id, question_id: parsed.data.questionId },
          { onConflict: "centre_id,student_id,question_id", ignoreDuplicates: true },
        )
    : await supabase
        .from("question_bookmarks")
        .delete()
        .eq("centre_id", centre.centreId)
        .eq("student_id", student.id)
        .eq("question_id", parsed.data.questionId);
  return error ? FAILED : { ok: true };
}

/** Practise the student's unresolved bookmarks (optionally one sub-topic). */
export async function startBookmarkPractice(_prev: RevisionActionResult, formData: FormData): Promise<RevisionActionResult> {
  const { centre } = await requirePortal("student", REVISION_PATH);
  const parsed = z
    .object({ courseId: z.uuid(), sectionId: z.uuid().nullable() })
    .safeParse({ courseId: formData.get("courseId"), sectionId: formData.get("sectionId") || null });
  if (!parsed.success) return FAILED;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_bookmark_practice", {
    p_centre: centre.centreId,
    p_course: parsed.data.courseId,
    p_section: parsed.data.sectionId,
  });
  if (error) {
    if (error.code === "P0002") return { ok: false, error: "No bookmarked questions left to practise here." };
    if (error.code === "42501" && error.hint === "consent") {
      return { ok: false, error: `Practice needs your parent's consent on record. Please ask them to contact ${centre.centreName}.` };
    }
    return FAILED;
  }
  redirect(`${STUDENT_HOME_PATH}/practice/${z.uuid().parse(data)}`);
}

/** Add the student's own exam date (e.g. a school exam). */
export async function addMyExam(_prev: RevisionActionResult, formData: FormData): Promise<RevisionActionResult> {
  const { centre } = await requirePortal("student", REVISION_PATH);
  const parsed = examInput.safeParse({ courseId: formData.get("courseId"), name: formData.get("name"), examOn: formData.get("examOn") });
  if (!parsed.success) return { ok: false, error: "Give the exam a name, a subject and a date." };
  if (parsed.data.examOn < singaporeDate()) return { ok: false, error: "Choose a date from today onwards." };
  const student = await getMyStudent(centre.centreId);
  if (!student) return FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("exam_dates").insert({
    centre_id: centre.centreId,
    course_id: parsed.data.courseId,
    student_id: student.id,
    name: parsed.data.name,
    exam_on: parsed.data.examOn,
  });
  if (error) return FAILED;
  revalidatePath(REVISION_PATH, "layout");
  return { ok: true };
}

/** Remove one of the student's own exam dates. */
export async function removeMyExam(examId: unknown): Promise<RevisionActionResult> {
  const { centre } = await requirePortal("student", REVISION_PATH);
  const id = z.uuid().safeParse(examId);
  if (!id.success) return FAILED;
  const supabase = await createClient();
  const { error } = await supabase.from("exam_dates").delete().eq("centre_id", centre.centreId).eq("id", id.data);
  if (error) return FAILED;
  revalidatePath(REVISION_PATH, "layout");
  return { ok: true };
}

/** Switch Before-Exam Mode on for an exam (one per course), or off (examId null). */
export async function setExamMode(input: unknown): Promise<RevisionActionResult> {
  const { centre } = await requirePortal("student", REVISION_PATH);
  const parsed = examModeInput.safeParse(input);
  if (!parsed.success) return FAILED;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_exam_mode", {
    p_centre: centre.centreId,
    p_course: parsed.data.courseId,
    p_exam: parsed.data.examId,
  });
  if (error) return FAILED;
  revalidatePath(REVISION_PATH, "layout");
  return { ok: true };
}
