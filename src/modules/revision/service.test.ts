import { describe, expect, it } from "vitest";

import type { Exam, RevisionSection } from "./schema";
import { dayStreak, examPlan, todaysTasks, upcomingReviews, weaknessOf, weakTopics, weekStats } from "./service";

function s(over: Partial<RevisionSection>): RevisionSection {
  return {
    sectionId: "s",
    title: "Sub-topic",
    number: 1,
    topic: "Whole Numbers",
    courseId: "c1",
    tried: 0,
    correct: 0,
    lastAttemptedAt: null,
    confidence: null,
    intervalDays: null,
    dueOn: null,
    lastReviewedAt: null,
    bookmarksUnresolved: 0,
    bookmarksResolved: 0,
    ...over,
  };
}

describe("weakness", () => {
  it("needs 3 answers before judging accuracy", () => {
    expect(weaknessOf(s({ tried: 2, correct: 0 }))).toBeNull();
    expect(weaknessOf(s({ tried: 10, correct: 4 }))).toBe("critical");
    expect(weaknessOf(s({ tried: 10, correct: 6 }))).toBe("needs_work");
    expect(weaknessOf(s({ tried: 10, correct: 7 }))).toBeNull();
  });

  it("counts a low self-rating as weak", () => {
    expect(weaknessOf(s({ confidence: 2 }))).toBe("low_confidence");
    expect(weaknessOf(s({ confidence: 3 }))).toBeNull();
  });
});

describe("tasks and reviews", () => {
  const today = "2026-10-30";
  const list = [
    s({ sectionId: "a", dueOn: "2026-10-28", tried: 5, correct: 4 }),
    s({ sectionId: "b", dueOn: "2026-10-30", tried: 5, correct: 1 }),
    s({ sectionId: "c", tried: 10, correct: 2 }),
    s({ sectionId: "d", dueOn: "2026-11-02" }),
    s({ sectionId: "e", dueOn: "2026-10-31" }),
  ];

  it("puts overdue first, then due today, then weak new sub-topics", () => {
    expect(todaysTasks(list, today).map((t) => [t.section.sectionId, t.reason])).toEqual([
      ["a", "overdue"],
      ["b", "due_today"],
      ["c", "weak"],
    ]);
    expect(todaysTasks(list, today, 1)).toHaveLength(1);
  });

  it("lists upcoming reviews by date", () => {
    expect(upcomingReviews(list, today).map((x) => x.sectionId)).toEqual(["e", "d"]);
  });

  it("sorts weak topics by confidence, then accuracy", () => {
    const w = [s({ sectionId: "x", tried: 5, correct: 1 }), s({ sectionId: "y", confidence: 1 }), s({ sectionId: "z", tried: 5, correct: 3, confidence: 2 })];
    expect(weakTopics(w).map((x) => x.sectionId)).toEqual(["y", "z", "x"]);
    expect(weakTopics(w, "accuracy").map((x) => x.sectionId)).toEqual(["x", "z", "y"]);
  });
});

describe("streaks and week", () => {
  it("counts days in a row ending today or yesterday", () => {
    expect(dayStreak(["2026-10-30", "2026-10-29", "2026-10-27"], "2026-10-30")).toBe(2);
    expect(dayStreak(["2026-10-29", "2026-10-28"], "2026-10-30")).toBe(2);
    expect(dayStreak(["2026-10-27"], "2026-10-30")).toBe(0);
    expect(dayStreak(["2026-11-01", "2026-10-31"], "2026-11-01")).toBe(2);
  });

  it("counts revised and resolved sub-topics this week", () => {
    const sections = [s({ sectionId: "a", tried: 10, correct: 9 }), s({ sectionId: "b", tried: 10, correct: 3 })];
    const weekReviews = [
      { sectionId: "a", answered: 5, correct: 5, on: "2026-10-29" },
      { sectionId: "b", answered: 5, correct: 4, on: "2026-10-30" },
    ];
    expect(weekStats({ sections, weekReviews, reviewDays: ["2026-10-29", "2026-10-30"], today: "2026-10-30" })).toEqual({
      topicsRevised: 2,
      weakResolved: 1,
      streak: 2,
    });
  });
});

describe("exam plan", () => {
  const exam: Exam = { id: "e", courseId: "c1", name: "SA2", examOn: "2026-11-08", own: false, active: true };
  it("spreads weak sub-topics over the days left", () => {
    const sections = Array.from({ length: 10 }, (_, i) => s({ sectionId: `w${i}`, tried: 5, correct: i % 3 }));
    const plan = examPlan({ sections, exams: [exam], weekReviews: [{ sectionId: "w0", answered: 5, correct: 1, on: "2026-10-30" }], today: "2026-10-30" }, exam);
    expect(plan.daysLeft).toBe(9);
    expect(plan.dailyTarget).toBe(2);
    expect(plan.revisedToday).toBe(1);
    expect(plan.priorities[0]?.accuracy).toBe(0);
  });

  it("asks for at least one sub-topic a day and at most five", () => {
    const one = examPlan({ sections: [], exams: [exam], weekReviews: [], today: "2026-10-30" }, exam);
    expect(one.dailyTarget).toBe(1);
    const many = Array.from({ length: 50 }, (_, i) => s({ sectionId: `m${i}`, tried: 5, correct: 0 }));
    expect(examPlan({ sections: many, exams: [exam], weekReviews: [], today: "2026-11-07" }, exam).dailyTarget).toBe(5);
  });
});
