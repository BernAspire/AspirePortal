"use server";

import { redirect } from "next/navigation";

import { STUDENT_HOME_PATH } from "@/lib/auth/routing";
import { requirePortal } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { practiceResult, startPracticeInput, submitAnswerInput, type StartPracticeState, type SubmitAnswerResult } from "./schema";
import { DIFFICULTY_LEVELS } from "./service";

const PRACTICE_PATH = `${STUDENT_HOME_PATH}/practice`;

/**
 * Starts a practice session.
 *
 * authenticate (student portal) → validate → the database function checks that the
 * caller is this centre's student, entitled to the course today and has consent on
 * record, picks the questions and creates the session in one transaction. Practice is
 * learning activity, so it is not audit-logged (ADR 0004/0007).
 */
export async function startPractice(_prev: StartPracticeState, formData: FormData): Promise<StartPracticeState> {
  const { centre } = await requirePortal("student", PRACTICE_PATH);
  const parsed = startPracticeInput.safeParse({
    courseId: formData.get("courseId"),
    mode: formData.get("mode"),
    sectionIds: formData.getAll("sectionId"),
    difficulty: formData.get("difficulty"),
    count: formData.get("count"),
  });
  if (!parsed.success) return { error: "Please choose your practice settings again." };
  const { courseId, mode, sectionIds, difficulty, count } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_practice", {
    p_centre: centre.centreId,
    p_course: courseId,
    p_mode: mode,
    p_sections: mode === "manual" && sectionIds.length > 0 ? sectionIds : null,
    p_difficulties: DIFFICULTY_LEVELS[difficulty],
    p_count: count,
  });
  if (error) {
    if (error.code === "P0002") return { error: "No questions match these choices. Try more topics or Mixed difficulty." };
    if (error.code === "42501" && error.hint === "consent") {
      return { error: `Practice needs your parent's consent on record. Please ask them to contact ${centre.centreName}.` };
    }
    if (error.code === "42501") return { error: "This course isn't part of an active programme right now." };
    return { error: "Practice is unavailable right now. Please try again in a moment." };
  }
  const id = typeof data === "string" ? data : null;
  if (!id) return { error: "Practice is unavailable right now. Please try again in a moment." };
  redirect(`${PRACTICE_PATH}/${id}`);
}

/**
 * Marks one answer. The database marks it (students never receive answer keys before
 * answering), records the attempt with the question version, and returns the answer
 * and worked steps.
 */
export async function submitPracticeAnswer(input: unknown): Promise<SubmitAnswerResult> {
  await requirePortal("student", PRACTICE_PATH);
  const parsed = submitAnswerInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_practice_answer", {
    p_session: parsed.data.sessionId,
    p_position: parsed.data.position,
    p_response: parsed.data.response,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, reason: error.hint === "consent" ? "consent" : "not_allowed" };
    if (error.code === "22023") return { ok: false, reason: "invalid" };
    return { ok: false, reason: "unavailable" };
  }
  const result = practiceResult.safeParse(data);
  return result.success ? { ok: true, result: result.data } : { ok: false, reason: "unavailable" };
}
