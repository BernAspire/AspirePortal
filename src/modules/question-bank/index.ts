// Public API of the question-bank module (server side). Other modules import only from here
// or, in client components, from ./ui (the renderer without server-only queries).
export { getCoursesWithQuestions, getPracticeTopics, getQuestionVersions } from "./queries";
export { QuestionBlocks, QuestionTable, WorkedSteps } from "./render/question-blocks";
export {
  blockSchema,
  DIFFICULTY_LABEL,
  type Block,
  type Difficulty,
  type PracticeSection,
  type PracticeTopic,
  type QuestionContent,
  type QuestionView,
} from "./schema";
