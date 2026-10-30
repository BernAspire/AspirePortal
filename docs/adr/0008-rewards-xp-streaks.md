# 0008 · Rewards: XP, levels, streaks and badges

Date: 30 Oct 2026 · Status: accepted pending owner approval of the migration (PR)

## Context

The Aspire Online mockup shows XP, levels, a daily streak, badges and (opt-in) leagues on a Rewards page and in the sidebar. CLAUDE.md requires `xp_ledger` to be append-only with levels and totals derived, and leagues to be opt-in with nicknames only.

## Decisions (owner, 30 Oct 2026: "mockup amounts", "100 XP every level")

1. **XP rules:** finished practice set +1 / +2 / +3 XP for 5 / 10 / 15 questions (sets under 5 earn none), +1 if 80%+ correct; finished lesson part +1 (once per part, ever); first activity of a Singapore day (a practice answer or a finished lesson part) +1 streak bonus.
2. **Ledger:** `xp_ledger` (migration `20261030000900_rewards.sql`) is append-only (update/delete rejected by trigger), written only by security-definer triggers on `practice_sessions` (when a set finishes), `practice_attempts` and `lesson_progress`. Partial unique indexes make every award idempotent (one per source; one streak bonus per student per day). Students and guardians read their own rows; staff read their centre's; nobody writes through the API. `adjustment` is reserved for staff corrections later. Existing practice and lesson completions were backfilled once with the same rules.
3. **Derived, not stored:** `public.my_rewards()` returns total XP, the 10 latest entries, current and best streak (runs of consecutive streak-bonus days; the current streak survives until the end of the day after the last active day), active days of the last 4 weeks, and badges: First Steps (a finished practice), Week Warrior (7-day streak), Sharp Shooter (90%+ in a 10+ question set), Comeback (a section's first 5 answers under 50% and latest 5 at 80%+). Levels are computed in `modules/engagement`: 100 XP per level, eight named levels (Beginner → Elite), capped at Elite.
4. **Not yet:** Drop In and Mock Ready badges show "Coming soon" until Daily Drop and Mock Exams exist. Leagues show as off: they need a guardian's `leagues` consent and nicknames, which arrive with the parent portal.
5. **Progress page** combines existing data per course: lesson completion, practice accuracy by section (weakest first), attendance rate and level.

## Consequences

- Changing XP amounts later affects new awards only; past ledger rows stay as they were.
- The retention job must treat `xp_ledger` like other ledgers (aggregate before purge if ever needed).
