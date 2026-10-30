import type { Exam, MyRevision, RevisionOffer, RevisionSection, WeekReview } from "./schema";

/**
 * Smart Revision rules (ADR 0009). Sub-topics are question sections. A sub-topic is weak
 * when the student's latest answers (up to 20, at least 3) are under 70% right, or when
 * they rate their own confidence 1–2 stars.
 */
export const WEAK_BELOW = 70;
export const CRITICAL_BELOW = 50;
export const DAILY_TASKS = 3;

export type Weakness = "critical" | "needs_work" | "low_confidence" | null;

export function accuracyOf(s: Pick<RevisionSection, "tried" | "correct">): number | null {
  return s.tried > 0 ? Math.round((s.correct / s.tried) * 100) : null;
}

export function weaknessOf(s: Pick<RevisionSection, "tried" | "correct" | "confidence">): Weakness {
  const acc = accuracyOf(s);
  if (s.tried >= 3 && acc !== null && acc < CRITICAL_BELOW) return "critical";
  if (s.tried >= 3 && acc !== null && acc < WEAK_BELOW) return "needs_work";
  if (s.confidence !== null && s.confidence <= 2) return "low_confidence";
  return null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type TaskReason = "overdue" | "due_today" | "weak";
export interface RevisionTask {
  readonly section: RevisionSection;
  readonly reason: TaskReason;
  readonly accuracy: number | null;
}

/** Today's tasks: overdue reviews first, then today's, then weak sub-topics never scheduled. */
export function todaysTasks(sections: readonly RevisionSection[], today: string, limit = DAILY_TASKS): RevisionTask[] {
  const due = sections
    .filter((s) => s.dueOn !== null && s.dueOn <= today)
    .sort((a, b) => (a.dueOn as string).localeCompare(b.dueOn as string) || (accuracyOf(a) ?? 0) - (accuracyOf(b) ?? 0))
    .map((s) => ({ section: s, reason: (s.dueOn as string) < today ? ("overdue" as const) : ("due_today" as const), accuracy: accuracyOf(s) }));
  const weakNew = sections
    .filter((s) => s.dueOn === null && weaknessOf(s) !== null)
    .sort((a, b) => (accuracyOf(a) ?? 100) - (accuracyOf(b) ?? 100))
    .map((s) => ({ section: s, reason: "weak" as const, accuracy: accuracyOf(s) }));
  return [...due, ...weakNew].slice(0, limit);
}

export function upcomingReviews(sections: readonly RevisionSection[], today: string, limit = 5): RevisionSection[] {
  return sections
    .filter((s) => s.dueOn !== null && s.dueOn > today)
    .sort((a, b) => (a.dueOn as string).localeCompare(b.dueOn as string))
    .slice(0, limit);
}

export type SortKey = "confidence" | "accuracy" | "recent";

/** Weak sub-topics, sorted: lowest confidence (unrated last), lowest accuracy, or most recently practised. */
export function weakTopics(sections: readonly RevisionSection[], sort: SortKey = "confidence"): RevisionSection[] {
  const weak = sections.filter((s) => weaknessOf(s) !== null);
  const acc = (s: RevisionSection) => accuracyOf(s) ?? 101;
  return [...weak].sort((a, b) => {
    if (sort === "recent") return (b.lastAttemptedAt ?? "").localeCompare(a.lastAttemptedAt ?? "");
    if (sort === "accuracy") return acc(a) - acc(b);
    return (a.confidence ?? 6) - (b.confidence ?? 6) || acc(a) - acc(b);
  });
}

export interface WeekStats {
  readonly topicsRevised: number;
  readonly weakResolved: number;
  readonly streak: number;
}

export function weekStats(r: Pick<MyRevision, "sections" | "weekReviews" | "reviewDays" | "today">): WeekStats {
  const bySection = new Map(r.sections.map((s) => [s.sectionId, s]));
  const revised = new Set(r.weekReviews.map((w) => w.sectionId));
  const resolved = new Set(
    r.weekReviews
      .filter((w: WeekReview) => w.correct * 5 >= w.answered * 4)
      .map((w) => w.sectionId)
      .filter((id) => {
        const s = bySection.get(id);
        return s !== undefined && weaknessOf(s) === null;
      }),
  );
  return { topicsRevised: revised.size, weakResolved: resolved.size, streak: dayStreak(r.reviewDays, r.today) };
}

/** Consecutive days with at least one review, ending today (or yesterday, if today isn't done yet). */
export function dayStreak(days: readonly string[], today: string): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

export function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);
}

export interface ExamPlan {
  readonly exam: Exam;
  readonly daysLeft: number;
  readonly dailyTarget: number;
  readonly revisedToday: number;
  /** Weakest first. */
  readonly priorities: readonly { section: RevisionSection; weakness: Weakness; accuracy: number | null }[];
}

/** Before-Exam Mode plan for the active exam: enough sub-topics a day to cover the weak ones in time. */
export function examPlan(r: Pick<MyRevision, "sections" | "exams" | "weekReviews" | "today">, exam: Exam): ExamPlan {
  const daysLeft = Math.max(0, daysBetween(r.today, exam.examOn));
  const course = r.sections.filter((s) => s.courseId === exam.courseId);
  const priorities = course
    .map((s) => ({ section: s, weakness: weaknessOf(s), accuracy: accuracyOf(s) }))
    .filter((p) => p.weakness !== null)
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));
  const dailyTarget = Math.min(5, Math.max(1, Math.ceil(priorities.length / Math.max(1, daysLeft))));
  const ids = new Set(course.map((s) => s.sectionId));
  const revisedToday = new Set(r.weekReviews.filter((w) => w.on === r.today && ids.has(w.sectionId)).map((w) => w.sectionId)).size;
  return { exam, daysLeft, dailyTarget, revisedToday, priorities };
}

export function nextExam(exams: readonly Exam[]): Exam | null {
  return exams.find((e) => e.active) ?? exams[0] ?? null;
}

export function daysUntil(today: string, day: string): number {
  return daysBetween(today, day);
}

export interface OfferMatch {
  readonly offer: RevisionOffer;
  /** The student's weak sub-topics this offer covers, weakest first. */
  readonly sections: readonly RevisionSection[];
}

/** Offers covering at least one weak sub-topic, best match first (most weak sub-topics, then weakest). */
export function matchOffers(offers: readonly RevisionOffer[], sections: readonly RevisionSection[], limit = 2): OfferMatch[] {
  const weak = weakTopics(sections, "accuracy");
  return offers
    .map((offer) => ({ offer, sections: weak.filter((s) => offer.sectionIds.includes(s.sectionId)) }))
    .filter((m) => m.sections.length > 0)
    .sort((a, b) => b.sections.length - a.sections.length || weak.indexOf(a.sections[0]) - weak.indexOf(b.sections[0]))
    .slice(0, limit);
}
