import { z } from "zod";

/**
 * Inline text with fractions (format 2): "3⟦2‖7⟧ kg" is stored as
 * ["3", { frac: [["2"], ["7"]] }, " kg"]. Fractions can nest.
 */
export type Inline = string | { readonly frac: readonly [readonly Inline[], readonly Inline[]] };
export const inlineSchema: z.ZodType<Inline> = z.lazy(() =>
  z.union([z.string().max(4000), z.object({ frac: z.tuple([z.array(inlineSchema).max(50), z.array(inlineSchema).max(50)]) })]),
);
export const richSchema = z.array(inlineSchema).max(200);
export type Rich = readonly Inline[];

const cellSchema = z.union([z.string(), richSchema]);

/** Canonical question content (what students may see). Plain text and fractions only, never HTML. */
export const blockSchema = z.union([
  z.object({ type: z.literal("paragraph"), text: z.string().max(4000) }),
  z.object({ type: z.literal("paragraph"), rich: richSchema, part: z.boolean().optional() }),
  z.object({ type: z.literal("table"), rows: z.array(z.array(cellSchema)).min(1).max(50) }),
  /** A figure in private storage; `src` is a short-lived signed URL added on the server. */
  z.object({ type: z.literal("image"), path: z.string(), width: z.number().min(1).max(2000), src: z.string().optional() }),
  /** Worked-solution lines whose equals signs line up: "Area = 6 × 9", "     = 54 cm²". */
  z.object({ type: z.literal("equation"), rows: z.array(z.object({ label: richSchema, value: richSchema })).min(1).max(50) }),
]);
export type Block = z.infer<typeof blockSchema>;

export const contentSchema = z.object({
  blocks: z.array(blockSchema).min(1),
  choices: z.array(cellSchema).min(2).max(6).nullable().optional(),
  parts: z.array(z.string()).min(1).max(8),
  /** Typing tip shown under the answer boxes. */
  hint: z.string().max(200).optional(),
  /** Can't be marked by matching: the student compares with the worked solution. */
  self_check: z.enum(["draw", "explain"]).optional(),
  /** The bank marks it as extra practice. */
  extra: z.boolean().optional(),
});
export type QuestionContent = z.infer<typeof contentSchema>;

export const DIFFICULTY_LABEL = { 1: "Easy", 2: "Medium", 3: "Challenging" } as const;
export type Difficulty = keyof typeof DIFFICULTY_LABEL;

export const topicRow = z.object({ id: z.uuid(), course_id: z.uuid(), title: z.string(), position: z.number().int() });
export const sectionRow = z.object({ id: z.uuid(), topic_id: z.uuid(), number: z.number().int(), title: z.string() });
export const questionRow = z.object({
  id: z.uuid(),
  external_ref: z.string(),
  section_id: z.uuid(),
  difficulty: z.number().int().min(1).max(3),
  strategy: z.string().nullable(),
  marks: z.number().int().nullable(),
});
export const versionRow = z.object({ question_id: z.uuid(), version: z.number().int(), content: contentSchema });

export interface PracticeSection {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly questionCount: number;
}
export interface PracticeTopic {
  readonly id: string;
  readonly title: string;
  readonly sections: readonly PracticeSection[];
}

export interface QuestionView {
  readonly id: string;
  /** The bank's question number, e.g. "1.4e" or "Q0001". */
  readonly ref: string;
  readonly sectionTitle: string;
  readonly difficulty: Difficulty;
  readonly strategy: string | null;
  readonly marks: number | null;
  readonly content: QuestionContent;
}
