import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { myRevisionRow, revisionOfferRow, type MyRevision, type RevisionOffer } from "./schema";

/** Everything Smart Revision shows for the signed-in student (RLS and entitlement in the database), or null. */
export const getMyRevision = cache(async (centreId: string): Promise<MyRevision | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_revision", { p_centre: centreId });
  if (error) throw new Error("Could not load your revision.");
  return data === null ? null : myRevisionRow.parse(data);
});

/**
 * Offers the student may be shown: the database returns only current offers covering one of their
 * weak sub-topics, and nothing without the guardian's marketing consent (ADR 0010).
 */
export const getMyRevisionOffers = cache(async (centreId: string): Promise<RevisionOffer[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_revision_offers", { p_centre: centreId });
  if (error) return []; // a recommendation is never worth breaking the page for
  const parsed = z.array(revisionOfferRow).safeParse(data ?? []);
  return parsed.success ? parsed.data : [];
});

/** Unresolved bookmarked question ids and when they were bookmarked, newest first. */
export const getBookmarks = cache(
  async (centreId: string, studentId: string): Promise<{ questionId: string; createdAt: string; resolved: boolean }[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("question_bookmarks")
      .select("question_id, created_at, resolved_at")
      .eq("centre_id", centreId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load your bookmarks.");
    return z
      .array(z.object({ question_id: z.uuid(), created_at: z.string(), resolved_at: z.string().nullable() }))
      .parse(data)
      .map((r) => ({ questionId: r.question_id, createdAt: r.created_at, resolved: r.resolved_at !== null }));
  },
);
