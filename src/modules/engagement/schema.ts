import { z } from "zod";

export const XP_REASONS = ["practice_set", "practice_accuracy", "lesson_part", "streak_bonus", "adjustment"] as const;
export type XpReason = (typeof XP_REASONS)[number];

export const rewardsRow = z
  .object({
    total_xp: z.coerce.number().int(),
    recent: z.array(
      z.object({ reason: z.enum(XP_REASONS), amount: z.number().int(), note: z.string().nullable(), at: z.string() }),
    ),
    current_streak: z.coerce.number().int(),
    best_streak: z.coerce.number().int(),
    active_today: z.boolean(),
    recent_days: z.array(z.string()),
    badges: z.object({
      first_steps: z.boolean(),
      week_warrior: z.boolean(),
      sharp_shooter: z.boolean(),
      comeback: z.boolean(),
    }),
    practice_sets: z.coerce.number().int(),
  })
  .transform((r) => ({
    totalXp: r.total_xp,
    recent: r.recent,
    currentStreak: r.current_streak,
    bestStreak: r.best_streak,
    activeToday: r.active_today,
    activeDays: r.recent_days,
    badges: r.badges,
    practiceSets: r.practice_sets,
  }));
export type Rewards = z.infer<typeof rewardsRow>;
