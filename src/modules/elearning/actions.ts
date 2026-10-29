"use server";

import { z } from "zod";

import { STUDENT_HOME_PATH } from "@/lib/auth/routing";
import { requirePortal } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getMyStudent } from "@/modules/crm";

import { saveProgressInput, type SaveProgressResult } from "./schema";
import { nextProgress } from "./service";

const partPages = z.object({ id: z.uuid(), pages: z.array(z.unknown()).nullable() });
const existingRow = z.object({ status: z.enum(["started", "completed"]), last_page: z.number().int().nullable() });

/**
 * Records how far the student got in a lesson part.
 *
 * authenticate (student portal) → validate → the part must be visible to the
 * student (RLS: published, entitled today) → write with the student's session,
 * where RLS also requires guardian consent on record. Progress is learning
 * activity, so it is not audit-logged (ADR 0004).
 */
export async function saveLessonProgress(input: unknown): Promise<SaveProgressResult> {
  const { centre } = await requirePortal("student", STUDENT_HOME_PATH);
  const parsed = saveProgressInput.safeParse(input);
  if (!parsed.success) return { saved: false, reason: "not_allowed" };
  const { partId, page } = parsed.data;

  const student = await getMyStudent(centre.centreId);
  if (!student) return { saved: false, reason: "not_allowed" };

  const supabase = await createClient();
  const { data: partData } = await supabase
    .from("lesson_parts")
    .select("id, pages")
    .eq("centre_id", centre.centreId)
    .eq("id", partId)
    .maybeSingle();
  const part = partPages.safeParse(partData);
  if (!part.success) return { saved: false, reason: "not_allowed" };
  const pageCount = part.data.pages?.length ?? 1;

  const { data: existingData, error: readError } = await supabase
    .from("lesson_progress")
    .select("status, last_page")
    .eq("centre_id", centre.centreId)
    .eq("student_id", student.id)
    .eq("lesson_part_id", partId)
    .maybeSingle();
  if (readError) return { saved: false, reason: "error" };
  const existing = existingData ? existingRow.parse(existingData) : null;

  // The server decides completion from the page reached, not the client's claim.
  const next = nextProgress(pageCount, page, existing ? { lastPage: existing.last_page, status: existing.status } : null);
  const values = {
    last_page: next.lastPage,
    status: next.completed ? ("completed" as const) : ("started" as const),
    completed_at: next.completed ? new Date().toISOString() : null,
  };

  if (existing) {
    if (existing.status === "completed" && existing.last_page === next.lastPage) return { saved: true };
    const update =
      existing.status === "completed"
        ? { last_page: values.last_page } // keep the original completion time
        : values;
    const { error } = await supabase
      .from("lesson_progress")
      .update(update)
      .eq("centre_id", centre.centreId)
      .eq("student_id", student.id)
      .eq("lesson_part_id", partId);
    return error ? failure(error.code) : { saved: true };
  }

  const { error } = await supabase.from("lesson_progress").insert({
    centre_id: centre.centreId,
    student_id: student.id,
    lesson_part_id: partId,
    ...values,
  });
  return error ? failure(error.code) : { saved: true };
}

function failure(code: string | undefined): SaveProgressResult {
  // The part was readable, so a policy refusal here means no consent on record.
  if (code === "42501") return { saved: false, reason: "consent" };
  return { saved: false, reason: "error" };
}
