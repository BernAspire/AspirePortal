// Public API of the engagement module (XP, levels, streaks, badges).
// Other modules import only from here.
export { getMyRewards } from "./queries";
export { badgesFor, LEVEL_NAMES, levelFor, streakDays, XP_PER_LEVEL, xpLabel, type Badge, type LevelInfo } from "./service";
export type { Rewards, XpReason } from "./schema";
