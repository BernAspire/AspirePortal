import { z } from "zod";

import { blockSchema, richSchema } from "@/modules/question-bank/ui";

export const PRACTICE_COUNTS = [5, 10, 15] as const;
export const DIFFICULTY_CHOICES = ["easy", "medium", "hard", "mixed"] as const;
export type DifficultyChoice = (typeof DIFFICULTY_CHOICES)[number];

export const startPracticeInput = z.object({
  courseId: z.uuid(),
  mode: z.enum(["adaptive", "manual"]),
  sectionIds: z.array(z.uuid()).max(200),
  difficulty: z.enum(DIFFICULTY_CHOICES),
  count: z.coerce.number().pipe(z.union([z.literal(5), z.literal(10), z.literal(15)])),
});
export type StartPracticeInput = z.infer<typeof startPracticeInput>;

export type StartPracticeState = { readonly error?: string };

export const practiceResponse = z.union([
  z.object({ choice: z.number().int().min(1).max(6) }).strict(),
  z.object({ parts: z.array(z.string().max(200)).min(1).max(8) }).strict(),
  z.object({ self: z.boolean() }).strict(),
  z.object({ gave_up: z.literal(true) }).strict(),
]);
export type PracticeResponse = z.infer<typeof practiceResponse>;

export const submitAnswerInput = z.object({
  sessionId: z.uuid(),
  position: z.number().int().min(1).max(50),
  response: practiceResponse,
});

export const practiceResult = z
  .object({
    position: z.number().int(),
    correct: z.boolean(),
    gave_up: z.boolean(),
    response: z.unknown().nullable(),
    answer: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("choice"), correct: z.number().int() }),
      z.object({ kind: z.literal("text"), parts: z.array(z.object({ label: z.string(), text: z.string() })) }),
      z.object({ kind: z.literal("self") }),
    ]),
    display: z.union([z.string(), richSchema]).nullable().optional(),
    why_not: z.record(z.string(), z.string()).nullable().optional(),
    steps: z.array(blockSchema),
  })
  .transform((r) => ({
    position: r.position,
    correct: r.correct,
    gaveUp: r.gave_up,
    response: practiceResponse.safeParse(r.response).success ? (r.response as PracticeResponse) : null,
    answer: r.answer,
    display: r.display ?? null,
    whyNot: r.why_not ?? {},
    steps: r.steps,
  }));
export type PracticeResult = z.infer<typeof practiceResult>;

/** The worked solution of a self-checked question, shown before the student marks it. */
export const practiceSolution = z
  .object({ display: z.union([z.string(), richSchema]).nullable().optional(), steps: z.array(blockSchema) })
  .transform((r) => ({ display: r.display ?? null, steps: r.steps }));
export type PracticeSolution = z.infer<typeof practiceSolution>;
export const solutionInput = z.object({ sessionId: z.uuid(), position: z.number().int().min(1).max(50) });
export type SolutionResult = { readonly ok: true; readonly solution: PracticeSolution } | { readonly ok: false };

export type SubmitAnswerResult =
  | { readonly ok: true; readonly result: PracticeResult }
  | { readonly ok: false; readonly reason: "consent" | "not_allowed" | "invalid" | "unavailable" };

export const sessionRow = z
  .object({
    id: z.uuid(),
    course_id: z.uuid(),
    mode: z.enum(["adaptive", "manual"]),
    created_at: z.string(),
    finished_at: z.string().nullable(),
  })
  .transform((r) => ({ id: r.id, courseId: r.course_id, mode: r.mode, createdAt: r.created_at, finishedAt: r.finished_at }));
export type PracticeSessionInfo = z.infer<typeof sessionRow>;

export const itemRow = z
  .object({ position: z.number().int(), question_id: z.uuid(), question_version: z.number().int() })
  .transform((r) => ({ position: r.position, questionId: r.question_id, version: r.question_version }));
export type PracticeItem = z.infer<typeof itemRow>;
