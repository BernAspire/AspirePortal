import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import {
  questionRow,
  sectionRow,
  topicRow,
  versionRow,
  type Difficulty,
  type PracticeTopic,
  type QuestionView,
} from "./schema";

/*
 * Reads use the student's session: RLS returns only this centre's questions for courses
 * an active programme covers today (rule 12). Answer keys are never read here.
 */

/** Course ids (from the given ones) that have at least one question topic the student can see. */
export const getCoursesWithQuestions = cache(async (centreId: string, courseIds: readonly string[]): Promise<Set<string>> => {
  if (courseIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_topics")
    .select("course_id")
    .eq("centre_id", centreId)
    .in("course_id", [...courseIds]);
  if (error) throw new Error("Could not load practice topics.");
  return new Set(z.array(z.object({ course_id: z.uuid() })).parse(data).map((r) => r.course_id));
});

/** Topics and sections of a course, with how many active questions each section has. */
export const getPracticeTopics = cache(async (centreId: string, courseId: string): Promise<PracticeTopic[]> => {
  const supabase = await createClient();
  const { data: topicData, error: topicError } = await supabase
    .from("question_topics")
    .select("id, course_id, title, position")
    .eq("centre_id", centreId)
    .eq("course_id", courseId)
    .order("position")
    .order("title");
  if (topicError) throw new Error("Could not load practice topics.");
  const topics = z.array(topicRow).parse(topicData);
  if (topics.length === 0) return [];

  const [{ data: sectionData, error: sectionError }, { data: countData, error: countError }] = await Promise.all([
    supabase.from("question_sections").select("id, topic_id, number, title").eq("centre_id", centreId).in(
      "topic_id",
      topics.map((t) => t.id),
    ),
    supabase.rpc("practice_question_counts", { p_centre: centreId, p_course: courseId }),
  ]);
  if (sectionError || countError) throw new Error("Could not load practice topics.");
  const sections = z.array(sectionRow).parse(sectionData);
  const counts = new Map<string, number>();
  for (const c of z.array(z.object({ section_id: z.uuid(), questions: z.number() })).parse(countData)) {
    counts.set(c.section_id, (counts.get(c.section_id) ?? 0) + c.questions);
  }
  return topics.map((t) => ({
    id: t.id,
    title: t.title,
    sections: sections
      .filter((s) => s.topic_id === t.id && (counts.get(s.id) ?? 0) > 0)
      .sort((a, b) => a.number - b.number)
      .map((s) => ({ id: s.id, number: s.number, title: s.title, questionCount: counts.get(s.id) ?? 0 })),
  }));
});

/** The exact versions given in a practice session, with their section names. */
export async function getQuestionVersions(
  centreId: string,
  items: readonly { questionId: string; version: number }[],
): Promise<Map<string, QuestionView>> {
  if (items.length === 0) return new Map();
  const supabase = await createClient();
  const ids = [...new Set(items.map((i) => i.questionId))];
  const [{ data: qData, error: qError }, { data: vData, error: vError }] = await Promise.all([
    supabase.from("questions").select("id, section_id, difficulty, strategy, marks, source_ref").eq("centre_id", centreId).in("id", ids),
    supabase.from("question_versions").select("question_id, version, content").eq("centre_id", centreId).in("question_id", ids),
  ]);
  if (qError || vError) throw new Error("Could not load the questions.");
  const questions = new Map(z.array(questionRow).parse(qData).map((q) => [q.id, q]));
  const versions = z.array(versionRow).parse(vData);
  const sectionIds = [...new Set([...questions.values()].map((q) => q.section_id))];
  const { data: sData, error: sError } = await supabase.from("question_sections").select("id, topic_id, number, title").in("id", sectionIds);
  if (sError) throw new Error("Could not load the questions.");
  const sectionTitles = new Map(z.array(sectionRow).parse(sData).map((s) => [s.id, s.title]));

  const out = new Map<string, QuestionView>();
  for (const item of items) {
    const q = questions.get(item.questionId);
    const v = versions.find((x) => x.question_id === item.questionId && x.version === item.version);
    if (!q || !v) continue;
    out.set(`${item.questionId}:${item.version}`, {
      id: q.id,
      sectionTitle: sectionTitles.get(q.section_id) ?? "",
      difficulty: q.difficulty as Difficulty,
      strategy: q.strategy,
      marks: q.marks,
      source: q.source_ref,
      content: v.content,
    });
  }
  return out;
}
