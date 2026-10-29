// Public API of the e-learning module. Other modules import only from here.
export {
  getContinueLearning,
  getCourseLessons,
  getLesson,
  signDownloadUrl,
  signPageUrls,
  type ContinueLearning,
} from "./queries";
export { saveLessonProgress } from "./actions";
export {
  courseProgress,
  lessonStatus,
  nextProgress,
  partDescription,
  resumePage,
  summariseLessons,
  type LessonStatus,
  type LessonSummary,
} from "./service";
export type { Lesson, LessonPage, LessonPart, PartProgress, SaveProgressResult } from "./schema";
