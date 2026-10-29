import "server-only";

import { cache } from "react";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { displayName } from "./service";

const studentRow = z.object({
  id: z.uuid(),
  full_name: z.string(),
  preferred_name: z.string().nullable(),
  level_id: z.uuid().nullable(),
});

export interface MyStudent {
  readonly id: string;
  readonly displayName: string;
  readonly levelId: string | null;
}

/**
 * The student record linked to the signed-in user in this centre, or null.
 * Returns only what the student portal shows; RLS limits the row to the
 * student themself.
 */
export const getMyStudent = cache(async (centreId: string): Promise<MyStudent | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("students")
    .select("id, full_name, preferred_name, level_id")
    .eq("centre_id", centreId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .limit(2);
  if (error) throw new Error("Could not load your student record.");

  const rows = z.array(studentRow).parse(data);
  // A login is linked to at most one student per centre. If data is ever
  // inconsistent, show nothing rather than guess.
  if (rows.length !== 1) return null;
  const row = rows[0];
  return {
    id: row.id,
    displayName: displayName(row.full_name, row.preferred_name),
    levelId: row.level_id,
  };
});
