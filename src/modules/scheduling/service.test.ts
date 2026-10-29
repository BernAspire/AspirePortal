import { describe, expect, it } from "vitest";

import type { BookedSession } from "./schema";
import {
  attendanceSummary,
  classScheduleLine,
  currentMonth,
  formatClock,
  joinState,
  monthBounds,
  monthGrid,
  sessionDay,
  sessionWhere,
  timeRange,
} from "./service";

function session(over: Partial<BookedSession> = {}): BookedSession {
  return {
    id: "s1",
    classId: "c1",
    courseId: "co1",
    kind: "physical_tutorial",
    branchId: "b1",
    roomId: "r1",
    teacherName: "Ms Lim",
    startsAt: "2026-10-31T01:00:00.000Z", // 9:00 am Singapore
    endsAt: "2026-10-31T03:00:00.000Z",
    cancelled: false,
    cancelReason: null,
    courseName: "Primary 5 Mathematics",
    branchName: "Bishan",
    roomName: "Room 1",
    attendance: null,
    ...over,
  };
}

describe("monthGrid", () => {
  it("starts weeks on Monday and pads to whole weeks", () => {
    const g = monthGrid("2026-10"); // 1 Oct 2026 is a Thursday
    expect(g.title).toBe("October 2026");
    expect(g.days.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(g.days).toHaveLength(35);
    expect(g.days.filter(Boolean)).toHaveLength(31);
    expect([g.prev, g.next]).toEqual(["2026-09", "2026-11"]);
  });

  it("wraps years and handles leap February", () => {
    expect(monthGrid("2027-01").prev).toBe("2026-12");
    expect(monthGrid("2026-12").next).toBe("2027-01");
    expect(monthGrid("2028-02").days.filter(Boolean)).toHaveLength(29);
  });
});

describe("Singapore time", () => {
  it("bounds a month at Singapore midnight", () => {
    expect(monthBounds("2026-10")).toEqual({
      from: "2026-09-30T16:00:00.000Z",
      to: "2026-10-31T16:00:00.000Z",
    });
  });

  it("uses the Singapore date, not UTC", () => {
    expect(currentMonth(new Date("2026-10-31T17:00:00Z"))).toBe("2026-11");
    expect(sessionDay(session({ startsAt: "2026-10-31T17:00:00Z" }))).toBe("2026-11-01");
  });

  it("formats clock times and ranges", () => {
    expect(formatClock("09:05")).toBe("9:05 am");
    expect(formatClock("12:00")).toBe("12:00 pm");
    expect(formatClock("00:30")).toBe("12:30 am");
    expect(timeRange("2026-10-31T01:00:00Z", "2026-10-31T03:00:00Z")).toBe("9:00 am – 11:00 am");
    expect(
      classScheduleLine({
        weekday: 6,
        startTime: "19:30",
        durationMinutes: 90,
      }),
    ).toBe("Saturdays · 7:30 pm – 9:00 pm");
  });
});

describe("sessionWhere", () => {
  it("says Online for live tutorials and names the place otherwise", () => {
    expect(sessionWhere(session())).toBe("Bishan, Room 1 · Ms Lim");
    expect(sessionWhere(session({ kind: "live_tutorial", branchName: null, roomName: null }))).toBe("Online · Ms Lim");
    expect(
      sessionWhere(
        session({
          kind: "academic_coaching",
          branchName: null,
          roomName: null,
        }),
      ),
    ).toBe("At the centre · Ms Lim");
  });
});

describe("joinState", () => {
  const s = session({ kind: "live_tutorial" });
  it("opens 15 minutes before the start and closes at the end", () => {
    expect(joinState(s, new Date("2026-10-31T00:44:00Z"))).toBe("upcoming");
    expect(joinState(s, new Date("2026-10-31T00:45:00Z"))).toBe("open");
    expect(joinState(s, new Date("2026-10-31T03:00:00Z"))).toBe("open");
    expect(joinState(s, new Date("2026-10-31T03:00:01Z"))).toBe("ended");
    expect(joinState({ ...s, cancelled: true }, new Date("2026-10-31T01:00:00Z"))).toBe("cancelled");
  });
});

describe("attendanceSummary", () => {
  const now = new Date("2026-11-30T00:00:00Z");
  it("counts past, not-cancelled sessions; excused ones don't lower the rate", () => {
    const sum = attendanceSummary(
      [
        session({ attendance: "present" }),
        session({ attendance: "late" }),
        session({ attendance: "absent" }),
        session({ attendance: "excused" }),
        session({ attendance: null }),
        session({ cancelled: true, attendance: null }),
        session({
          startsAt: "2026-12-05T01:00:00Z",
          endsAt: "2026-12-05T03:00:00Z",
        }),
      ],
      now,
    );
    expect(sum.counts).toEqual({ present: 1, late: 1, absent: 1, excused: 1 });
    expect([sum.marked, sum.unmarked, sum.ratePercent]).toEqual([4, 1, 67]);
  });

  it("has no rate before anything is marked", () => {
    expect(attendanceSummary([session()], now).ratePercent).toBeNull();
    expect(attendanceSummary([session({ attendance: "excused" })], now).ratePercent).toBeNull();
  });
});
