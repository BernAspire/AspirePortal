import type { DifficultyChoice, PracticeResult } from "./schema";

/** Practice rules with no framework imports. */

export const DIFFICULTY_LEVELS: Record<DifficultyChoice, readonly number[] | null> = {
  easy: [1],
  medium: [2],
  hard: [3],
  mixed: null,
};

/** Accuracy as a whole percentage, or null when nothing has been tried. */
export function accuracyPercent(tried: number, correct: number): number | null {
  return tried > 0 ? Math.round((correct / tried) * 100) : null;
}

export interface SessionScore {
  readonly answered: number;
  readonly correct: number;
  readonly total: number;
  readonly percent: number | null;
}

export function sessionScore(total: number, results: readonly PracticeResult[]): SessionScore {
  const correct = results.filter((r) => r.correct).length;
  return { answered: results.length, correct, total, percent: accuracyPercent(results.length, correct) };
}

/** Sections ordered weakest first (untried sections in the middle, as the database does). */
export function weakestFirst<T extends { readonly tried: number; readonly correct: number }>(sections: readonly T[]): T[] {
  const score = (s: T) => (s.tried > 0 ? s.correct / s.tried : 0.5);
  return [...sections].sort((a, b) => score(a) - score(b));
}
