import { describe, expect, it } from "vitest";

import { practiceResult, practiceResponse, startPracticeInput } from "./schema";
import { accuracyPercent, sessionScore, weakestFirst } from "./service";

describe("practice rules", () => {
  it("rounds accuracy and has none before trying", () => {
    expect(accuracyPercent(3, 2)).toBe(67);
    expect(accuracyPercent(0, 0)).toBeNull();
  });

  it("scores a session", () => {
    const r = (correct: boolean) =>
      practiceResult.parse({ position: 1, correct, gave_up: false, response: { choice: 1 }, answer: { kind: "choice", correct: 1 }, steps: [] });
    expect(sessionScore(5, [r(true), r(false), r(true)])).toEqual({ answered: 3, correct: 2, total: 5, percent: 67 });
  });

  it("orders sections weakest first, untried in the middle", () => {
    const s = [
      { id: "a", tried: 4, correct: 4 },
      { id: "b", tried: 0, correct: 0 },
      { id: "c", tried: 4, correct: 1 },
    ];
    expect(weakestFirst(s).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});

describe("practice input", () => {
  it("accepts the setup form and only 5, 10 or 15 questions", () => {
    const base = { courseId: "0f8fad5b-d9cb-469f-a165-70867728950e", mode: "adaptive", sectionIds: [], difficulty: "mixed" };
    expect(startPracticeInput.safeParse({ ...base, count: "10" }).success).toBe(true);
    expect(startPracticeInput.safeParse({ ...base, count: "12" }).success).toBe(false);
    expect(startPracticeInput.safeParse({ ...base, count: 5, difficulty: "insane" }).success).toBe(false);
  });

  it("accepts only the three answer shapes", () => {
    expect(practiceResponse.safeParse({ choice: 2 }).success).toBe(true);
    expect(practiceResponse.safeParse({ parts: ["6 372 041", "405"] }).success).toBe(true);
    expect(practiceResponse.safeParse({ gave_up: true }).success).toBe(true);
    expect(practiceResponse.safeParse({ choice: 2, correct: true }).success).toBe(false);
    expect(practiceResponse.safeParse({ parts: ["x".repeat(201)] }).success).toBe(false);
  });
});
