import type { Rewards, XpReason } from "./schema";

/**
 * Levels, badges and labels for rewards. Owner decision (30 Oct 2026, ADR 0008):
 * 100 XP per level, eight named levels as in the Aspire Online mockup.
 */
export const XP_PER_LEVEL = 100;
export const LEVEL_NAMES = ["Beginner", "Explorer", "Achiever", "Scholar", "Champion", "Legend", "Master", "Elite"] as const;

export interface LevelInfo {
  readonly level: number;
  readonly name: string;
  /** XP earned within the current level. */
  readonly inLevel: number;
  /** XP needed for the next level, or null at the top level. */
  readonly toNext: number | null;
  readonly nextName: string | null;
  readonly percent: number;
}

export function levelFor(totalXp: number): LevelInfo {
  const total = Math.max(0, Math.floor(totalXp));
  const index = Math.min(Math.floor(total / XP_PER_LEVEL), LEVEL_NAMES.length - 1);
  const top = index === LEVEL_NAMES.length - 1;
  const inLevel = total - index * XP_PER_LEVEL;
  return {
    level: index + 1,
    name: LEVEL_NAMES[index] ?? "Beginner",
    inLevel,
    toNext: top ? null : XP_PER_LEVEL - inLevel,
    nextName: top ? null : (LEVEL_NAMES[index + 1] ?? null),
    percent: top ? 100 : Math.round((inLevel / XP_PER_LEVEL) * 100),
  };
}

export interface Badge {
  readonly id: string;
  readonly icon: string;
  readonly name: string;
  readonly how: string;
  readonly earned: boolean;
  /** Needs a feature that isn't built yet. */
  readonly comingSoon: boolean;
}

export function badgesFor(r: Pick<Rewards, "badges">): Badge[] {
  return [
    { id: "first_steps", icon: "1", name: "First Steps", how: "Finish your first practice", earned: r.badges.first_steps, comingSoon: false },
    { id: "week_warrior", icon: "7", name: "Week Warrior", how: "Keep a 7-day streak", earned: r.badges.week_warrior, comingSoon: false },
    { id: "sharp_shooter", icon: "A", name: "Sharp Shooter", how: "90% in a 10-question practice", earned: r.badges.sharp_shooter, comingSoon: false },
    { id: "comeback", icon: "R", name: "Comeback", how: "Turn a weak topic into a strong one", earned: r.badges.comeback, comingSoon: false },
    { id: "drop_in", icon: "5", name: "Drop In", how: "5 Daily Drops completed", earned: false, comingSoon: true },
    { id: "mock_ready", icon: "M", name: "Mock Ready", how: "Submit 3 mock exams", earned: false, comingSoon: true },
  ];
}

export function xpLabel(reason: XpReason, note: string | null): string {
  switch (reason) {
    case "practice_set":
      return note ?? "Practice completed";
    case "practice_accuracy":
      return "Accuracy bonus · 80% or more correct";
    case "lesson_part":
      return note ?? "Lesson part completed";
    case "streak_bonus":
      return "Streak bonus";
    case "adjustment":
      return note ?? "Adjusted by your centre";
  }
}

/** The last `n` Singapore days ending `today` (YYYY-MM-DD), oldest first, with whether each was active. */
export function streakDays(activeDays: readonly string[], today: string, n = 14): { date: string; active: boolean }[] {
  const active = new Set(activeDays);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const out: { date: string; active: boolean }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10);
    out.push({ date: day, active: active.has(day) });
  }
  return out;
}
