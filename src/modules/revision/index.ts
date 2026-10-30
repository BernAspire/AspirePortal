// Public API of the revision module (spaced reviews, confidence, exams, bookmarks).
// Other modules import only from here.
export { addMyExam, removeMyExam, setBookmark, setConfidence, setExamMode, startBookmarkPractice } from "./actions";
export { getBookmarks, getMyRevision, getMyRevisionOffers } from "./queries";
export {
  accuracyOf,
  dayStreak,
  daysUntil,
  examPlan,
  matchOffers,
  nextExam,
  todaysTasks,
  upcomingReviews,
  weaknessOf,
  weakTopics,
  weekStats,
  type ExamPlan,
  type OfferMatch,
  type RevisionTask,
  type SortKey,
  type Weakness,
} from "./service";
export type { Exam, MyRevision, RevisionActionResult, RevisionOffer, RevisionSection } from "./schema";
