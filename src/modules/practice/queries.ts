import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { withFigureUrls } from "@/modules/question-bank";

import { itemRow, practiceResult, sessionRow, type PracticeItem, type PracticeResult, type PracticeSessionInfo } from "./schema";

/** A practice session with its items and the results of answered items (RLS: own sessions only). */
export const getPracticeSession = cache(
  async (
    centreId: string,
    sessionId: string,
  ): Promise<{ session: PracticeSessionInfo; items: PracticeItem[]; results: Map<number, PracticeResult> } | null> => {
    if (!z.uuid().safeParse(sessionId).success) return null;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practice_sessions")
      .select("id, course_id, mode, created_at, finished_at")
      .eq("centre_id", centreId)
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error("Could not load this practice.");
    if (!data) return null;
    const session = sessionRow.parse(data);

    const [{ data: itemData, error: itemError }, { data: resultData, error: resultError }] = await Promise.all([
      supabase
        .from("practice_items")
        .select("position, question_id, question_version")
        .eq("centre_id", centreId)
        .eq("session_id", sessionId)
        .order("position"),
      supabase.rpc("practice_results", { p_session: sessionId }),
    ]);
    if (itemError || resultError) throw new Error("Could not load this practice.");
    const results = await withFigureUrls(z.array(practiceResult).parse(resultData));
    return { session, items: z.array(itemRow).parse(itemData), results: new Map(results.map((r) => [r.position, r])) };
  },
);

/** The student's accuracy per section in a course. */
export const getSectionStats = cache(
  async (centreId: string, courseId: string): Promise<Map<string, { tried: number; correct: number }>> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("practice_section_stats", { p_centre: centreId, p_course: courseId });
    if (error) throw new Error("Could not load your practice history.");
    const rows = z.array(z.object({ section_id: z.uuid(), tried: z.number(), correct: z.number() })).parse(data);
    return new Map(rows.map((r) => [r.section_id, { tried: r.tried, correct: r.correct }]));
  },
);

export interface RecentPractice extends PracticeSessionInfo {
  readonly total: number;
  readonly answered: number;
  readonly correct: number;
}

/** The student's latest practice sessions in a course, newest first. */
export const getRecentPractice = cache(
  async (centreId: string, studentId: string, courseId: string, limit = 5): Promise<RecentPractice[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practice_sessions")
      .select("id, course_id, mode, created_at, finished_at")
      .eq("centre_id", centreId)
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error("Could not load your practice history.");
    const sessions = z.array(sessionRow).parse(data);
    if (sessions.length === 0) return [];
    const ids = sessions.map((s) => s.id);
    const [{ data: items, error: e1 }, { data: attempts, error: e2 }] = await Promise.all([
      supabase.from("practice_items").select("session_id").eq("centre_id", centreId).in("session_id", ids),
      supabase.from("practice_attempts").select("session_id, correct").eq("centre_id", centreId).in("session_id", ids),
    ]);
    if (e1 || e2) throw new Error("Could not load your practice history.");
    const itemRows = z.array(z.object({ session_id: z.uuid() })).parse(items);
    const attemptRows = z.array(z.object({ session_id: z.uuid(), correct: z.boolean() })).parse(attempts);
    return sessions.map((s) => ({
      ...s,
      total: itemRows.filter((i) => i.session_id === s.id).length,
      answered: attemptRows.filter((a) => a.session_id === s.id).length,
      correct: attemptRows.filter((a) => a.session_id === s.id && a.correct).length,
    }));
  },
);
