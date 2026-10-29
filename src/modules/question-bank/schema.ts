import { z } from "zod";

/** Canonical question content (what students may see). Plain text only, never HTML. */
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().max(4000) }),
  z.object({ type: z.literal("table"), rows: z.array(z.array(z.string())).min(1).max(50) }),
]);
export type Block = z.infer<typeof blockSchema>;

export const contentSchema = z.object({
  blocks: z.array(blockSchema).min(1),
  choices: z.array(z.string()).min(2).max(6).nullable().optional(),
  parts: z.array(z.string()).min(1).max(6),
});
export type QuestionContent = z.infer<typeof contentSchema>;

export const DIFFICULTY_LABEL = { 1: "Easy", 2: "Medium", 3: "Challenging" } as const;
export type Difficulty = keyof typeof DIFFICULTY_LABEL;

export const topicRow = z.object({ id: z.uuid(), course_id: z.uuid(), title: z.string(), position: z.number().int() });
export const sectionRow = z.object({ id: z.uuid(), topic_id: z.uuid(), number: z.number().int(), title: z.string() });
export const questionRow = z.object({
  id: z.uuid(),
  section_id: z.uuid(),
  difficulty: z.number().int().min(1).max(3),
  strategy: z.string().nullable(),
  marks: z.number().int().nullable(),
  source_ref: z.string().nullable(),
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
  readonly sectionTitle: string;
  readonly difficulty: Difficulty;
  readonly strategy: string | null;
  readonly marks: number | null;
  readonly source: string | null;
  readonly content: QuestionContent;
}
