import { describe, expect, it } from "vitest";

import { badgesFor, levelFor, streakDays, xpLabel } from "./service";

describe("levels", () => {
  it("is 100 XP per level", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, name: "Beginner", inLevel: 0, toNext: 100, nextName: "Explorer", percent: 0 });
    expect(levelFor(196)).toMatchObject({ level: 2, name: "Explorer", inLevel: 96, toNext: 4, nextName: "Achiever", percent: 96 });
    expect(levelFor(200)).toMatchObject({ level: 3, name: "Achiever", inLevel: 0 });
  });

  it("stops at Elite", () => {
    expect(levelFor(700)).toMatchObject({ level: 8, name: "Elite", toNext: null, nextName: null, percent: 100 });
    expect(levelFor(5000)).toMatchObject({ level: 8, inLevel: 4300 });
  });

  it("never goes below level 1", () => {
    expect(levelFor(-5).level).toBe(1);
  });
});

describe("badges and labels", () => {
  it("lists earned and coming-soon badges", () => {
    const b = badgesFor({ badges: { first_steps: true, week_warrior: false, sharp_shooter: false, comeback: false } });
    expect(b.filter((x) => x.earned).map((x) => x.name)).toEqual(["First Steps"]);
    expect(b.filter((x) => x.comingSoon).map((x) => x.name)).toEqual(["Drop In", "Mock Ready"]);
  });

  it("labels XP entries", () => {
    expect(xpLabel("streak_bonus", "Streak bonus")).toBe("Streak bonus");
    expect(xpLabel("practice_set", "Practice completed · 8/10 correct")).toBe("Practice completed · 8/10 correct");
  });
});

describe("streak days", () => {
  it("covers the last 14 Singapore days across a month end", () => {
    const days = streakDays(["2026-10-30", "2026-10-29", "2026-10-17"], "2026-10-30");
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ date: "2026-10-17", active: true });
    expect(days.at(-1)).toEqual({ date: "2026-10-30", active: true });
    expect(streakDays([], "2026-11-02", 3).map((d) => d.date)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
