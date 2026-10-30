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

export const QUESTION_IMAGES_BUCKET = "question-images";
const FIGURE_URL_TTL_S = 60 * 60;

function isFigure(v: unknown): v is { type: "image"; path: string } {
  return typeof v === "object" && v !== null && (v as { type?: unknown }).type === "image" && typeof (v as { path?: unknown }).path === "string";
}

function collectFigures(v: unknown, into: Set<string>): void {
  if (Array.isArray(v)) v.forEach((x) => collectFigures(x, into));
  else if (isFigure(v)) into.add(v.path);
  else if (typeof v === "object" && v !== null) Object.values(v).forEach((x) => collectFigures(x, into));
}

function addSources<T>(v: T, urls: ReadonlyMap<string, string>): T {
  if (Array.isArray(v)) return v.map((x: unknown) => addSources(x, urls)) as T;
  if (isFigure(v)) {
    const src = urls.get(v.path);
    return (src ? { ...v, src } : v) as T;
  }
  if (typeof v === "object" && v !== null) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, addSources(x, urls)])) as T;
  }
  return v;
}

/**
 * Adds a short-lived signed URL (`src`) to every figure in question content or worked steps.
 * Signed with the student's session, so storage RLS lets through only figures of courses
 * their programme covers today; others stay without `src` and show as unavailable.
 */
export async function withFigureUrls<T>(value: T): Promise<T> {
  const paths = new Set<string>();
  collectFigures(value, paths);
  if (paths.size === 0) return value;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(QUESTION_IMAGES_BUCKET).createSignedUrls([...paths], FIGURE_URL_TTL_S);
  const urls = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
  return addSources(value, urls);
}

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
    supabase.from("questions").select("id, external_ref, section_id, difficulty, strategy, marks").eq("centre_id", centreId).in("id", ids),
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
  const signed = await withFigureUrls(versions);
  for (const item of items) {
    const q = questions.get(item.questionId);
    const v = signed.find((x) => x.question_id === item.questionId && x.version === item.version);
    if (!q || !v) continue;
    out.set(`${item.questionId}:${item.version}`, {
      id: q.id,
      sectionTitle: sectionTitles.get(q.section_id) ?? "",
      difficulty: q.difficulty as Difficulty,
      strategy: q.strategy,
      marks: q.marks,
      ref: q.external_ref,
      content: v.content,
    });
  }
  return out;
}

export interface CurrentQuestion {
  readonly id: string;
  readonly ref: string;
  readonly courseId: string;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly content: QuestionView["content"];
}

/** The current version of each question the student can read (RLS: entitled, active). */
export async function listCurrentQuestions(centreId: string, questionIds: readonly string[]): Promise<CurrentQuestion[]> {
  if (questionIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("questions")
    .select("id, external_ref, course_id, section_id, current_version")
    .eq("centre_id", centreId)
    .in("id", [...questionIds]);
  if (error) throw new Error("Could not load the questions.");
  const rows = z
    .array(z.object({ id: z.uuid(), external_ref: z.string(), course_id: z.uuid(), section_id: z.uuid(), current_version: z.number().int() }))
    .parse(data);
  const views = await getQuestionVersions(
    centreId,
    rows.map((r) => ({ questionId: r.id, version: r.current_version })),
  );
  const order = new Map(questionIds.map((id, i) => [id, i]));
  return rows
    .flatMap((r) => {
      const v = views.get(`${r.id}:${r.current_version}`);
      return v ? [{ id: r.id, ref: r.external_ref, courseId: r.course_id, sectionId: r.section_id, sectionTitle: v.sectionTitle, content: v.content }] : [];
    })
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
